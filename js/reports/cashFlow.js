import { isInRange } from '../format.js';
import { totalBalance } from './balanceSheet.js';
import { groupTransactionsByCategory } from './incomeStatement.js';

export function buildCashFlow(state, range) {
  const inflows = groupTransactionsByCategory(state, 'income', range);
  const outflows = groupTransactionsByCategory(state, 'expense', range);

  const totalIn = inflows.reduce((sum, row) => sum + row.amount, 0);
  const totalOut = outflows.reduce((sum, row) => sum + row.amount, 0);

  // Остатки берём из тех же функций, что и балансовый отчёт,
  // поэтому «Остаток на конец» всегда совпадает с активами на дату.
  const opening = totalBalance(state, { before: range.from });
  const closing = totalBalance(state, { asOf: range.to });

  const transfers = state.transactions.filter(
    (transaction) => transaction.type === 'transfer'
      && isInRange(transaction.date, range.from, range.to),
  );

  return {
    range,
    inflows,
    outflows,
    totalIn,
    totalOut,
    opening,
    closing,
    net: closing - opening,
    transfersCount: transfers.length,
    transfersTotal: transfers.reduce((sum, transaction) => sum + transaction.amount, 0),
    // Должно быть 0: расхождение означает ошибку в расчётах потоков.
    discrepancy: (totalIn - totalOut) - (closing - opening),
  };
}
