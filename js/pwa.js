const SW_URL = new URL('../sw.js', import.meta.url);
const DAY_MS = 24 * 60 * 60 * 1000;

let persistedPromise = null;

/** Регистрирует service worker только там, где он вообще разрешён. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  let hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Первая установка: clients.claim() забирает страницу под контроль,
    // перезагружать её из-за этого не нужно.
    if (!hadController) {
      hadController = true;
      return;
    }
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_URL, { updateViaCache: 'none' }).catch((error) => {
      console.warn('Не удалось зарегистрировать service worker', error);
    });
  });
}

/**
 * Просит браузер не вытеснять данные автоматически.
 * Возвращает true/false или null, если API недоступен.
 */
export function ensurePersistentStorage() {
  if (!navigator.storage?.persist) return Promise.resolve(null);
  if (persistedPromise) return persistedPromise;

  persistedPromise = (async () => {
    try {
      if (navigator.storage.persisted && await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch (error) {
      console.warn('Не удалось запросить постоянное хранилище', error);
      return null;
    }
  })();

  return persistedPromise;
}

/** Текущий статус постоянного хранилища: true/false/null. */
export async function isStoragePersisted() {
  if (!navigator.storage?.persisted) return null;
  try {
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}

/** Сколько дней прошло с даты последней копии, либо null. */
export function daysSince(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / DAY_MS));
}
