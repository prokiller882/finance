import { newId } from '../util.js';
import {
  assert,
  isISODate,
  isISODateTime,
  isNonEmptyString,
  isPlainObject,
  isSafeMinor,
} from './validation.js';

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer'];

const TYPE_SET = new Set(TRANSACTION_TYPES);

/**
 * Доменная модель операции. В state и localStorage хранится результат toJSON(),
 * то есть обычный объект: store.commit() использует structuredClone.
 */
export class Transaction {
  constructor(data = {}) {
    assert(isPlainObject(data), 'transaction', '', 'Операция должна быть объектом.');

    this.id = data.id;
    this.type = data.type;
    this.amount = data.amount;
    this.accountId = data.accountId;
    this.toAccountId = data.toAccountId ?? null;
    this.categoryId = data.categoryId ?? null;
    this.note = typeof data.note === 'string' ? data.note.trim() : data.note;
    this.date = data.date;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    // Поля схемы v4: разбивка платежа по обязательству, источник
    // сгенерированного перевода и норма сбережений. Значения по умолчанию
    // null — семантику добавят эпики 2–5.
    this.obligationId = data.obligationId ?? null;
    this.principal = data.principal ?? null;
    this.interest = data.interest ?? null;
    this.sourceTransactionId = data.sourceTransactionId ?? null;
    this.savingsRateBp = data.savingsRateBp ?? null;
    this.skipSavings = data.skipSavings ?? null;

    this.validate();
  }

  static create(input = {}, { id = newId(), now = new Date().toISOString() } = {}) {
    return new Transaction({
      ...input,
      id,
      toAccountId: input.type === 'transfer' ? (input.toAccountId ?? null) : null,
      categoryId: input.type === 'transfer' ? null : (input.categoryId ?? null),
      note: input.note ?? '',
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
      obligationId: input.obligationId ?? null,
      principal: input.principal ?? null,
      interest: input.interest ?? null,
      sourceTransactionId: input.sourceTransactionId ?? null,
      savingsRateBp: input.savingsRateBp ?? null,
      skipSavings: input.skipSavings ?? null,
    });
  }

  static fromJSON(raw) {
    return new Transaction(raw);
  }

  validate() {
    assert(isNonEmptyString(this.id), 'transaction', 'id', 'У операции должен быть id.');
    assert(TYPE_SET.has(this.type), 'transaction', 'type', 'Неизвестный тип операции.');
    assert(
      isSafeMinor(this.amount),
      'transaction',
      'amount',
      'Сумма должна быть целым числом копеек больше нуля.',
    );
    assert(isNonEmptyString(this.accountId), 'transaction', 'accountId', 'Не выбран счёт операции.');

    if (this.type === 'transfer') {
      assert(
        isNonEmptyString(this.toAccountId),
        'transaction',
        'toAccountId',
        'Для перевода нужен счёт получателя.',
      );
      assert(
        this.toAccountId !== this.accountId,
        'transaction',
        'toAccountId',
        'Счета перевода должны различаться.',
      );
      assert(
        this.categoryId === null,
        'transaction',
        'categoryId',
        'У перевода не может быть категории.',
      );
    } else {
      assert(
        this.toAccountId === null,
        'transaction',
        'toAccountId',
        'Счёт получателя указывается только для перевода.',
      );
      assert(
        this.categoryId === null || isNonEmptyString(this.categoryId),
        'transaction',
        'categoryId',
        'Некорректная категория операции.',
      );
    }

    assert(
      isISODate(this.date),
      'transaction',
      'date',
      'Дата операции должна быть в формате YYYY-MM-DD.',
    );
    assert(
      typeof this.note === 'string',
      'transaction',
      'note',
      'Заметка должна быть строкой.',
    );
    assert(
      isISODateTime(this.createdAt),
      'transaction',
      'createdAt',
      'Некорректная дата создания операции.',
    );
    assert(
      isISODateTime(this.updatedAt),
      'transaction',
      'updatedAt',
      'Некорректная дата изменения операции.',
    );
    assert(
      this.obligationId === null || isNonEmptyString(this.obligationId),
      'transaction',
      'obligationId',
      'Некорректная ссылка на обязательство.',
    );
    assert(
      this.principal === null || Number.isSafeInteger(this.principal),
      'transaction',
      'principal',
      'Доля основного долга должна быть целым числом копеек или null.',
    );
    assert(
      this.interest === null || (Number.isSafeInteger(this.interest) && this.interest >= 0),
      'transaction',
      'interest',
      'Проценты должны быть неотрицательным целым числом копеек или null.',
    );
    assert(
      this.sourceTransactionId === null || isNonEmptyString(this.sourceTransactionId),
      'transaction',
      'sourceTransactionId',
      'Некорректная ссылка на операцию-источник.',
    );
    assert(
      this.savingsRateBp === null
        || (Number.isSafeInteger(this.savingsRateBp)
          && this.savingsRateBp >= 0
          && this.savingsRateBp <= 10000),
      'transaction',
      'savingsRateBp',
      'Норма сбережений должна быть целым числом от 0 до 10000 или null.',
    );
    assert(
      this.skipSavings === null || typeof this.skipSavings === 'boolean',
      'transaction',
      'skipSavings',
      'Признак отказа от сбережений должен быть boolean или null.',
    );
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      amount: this.amount,
      accountId: this.accountId,
      toAccountId: this.toAccountId,
      categoryId: this.categoryId,
      note: this.note,
      date: this.date,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      obligationId: this.obligationId,
      principal: this.principal,
      interest: this.interest,
      sourceTransactionId: this.sourceTransactionId,
      savingsRateBp: this.savingsRateBp,
      skipSavings: this.skipSavings,
    };
  }
}
