# Rubric walker — ARCHITECTURE-SPINE.md

**Предмет:** `_bmad-output/planning-artifacts/architecture/architecture-test-app-2026-11-22/ARCHITECTURE-SPINE.md` (draft, 2026-11-22).
**Контекст:** PRD `_bmad-output/planning-artifacts/prds/prd-test-app-2026-11-22/prd.md` (§7.2), `review-code-reality.md`, `AGENTS.md`, код `js/` (HEAD `f102ef5`).
**Соседние ревью:** `reconcile-code.md`, `reconcile-prd.md` — часть их замечаний в текущей версии spine уже закрыта (AD-9 archive, AD-12 forecast, AD-13 dashboard/upcoming, AD-17 toJSON). Ниже — то, что осталось в текущей редакции.

**Вердикт:** Spine заметно повзрослел и в основном ратифицирует brownfield-каркас, но как контракт для эпиков ещё не готов: три critical-дефекта (AD-5 recovery deadlock, AD-8 остаток без даты, AD-17 безусловная проверка суммы), девять high-расхождений и несколько «тихих» FR/NFR, которые следующие юниты реализуют по-разному.

**Шкала:** critical — блокирует реализацию или ведёт к потере/порче данных; high — два юнита разойдутся или FR невыполним; medium — пробел/неоднозначность, исправимая в сторис; low — редакционное/локальное уточнение.

---

## 1. Сводка по 8 критериям

| # | Критерий | Оценка | Коротко |
|---|---|---|---|
| 1 | Реальные точки расхождения следующего уровня | **Частично, high** | Закрыты C1–C5, C8, C9, C12 из `review-code-reality`; не закрыты C6/C7/C11 и новые FR-12/23/41/46, `paymentRow`, restore-путь. |
| 2 | Каждый AD: Rule исполнимо, Binds/Prevents/Rule не декоративны | **Нет, critical** | 3 critical + 9 high; AD-1/AD-2/AD-4/AD-5/AD-8/AD-9/AD-10/AD-11/AD-12/AD-15/AD-17 требуют правок. |
| 3 | Deferred не позволяет разойтись; отложенное можно отложить | **Частично, medium** | Бюджеты (FR-37 vs FR-38) и FR-4 оставлены двумя развилками; FR-16/45/57 отложены корректно. |
| 4 | Технология проверена | **Частично, medium** | Vanilla/no-build/SW/GitHub Pages/localStorage — адекватны; не проверены ёмкость localStorage, обновление SW и браузерный пол. |
| 5 | Ратифицирует brownfield, а не изобретает | **Частично, high** | AD-1 неверно описывает импорты; AD-17 вводит проверку, ломающую существующие операции; Structural Seed теряет `pwa.js`/`manifest.json`. |
| 6 | Capabilities PRD §7.2 и «тихие» требования | **Частично, high** | Обязательства/норма/лимит/обзор/схема покрыты; потеряны FR-12 «Вернуть», FR-23 delete, FR-41 day/week в отчётах, FR-46 аккордеон, FR-54 manifest/icons. |
| 7 | Измерения altitude, operational/environmental envelope | **Частично, medium** | Деплой/SW/миграция/бэкап есть; нет restore из `pre-v4`, обновления `pwa.js`, матрицы окружений, отката релиза. |
| 8 | Нет AD, ослабляющего/противоречащего другому AD | **Нет, high** | AD-4↔AD-1 (цикл), AD-5↔AD-5/FR-52, AD-17↔AD-7, AD-9 внутренне, AD-15↔FR-41, AD-11↔FR-27. |

---

## 2. Critical

### C1. AD-5: safe mode блокирует единственный путь восстановления — импорт

- **AD:** AD-5 (spine:72).
- **FR/код:** FR-52 (prd.md:633–641), FR-53 (prd.md:643–652); `js/storage.js:425–465` (`readState`/`loadState`), `js/app.js:283–288` (`importFile` → `store.replace`).
- **Что не так:** AD-5 требует на `forward`/`corrupt` «не сохранять», «`commit`/`replace` заблокированы». Импорт и сброс идут через `store.replace()`. Значит, пользователь с повреждённым или более новым файлом не может ни импортировать валидную копию, ни сбросить состояние; остаётся только ручная очистка localStorage (потеря данных). Это противоречит и FR-52, и собственному правилу AD-5 «Импорт сначала полностью валидируется, затем заменяет состояние».
- **Почему critical:** safe mode задуман как защита от перезаписи, но превращается в ловушку без выхода; при неудачной миграции v4 (ровно тот риск, ради которого писался AD-5) приложение нельзя вернуть к копии.
- **Что должно быть решено:** отдельный recovery-путь: импорт в safe mode разрешён после явного подтверждения (данные уже сохранены в `:corrupt`/`:pre-v4`), либо UI экспорта сырых данных + кнопка «сбросить/восстановить». `commit` блокируется, `replace` — только для подтверждённого импорта/сброса, не для storage-события.

