# Reconcile: spine против кода

**Вердикт:** spine в основном ратифицирует существующие конвенции, но в AD-1/AD-5/AD-12/AD-13 ошибается о текущем коде, а критичные brownfield-ловушки (toJSON-whitelists, read-only миграция, каскад норм сбережений, порядок оплат) не закрывает — как build-substrate не готов без правок.

## Critical

1. **toJSON-whitelists теряют новые поля.** `Transaction` (`js/models/transaction.js:23-32,124-137`), `PlannedPayment` (`:25-35,135-149`), `Category` (`js/models/category.js:35-39,82-90`) собирают поля поимённо; действия пишут через `.create().toJSON()` (`js/app.js:54,76,97,110,262`). `obligationId/principal/interest/sourceTransactionId/savingsRateBp/skipSavings`, `plan.obligationId/archived`, `category.system/mark` не дойдут до `state`; при обязательных полях `validateState` отвергнет запись и `commit()` вернёт `false`.
2. **AD-5 read-only неисполним на текущих `readState`/`loadState`.** `readState()` схлопывает любую ошибку в `null` (`js/storage.js:425-440`), `loadState()` на `null` сеет и **сохраняет** seed (`:453-465`), `validateState` требует точную версию (`:175-177`).
3. **R5 не закрыт.** Старый закэшированный v3-shell получит `UNSUPPORTED_VERSION` → `null` → seed поверх v4. Нужны сентинел/порядок выкатки/запрет засева поверх непустого ключа.

## High

4. **AD-1 противоречит коду и себе.** `store.js` импортирует `storage.js` (`js/store.js:1`); экраны читают чистые модули напрямую (`js/screens/dashboard.js:10-14`); `limits.js` обязан импортировать `reports/balanceSheet.js` (AD-6/AD-12), чего текст AD-1 не разрешает.
5. **AD-7 ломает ДДС.** `cashFlow.js:3,7` переиспользует `groupTransactionsByCategory` из P&L; переключение P&L на `interest` молча изменит ДДС и обнулит `discrepancy` (`:34`). Нужен явный `measure` или отдельные функции.
6. **AD-8 не связывает экран отчётов.** `js/screens/reports.js:109,113` печатает «Пока не ведутся», `js/reports/balanceSheet.js:60-62` — заглушка `liabilities = 0`.
7. **AD-11 теряет `savingsRateBp` при правке счёта.** `normalizeAccountInput` возвращает `{name,kind,openingBalance}` (`js/accounts.js:40`), `updateAccount` делает `Object.assign` (`js/app.js:230`); формы (`settings.js:192-210`, `index.html:264-273`) поля не знают; `toggleAccount` не умеет отказывать при разархивации.
8. **AD-10: `remaining` без даты против «remaining до даты платежа».** AD-8 определяет сумму без даты; AD-10 требует базу до даты. Оплата задним числом/вне порядка расходится с формулой; правка ранней оплаты оставляет снимки последующих несогласованными.
9. **AD-10 ломает существующие экраны.** `dashboard.js:181` и `transactions.js:165` вызывают `deleteTransaction` без try/catch; `transactionRow.js:39-45` всегда ведёт на общую форму. Нужны скрытие/редирект и обработка ошибок.
10. **AD-9/AD-11 без владельца в `app.js`.** Правила плана и каскады прихода живут в `app.js:52-134`; `updatePlannedPayment` пересобирает план и без `toJSON` затрёт `obligationId/archived`; `skipSavings` в payload формы отсутствует.
11. **AD-14: `sys-interest` можно выбрать вручную; `sys-writeoff` не имеет производителя.** Общая форма показывает все расходные категории (`transactionSheet.js:71-86`); write-off в v1 не создаётся (`app.js:241-259`, `settings.js:406-429`).

## Medium

- **M1** `migrate()` отбрасывает неизвестные верхнеуровневые ключи (`storage.js:77-148`), хотя AD-5 обещает их сохранять.
- **M2** `source: null` в умолчаниях v4 нигде не определён; неясно, где снимок `savingsRateBp` — на приходе или переводе.
- **M3** Нет правил `validateState` для `obligations/obligationAdjustments` (уникальность, ссылки, один план на обязательство, `paymentDay`, сумма норм, `principal+interest===amount`). `commit` не различает `INVALID_STATE` и квоту.
- **M4** AD-12 меняет базу прогноза (только расходные счета) против `AGENTS.md` и `docs/qa-checklist.md:22`; нужно отметить изменение и обновить документы.
- **M5** База лимита без `asOf` учитывает будущие операции (`balanceSheet.js:28-39`).
- **M6** Делитель дней не зафиксирован: 19 или 20 для «1–20-го».
- **M7** `buildUpcomingPayments` сейчас отдаёт overdue + upcoming, включая доходы (`payments.js:156-167`); AD-13 меняет контракт, но не связывает `index.html`, `dashboard.js`, `AGENTS.md`, `qa-checklist`, `ROADMAP`.
- **M8** `plan.archived` никто не потребляет: `occursOn`/`plannedDatesInRange` (`recurrence.js:42-107`), `collectOccurrences`/`buildPaymentForecast` (`payments.js:46-84,170-218`) не фильтруют.
- **M9** Период обзора (day/week/quarter/year) не стыкуется с месячными связками: журнал и дата формы операции (`dashboard.js:161-163`, `transactionSheet.js:145-155`).
- **M10** `addMonthsClamped` дублирует `clampDay` (`recurrence.js:20-22`).
- **M11** `paymentDay`/`contractPayment` дублируют `plan.startDate.day`/`plan.amount`; не сказано, кто источник истины.
- **M12** Пересоздание переводов меняет `id`/`createdAt` и двигает журнал (`journal.js:61-64`); при приходе на счёт накоплений возможен self-transfer (`transaction.js:68-76`).
- **M13** Мультивкладочность: `replace` по `storage` (`app.js:341-348`) даёт lost update; с автопереводами/оплатами нужен guard.
- **M14** Corrupt-путь: `backupCorrupt` глотает отказ квоты (`storage.js:416-423`); read-only при corrupt требует UI-состояния, а Binds не включает `app.js`/экраны.

## Low

- **L1** В конвенциях не хватает кодов `IMPORT_TOO_LARGE`, `PARSE_ERROR` (`storage.js:548,562`).
- **L2** Маршруты обязательств не описаны как overlay с `basePath`; в `parseOverlay` нужны константы/ветки (`router.js:36-80`).
- **L3** Системные категории без `color`/`icon` не пройдут `Category.validate` (`category.js:68-79`).
- **L4** `CACHE` и `SCHEMA_VERSION` совпали по номеру; связи нет.
- **L5** `docs/extending.md:18` называет календарь подэкраном обзора; `AGENTS.md` — источник поведения — не входит в `docs/*`.
- **L6** «оценка» в AD-7 против точного снимка в AD-10: снимок — это наша оценка, банк главнее.
- **L7** `rangeFor(kind, now = new Date())` (`format.js:119-147`) нарушает AD-4; day/week не проверить на фиксированной дате.
- **L8** `isSafeMinor` требует `> 0` (`validation.js:18-20`), а AD-7 разрешает `principal < 0` и `interest = 0`.
