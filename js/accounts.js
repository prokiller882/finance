import { ACCOUNT_KINDS } from './labels.js';

export const ACCOUNT_NAME_MAX_LENGTH = 40;

/** Есть ли операции, которые ссылаются на счёт как на источник или получателя. */
export function accountHasOperations(state, accountId) {
  return state.transactions.some(
    (transaction) => transaction.accountId === accountId || transaction.toAccountId === accountId,
  );
}

/** Есть ли плановые платежи, которые ссылаются на счёт. */
export function accountHasPlannedPayments(state, accountId) {
  return (state.plannedPayments || []).some((plan) => plan.accountId === accountId);
}

/**
 * Проверяет и нормализует данные счёта перед сохранением.
 * excludeId нужен при редактировании, чтобы счёт не конфликтовал сам с собой.
 */
export function normalizeAccountInput(state, input, { excludeId = null } = {}) {
  const name = String(input.name ?? '').trim();
  if (!name) throw new Error('Введите название счёта');
  if (name.length > ACCOUNT_NAME_MAX_LENGTH) {
    throw new Error(`Название счёта должно быть не длиннее ${ACCOUNT_NAME_MAX_LENGTH} символов`);
  }

  const duplicate = state.accounts.some(
    (account) => account.id !== excludeId && account.name.toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) throw new Error('Счёт с таким названием уже есть');

  if (!ACCOUNT_KINDS.some((item) => item.value === input.kind)) {
    throw new Error('Неизвестный тип счёта');
  }
  if (!Number.isSafeInteger(input.openingBalance) || input.openingBalance < 0) {
    throw new Error('Начальный остаток должен быть неотрицательным числом');
  }

  return { name, kind: input.kind, openingBalance: input.openingBalance };
}
