#!/usr/bin/env node
// Сверяет PRECACHE в sw.js с файлами оболочки и требует новый CACHE,
// если оболочка изменилась. Запускается pre-commit хуком и вручную.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const toPosix = (path) => relative(root, path).split(sep).join('/');

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function readCache(text) {
  return text.match(/const CACHE\s*=\s*'([^']+)'/)?.[1] ?? null;
}

const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const cache = readCache(sw);
const precacheBlock = sw.match(/const PRECACHE\s*=\s*\[([\s\S]*?)\];/)?.[1];

const errors = [];
if (!cache) errors.push('в sw.js не найден `const CACHE = …`');
if (!precacheBlock) errors.push('в sw.js не найден массив `PRECACHE`');

const listed = precacheBlock
  ? [...precacheBlock.matchAll(/'([^']+)'/g)].map((match) => match[1])
  : [];

// Оболочка приложения: разметка, манифест, стили, модули, иконки.
const shell = [
  './index.html',
  './manifest.json',
  ...walk(join(root, 'css')).map((path) => `./${toPosix(path)}`),
  ...walk(join(root, 'js')).map((path) => `./${toPosix(path)}`),
  ...walk(join(root, 'icons')).map((path) => `./${toPosix(path)}`),
];

const listedSet = new Set(listed);
const missing = shell.filter((path) => !listedSet.has(path));
const extra = listed.filter((path) => path !== './' && !existsSync(join(root, path.replace(/^\.\//, ''))));

if (missing.length) {
  errors.push(`в PRECACHE нет файлов оболочки:\n  ${missing.join('\n  ')}`);
}
if (extra.length) {
  errors.push(`PRECACHE ссылается на отсутствующие файлы:\n  ${extra.join('\n  ')}`);
}

// CACHE должен меняться вместе с оболочкой, иначе клиенты останутся на старом CSS/JS.
let headSw = null;
try {
  headSw = execFileSync('git', ['show', 'HEAD:sw.js'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch {
  // Первый коммит или нет git — проверку версии пропускаем.
}

if (headSw) {
  const headCache = readCache(headSw);
  const changed = execFileSync(
    'git',
    ['diff', '--name-only', 'HEAD', '--', 'css', 'js', 'index.html', 'manifest.json', 'icons'],
    { encoding: 'utf8' },
  ).trim();

  if (changed && headCache === cache) {
    const files = changed.split('\n').map((path) => `  ${path}`).join('\n');
    errors.push(`оболочка изменилась, а CACHE остался «${cache}» — поднимите версию в sw.js:\n${files}`);
  }
}

if (errors.length) {
  console.error('✗ Проверка PRECACHE не пройдена:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`✓ PRECACHE: ${shell.length} файлов, CACHE ${cache}`);