### C2. AD-8: остаток долга без `asOf`; баланс «на дату» невыполним

- **AD:** AD-8 (spine:90); AD-6 (spine:78).
- **FR/код:** FR-43 (prd.md:541–549) «Баланс на дату»; FR-13/FR-42; `js/reports/balanceSheet.js:49–71` (`buildBalanceSheet(state, asOf)`), `js/reports/cashFlow.js:14–15`.
- **Что не так:** `remaining = initialPrincipal − Σ principal(оплаты) + Σ delta(корректировки)` не принимает дату. При этом `buildBalanceSheet(state, asOf)` вызывается для произвольного периода/`custom`, а `equity = totalAssets − totalLiabilities` обязан сходиться на ту же дату. Если остаток считать «на сегодня», баланс за прошлый месяц покажет сегодняшний долг; если фильтровать оплаты по дате — это уже другая формула, которой в spine нет. Плюс FR-43 говорит «по активным обязательствам», а AD-8/AD-6 не говорят, что архивные исключаются (архивация не обязана совпадать с обнулением).
- **Почему critical:** это ядро отчёта «Баланс» и инварианта FR-13/FR-42; два разработчика реализуют разные ответы, и оба будут выглядеть «правильно» на текущей дате.
- **Что должно быть решено:** `remaining(state, obligationId, asOf)` (или `remainingAsOf`) с фильтром `transaction.date <= asOf` и `adjustment.date <= asOf`; `buildBalanceSheet` передаёт `asOf`; `liabilities` — только неархивные обязательства; `equity` считается от них. Явно указать, что происходит с архивным обязательством с остатком > 0.

### C3. AD-17: `amount === principal + interest` без условия «только obligation»

- **AD:** AD-17 (spine:144), AD-7 (spine:84).
- **FR/код:** FR-7/FR-17/FR-18; `js/models/transaction.js:47–90` (обычные expense/income не имеют полей), `js/storage.js:278–295` (валидация операций).
- **Что не так:** в списке `validateState` проверка записана безусловно. У обычной операции `principal`/`interest` = `null`/`undefined`, значит `null + null = 0` (или `NaN`), а `amount > 0`; проверка отвергнет все расходы/доходы и импорт старых копий. AD-7 ограничивает инвариант «платёж по обязательству», AD-17 это ограничение теряет.
- **Почему critical:** если реализовать буквально — приложение перестаёт сохранять обычные операции; если реализовать «с оговоркой» — правило в документе неверно.
- **Что должно быть решено:** «для `obligationId != null`: `amount === principal + interest`, `interest ≥ 0`, `principal` знаковый; для остальных `principal/interest/sourceTransactionId/savingsRateBp` = `null`».

---

## 3. High

### H1. AD-10/FR-12: жизненный цикл оплаты не замкнут (Вернуть, правка/удаление оплаты)

- **AD:** AD-10 (spine:102); AD-9 (spine:96).
- **FR/код:** FR-12 (prd.md:211–220) «Вернуть» доступно для `оплачено` и `пропущено`; FR-20 (prd.md:297–307); FR-8; `js/components/paymentRow.js:62–76` (для paid только ссылка `#/edit/{transactionId}`, «Вернуть» только для skipped), `js/app.js:192–204` (`restorePlannedPayment` бросает для paid), `js/components/transactionRow.js:35–45` (общая форма), `js/app.js:70–94` (общий `updateTransaction`).
- **Что не так:** AD-10 описывает `delete`/`edit` для платежа, но:
  - «Вернуть» для оплаченного вхождения не маршрутизируется в obligation-delete: текущая кнопка есть только у skipped, а `restore` для paid запрещён. FR-12 остаётся невыполненным.
  - оплаченная строка `paymentRow` ведёт в общую форму `#/edit/{id}`; AD-10 запрещает общий `updateTransaction` для `obligationId != null`, но альтернативного маршрута/формы для правки суммы/счёта/даты оплаты нет.
  - `paymentRow` вообще не указан в Binds AD-9/AD-10 и не аннотирован в Structural Seed; кнопки «Редактировать/Удалить» у связанного плана останутся, хотя общий `deletePlannedPayment`/`updatePlannedPayment` должен отказывать.
- **Почему high:** FR-12/FR-20 — проверяемые следствия; пользователь не может вернуть тело или исправить оплату через UI, а удаление плана у обязательства даёт тост вместо формы.
- **Что должно быть решено:** явные действия `returnObligationPayment` (удаляет операцию, возвращает тело, ставит `ожидает`) и маршрут правки оплаты (через `obligationSheet`/отдельный overlay); `paymentRow` скрывает/редиректит edit/delete для `plan.obligationId`; добавить `paymentRow.js` в Binds AD-9/AD-10 и в Structural Seed.

