import { newId } from '../util.js';
import {
  assert,
  isISODate,
  isISODateTime,
  isNonEmptyString,
  isPlainObject,
  isSafeMinor,
} from './validation.js';

export const PLANNED_PAYMENT_TYPES = ['expense', 'income'];
export const RECURRENCE_TYPES = ['none', 'monthly', 'yearly'];

const TYPE_SET = new Set(PLANNED_PAYMENT_TYPES);
const RECURRENCE_SET = new Set(RECURRENCE_TYPES);

/** День месяца из YYYY-MM-DD — якорь серии по умолчанию. */
export function anchorDayFor(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return Number(date.slice(8, 10));
}

/**
 * Плановый платёж: шаблон разового или повторяющегося расхода/дохода.
 * Вхождения не хранятся здесь — они генерируются на чтение из правила.
 */
export class PlannedPayment {
  constructor(data = {}) {
    assert(isPlainObject(data), 'plannedPayment', '', 'Платёж должен быть объектом.');

    this.id = data.id;
    this.type = data.type;
    this.amount = data.amount;
    this.accountId = data.accountId;
    this.categoryId = data.categoryId ?? null;
    this.note = typeof data.note === 'string' ? data.note.trim() : data.note;
    this.startDate = data.startDate;
    this.recurrence = data.recurrence;
    this.endDate = data.endDate ?? null;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    // Поля схемы v4. anchorDay — настоящий день повторения, startDate — только
    // первое вхождение; пока его использует только будущее правило серии.
    this.obligationId = data.obligationId ?? null;
    this.archived = data.archived ?? false;
    this.anchorDay = data.anchorDay ?? anchorDayFor(data.startDate);

    this.validate();
  }

  static create(input = {}, { id = newId(), now = new Date().toISOString() } = {}) {
    const recurrence = input.recurrence ?? 'none';
    return new PlannedPayment({
      ...input,
      id,
      type: input.type,
      amount: input.amount,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      note: input.note ?? '',
      startDate: input.startDate,
      recurrence,
      endDate: recurrence === 'none' ? null : (input.endDate ?? null),
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
      obligationId: input.obligationId ?? null,
      archived: input.archived ?? false,
      anchorDay: input.anchorDay ?? anchorDayFor(input.startDate),
    });
  }

  static fromJSON(raw) {
    return new PlannedPayment(raw);
  }

  validate() {
    assert(isNonEmptyString(this.id), 'plannedPayment', 'id', 'У платежа должен быть id.');
    assert(TYPE_SET.has(this.type), 'plannedPayment', 'type', 'Неизвестный тип платежа.');
    assert(
      isSafeMinor(this.amount),
      'plannedPayment',
      'amount',
      'Сумма платежа должна быть целым числом копеек больше нуля.',
    );
    assert(
      isNonEmptyString(this.accountId),
      'plannedPayment',
      'accountId',
      'Не выбран счёт платежа.',
    );
    assert(
      this.categoryId === null || isNonEmptyString(this.categoryId),
      'plannedPayment',
      'categoryId',
      'Некорректная категория платежа.',
    );
    assert(
      this.obligationId === null || isNonEmptyString(this.obligationId),
      'plannedPayment',
      'obligationId',
      'Некорректная ссылка на обязательство.',
    );
    assert(
      typeof this.note === 'string',
      'plannedPayment',
      'note',
      'Заметка должна быть строкой.',
    );
    assert(
      isISODate(this.startDate),
      'plannedPayment',
      'startDate',
      'Дата платежа должна быть в формате YYYY-MM-DD.',
    );
    assert(
      Number.isInteger(this.anchorDay) && this.anchorDay >= 1 && this.anchorDay <= 31,
      'plannedPayment',
      'anchorDay',
      'День повторения должен быть числом от 1 до 31.',
    );
    assert(
      RECURRENCE_SET.has(this.recurrence),
      'plannedPayment',
      'recurrence',
      'Неизвестное правило повторения.',
    );
    assert(
      this.endDate === null || isISODate(this.endDate),
      'plannedPayment',
      'endDate',
      'Дата окончания должна быть в формате YYYY-MM-DD.',
    );
    if (this.endDate !== null) {
      assert(
        this.endDate >= this.startDate,
        'plannedPayment',
        'endDate',
        'Дата окончания не может быть раньше даты начала.',
      );
    }
    assert(
      this.recurrence !== 'none' || this.endDate === null,
      'plannedPayment',
      'endDate',
      'У разового платежа не может быть даты окончания.',
    );
    assert(
      isISODateTime(this.createdAt),
      'plannedPayment',
      'createdAt',
      'Некорректная дата создания платежа.',
    );
    assert(
      isISODateTime(this.updatedAt),
      'plannedPayment',
      'updatedAt',
      'Некорректная дата изменения платежа.',
    );
    assert(
      typeof this.archived === 'boolean',
      'plannedPayment',
      'archived',
      'Признак архива платежа должен быть boolean.',
    );
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      amount: this.amount,
      accountId: this.accountId,
      categoryId: this.categoryId,
      note: this.note,
      startDate: this.startDate,
      recurrence: this.recurrence,
      endDate: this.endDate,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      obligationId: this.obligationId,
      archived: this.archived,
      anchorDay: this.anchorDay,
    };
  }
}
