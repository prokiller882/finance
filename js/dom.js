const SVG_NS = 'http://www.w3.org/2000/svg';

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Минимальный DOM-хелпер. Текст всегда через textContent —
 * пользовательские строки не должны попадать в innerHTML.
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'attrs') {
      for (const [name, attrValue] of Object.entries(value)) {
        if (attrValue == null || attrValue === false) continue;
        node.setAttribute(name, attrValue === true ? '' : String(attrValue));
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node[key] = value;
    }
  }

  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return node;
}

export function clear(node) {
  node.replaceChildren();
}

/**
 * SVG-иконка из списка path-ов для icon-button.
 * Наследует цвет и толщину линии через CSS (.icon-btn svg).
 */
export function icon(paths) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }

  return svg;
}

/**
 * Заполняет select, по возможности сохраняя текущее значение.
 * items: [{ value, label }]
 */
export function fillSelect(select, items, { placeholder = null } = {}) {
  const previous = select.value;
  const fragment = document.createDocumentFragment();

  if (placeholder != null) {
    fragment.append(el('option', { value: '', text: placeholder }));
  }
  for (const item of items) {
    fragment.append(el('option', { value: item.value, text: item.label }));
  }

  select.replaceChildren(fragment);

  if (items.some((item) => item.value === previous)) select.value = previous;
  else if (items.length && placeholder == null) select.value = items[0].value;
  else select.value = '';
}
