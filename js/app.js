import { createStore } from './store.js';
import * as storage from './storage.js';
import { createRouter } from './router.js';
import { createSeedState } from './seed.js';
import { Category, PaymentOccurrence, PlannedPayment, Transaction } from './models/index.js';
import { todayISO } from './format.js';
import { occursOn } from './recurrence.js';
import { newId } from './util.js';
import { accountBalance } from './reports/balanceSheet.js';
import {
  accountHasOperations,
  accountHasPlannedPayments,
  normalizeAccountInput,
} from './accounts.js';
import { ensurePersistentStorage, registerServiceWorker } from './pwa.js';
import { createDashboard } from './screens/dashboard.js';
import { createTransactions } from './screens/transactions.js';
import { createCalendar } from './screens/calendar.js';
import { createTransactionSheet } from './components/transactionSheet.js';
import { createPlannedPaymentSheet } from './components/plannedPaymentSheet.js';
import { createReports } from './screens/reports.js';
import { createSettings } from './screens/settings.js';
import { createSafeMode } from './screens/safeMode.js';

const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');

let store = null;
let router = null;
let safeMode = null;
let toastTimer = 0;

function toast(message) {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2600);
}

/** В safe mode store нет, поэтому тема там всегда системная. */
function applyTheme(theme) {
  const preferred = theme ?? (store ? store.getState().settings.theme : 'system');
  const resolved = preferred === 'system' ? (darkMedia.matches ? 'dark' : 'light') : preferred;
  document.documentElement.dataset.theme = resolved;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    // Цвет берём из токена темы, чтобы не дублировать hex в JS.
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
    if (bg) meta.setAttribute('content', bg);
  }
}

