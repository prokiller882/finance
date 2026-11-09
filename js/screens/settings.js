import { $, el, clear, fillSelect, icon } from '../dom.js';
import { formatAmountInput, formatMoney, parseAmount } from '../format.js';
import { accountBalance } from '../reports/balanceSheet.js';
import { ACCOUNT_KINDS, accountSubtitle } from '../labels.js';
import { accountHasOperations, accountHasPlannedPayments, normalizeAccountInput } from '../accounts.js';
import { daysSince, ensurePersistentStorage, isStoragePersisted } from '../pwa.js';

const BACKUP_STALE_DAYS = 30;

export function createSettings(app) {
  let accountsList;
  let categoriesList;
  let currencySelect;
  let themeSelect;
  let accountForm;
  let accountName;
  let accountKind;
  let accountOpening;
  let accountSubmit;
  let accountCancel;
  let accountFormMode;
  let categoryForm;
  let categoryNameInput;
  let categoryKind;
  let importInput;
  let exportButton;
  let backupStatus;
  let storageStatus;

  let editingAccountId = null;

  function resetAccountEdit({ focusRow = false } = {}) {
    const previousId = editingAccountId;
    editingAccountId = null;
    accountForm.reset();
    fillSelect(accountKind, ACCOUNT_KINDS);
    accountFormMode.hidden = true;
    accountFormMode.textContent = '';
    accountSubmit.textContent = 'Добавить счёт';
    accountSubmit.classList.add('inline-form__wide');
    accountCancel.hidden = true;

    if (focusRow && previousId) {
      const row = Array.from(accountsList.querySelectorAll('[data-action="edit-account"]'))
        .find((button) => button.dataset.id === previousId);
      row?.focus();
    }
  }

  function startAccountEdit(account) {
    editingAccountId = account.id;
    accountName.value = account.name;
    accountKind.value = account.kind;
    accountOpening.value = account.openingBalance ? formatAmountInput(account.openingBalance) : '';
    accountFormMode.textContent = `Редактирование: «${account.name}»`;
    accountFormMode.hidden = false;
    accountSubmit.textContent = 'Сохранить';
    accountSubmit.classList.remove('inline-form__wide');
    accountCancel.hidden = false;
    accountName.focus();
  }

  function renderAccounts(state) {
    if (editingAccountId && !state.accounts.some((account) => account.id === editingAccountId)) {
      resetAccountEdit();
    }

    const currency = state.settings.currency;
    clear(accountsList);

    if (!state.accounts.length) {
      accountsList.append(el('li', { class: 'empty', text: 'Счетов пока нет' }));
      return;
    }

    for (const account of state.accounts) {
      const sub = accountSubtitle(account);
      accountsList.append(el('li', { class: `row${account.archived ? ' row--muted' : ''}` }, [
        el('button', {
          class: 'row__main row__main--button',
          type: 'button',
          dataset: { action: 'edit-account', id: account.id },
          attrs: {
            'aria-label': `Изменить счёт «${account.name}»`,
            title: `Изменить счёт «${account.name}»`,
          },
        }, [
          el('span', { class: 'row__title', text: account.name }),
          sub ? el('span', { class: 'row__sub', text: sub }) : null,
        ]),
        el('span', {
          class: 'row__amount',
          text: formatMoney(accountBalance(state, account.id), currency),
        }),
        el('div', { class: 'row__actions' }, [
          el('button', {
            class: 'btn btn--tiny',
            type: 'button',
            text: account.archived ? 'Вернуть' : 'В архив',
            dataset: { action: 'toggle-account', id: account.id },
          }),
          el('button', {
            class: 'icon-btn',
            type: 'button',
            dataset: { action: 'delete-account', id: account.id },
            attrs: {
              'aria-label': `Удалить счёт «${account.name}»`,
              title: `Удалить счёт «${account.name}»`,
            },
          }, [
            icon(['M5 7h14', 'M9 7V4h6v3', 'M7 7l1 13h8l1-13', 'M10 11v6', 'M14 11v6']),
          ]),
        ]),
      ]));
    }
  }

  function renderCategories(state) {
    clear(categoriesList);
    const groups = [
      { kind: 'expense', title: 'Расходы' },
      { kind: 'income', title: 'Доходы' },
    ];

    for (const group of groups) {
      const categories = state.categories.filter((category) => category.kind === group.kind);
      categoriesList.append(el('li', { class: 'row' }, [
        el('span', { class: 'row__title', text: group.title }),
      ]));

      if (!categories.length) {
        categoriesList.append(el('li', { class: 'row' }, [
          el('span', { class: 'row__sub', text: 'Пусто' }),
        ]));
        continue;
      }

      for (const category of categories) {
        categoriesList.append(el('li', { class: 'row' }, [
          el('span', { class: 'row__title', text: category.name }),
          el('button', {
            class: 'btn btn--tiny btn--danger',
            type: 'button',
            text: 'Удалить',
            dataset: { action: 'delete-category', id: category.id },
          }),
        ]));
      }
    }
  }

  function renderBackupStatus() {
    const meta = app.getBackupMeta();
    const last = typeof meta.lastExportAt === 'string' ? meta.lastExportAt : '';
    const days = last ? daysSince(last) : null;
    const stale = !last || days == null || days >= BACKUP_STALE_DAYS;
    backupStatus.classList.toggle('hint--warning', stale);

    if (!last || days == null) {
      backupStatus.textContent = 'Резервная копия ещё не делалась.';
      return;
    }

    const formatted = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(last)).replace(/\s*г\.$/, '');
    backupStatus.textContent = stale
      ? `Последняя копия: ${formatted}. Пора сохранить новую.`
      : `Последняя копия: ${formatted}.`;
  }

  async function refreshStorageStatus() {
    // Сначала просим постоянное хранилище, затем читаем фактический статус:
    // браузер мог отказать раньше и разрешить позже, например после установки.
    await ensurePersistentStorage();
    const persisted = await isStoragePersisted();

    if (persisted === true) {
      storageStatus.textContent = 'Хранилище защищено от автоматической очистки.';
      storageStatus.classList.remove('hint--warning');
      return;
    }

    storageStatus.textContent = persisted === false
      ? 'Браузер может очистить данные при нехватке места. Регулярно сохраняйте копию.'
      : 'Статус хранилища недоступен. Регулярно сохраняйте копию.';
    storageStatus.classList.add('hint--warning');
  }

  function readAccountForm() {
    let openingBalance = 0;
    const openingRaw = accountOpening.value.trim();
    if (openingRaw) {
      const parsed = parseAmount(openingRaw, { allowZero: true });
      if (parsed == null) {
        app.toast('Начальный остаток должен быть неотрицательным числом');
        accountOpening.focus();
        return null;
      }
      openingBalance = parsed;
    }

    return {
      name: accountName.value.trim(),
      kind: accountKind.value,
      openingBalance,
    };
  }

  function onSubmitAccount(event) {
    event.preventDefault();
    const input = readAccountForm();
    if (!input) return;

    const isEditing = editingAccountId != null;
    let normalized;
    try {
      normalized = normalizeAccountInput(app.state, input, { excludeId: editingAccountId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Проверьте данные счёта';
      app.toast(message);
      if (/название/i.test(message)) accountName.focus();
      return;
    }

    if (isEditing) {
      const account = app.state.accounts.find((item) => item.id === editingAccountId);
      if (!account) {
        resetAccountEdit();
        app.toast('Счёт не найден');
        return;
      }

      const openingChanged = account.openingBalance !== normalized.openingBalance;
      if (
        openingChanged
        && accountHasOperations(app.state, account.id)
        && !window.confirm('У счёта есть операции. Изменение начального остатка пересчитает баланс и отчёты за всю историю. Продолжить?')
      ) {
        return;
      }

      try {
        const saved = app.actions.updateAccount(account.id, normalized);
        if (!saved) {
          app.toast('Не удалось сохранить счёт');
          return;
        }
      } catch (error) {
        console.error('Не удалось изменить счёт', error);
        app.toast(error instanceof Error ? error.message : 'Не удалось сохранить счёт');
        return;
      }

      resetAccountEdit();
      app.toast('Счёт изменён');
      return;
    }

    try {
      const saved = app.actions.addAccount(normalized);
      if (!saved) {
        app.toast('Не удалось сохранить счёт');
        return;
      }
    } catch (error) {
      console.error('Не удалось добавить счёт', error);
      app.toast(error instanceof Error ? error.message : 'Не удалось сохранить счёт');
      return;
    }

    accountForm.reset();
    fillSelect(accountKind, ACCOUNT_KINDS);
    app.toast('Счёт добавлен');
  }

  function onCancelAccountEdit() {
    resetAccountEdit({ focusRow: true });
  }

  function onAddCategory(event) {
    event.preventDefault();
    const name = categoryNameInput.value.trim();
    if (!name) {
      app.toast('Введите название категории');
      categoryNameInput.focus();
      return;
    }

    const kind = categoryKind.value;
    const duplicate = app.state.categories.some(
      (category) => category.kind === kind && category.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      app.toast('Такая категория уже есть');
      return;
    }

    try {
      const saved = app.actions.addCategory({ name, kind });
      if (!saved) {
        app.toast('Не удалось сохранить категорию');
        return;
      }
    } catch (error) {
      console.error('Не удалось добавить категорию', error);
      app.toast(error instanceof Error ? error.message : 'Не удалось добавить категорию');
      return;
    }
    categoryForm.reset();
    app.toast('Категория добавлена');
  }

  async function onImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!window.confirm(`Импорт файла «${file.name}» заменит текущие счета, операции, плановые платежи и настройки. Продолжить?`)) {
      importInput.value = '';
      return;
    }

    try {
      await app.actions.importFile(file);
      resetAccountEdit();
      app.toast('Данные импортированы');
    } catch (error) {
      console.error('Не удалось импортировать данные', error);
      app.toast(error instanceof Error ? error.message : 'Не удалось прочитать файл');
    } finally {
      importInput.value = '';
    }
  }

  return {
    id: 'settings',
    title: 'Настройки',

    init(root) {
      accountsList = $('#set-accounts', root);
      categoriesList = $('#set-categories', root);
      currencySelect = $('#set-currency', root);
      themeSelect = $('#set-theme', root);
      accountForm = $('#account-form', root);
      accountName = $('#account-name', root);
      accountKind = $('#account-kind', root);
      accountOpening = $('#account-opening', root);
      accountSubmit = $('#account-submit', root);
      accountCancel = $('#account-cancel', root);
      accountFormMode = $('#account-form-mode', root);
      categoryForm = $('#category-form', root);
      categoryNameInput = $('#category-name', root);
      categoryKind = $('#category-kind', root);
      importInput = $('#import-input', root);
      exportButton = $('#export-btn', root);
      backupStatus = $('#backup-status', root);
      storageStatus = $('#storage-status', root);

      fillSelect(accountKind, ACCOUNT_KINDS);

      currencySelect.addEventListener('change', () => {
        app.actions.updateSettings({ currency: currencySelect.value });
      });

      themeSelect.addEventListener('change', () => {
        app.actions.updateSettings({ theme: themeSelect.value });
      });

      accountForm.addEventListener('submit', onSubmitAccount);
      accountCancel.addEventListener('click', onCancelAccountEdit);
      categoryForm.addEventListener('submit', onAddCategory);

      accountsList.addEventListener('click', (event) => {
        const edit = event.target.closest('[data-action="edit-account"]');
        if (edit) {
          const account = app.state.accounts.find((item) => item.id === edit.dataset.id);
          if (account) startAccountEdit(account);
          return;
        }

        const toggle = event.target.closest('[data-action="toggle-account"]');
        if (toggle) {
          const saved = app.actions.toggleAccount(toggle.dataset.id);
          if (!saved) app.toast('Не удалось сохранить изменения');
          return;
        }

        const remove = event.target.closest('[data-action="delete-account"]');
        if (!remove) return;

        const account = app.state.accounts.find((item) => item.id === remove.dataset.id);
        if (!account) return;

        if (accountHasOperations(app.state, account.id)) {
          app.toast('По счёту есть операции — отправьте его в архив');
          return;
        }

        if (accountHasPlannedPayments(app.state, account.id)) {
          app.toast('По счёту есть плановые платежи — удалите их или отправьте счёт в архив');
          return;
        }

        const balance = accountBalance(app.state, account.id);
        const money = formatMoney(balance, app.state.settings.currency);
        if (balance !== 0) {
          const confirmed = window.confirm(
            `На счёте «${account.name}» остаток ${money}. Удалить счёт вместе с остатком? Итоговый баланс уменьшится на ${money}.`,
          );
          if (!confirmed) return;
        } else if (!window.confirm(`Удалить счёт «${account.name}»? Это действие нельзя отменить.`)) {
          return;
        }

        try {
          const saved = app.actions.deleteAccount(account.id, { allowNonZero: balance !== 0 });
          if (!saved) {
            app.toast('Не удалось удалить счёт');
            return;
          }
        } catch (error) {
          console.error('Не удалось удалить счёт', error);
          app.toast(error instanceof Error ? error.message : 'Не удалось удалить счёт');
          return;
        }

        app.toast(balance !== 0 ? 'Счёт удалён, остаток списан' : 'Счёт удалён');
      });

      categoriesList.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action="delete-category"]');
        if (!button) return;
        const category = app.state.categories.find((item) => item.id === button.dataset.id);
        if (!category) return;
        if (!window.confirm(`Удалить категорию «${category.name}»? Операции и плановые платежи останутся без категории, связанные бюджеты будут удалены.`)) return;
        const saved = app.actions.deleteCategory(button.dataset.id);
        if (!saved) {
          app.toast('Не удалось удалить категорию');
          return;
        }
        app.toast('Категория удалена');
      });

      exportButton.addEventListener('click', async () => {
        if (exportButton.disabled) return;
        exportButton.disabled = true;
        try {
          const result = await app.actions.exportData();
          if (result === 'cancelled') return;
          renderBackupStatus();
          app.toast(result === 'shared' ? 'Копия отправлена' : 'Файл с данными скачан');
        } catch (error) {
          console.error('Не удалось сохранить копию', error);
          app.toast('Не удалось сохранить копию');
        } finally {
          exportButton.disabled = false;
        }
      });

      importInput.addEventListener('change', onImport);

      $('#reset-btn', root).addEventListener('click', () => {
        if (!window.confirm('Удалить все операции, счета, категории, бюджеты и плановые платежи без возможности восстановления?')) return;
        app.actions.reset();
        resetAccountEdit();
        renderBackupStatus();
        app.toast('Данные сброшены');
      });
    },

    show() {
      refreshStorageStatus();
    },

    render() {
      const state = app.state;
      currencySelect.value = state.settings.currency;
      themeSelect.value = state.settings.theme;
      renderAccounts(state);
      renderCategories(state);
      renderBackupStatus();
    },
  };
}
