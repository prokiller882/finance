import { newId } from '../util.js';
import {
  assert,
  isNonEmptyString,
  isPlainObject,
  isSafeMinor,
} from './validation.js';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Месячный бюджет на расходную категорию.
 * period — 'YYYY-MM'; уникальность пары categoryId + period проверяет storage.
 */
export class Budget {
  constructor(data = {}) {
    assert(isPlainObject(data), 'budget', '', 'Бюджет должен быть объектом.');

    this.id = data.id;
    this.categoryId = data.categoryId;
    this.amount = data.amount;
    this.period = data.period;

    this.validate();
  }

  static create(input = {}, { id = newId() } = {}) {
    return new Budget({ ...input, id });
  }

  static fromJSON(raw) {
    return new Budget(raw);
  }

  validate() {
    assert(isNonEmptyString(this.id), 'budget', 'id', 'У бюджета должен быть id.');
    assert(
      isNonEmptyString(this.categoryId),
      'budget',
      'categoryId',
      'Не выбрана категория бюджета.',
    );
    assert(
      isSafeMinor(this.amount),
      'budget',
      'amount',
      'Сумма бюджета должна быть целым числом копеек больше нуля.',
    );
    assert(
      typeof this.period === 'string' && PERIOD_RE.test(this.period),
      'budget',
      'period',
      'Период бюджета должен быть в формате YYYY-MM.',
    );
  }

  toJSON() {
    return {
      id: this.id,
      categoryId: this.categoryId,
      amount: this.amount,
      period: this.period,
    };
  }
}
