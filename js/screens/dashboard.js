import { $, el, clear } from '../dom.js';
import {
  formatMoney,
  isMonthKey,
  monthKey,
  monthRange,
  shiftMonthKey,
} from '../format.js';
import { accountBalance } from '../reports/balanceSheet.js';
import { buildDashboardOverview } from '../reports/overview.js';
import { createTransactionRow } from '../components/transactionRow.js';
import { accountSubtitle } from '../labels.js';

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
