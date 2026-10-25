import { isInRange } from '../format.js';

export function categoryName(state, categoryId) {
  if (!categoryId) return 'Без категории';
  const category = state.categories.find((item) => item.id === categoryId);
  return category ? category.name : 'Без категории';
}

/** Группировка операций одного типа по категориям за период. */
export function groupTransactionsByCategory(state, type, range) {
  const groups = new Map();

  for (const transaction of state.transactions) {
    if (transaction.type !== type) continue;
    if (!isInRange(transaction.date, range.from, range.to)) continue;

    const key = transaction.categoryId || 'none';
    const group = groups.get(key) || {
      id: key,
      name: categoryName(state, transaction.categoryId),
      amount: 0,
      count: 0,
    };
    group.amount += transaction.amount;
    group.count += 1;
    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => b.amount - a.amount);
}

export function buildIncomeStatement(state, range) {
  const income = groupTransactionsByCategory(state, 'income', range);
  const expense = groupTransactionsByCategory(state, 'expense', range);

  const totalIncome = income.reduce((sum, row) => sum + row.amount, 0);
  const totalExpense = expense.reduce((sum, row) => sum + row.amount, 0);
  const profit = totalIncome - totalExpense;

  return {
    range,
    income,
    expense,
    totalIncome,
    totalExpense,
    profit,
    margin: totalIncome > 0 ? profit / totalIncome : null,
  };
}