### H2. AD-11 против FR-27: «синхронизация на месте» — молчаливое отступление

- **AD:** AD-11 (spine:108).
- **FR/код:** FR-27 (prd.md:370–377) «удаляет старые переводы и создаёт новые по снимку»; FR-24; `js/journal.js:61–64` (сортировка по `date`, затем `createdAt`), `js/models/transaction.js:124–137`.
- **Что не так:** AD-11 требует обновлять существующие переводы «на месте» (`id` и `createdAt` сохраняются), лишние удалять, недостающие не создавать. Это осознанно лучше для журнала (review C9), но это изменение проверяемого FR-27: PRD ожидает новые записи; id/createdAt и порядок строк отличаются. В Open Questions этого нет (там только FR-20, A2, A4, A7). Кроме того, FR-12 «Получить» у планового дохода обязан применять норму (prd.md:217), а AD-11 говорит только «при сохранении прихода» и Binds `app.js account/transaction actions`; `payPlannedPayment` (`js/app.js:136–170`) создаёт доход в обход синхронизации.
- **Почему high:** следующая сторис либо сделает delete/recreate по PRD, либо update-in-place по AD-11 — обе «соответствуют» документам; плюс плановый доход останется без автопереводов.
- **Что должно быть решено:** либо внести пункт в Open Questions с обоснованием (как A9 для FR-20), либо переписать AD-11 под буквальный FR-27; явно включить `payPlannedPayment` в триггеры нормы.

### H3. AD-1 не ратифицирует текущие импорты

- **AD:** AD-1 (spine:48).
- **Код:** `js/storage.js:1–3` импортирует `./schema.js` (правило говорит «только `models`, `seed`, `format`»); `js/journal.js:1` и `js/payments.js:3` импортируют `reports/incomeStatement.js` (`categoryName`), а AD-1 разрешает чистым модулям только примитивы `reports/balanceSheet.js`; `js/app.js:1–2` импортирует `store.js` и `storage.js`, хотя правило говорит «больше никто не импортирует store/storage» (исключение для composition root не записано).
- **Почему high:** AD-1 — главный инвариант слоёв; в текущем виде он либо ложно нарушен существующим кодом, либо требует рефакторинга вне §7.2. Разработчик может «исправить» импорт `schema` вместо реализации фичи.
- **Что должно быть решено:** перечислить `schema.js` в разрешённых для storage; разрешить чистым модулям read-only `reports/*` (или перенести `categoryName` в `format`/`labels`); добавить исключение `app.js`; убрать двусмысленность «screens → actions → pure» vs «screens читают pure напрямую».

### H4. AD-2: смена контракта `commit()` не имеет плана миграции и не ловит throw

- **AD:** AD-2 (spine:54).
- **Код:** `js/store.js:15–27` возвращает boolean; вызовы проверяют `if (!saved)` (`js/screens/settings.js:247,264,303,386,419,439`, `js/components/transactionSheet.js:295`, `js/components/plannedPaymentSheet.js:274`, `js/screens/calendar.js:273,284,294,304`, `js/screens/dashboard.js:182`, `js/screens/transactions.js:166`). Мутаторы бросают исключения (`js/app.js:73,107,139,180,198,228,244`), а не возвращают `{ok:false, reason:'invalid'}`.
- **Что не так:** объект `{ok:false}` всегда truthy — старые `if (!saved)` покажут «сохранено» при квоте/валидации. «Старые проверяют `ok`» не задаёт, что все вызовы обновляются атомарно и что мутаторские throw конвертируются в `reason:'invalid'`. Причина `invalid` в текущем `commit` недостижима: `storage.saveState` ловит всё, но `mutator` может бросить до сохранения.
- **Почему high:** ровно тот класс ошибок, который AD-2 призван предотвратить (квота vs валидация), воспроизводится при первом же сохранении.
- **Что должно быть решено:** правило «`commit` ловит `ValidationError`/доменные ошибки и возвращает `invalid`; все существующие вызовы переводятся на `result.ok` в той же правке; список файлов/тестов — в AD-16/чек-лист». Либо сохранить boolean и добавить `commitDetailed()`.

### H5. AD-4 и Structural Seed создают цикл `format.js ↔ recurrence.js`

- **AD:** AD-4 (spine:66); AD-1 (spine:48).
- **Код/seed:** `js/recurrence.js:1` импортирует `./format.js`; `js/recurrence.js:20–22` содержит `clampDay`; Structural Seed (spine:194) кладёт `addMonthsClamped` в `format.js`, а AD-4 говорит, что `addMonthsClamped()` делегирует `clampDay()` из `recurrence.js`. Получается `format → recurrence → format` — цикл, запрещённый AD-1.
- **Почему high:** ES-модули могут пережить цикл, но инициализация функций/констант хрупка; это прямое противоречие двум AD. Кроме того, AD-4 требует `rangeFor(kind, todayISO)`, а `monthRange()` (`js/format.js:90–92`) передаёт `Date`, как и `js/screens/reports.js:26,37,226` — правило не перечисляет эти правки.
- **Что должно быть решено:** либо `addMonthsClamped` в `recurrence.js` (и убрать из seed-строки `format.js`), либо `clampDay`/`daysInMonth` в `format.js` (и тогда AD-4 меняет владельца). Явно указать call-sites `rangeFor`.

