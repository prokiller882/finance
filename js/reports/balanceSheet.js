/**
 * Чистые функции отчётов: не трогают DOM и localStorage,
 * чтобы позже их можно было покрыть тестами и переиспользовать с БД.
 */

/** Влияние операции на баланс конкретного счёта (в копейках). */
export function transactionDelta(transaction, accountId) {
  if (transaction.type === 'income') {
    return transaction.accountId === accountId ? transaction.amount : 0;
  }
  if (transaction.type === 'expense') {
    return transaction.accountId === accountId ? -transaction.amount : 0;
  }
  if (transaction.type === 'transfer') {
    let delta = 0;
    if (transaction.accountId === accountId) delta -= transaction.amount;
    if (transaction.toAccountId === accountId) delta += transaction.amount;
    return delta;
  }
  return 0;
}

/**
 * Баланс счёта: начальный остаток + операции.
 * before — строго до даты (для остатка на начало периода),
 * asOf  — включительно по дату.
 */
export function accountBalance(state, accountId, { before = null, asOf = null } = {}) {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) return 0;

  let balance = account.openingBalance || 0;
  for (const transaction of state.transactions) {
    if (before && transaction.date >= before) continue;
    if (asOf && transaction.date > asOf) continue;
    balance += transactionDelta(transaction, accountId);
  }
  return balance;
}

/** Сумма по всем счетам. Архивные счета тоже учитываются — деньги не исчезают. */
export function totalBalance(state, options = {}) {
  return state.accounts.reduce(
    (sum, account) => sum + accountBalance(state, account.id, options),
    0,
  );
}

export function buildBalanceSheet(state, asOf) {
  const assets = state.accounts.map((account) => ({
    id: account.id,
    name: account.name,
    kind: account.kind,
    archived: account.archived,
    balance: accountBalance(state, account.id, { asOf }),
  }));

  const totalAssets = assets.reduce((sum, asset) => sum + asset.balance, 0);

  // Обязательства появятся вместе с кредитными счетами (миграция схемы).
  const liabilities = [];
  const totalLiabilities = 0;

  return {
    asOf,
    assets,
    totalAssets,
    liabilities,
    totalLiabilities,
    equity: totalAssets - totalLiabilities,
  };
}
