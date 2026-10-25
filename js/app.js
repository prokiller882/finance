import { createStore } from './store.js';
import * as storage from './storage.js';
import { createRouter } from './router.js';
import { createSeedState } from './seed.js';
import { Category, Transaction } from './models/index.js';
import { newId } from './util.js';
import { accountBalance } from './reports/balanceSheet.js';
import { accountHasOperations, normalizeAccountInput } from './accounts.js';
import { ensurePersistentStorage, registerServiceWorker } from './pwa.js';
import { createDashboard } from './screens/dashboard.js';
import { createTransactions } from './screens/transactions.js';
import { createTransactionSheet } from './components/transactionSheet.js';
import { createReports } from './screens/reports.js';
import { createSettings } from './screens/settings.js';

const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
const store = createStore(storage.loadState());

let router = null;
let toastTimer = 0;

function toast(message) {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2600);
}

function applyTheme() {
  const theme = store.getState().settings.theme;
  const resolved = theme === 'system' ? (darkMedia.matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0b1220' : '#f4f5f7');
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
    });
  },

  updateTransaction(id, input) {
    return store.commit((state) => {
      const index = state.transactions.findIndex((transaction) => transaction.id === id);
      if (index < 0) throw new Error('Операция не найдена.');

      const current = state.transactions[index];
      state.transactions[index] = Transaction.create(
        { ...input, createdAt: current.createdAt },
        { id: current.id },
      ).toJSON();
    });
  },

  updateSettings(patch) {
    const saved = store.commit((state) => {
      state.settings = { ...state.settings, ...patch };
    });
    if ('theme' in patch) applyTheme();
    return saved;
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
    });
  },

  async importFile(file) {
    const next = await storage.parseImportFile(file);
    next.updatedAt = new Date().toISOString();
    store.replace(next, { persist: true });
    applyTheme();
  },

  reset() {
    store.replace(createSeedState(), { persist: true });
    storage.clearMeta();
    applyTheme();
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
  navigate: (path) => router.navigate(path),
  back: () => router.back(),
  toast,
  getBackupMeta: () => storage.readMeta(),
};

const dashboard = createDashboard(app);
const transactions = createTransactions(app);
app.transactions = transactions;

const screens = {
  dashboard,
  transactions,
  reports: createReports(app),
  settings: createSettings(app),
};

const transactionSheet = createTransactionSheet(app, { dashboard, transactions });
router = createRouter({
  screens,
  overlays: { transaction: transactionSheet },
});

store.subscribe(() => router.refresh());

window.addEventListener('storage', (event) => {
  if (event.key !== storage.KEY) return;
  const next = storage.readState();
  if (!next || next.updatedAt === store.getState().updatedAt) return;
  store.replace(next);
  applyTheme();
  toast('Данные обновлены в другой вкладке');
});

darkMedia.addEventListener('change', () => {
  if (store.getState().settings.theme === 'system') applyTheme();
});

document.getElementById('back-btn')?.addEventListener('click', () => {
  router.back();
});

applyTheme();
ensurePersistentStorage();
registerServiceWorker();
router.start();
