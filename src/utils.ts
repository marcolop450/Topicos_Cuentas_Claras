export type Group = {
  id: string;
  name: string;
  created_at: string;
};

export type Participant = {
  id: string;
  group_id: string;
  user_id?: string;
  name: string;
};

export type SplitMode = 'EQUAL' | 'PERCENTAGE' | 'CUSTOM' | 'PERSONAL';

export type Expense = {
  id: string;
  group_id: string;
  description: string;   // Título del gasto
  notes?: string;        // Descripción o notas detalladas opcionales
  amount: number;        // Monto en la moneda original
  currency: string;      // Código ISO 4217 (ej: 'BOB', 'USD', 'EUR')
  amount_usd: number;    // Monto convertido a USD (snapshot al guardar)
  payer_id: string;
  split_mode?: SplitMode;
  created_at?: string;
};

export type ExpenseSplit = {
  id: string;
  expense_id: string;
  participant_id: string;
  share_value?: number | null; // % o monto asignado según split_mode
};

export type SettlementType = 'PAYMENT' | 'FORGIVEN';
export type SettlementStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

export type Settlement = {
  id: string;
  group_id: string;
  from_id: string; // Quien debía (pagador)
  to_id: string;   // Quien cobra / perdona (receptor)
  amount: number;
  currency: string;
  amount_usd: number;
  settlement_type: SettlementType;
  status: SettlementStatus;
  notes?: string;
  created_at: string;
};

export type Balance = {
  participantId: string;
  name: string;
  balance: number; // en USD: positive = le deben, negative = debe
};

export type Transfer = {
  from: string; // name
  to: string;   // name
  from_id: string; // id del deudor
  to_id: string;   // id del acreedor
  amount: number; // en USD
};

/**
 * Hash determinista para desempate pseudoaleatorio consistente.
 */
function getHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Distribuye los centavos de residuo de forma justa:
 * 1. Solo participan los involucrados en este gasto.
 * 2. Si tienen deudas distintas, se le da al que más debe (balance más negativo).
 * 3. Si están empatados, se desempata con sorteo determinista (hash de gasto + participante).
 */
function distributeRemainderCents(
  involvedSplits: ExpenseSplit[],
  balancesMapCents: Record<string, number>,
  remainderCents: number,
  expenseId: string
): Set<string> {
  if (remainderCents <= 0 || involvedSplits.length === 0) return new Set();

  const sorted = [...involvedSplits].sort((a, b) => {
    const balA = balancesMapCents[a.participant_id] ?? 0;
    const balB = balancesMapCents[b.participant_id] ?? 0;
    if (balA !== balB) {
      return balA - balB; // Menor balance (más deuda) primero
    }
    // Desempate pseudoaleatorio determinista
    return getHash(`${expenseId}_${a.participant_id}`) - getHash(`${expenseId}_${b.participant_id}`);
  });

  const chosen = new Set<string>();
  for (let i = 0; i < remainderCents && i < sorted.length; i++) {
    chosen.add(sorted[i].participant_id);
  }
  return chosen;
}

/**
 * Calcula el balance de cada participante en USD.
 *
 * Usa expense.amount_usd para todos los cálculos en centavos enteros,
 * garantizando que la suma de todos los balances sea exactamente 0.00.
 */
