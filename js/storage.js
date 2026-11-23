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
  anchorDayFor,
  categoryColorFor,
  isISODateTime,
  isNonEmptyString,
  isPlainObject,
} from './models/index.js';

export { SCHEMA_VERSION };

export const KEY = 'finance-tracker:v1';
export const PRE_V4_KEY = 'finance-tracker:pre-v4';
const META_KEY = 'finance-tracker:meta';
const CORRUPT_KEY = 'finance-tracker:corrupt';
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const CURRENCY_SET = new Set(['RUB', 'USD', 'EUR', 'KZT', 'BYN']);
const THEME_SET = new Set(['system', 'light', 'dark']);
const ACCOUNT_KIND_SET = new Set(['cash', 'card', 'bank', 'savings']);
const RATE_BP_MAX = 10000;

const isBoolean = (value) => typeof value === 'boolean';
const isNullableString = (value) => value === null || isNonEmptyString(value);
const isNullableBoolean = (value) => value === null || isBoolean(value);
const isRateBp = (value) => Number.isSafeInteger(value) && value >= 0 && value <= RATE_BP_MAX;
const isNullableRateBp = (value) => value === null || isRateBp(value);
const isNullableMinor = (value) => value === null
  || (Number.isSafeInteger(value) && value >= 0);
const isNullableSignedMinor = (value) => value === null || Number.isSafeInteger(value);
const isAnchorDay = (value) => Number.isInteger(value) && value >= 1 && value <= 31;

/**
 * Поля схемы v4 и их умолчания. Значение неверной формы заменяется
 * умолчанием, а путь и причина попадают в `warnings[]`: так миграция
 * не теряет данные молча и не падает на чужом поле с тем же именем.
 */
const V4_ACCOUNT_FIELDS = {
  savingsRateBp: {
    default: 0,
    valid: isRateBp,
    expected: 'целое число от 0 до 10000',
  },
};

const V4_CATEGORY_FIELDS = {
  system: {
    default: false,
    valid: isBoolean,
    expected: 'true или false',
  },
  mark: {
    default: null,
    valid: isNullableString,
    expected: 'строка или null',
  },
};

const V4_TRANSACTION_FIELDS = {
  obligationId: {
    default: null,
    valid: isNullableString,
    expected: 'строка или null',
  },
  principal: {
    default: null,
    valid: isNullableSignedMinor,
    expected: 'целое число копеек или null',
  },
  interest: {
    default: null,
    valid: isNullableMinor,
    expected: 'неотрицательное целое число копеек или null',
  },
  sourceTransactionId: {
    default: null,
    valid: isNullableString,
    expected: 'строка или null',
  },
  savingsRateBp: {
    default: null,
    valid: isNullableRateBp,
    expected: 'целое число от 0 до 10000 или null',
  },
  skipSavings: {
    default: null,
    valid: isNullableBoolean,
    expected: 'true, false или null',
  },
};

const V4_PLAN_FIELDS = {
  obligationId: {
    default: null,
    valid: isNullableString,
    expected: 'строка или null',
  },
  archived: {
    default: false,
    valid: isBoolean,
    expected: 'true или false',
  },
  anchorDay: {
    default: null,
    valid: isAnchorDay,
    expected: 'число от 1 до 31',
  },
};

const V4_OBLIGATION_FIELDS = {
  archived: {
    default: false,
    valid: isBoolean,
    expected: 'true или false',
  },
};

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

/** Заполняет поля v4, сохраняя неизвестные ключи сущности. */
function applyV4Fields(source, fields, path, warnings, defaults = {}) {
  const next = { ...source };

  for (const [field, rule] of Object.entries(fields)) {
    const fallback = Object.prototype.hasOwnProperty.call(defaults, field)
      ? defaults[field]
      : rule.default;

    if (next[field] === undefined) {
      next[field] = fallback;
      continue;
    }

    if (!rule.valid(next[field])) {
      warnings.push({
        path: `${path}.${field}`,
        message: `Неожиданное значение: ожидалось ${rule.expected}. Подставлено значение по умолчанию.`,
      });
      next[field] = fallback;
    }
  }

  return next;
}

/** Раздел v4, которого не было в старых схемах: отсутствие — это пустой список. */
function v4Array(value, path, warnings) {
  if (Array.isArray(value)) return value;
  if (value !== undefined && value !== null) {
    warnings.push({
      path,
      message: 'Раздел должен быть массивом. Подставлен пустой список.',
    });
  }
  return [];
}

