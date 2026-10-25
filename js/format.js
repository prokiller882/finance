const MONTH_FORMAT = new Intl.DateTimeFormat('ru-RU', { month: 'long' });
const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** '1250,50' | '1 250.5' → 125050 (копейки). Невалидное → null. */
export function parseAmount(raw, { allowZero = false } = {}) {
  const text = String(raw ?? '').trim();
  if (!text || /[-−]/.test(text)) return null;

  const normalized = text.replace(/\s+/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const minor = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(minor) && (allowZero ? minor >= 0 : minor > 0) ? minor : null;
}

export function formatMoney(minor, currency = 'RUB') {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format((minor || 0) / 100);
  } catch {
    return `${((minor || 0) / 100).toFixed(2)} ${currency}`;
  }
}

/** Копейки → строка для поля ввода суммы: 125050 → '1250,50'. */
export function formatAmountInput(minor) {
  const safe = Number.isSafeInteger(minor) ? minor : 0;
  return (safe / 100).toFixed(2).replace('.', ',');
}

export function toISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseISO(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayISO() {
  return toISO(new Date());
}

/** Ключ месяца в локальном времени: 'YYYY-MM'. */
export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function isMonthKey(value) {
  return MONTH_KEY_RE.test(String(value ?? ''));
}

/** '2026-10-22' → '2026-10'; невалидная дата → текущий месяц. */
export function monthKeyFromISO(iso) {
  const key = String(iso ?? '').slice(0, 7);
  return isMonthKey(key) ? key : monthKey();
}

/** Первое число месяца. Невалидный ключ → текущий месяц. */
export function monthFromKey(key) {
  const safeKey = isMonthKey(key) ? key : monthKey();
  const [year, month] = safeKey.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

export function shiftMonthKey(key, delta) {
  const date = monthFromKey(key);
  date.setMonth(date.getMonth() + delta);
  return monthKey(date);
}

/** Диапазон и подпись конкретного месяца без UTC-сдвигов. */
export function monthRange(key) {
  return rangeFor('month', monthFromKey(key));
}

/** ISO-даты сравниваются лексикографически — Date для фильтра не нужен. */
export function isInRange(iso, from, to) {
  return iso >= from && iso <= to;
}

export function formatDateNumeric(iso) {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

export function formatDateShort(iso) {
  const date = parseISO(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const options = sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat('ru-RU', options).format(date).replace('.', '');
}

export function rangeFor(kind, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();

  if (kind === 'month') {
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 0);
    return {
      from: toISO(from),
      to: toISO(to),
      label: `${capitalize(MONTH_FORMAT.format(from))} ${year}`,
    };
  }

  if (kind === 'quarter') {
    const startMonth = Math.floor(month / 3) * 3;
    return {
      from: toISO(new Date(year, startMonth, 1)),
      to: toISO(new Date(year, startMonth + 3, 0)),
      label: `${Math.floor(month / 3) + 1} квартал ${year}`,
    };
  }

  if (kind === 'year') {
    return { from: `${year}-01-01`, to: `${year}-12-31`, label: String(year) };
  }

  throw new Error(`Неизвестный период: ${kind}`);
}

export function customRange(from, to) {
  const [start, end] = from <= to ? [from, to] : [to, from];
  return {
    from: start,
    to: end,
    label: `${formatDateNumeric(start)} — ${formatDateNumeric(end)}`,
  };
}
