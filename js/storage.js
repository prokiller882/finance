import { createSeedState } from './seed.js';
import { todayISO } from './format.js';
import { SCHEMA_VERSION } from './schema.js';
import {
  Budget,
  Category,
  PaymentOccurrence,
  PlannedPayment,
  Transaction,
  ValidationError,
  DEFAULT_CATEGORY_ICON,
  categoryColorFor,
  isISODateTime,
  isNonEmptyString,
  isPlainObject,
} from './models/index.js';

export { SCHEMA_VERSION };

export const KEY = 'finance-tracker:v1';
const META_KEY = 'finance-tracker:meta';
const CORRUPT_KEY = 'finance-tracker:corrupt';
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const CURRENCY_SET = new Set(['RUB', 'USD', 'EUR', 'KZT', 'BYN']);
const THEME_SET = new Set(['system', 'light', 'dark']);
const ACCOUNT_KIND_SET = new Set(['cash', 'card', 'bank', 'savings']);

export class StorageError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new StorageError(code, message, details);
}

/**
 * Приводит данные к текущей схеме. Миграция намеренно не проверяет ссылки:
 * это делает validateState(), чтобы повреждённый файл не был принят частично.
 */
export function migrate(data) {
  if (!isPlainObject(data)) {
    fail('INVALID_STATE', 'Файл не похож на экспорт трекера.');
  }

  const version = Number.isInteger(data.schemaVersion) ? data.schemaVersion : 1;
  if (version > SCHEMA_VERSION) {
    fail('UNSUPPORTED_VERSION', 'Данные созданы более новой версией приложения.');
  }

  if (
    !Array.isArray(data.accounts)
    || !Array.isArray(data.categories)
    || !Array.isArray(data.transactions)
  ) {
    fail('INVALID_STATE', 'В данных отсутствуют обязательные разделы.');
  }
  if (data.budgets != null && !Array.isArray(data.budgets)) {
    fail('INVALID_STATE', 'Раздел бюджетов должен быть массивом.');
  }
  if (data.plannedPayments != null && !Array.isArray(data.plannedPayments)) {
    fail('INVALID_STATE', 'Раздел плановых платежей должен быть массивом.');
  }
  if (data.paymentOccurrences != null && !Array.isArray(data.paymentOccurrences)) {
    fail('INVALID_STATE', 'Раздел вхождений платежей должен быть массивом.');
  }

  const now = new Date().toISOString();
  const settings = isPlainObject(data.settings) ? data.settings : {};
  const updatedAt = isISODateTime(data.updatedAt) ? data.updatedAt : now;

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt,
    settings: {
      ...settings,
      currency: settings.currency ?? 'RUB',
      theme: settings.theme ?? 'system',
    },
    accounts: data.accounts.map((account) => {
      const source = isPlainObject(account) ? account : {};
      return {
        ...source,
        archived: source.archived ?? false,
        openingBalance: source.openingBalance ?? 0,
        kind: source.kind ?? 'cash',
        name: typeof source.name === 'string' ? source.name.trim() : source.name,
      };
    }),
    categories: data.categories.map((category) => {
      const source = isPlainObject(category) ? category : {};
      return {
        ...source,
        name: typeof source.name === 'string' ? source.name.trim() : source.name,
        color: source.color || categoryColorFor(source.name || ''),
        icon: source.icon || DEFAULT_CATEGORY_ICON,
      };
    }),
    transactions: data.transactions.map((transaction) => {
      const source = isPlainObject(transaction) ? transaction : {};
      const createdAt = source.createdAt || source.updatedAt || updatedAt;
      return {
        ...source,
        note: typeof source.note === 'string' ? source.note.trim() : (source.note ?? ''),
        toAccountId: source.toAccountId ?? null,
        categoryId: source.categoryId ?? null,
        createdAt,
        updatedAt: source.updatedAt || createdAt,
      };
    }),
    budgets: (Array.isArray(data.budgets) ? data.budgets : []).map((budget) => (
      isPlainObject(budget) ? { ...budget } : {}
    )),
    plannedPayments: (Array.isArray(data.plannedPayments) ? data.plannedPayments : []).map((plan) => {
      const source = isPlainObject(plan) ? plan : {};
      const recurrence = source.recurrence ?? 'none';
      const createdAt = source.createdAt || source.updatedAt || updatedAt;
      return {
        ...source,
        type: source.type,
        amount: source.amount,
        accountId: source.accountId,
        categoryId: source.categoryId ?? null,
        note: typeof source.note === 'string' ? source.note.trim() : (source.note ?? ''),
        startDate: source.startDate,
        recurrence,
        endDate: recurrence === 'none' ? null : (source.endDate ?? null),
        createdAt,
        updatedAt: source.updatedAt || createdAt,
      };
    }),
    paymentOccurrences: (Array.isArray(data.paymentOccurrences) ? data.paymentOccurrences : []).map((occurrence) => {
      const source = isPlainObject(occurrence) ? occurrence : {};
      const createdAt = source.createdAt || source.updatedAt || updatedAt;
      return {
        ...source,
        status: source.status,
        transactionId: source.transactionId ?? null,
        createdAt,
        updatedAt: source.updatedAt || createdAt,
      };
    }),
  };
}

