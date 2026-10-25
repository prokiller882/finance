import { newId } from '../util.js';
import {
  assert,
  isNonEmptyString,
  isPlainObject,
} from './validation.js';

export const CATEGORY_KINDS = ['expense', 'income'];
export const CATEGORY_COLORS = [
  '#4f46e5',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
];
export const DEFAULT_CATEGORY_ICON = 'tag';

const KIND_SET = new Set(CATEGORY_KINDS);
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ICON_RE = /^[a-z0-9-]{1,32}$/;
const NAME_MAX_LENGTH = 30;

/** Детерминированный цвет для новой категории: одинаковые имена получают один цвет. */
export function categoryColorFor(name = '') {
  let hash = 0;
  for (const char of String(name)) {
    hash = ((hash * 31) + char.codePointAt(0)) >>> 0;
  }
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

export class Category {
  constructor(data = {}) {
    assert(isPlainObject(data), 'category', '', 'Категория должна быть объектом.');

    this.id = data.id;
    this.name = typeof data.name === 'string' ? data.name.trim() : data.name;
    this.kind = data.kind;
    this.color = data.color;
    this.icon = data.icon;

    this.validate();
  }

  static create(input = {}, { id = newId() } = {}) {
    return new Category({
      ...input,
      id,
      color: input.color || categoryColorFor(input.name),
      icon: input.icon || DEFAULT_CATEGORY_ICON,
    });
  }

  static fromJSON(raw) {
    return new Category(raw);
  }

  validate() {
    assert(isNonEmptyString(this.id), 'category', 'id', 'У категории должен быть id.');
    assert(
      typeof this.name === 'string'
        && this.name.length >= 1
        && this.name.length <= NAME_MAX_LENGTH,
      'category',
      'name',
      `Название категории должно быть от 1 до ${NAME_MAX_LENGTH} символов.`,
    );
    assert(KIND_SET.has(this.kind), 'category', 'kind', 'Неизвестный тип категории.');
    assert(
      typeof this.color === 'string' && COLOR_RE.test(this.color),
      'category',
      'color',
      'Цвет категории должен быть в формате #RRGGBB.',
    );
    assert(
      typeof this.icon === 'string' && ICON_RE.test(this.icon),
      'category',
      'icon',
      'Некорректная иконка категории.',
    );
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      color: this.color,
      icon: this.icon,
    };
  }
}
