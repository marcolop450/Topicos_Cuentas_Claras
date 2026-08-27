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
  amount: number;
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
  balance: number; // positive = owed (le deben), negative = owes (debe)
};

export type Transfer = {
  from: string; // name
  to: string; // name
  amount: number;
};

export function calculateBalances(
  participants: Participant[],
  expenses: Expense[],
  splits: ExpenseSplit[]
): Balance[] {
  // Initialize balances to 0
  const balancesMap: Record<string, number> = {};
  participants.forEach(p => {
    balancesMap[p.id] = 0;
  });

  // Calculate for each expense
  expenses.forEach(expense => {
    // Payer gets positive balance for the full amount (they paid it)
    if (balancesMap[expense.payer_id] !== undefined) {
      balancesMap[expense.payer_id] += expense.amount;
    }

    // Find who is involved in this expense
    const involvedSplits = splits.filter(s => s.expense_id === expense.id);
    const involvedCount = involvedSplits.length;

    if (involvedCount > 0) {
      // Split the amount. We use Math.floor for base and distribute remainder to avoid rounding issues.
      const totalCents = Math.round(expense.amount * 100);
      const splitCents = Math.floor(totalCents / involvedCount);
      let remainderCents = totalCents - (splitCents * involvedCount);

      involvedSplits.forEach(split => {
        if (balancesMap[split.participant_id] !== undefined) {
          // Each involved person owes their share (subtract from balance)
          let shareCents = splitCents;
          if (remainderCents > 0) {
            shareCents += 1;
            remainderCents -= 1;
          }
          balancesMap[split.participant_id] -= (shareCents / 100);
        }
      });
    }
  });

  // Convert map to array and round to 2 decimals to clean up any JS float quirks
  return participants.map(p => ({
    participantId: p.id,
    name: p.name,
    balance: Math.round(balancesMap[p.id] * 100) / 100
  }));
}

export function calculateSettlement(balances: Balance[]): Transfer[] {
  // Separate into debtors and creditors
  const debtors = balances.filter(b => b.balance < -0.001).map(b => ({ ...b, balance: Math.abs(b.balance) }));
  const creditors = balances.filter(b => b.balance > 0.001).map(b => ({ ...b }));

  // Sort by largest amounts first to minimize transactions
  debtors.sort((a, b) => b.balance - a.balance);
  creditors.sort((a, b) => b.balance - a.balance);

  const transfers: Transfer[] = [];

  let i = 0; // debtors index
  let j = 0; // creditors index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const amount = Math.min(debtor.balance, creditor.balance);
    const roundedAmount = Math.round(amount * 100) / 100;

    if (roundedAmount > 0) {
      transfers.push({
        from: debtor.name,
        to: creditor.name,
        amount: roundedAmount
      });
    }

    debtor.balance -= amount;
    creditor.balance -= amount;

    if (debtor.balance < 0.001) i++;
    if (creditor.balance < 0.001) j++;
  }

  return transfers;
}
