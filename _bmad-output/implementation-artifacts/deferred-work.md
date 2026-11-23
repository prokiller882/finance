- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-сохранение-честно-сообщает-результат.md`
  summary: Импорт и сброс (`store.replace(…, { persist: true })`) не сверяют сохранённый `rev`, поэтому устаревшая вкладка может заменить более свежий журнал.
  evidence: Замороженный Approach этой сторис задаёт для `replace` только save-before-publish, а сверку `rev` — только для `commit`; импорт и сброс и раньше были разрушительными действиями с confirm. Проблема предсуществующая, вне объёма 1.1.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-сохранение-честно-сообщает-результат.md`
  summary: `loadState()` игнорирует результат `saveState()` при миграции и сиде, поэтому сбой записи на старте (например, квота) остаётся невидимым.
  evidence: Старый `saveState()` возвращал boolean, который `loadState()` тоже не проверял; поведение не изменилось этой сторис и не входит в контракт `commit`/`replace`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-безопасный-режим-вместо-пустого-приложения.md`
  summary: Storage-событие с `status: empty` (ключ удалён в другой вкладке) игнорируется, и устаревшая вкладка может вернуть удалённые данные следующим `commit`.
  evidence: Поведение предсуществующее: до правки `readState()` возвращал `null`, и обработчик тоже выходил без действий; сторис 1.2 меняет только ветки `forward`/`corrupt`/`ok`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-безопасный-режим-вместо-пустого-приложения.md`
  summary: `AGENTS.md` описывает только баннер safe mode, но не тост «перезагрузите страницу» для `forward`/`corrupt` в обычном режиме.
  evidence: Поведение реализовано и покрыто `safe-mode.mjs` (`normal-storage`), но его описание требует правки agent-context файла, что по правилам шага выносится в отдельную задачу.

