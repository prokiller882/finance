import * as storage from './storage.js';

export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  function emit() {
    for (const listener of listeners) listener(state);
  }

  /**
   * Изменяет состояние, сохраняет его и уведомляет подписчиков.
   * @returns {boolean} удалось ли записать данные в localStorage
   */
  function commit(mutator) {
    // Мутируем копию: если localStorage переполнен, состояние не должно
    // разойтись с сохранённым.
    const draft = structuredClone(state);
    mutator(draft);
    draft.updatedAt = new Date().toISOString();

    if (!storage.saveState(draft)) return false;

    state = draft;
    emit();
    return true;
  }

  /** Замена состояния целиком (импорт, синхронизация вкладок). */
  function replace(next, { persist = false } = {}) {
    state = next;
    if (persist) storage.saveState(state);
    emit();
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
