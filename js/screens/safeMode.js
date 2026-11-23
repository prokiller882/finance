import { el } from '../dom.js';
import { saveFailureMessage } from '../labels.js';

const TEXTS = {
  forward: {
    title: 'Данные созданы более новой версией',
    description: 'Эта версия приложения не умеет читать такой файл и не меняет его. '
      + 'Сохраните исходные данные, чтобы не потерять их, или восстановите проверенную копию.',
  },
  corrupt: {
    title: 'Данные не удалось прочитать',
    description: 'Файл в браузере повреждён или не прошёл проверку. Исходные данные '
      + 'сохранены без изменений, их можно скачать. Восстановите резервную копию или начните заново.',
    descriptionNoRaw: 'Файл в браузере не удалось прочитать. Данных для скачивания нет — '
      + 'восстановите резервную копию или начните заново.',
  },
  'no-space': {
    title: 'Не хватает места для копии данных',
    description: 'Перед обновлением приложение сохраняет копию текущих данных, но в браузере '
      + 'не хватило места. Данные не изменены. Освободите место на устройстве и перезагрузите '
      + 'страницу. Если это не поможет, сохраните исходные данные и восстановите их позже.',
  },
};

const BANNER_TEXT = 'Данные изменились в другой вкладке. Этот экран не обновился сам — '
  + 'перезагрузите страницу или восстановите копию.';

function messageOf(error) {
  if (error?.name === 'StorageError' && typeof error.message === 'string' && error.message) {
    return error.message;
  }
  // Технический текст исключения пользователю не показываем.
  console.error('Безопасный режим: действие не выполнено', error);
  return 'Не удалось выполнить действие. Попробуйте ещё раз.';
}

/**
 * Экран безопасного режима: чистый UI-слой над `source`.
 * Не импортирует storage.js и store.js — все операции приходят через source.
 *
 * source: {
 *   status: 'forward' | 'corrupt' | 'no-space',
 *   version: number | null,
 *   raw: string | null,
 *   preV4Raw: string | null,
 *   recoverFromFile(file), recoverFromRaw(), exportRaw(), reset(), toast?(message)
 * }
 */
