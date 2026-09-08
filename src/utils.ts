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

export type Expense = {
  id: string;
  group_id: string;
  description: string;
  amount: number;       // Monto en la moneda original
  currency: string;     // Código ISO 4217 (ej: 'BOB', 'USD', 'EUR')
  amount_usd: number;   // Monto convertido a USD (snapshot al guardar)
  payer_id: string;
};

export type ExpenseSplit = {
  id: string;
  expense_id: string;
  participant_id: string;
};

export type Balance = {
  participantId: string;
  name: string;
  balance: number; // en USD: positive = le deben, negative = debe
};

export type Transfer = {
  from: string; // name
  to: string;   // name
  amount: number; // en USD
};

/**
 * Calcula el balance de cada participante en USD.
 *
 * Usa expense.amount_usd para todos los cálculos, garantizando
 * que la suma de todos los balances sea exactamente 0.00 (en centavos).
 *
 * Para gastos legacy sin amount_usd (amount_usd === 0), usa
 * expense.amount directamente (asumiendo que ya está en USD o BOB≈USD
 * para no romper datos históricos).
 */
export function calculateBalances(
  participants: Participant[],
  expenses: Expense[],
  splits: ExpenseSplit[]
): Balance[] {
  // Inicializar balances a 0 (en centavos de USD)
  const balancesMap: Record<string, number> = {};
  participants.forEach(p => {
    balancesMap[p.id] = 0;
  });

  expenses.forEach(expense => {
    // Usar amount_usd si está disponible; si es 0, usar amount como fallback
    const usdAmount = expense.amount_usd > 0 ? expense.amount_usd : expense.amount;

    // El pagador recibe crédito por el monto total en USD
    if (balancesMap[expense.payer_id] !== undefined) {
      balancesMap[expense.payer_id] += usdAmount;
    }

    // Encontrar quién participa en este gasto
    const involvedSplits = splits.filter(s => s.expense_id === expense.id);
    const involvedCount = involvedSplits.length;

    if (involvedCount > 0) {
      // Trabajar en centavos para evitar problemas de redondeo con decimales infinitos
      const totalCents = Math.round(usdAmount * 100);
      const splitCents = Math.floor(totalCents / involvedCount);
      let remainderCents = totalCents - splitCents * involvedCount;

      involvedSplits.forEach(split => {
        if (balancesMap[split.participant_id] !== undefined) {
          let shareCents = splitCents;
          // Distribuir centavos sobrantes uno a uno entre los primeros participantes
          if (remainderCents > 0) {
            shareCents += 1;
            remainderCents -= 1;
          }
          balancesMap[split.participant_id] -= shareCents / 100;
        }
      });
    }
  });

  // Convertir a array y redondear a 2 decimales para limpiar artefactos de float
  return participants.map(p => ({
    participantId: p.id,
    name: p.name,
    balance: Math.round(balancesMap[p.id] * 100) / 100,
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
