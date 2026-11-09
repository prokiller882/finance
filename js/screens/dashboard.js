import { $, el, clear } from '../dom.js';
import {
  formatDateShort,
  formatMoney,
  isMonthKey,
  monthKey,
  monthRange,
  shiftMonthKey,
} from '../format.js';
import { accountBalance } from '../reports/balanceSheet.js';
import { buildDashboardOverview } from '../reports/overview.js';
import { createTransactionRow } from '../components/transactionRow.js';
import { accountSubtitle, PAYMENT_STATUS_LABELS } from '../labels.js';
import { buildUpcomingPayments, paymentAmount, paymentTitle } from '../payments.js';

export function createDashboard(app) {
  let totalEl;
  let incomeEl;
  let expenseEl;
  let monthEl;
  let currentMonthBtn;
  let accountsEl;
  let recentTitleEl;
  let recentEl;
  let allTransactionsLink;
  let paymentsEl;
  let calendarLink;

  let month = monthKey();

  function renderAccounts(state) {
    const currency = state.settings.currency;
    clear(accountsEl);

    if (!state.accounts.length) {
      accountsEl.append(el('li', { class: 'empty', text: 'Счетов пока нет — добавьте их в настройках' }));
      return;
    }

    for (const account of state.accounts) {
      const sub = accountSubtitle(account);
      accountsEl.append(el('li', { class: `row${account.archived ? ' row--muted' : ''}` }, [
        el('div', { class: 'row__main' }, [
          el('span', { class: 'row__title', text: account.name }),
          sub ? el('span', { class: 'row__sub', text: sub }) : null,
        ]),
        el('span', {
          class: 'row__amount',
          text: formatMoney(accountBalance(state, account.id), currency),
        }),
      ]));
    }
  }

  function renderRecent(state, transactions, range) {
    clear(recentEl);
    recentTitleEl.textContent = `Операции за ${range.label.toLowerCase()}`;

    if (!transactions.length) {
      recentEl.append(el('li', {
        class: 'empty',
        text: `За ${range.label.toLowerCase()} операций нет. Нажмите «+», чтобы добавить.`,
      }));
      return;
    }

    for (const transaction of transactions) {
      recentEl.append(createTransactionRow(state, transaction));
    }
  }

  function renderPayments(state) {
    clear(paymentsEl);
    const payments = buildUpcomingPayments(state, { limit: 3 });

    if (!payments.length) {
      paymentsEl.append(el('li', {
        class: 'empty',
        text: 'Плановых платежей нет — добавьте их в календаре.',
      }));
      return;
    }

    for (const occurrence of payments) {
      const amount = paymentAmount(occurrence, state.settings.currency);
      paymentsEl.append(el('li', { class: 'row' }, [
        el('button', {
          class: 'row__main row__main--button',
          type: 'button',
          dataset: { action: 'open-payment', date: occurrence.date },
          attrs: {
            'aria-label': `Открыть календарь на ${formatDateShort(occurrence.date)}`,
          },
        }, [
          el('span', { class: 'row__title', text: paymentTitle(state, occurrence) }),
          el('span', {
            class: 'row__sub',
            text: `${formatDateShort(occurrence.date)} · ${PAYMENT_STATUS_LABELS[occurrence.status] || ''}`,
          }),
        ]),
        el('span', {
          class: `row__amount${amount.tone ? ` amount--${amount.tone}` : ''}`,
          text: amount.text,
        }),
      ]));
    }
  }

  function render() {
    if (!totalEl) return;

    const state = app.state;
    const { currency } = state.settings;
    const range = monthRange(month);
    const overview = buildDashboardOverview(state, range);

    totalEl.textContent = formatMoney(overview.total, currency);
    totalEl.classList.toggle('is-negative', overview.total < 0);

    incomeEl.textContent = formatMoney(overview.income, currency);
    expenseEl.textContent = formatMoney(overview.expense, currency);

    if (monthEl.textContent !== range.label) monthEl.textContent = range.label;
    currentMonthBtn.hidden = month === monthKey();

    renderAccounts(state);
    renderPayments(state);
    renderRecent(state, overview.transactions, range);
  }

  function setMonth(next) {
    month = isMonthKey(next) ? next : monthKey();
    render();
  }

  return {
    id: 'dashboard',
    title: 'Обзор',

    init(root) {
      totalEl = $('#dash-total', root);
      incomeEl = $('#dash-income', root);
      expenseEl = $('#dash-expense', root);
      monthEl = $('#dash-month', root);
      currentMonthBtn = $('#dash-current-month', root);
      accountsEl = $('#dash-accounts', root);
      recentTitleEl = $('#dash-recent-title', root);
      recentEl = $('#dash-recent', root);
      allTransactionsLink = $('#dash-all-transactions', root);
      paymentsEl = $('#dash-payments', root);
      calendarLink = $('#dash-calendar', root);

      $('#dash-prev-month', root).addEventListener('click', () => {
        setMonth(shiftMonthKey(month, -1));
      });
      $('#dash-next-month', root).addEventListener('click', () => {
        setMonth(shiftMonthKey(month, 1));
      });
      currentMonthBtn.addEventListener('click', () => setMonth(monthKey()));

      allTransactionsLink.addEventListener('click', () => {
        app.transactions?.setMonth(month);
      });

      calendarLink.addEventListener('click', () => {
        app.calendar?.setMonth(month);
      });

      paymentsEl.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action="open-payment"]');
        if (!button) return;
        app.calendar?.setSelectedDate(button.dataset.date);
        app.navigate('/calendar');
      });

      recentEl.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action="delete-tx"]');
        if (!button) return;
        if (!window.confirm('Удалить операцию?')) return;

        const saved = app.actions.deleteTransaction(button.dataset.id);
        if (!saved) {
          app.toast('Не удалось удалить операцию');
          return;
        }
        app.toast('Операция удалена');
      });
    },

    render,
    getMonth: () => month,
    setMonth,
  };
}