### H6. AD-9: проекция плана неполная; архив/скип и удаление обязательства не решены

- **AD:** AD-9 (spine:96); AD-17 (spine:144); AD-10 (spine:102).
- **FR/код:** FR-16 (prd.md:256–264), FR-21 (prd.md:309–316), FR-23 (prd.md:328–334); `js/models/plannedPayment.js` (поля `recurrence/type`), `js/recurrence.js:42–107` (`plannedDatesInRange` не смотрит `archived`), `js/payments.js:46–84` (вторая ветка добавляет сохранённые skipped).
- **Что не так:**
  1. Проекция перечисляет `amount/accountId/categoryId/note/startDate`, но не `recurrence: 'monthly'` и не `type: 'expense'`. Если оставить модель по умолчанию (`none`), у обязательства будет одно вхождение — FR-16 сломан.
  2. «Архивация … удаляет все будущие неоплаченные вхождения» конфликтует с «сохранённые … пропущенные остаются историей»: будущие skipped — это и «будущие неоплаченные», и «пропущенные». `collectOccurrences` добавляет сохранённые skipped, даже если `plan.archived`; в календаре останутся отменённые будущие строки.
  3. FR-23 (удаление обязательства) не покрыт ни одним AD: обязательство с оплатами нельзя удалять, без оплат — удалить вместе с планом и будущими вхождениями. Общий `deletePlannedPayment` для связанного плана AD-9 запрещает, а кто удаляет план при удалении обязательства — не сказано.
  4. `plan.archived` не проверяется `validateState` на соответствие `obligation.archived` (только «соответствие проекции»).
- **Почему high:** это не «детали CRUD», а целостность календаря/резерва и проверяемые FR-16/21/23. Без `monthly` обязательство вообще не работает.
- **Что должно быть решено:** добавить в AD-9 явные поля проекции (`type:'expense'`, `recurrence:'monthly'`, `archived:false`), правило удаления обязательства/плана, судьбу будущих skipped (удалять) vs исторических (оставлять), проверку `plan.archived === obligation.archived` в AD-17.

### H7. AD-12: не задан фильтр по типу счёта и граница «ближайшего дохода»

- **AD:** AD-12 (spine:114).
- **FR/код:** FR-13 (prd.md:227–228) «счета накоплений в прогноз не входят»; FR-30 (prd.md:400–421); `js/payments.js:179–206` (прогноз по всем планам/счетам), `js/payments.js:155–167` (upcoming).
- **Что не так:**
  - База лимита/прогноза — только `cash|card|bank`, но резерв перечисляет «все неоплаченные расходные вхождения», а прогноз — «плановые доходы/расходы» без фильтра по счёту вхождения. План на счёте накоплений (FR-10 не запрещает) либо зарезервирует деньги, которых нет в базе, либо добавит доход в накопительный счёт к прогнозу расходных — прямое нарушение FR-13.
  - «Ближайший неоплаченный доход» не ограничен «не раньше сегодня» (глоссарий PRD:81). Просроченный доход может дать `nextIncome` в прошлом и пустой/обратный диапазон резерва.
  - «Последний платёж ограничен remaining + interest» (AD-10) не проброшен в резерв/прогноз: `plan.amount = contractPayment` (AD-9), поэтому последнее вхождение резервирует больше, чем реально спишется, и лимит занижен до оплаты.
- **Почему high:** дневной лимит — главная цифра продукта; разные ответы на эти три вопроса дают разные «можно потратить сегодня».
- **Что должно быть решено:** в AD-12 явно: `occurrence.accountId ∈ expense kinds` (или решение, что планы на накопления запрещены), `nextIncome >= today`, и как последнее вхождение/прогноз учитывает `min(plan.amount, remaining + interest)`. FR-33: строка свободных денег показывает 0, нехватка отдельно.

### H8. AD-15 против FR-41: отчёты теряют day/week

