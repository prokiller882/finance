import { el, icon } from '../dom.js';
import { formatDateShort } from '../format.js';
import { PAYMENT_STATUS_LABELS, RECURRENCE_LABELS } from '../labels.js';
import {
  paymentAccountName,
  paymentAmount,
  paymentTitle,
} from '../payments.js';

/**
 * Строка планового платежа для календаря и блока «Требует внимания».
 * Действия обрабатываются делегированием по data-action.
 */
export function createPaymentRow(state, occurrence, { showDate = false } = {}) {
  const amount = paymentAmount(occurrence, state.settings.currency);
  const isPaid = occurrence.status === 'paid';
  const isSkipped = occurrence.status === 'skipped';
  const parts = [];

  if (showDate) parts.push(formatDateShort(occurrence.date));
  parts.push(paymentAccountName(state, occurrence));
  if (occurrence.plan.recurrence !== 'none') {
    parts.push(RECURRENCE_LABELS[occurrence.plan.recurrence]);
  }
  if (isPaid && occurrence.transaction && occurrence.transaction.date !== occurrence.date) {
    parts.push(`оплачено ${formatDateShort(occurrence.transaction.date)}`);
  }

  const actions = [];

  if (!isPaid && !isSkipped) {
    actions.push(el('button', {
      class: 'btn btn--tiny btn--primary payment-row__pay',
      type: 'button',
      text: 'Оплатить',
      dataset: {
        action: 'pay-payment',
        planId: occurrence.planId,
        date: occurrence.date,
      },
    }));
    actions.push(el('button', {
      class: 'btn btn--tiny',
      type: 'button',
      text: 'Пропустить',
      dataset: {
        action: 'skip-payment',
        planId: occurrence.planId,
        date: occurrence.date,
      },
    }));
  }

  if (isSkipped) {
    actions.push(el('button', {
      class: 'btn btn--tiny',
      type: 'button',
      text: 'Вернуть',
      dataset: {
        action: 'restore-payment',
        planId: occurrence.planId,
        date: occurrence.date,
      },
    }));
  }

  actions.push(el('a', {
    class: 'icon-btn',
    href: `#/calendar/edit/${encodeURIComponent(occurrence.planId)}`,
    attrs: { 'aria-label': 'Редактировать платёж' },
  }, [
    icon(['M4 20h4l10-10-4-4L4 16v4Z', 'M13.5 6.5l4 4']),
  ]));

  if (isPaid && occurrence.transactionId) {
    actions.push(el('a', {
      class: 'icon-btn',
      href: `#/edit/${encodeURIComponent(occurrence.transactionId)}`,
      attrs: { 'aria-label': 'Открыть операцию оплаты' },
    }, [
      icon(['M4 6h16v12H4z', 'M8 10h8', 'M8 14h5']),
    ]));
  }

  actions.push(el('button', {
    class: 'icon-btn',
    type: 'button',
    dataset: {
      action: 'delete-payment',
      planId: occurrence.planId,
    },
    attrs: { 'aria-label': 'Удалить платёж' },
  }, [
    icon(['M5 7h14', 'M9 7V4h6v3', 'M7 7l1 13h8l1-13', 'M10 11v6', 'M14 11v6']),
  ]));

  return el('li', { class: `row payment-row${isSkipped ? ' row--muted' : ''}` }, [
    el('div', { class: 'row__main payment-row__main' }, [
      el('span', { class: 'row__title', text: paymentTitle(state, occurrence) }),
      el('span', { class: 'row__sub', text: parts.join(' · ') }),
      el('span', {
        class: `badge badge--${occurrence.status}`,
        text: PAYMENT_STATUS_LABELS[occurrence.status] || occurrence.status,
      }),
    ]),
    el('span', {
      class: `row__amount${amount.tone ? ` amount--${amount.tone}` : ''}`,
      text: amount.text,
    }),
    el('div', { class: 'row__actions payment-row__actions' }, actions),
  ]);
}