const actions = {
  addTransaction(input) {
    const transaction = Transaction.create(input).toJSON();

    return store.commit((state) => {
      state.transactions.push(transaction);
    });
  },

  deleteTransaction(id) {
    return store.commit((state) => {
      state.transactions = state.transactions.filter((transaction) => transaction.id !== id);
      state.paymentOccurrences = state.paymentOccurrences.filter(
        (occurrence) => occurrence.transactionId !== id,
      );
    });
  },

  updateTransaction(id, input) {
    return store.commit((state) => {
      const index = state.transactions.findIndex((transaction) => transaction.id === id);
      if (index < 0) throw new Error('Операция не найдена.');

      const current = state.transactions[index];
      const next = Transaction.create(
        { ...input, createdAt: current.createdAt },
        { id: current.id },
      ).toJSON();

      state.transactions[index] = next;

      // Если изменились тип, счёт или дата, оплаченное вхождение больше
      // не соответствует операции и возвращается в ожидание.
      const scheduleChanged = next.type !== current.type
        || next.accountId !== current.accountId
        || next.date !== current.date;
      if (scheduleChanged) {
        state.paymentOccurrences = state.paymentOccurrences.filter(
          (occurrence) => occurrence.transactionId !== id,
        );
      }
    });
  },

  addPlannedPayment(input) {
    const plan = PlannedPayment.create(input).toJSON();

    return store.commit((state) => {
      state.plannedPayments.push(plan);
    });
  },

  updatePlannedPayment(id, input) {
    return store.commit((state) => {
      const index = state.plannedPayments.findIndex((plan) => plan.id === id);
      if (index < 0) throw new Error('Платёж не найден.');

      const current = state.plannedPayments[index];
      const next = PlannedPayment.create(
        { ...input, createdAt: current.createdAt },
        { id: current.id },
      ).toJSON();

      state.plannedPayments[index] = next;

      // Оплаченные вхождения остаются историей, пропущенные — только если
      // дата всё ещё входит в новую серию.
      state.paymentOccurrences = state.paymentOccurrences.filter((occurrence) => {
        if (occurrence.planId !== id) return true;
        if (occurrence.status === 'paid') return true;
        return occursOn(next, occurrence.date);
      });
    });
  },

  deletePlannedPayment(id) {
    return store.commit((state) => {
      state.plannedPayments = state.plannedPayments.filter((plan) => plan.id !== id);
      state.paymentOccurrences = state.paymentOccurrences.filter(
        (occurrence) => occurrence.planId !== id,
      );
    });
  },

  payPlannedPayment(planId, date) {
    return store.commit((state) => {
      const plan = state.plannedPayments.find((item) => item.id === planId);
      if (!plan) throw new Error('Платёж не найден.');

      const existing = state.paymentOccurrences.find(
        (occurrence) => occurrence.planId === planId && occurrence.date === date,
      );
      if (existing?.status === 'paid') throw new Error('Платёж уже оплачен.');

      const transaction = Transaction.create({
        type: plan.type,
        amount: plan.amount,
        accountId: plan.accountId,
        categoryId: plan.categoryId,
        note: plan.note,
        date: todayISO(),
      }).toJSON();

      state.transactions.push(transaction);

      if (existing) {
        existing.status = 'paid';
        existing.transactionId = transaction.id;
        existing.updatedAt = new Date().toISOString();
      } else {
        state.paymentOccurrences.push(PaymentOccurrence.create({
          planId,
          date,
          status: 'paid',
          transactionId: transaction.id,
        }).toJSON());
      }
    });
  },

  skipPlannedPayment(planId, date) {
    return store.commit((state) => {
      const plan = state.plannedPayments.find((item) => item.id === planId);
      if (!plan) throw new Error('Платёж не найден.');

      const existing = state.paymentOccurrences.find(
        (occurrence) => occurrence.planId === planId && occurrence.date === date,
      );
      if (existing?.status === 'paid') throw new Error('Оплаченный платёж нельзя пропустить.');
      if (existing?.status === 'skipped') return;

      state.paymentOccurrences.push(PaymentOccurrence.create({
        planId,
        date,
        status: 'skipped',
        transactionId: null,
      }).toJSON());
    });
  },

  restorePlannedPayment(planId, date) {
    return store.commit((state) => {
      const existing = state.paymentOccurrences.find(
        (occurrence) => occurrence.planId === planId && occurrence.date === date,
      );
      if (!existing) return;
      if (existing.status === 'paid') throw new Error('Оплаченный платёж нельзя вернуть в ожидание.');

      state.paymentOccurrences = state.paymentOccurrences.filter(
        (occurrence) => !(occurrence.planId === planId && occurrence.date === date),
      );
    });
  },

  updateSettings(patch) {
    const result = store.commit((state) => {
      state.settings = { ...state.settings, ...patch };
    });
    if (result.ok && 'theme' in patch) applyTheme();
    return result;
  },

  addAccount({ name, kind, openingBalance }) {
    return store.commit((state) => {
      const account = normalizeAccountInput(state, { name, kind, openingBalance });
      state.accounts.push({
        id: newId(),
        ...account,
        archived: false,
      });
    });
  },

  updateAccount(id, input) {
    return store.commit((state) => {
      const account = state.accounts.find((item) => item.id === id);
      if (!account) throw new Error('Счёт не найден');

      Object.assign(account, normalizeAccountInput(state, input, { excludeId: id }));
    });
  },

  toggleAccount(id) {
    return store.commit((state) => {
      const account = state.accounts.find((item) => item.id === id);
      if (account) account.archived = !account.archived;
    });
  },

  deleteAccount(id, { allowNonZero = false } = {}) {
    return store.commit((state) => {
      const account = state.accounts.find((item) => item.id === id);
      if (!account) throw new Error('Счёт не найден');

      if (accountHasOperations(state, id)) {
        throw new Error('По счёту есть операции — отправьте его в архив');
      }
      if (accountHasPlannedPayments(state, id)) {
        throw new Error('По счёту есть плановые платежи — удалите их или отправьте счёт в архив');
      }

      if (!allowNonZero && accountBalance(state, id) !== 0) {
        throw new Error('Счёт с ненулевым остатком нельзя удалить без подтверждения');
      }

      state.accounts = state.accounts.filter((item) => item.id !== id);
    });
  },

  addCategory({ name, kind }) {
    const category = Category.create({ name, kind }).toJSON();

    return store.commit((state) => {
      state.categories.push(category);
    });
  },

  deleteCategory(id) {
    return store.commit((state) => {
      state.categories = state.categories.filter((category) => category.id !== id);
      state.budgets = (Array.isArray(state.budgets) ? state.budgets : [])
        .filter((budget) => budget.categoryId !== id);
      for (const transaction of state.transactions) {
        if (transaction.categoryId === id) transaction.categoryId = null;
      }
      for (const plan of state.plannedPayments) {
        if (plan.categoryId === id) plan.categoryId = null;
      }
    });
  },

  async importFile(file) {
    const next = await storage.parseImportFile(file);
    next.updatedAt = new Date().toISOString();
    const result = store.replace(next, { persist: true });
    if (result.ok) applyTheme();
    return result;
  },

  reset() {
    const result = store.replace(createSeedState(), { persist: true });
    if (!result.ok) return result;
    storage.clearMeta();
    applyTheme();
    return result;
  },

  async exportData() {
    const result = await storage.shareState(store.getState());
    if (result !== 'cancelled') storage.markExported();
    return result;
  },
};

const app = {
  get state() {
    return store.getState();
  },
  actions,
  navigate: (path) => router?.navigate(path),
  back: () => router?.back(),
  toast,
  getBackupMeta: () => storage.readMeta(),
};

/**
 * Обычный режим. Вызывается один раз: при старте или после успешного
 * восстановления. store и роутер появляются только здесь.
 */