- **AD:** AD-15 (spine:132).
- **FR:** FR-41 (prd.md:522–529) «Периоды: день, неделя, месяц, квартал, год. День и неделя — новые диапазоны»; FR-42.
- **Что не так:** AD-15 разрешает `rangeFor` day/week для обзора, но фиксирует «отчёты сохраняют `month | quarter | year | custom`». FR-41 требует day/week и для P&L (как минимум), а Capability Map ставит FR-41–43 под AD-6/7/8, не упоминая, что периоды урезаны. Это тихая потеря объёма §7.2.
- **Почему high:** следующая сторис «отчёты» либо добавит day/week (и AD-15 нарушен), либо не добавит (FR-41 нарушен). `custom` в FR-41 не назван, но существует в коде — это можно сохранить.
- **Что должно быть решено:** либо «day/week — только обзор, отчёты остаются month/quarter/year/custom» с явным open question/assumption, либо добавить day/week в отчёты и связать с `rangeFor`.

### H9. AD-17: нет ссылочных инвариантов для обязательств и корректировок

- **AD:** AD-17 (spine:144); AD-8 (spine:90).
- **FR/код:** FR-20/23; `js/storage.js:278–295` (проверки `transaction.accountId/categoryId`), `js/storage.js:329–407` (планы/вхождения).
- **Что не так:** в списке `validateState` нет:
  - `transaction.obligationId → obligations` (сирота-операция пройдёт импорт; после удаления обязательства останется «оплата» без долга);
  - `obligationAdjustments.obligationId → obligations` и уникальности id;
  - `transaction.obligationId` только у `type:'expense'` и только с `sys-interest`;
  - `plan.archived === obligation.archived` и `plan.recurrence/type` для связанного плана;
  - `obligationAdjustments.date` — валидная ISO-дата.
- **Почему high:** `validateState` — единственная точка отказа импорта; без этих проверок битый/чужой файл принимается и ломает `remaining`, P&L и баланс.
- **Что должно быть решено:** добавить перечисленные проверки в AD-17 (и `amount === ...` только для `obligationId != null`, см. C3).

---

## 4. Medium

### M1. AD-3: `isSafeMinor (>0)` для «всех сумм» против нулевого `openingBalance`

- **AD:** AD-3 (spine:60).
- **FR/код:** FR-1 (prd.md:101–108) «остаток не отрицателен»; `js/storage.js:222–224` (`openingBalance >= 0`), `js/accounts.js:38–40`.
- **Что:** `openingBalance` — денежное поле, но ноль допустим; AD-3 не перечисляет исключение. Буквальное применение `isSafeMinor` сломает счёт с нулевым остатком. Также `isSafeMinorSigned` для `principal` должен разрешать 0 (платёж ровно на проценты), а `delta` — нет; это не сказано.

### M2. AD-5: канал предупреждений миграции и восстановление `pre-v4`

- **AD:** AD-5 (spine:72).
- **Код:** `js/storage.js:46–149` (`migrate` возвращает state, не warnings), `js/storage.js:416–423` (`backupCorrupt` перезаписывает копию).
- **Что:** «если ключ сохранить нельзя — возвращает предупреждение, а не молчит» не определяет, куда возвращает (state? console? UI? ошибка?). «Сырой v3-конверт в `finance-tracker:pre-v4`» записывается, но нет ни одного правила/UI, как из него восстановиться; при safe mode (C1) это особенно важно. `:corrupt` «без перезаписи существующей копии» противоречит текущей реализации; нужно явно «сохранять первую копию».

### M3. AD-5/AD-2: read-only state и storage-событие

- **AD:** AD-5 (spine:72), AD-2 (spine:54).
- **Код:** `js/app.js:341–348` (storage event → `replace`), `js/store.js:30–34`.
- **Что:** на `forward`/`corrupt` `replace` заблокирован, но `storage`-событие из другой вкладки должно как-то обновить/не обновить состояние. Не сказано, что происходит с открытой второй вкладкой, которая пишет в v3, пока первая в safe mode. AD-2 stale-guard использует `updatedAt`, но не описано, где хранится «базовый» отпечаток и что делать с событием, пришедшим между чтением и записью.

### M4. AD-6: три итога не имеют названного селектора и фильтра активов

- **AD:** AD-6 (spine:78).
- **FR:** FR-3 (prd.md:120–128).
- **Что:** порядок и «всего = сумма» заданы, но нет правила, каким примитивом считать «расходные» и «накопления» (сейчас `totalBalance()` — только одна сумма; `buildDashboardOverview` возвращает `total/income/expense`). Плюс `liabilities` должны быть только по активным обязательствам (см. C2); без этого капитал в балансе считается от архивных. Мелко, но следующий юнит может сложить «расходные + накопления» из `accountBalance` и забыть архивные.

### M5. AD-13: FR-46 (аккордеон счетов), FR-49 (scroll/aria-current) не ратифицированы

- **AD:** AD-13 (spine:120).
- **FR/код:** FR-46 (prd.md:573–579) «список счетов раскрывается по нажатию»; FR-49 (prd.md:601–610) сброс `app.scrollTop`, `aria-current="page"`; `js/screens/dashboard.js:31–53` (список всегда развёрнут).
- **Что:** AD-13 фиксирует блок обязательств и отсутствие пятой вкладки, но не решает, появляется ли аккордеон счетов (это изменение выпущенного экрана) и сохраняются ли scroll/aria-инварианты. Это «тихие» требования §7.2/FR-49.

