import { $, $$, clear, el, fillSelect } from '../dom.js';
import {
  isMonthKey,
  monthKey,
  monthRange,
  shiftMonthKey,
} from '../format.js';
import { filterJournalTransactions } from '../journal.js';
import { createTransactionRow } from '../components/transactionRow.js';
import { operationsCount } from '../labels.js';

export function createTransactions(app) {
  let monthEl;
  let currentMonthBtn;
  let typeGroup;
  let accountSelect;
  let categorySelect;
  let searchInput;
  let resetFiltersBtn;
  let countEl;
  let listEl;

  let month = monthKey();
  let type = 'all';
  let accountId = '';
  let categoryId = '';
  let query = '';

  function filtersActive() {
    return type !== 'all' || accountId !== '' || categoryId !== '' || query.trim() !== '';
  }

  function syncFilters(state) {
    for (const button of $$('.chip', typeGroup)) {
      button.setAttribute('aria-pressed', String(button.dataset.type === type));
    }

    const accounts = state.accounts.map((account) => ({
      value: account.id,
      label: `${account.name}${account.archived ? ' · в архиве' : ''}`,
    }));
    fillSelect(accountSelect, accounts, { placeholder: 'Все счета' });
    accountSelect.value = accountId;
    accountId = accountSelect.value;

    const categories = state.categories
      .filter((category) => type === 'all' || type === 'transfer' || category.kind === type)
      .map((category) => ({ value: category.id, label: category.name }));

    if (type !== 'transfer') categories.push({ value: 'none', label: 'Без категории' });

    categorySelect.disabled = type === 'transfer';
    if (type === 'transfer' || (categoryId && !categories.some((item) => item.value === categoryId))) {
      categoryId = '';
    }
    fillSelect(categorySelect, categories, { placeholder: 'Все' });
    categorySelect.value = categoryId;
    categoryId = categorySelect.value;

    if (searchInput.value !== query) searchInput.value = query;
    resetFiltersBtn.hidden = !filtersActive();
  }

  function render() {
    if (!listEl) return;

    const state = app.state;
    const range = monthRange(month);
    monthEl.textContent = range.label;
    currentMonthBtn.hidden = month === monthKey();

    syncFilters(state);

    const transactions = filterJournalTransactions(state, {
      from: range.from,
      to: range.to,
      type,
      accountId,
      categoryId,
      query,
    });

    countEl.textContent = operationsCount(transactions.length);
    clear(listEl);

    if (!transactions.length) {
      const filters = filtersActive();
      listEl.append(el('li', {
        class: 'empty',
        text: filters
          ? 'По фильтрам ничего не найдено.'
          : `За ${range.label.toLowerCase()} операций нет. Нажмите «+», чтобы добавить.`,
      }));
      return;
    }

    for (const transaction of transactions) {
      listEl.append(createTransactionRow(state, transaction));
    }
  }

  function setMonth(next) {
    month = isMonthKey(next) ? next : monthKey();
    render();
  }

  function resetFilters() {
    type = 'all';
    accountId = '';
    categoryId = '';
    query = '';
    searchInput.value = '';
    render();
  }

  return {
    id: 'transactions',
    title: 'Операции',

    init(root) {
      monthEl = $('#op-month', root);
      currentMonthBtn = $('#op-current-month', root);
      typeGroup = $('#op-type-filter', root);
      accountSelect = $('#op-account-filter', root);
      categorySelect = $('#op-category-filter', root);
      searchInput = $('#op-search', root);
      resetFiltersBtn = $('#op-reset-filters', root);
      countEl = $('#op-count', root);
      listEl = $('#op-list', root);

      $('#op-prev-month', root).addEventListener('click', () => {
        setMonth(shiftMonthKey(month, -1));
      });
      $('#op-next-month', root).addEventListener('click', () => {
        setMonth(shiftMonthKey(month, 1));
      });
      currentMonthBtn.addEventListener('click', () => setMonth(monthKey()));

      typeGroup.addEventListener('click', (event) => {
        const button = event.target.closest('[data-type]');
        if (!button) return;
        type = button.dataset.type;
        render();
      });

      accountSelect.addEventListener('change', () => {
        accountId = accountSelect.value;
        render();
      });
      categorySelect.addEventListener('change', () => {
        categoryId = categorySelect.value;
        render();
      });
      searchInput.addEventListener('input', () => {
        query = searchInput.value;
        render();
      });
      resetFiltersBtn.addEventListener('click', resetFilters);

      listEl.addEventListener('click', (event) => {
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
