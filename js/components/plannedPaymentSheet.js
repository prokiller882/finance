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
 * Модальная форма планового платежа. Живёт в <dialog> вне экранов;
 * #/calendar/add открывает создание, #/calendar/edit/{id} — редактирование.
 */
export function createPlannedPaymentSheet(app, { calendar = null } = {}) {
  const dialog = document.getElementById('plan-sheet');
  if (!dialog) throw new Error('Не найден контейнер формы: plan-sheet');

  const refs = {
    form: $('#plan-form', dialog),
    title: $('#plan-sheet-title', dialog),
    amount: $('#plan-amount', dialog),
    account: $('#plan-account', dialog),
    category: $('#plan-category', dialog),
    date: $('#plan-date', dialog),
    recurrence: $('#plan-recurrence', dialog),
    endField: $('#plan-end-field', dialog),
    endDate: $('#plan-end', dialog),
    note: $('#plan-note', dialog),
    typeGroup: $('#plan-type', dialog),
    error: $('#plan-error', dialog),
    close: $('#plan-close', dialog),
    submit: $('button[type="submit"]', dialog),
  };

  let type = 'expense';
  let basePath = '/calendar';
  let mode = 'create';
  let editing = null;
  let lastTrigger = null;
  let returnFocusPlanId = null;
  let accountsErrorShown = false;

  function formAccounts() {
    const referenced = editing ? new Set([editing.accountId]) : new Set();
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
    const categories = app.state.categories
      .filter((category) => category.kind === type)
      .map((category) => ({ value: category.id, label: category.name }));

    categories.unshift({ value: '', label: 'Без категории' });
    fillSelect(refs.category, categories);
  }

  function setType(next) {
    type = next;

    for (const button of $$('.segmented__btn', refs.typeGroup)) {
      const active = button.dataset.type === type;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }

    fillCategories();
  }

  function syncEndField() {
    const repeats = refs.recurrence.value !== 'none';
    refs.endField.hidden = !repeats;
    if (!repeats) refs.endDate.value = '';
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

    setType(type);
    syncEndField();

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
    return basePath === '/calendar' ? calendar?.getMonth() : null;
  }

  function defaultDate() {
    const selectedMonth = currentScreenMonth();
    if (selectedMonth && selectedMonth !== monthKey()) return `${selectedMonth}-01`;
    return todayISO();
  }

  function resetForm() {
    mode = 'create';
    editing = null;
    type = 'expense';
    refs.form.reset();
    refs.title.textContent = 'Новый платёж';
    refs.date.value = defaultDate();
    refs.recurrence.value = 'none';
    syncEndField();
    accountsErrorShown = false;
    clearError();
    render();
  }

  function fillForm(plan) {
    mode = 'edit';
    editing = plan;
    type = plan.type;

    refs.form.reset();
    refs.title.textContent = 'Редактировать платёж';
    refs.amount.value = formatAmountInput(plan.amount);
    refs.note.value = plan.note || '';
    refs.date.value = plan.startDate;
    refs.recurrence.value = plan.recurrence;
    refs.endDate.value = plan.endDate || '';
    syncEndField();
    accountsErrorShown = false;
    clearError();

    render();

    refs.account.value = plan.accountId;
    refs.category.value = plan.categoryId || '';
  }

  function open({
    basePath: nextBasePath = '/calendar',
    mode: nextMode = 'create',
    planId = null,
  } = {}) {
    basePath = nextBasePath;
    lastTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    returnFocusPlanId = nextMode === 'edit' ? planId : null;

    if (nextMode === 'edit') {
      const plan = app.state.plannedPayments.find((item) => item.id === planId);
      if (!plan) {
        app.toast('Платёж не найден');
        return false;
      }
      fillForm(plan);
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

  function scheduleChanged(plan) {
    return plan.startDate !== editing.startDate
      || plan.recurrence !== editing.recurrence
      || plan.endDate !== editing.endDate;
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

    const startDate = refs.date.value;
    if (!startDate) {
      showError('Укажите дату платежа.');
      refs.date.focus();
      return;
    }

    const recurrence = refs.recurrence.value;
    const endDate = recurrence === 'none' ? null : (refs.endDate.value || null);
    if (endDate && endDate < startDate) {
      showError('Дата окончания не может быть раньше даты начала.');
      refs.endDate.focus();
      return;
    }

    const payload = {
      type,
      amount,
      accountId,
      categoryId: refs.category.value || null,
      note: refs.note.value.trim(),
      startDate,
      recurrence,
      endDate,
    };

    if (
      mode === 'edit'
      && editing
      && scheduleChanged(payload)
      && app.state.paymentOccurrences.some(
        (occurrence) => occurrence.planId === editing.id && occurrence.status === 'paid',
      )
      && !window.confirm('Изменение графика не затронет уже оплаченные платежи. Они останутся в истории. Продолжить?')
    ) {
      return;
    }

    let saved = false;
    try {
      saved = mode === 'edit'
        ? app.actions.updatePlannedPayment(editing.id, payload)
        : app.actions.addPlannedPayment(payload);
    } catch (error) {
      console.error('Не удалось сохранить платёж', error);
      showError(error instanceof Error ? error.message : 'Проверьте данные платежа.');
      return;
    }

    if (!saved) {
      showError('Не удалось сохранить: возможно, закончилось место в localStorage.');
      return;
    }

    const targetMonth = monthKeyFromISO(startDate);
    calendar?.setMonth(targetMonth);
    calendar?.setSelectedDate(startDate);
    app.toast(mode === 'edit' ? 'Платёж обновлён' : 'Платёж добавлен');
    app.back();
  }

  refs.typeGroup.addEventListener('click', (event) => {
    const button = event.target.closest('[data-type]');
    if (!button) return;
    setType(button.dataset.type);
    clearError();
  });

  refs.recurrence.addEventListener('change', () => {
    syncEndField();
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
    const planId = returnFocusPlanId;
    lastTrigger = null;
    returnFocusPlanId = null;

    const restoreFocus = () => {
      if (planId) {
        const href = `#/calendar/edit/${encodeURIComponent(planId)}`;
        const editLink = Array.from(document.querySelectorAll('a[href^="#/calendar/edit/"]'))
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

    setTimeout(restoreFocus, 0);
  });

  return {
    open,
    close,
    render,
    isOpen: () => dialog.open,
  };
}