### M6. AD-16: `pwa.js`, `manifest.json`, иконки и обновление SW вне контракта

- **AD:** AD-16 (spine:136–138); Structural Seed (spine:183–240).
- **FR/код:** FR-54 (prd.md:654–661) «манифест и иконки соответствуют палитре»; `js/pwa.js:7–30` (`updateViaCache:'none'`, `controllerchange` reload), `manifest.json`, `AGENTS.md` (палитра в трёх местах).
- **Что:** AD-16 Binds `sw.js`, `check-precache`, docs; `pwa.js` не назван, в Structural Seed его нет (хотя он в `PRECACHE`). Нет правила обновления SW/отката, синхронизации палитры `manifest`/`icons`/CSS. Новый экран/модуль легко добавить в `PRECACHE`, но не тронуть регистрацию/обновление — офлайн-поведение останется старым.

### M7. NFR: 50 мс/<1 с не проверяемы; запись в localStorage не входит в бюджет

- **AD:** AD-16 (spine:138); NFR Guardrails (spine:164).
- **Код:** `js/store.js:18–22` (`structuredClone` + `JSON.stringify` на каждый commit), `js/storage.js:442–451`.
- **Что:** «≤ 50 мс на телефоне среднего класса» и «первый экран < 1 с» не имеют метода проверки (внешний харнесс может отсутствовать, автотестов в репо нет). При 10 000 операциях синхронная запись/клонирование может быть дороже 50 мс, но NFR этого не покрывает. Review R6 уже предлагал либо снять NFR, либо дать измеримую формулировку.

### M8. localStorage: ёмкость и общий origin не проверены

- **AD:** AD-11 (spine:108, quota toast); NFR «Объём» (spine:163).
- **FR/код:** FR-25/27 (автопереводы создают N операций на приход); `AGENTS.md` (ключ `finance-tracker:v1`, origin общий с другими проектами); `js/storage.js:20–23`, `MAX_IMPORT_BYTES`.
- **Что:** 10 000 операций + 5 000 вхождений + новые поля v4 + автопереводы могут приблизиться к ~5 МБ localStorage (особенно на общем `prokiller882.github.io`). Spine различает квоту в UI, но не задаёт бюджет/оценку и не говорит, считать ли автопереводы сверх лимита 10 000. Это риск технологии, а не только UX.

### M9. Deferred: бюджеты и FR-4 оставлены двумя развилками

- **AD/Deferred:** Deferred (spine:283–286).
- **FR:** FR-37 (prd.md:481–487) блокирует бюджет; FR-38 (prd.md:489–499) автоматически урезает; FR-4 (prd.md:130–137) списание остатка.
- **Что:** бюджеты: «эффективная сумма выводится, детерминированный раздатчик остатка» — но не сказано, что важнее при сохранении (отказ или урезание) и какой именно раздатчик (largest remainder, floor+остаток). FR-4: «либо архивировать после списания, либо удалять без проводки» — две разные модели, будущие юниты разойдутся. Для Deferred это допустимо только как явный open question, а его нет.

### M10. Open Questions неполны; A9 не определён

- **AD:** AD-10 (spine:102), AD-11, AD-12, AD-15; Open Questions (spine:294–301).
- **Что:** AD-10 ссылается на `[ASSUMPTION] A9`, но реестра A1–A9 и определения A9 в spine нет (A2/A4/A7 упомянуты, A9 — нет). В Open Questions отсутствуют: FR-27 vs AD-11 (H2), FR-41 day/week (H8), FR-23 delete (H6), FR-12 return (H1), AD-8 `asOf` (C2), AD-12 account-kind (H7). Читатель не может отличить «решено» от «отложено».

---

## 5. Low

