import { el, icon } from '../dom.js';
import { formatDateShort, formatMoney } from '../format.js';
import { categoryName } from '../reports/incomeStatement.js';

function accountName(state, accountId) {
  return state.accounts.find((account) => account.id === accountId)?.name || 'Счёт';
}

export function transactionAmount(transaction, currency) {
  const money = formatMoney(transaction.amount, currency);
  if (transaction.type === 'income') return { text: `+${money}`, tone: 'income' };
  if (transaction.type === 'expense') return { text: `−${money}`, tone: 'expense' };
  return { text: money, tone: null };
}

/**
 * Строка операции для обзора и журнала.
 * Кнопка редактирования — ссылка на overlay-маршрут, удаление — data-action.
 */
export function createTransactionRow(state, transaction) {
  const currency = state.settings.currency;
  const amount = transactionAmount(transaction, currency);
  const isTransfer = transaction.type === 'transfer';
  const title = isTransfer ? 'Перевод' : categoryName(state, transaction.categoryId);
  const sub = isTransfer
    ? `${accountName(state, transaction.accountId)} → ${accountName(state, transaction.toAccountId)} · ${formatDateShort(transaction.date)}`
    : `${transaction.note || accountName(state, transaction.accountId)} · ${formatDateShort(transaction.date)}`;

  return el('li', { class: 'row' }, [
    el('div', { class: 'row__main' }, [
      el('span', { class: 'row__title', text: title }),
      el('span', { class: 'row__sub', text: sub }),
    ]),
    el('span', {
      class: `row__amount${amount.tone ? ` amount--${amount.tone}` : ''}`,
      text: amount.text,
    }),
    el('div', { class: 'row__actions' }, [
      el('a', {
        class: 'icon-btn',
        href: `#/edit/${encodeURIComponent(transaction.id)}`,
        attrs: { 'aria-label': 'Редактировать операцию' },
      }, [
        icon(['M4 20h4l10-10-4-4L4 16v4Z', 'M13.5 6.5l4 4']),
      ]),
      el('button', {
        class: 'icon-btn',
        type: 'button',
        dataset: { action: 'delete-tx', id: transaction.id },
        attrs: { 'aria-label': 'Удалить операцию' },
      }, [
        icon(['M5 7h14', 'M9 7V4h6v3', 'M7 7l1 13h8l1-13', 'M10 11v6', 'M14 11v6']),
      ]),
    ]),
  ]);
}
