export const ACCOUNT_KIND_LABELS = {
  cash: 'Наличные',
  card: 'Карта',
  bank: 'Банковский счёт',
  savings: 'Накопления',
};

export const ACCOUNT_KINDS = Object.entries(ACCOUNT_KIND_LABELS).map(([value, label]) => ({ value, label }));

// Подпись счёта не дублирует название, если тип совпадает: «Наличные / Наличные» → «Наличные».
export function accountSubtitle(account) {
  const kind = ACCOUNT_KIND_LABELS[account.kind] || account.kind;
  const parts = [];
  if (kind && kind.toLowerCase() !== String(account.name || '').trim().toLowerCase()) parts.push(kind);
  if (account.archived) parts.push('в архиве');
  return parts.join(' · ');
}

export function operationsCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  let word = 'операций';
  if (mod10 === 1 && mod100 !== 11) word = 'операция';
  else if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) word = 'операции';
  return `${count} ${word}`;
}

export function paymentsCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  let word = 'платежей';
  if (mod10 === 1 && mod100 !== 11) word = 'платёж';
  else if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) word = 'платежа';
  return `${count} ${word}`;
}

export const RECURRENCE_LABELS = {
  none: 'Не повторять',
  monthly: 'Ежемесячно',
  yearly: 'Ежегодно',
};

export const PAYMENT_STATUS_LABELS = {
  overdue: 'Просрочено',
  today: 'Сегодня',
  upcoming: 'Ожидается',
  paid: 'Оплачено',
  skipped: 'Пропущено',
};

export const TX_TYPE_LABELS = {
  expense: 'Расход',
  income: 'Доход',
  transfer: 'Перевод',
};