- **L1. AD-9 формулировка:** «общие действия … обязаны отказать плану с `obligationId`» и тут же «правка плана сохраняет `obligationId/archived`» — противоречие; вероятно, имелось «не терять при внутренней правке», но буквально читается как разрешение.
- **L2. AD-7 «оценка» vs AD-10 «снимок»:** снимок `principal/interest` — это оценка на момент оплаты; в UI «оценка», в данных «заморожено». Стоит одной фразой разделить «расчётная оценка» и «сохранённый снимок».
- **L3. AD-13 блок обязательств:** FR-50 требует название, остаток, платёж и дату; AD-13 называет только факт блока/раскрытия. Поля и формат — в UX, но приёмочный минимум стоит зафиксировать.
- **L4. AD-16 `.nojekyll`/корень:** в Stack есть `/finance/`, но нет правила «не выкладывать в корень» и `.nojekyll`; `AGENTS.md` это уже требует.
- **L5. AD-5 `updatedAt`:** два commit в одну миллисекунду дадут одинаковый `updatedAt` и stale-guard не сработает; для одного пользователя редко, но правило стоит усилить (monotonic/revision).
- **L6. FR-55:** статус постоянного хранилища (три состояния) — baseline PWA, в spine не упомянут; если v4 увеличивает данные, честный статус становится важнее.
- **L7. AD-15 `custom`:** отчёты сохраняют `custom`, а `rangeFor` его не знает; это ок (отдельный `customRange`), но стоит назвать.
- **L8. AD-3 `isSafeMinorSigned`:** не определено, включает ли 0; для `principal = 0` (платёж = проценты) это важно.
- **L9. AD-14 `sys-writeoff`:** зарезервирован, но производителя нет (FR-4 deferred); валидация «sys-interest только obligation» не описывает будущий write-off; ок для deferred, но нужен маркер.
- **L10. Deferred FR-45 `mark`:** `null | 'wanted' | 'undesirable'`; «нежелательная — подмножество хотелок» — одно поле не выражает оба флага одновременно; соглашение (undesirable ⇒ wanted) не записано.

---

## 6. AD-by-AD

| AD | Ratifies code? | Rule исполнимо? | Binds/Prevents не декоративны? | Вердикт |
|---|---|---|---|---|
| AD-1 | **Нет** (`storage→schema`, `journal/payments→incomeStatement`, `app→store/storage`) | Частично | Да, но правило ложно о коде | **High** (H3) |
| AD-2 | Частично (commit boolean) | **Нет** без миграции вызовов/throw | Да | **High** (H4) |
| AD-3 | Частично (`openingBalance=0`) | Частично | Да | **Medium** (M1) |
| AD-4 | Частично (`rangeFor(Date)`) | **Нет** из-за цикла | Да | **High** (H5) |
| AD-5 | **Нет** (read/load сейчас сеют) | **Нет** (safe mode vs import) | Да | **Critical** (C1) + M2/M3 |
| AD-6 | Частично (одного итога нет) | Да | Да, но liabilities без active/asOf | **High** (C2) |
| AD-7 | Да (кроме measure-сигнатуры) | Да | Да | **OK/Medium** |
| AD-8 | Нет (`liabilities=0`) | **Нет** (`asOf`) | Да | **Critical** (C2) |
| AD-9 | Нет (plan archived не потребляется) | Частично (нет monthly/type/delete) | Да | **High** (H6) |
| AD-10 | Нет (paymentRow/return) | Частично | Да | **High** (H1) |
| AD-11 | Нет (normalize теряет поле) | Да, но FR-27 deviation | Да | **High** (H2) |
| AD-12 | Нет (forecast all accounts) | Частично (account kind/next income) | Да | **High** (H7) |
| AD-13 | Нет (upcoming/overdue меняются) | Да | Да | **Medium** (M5) |
| AD-14 | Нет (`sys-interest` не seed) | Да | Да | **Low/Medium** (L9) |
| AD-15 | Нет (rangeFor) | Да | Да | **High** (H8) |
| AD-16 | Частично (pwa.js отсутствует) | Да | Да, но NFR непроверяем | **Medium** (M6/M7) |
| AD-17 | Нет (toJSON/validate) | **Нет** (amount unconditional) | Да | **Critical** (C3) + H9 |

---

## 7. Capability coverage (PRD §7.2)

| Capability §7.2 | Покрытие | Проблема |
|---|---|---|
| Обязательства: форма, хранение, разбивка, возврат тела, архив, v4 (FR-15–23) | AD-5/8/9/10/13/17 | FR-23 delete не покрыт; FR-12 «Вернуть»; plan `monthly/type`; last payment cap. |
| Платёж в календаре и дневном лимите (FR-16–20, 30) | AD-7/9/10/12 | Last payment reserve; `paymentRow`; common update refusal без альтернативного UI. |
| Норма сбережений и счета накоплений (FR-2, 24–29) | AD-3/11/14/17 | Planned income «Получить»; FR-27 deviation; account kind change. |
| Дневной лимит: формула, карточка, нет поступления, отрицательные (FR-30–35, 47) | AD-3/4/6/12 | Account-kind filter; `nextIncome >= today`; free line 0; last payment. |
| Обзор: три итога, карточка, операции, диаграмма (FR-3, 46, 48) | AD-6/13/15 | FR-46 аккордеон; FR-49 scroll/aria; period/day-week. |
| Схема v4 и миграции (FR-53) | AD-5/9/14/17 | Ref invariants; warnings; restore; forward state UI. |
| P&L/ДДС/баланс (FR-41–43) | AD-6/7/8 | FR-41 day/week; liabilities active/asOf; incomeStatement Binds. |
| PWA/офлайн (FR-54) | AD-5/16 | `pwa.js`, manifest/icons/palette; SW update/rollback. |

