import { isMonthKey, monthKey } from './format.js';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function parts(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}

function isoFromParts(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function clampDay(year, month, day) {
  return Math.min(day, daysInMonth(year, month));
}

/**
 * Начало серии повторяющегося платежа. Вхождения раньше месяца создания
 * не генерируются: иначе старый startDate дал бы десятки просрочек.
 */
export function seriesStartDate(plan) {
  if (plan.recurrence === 'none') return plan.startDate;

  const created = new Date(plan.createdAt ?? '');
  const createdMonth = Number.isNaN(created.getTime())
    ? String(plan.createdAt ?? '').slice(0, 7)
    : monthKey(created);
  if (!isMonthKey(createdMonth)) return plan.startDate;

  const createdMonthStart = `${createdMonth}-01`;
  return plan.startDate > createdMonthStart ? plan.startDate : createdMonthStart;
}

/** Попадает ли дата в серию платежа с учётом повторения и границ. */
export function occursOn(plan, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) return false;
  if (date < seriesStartDate(plan)) return false;
  if (plan.endDate && date > plan.endDate) return false;

  if (plan.recurrence === 'none') return date === plan.startDate;

  const target = parts(date);
  const start = parts(plan.startDate);

  if (plan.recurrence === 'monthly') {
    return target.day === clampDay(target.year, target.month, start.day);
  }

  if (plan.recurrence === 'yearly') {
    return target.month === start.month
      && target.day === clampDay(target.year, start.month, start.day);
  }

  return false;
}

/** Даты вхождений плана в диапазоне from..to включительно. */
export function plannedDatesInRange(plan, from, to) {
  const seriesStart = seriesStartDate(plan);
  const rangeStart = from > seriesStart ? from : seriesStart;
  const rangeEnd = plan.endDate && plan.endDate < to ? plan.endDate : to;
  if (rangeStart > rangeEnd) return [];

  if (plan.recurrence === 'none') {
    return plan.startDate >= rangeStart && plan.startDate <= rangeEnd ? [plan.startDate] : [];
  }

  const start = parts(rangeStart);
  const end = parts(rangeEnd);
  const planStart = parts(plan.startDate);
  const dates = [];

  if (plan.recurrence === 'monthly') {
    let year = start.year;
    let month = start.month;

    while (year < end.year || (year === end.year && month <= end.month)) {
      const date = isoFromParts(year, month, clampDay(year, month, planStart.day));
      if (date >= rangeStart && date <= rangeEnd) dates.push(date);

      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }

    return dates;
  }

  if (plan.recurrence === 'yearly') {
    for (let year = start.year; year <= end.year; year += 1) {
      const date = isoFromParts(year, planStart.month, clampDay(year, planStart.month, planStart.day));
      if (date >= rangeStart && date <= rangeEnd) dates.push(date);
    }
    return dates;
  }

  return [];
}

/** Все ISO-даты месяца для сетки календаря. */
export function datesInMonth(month) {
  if (!isMonthKey(month)) return [];
  const [year, monthNumber] = month.split('-').map(Number);
  const count = daysInMonth(year, monthNumber);
  return Array.from({ length: count }, (_, index) => (
    `${month}-${pad2(index + 1)}`
  ));
}

export function occurrenceKey(planId, date) {
  return `${planId}:${date}`;
}
