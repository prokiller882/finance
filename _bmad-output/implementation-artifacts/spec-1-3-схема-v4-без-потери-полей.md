---
title: '1.3 Схема v4 без потери полей'
type: 'feature'
created: '2026-11-23'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `SCHEMA_VERSION` — 3, а следующим эпикам нужны обязательства, норма, системные категории и разбивка платежа. `migrate()` теряет неизвестные ключи, а правка операции/плана пересобирает сущность и стирает чужие поля. Сбой миграции может переписать v3 без пути назад.

**Approach:** v4 с умолчаниями; `migrate()` сохраняет неизвестное и отдаёт `warnings[]`; перед первой записью v4 сырой v3 уходит в `PRE_V4_KEY`, иначе миграция не пишется. В настройках — восстановление и удаление копии pre-v4 с подтверждением.

## Boundaries & Constraints

**Always:** `PRE_V4_KEY` пишется только перед первой записью v4, не перезаписывается и не удаляется сам; непустой ключ на старте не теряется. Неизвестные поля сущностей и верхнеуровневые ключи сохраняются в `state` и экспорте; правка операции/плана сливает текущие поля с новыми. `warnings[]` — путь и причина по-русски, текстом, без `innerHTML`. v1/v2 мигрируют в v4; версия выше текущей отклоняется до миграции; импорт валидируется целиком до записи. Поля проходят `create → validate → toJSON → migrate → validateState → seed`.

**Решено с автором:** `warnings[]` возникает только когда на месте поля v4 лежит значение не той формы — подставляется умолчание с путём и причиной; всё остальное сохраняется как есть. Список показывается блоком «Данные обновлены» в настройках, факт показа — в `finance-tracker:meta`, повторно не всплывает. Если `pre-v4` не помещается, приложение не стартует в обычном режиме: экран блокировки с причиной, выгрузкой исходных данных и советом освободить место, без сброса. Релиз A проверен на телефоне; релиз B проходит такую же проверку после выкатки.

**Never:** не создавать переводы задним числом, не переписывать операции и планы; не добавлять семантику обязательств, нормы, системных категорий и бюджетов (эпики 2–5, 1.4) — только поля и умолчания; не трогать отчёты, роутер, тему и стили сверх блока настроек; не менять ключ `finance-tracker:v1`, не удалять `:corrupt`, не добавлять зависимости, сеть, `package.json`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| BOOT_V3 | валидный v3, места хватает | `PRE_V4_KEY` = сырой v3, живой ключ = v4 | N/A |
| NO_SPACE | pre-v4 не помещается | миграция не пишется, v3 не тронут | экран блокировки с выгрузкой |
| UNKNOWN | лишние поля сущности и верхнеуровневый ключ | остаются в `state`, экспорте и после правки | N/A |
| INCOMPATIBLE | место v4-поля занято не тем типом | умолчание + `warnings[]` | список в настройках, отметка в `meta` |
| FORWARD | `schemaVersion` > 4 | отказ до миграции, ключ прежний | `UNSUPPORTED_VERSION` |
| PRE_V4 | восстановить / удалить после confirm | replace на новом `rev`; копия цела до удаления | отказ — тост |

</frozen-after-approval>

## Code Map

- `js/schema.js:3` -- версия 4.
- `js/storage.js:60-150` -- `migrate`: умолчания, неизвестные ключи, `warnings[]`. `:455-540` -- чтение и запись с копией pre-v4. `:170-430` -- `validateState`. `:612-650` -- импорт.
- `js/models/{category,transaction,plannedPayment}.js` -- поля v4 в `create`, `toJSON`, `validate`.
- `js/seed.js:14-30` -- сид в v4.
- `js/app.js:65-115` -- слияние при правке; восстановление/удаление pre-v4 рядом с `recoverFromRaw` (`:383`).
- `js/screens/safeMode.js:39-130` -- вариант экрана для статуса «нет места под копию» с выгрузкой.
- `js/screens/settings.js:152-175`, `index.html:225-310` -- блок pre-v4 и предупреждения.
- `docs/extending.md:12`, `docs/qa-checklist.md:42-56`, `AGENTS.md`, `~/finance-tests/{storage,imports,dom,safe-mode}.mjs` -- контракт и проверки.

## Tasks & Acceptance

**Execution:**
- [ ] `js/storage.js` -- умолчания v4, неизвестное, `warnings[]`, копия pre-v4 и отказ без записи, проверки полей -- данные не теряются молча.
- [ ] `js/models/*`, `js/seed.js` -- поля v4 с умолчаниями -- валидация из одного места, чистый старт без миграции.
- [ ] `js/app.js`, `js/screens/safeMode.js` -- слияние при правке, восстановление и удаление копии, ветка экрана блокировки при нехватке места -- чужие поля, откат и понятный отказ.
- [ ] `js/screens/settings.js`, `index.html` -- блок pre-v4 с confirm и список предупреждений -- видимость откатa.
- [ ] `docs/*`, `AGENTS.md`, `~/finance-tests/*` -- контракт и проверки.

**Acceptance Criteria:**
- Given v3 с лишними полями, when старт, then `PRE_V4_KEY` = исходный текст, живой ключ v4, лишнее в `state` и экспорте.
- Given вторая перезагрузка, when она происходит, then `PRE_V4_KEY` не перезаписан.
- Given правка операции/плана, when сохранение, then неизвестные поля на месте.
- Given восстановление с confirm, when завершено, then обычный экран на новом `rev`, копия доступна; отмена confirm не меняет ничего.
- Given `node scripts/check-precache.mjs`, when правка сдана, then проверка проходит.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `node scripts/check-precache.mjs` -- expected: `✓ PRECACHE`, актуальный `CACHE`.
- `cd ~/finance-tests && ./node-v22.11.0-linux-x64/bin/node storage.mjs` -- expected: `storage ok`; затем `imports.mjs`, `dom.mjs`, `safe-mode.mjs`, `logic.mjs`, `nav.mjs`, `direct.mjs`.
