import { addDaysISO, formatMoney, isInRange, monthRange, todayISO } from './format.js';
import { accountBalance, totalBalance } from './reports/balanceSheet.js';
import { categoryName } from './reports/incomeStatement.js';
import { occurrenceKey, plannedDatesInRange, seriesStartDate } from './recurrence.js';

function indexOccurrences(state) {
  const map = new Map();
  for (const occurrence of state.paymentOccurrences || []) {
    map.set(occurrenceKey(occurrence.planId, occurrence.date), occurrence);
  }
  return map;
}

function indexTransactions(state) {
  return new Map((state.transactions || []).map((transaction) => [transaction.id, transaction]));
}

export function statusForDate(date, today = todayISO()) {
  if (date < today) return 'overdue';
  if (date === today) return 'today';
  return 'upcoming';
}

function buildEntry(plan, date, stored, transactionById, today) {
  const transaction = stored?.status === 'paid'
    ? transactionById.get(stored.transactionId) || null
    : null;

  return {
    planId: plan.id,
    plan,
    date,
    status: stored?.status || statusForDate(date, today),
    transactionId: stored?.transactionId || null,
    transaction,
    // Оплаченное вхождение показывает фактические данные операции.
    type: transaction?.type || plan.type,
    amount: transaction?.amount ?? plan.amount,
    accountId: transaction?.accountId || plan.accountId,
    categoryId: transaction ? transaction.categoryId : plan.categoryId,
    note: transaction ? transaction.note : plan.note,
  };
}

/** Вхождения планов и сохранённые оплаты/пропуски в диапазоне дат. */
export function collectOccurrences(state, from, to, today = todayISO()) {
  if (from > to) return [];

  const storedByKey = indexOccurrences(state);
  const transactionById = indexTransactions(state);
  const planById = new Map((state.plannedPayments || []).map((plan) => [plan.id, plan]));
  const entries = new Map();

  for (const plan of state.plannedPayments || []) {
    for (const date of plannedDatesInRange(plan, from, to)) {
      const key = occurrenceKey(plan.id, date);
      entries.set(key, buildEntry(
        plan,
        date,
        storedByKey.get(key),
        transactionById,
        today,
      ));
    }
  }

  // Оплаченные вхождения остаются в истории даже после изменения графика серии.
  for (const occurrence of state.paymentOccurrences || []) {
    if (!isInRange(occurrence.date, from, to)) continue;
    const key = occurrenceKey(occurrence.planId, occurrence.date);
    if (entries.has(key)) continue;

    const plan = planById.get(occurrence.planId);
    if (!plan) continue;

    entries.set(key, buildEntry(plan, occurrence.date, occurrence, transactionById, today));
  }

  return [...entries.values()].sort((a, b) => (
    a.date.localeCompare(b.date)
    || String(a.plan.createdAt).localeCompare(String(b.plan.createdAt))
    || a.planId.localeCompare(b.planId)
  ));
}

function collectOverdue(state, today) {
  const plans = state.plannedPayments || [];
  if (!plans.length) return [];

  const starts = plans.map(seriesStartDate).sort();
  const from = starts[0];
  const to = addDaysISO(today, -1);
  if (from > to) return [];

  return collectOccurrences(state, from, to, today)
    .filter((occurrence) => occurrence.status === 'overdue');
}

/** Данные для экрана календаря: вхождения месяца, сводка и просрочка. */
export function buildMonthCalendar(state, { month, today = todayISO() } = {}) {
  const range = monthRange(month);
  const occurrences = collectOccurrences(state, range.from, range.to, today);
  const byDate = new Map();

  const summary = {
    expensePlanned: 0,
    incomePlanned: 0,
    unpaidExpense: 0,
    unpaidIncome: 0,
    paidExpense: 0,
    paidIncome: 0,
    skippedCount: 0,
    overdueCount: 0,
    overdueTotal: 0,
  };

  for (const occurrence of occurrences) {
    const list = byDate.get(occurrence.date) || [];
    list.push(occurrence);
    byDate.set(occurrence.date, list);

    if (occurrence.status === 'skipped') {
      summary.skippedCount += 1;
      continue;
    }

    if (occurrence.type === 'expense') {
      summary.expensePlanned += occurrence.amount;
      if (occurrence.status !== 'paid') summary.unpaidExpense += occurrence.amount;
    } else {
      summary.incomePlanned += occurrence.amount;
      if (occurrence.status !== 'paid') summary.unpaidIncome += occurrence.amount;
    }

    if (occurrence.status === 'paid') {
      if (occurrence.type === 'expense') summary.paidExpense += occurrence.amount;
      else summary.paidIncome += occurrence.amount;
    }
    if (occurrence.status === 'overdue') {
      summary.overdueCount += 1;
      summary.overdueTotal += occurrence.amount;
    }
  }

  return {
    month,
    range,
    occurrences,
    byDate,
    summary,
    overdue: collectOverdue(state, today),
  };
}

/** Ближайшие неоплаченные платежи: сначала просроченные, затем будущие. */
export function buildUpcomingPayments(state, {
  from = todayISO(),
  to = addDaysISO(from, 30),
  limit = 3,
  today = from,
} = {}) {
  const overdue = collectOverdue(state, today);
  const upcoming = collectOccurrences(state, from, to, today)
    .filter((occurrence) => occurrence.status !== 'paid' && occurrence.status !== 'skipped');

  return [...overdue, ...upcoming].slice(0, limit);
}

/** Прогноз остатков по счетам с учётом неоплаченных платежей до конца месяца. */
export function buildPaymentForecast(state, { month, today = todayISO() } = {}) {
  if (!month || month < today.slice(0, 7)) return { available: false };

  const range = monthRange(month);
  const storedByKey = indexOccurrences(state);
  const transactionById = indexTransactions(state);
  const deltas = new Map();
  let count = 0;

  for (const plan of state.plannedPayments || []) {
    const from = seriesStartDate(plan);
    if (from > range.to) continue;

    for (const date of plannedDatesInRange(plan, from, range.to)) {
      const stored = storedByKey.get(occurrenceKey(plan.id, date));
      if (stored) continue; // оплаченные и пропущенные уже не влияют на прогноз

      const entry = buildEntry(plan, date, null, transactionById, today);
      const delta = entry.type === 'income' ? entry.amount : -entry.amount;
      deltas.set(entry.accountId, (deltas.get(entry.accountId) || 0) + delta);
      count += 1;
    }
  }

  const accounts = state.accounts.map((account) => {
    const current = accountBalance(state, account.id);
    const delta = deltas.get(account.id) || 0;
    return {
      id: account.id,
      name: account.name,
      kind: account.kind,
      archived: account.archived,
      current,
      delta,
      projected: current + delta,
    };
  });

  const current = totalBalance(state);
  const delta = accounts.reduce((sum, account) => sum + account.delta, 0);

  return {
    available: true,
    monthEnd: range.to,
    count,
    accounts,
    total: { current, delta, projected: current + delta },
  };
}

export function paymentAmount(occurrence, currency) {
  const money = formatMoney(occurrence.amount, currency);
  if (occurrence.type === 'income') return { text: `+${money}`, tone: 'income' };
  if (occurrence.type === 'expense') return { text: `−${money}`, tone: 'expense' };
  return { text: money, tone: null };
}

export function paymentTitle(state, occurrence) {
  return occurrence.note || categoryName(state, occurrence.categoryId);
}

export function paymentAccountName(state, occurrence) {
  return state.accounts.find((account) => account.id === occurrence.accountId)?.name || 'Счёт';
}
