const DEFAULT_PATH = '/dashboard';
const ADD_PATH = '/add';
const TRANSACTIONS_PATH = '/transactions';
const EDIT_PATH_RE = /^\/edit\/([^/]+)$/;
const REPORT_KEYS = new Set(['balance', 'income', 'cashflow']);

export function createRouter({ screens, overlays = {}, defaultPath = DEFAULT_PATH }) {
  const inited = new Set();
  let currentScreen = null;
  let currentPath = null;
  let previousPath = null;
  let currentOverlay = null;
  let overlayBasePath = null;

  function parsePath() {
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) return defaultPath;
    const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
    const trimmed = withSlash.replace(/\/+$/, '');
    return trimmed || defaultPath;
  }

  function parseOverlay(path) {
    if (!path) return null;
    if (path === ADD_PATH) {
      return { path, mode: 'create', transactionId: null };
    }

    const match = path.match(EDIT_PATH_RE);
    if (match) {
      let transactionId = match[1];
      try {
        transactionId = decodeURIComponent(transactionId);
      } catch {
        /* оставляем id как есть */
      }
      return { path, mode: 'edit', transactionId };
    }

    return null;
  }

  function isOverlayPath(path) {
    return Boolean(parseOverlay(path));
  }

  // Скроллится #app, а не window: body зафиксирован каркасом.
  function resetScroll() {
    const app = document.getElementById('app');
    if (app) app.scrollTop = 0;
  }

  function makeRoute(screen, path, extra = {}) {
    return {
      screen,
      path,
      title: screen.titleFor ? screen.titleFor(path) : screen.title,
      back: false,
      redirect: false,
      ...extra,
    };
  }

  function resolve(path) {
    if (!path) return null;
    if (path === '/' || path === defaultPath) return makeRoute(screens.dashboard, defaultPath);
    if (path === '/reports') return makeRoute(screens.reports, '/reports/balance', { redirect: true });
    const reportKey = path.split('/')[2];
    if (path.startsWith('/reports/') && REPORT_KEYS.has(reportKey)) {
      return makeRoute(screens.reports, path);
    }
    if (path === TRANSACTIONS_PATH) {
      return makeRoute(screens.transactions, TRANSACTIONS_PATH, { back: true });
    }
    if (path === '/settings') return makeRoute(screens.settings, '/settings');
    return null;
  }

  function tabFor(path) {
    if (path === defaultPath) return '/dashboard';
    if (path === TRANSACTIONS_PATH) return '/dashboard';
    if (path.startsWith('/reports')) return '/reports';
    if (path === '/settings') return '/settings';
    return null;
  }

  function ensureInit(screen) {
    if (inited.has(screen)) return;
    const root = document.getElementById(`screen-${screen.id}`);
    if (!root) throw new Error(`Не найден контейнер экрана: screen-${screen.id}`);
    screen.init?.(root);
    inited.add(screen);
  }

  function updateChrome(match) {
    for (const section of document.querySelectorAll('.screen')) {
      section.hidden = section.dataset.screen !== match.screen.id;
    }

    const title = document.getElementById('screen-title');
    title.textContent = match.title;
    document.title = `${match.title} · Финансы`;

    const backButton = document.getElementById('back-btn');
    if (backButton) backButton.hidden = !match.back;

    const activeTab = tabFor(match.tabPath || match.path);
    for (const link of document.querySelectorAll('.tabbar__link')) {
      if (link.dataset.route === activeTab) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }

    const action = document.querySelector('.tabbar__action');
    if (action) {
      if (match.path === ADD_PATH) action.setAttribute('aria-current', 'page');
      else action.removeAttribute('aria-current');
    }
  }

  function openOverlay(name, context) {
    const overlay = overlays[name];
    if (!overlay) return false;
    if (currentOverlay && currentOverlay !== name) closeOverlay();
    currentOverlay = name;
    return overlay.open?.(context) !== false;
  }

  function closeOverlay() {
    if (!currentOverlay) return;
    const overlay = overlays[currentOverlay];
    currentOverlay = null;
    overlay?.close?.();
  }

  function handleOverlay(overlay) {
    const alreadyOpen = isOverlayPath(currentPath);
    const basePath = alreadyOpen
      ? (overlayBasePath || defaultPath)
      : (currentPath || defaultPath);

    let base = resolve(basePath);
    if (base?.redirect) base = resolve(base.path);
    if (!base) base = resolve(defaultPath);

    if (!alreadyOpen) previousPath = currentPath;
    currentPath = overlay.path;
    currentScreen = base.screen;
    overlayBasePath = base.path;

    ensureInit(base.screen);
    updateChrome({
      ...base,
      path: overlay.path,
      title: overlay.mode === 'edit' ? 'Редактировать операцию' : 'Новая операция',
      back: false,
      overlay: 'transaction',
      tabPath: overlay.mode === 'edit' ? base.path : null,
    });
    base.screen.show?.(base.path);
    base.screen.render?.();

    const opened = openOverlay('transaction', {
      basePath: base.path,
      mode: overlay.mode,
      transactionId: overlay.transactionId,
    });

    if (!opened) {
      closeOverlay();
      replace(base.path);
    }
  }

  function handleLocation({ initial = false } = {}) {
    let path = parsePath();
    const overlay = parseOverlay(path);
    if (overlay) {
      handleOverlay(overlay);
      return;
    }

    const cameFromOverlay = isOverlayPath(currentPath);
    const overlayBase = overlayBasePath;

    let match = resolve(path);

    if (match?.redirect) {
      window.history.replaceState(null, '', `#${match.path}`);
      path = match.path;
      match = resolve(path);
    }

    if (!match) {
      window.history.replaceState(null, '', `#${defaultPath}`);
      path = defaultPath;
      match = resolve(path);
    }

    const returningToBase = cameFromOverlay && path === overlayBase;

    closeOverlay();
    previousPath = cameFromOverlay ? (overlayBase || defaultPath) : currentPath;
    currentPath = match.path;
    overlayBasePath = null;
    currentScreen = match.screen;

    ensureInit(match.screen);
    updateChrome(match);
    match.screen.show?.(match.path);
    match.screen.render?.();
    if (!returningToBase) resetScroll();

    if (!initial && !returningToBase) {
      document.getElementById('screen-title')?.focus({ preventScroll: true });
    }
  }

  function navigate(path) {
    const target = `#${path}`;
    if (window.location.hash === target) {
      if (currentPath !== ADD_PATH) resetScroll();
      return;
    }
    window.location.hash = target;
  }

  function replace(path) {
    window.history.replaceState(null, '', `#${path}`);
    handleLocation();
  }

  function back() {
    const fallback = resolve(previousPath);
    if (previousPath && previousPath !== currentPath && fallback) {
      replace(previousPath);
      return;
    }
    replace(defaultPath);
  }

  function refresh() {
    currentScreen?.render?.();
    if (currentOverlay) overlays[currentOverlay]?.render?.();
  }

  function start() {
    if (!window.location.hash) {
      window.history.replaceState(null, '', `#${defaultPath}`);
    }
    window.addEventListener('hashchange', () => handleLocation());
    handleLocation({ initial: true });
  }

  return { start, navigate, back, refresh };
}