/**
 * Приводит данные к текущей схеме. Миграция намеренно не проверяет ссылки:
 * это делает validateState(), чтобы повреждённый файл не был принят частично.
 * Неизвестные поля и верхнеуровневые ключи сохраняются как есть.
 * @returns {{ state: object, warnings: Array<{ path: string, message: string }> }}
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

  const warnings = [];
  const now = new Date().toISOString();
  const settings = isPlainObject(data.settings) ? data.settings : {};
  const updatedAt = isISODateTime(data.updatedAt) ? data.updatedAt : now;

  const state = {
    // Неизвестные верхнеуровневые ключи переживают миграцию и экспорт.
    ...data,
    schemaVersion: SCHEMA_VERSION,
    // Старые экспорты не знают о ревизии; отсутствие — это 0.
    // Невалидное значение не подменяем, чтобы validateState его показал.
    rev: data.rev ?? 0,
    updatedAt,
    settings: {
      ...settings,
      currency: settings.currency ?? 'RUB',
      theme: settings.theme ?? 'system',
    },
    accounts: data.accounts.map((account, index) => {
      const source = isPlainObject(account) ? account : {};
      const next = {
        ...source,
        archived: source.archived ?? false,
        openingBalance: source.openingBalance ?? 0,
        kind: source.kind ?? 'cash',
        name: typeof source.name === 'string' ? source.name.trim() : source.name,
      };
      return applyV4Fields(next, V4_ACCOUNT_FIELDS, `accounts[${index}]`, warnings);
    }),
    categories: data.categories.map((category, index) => {
      const source = isPlainObject(category) ? category : {};
      const next = {
        ...source,
        name: typeof source.name === 'string' ? source.name.trim() : source.name,
        color: source.color || categoryColorFor(source.name || ''),
        icon: source.icon || DEFAULT_CATEGORY_ICON,
      };
      return applyV4Fields(next, V4_CATEGORY_FIELDS, `categories[${index}]`, warnings);
    }),
    transactions: data.transactions.map((transaction, index) => {
      const source = isPlainObject(transaction) ? transaction : {};
      const createdAt = source.createdAt || source.updatedAt || updatedAt;
      const next = {
        ...source,
        note: typeof source.note === 'string' ? source.note.trim() : (source.note ?? ''),
        toAccountId: source.toAccountId ?? null,
        categoryId: source.categoryId ?? null,
        createdAt,
        updatedAt: source.updatedAt || createdAt,
      };
      return applyV4Fields(next, V4_TRANSACTION_FIELDS, `transactions[${index}]`, warnings);
    }),
    budgets: (Array.isArray(data.budgets) ? data.budgets : []).map((budget) => (
      isPlainObject(budget) ? { ...budget } : {}
    )),
    plannedPayments: (Array.isArray(data.plannedPayments) ? data.plannedPayments : []).map((plan, index) => {
      const source = isPlainObject(plan) ? plan : {};
      const recurrence = source.recurrence ?? 'none';
      const createdAt = source.createdAt || source.updatedAt || updatedAt;
      const next = {
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
      return applyV4Fields(next, V4_PLAN_FIELDS, `plannedPayments[${index}]`, warnings, {
        anchorDay: anchorDayFor(next.startDate),
      });
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
    obligations: v4Array(data.obligations, 'obligations', warnings).map((obligation, index) => {
      if (!isPlainObject(obligation)) {
        warnings.push({
          path: `obligations[${index}]`,
          message: 'Обязательство должно быть объектом. Подставлена пустая запись.',
        });
      }
      const source = isPlainObject(obligation) ? obligation : {};
      return applyV4Fields(source, V4_OBLIGATION_FIELDS, `obligations[${index}]`, warnings);
    }),
    obligationAdjustments: v4Array(
      data.obligationAdjustments,
      'obligationAdjustments',
      warnings,
    ).map((adjustment, index) => {
      if (!isPlainObject(adjustment)) {
        warnings.push({
          path: `obligationAdjustments[${index}]`,
          message: 'Корректировка обязательства должна быть объектом. Подставлена пустая запись.',
        });
      }
      return isPlainObject(adjustment) ? { ...adjustment } : {};
    }),
  };

  return { state, warnings };
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
  if (!Number.isSafeInteger(state.rev) || state.rev < 0) {
    addError('rev', 'Номер ревизии должен быть неотрицательным целым числом.');
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
      if (!isRateBp(account.savingsRateBp)) {
        addError(`${path}.savingsRateBp`, 'Норма сбережений должна быть целым числом от 0 до 10000.');
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

  if (!Array.isArray(state.obligations)) {
    addError('obligations', 'Раздел обязательств должен быть массивом.');
  } else {
    state.obligations.forEach((obligation, index) => {
      const path = `obligations[${index}]`;
      if (!isPlainObject(obligation)) {
        addError(path, 'Обязательство должно быть объектом.');
      } else if (typeof obligation.archived !== 'boolean') {
        addError(`${path}.archived`, 'Признак архива обязательства должен быть boolean.');
      }
    });
  }

  if (!Array.isArray(state.obligationAdjustments)) {
    addError('obligationAdjustments', 'Раздел корректировок обязательств должен быть массивом.');
  } else {
    state.obligationAdjustments.forEach((adjustment, index) => {
      if (!isPlainObject(adjustment)) {
        addError(`obligationAdjustments[${index}]`, 'Корректировка обязательства должна быть объектом.');
      }
    });
  }

  if (errors.length) {
    fail('INVALID_STATE', `Данные не прошли проверку: ${errors[0].message}`, errors);
  }

  return true;
}

/**
 * Страховочная копия повреждённых данных. Хранится первая копия: повторная
 * запись ничего не доказывает, а место в localStorage занимает.
 */