function entityFromJSON(Entity, raw, path, errors) {
  try {
    return Entity.fromJSON(raw);
  } catch (error) {
    const message = error instanceof ValidationError
      ? error.message
      : 'Некорректная запись.';
    errors.push({ path, message });
    return null;
  }
}

/**
 * Проверяет состояние целиком: типы, уникальность id, ссылки между сущностями.
 * Бросает StorageError('INVALID_STATE') со списком ошибок в details.
 */
export function validateState(state) {
  if (!isPlainObject(state)) {
    fail('INVALID_STATE', 'Состояние должно быть объектом.');
  }

  const errors = [];
  const addError = (path, message) => errors.push({ path, message });

  if (state.schemaVersion !== SCHEMA_VERSION) {
    addError('schemaVersion', 'Неподдерживаемая версия схемы данных.');
  }
  if (!isISODateTime(state.updatedAt)) {
    addError('updatedAt', 'Некорректная дата обновления данных.');
  }

  if (!isPlainObject(state.settings)) {
    addError('settings', 'Раздел настроек должен быть объектом.');
  } else {
    if (!CURRENCY_SET.has(state.settings.currency)) {
      addError('settings.currency', 'Неизвестная валюта.');
    }
    if (!THEME_SET.has(state.settings.theme)) {
      addError('settings.theme', 'Неизвестная тема.');
    }
  }

  const accountIds = new Set();
  if (!Array.isArray(state.accounts)) {
    addError('accounts', 'Раздел счетов должен быть массивом.');
  } else {
    state.accounts.forEach((account, index) => {
      const path = `accounts[${index}]`;
      if (!isPlainObject(account)) {
        addError(path, 'Счёт должен быть объектом.');
        return;
      }

      if (!isNonEmptyString(account.id)) {
        addError(`${path}.id`, 'У счёта должен быть id.');
      } else if (accountIds.has(account.id)) {
        addError(`${path}.id`, 'Повторяющийся id счёта.');
      } else {
        accountIds.add(account.id);
      }

      if (
        typeof account.name !== 'string'
        || !account.name.trim()
        || account.name.trim().length > 40
      ) {
        addError(`${path}.name`, 'Название счёта должно быть от 1 до 40 символов.');
      }
      if (!ACCOUNT_KIND_SET.has(account.kind)) {
        addError(`${path}.kind`, 'Неизвестный тип счёта.');
      }
      if (!Number.isSafeInteger(account.openingBalance) || account.openingBalance < 0) {
        addError(`${path}.openingBalance`, 'Начальный остаток должен быть неотрицательным целым числом копеек.');
      }
      if (typeof account.archived !== 'boolean') {
        addError(`${path}.archived`, 'Признак архива должен быть boolean.');
      }
    });
  }

  const categoryById = new Map();
  const categoryNameKeys = new Set();
  if (!Array.isArray(state.categories)) {
    addError('categories', 'Раздел категорий должен быть массивом.');
  } else {
    state.categories.forEach((raw, index) => {
      const path = `categories[${index}]`;
      const category = entityFromJSON(Category, raw, path, errors);
      if (!category) return;

      if (categoryById.has(category.id)) {
        addError(`${path}.id`, 'Повторяющийся id категории.');
      } else {
        categoryById.set(category.id, category);
      }

      const nameKey = `${category.kind}:${category.name.toLowerCase()}`;
      if (categoryNameKeys.has(nameKey)) {
        addError(`${path}.name`, 'Категория с таким названием и типом уже существует.');
      } else {
        categoryNameKeys.add(nameKey);
      }
    });
  }

  const transactionIds = new Set();
  const transactions = [];
  if (!Array.isArray(state.transactions)) {
    addError('transactions', 'Раздел операций должен быть массивом.');
  } else {
    state.transactions.forEach((raw, index) => {
      const path = `transactions[${index}]`;
      const transaction = entityFromJSON(Transaction, raw, path, errors);
      if (!transaction) return;

      if (transactionIds.has(transaction.id)) {
        addError(`${path}.id`, 'Повторяющийся id операции.');
      } else {
        transactionIds.add(transaction.id);
      }

      transactions.push({ path, value: transaction });
    });
  }

  const transactionById = new Map(transactions.map(({ value }) => [value.id, value]));

  for (const { path, value: transaction } of transactions) {
    if (!accountIds.has(transaction.accountId)) {
      addError(`${path}.accountId`, 'Счёт операции не найден.');
    }

    if (transaction.type === 'transfer') {
      if (!accountIds.has(transaction.toAccountId)) {
        addError(`${path}.toAccountId`, 'Счёт получателя не найден.');
      }
    } else if (transaction.categoryId !== null) {
      const category = categoryById.get(transaction.categoryId);
      if (!category) {
        addError(`${path}.categoryId`, 'Категория операции не найдена.');
      } else if (category.kind !== transaction.type) {
        addError(`${path}.categoryId`, 'Тип категории не совпадает с типом операции.');
      }
    }
  }

  const budgetIds = new Set();
  const budgetKeys = new Set();
  if (!Array.isArray(state.budgets)) {
    addError('budgets', 'Раздел бюджетов должен быть массивом.');
  } else {
    state.budgets.forEach((raw, index) => {
      const path = `budgets[${index}]`;
      const budget = entityFromJSON(Budget, raw, path, errors);
      if (!budget) return;

      if (budgetIds.has(budget.id)) {
        addError(`${path}.id`, 'Повторяющийся id бюджета.');
      } else {
        budgetIds.add(budget.id);
      }

      const budgetKey = `${budget.categoryId}:${budget.period}`;
      if (budgetKeys.has(budgetKey)) {
        addError(`${path}.period`, 'На эту категорию уже есть бюджет за этот месяц.');
      } else {
        budgetKeys.add(budgetKey);
      }

      const category = categoryById.get(budget.categoryId);
      if (!category) {
        addError(`${path}.categoryId`, 'Категория бюджета не найдена.');
      } else if (category.kind !== 'expense') {
        addError(`${path}.categoryId`, 'Бюджет можно задать только для расходной категории.');
      }
    });
  }

  const planIds = new Set();
  const planById = new Map();
  if (!Array.isArray(state.plannedPayments)) {
    addError('plannedPayments', 'Раздел плановых платежей должен быть массивом.');
  } else {
    state.plannedPayments.forEach((raw, index) => {
      const path = `plannedPayments[${index}]`;
      const plan = entityFromJSON(PlannedPayment, raw, path, errors);
      if (!plan) return;

      if (planIds.has(plan.id)) {
        addError(`${path}.id`, 'Повторяющийся id платежа.');
      } else {
        planIds.add(plan.id);
        planById.set(plan.id, plan);
      }

      if (!accountIds.has(plan.accountId)) {
        addError(`${path}.accountId`, 'Счёт платежа не найден.');
      }

      if (plan.categoryId !== null) {
        const category = categoryById.get(plan.categoryId);
        if (!category) {
          addError(`${path}.categoryId`, 'Категория платежа не найдена.');
        } else if (category.kind !== plan.type) {
          addError(`${path}.categoryId`, 'Тип категории не совпадает с типом платежа.');
        }
      }
    });
  }

  const occurrenceIds = new Set();
  const occurrenceKeys = new Set();
  const occurrenceTransactionIds = new Set();
  if (!Array.isArray(state.paymentOccurrences)) {
    addError('paymentOccurrences', 'Раздел вхождений платежей должен быть массивом.');
  } else {
    state.paymentOccurrences.forEach((raw, index) => {
      const path = `paymentOccurrences[${index}]`;
      const occurrence = entityFromJSON(PaymentOccurrence, raw, path, errors);
      if (!occurrence) return;

      if (occurrenceIds.has(occurrence.id)) {
        addError(`${path}.id`, 'Повторяющийся id вхождения.');
      } else {
        occurrenceIds.add(occurrence.id);
      }

      const occurrenceKey = `${occurrence.planId}:${occurrence.date}`;
      if (occurrenceKeys.has(occurrenceKey)) {
        addError(`${path}.date`, 'На эту дату уже есть вхождение платежа.');
      } else {
        occurrenceKeys.add(occurrenceKey);
      }

      const plan = planById.get(occurrence.planId);
      if (!plan) {
        addError(`${path}.planId`, 'Плановый платёж не найден.');
      }

      if (occurrence.status === 'paid') {
        // Тип и счёт операции не сверяем с текущим шаблоном: серию можно
        // отредактировать, а оплаченное вхождение остаётся фактом.
        const transaction = transactionById.get(occurrence.transactionId);
        if (!transaction) {
          addError(`${path}.transactionId`, 'Операция оплаты не найдена.');
        } else if (transaction.type === 'transfer') {
          addError(`${path}.transactionId`, 'Операция оплаты не может быть переводом.');
        }

        if (occurrenceTransactionIds.has(occurrence.transactionId)) {
          addError(`${path}.transactionId`, 'Операция уже привязана к другому платежу.');
        } else {
          occurrenceTransactionIds.add(occurrence.transactionId);
        }
      }
    });
  }

  if (errors.length) {
    fail('INVALID_STATE', `Данные не прошли проверку: ${errors[0].message}`, errors);
  }

  return true;
}

