# Reality-check review — ARCHITECTURE-SPINE

**Вердикт:** Spine не готов как контракт: 3 critical (localStorage/NFR, якорь recurrence, safe mode) и 8+ high/medium, где решения выданы за проверенные (FR-20/12, FR-27, FR-41, AD-8/asOf, commit/ok, two-step).

## Critical

1. **NFR 10 000 операций + 5 000 вхождений несовместим с localStorage ~5 MiB.** V4-операция ≈443 байта × 10k = 4,22 MiB; вхождение ≈262 × 5k = 1,25 MiB; итого >5 MiB без счетов/категорий/планов. `pre-v4` копия удваивает объём, а `store.replace()` игнорирует неудачу `saveState()`. Evidence: spine:163,72; `js/storage.js:23,442-450`; `js/store.js:30-33`; `js/app.js:283-287`. Исправление: 5k вхождений — производный объём, в state только paid/skipped; бюджет 4,5 MiB; pre-v4 только если помещается; replace сохраняет первым и возвращает ошибку.
2. **`plan.startDate = первое вхождение` ломает якорь 31-го.** Обязательство создано в феврале с `paymentDay: 31` → первое вхождение 28.02; recurrence берёт день из `startDate` → 28.03, 28.04. Evidence: spine:96; `js/recurrence.js:20-22,52-54,80-86`; PRD FR-11. Исправление: `plan.anchorDay` из `paymentDay`.
3. **Safe mode объявлен, но boot-пути нет.** `readState()` меняет контракт, `loadState()` не сеет, но `app.js:25` сразу `createStore(loadState())`, `applyTheme()` читает `settings.theme`, экраны ждут полный state. В Structural Seed не было safe-mode экрана/блокировки. Evidence: spine:72; `js/app.js:25,39-49`; `js/store.js:3-47`; `js/storage.js:453-465`. Исправление: `screens/safeMode.js`, ветка bootstrap, recovery-действия.

## High

4. **Ordered obligation payments + запрет edit/delete противоречат FR-20/FR-12 и текущему UI.** `restorePlannedPayment` для paid бросает (`js/app.js:192-203`, line 198), `paymentRow` показывает «Вернуть» только для skipped (`js/components/paymentRow.js:48`), `transactionRow`/общая форма для обязательств будут скрыты/отвергнуты — пути вернуть/отредактировать оплату нет. Исправление: `returnObligationPayment`, `paymentRow`/`transactionRow` маршруты, overlay правки оплаты.
5. **In-place sync переводов противоречит FR-27.** PRD требует «удаляет старые и создаёт новые по снимку»; spine сохраняет id/createdAt и не создаёт недостающие. Нужно вынести в Open Questions (A10) или переписать под FR-27.
6. **`remaining` без `asOf`** — прошлый баланс меняется будущим платежом; FR-43 требует баланс на дату.
7. **`amount === principal + interest` безусловно** — отвергнет обычные операции; нужно условие `obligationId != null`.
8. **AD-1 не ратифицирует импорты:** `storage → schema`, `journal/payments → incomeStatement`, `app → store/storage`.
9. **`commit` меняет boolean на объект** — старые `if (!saved)` увидят успех при ошибке; нет плана миграции и конвертации throw в `invalid`.
10. **`format ↔ recurrence` цикл** из-за `addMonthsClamped → clampDay`.
11. **FR-41 требует day/week в отчётах**, а spine оставлял их только на обзоре.
12. **`nextIncome` может быть в прошлом**, `days` отрицательный.
13. **Счёт обязательства может быть накоплений**; база лимита их исключает, резерв включает.
14. **Отрицательный `remaining` через импорт**; нет проверки в `validateState`.
15. **Обязательство без плана**; импорт может создать долг без расписания.
16. **Проекция плана неполная:** нет `type: 'monthly'`/`recurrence`, `id/createdAt` могут пересоздаться.
17. **Последний платёж резервируется по `contractPayment`**, а спишется `remaining + interest`.

## Medium / Low

- `openingBalance = 0` не проходит `isSafeMinor (>0)`.
- Канал предупреждений миграции и восстановление `pre-v4` не описаны.
- read-only state и storage-событие не связаны.
- Три итога не имеют названного селектора.
- FR-46 аккордеон и FR-49 scroll/aria не ратифицированы.
- `pwa.js`, `manifest.json`, иконки и палитра вне контракта; `.nojekyll`/запрет корня.
- NFR 50 мс/<1 с не проверяемы; запись в localStorage не входит в бюджет.
- localStorage ёмкость и общий origin не проверены; автопереводы сверх лимита.
- Deferred бюджеты/FR-4 оставлены двумя развилками без решения.
- Open Questions неполны; A9 не определён.
- `sys-interest` может коллидировать по имени при миграции.
- `savingsRateBp` без пер-аккаунтного диапазона.
- `sourceTransactionId` без проверки типа/уникальности.
- `obligationAdjustment.obligationId` не проверяется.
- `obligation.archived` отсутствует в дефолтах/валидации.
- `parseRateBp` не говорит, что делать с >2 знаками.
- `rangeFor`/`today` дефолты в чистых модулях.