function backupCorrupt(raw) {
  if (typeof raw !== 'string') return;
  try {
    if (localStorage.getItem(CORRUPT_KEY) !== null) return;
    localStorage.setItem(CORRUPT_KEY, raw);
  } catch {
    /* место в localStorage уже занято — копию не сохранить */
  }
}

/**
 * Читает состояние и сообщает, что с ним на самом деле.
 * `forward` определяется по `schemaVersion` до миграции, поэтому более новая
 * копия никогда не попадает в миграцию и не переписывается.
 * `sourceVersion` — версия исходного файла, `warnings` — поля v4, которые
 * пришлось заменить умолчаниями.
 * @returns {{ status: 'empty' | 'ok' | 'forward' | 'corrupt', state?: object, raw?: string | null, version?: number | null, sourceVersion?: number | null, warnings?: Array<{ path: string, message: string }> }}
 */
export function readState() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch (error) {
    // Ошибка чтения — это не «пусто»: иначе старт посеял бы seed поверх данных.
    console.error('Не удалось прочитать данные из localStorage', error);
    return { status: 'corrupt', raw: null, version: null, sourceVersion: null };
  }

  if (raw === null) return { status: 'empty', raw: null, version: null, sourceVersion: null };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error('Не удалось разобрать данные, сохраняю повреждённую копию', error);
    backupCorrupt(raw);
    return { status: 'corrupt', raw, version: null, sourceVersion: null };
  }

  const hasVersion = isPlainObject(parsed)
    && Object.prototype.hasOwnProperty.call(parsed, 'schemaVersion');
  const version = hasVersion ? parsed.schemaVersion : null;

  // Версия выше текущей — данные новее приложения. Проверка идёт до миграции.
  if (Number.isInteger(version) && version > SCHEMA_VERSION) {
    return { status: 'forward', raw, version, sourceVersion: version };
  }

  // Версия указана, но не целым числом: такой файл не мог создать сам трекер.
  if (hasVersion && !Number.isInteger(version)) {
    console.error('Некорректный номер версии схемы данных');
    backupCorrupt(raw);
    return { status: 'corrupt', raw, version: null, sourceVersion: null };
  }

  try {
    const { state, warnings } = migrate(parsed);
    validateState(state);
    return {
      status: 'ok',
      state,
      raw,
      version: state.schemaVersion,
      // Отсутствие версии исторически означает v1.
      sourceVersion: Number.isInteger(version) ? version : 1,
      warnings,
    };
  } catch (error) {
    console.error('Данные не прошли проверку, сохраняю повреждённую копию', error);
    backupCorrupt(raw);
    return { status: 'corrupt', raw, version: null, sourceVersion: null };
  }
}

/**
 * Ревизия, которая лежит в localStorage. Нечитаемые и нецелые данные
 * считаются отсутствием записи: старая копия не должна блокировать сохранение.
 * @returns {number | null}
 */
export function readStoredRev() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const rev = isPlainObject(parsed) ? parsed.rev : null;
    return Number.isSafeInteger(rev) && rev >= 0 ? rev : null;
  } catch {
    return null;
  }
}

function isQuotaError(error) {
  return error?.name === 'QuotaExceededError'
    || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || error?.code === 22
    || error?.code === 1014;
}

/**
 * Единственная точка записи состояния.
 * @returns {{ ok: true } | { ok: false, reason: 'invalid' | 'quota' }}
 */
export function saveState(state) {
  try {
    validateState(state);
    localStorage.setItem(KEY, JSON.stringify(state));
    return { ok: true };
  } catch (error) {
    console.error('Не удалось сохранить данные в localStorage', error);
    if (isQuotaError(error)) return { ok: false, reason: 'quota' };
    return { ok: false, reason: 'invalid' };
  }
}

/**
 * Создаёт копию данных до схемы v4 перед первой записью v4.
 * Копия никогда не перезаписывается: первая — самая ценная.
 * @returns {'saved' | 'present' | 'skip' | 'no-space'}
 */