function backupCorrupt(raw) {
  if (!raw) return;
  try {
    localStorage.setItem(CORRUPT_KEY, raw);
  } catch {
    /* место в localStorage уже занято — копию не сохранить */
  }
}

export function readState() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const migrated = migrate(parsed);
    validateState(migrated);
    return migrated;
  } catch (error) {
    console.error('Не удалось прочитать данные, сохраняю повреждённую копию', error);
    backupCorrupt(raw);
    return null;
  }
}

export function saveState(state) {
  try {
    validateState(state);
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error('Не удалось сохранить данные в localStorage', error);
    return false;
  }
}

export function loadState() {
  const stored = readState();
  if (stored) {
    // readState() уже привёл данные к текущей схеме; фиксируем миграцию,
    // чтобы при следующем запуске не выполнять её повторно.
    saveState(stored);
    return stored;
  }

  const seeded = createSeedState();
  saveState(seeded);
  return seeded;
}

/**
 * Метаданные устройства: дата последней копии и подобное.
 * Хранятся отдельно от состояния и не попадают в экспорт.
 */
export function readMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function writeMeta(patch) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ ...readMeta(), ...patch }));
    return true;
  } catch (error) {
    console.warn('Не удалось сохранить метаданные копии', error);
    return false;
  }
}

export function clearMeta() {
  try {
    localStorage.removeItem(META_KEY);
  } catch {
    /* приватный режим или переполненное хранилище */
  }
}

