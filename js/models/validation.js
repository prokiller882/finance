export class ValidationError extends Error {
  constructor(entity, field, message) {
    super(message);
    this.name = 'ValidationError';
    this.entity = entity;
    this.field = field;
  }
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isSafeMinor(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Строгая проверка даты YYYY-MM-DD без UTC-сдвига. */
export function isISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12) return false;

  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

export function isISODateTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function assert(condition, entity, field, message) {
  if (!condition) throw new ValidationError(entity, field, message);
}
