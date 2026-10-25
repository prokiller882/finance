import { $, $$, fillSelect } from '../dom.js';
import {
  formatAmountInput,
  formatMoney,
  monthKey,
  monthKeyFromISO,
  parseAmount,
  todayISO,
} from '../format.js';
import { accountBalance } from '../reports/balanceSheet.js';

/**
 * Модальная форма операции. Живёт в <dialog> вне экранов;
 * #/add открывает создание, #/edit/{id} — редактирование.
 */
export function createTransactionSheet(app, { dashboard = null, transactions = null } = {}) {
  const dialog = document.getElementById('tx-sheet');
  if (!dialog) throw new Error('Не найден контейнер формы: tx-sheet');

  const refs = {
    form: $('#tx-form', dialog),
    title: $('#tx-sheet-title', dialog),
    amount: $('#tx-amount', dialog),
    account: $('#tx-account', dialog),
    toAccount: $('#tx-to-account', dialog),
    accountLabel: $('#tx-account-label', dialog),
    date: $('#tx-date', dialog),
    note: $('#tx-note', dialog),
    typeGroup: $('#tx-type', dialog),
    toField: $('#tx-to-field', dialog),
    categoryField: $('#tx-category-field', dialog),
    categorySelect: $('#tx-category', dialog),
    error: $('#tx-error', dialog),
    close: $('#tx-close', dialog),
    submit: $('button[type="submit"]', dialog),
  };

  let type = 'expense';
  let basePath = '/dashboard';
  let mode = 'create';
  let editing = null;
  let allowUncategorized = false;
  let lastTrigger = null;
  let returnFocusTransactionId = null;
  let accountsErrorShown = false;

  /**
   * Для создания — только активные счета. Для редактирования добавляем
   * архивные, если операция уже ссылается на них, иначе счёт потеряется.
   */
  function formAccounts() {
    const referenced = editing
      ? new Set([editing.accountId, editing.toAccountId].filter(Boolean))
      : new Set();

    return app.state.accounts.filter(
      (account) => !account.archived || referenced.has(account.id),
    );
  }

  function showError(message) {
    refs.error.textContent = message;
    refs.error.hidden = false;
  }

  function clearError() {
    refs.error.textContent = '';
    refs.error.hidden = true;
  }

  function fillCategories() {
    if (type === 'transfer') return;
    const categories = app.state.categories
      .filter((category) => category.kind === type)
      .map((category) => ({ value: category.id, label: category.name }));

    if (allowUncategorized) {
      categories.unshift({ value: '', label: 'Без категории' });
      fillSelect(refs.categorySelect, categories);
      return;
    }

    fillSelect(refs.categorySelect, categories, {
      placeholder: categories.length ? 'Выберите категорию' : 'Нет категорий — добавьте в настройках',
    });
  }

  function setType(next) {
    type = next;

    for (const button of $$('.segmented__btn', refs.typeGroup)) {
      const active = button.dataset.type === type;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }

    refs.toField.hidden = type !== 'transfer';
    refs.categoryField.hidden = type === 'transfer';
    refs.accountLabel.textContent = type === 'transfer' ? 'Со счёта' : 'Счёт';

    if (type === 'transfer' && !refs.toAccount.value) {
      const other = formAccounts().find((account) => account.id !== refs.account.value);
      if (other) refs.toAccount.value = other.id;
    }

    fillCategories();
  }

  function syncToAccount() {
    if (refs.toAccount.value !== refs.account.value) return;
    const other = formAccounts().find((account) => account.id !== refs.account.value);
    if (other) refs.toAccount.value = other.id;
  }

  function render() {
    const state = app.state;
    const { currency } = state.settings;
    const accounts = formAccounts();

    const options = accounts.map((account) => ({
      value: account.id,
      label: `${account.name}${account.archived ? ' · в архиве' : ''} · ${formatMoney(accountBalance(state, account.id), currency)}`,
    }));

    fillSelect(refs.account, options, {
      placeholder: accounts.length ? null : 'Нет счетов',
    });
    fillSelect(refs.toAccount, options, {
      placeholder: accounts.length ? null : 'Нет счетов',
    });
    syncToAccount();

    setType(type);

    refs.submit.disabled = accounts.length === 0;
    if (!accounts.length) {
      accountsErrorShown = true;
      showError('Сначала добавьте хотя бы один счёт в настройках.');
    } else if (accountsErrorShown) {
      accountsErrorShown = false;
      clearError();
    }
  }

  function currentScreenMonth() {
    if (basePath === '/dashboard') return dashboard?.getMonth();
    if (basePath === '/transactions') return transactions?.getMonth();
    return null;
  }

  function defaultDate() {
    const selectedMonth = currentScreenMonth();
    if (selectedMonth && selectedMonth !== monthKey()) return `${selectedMonth}-01`;
    return todayISO();
  }

  function resetForm() {
    mode = 'create';
    editing = null;
    allowUncategorized = false;
    type = 'expense';
    refs.form.reset();
    refs.title.textContent = 'Новая операция';
    refs.date.value = defaultDate();
    accountsErrorShown = false;
    clearError();
    render();
  }

  function fillForm(transaction) {
    mode = 'edit';
    editing = transaction;
    allowUncategorized = true;
    type = transaction.type;

    refs.form.reset();
    refs.title.textContent = 'Редактировать операцию';
    refs.amount.value = formatAmountInput(transaction.amount);
    refs.note.value = transaction.note || '';
    refs.date.value = transaction.date;
    accountsErrorShown = false;
    clearError();

    render();

    refs.account.value = transaction.accountId;
    refs.toAccount.value = transaction.toAccountId || '';
    refs.categorySelect.value = transaction.categoryId || '';
    setType(type);
  }

  function open({
    basePath: nextBasePath = '/dashboard',
    mode: nextMode = 'create',
    transactionId = null,
  } = {}) {
    basePath = nextBasePath;
    lastTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    returnFocusTransactionId = nextMode === 'edit' ? transactionId : null;

    if (nextMode === 'edit') {
      const transaction = app.state.transactions.find((item) => item.id === transactionId);
      if (!transaction) {
        app.toast('Операция не найдена');
        return false;
      }
      fillForm(transaction);
    } else {
      resetForm();
    }

    document.body.classList.add('is-sheet-open');
    if (!dialog.open) dialog.showModal();

    requestAnimationFrame(() => {
      if (dialog.open) refs.amount.focus({ preventScroll: true });
    });

    return true;
  }

  function close() {
    document.body.classList.remove('is-sheet-open');
    if (dialog.open) dialog.close();
  }

  function requestClose() {
    if (!dialog.open) return;
    app.back();
  }

  function onSubmit(event) {
    event.preventDefault();
    clearError();

    const amount = parseAmount(refs.amount.value);
    if (!amount) {
      showError('Введите сумму больше нуля, например 1250,50');
      refs.amount.focus();
      return;
    }

    const accountId = refs.account.value;
    if (!accountId) {
      showError('Выберите счёт.');
      return;
    }

    let toAccountId = null;
    if (type === 'transfer') {
      toAccountId = refs.toAccount.value;
      if (!toAccountId) {
        showError('Выберите счёт получателя.');
        return;
      }
      if (toAccountId === accountId) {
        showError('Счета перевода должны различаться.');
        return;
      }
    }

    const categoryId = type === 'transfer' ? null : (refs.categorySelect.value || null);
    if (type !== 'transfer' && !categoryId && !allowUncategorized) {
      showError('Выберите категорию. Если списка нет — добавьте категории в настройках.');
      return;
    }

    const date = refs.date.value;
    if (!date) {
      showError('Укажите дату операции.');
      return;
    }

    const payload = {
      type,
      amount,
      accountId,
      toAccountId,
      categoryId,
      date,
      note: refs.note.value.trim(),
    };

    let saved = false;
    try {
      saved = mode === 'edit'
        ? app.actions.updateTransaction(editing.id, payload)
        : app.actions.addTransaction(payload);
    } catch (error) {
      console.error('Не удалось сохранить операцию', error);
      showError(error instanceof Error ? error.message : 'Проверьте данные операции.');
      return;
    }

    if (!saved) {
      showError('Не удалось сохранить: возможно, закончилось место в localStorage.');
      return;
    }

    const targetMonth = monthKeyFromISO(date);
    dashboard?.setMonth(targetMonth);
    transactions?.setMonth(targetMonth);
    app.toast(mode === 'edit' ? 'Операция обновлена' : 'Операция добавлена');
    app.back();
  }

  refs.typeGroup.addEventListener('click', (event) => {
    const button = event.target.closest('[data-type]');
    if (!button) return;
    setType(button.dataset.type);
    clearError();
  });

  refs.account.addEventListener('change', () => {
    syncToAccount();
    clearError();
  });
  refs.amount.addEventListener('input', clearError);
  refs.form.addEventListener('submit', onSubmit);
  refs.close.addEventListener('click', requestClose);

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    requestClose();
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) requestClose();
  });

  dialog.addEventListener('close', () => {
    document.body.classList.remove('is-sheet-open');

    const trigger = lastTrigger;
    const editId = returnFocusTransactionId;
    lastTrigger = null;
    returnFocusTransactionId = null;

    const restoreFocus = () => {
      // После сохранения строка могла перерисоваться — ищем её кнопку заново.
      if (editId) {
        const href = `#/edit/${encodeURIComponent(editId)}`;
        const editLink = Array.from(document.querySelectorAll('a[href^="#/edit/"]'))
          .find((link) => link.getAttribute('href') === href && !link.closest('[hidden]'));
        if (editLink) {
          editLink.focus({ preventScroll: true });
          return true;
        }
      }

      if (trigger?.isConnected && trigger !== document.body) {
        trigger.focus({ preventScroll: true });
        return true;
      }

      const title = document.getElementById('screen-title');
      if (title) {
        title.focus({ preventScroll: true });
        return true;
      }

      return false;
    };

    // Фокус ставим после выхода из modal-состояния: пока <dialog> открыт,
    // элементы под ним инертны и focus() игнорируется.
    setTimeout(restoreFocus, 0);
  });

  return {
    open,
    close,
    render,
    isOpen: () => dialog.open,
  };
}
