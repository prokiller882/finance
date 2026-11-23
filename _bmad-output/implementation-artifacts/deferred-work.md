- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-сохранение-честно-сообщает-результат.md`
  summary: Импорт и сброс (`store.replace(…, { persist: true })`) не сверяют сохранённый `rev`, поэтому устаревшая вкладка может заменить более свежий журнал.
  evidence: Замороженный Approach этой сторис задаёт для `replace` только save-before-publish, а сверку `rev` — только для `commit`; импорт и сброс и раньше были разрушительными действиями с confirm. Проблема предсуществующая, вне объёма 1.1.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-сохранение-честно-сообщает-результат.md`
  summary: `loadState()` игнорирует результат `saveState()` при миграции и сиде, поэтому сбой записи на старте (например, квота) остаётся невидимым.
  evidence: Старый `saveState()` возвращал boolean, который `loadState()` тоже не проверял; поведение не изменилось этой сторис и не входит в контракт `commit`/`replace`.
