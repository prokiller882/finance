import * as storage from './storage.js';
import { ValidationError } from './models/index.js';

function revOf(state) {
  return Number.isSafeInteger(state?.rev) && state.rev >= 0 ? state.rev : 0;
}

export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  function emit() {
    for (const listener of listeners) listener(state);
  }

  /**
   * Изменяет состояние, сохраняет его и уведомляет подписчиков.
   * Сначала сверяет базовую ревизию: если в другой вкладке уже записали
   * свежие данные, мутация отклоняется и чужая запись не затирается.
   * @returns {{ ok: true } | { ok: false, reason: 'invalid' | 'stale' | 'quota' }}
   */
  function commit(mutator) {
    const baseRev = revOf(state);
    const storedRev = storage.readStoredRev();
    if (storedRev !== null && storedRev > baseRev) {
      return { ok: false, reason: 'stale' };
    }

    // Мутируем копию: если localStorage переполнен, состояние не должно
    // разойтись с сохранённым.
    const draft = structuredClone(state);
    try {
      mutator(draft);
    } catch (error) {
      if (error instanceof ValidationError) return { ok: false, reason: 'invalid' };
      throw error;
    }

    draft.rev = baseRev + 1;
    draft.updatedAt = new Date().toISOString();

    const saved = storage.saveState(draft);
    if (!saved.ok) return saved;

    state = draft;
    emit();
    return { ok: true };
  }

  /**
   * Замена состояния целиком (импорт, сброс, синхронизация вкладок).
   * При persist данные сначала сохраняются и публикуются только при успехе.
   * @returns {{ ok: true } | { ok: false, reason: 'invalid' | 'quota' }}
   */
  function replace(next, { persist = false } = {}) {
    if (!persist) {
      // Событие хранилища: принимаем ревизию другой вкладки без инкремента.
      state = next;
      emit();
      return { ok: true };
    }

    const draft = {
      ...next,
      rev: Math.max(revOf(state), revOf(next), storage.readStoredRev() ?? 0) + 1,
    };
    const saved = storage.saveState(draft);
    if (!saved.ok) return saved;

    state = draft;
    emit();
    return { ok: true };
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    getState: () => state,
    commit,
    replace,
    subscribe,
  };
}