export function markExported(date = new Date()) {
  return writeMeta({ lastExportAt: date.toISOString() });
}

export function downloadState(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `finance-${todayISO()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * На Android открывает системное меню «Поделиться» с JSON-файлом.
 * Если файлы не поддерживаются, скачивает копию обычным способом.
 */
export async function shareState(state) {
  const fileName = `finance-${todayISO()}.json`;
  const json = JSON.stringify(state, null, 2);

  if (typeof File === 'function' && typeof navigator.share === 'function') {
    try {
      const file = new File([json], fileName, { type: 'application/json' });
      const canShare = typeof navigator.canShare !== 'function'
        || navigator.canShare({ files: [file] });
      if (canShare) {
        await navigator.share({ files: [file], title: 'Резервная копия финансов' });
        return 'shared';
      }
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
      console.warn('Не удалось поделиться копией, скачиваю файл', error);
    }
  }

  downloadState(state);
  return 'downloaded';
}

export async function parseImportFile(file) {
  if (!file || typeof file.text !== 'function') {
    fail('INVALID_STATE', 'Файл не выбран.');
  }
  if (Number.isFinite(file.size) && file.size > MAX_IMPORT_BYTES) {
    fail('IMPORT_TOO_LARGE', 'Файл импорта слишком большой.');
  }

  let text;
  try {
    text = await file.text();
  } catch (error) {
    fail('PARSE_ERROR', 'Не удалось прочитать файл.', error);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail('PARSE_ERROR', 'Файл не является корректным JSON.', error);
  }

  const migrated = migrate(parsed);
  validateState(migrated);
  return migrated;
}
