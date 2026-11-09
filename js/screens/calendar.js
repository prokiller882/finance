import { $, clear, el } from '../dom.js';
import {
  formatDateNumeric,
  formatDateWithWeekday,
  formatMoney,
  isMonthKey,
  monthFromKey,
  monthKey,
  monthKeyFromISO,
  shiftMonthKey,
  todayISO,
} from '../format.js';
import { isISODate } from '../models/validation.js';
import { buildMonthCalendar, buildPaymentForecast } from '../payments.js';
import { createPaymentRow } from '../components/paymentRow.js';
import { paymentsCount } from '../labels.js';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDelta(value, currency) {
  if (value === 0) return 'без изменений';
  const money = formatMoney(Math.abs(value), currency);
  return value > 0 ? `+${money}` : `−${money}`;
}

export function createCalendar(app) {
  let monthEl;
  let currentMonthBtn;
  let summaryEl;
  let summaryTitleEl;
  let gridEl;
  let dayTitleEl;
  let dayListEl;
  let overdueEl;
  let overdueTitleEl;
  let overdueListEl;
  let forecastBlock;
  let forecastListEl;
  let forecastNoteEl;

  let month = monthKey();
  let selectedDate = todayISO();

  function firstDateWithPayments(targetMonth) {
    const data = buildMonthCalendar(app.state, { month: targetMonth });
    const dates = [...data.byDate.entries()]
      .filter(([, occurrences]) => occurrences.length > 0)
      .map(([date]) => date)
      .sort();
    return dates[0] || `${targetMonth}-01`;
  }

  function renderSummary(state, data) {
    const currency = state.settings.currency;
    summaryTitleEl.textContent = `План на ${data.range.label.toLowerCase()}`;
    clear(summaryEl);

    const items = [
      { label: 'К оплате', value: formatMoney(data.summary.unpaidExpense, currency), tone: 'expense' },
      { label: 'Ожидается доход', value: formatMoney(data.summary.unpaidIncome, currency), tone: 'income' },
      { label: 'Оплачено', value: formatMoney(data.summary.paidExpense, currency) },
      { label: 'Получено', value: formatMoney(data.summary.paidIncome, currency) },
      {
        label: 'Просрочено в месяце',
        value: data.summary.overdueCount
          ? `${paymentsCount(data.summary.overdueCount)} · ${formatMoney(data.summary.overdueTotal, currency)}`
          : 'Нет',
        tone: data.summary.overdueCount ? 'expense' : null,
      },
    ];

    for (const item of items) {
      summaryEl.append(el('div', { class: 'calendar-summary__item' }, [
        el('span', { class: 'calendar-summary__label', text: item.label }),
        el('strong', {
          class: `calendar-summary__value${item.tone ? ` amount--${item.tone}` : ''}`,
          text: item.value,
        }),
      ]));
    }
  }

  function renderOverdue(state, data) {
    clear(overdueListEl);

    if (!data.overdue.length) {
      overdueEl.hidden = true;
      return;
    }

    overdueEl.hidden = false;
    overdueTitleEl.textContent = `Требует внимания · ${paymentsCount(data.overdue.length)}`;
    for (const occurrence of data.overdue) {
      overdueListEl.append(createPaymentRow(state, occurrence, { showDate: true }));
    }
  }

  function dayLabel(date, occurrences, currency) {
    if (!occurrences.length) return `${formatDateNumeric(date)}: нет платежей`;
    const active = occurrences.filter((occurrence) => occurrence.status !== 'skipped');
    if (!active.length) return `${formatDateNumeric(date)}: только пропущенные платежи`;
    const total = active.reduce((sum, occurrence) => sum + occurrence.amount, 0);
    return `${formatDateNumeric(date)}: ${paymentsCount(active.length)} на ${formatMoney(total, currency)}`;
  }

  function renderGrid(state, data) {
    clear(gridEl);

    const first = monthFromKey(month);
    const offset = (first.getDay() + 6) % 7;
    const daysCount = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const today = todayISO();

    for (let index = 0; index < offset; index += 1) {
      gridEl.append(el('span', { class: 'calendar-day calendar-day--empty', attrs: { 'aria-hidden': 'true' } }));
    }

    for (let day = 1; day <= daysCount; day += 1) {
      const date = `${month}-${pad2(day)}`;
      const occurrences = data.byDate.get(date) || [];
      const classes = ['calendar-day'];
      if (date === selectedDate) classes.push('is-selected');
      if (date === today) classes.push('is-today');
      if (occurrences.some((occurrence) => occurrence.status === 'overdue')) classes.push('is-overdue');

      const dots = occurrences.slice(0, 3).map((occurrence) => el('span', {
        class: [
          'calendar-dot',
          `calendar-dot--${occurrence.type}`,
          occurrence.status === 'paid' ? 'calendar-dot--paid' : '',
          occurrence.status === 'skipped' ? 'calendar-dot--skipped' : '',
        ].filter(Boolean).join(' '),
      }));

      if (occurrences.length > 3) {
        dots.push(el('span', {
          class: 'calendar-day__more',
          text: `+${occurrences.length - 3}`,
        }));
      }

      gridEl.append(el('button', {
        class: classes.join(' '),
        type: 'button',
        dataset: { date },
        attrs: {
          'aria-label': dayLabel(date, occurrences, state.settings.currency),
          'aria-pressed': String(date === selectedDate),
          'aria-current': date === today ? 'date' : null,
        },
      }, [
        el('span', { class: 'calendar-day__num', text: String(day) }),
        el('span', { class: 'calendar-day__dots' }, dots),
      ]));
    }
  }

  function renderDay(state, data) {
    dayTitleEl.textContent = formatDateWithWeekday(selectedDate);
    clear(dayListEl);

    const occurrences = data.byDate.get(selectedDate) || [];
    if (!occurrences.length) {
      dayListEl.append(el('li', {
        class: 'empty',
        text: 'На этот день платежей нет. Выберите другую дату или добавьте платёж.',
      }));
      return;
    }

    for (const occurrence of occurrences) {
      dayListEl.append(createPaymentRow(state, occurrence));
    }
  }

  function renderForecast(state) {
    const forecast = buildPaymentForecast(state, { month });
    if (!forecast.available) {
      forecastBlock.hidden = true;
      return;
    }

    forecastBlock.hidden = false;
    clear(forecastListEl);

    const currency = state.settings.currency;
    if (!forecast.accounts.length) {
      forecastListEl.append(el('li', { class: 'empty', text: 'Счетов пока нет' }));
    } else {
      for (const account of forecast.accounts) {
        forecastListEl.append(el('li', { class: 'row' }, [
          el('div', { class: 'row__main' }, [
            el('span', { class: 'row__title', text: account.name }),
            el('span', {
              class: 'row__sub',
              text: `сейчас ${formatMoney(account.current, currency)} · ${formatDelta(account.delta, currency)}`,
            }),
          ]),
          el('span', {
            class: `row__amount${account.projected < 0 ? ' amount--expense' : ''}`,
            text: formatMoney(account.projected, currency),
          }),
        ]));
      }

      forecastListEl.append(el('li', { class: 'row row--total' }, [
        el('div', { class: 'row__main' }, [
          el('span', { class: 'row__title', text: 'Итого' }),
          el('span', {
            class: 'row__sub',
            text: `сейчас ${formatMoney(forecast.total.current, currency)} · ${formatDelta(forecast.total.delta, currency)}`,
          }),
        ]),
        el('span', {
          class: `row__amount${forecast.total.projected < 0 ? ' amount--expense' : ''}`,
          text: formatMoney(forecast.total.projected, currency),
        }),
      ]));
    }

    forecastNoteEl.textContent = forecast.count
      ? `Учитываются неоплаченные платежи до ${formatDateNumeric(forecast.monthEnd)}. Фактические отчёты не меняются.`
      : `Неоплаченных платежей до ${formatDateNumeric(forecast.monthEnd)} нет.`;
  }

  function render() {
    if (!gridEl) return;

    const state = app.state;
    if (!isISODate(selectedDate) || monthKeyFromISO(selectedDate) !== month) {
      selectedDate = `${month}-01`;
    }

    const data = buildMonthCalendar(state, { month });
    monthEl.textContent = data.range.label;
    currentMonthBtn.hidden = month === monthKey();

    renderSummary(state, data);
    renderOverdue(state, data);
    renderGrid(state, data);
    renderDay(state, data);
    renderForecast(state);
  }

  function setMonth(next) {
    const target = isMonthKey(next) ? next : monthKey();
    if (target !== month || monthKeyFromISO(selectedDate) !== target) {
      month = target;
      selectedDate = firstDateWithPayments(target);
    }
    render();
  }

  function setSelectedDate(date) {
    if (!isISODate(date)) return;
    month = monthKeyFromISO(date);
    selectedDate = date;
    render();
  }

  function handlePaymentAction(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const { action, planId, date } = button.dataset;
    if (!action || !planId) return;

    if (action === 'delete-payment') {
      if (!window.confirm('Удалить плановый платёж? Уже оплаченные операции останутся в журнале.')) return;
      const saved = app.actions.deletePlannedPayment(planId);
      if (!saved) {
        app.toast('Не удалось удалить платёж');
        return;
      }
      app.toast('Платёж удалён');
      return;
    }

    try {
      if (action === 'pay-payment') {
        const saved = app.actions.payPlannedPayment(planId, date);
        if (!saved) {
          app.toast('Не удалось сохранить оплату');
          return;
        }
        app.toast('Платёж оплачен, операция добавлена');
        return;
      }

      if (action === 'skip-payment') {
        const saved = app.actions.skipPlannedPayment(planId, date);
        if (!saved) {
          app.toast('Не удалось пропустить платёж');
          return;
        }
        app.toast('Платёж пропущен');
        return;
      }

      if (action === 'restore-payment') {
        const saved = app.actions.restorePlannedPayment(planId, date);
        if (!saved) {
          app.toast('Не удалось вернуть платёж');
          return;
        }
        app.toast('Платёж возвращён в ожидание');
      }
    } catch (error) {
      console.error('Не удалось изменить платёж', error);
      app.toast(error instanceof Error ? error.message : 'Не удалось изменить платёж');
    }
  }

  return {
    id: 'calendar',
    title: 'Календарь',

    init(root) {
      monthEl = $('#cal-month', root);
      currentMonthBtn = $('#cal-current-month', root);
      summaryEl = $('#cal-summary', root);
      summaryTitleEl = $('#cal-summary-title', root);
      gridEl = $('#cal-grid', root);
      dayTitleEl = $('#cal-day-title', root);
      dayListEl = $('#cal-day-list', root);
      overdueEl = $('#cal-overdue', root);
      overdueTitleEl = $('#cal-overdue-title', root);
      overdueListEl = $('#cal-overdue-list', root);
      forecastBlock = $('#cal-forecast-block', root);
      forecastListEl = $('#cal-forecast', root);
      forecastNoteEl = $('#cal-forecast-note', root);

      $('#cal-prev-month', root).addEventListener('click', () => {
        setMonth(shiftMonthKey(month, -1));
      });
      $('#cal-next-month', root).addEventListener('click', () => {
        setMonth(shiftMonthKey(month, 1));
      });
      currentMonthBtn.addEventListener('click', () => setMonth(monthKey()));

      $('#cal-add', root).addEventListener('click', () => {
        app.navigate('/calendar/add');
      });

      gridEl.addEventListener('click', (event) => {
        const button = event.target.closest('[data-date]');
        if (button) setSelectedDate(button.dataset.date);
      });

      dayListEl.addEventListener('click', handlePaymentAction);
      overdueListEl.addEventListener('click', handlePaymentAction);
    },

    render,
    getMonth: () => month,
    getSelectedDate: () => selectedDate,
    setMonth,
    setSelectedDate,
  };
}
