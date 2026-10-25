/*
 * Кэш оболочки приложения. При добавлении нового JS-модуля обязательно
 * добавьте его в PRECACHE и поднимите версию CACHE, иначе офлайн-режим
 * будет падать на отсутствующем модуле.
 */
const CACHE = 'finance-shell-v1';
const INDEX_URL = new URL('index.html', self.registration.scope).href;
const SCOPE_PATH = new URL('./', self.location).pathname;

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/accounts.js',
  './js/app.js',
  './js/components/transactionRow.js',
  './js/components/transactionSheet.js',
  './js/dom.js',
  './js/format.js',
  './js/journal.js',
  './js/labels.js',
  './js/models/budget.js',
  './js/models/category.js',
  './js/models/index.js',
  './js/models/transaction.js',
  './js/models/validation.js',
  './js/pwa.js',
  './js/reports/balanceSheet.js',
  './js/reports/cashFlow.js',
  './js/reports/incomeStatement.js',
  './js/reports/overview.js',
  './js/router.js',
  './js/schema.js',
  './js/screens/dashboard.js',
  './js/screens/reports.js',
  './js/screens/settings.js',
  './js/screens/transactions.js',
  './js/seed.js',
  './js/storage.js',
  './js/store.js',
  './js/util.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

function putInCache(request, response) {
  if (!response.ok || response.type !== 'basic') return;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(SCOPE_PATH)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          putInCache(request, response);
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(INDEX_URL);
          if (cached) return cached;
          return new Response('Нет сети, а копия приложения не найдена.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        putInCache(request, response);
        return response;
      })
      .catch(async () => (await caches.match(request)) || Response.error()),
  );
});
