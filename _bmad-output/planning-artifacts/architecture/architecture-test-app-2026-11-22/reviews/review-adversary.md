# Adversarial review — ARCHITECTURE-SPINE

**Вердикт:** Spine ещё не контракт: он фиксирует слои и владельцев, но не агрегаты, даты и переходы состояний — две команды, буквально исполняя AD, соберут разные остаток, лимит и историю; нужны правки AD-8/9/10/11/17 и новые AD про агрегатные команды, `asOf` и снимки вхождений.

## Critical

### P1. `remaining` без `asOf` — AD-8 × AD-6/AD-10
`remaining` без даты (AD-8) × баланс на дату `buildBalanceSheet(asOf)` (AD-6) × split «до даты платежа» (AD-10). Платёж с `transaction.date > asOf` уменьшает прошлый долг; капитал на прошлую дату занижен. Нужна `remainingAsOf(state, obligationId, asOf)`; фильтр по датам платежей и корректировок; инвариант `buildBalanceSheet(asOf).totalLiabilities === Σ remainingAsOf(asOf)`; split использует её.

### P2. Финальный платёж архивирует, обратного перехода нет — AD-9/AD-10
После удаления/правки финального платежа `remaining > 0`, но `obligation.archived`/`plan.archived` скрывают все даты; оплатить нельзя. Нужна таблица переходов: любая мутация, поднимающая `remaining > 0`, атомарно снимает оба архива и восстанавливает серию; тест «оплатил последний → удалил → оплатил снова».

### P3. Один `plan.amount` на всю серию — AD-9 × FR-22
Правка платежа/счёта ретроактивно меняет уже наступившее неоплаченное вхождение, хотя FR-22 говорит «будущих». Один `plan.amount` не хранит разные суммы. Закрыть: правка договорных полей запрещена, пока есть просроченное неоплаченное вхождение (сначала оплатить/пропустить); после — применяется ко всем неоплаченным, оплаченные/пропущенные не трогаются.

### P4. `addMonthsClamped → clampDay` против AD-1 — AD-4 × AD-1
`format → recurrence` даёт цикл (`recurrence` уже импортирует `format`), либо второй кламп. Перенести `clampDay`/`daysInMonth` в `format.js` (или `dates.js`) ниже обоих; `recurrence` импортирует вниз.

### P5. `skipSavings: false` на всех операциях против «только доход» — AD-5 × AD-17
Миграция ставит `skipSavings: false` всем, валидация разрешает только доходу. Нужна типовая матрица: nullable-поля `null` у неприменимых типов; `skipSavings` — boolean только у дохода; `obligationId/principal/interest` — только у платежа по обязательству; `sourceTransactionId/savingsRateBp` — только у сгенерированного перевода.

## High

### P6. Два входа для прихода — AD-11 × FR-12
Форма прихода применяет норму, «Получить» в календаре — нет. Нужна единая `createIncome(state, input)`, её вызывают обе точки.

### P7. Generic-guards против агрегатных каскадов — AD-9/AD-10 × AD-11/FR-23
Общие действия отвергают `obligationId`/`sourceTransactionId`/план с `obligationId`, но агрегатные каскады обязаны их менять. Нужны агрегатные команды (`updateIncomeWithSavings`, `updateObligationProjection`, `deleteObligationAggregate`) как единственный легальный путь; generic-действия делегируют им, guard — на UI/generic-входе.

### P8. `obligation.archived` и `plan.archived` — два владельца — AD-9
Один флаг — источник (`obligation.archived`), второй — зеркало; `validateState` проверяет равенство; unarchive описан.

### P9. Календарь по дате вхождения против отчётов по дате операции — AD-9/AD-13 × AD-6/AD-7
Календарь группирует по `occurrence.date`, отчёты — по `transaction.date`. Просроченное ноябрьское вхождение, оплаченное в декабре, в календаре ноября оплачено, в ДДС ноября — нет. Зафиксировать: календарь — графиковая семантика, отчёты — кассовая; сверки между ними нет; подписать в UI/доках.

