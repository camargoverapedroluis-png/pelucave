// tools/icons.mjs — Propietario: architect.
// Genera js/ui/icons-data.js con el marcado interior de los SVG de Lucide (lucide-static)
// para la unión de los nombres listados en tools/icons/*.list.
//
// - Falla (código 1) si algún nombre no existe en lucide-static, indicando archivo y línea.
// - Determinista: nombres ordenados, sin marcas de tiempo; mismo conjunto ⇒ mismos bytes.
// - Atómico: escribe en un temporal y renombra. Si mientras tanto otro agente añadió una
//   lista nueva, vuelve a leer las listas y regenera hasta que el conjunto sea estable.
//
// Uso: node tools/icons.mjs [--check]
//   --check  no escribe; falla si js/ui/icons-data.js no está al día.
import fs from 'node:fs';
import path from 'node:path';
import { rel, readJSON, writeAtomic, fail } from './lib.mjs';

const LIST_DIR = rel('tools', 'icons');
const ICON_DIR = rel('node_modules', 'lucide-static', 'icons');
const OUT = rel('js', 'ui', 'icons-data.js');
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const checkOnly = process.argv.includes('--check');

if (!fs.existsSync(ICON_DIR)) fail('Falta lucide-static. Ejecute "npm install".');
const lucideVersion = readJSON(rel('node_modules', 'lucide-static', 'package.json')).version;

function readLists() {
  const files = fs.readdirSync(LIST_DIR).filter((f) => f.endsWith('.list')).sort();
  const names = new Map(); // nombre -> [origen]
  const problems = [];
  for (const file of files) {
    const lines = fs.readFileSync(path.join(LIST_DIR, file), 'utf8').split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) return;
      const where = `tools/icons/${file}:${i + 1}`;
      if (!NAME_RE.test(line)) {
        problems.push(`${where}: «${line}» no es un nombre válido (minúsculas, cifras y guiones).`);
        return;
      }
      if (!fs.existsSync(path.join(ICON_DIR, `${line}.svg`))) {
        problems.push(`${where}: el icono «${line}» no existe en lucide-static@${lucideVersion}.`);
        return;
      }
      if (!names.has(line)) names.set(line, []);
      names.get(line).push(where);
    });
  }
  return { files, names, problems };
}

/** Extrae el marcado interior del <svg> y lo compacta de forma determinista. */
function innerMarkup(name) {
  const svg = fs.readFileSync(path.join(ICON_DIR, `${name}.svg`), 'utf8');
  const open = svg.indexOf('<svg');
  const start = svg.indexOf('>', open);
  const end = svg.lastIndexOf('</svg>');
  if (open < 0 || start < 0 || end < 0) fail(`SVG inesperado para «${name}».`);
  return svg
    .slice(start + 1, end)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s*\n\s*/g, '')
    .replace(/\s+\/>/g, '/>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function render(names) {
  const sorted = [...names.keys()].sort();
  const body = sorted
    .map((n) => `    ${JSON.stringify(n)}: ${JSON.stringify(innerMarkup(n))}`)
    .join(',\n');
  return `/*
 * js/ui/icons-data.js — GENERADO por tools/icons.mjs. No editar a mano.
 * Fuente: lucide-static@${lucideVersion} (licencia ISC, ver vendor/LICENSES/lucide-LICENSE.txt).
 * Listas: tools/icons/*.list. Iconos: ${sorted.length}.
 * Cada valor es el marcado interior de un <svg viewBox="0 0 24 24">; lo envuelve DSL.ui.icon().
 */
(function (global) {
  'use strict';
  var DSL = global.DSL = global.DSL || {};
  DSL.iconsData = Object.freeze({
${body}
  });
})(typeof window !== 'undefined' ? window : globalThis);
`;
}

const signature = (names) => [...names.keys()].sort().join('\n');

let attempt = 0;
for (;;) {
  attempt += 1;
  const { files, names, problems } = readLists();
  if (problems.length) {
    fail(`Iconos no válidos:\n  ${problems.join('\n  ')}`);
  }
  const text = render(names);
  if (checkOnly) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== text) fail('js/ui/icons-data.js no está al día. Ejecute: node tools/icons.mjs');
    console.log(`icons-data.js al día (${names.size} iconos).`);
    break;
  }
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (current !== text) writeAtomic(OUT, text);
  // Releer: si otra lista apareció o cambió durante la escritura, regenerar.
  const again = readLists();
  if (signature(again.names) === signature(names) || attempt >= 5) {
    console.log(`js/ui/icons-data.js: ${names.size} iconos de ${files.length} lista(s)` + (current === text ? ' (sin cambios)' : ''));
    break;
  }
}
