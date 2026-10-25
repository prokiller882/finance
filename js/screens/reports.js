import { $, $$, el, clear } from '../dom.js';
import { formatMoney, formatDateNumeric, rangeFor, customRange } from '../format.js';
import { buildBalanceSheet } from '../reports/balanceSheet.js';
import { buildIncomeStatement } from '../reports/incomeStatement.js';
import { buildCashFlow } from '../reports/cashFlow.js';
import { accountSubtitle, operationsCount } from '../labels.js';

const REPORT_TITLES = {
  balance: 'Баланс',
  income: 'Прибыли и убытки',
  cashflow: 'Движение денег',
};

const REPORT_KEYS = Object.keys(REPORT_TITLES);

export function createReports(app) {
  let body;
  let chips;
  let customWrap;
  let fromInput;
  let toInput;
  let labelEl;

  let report = 'balance';
  let period = 'month';
  let custom = { from: rangeFor('month').from, to: rangeFor('month').to };

  function reportKeyFromPath(path) {
    const key = path.split('/')[2];
    return REPORT_KEYS.includes(key) ? key : 'balance';
  }

  function currentRange() {
    if (period === 'custom') {
      return customRange(fromInput.value || custom.from, toInput.value || custom.to);
    }
    return rangeFor(period);
  }

  function syncPeriodUi() {
    for (const chip of $$('.chip', chips)) {
      chip.setAttribute('aria-pressed', String(chip.dataset.period === period));
    }
    customWrap.hidden = period !== 'custom';
    if (period === 'custom') {
      fromInput.value = custom.from;
      toInput.value = custom.to;
    }
  }

  function summary(rows) {
    return el('div', { class: 'card summary' }, rows.map((row) => el('div', { class: 'summary-row' }, [
      el('span', { class: 'summary-row__label', text: row.label }),
      el('span', {
        class: `summary-row__value${row.tone ? ` amount--${row.tone}` : ''}`,
        text: row.value,
      }),
    ])));
  }

  function reportRow(name, sub, value, tone = null) {
    return el('div', { class: 'report-row' }, [
      el('div', { class: 'report-row__main' }, [
        el('span', { class: 'report-row__name', text: name }),
        sub ? el('span', { class: 'report-row__sub', text: sub }) : null,
      ]),
      el('span', {
        class: `report-row__value${tone ? ` amount--${tone}` : ''}`,
        text: value,
      }),
    ]);
  }

  function section(title, rows) {
    return el('section', { class: 'card report-section' }, [
      el('h2', { class: 'report-section__title', text: title }),
      ...(rows.length ? rows : [el('p', { class: 'report__note', text: 'Нет данных за период' })]),
    ]);
  }

  function emptyRow(text) {
    return el('div', { class: 'report-row' }, [
      el('span', { class: 'report-row__name', text }),
    ]);
  }

  function renderBalance(state, range) {
    const currency = state.settings.currency;
    const data = buildBalanceSheet(state, range.to);

    const assetRows = data.assets.map((asset) => reportRow(
      asset.name,
      accountSubtitle(asset),
      formatMoney(asset.balance, currency),
      asset.balance < 0 ? 'expense' : null,
    ));

    return el('div', { class: 'report' }, [
      summary([
        { label: 'Активы', value: formatMoney(data.totalAssets, currency) },
        { label: 'Обязательства', value: formatMoney(data.totalLiabilities, currency) },
        {
          label: 'Капитал',
          value: formatMoney(data.equity, currency),
          tone: data.equity < 0 ? 'expense' : 'income',
        },
      ]),
      section('Активы по счетам', assetRows.length ? assetRows : [emptyRow('Счетов пока нет')]),
      section('Обязательства', [emptyRow('Пока не ведутся')]),
      section('Капитал', [
        reportRow('Активы − обязательства', `на ${formatDateNumeric(data.asOf)}`, formatMoney(data.equity, currency)),
      ]),
      el('p', { class: 'report__note', text: 'Кредитные счета и обязательства появятся в следующей версии.' }),
    ]);
  }

  function renderIncome(state, range) {
    const currency = state.settings.currency;
    const data = buildIncomeStatement(state, range);

    const incomeRows = data.income.map((row) => reportRow(
      row.name,
      operationsCount(row.count),
      formatMoney(row.amount, currency),
      'income',
    ));
    const expenseRows = data.expense.map((row) => reportRow(
      row.name,
      operationsCount(row.count),
      formatMoney(row.amount, currency),
      'expense',
    ));

    return el('div', { class: 'report' }, [
      summary([
        { label: 'Доходы', value: formatMoney(data.totalIncome, currency), tone: 'income' },
        { label: 'Расходы', value: formatMoney(data.totalExpense, currency), tone: 'expense' },
        {
          label: 'Прибыль',
          value: formatMoney(data.profit, currency),
          tone: data.profit < 0 ? 'expense' : 'income',
        },
      ]),
      data.margin != null
        ? el('p', { class: 'report__note', text: `Маржа: ${(data.margin * 100).toFixed(1)}%` })
        : null,
      section('Доходы по категориям', incomeRows),
      section('Расходы по категориям', expenseRows),
      el('p', { class: 'report__note', text: 'Переводы между счетами и начальные остатки не входят в P&L.' }),
    ]);
  }

  function renderCashFlow(state, range) {
    const currency = state.settings.currency;
    const data = buildCashFlow(state, range);

    const inflowRows = data.inflows.map((row) => reportRow(
      row.name,
      operationsCount(row.count),
      formatMoney(row.amount, currency),
      'income',
    ));
    const outflowRows = data.outflows.map((row) => reportRow(
      row.name,
      operationsCount(row.count),
      formatMoney(row.amount, currency),
      'expense',
    ));

    return el('div', { class: 'report' }, [
      summary([
        { label: 'Остаток на начало', value: formatMoney(data.opening, currency) },
        { label: 'Поступления', value: formatMoney(data.totalIn, currency), tone: 'income' },
        { label: 'Списания', value: formatMoney(data.totalOut, currency), tone: 'expense' },
        {
          label: 'Чистый поток',
          value: formatMoney(data.net, currency),
          tone: data.net < 0 ? 'expense' : 'income',
        },
        { label: 'Остаток на конец', value: formatMoney(data.closing, currency) },
      ]),
      section('Поступления по категориям', inflowRows),
      section('Списания по категориям', outflowRows),
      el('p', {
        class: 'report__note',
        text: data.transfersCount
          ? `Переводы между счетами: ${data.transfersCount} шт. на ${formatMoney(data.transfersTotal, currency)}. На итоговый поток не влияют.`
          : 'Переводов между счетами за период не было.',
      }),
    ]);
  }

  function renderReport() {
    const state = app.state;
    const range = currentRange();

    labelEl.textContent = `${range.label} · ${formatDateNumeric(range.from)} — ${formatDateNumeric(range.to)}`;

    clear(body);
    if (report === 'balance') body.append(renderBalance(state, range));
    else if (report === 'income') body.append(renderIncome(state, range));
    else body.append(renderCashFlow(state, range));
  }

  return {
    id: 'reports',
    title: 'Отчёты',

    titleFor(path) {
      return REPORT_TITLES[reportKeyFromPath(path)] || 'Отчёты';
    },

    init(root) {
      body = $('#report-body', root);
      chips = $('#period-chips', root);
      customWrap = $('#period-custom', root);
      fromInput = $('#period-from', root);
      toInput = $('#period-to', root);
      labelEl = $('#period-label', root);

      chips.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-period]');
        if (!chip) return;
        period = chip.dataset.period;
        if (period === 'custom' && !fromInput.value) {
          const month = rangeFor('month');
          custom = { from: month.from, to: month.to };
        }
        syncPeriodUi();
        renderReport();
      });

      for (const input of [fromInput, toInput]) {
        input.addEventListener('change', () => {
          if (fromInput.value && toInput.value) {
            custom = customRange(fromInput.value, toInput.value);
          }
          renderReport();
        });
      }
    },

    show(path) {
      report = reportKeyFromPath(path);
      for (const tab of $$('[data-report]', document)) {
        tab.setAttribute('aria-selected', String(tab.dataset.report === report));
        tab.classList.toggle('is-active', tab.dataset.report === report);
      }
    },

    render() {
      syncPeriodUi();
      renderReport();
    },
  };
}
