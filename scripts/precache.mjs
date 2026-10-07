/*
 * Genera la lista de precarga y la versión del service worker.
 * Ejecutar después de cualquier cambio en archivos de la app:  node scripts/precache.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname;
const INCLUDE = ['index.html', 'manifest.json', 'src', 'styles', 'assets/icons', 'assets/brand', 'vendor'];
const files = [];
const walk = (p) => { const s = statSync(p); if (s.isDirectory()) readdirSync(p).sort().forEach((f) => walk(join(p, f))); else if (!/(^|\/)\.|README|\.map$/.test(p)) files.push(p); };
INCLUDE.forEach((x) => walk(join(ROOT, x)));
const h = createHash('sha256');
files.forEach((f) => { h.update(relative(ROOT, f)); h.update(readFileSync(f)); });
const version = h.digest('hex').slice(0, 10);
const list = ['./', ...files.map((f) => './' + relative(ROOT, f))];
const sw = join(ROOT, 'service-worker.js');
const src = readFileSync(sw, 'utf8');
const block = `/* PRECACHE:START */\nconst VERSION = '${version}';\nconst PRECACHE = ${JSON.stringify(list, null, 2)};\n/* PRECACHE:END */`;
writeFileSync(sw, src.replace(/\/\* PRECACHE:START \*\/[\s\S]*?\/\* PRECACHE:END \*\//, block));
console.log(`service-worker.js: ${list.length} archivos, versión ${version}`);