### P10. Импорт обходит агрегатные инварианты — AD-5/AD-17 × AD-10/AD-11
`validateState` не проверяет связь «платёж ↔ оплаченное вхождение», уникальность `(sourceTransactionId, toAccountId)`, `sourceTransactionId` только у перевода на накопления, `savingsRateBp` только там. Добавить агрегатные проверки.

### P11. Расписание не знает о погашении — AD-9 × AD-8/AD-10/AD-12
Лимит/прогноз резервируют платежи после фактического погашения и последнее вхождение по `contractPayment`, хотя спишется `remaining + interest`. Нужна `projectObligationSchedule(state, obligationId, from, to)` с датами и суммами `min(contractPayment, remainingAsOf + interest)`; recurrence/limits/forecast/calendar используют её.

## Medium

- **P12.** `nextIncomeDate` может быть в прошлом; `days` отрицательный. Определить: только доход с `date >= today`; `days >= 0`.
- **P13.** Якорь 31-го теряется после февраля (`plan.startDate = 2027-02-28` → март 28). Нужен `plan.anchorDay` (1..31) из `paymentDay`; recurrence использует его.
- **P14.** `ожидает` как хранимый статус против `paid|skipped`. Определить: `ожидает/просрочено/сегодня` — производные; хранятся только `paid/skipped`; удаление строки возвращает в ожидание.
- **P15.** Open Question 4 и `AGENTS.md` разрешают два несовместимых прогноза/«Ближайших». AD-12/AD-13 — единственный источник; `AGENTS.md`, `qa-checklist`, `ROADMAP` обновляются; Q4 не даёт права на альтернативную реализацию.
- **P16.** `commit` возвращает объект, старые экраны проверяют boolean → ошибка выглядит успехом. Один формат; мигрировать все `if (!saved)`.
- **P17.** `replace` при импорте/сбросе не возвращает ошибку и публикует до сохранения. `replace` сохраняет первым, возвращает `{ok,reason}`; при ошибке старое состояние остаётся.
- **P18.** Счёт обязательства может быть накоплений; база лимита их исключает, резерв включает. Ограничить счёт обязательства `cash|card|bank`; расходные вхождения со счёта накоплений не входят в резерв лимита.
- **P19.** Отрицательный `remaining` через импорт. `validateState` считает `remainingAsOf` и отвергает `< 0`.
- **P20.** Обязательство без плана. `validateState`: для неархивного обязательства с `remaining > 0` — ровно один активный план; `remaining = 0` без плана допустим.
- **P21.** Проекция плана неполна: нужны `type: 'expense'`, `recurrence: 'monthly'`, `endDate: null`, `obligationId`, `archived`, `anchorDay`; `id`/`createdAt` неизменяемы; правка in-place.

## Low

- `available` — boolean или сумма: переименовать в `hasNextIncome`.
- `updatedAt` как stale-guard: нужен монотонный `rev`.
- `forward` vs `corrupt`: порядок parse → version → validate.
- AD-1: `app.js` обязан импортировать `storage`; добавить исключение.
- Pure → report: `payments.js`/`journal.js` импортируют `categoryName` из `incomeStatement.js`; описать допустимые рёбра.
- `savingsRateBp` без пер-аккаунтного диапазона: 0..10000.
- `sys-interest` и коллизия имён при миграции: system-категории исключить из проверки уникальности имени.
- Архив и будущие `skipped`: удалять неоплаченные с `date > today`, сохранять `skipped` с `date <= today`.
- `sourceTransactionId` без проверки типа/уникальности: transfer, toAccountId — накопления, уникальная пара.
- `obligationAdjustment.obligationId` не проверяется.
- `obligation.archived` отсутствует в AD-5/AD-17.
- `parseRateBp`: округление или отказ — зафиксировать (отказ при >2 знаках).
- `rangeFor` и часы: `today` обязателен, без дефолта `todayISO()`.
- `savingsRateBp` — снимок на переводе, не на приходе.