function startApp(initialState) {
  if (store) return;

  store = createStore(initialState);

  const dashboard = createDashboard(app);
  const transactions = createTransactions(app);
  app.transactions = transactions;

  const calendar = createCalendar(app);
  app.calendar = calendar;

  const screens = {
    dashboard,
    transactions,
    calendar,
    reports: createReports(app),
    settings: createSettings(app),
  };

  const transactionSheet = createTransactionSheet(app, { dashboard, transactions });
  const plannedPaymentSheet = createPlannedPaymentSheet(app, { calendar });
  router = createRouter({
    screens,
    overlays: {
      transaction: transactionSheet,
      plannedPayment: plannedPaymentSheet,
    },
  });

  store.subscribe(() => router.refresh());

  document.getElementById('safe-mode')?.setAttribute('hidden', '');
  document.querySelector('.app-shell')?.removeAttribute('hidden');
  document.querySelector('.tabbar')?.removeAttribute('hidden');

  applyTheme();
  router.start();
}

/**
 * Восстановление: временный store существует только на момент записи и
 * сохраняет данные первыми (replace(persist)), затем поднимает обычный режим.
 */
function recover(next) {
  const temporary = createStore(next);
  const result = temporary.replace(next, { persist: true });
  if (!result.ok) return result;

  startApp(temporary.getState());
  return { ok: true };
}

async function recoverFromFile(file) {
  const next = await storage.parseImportFile(file);
  next.updatedAt = new Date().toISOString();
  return recover(next);
}

async function recoverFromRaw() {
  // Копию перечитываем в момент действия: снимок экрана мог устареть.
  const raw = storage.readPreV4Raw();
  if (typeof raw !== 'string') {
    throw new storage.StorageError('INVALID_STATE', 'Копия до обновления не найдена.');
  }
  const next = storage.parseImportText(raw);
  next.updatedAt = new Date().toISOString();
  return recover(next);
}

async function exportRaw() {
  // Исходные данные тоже берём актуальные, а не снимок старта.
  const current = storage.readState();
  if (typeof current.raw !== 'string') return 'unavailable';
  return storage.shareRaw(current.raw);
}

function resetFromSafeMode() {
  const seeded = createSeedState();
  const temporary = createStore(seeded);
  const result = temporary.replace(seeded, { persist: true });
  if (!result.ok) return result;

  storage.clearMeta();
  startApp(temporary.getState());
  return { ok: true };
}

function startSafeMode(boot) {
  // Устаревшая оболочка из кеша могла не содержать #safe-mode: без экрана
  // пользователь остался бы с пустой страницей и без пути восстановления.
  let root = document.getElementById('safe-mode');
  if (!root) {
    root = document.createElement('main');
    root.className = 'safe-mode';
    root.id = 'safe-mode';
    // Старый CSS в кеше не знает .safe-mode: без этих свойств экран
    // обрезался бы body с overflow: hidden. 100vh — запасной вариант.
    root.style.height = '100vh';
    root.style.height = '100dvh';
    root.style.overflowY = 'auto';
    root.style.padding = '16px';
    document.body.append(root);
  }

  safeMode = createSafeMode({
    status: boot.status,
    version: boot.version ?? null,
    raw: typeof boot.raw === 'string' ? boot.raw : null,
    preV4Raw: storage.readPreV4Raw(),
    recoverFromFile,
    recoverFromRaw,
    exportRaw,
    reset: resetFromSafeMode,
    toast,
  });

  safeMode.mount(root);

  // Шелл скрываем только после того, как безопасный экран отрисован.
  document.querySelector('.app-shell')?.setAttribute('hidden', '');
  document.querySelector('.tabbar')?.setAttribute('hidden', '');
  applyTheme('system');
}

window.addEventListener('storage', (event) => {
  if (event.key !== storage.KEY) return;

  const next = storage.readState();

  if (store) {
    // В обычном режиме чужую несовместимую запись не подменяем: перезагрузка
    // сама откроет безопасный экран.
    if (next.status === 'forward' || next.status === 'corrupt') {
      toast('Данные в другой вкладке изменились — перезагрузите страницу');
      return;
    }
    if (next.status !== 'ok') return;
    // Ревизия точнее даты: две записи в одну миллисекунду не должны
    // считаться одной и той же.
    if (next.state.rev === store.getState().rev) return;
    store.replace(next.state);
    applyTheme();
    toast('Данные обновлены в другой вкладке');
    return;
  }

  // Safe mode: состояние не подменяем, только сообщаем о внешней записи.
  safeMode?.showStorageBanner();
});

darkMedia.addEventListener('change', () => {
  if (!store || store.getState().settings.theme === 'system') applyTheme();
});

document.getElementById('back-btn')?.addEventListener('click', () => {
  router?.back();
});

document.getElementById('settings-btn')?.addEventListener('click', () => {
  router?.navigate('/settings');
});

ensurePersistentStorage();
registerServiceWorker();

const boot = storage.loadState();
if (boot.status === 'ok' || boot.status === 'empty') {
  startApp(boot.state);
} else {
  startSafeMode(boot);
}
