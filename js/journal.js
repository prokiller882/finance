import { categoryName } from './reports/incomeStatement.js';

/**
 * Чистая выборка для журнала операций.
 * from/to — ISO-даты включительно; пустые значения означают отсутствие границы.
 * categoryId === 'none' выбирает операции без категории.
 */
export function filterJournalTransactions(state, {
  from = null,
  to = null,
  type = 'all',
  accountId = '',
  categoryId = '',
  query = '',
} = {}) {
  const term = String(query ?? '').trim().toLowerCase();
  const accountNames = new Map(
    state.accounts.map((account) => [account.id, String(account.name ?? '').toLowerCase()]),
  );

  const items = state.transactions.filter((transaction) => {
    if (from && transaction.date < from) return false;
    if (to && transaction.date > to) return false;
    if (type !== 'all' && transaction.type !== type) return false;

    if (accountId) {
      const matchesAccount = transaction.accountId === accountId
        || (transaction.type === 'transfer' && transaction.toAccountId === accountId);
      if (!matchesAccount) return false;
    }

    if (categoryId) {
      if (transaction.type === 'transfer') return false;
      if (categoryId === 'none') {
        if (transaction.categoryId) return false;
      } else if (transaction.categoryId !== categoryId) {
        return false;
      }
    }

    if (term) {
      const title = transaction.type === 'transfer'
        ? 'Перевод'
        : categoryName(state, transaction.categoryId);
      const haystack = [
        title,
        transaction.note,
        accountNames.get(transaction.accountId),
        transaction.toAccountId ? accountNames.get(transaction.toAccountId) : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(term)) return false;
    }

    return true;
  });

  return items.sort((a, b) => (
    b.date.localeCompare(a.date)
    || String(b.createdAt).localeCompare(String(a.createdAt))
  ));
}