function ensurePreV4Copy(raw) {
  if (typeof raw !== 'string') return 'skip';

  try {
    if (localStorage.getItem(PRE_V4_KEY) !== null) return 'present';

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return 'skip';
    }
    if (!isPlainObject(parsed)) return 'skip';

    const hasVersion = Object.prototype.hasOwnProperty.call(parsed, 'schemaVersion');
    const version = hasVersion ? parsed.schemaVersion : 1;
    if (!Number.isInteger(version) || version >= SCHEMA_VERSION) return 'skip';

    localStorage.setItem(PRE_V4_KEY, raw);
    return 'saved';
  } catch (error) {
    // Без копии v4 писать нельзя: иначе откат к прежней версии невозможен.
    console.warn('Не удалось сохранить копию данных до обновления', error);
    return 'no-space';
  }
}

/**
 * Стартовое чтение. Seed сеется только при отсутствии ключа: `forward` и
 * `corrupt` не перезаписываются и открывают безопасный режим.
 * На `ok` миграция фиксируется записью, чтобы не выполнять её при каждом старте;
 * перед первой записью v4 сырой файл уходит в `PRE_V4_KEY`.
 * Если копия не помещается, статус `no-space`: живой ключ остаётся прежним.
 */
export function loadState() {
  const boot = readState();

  if (boot.status === 'ok') {
    if (ensurePreV4Copy(boot.raw) === 'no-space') {
      return { ...boot, status: 'no-space' };
    }
    const saved = saveState(boot.state);
    // Копия уже есть, но записать v4 не удалось: живой ключ остаётся прежним,
    // поэтому обычный режим не поднимаем.
    if (!saved.ok) return { ...boot, status: 'no-space' };
    return boot;
  }

  if (boot.status !== 'empty') return boot;

  const seeded = createSeedState();
  // Сбой записи не блокирует старт: приложение работает на состоянии в памяти.
  saveState(seeded);
  return {
    status: 'empty',
    state: seeded,
    raw: null,
    version: seeded.schemaVersion,
    sourceVersion: null,
    warnings: [],
  };
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

function downloadText(text, fileName) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadState(state) {
  downloadText(JSON.stringify(state, null, 2), `finance-${todayISO()}.json`);
}

/**
 * На Android открывает системное меню «Поделиться» с JSON-файлом.
 * Если файлы не поддерживаются, скачивает копию обычным способом.
 * Отмена системного диалога — 'cancelled', без тоста и без даты копии.
 */
async function shareText(text, fileName, title) {
  if (typeof File === 'function' && typeof navigator.share === 'function') {
    try {
      const file = new File([text], fileName, { type: 'application/json' });
      const canShare = typeof navigator.canShare !== 'function'
        || navigator.canShare({ files: [file] });
      if (canShare) {
        await navigator.share({ files: [file], title });
        return 'shared';
      }
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
      console.warn('Не удалось поделиться копией, скачиваю файл', error);
    }
  }

  downloadText(text, fileName);
  return 'downloaded';
}

export async function shareState(state) {
  return shareText(
    JSON.stringify(state, null, 2),
    `finance-${todayISO()}.json`,
    'Резервная копия финансов',
  );
}

/**
 * Выгрузка исходного текста из localStorage — без разбора и миграции.
 * В safe mode это единственный способ не потерять копию более новой версии.
 * @returns {Promise<'shared' | 'downloaded' | 'cancelled' | 'unavailable'>}
 */
export async function shareRaw(raw) {
  if (typeof raw !== 'string') return 'unavailable';
  return shareText(raw, `finance-raw-${todayISO()}.json`, 'Исходные данные финансов');
}

export function hasPreV4Copy() {
  try {
    return localStorage.getItem(PRE_V4_KEY) !== null;
  } catch {
    return false;
  }
}

export function readPreV4Raw() {
  try {
    return localStorage.getItem(PRE_V4_KEY);
  } catch {
    return null;
  }
}

/** Удаляет копию до обновления. Только по явному подтверждению в настройках. */
export function removePreV4Copy() {
  try {
    localStorage.removeItem(PRE_V4_KEY);
    return true;
  } catch (error) {
    console.warn('Не удалось удалить копию данных до обновления', error);
    return false;
  }
}

/**
 * Разбирает и полностью проверяет текст копии до любой записи в хранилище.
 * Необязательный `warnings` собирает предупреждения миграции для показа.
 */
export function parseImportText(text, warnings = null) {
  if (typeof text !== 'string' || !text.trim()) {
    fail('INVALID_STATE', 'Файл пуст.');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail('PARSE_ERROR', 'Файл не является корректным JSON.', error);
  }

  const result = migrate(parsed);
  validateState(result.state);
  if (Array.isArray(warnings)) warnings.push(...result.warnings);
  return result.state;
}

export async function parseImportFile(file, warnings = null) {
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

  return parseImportText(text, warnings);
}
