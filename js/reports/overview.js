import { isInRange } from '../format.js';
import { totalBalance } from './balanceSheet.js';

/**
 * Сводка обзора: баланс за всё время, доходы/расходы и операции
 * только за переданный месяц. Переводы остаются в списке, но не в суммах.
 */
export function buildDashboardOverview(state, range, limit = 8) {
  let income = 0;
  let expense = 0;
  const transactions = [];

  for (const transaction of state.transactions) {
    if (!isInRange(transaction.date, range.from, range.to)) continue;

    transactions.push(transaction);
    if (transaction.type === 'income') income += transaction.amount;
    else if (transaction.type === 'expense') expense += transaction.amount;
  }

  transactions.sort((a, b) => (
    b.date.localeCompare(a.date)
    || String(b.createdAt).localeCompare(String(a.createdAt))
  ));

  return {
    total: totalBalance(state),
    income,
    expense,
    transactions: transactions.slice(0, limit),
    count: transactions.length,
  };
}