export function calculateBalances(
  participants: Participant[],
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[] = []
): Balance[] {
  // Balances en centavos enteros de USD
  const balancesMapCents: Record<string, number> = {};
  participants.forEach(p => {
    balancesMapCents[p.id] = 0;
  });

  // Si no hay gastos en la sala, los balances son estrictamente 0.00 para todos.
  // Liquidaciones de gastos que fueron eliminados no deben generar deudas artificiales.
  if (expenses.length === 0) {
    return participants.map(p => ({
      participantId: p.id,
      name: p.name,
      balance: 0,
    }));
  }

  expenses.forEach(expense => {
    const usdAmount = expense.amount_usd > 0 ? expense.amount_usd : expense.amount;
    const totalCents = Math.round(usdAmount * 100);
    const mode = expense.split_mode || 'EQUAL';

    // El pagador recibe crédito por el monto total en USD
    if (balancesMapCents[expense.payer_id] !== undefined) {
      balancesMapCents[expense.payer_id] += totalCents;
    }

    // 1. GASTO PERSONAL (por su cuenta)
    if (mode === 'PERSONAL') {
      // El pagador asume el 100% del gasto; impacto neto en deudas = 0
      if (balancesMapCents[expense.payer_id] !== undefined) {
        balancesMapCents[expense.payer_id] -= totalCents;
      }
      return;
    }

    const involvedSplits = splits.filter(s => s.expense_id === expense.id);
    const involvedCount = involvedSplits.length;

    if (involvedCount === 0) {
      // Si por alguna razón no hay splits, se le asigna al pagador
      if (balancesMapCents[expense.payer_id] !== undefined) {
        balancesMapCents[expense.payer_id] -= totalCents;
      }
      return;
    }

    // 2. DIVISIÓN POR PORCENTAJE (%)
    if (mode === 'PERCENTAGE') {
      const baseShares: { split: ExpenseSplit; cents: number }[] = [];
      let totalAllocatedCents = 0;

      involvedSplits.forEach(split => {
        const pct = split.share_value != null ? Number(split.share_value) : (100 / involvedCount);
        const cents = Math.floor((totalCents * pct) / 100);
        baseShares.push({ split, cents });
        totalAllocatedCents += cents;
      });

      const remainderCents = totalCents - totalAllocatedCents;
      const extraCentWinners = distributeRemainderCents(involvedSplits, balancesMapCents, remainderCents, expense.id);

      baseShares.forEach(({ split, cents }) => {
        if (balancesMapCents[split.participant_id] !== undefined) {
          const finalCents = cents + (extraCentWinners.has(split.participant_id) ? 1 : 0);
          balancesMapCents[split.participant_id] -= finalCents;
        }
      });
      return;
    }

    // 3. DIVISIÓN POR MONTO PERSONALIZADO (CUSTOM)
    if (mode === 'CUSTOM') {
      const totalCustom = involvedSplits.reduce((acc, s) => acc + (Number(s.share_value) || 0), 0);
      const baseShares: { split: ExpenseSplit; cents: number }[] = [];
      let totalAllocatedCents = 0;

      involvedSplits.forEach(split => {
        const val = Number(split.share_value) || 0;
        const ratio = totalCustom > 0 ? val / totalCustom : 1 / involvedCount;
        const cents = Math.floor(totalCents * ratio);
        baseShares.push({ split, cents });
        totalAllocatedCents += cents;
      });

      const remainderCents = totalCents - totalAllocatedCents;
      const extraCentWinners = distributeRemainderCents(involvedSplits, balancesMapCents, remainderCents, expense.id);

      baseShares.forEach(({ split, cents }) => {
        if (balancesMapCents[split.participant_id] !== undefined) {
          const finalCents = cents + (extraCentWinners.has(split.participant_id) ? 1 : 0);
          balancesMapCents[split.participant_id] -= finalCents;
        }
      });
      return;
    }

    // 4. DIVISIÓN EN PARTES IGUALES (EQUAL - Default)
    const splitCents = Math.floor(totalCents / involvedCount);
    const remainderCents = totalCents - (splitCents * involvedCount);
    const extraCentWinners = distributeRemainderCents(involvedSplits, balancesMapCents, remainderCents, expense.id);

    involvedSplits.forEach(split => {
      if (balancesMapCents[split.participant_id] !== undefined) {
        const finalCents = splitCents + (extraCentWinners.has(split.participant_id) ? 1 : 0);
        balancesMapCents[split.participant_id] -= finalCents;
      }
    });
  });

  // Aplicar pagos y condonaciones confirmadas (Muerte a la Deuda)
  settlements.forEach(settlement => {
    if (settlement.status === 'CONFIRMED') {
      const usdAmount = settlement.amount_usd > 0 ? settlement.amount_usd : settlement.amount;
      const cents = Math.round(usdAmount * 100);

      // El deudor que pagó o fue perdonado reduce su deuda (+ cents)
      if (balancesMapCents[settlement.from_id] !== undefined) {
        balancesMapCents[settlement.from_id] += cents;
      }
      // El acreedor que cobró o perdonó reduce su saldo a favor (- cents)
      if (balancesMapCents[settlement.to_id] !== undefined) {
        balancesMapCents[settlement.to_id] -= cents;
      }
    }
  });

  return participants.map(p => ({
    participantId: p.id,
    name: p.name,
    balance: (balancesMapCents[p.id] ?? 0) / 100,
  }));
}

/**
 * Calcula el número mínimo de transferencias (en USD) para que todos queden a mano.
 */
export function calculateSettlement(balances: Balance[]): Transfer[] {
  const debtors = balances
    .filter(b => b.balance < -0.001)
    .map(b => ({ ...b, balance: Math.abs(b.balance) }));
  const creditors = balances
    .filter(b => b.balance > 0.001)
    .map(b => ({ ...b }));

  // Ordenar de mayor a menor para minimizar el número de transacciones
  debtors.sort((a, b) => b.balance - a.balance);
  creditors.sort((a, b) => b.balance - a.balance);

  const transfers: Transfer[] = [];

  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const amount = Math.min(debtor.balance, creditor.balance);
    const roundedAmount = Math.round(amount * 100) / 100;

    if (roundedAmount > 0) {
      transfers.push({
        from: debtor.name,
        to: creditor.name,
        from_id: debtor.participantId,
        to_id: creditor.participantId,
        amount: roundedAmount,
      });
    }

    debtor.balance -= amount;
    creditor.balance -= amount;

    if (debtor.balance < 0.001) i++;
    if (creditor.balance < 0.001) j++;
  }

  return transfers;
}
