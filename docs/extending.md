# Как расширять приложение

Справочник по устройству кода и пошаговые инструкции для типовых правок. Открывайте перед задачей «добавить экран, overlay, отчёт, правило повторения, поле схемы или новый модуль».

## Карта файлов

- `index.html` — статический каркас экранов внутри `.app-shell` (шапка с шестерёнкой настроек + скроллящийся `#app`), нижний таббар (Обзор, Календарь, Отчёты, `+`), переключатели месяца на обзоре, в журнале и календаре; таббар, тост и модальные формы `#tx-sheet`/`#plan-sheet` — вне шелла. Разметка живёт здесь, JS только наполняет контейнеры.
- `js/app.js` — bootstrap, глобальные `actions`, тема (`data-theme`), тосты, синхронизация вкладок; создаёт экраны, overlay формы операции и планового платежа, связывает Dashboard, журнал и календарь.
- `js/router.js` — hash-роутер: `#/dashboard`, `#/transactions`, `#/calendar`, `#/reports/{balance|income|cashflow}`, `#/settings`; `#/add` и `#/edit/{id}` — overlay операции, `#/calendar/add` и `#/calendar/edit/{id}` — overlay планового платежа поверх текущего экрана. `#/reports` и неизвестные пути заменяются через `replaceState`.
- `js/store.js` — единственный источник истины: `commit()` сверяет базовый `rev` с сохранённым (`storage.readStoredRev()`), клонирует состояние, сохраняет и только потом публикует. Результат — `{ ok: true }` или `{ ok: false, reason }` (`invalid`, `stale`, `quota`); проверять только `result.ok`, текст сбоя — `saveFailureMessage(reason)` из `labels.js`. `replace(next, { persist })` сохраняет до публикации и поднимает `rev` не ниже сохранённого.
- `js/schema.js` — `SCHEMA_VERSION` (сейчас `3`), общий для seed и storage; storage реэкспортирует его.
- `js/storage.js` — localStorage, ключ `finance-tracker:v1`, `SCHEMA_VERSION`, `migrate()`, `validateState()`, `StorageError`; в конверте живёт целочисленный `rev`: `readStoredRev()` отдаёт сохранённую ревизию, `saveState()` возвращает `{ ok, reason }`; повреждённые данные уходят в `finance-tracker:corrupt`; импорт/экспорт JSON — `parseImportFile()`/`downloadState()`/`shareState()`; метаданные копий — `readMeta()`/`markExported()` в отдельном ключе `finance-tracker:meta`.
- `js/pwa.js` — регистрация service worker, запрос постоянного хранилища (`persist()`/`persisted()`) и возраст последней копии; не трогает состояние финансов.
- `manifest.json`, `sw.js`, `icons/*` — PWA: установка на Android, офлайн-кэш оболочки, иконки 192/512/maskable. `.nojekyll` нужен для GitHub Pages.
- `js/models/*` — классы `Transaction`, `Category`, `Budget`, `PlannedPayment`, `PaymentOccurrence`: `create()`, `fromJSON()`, `validate()`, `toJSON()`. В `state` и localStorage остаются plain-объекты, потому что `store.commit()` использует `structuredClone`.
- `js/screens/*` — фабрики экранов, контракт `{ id, title, titleFor?(path), init(root), show?(path), render() }`. `init` вызывается один раз, `show` — при входе на экран, `render` — при входе и на каждое изменение store. `titleFor` нужен отчётам для заголовка по маршруту. Dashboard, журнал и календарь дополнительно отдают `getMonth()`/`setMonth()`; календарь — ещё `getSelectedDate()`/`setSelectedDate()`.
- `js/screens/settings.js` — настройки: счета (добавление, редактирование, архив, удаление), категории, валюта/тема, резервные копии и статус хранилища, импорт/экспорт/сброс.
- `js/screens/calendar.js` — подэкран обзора: сетка месяца, список выбранного дня, блок просрочки, сводка, прогноз остатков и действия «Оплатить»/«Пропустить»/«Вернуть».
- `js/components/transactionSheet.js` — компонент модальной формы операции: `open({ basePath, mode, transactionId })`, `close()`, `render()`, `isOpen()`. Не является экраном и живёт в `<dialog>`.
- `js/components/plannedPaymentSheet.js` — форма создания/редактирования планового платежа: тип, сумма, счёт, категория, дата, повторение и «повторять до»; `open({ basePath, mode, planId })`.
- `js/components/transactionRow.js` — общая строка операции для обзора и журнала: сумма, подпись, ссылка `#/edit/{id}` и удаление через `data-action="delete-tx"`.
- `js/components/paymentRow.js` — строка планового платежа для календаря и блока просрочки: сумма, статус, ссылки на редактирование плана/оплаченной операции и действия.
- `js/journal.js` — чистая выборка журнала по месяцу, типу, счёту, категории и поисковой строке; DOM и localStorage не трогает.
- `js/payments.js` — чистые выборки платежей: вхождения месяца, сводка, просрочка, ближайшие платежи и прогноз остатков; DOM и localStorage не трогает.
- `js/recurrence.js` — генерация дат повторяющихся платежей (`occursOn`, `plannedDatesInRange`, `seriesStartDate`, `datesInMonth`), перенос 31-го числа и 29 февраля; DOM и localStorage не трогает.
- `js/accounts.js` — чистая валидация счёта (`normalizeAccountInput()`) и проверка ссылок операций/планов (`accountHasOperations()`, `accountHasPlannedPayments()`); DOM и localStorage не трогает.
- `js/reports/*` — чистые функции отчётов, DOM и localStorage не трогают; `overview.js` собирает сводку обзора.

