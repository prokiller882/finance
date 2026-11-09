import { newId } from '../util.js';
import {
  assert,
  isISODate,
  isISODateTime,
  isNonEmptyString,
  isPlainObject,
} from './validation.js';

export const OCCURRENCE_STATUSES = ['paid', 'skipped'];

const STATUS_SET = new Set(OCCURRENCE_STATUSES);

/**
 * Отклонение от серии платежа: оплаченное или пропущенное вхождение.
 * Ожидаемые вхождения не хранятся — они генерируются из PlannedPayment.
 */
export class PaymentOccurrence {
  constructor(data = {}) {
    assert(isPlainObject(data), 'paymentOccurrence', '', 'Вхождение платежа должно быть объектом.');

    this.id = data.id;
    this.planId = data.planId;
    this.date = data.date;
    this.status = data.status;
    this.transactionId = data.transactionId ?? null;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;

    this.validate();
  }

  static create(input = {}, { id = newId(), now = new Date().toISOString() } = {}) {
    return new PaymentOccurrence({
      ...input,
      id,
      transactionId: input.status === 'paid' ? (input.transactionId ?? null) : null,
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
    });
  }

  static fromJSON(raw) {
    return new PaymentOccurrence(raw);
  }

  validate() {
    assert(isNonEmptyString(this.id), 'paymentOccurrence', 'id', 'У вхождения должен быть id.');
    assert(
      isNonEmptyString(this.planId),
      'paymentOccurrence',
      'planId',
      'Не указан плановый платёж.',
    );
    assert(
      isISODate(this.date),
      'paymentOccurrence',
      'date',
      'Дата вхождения должна быть в формате YYYY-MM-DD.',
    );
    assert(
      STATUS_SET.has(this.status),
      'paymentOccurrence',
      'status',
      'Неизвестный статус вхождения.',
    );

    if (this.status === 'paid') {
      assert(
        isNonEmptyString(this.transactionId),
        'paymentOccurrence',
        'transactionId',
        'Для оплаченного вхождения нужна операция.',
      );
    } else {
      assert(
        this.transactionId === null,
        'paymentOccurrence',
        'transactionId',
        'У пропущенного вхождения не может быть операции.',
      );
    }

    assert(
      isISODateTime(this.createdAt),
      'paymentOccurrence',
      'createdAt',
      'Некорректная дата создания вхождения.',
    );
    assert(
      isISODateTime(this.updatedAt),
      'paymentOccurrence',
      'updatedAt',
      'Некорректная дата изменения вхождения.',
    );
  }

  toJSON() {
    return {
      id: this.id,
      planId: this.planId,
      date: this.date,
      status: this.status,
      transactionId: this.transactionId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