export function createSafeMode(source) {
  let root = null;
  let banner = null;
  let errorBox = null;
  let buttons = [];
  let busy = false;

  function toast(message) {
    source.toast?.(message);
  }

  function showError(message) {
    if (!errorBox) return;
    if (message) {
      // Live region должна появиться до текста, иначе часть скринридеров молчит.
      errorBox.hidden = false;
      errorBox.textContent = message;
      return;
    }
    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  function setBusy(value) {
    busy = value;
    for (const button of buttons) button.disabled = value;
  }

  /** Действия не должны накладываться друг на друга: file.text() асинхронен. */
  async function run(action) {
    if (busy) return;
    setBusy(true);
    showError('');
    try {
      await action();
    } catch (error) {
      showError(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  function reportFailure(result) {
    if (!result || result.ok !== false) return false;
    const message = saveFailureMessage(result.reason);
    showError(message);
    toast(message);
    return true;
  }

  function createExportButton() {
    return el('button', {
      class: 'btn',
      type: 'button',
      text: 'Сохранить исходные данные',
      onClick: () => run(async () => {
        const result = await source.exportRaw();
        if (result === 'cancelled') return;
        if (result === 'unavailable' || result == null) {
          showError('Исходные данные недоступны: файл в браузере не найден.');
          return;
        }
        toast(result === 'shared' ? 'Исходные данные отправлены' : 'Файл с исходными данными скачан');
      }),
    });
  }

  function createRestoreButton() {
    return el('button', {
      class: 'btn',
      type: 'button',
      text: 'Восстановить копию до обновления',
      onClick: () => {
        if (busy) return;
        // В forward данные более новой версии ещё читаемы для её владельца:
        // замена требует явного подтверждения.
        if (
          source.status === 'forward'
          && !window.confirm(
            'Восстановление копии до обновления заменит данные, созданные более новой '
            + 'версией приложения. Продолжить?',
          )
        ) {
          return;
        }
        run(async () => {
          // Текст копии перечитывает app.js: снимок экрана мог устареть.
          const result = await source.recoverFromRaw();
          reportFailure(result);
        });
      },
    });
  }

  function createImportControls() {
    const input = el('input', {
      type: 'file',
      accept: 'application/json,.json',
      hidden: true,
      attrs: { 'aria-hidden': 'true', tabindex: '-1' },
    });

    // Кнопка, а не <label>: скрытый input недоступен с клавиатуры.
    const trigger = el('button', {
      class: 'btn btn--primary',
      type: 'button',
      text: 'Импортировать копию',
      onClick: () => {
        if (busy) return;
        input.value = '';
        input.click();
      },
    });

    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      if (!file) return;
      input.value = '';

      if (
        source.status === 'forward'
        && !window.confirm(
          `Файл «${file.name}» заменит данные, созданные более новой версией приложения. `
          + 'Продолжить?',
        )
      ) {
        return;
      }

      run(async () => {
        const result = await source.recoverFromFile(file);
        reportFailure(result);
      });
    });

    return [trigger, input];
  }

  function createResetButton() {
    return el('button', {
      class: 'btn btn--danger',
      type: 'button',
      text: 'Сбросить всё',
      onClick: () => {
        if (busy) return;
        // Копии :corrupt и :pre-v4 не удаляются — текст не должен это обещать.
        const forwardWarning = source.status === 'forward'
          ? 'Данные, созданные более новой версией приложения, будут уничтожены. '
          : '';
        if (
          !window.confirm(
            `Сбросить все данные? ${forwardWarning}Счета, операции, категории и планы `
            + 'будут заменены начальным набором. Сохранённые копии повреждённых данных останутся в браузере.',
          )
        ) {
          return;
        }
        run(async () => {
          const result = await source.reset();
          reportFailure(result);
        });
      },
    });
  }

  function mount(container) {
    root = container;
    root.hidden = false;
    root.setAttribute('aria-labelledby', 'safe-mode-title');

    const texts = TEXTS[source.status] ?? TEXTS.corrupt;
    const descriptionText = source.status === 'corrupt' && typeof source.raw !== 'string'
      ? texts.descriptionNoRaw
      : texts.description;
    const versionNote = source.status === 'forward' && Number.isInteger(source.version)
      ? ` Схема данных: ${source.version}.`
      : '';

    const title = el('h1', {
      class: 'safe-mode__title',
      id: 'safe-mode-title',
      attrs: { tabindex: '-1' },
      text: texts.title,
    });

    const description = el('p', {
      class: 'safe-mode__text',
      text: `${descriptionText}${versionNote}`,
    });

    banner = el('p', {
      class: 'safe-mode__banner',
      attrs: { role: 'status' },
      hidden: true,
    });

    errorBox = el('p', {
      class: 'safe-mode__error',
      attrs: { role: 'alert' },
      hidden: true,
    });

    const importControls = createImportControls();
    // Без места под копию доступна только выгрузка: импорт и сброс здесь
    // сами потребуют записи и не решают проблему пользователя.
    const actions = source.status === 'no-space'
      ? [typeof source.raw === 'string' ? createExportButton() : null].filter(Boolean)
      : [
        ...importControls,
        typeof source.preV4Raw === 'string' ? createRestoreButton() : null,
        typeof source.raw === 'string' ? createExportButton() : null,
        createResetButton(),
      ].filter(Boolean);

    buttons = actions.filter((node) => node.tagName === 'BUTTON');

    root.replaceChildren(el('div', { class: 'safe-mode__inner' }, [
      el('section', { class: 'card safe-mode__card' }, [
        title,
        description,
        banner,
        errorBox,
        el('div', { class: 'btn-row safe-mode__actions' }, actions),
        el('p', {
          class: 'hint',
          text: 'Данные хранятся только в этом браузере и никуда не отправляются.',
        }),
      ]),
    ]));

    title.focus();
  }

  function showStorageBanner() {
    if (!banner) return;
    // Сначала показываем live region, затем наполняем текстом.
    banner.hidden = false;
    banner.textContent = BANNER_TEXT;
  }

  return {
    mount,
    showStorageBanner,
  };
}