## Пошаговые инструкции

- Новый экран: `section` внутри `<main id="app">` (`id="screen-<id>"`, `class="screen"`, `data-screen="<id>"`) → фабрика в `js/screens/` → регистрация в `screens` в `js/app.js` → маршрут и `tabFor()` в `js/router.js`. Если экран должен быть в таббаре — ссылка с `data-route` и ветка в `tabFor()`; если это подэкран, как журнал, — ссылка с другого экрана, `back: true` в маршруте и активная родительская вкладка; если экран открывается из шапки, как настройки, — кнопка в `.app-header`, `back: true`, `tabFor()` → `null` и активное состояние кнопки в `updateChrome()`. При изменении числа вкладок обновить `grid-template-columns` таббара (сейчас 4: три вкладки и `+` справа).
- Новый overlay: компонент в `js/components/` с `open(context)`/`close()`/`render()` → `overlays` в `js/app.js` под уникальным `name` → ветка `parseOverlay()`/`handleOverlay()` в `router.js` с базовым экраном и `router.back()` для закрытия. `open()` возвращает `false`, если контекст невалиден; роутер откатывается на базовый экран. Не добавлять overlay в `screens`.
- Новое правило повторения: функция в `js/recurrence.js` и ветка в `occursOn()`/`plannedDatesInRange()`; экран и `payments.js` не должны считать даты сами. Проверить перенос дня 31 и 29 февраля, границу `endDate` и месяц создания серии.
- Новый отчёт: чистая функция в `js/reports/` → рендер в `js/screens/reports.js` → ключ в `REPORT_KEYS`/`REPORT_TITLES` и ссылка в `#report-tabs` → заголовок в `titleFor()`.
- Новая выборка/фильтр: чистая функция рядом с доменом (как `js/journal.js`) → экран только наполняет DOM; не смешивать фильтрацию с localStorage.
- Любая правка карты, инвариантов, маршрутов или способа запуска сопровождается обновлением этого файла и чек-листа ниже.
- Новое поле схемы: обновить `SCHEMA_VERSION` в `js/schema.js` и `migrate()`, не полагаться на то, что старые данные его содержат.
- Новая сущность: класс в `js/models/` с `create/fromJSON/validate/toJSON` → экспорт в `js/models/index.js` → проверка ссылок и уникальности в `validateState()` → миграция старого состояния и seed.
- Подписи счетов и количество операций — через `accountSubtitle()`/`operationsCount()` из `labels.js`, чтобы не дублировать тип счёта и не ломать склонение.
- Новый JS-модуль: добавить путь в `PRECACHE` в `sw.js` и поднять версию `CACHE`, иначе офлайн-режим сломается. После `git push` в `main` GitHub Pages пересобирает сайт; обновление service worker может занять несколько минут из-за кэша.
- Визуальная правка: сверяться с `DESIGN.md`; закрытая проблема из раздела 9 переводится в `готово` в той же правке, новая находка — добавляется строкой. Прогон: `python3 ~/.config/opencode/skills/unslop-design/scripts/unslop-score.py . --context DESIGN.md`.