**«Тихие» требования, которые стоит добавить в Capability Map/AD:** FR-12 «Вернуть», FR-23 delete, FR-29 приоритет (сейчас только выводится из AD-11/12), FR-31 пересчёт после смены дня, FR-33 строка свободных 0, FR-41 day/week, FR-46 аккордеон, FR-49 scroll/aria, FR-54 manifest/icons, FR-55 статус хранилища (baseline), NFR §5.

---

## 8. Deferred и Open Questions

**Deferred, что можно отложить:** FR-16 12 месяцев (презентационно), FR-45/57 (поля уже есть), уведомления/аккаунты/сервер, автотесты, продукт/визуал — корректно.

**Deferred, что позволяет разойтись:**
- Бюджеты: FR-37 «блокировать» vs FR-38 «урезать» — нет выбора; «детерминированный раздатчик» без метода.
- FR-4: «архивировать после списания» vs «удалять без проводки» — нет выбора.
- FR-45 `mark`: не записано, что `undesirable` влечёт `wanted` (иначе «подмножество» теряется).

**Open Questions:** 1–4 полезны, но нет A9 (хотя AD-10 на него ссылается) и нет пунктов H2/H8/H6/H1/C2/H7. Это не «открытые развилки PRD», а молчаливые решения spine; reviewer gate не может их ратифицировать.

---

## 9. Technology / environment check

| Технология | Проверка | Риск |
|---|---|---|
| Vanilla ES-модули, no build | Соответствует коду и AGENTS; `ES2022`; нет `package.json`. | Нет браузерного пола; `structuredClone`/`<dialog>`/`Intl` на целевом iPhone не зафиксированы. Low/Medium. |
| localStorage | Ключ `finance-tracker:v1`, JSON, синхронная запись. | ~5 МБ, общий origin; 10k ops + 5k occurrences + auto-transfers; нет бюджета ёмкости; sync save не в NFR. Medium (M8). |
| Service Worker / Cache API | `sw.js`, `PRECACHE`, `CACHE`, `check-precache`; `updateViaCache:'none'`, `controllerchange` в `pwa.js`. | `pwa.js` не в AD-16/Seed; нет правила обновления/отката; old shell vs v4. Medium (M6). |
| GitHub Pages `/finance/` | Stack/AD-16 фиксируют подпапку. | Нет `.nojekyll`/запрета корня в spine; scope SW. Low (L4). |
| Node 22.11.0 (внешний харнесс) | Соответствует AGENTS. | Харнесс вне репо, может отсутствовать; автотестов нет; NFR 50 мс не проверяем. Medium (M7). |
| Inline SVG / no chart lib | AD-15, соответствует no-build. | Нет. |
| `navigator.share`/persist | `pwa.js`/`storage.js` feature-detect. | FR-55 не в spine; не блокер. Low. |

---

## 10. Минимальный набор правок до ratify (не меняя spine здесь)

1. **AD-5:** recovery-путь (import/reset) в safe mode + restore из `:pre-v4`; определить канал warnings; `:corrupt` first-copy.
2. **AD-8:** `remaining(..., asOf)`, active-only liabilities, передача `asOf` в `buildBalanceSheet`; добавить `reports/incomeStatement.js` в Binds для строки «Корректировка».
3. **AD-17:** условие `obligationId != null` для `amount === principal + interest`; ссылки `transaction.obligationId`, `adjustment.obligationId`; `plan.archived === obligation.archived`; `type/recurrence` плана.
4. **AD-10/AD-9:** `return` оплаты, маршрут правки оплаты, `paymentRow` в Binds/Seed; delete обязательства; future skipped.
5. **AD-11:** Open Question по FR-27 (in-place vs delete/recreate) или буквальный FR-27; `payPlannedPayment` в триггеры нормы.
6. **AD-1/AD-4:** `schema.js` в storage; разрешить read-only `reports/*` чистым модулям; composition root исключение; убрать цикл `format↔recurrence`.
7. **AD-2:** миграция всех вызовов `commit` + catch мутаторов → `invalid`; monotonic/revision вместо `updatedAt` при необходимости.
8. **AD-12/AD-15:** account-kind filter, `nextIncome >= today`, last-payment cap; day/week в отчётах или open question; FR-33 free line.
9. **AD-16:** `pwa.js`/manifest/icons/SW update/rollback; измеримая NFR или снять 50 мс.
10. **Deferred/Open Questions:** бюджеты FR-37 vs 38; FR-4; A9 registry; FR-12/23/41/46/54 в карту.

---

**Итог:** spine — хорошая основа для эпиков, но текущая редакция ещё не является архитектурным контрактом: три critical (AD-5, AD-8, AD-17) надо закрыть до нарезки сторис; high-пункты можно разнести по сторис, но каждый должен получить явное решение в AD/Open Question.
