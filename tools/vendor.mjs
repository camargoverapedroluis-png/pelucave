// tools/vendor.mjs — Propietario: architect.
// Copia en vendor/ las bibliotecas y fuentes que la app usa sin red (file://).
// Determinista: misma versión de node_modules ⇒ mismos bytes en vendor/.
//
//   vendor/chart.js/chart.umd.min.js        Chart.js (UMD, minificado)
//   vendor/katex/katex.min.js               KaTeX
//   vendor/katex/katex.min.css              CSS de KaTeX reescrito para usar solo woff2
//   vendor/katex/fonts/*.woff2              fuentes de KaTeX
//   vendor/fonts/*.woff2                    Bricolage Grotesque (variable, opsz+wght) e IBM Plex Sans (variable, wght)
//   vendor/fonts.css                        @font-face con font-display: swap
//   vendor/LICENSES/*                       licencias de todo lo copiado
//   vendor/VERSIONS.json                    versiones y sha256 de cada archivo
//
// Uso: node tools/vendor.mjs
import fs from 'node:fs';
import path from 'node:path';
import { rel, posixRel, sha256, ensureDir, listFiles, readJSON, fail, formatBytes } from './lib.mjs';

const NM = rel('node_modules');
const OUT = rel('vendor');

function pkgDir(name) {
  const dir = path.join(NM, ...name.split('/'));
  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    fail(`Falta el paquete ${name}. Ejecute "npm install" antes de "npm run vendor".`);
  }
  return dir;
}

function pkgVersion(name) {
  return readJSON(path.join(pkgDir(name), 'package.json')).version;
}

/** Elimina comentarios de source map (los .map no se copian). */
function stripSourceMaps(text) {
  return text
    .replace(/\n?\/\/[#@] sourceMappingURL=[^\n]*\s*$/g, '\n')
    .replace(/\/\*[#@] sourceMappingURL=[^*]*\*\/\s*$/g, '')
    .replace(/\s+$/, '') + '\n';
}

function copyText(src, dest, transform = (s) => s) {
  ensureDir(path.dirname(dest));
  const text = transform(fs.readFileSync(src, 'utf8'));
  fs.writeFileSync(dest, text, 'utf8');
}

function copyBinary(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

// ---------------------------------------------------------------- limpieza
fs.rmSync(OUT, { recursive: true, force: true });
ensureDir(OUT);

const versions = {};

// ---------------------------------------------------------------- Chart.js
{
  const dir = pkgDir('chart.js');
  versions['chart.js'] = pkgVersion('chart.js');
  copyText(path.join(dir, 'dist', 'chart.umd.min.js'), path.join(OUT, 'chart.js', 'chart.umd.min.js'), stripSourceMaps);
  copyText(path.join(dir, 'LICENSE.md'), path.join(OUT, 'LICENSES', 'chart.js-LICENSE.md'));
}

// ---------------------------------------------------------------- KaTeX
{
  const dir = pkgDir('katex');
  versions.katex = pkgVersion('katex');
  copyText(path.join(dir, 'dist', 'katex.min.js'), path.join(OUT, 'katex', 'katex.min.js'), stripSourceMaps);

  let css = fs.readFileSync(path.join(dir, 'dist', 'katex.min.css'), 'utf8');
  // Cada src: url(fonts/X.woff2) format("woff2"),url(fonts/X.woff) format("woff"),url(fonts/X.ttf) format("truetype")
  // se reduce a la variante woff2.
  let rewritten = 0;
  css = css.replace(/src:([^;}]+)/g, (whole, list) => {
    const m = list.match(/url\(([^)]+?\.woff2)\)\s*format\((["'])woff2\2\)/);
    if (!m) return whole;
    rewritten += 1;
    return `src:url(${m[1]}) format("woff2")`;
  });
  css = stripSourceMaps(css);
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/^["']|["']$/g, ''));
  const bad = urls.filter((u) => !u.endsWith('.woff2'));
  if (bad.length) fail(`El CSS de KaTeX aún referencia formatos no woff2: ${bad.join(', ')}`);
  if (!rewritten) fail('No se reescribió ninguna regla @font-face de KaTeX (¿cambió el formato del CSS?).');
  ensureDir(path.join(OUT, 'katex'));
  fs.writeFileSync(path.join(OUT, 'katex', 'katex.min.css'), css, 'utf8');

  const fontDir = path.join(dir, 'dist', 'fonts');
  const needed = new Set(urls.map((u) => path.basename(u)));
  for (const f of [...needed].sort()) {
    const src = path.join(fontDir, f);
    if (!fs.existsSync(src)) fail(`Falta la fuente de KaTeX ${f}`);
    copyBinary(src, path.join(OUT, 'katex', 'fonts', f));
  }
  copyText(path.join(dir, 'LICENSE'), path.join(OUT, 'LICENSES', 'katex-LICENSE.txt'));
}

// ---------------------------------------------------------------- Lucide (solo la licencia; los SVG van en js/ui/icons-data.js)
{
  const dir = pkgDir('lucide-static');
  versions['lucide-static'] = pkgVersion('lucide-static');
  copyText(path.join(dir, 'LICENSE'), path.join(OUT, 'LICENSES', 'lucide-LICENSE.txt'));
}

// ---------------------------------------------------------------- Fuentes de texto
// Familias elegidas en docs/SKILLS_BRIEF.md §1: Bricolage Grotesque (titulares) e IBM Plex Sans (UI y cuerpo).
// Se usan los nombres de familia sin el sufijo «Variable».
const FONT_SETS = [
  {
    pkg: '@fontsource-variable/bricolage-grotesque',
    family: 'Bricolage Grotesque',
    prefix: 'bricolage-grotesque',
    license: 'bricolage-grotesque-OFL.txt',
    faces: [
      // opsz.css: ejes opsz + wght (200–800); tamaño óptico automático.
      { css: 'opsz.css', axis: 'opsz', style: 'normal', subsets: ['latin-ext', 'latin'] },
    ],
  },
  {
    pkg: '@fontsource-variable/ibm-plex-sans',
    family: 'IBM Plex Sans',
    prefix: 'ibm-plex-sans',
    license: 'ibm-plex-sans-OFL.txt',
    faces: [
      // wght.css: eje wght (100–700). Griego para ζ, ω, τ, β, γ en la UI.
      { css: 'wght.css', axis: 'wght', style: 'normal', subsets: ['latin-ext', 'latin', 'greek'] },
      { css: 'wght-italic.css', axis: 'wght', style: 'italic', subsets: ['latin-ext', 'latin'] },
    ],
  },
];

let fontsCss = '/* vendor/fonts.css — generado por tools/vendor.mjs. No editar a mano.\n'
  + ' * Bricolage Grotesque e IBM Plex Sans: SIL Open Font License 1.1 (ver vendor/LICENSES/). */\n';

for (const set of FONT_SETS) {
  const dir = pkgDir(set.pkg);
  versions[set.pkg] = pkgVersion(set.pkg);
  for (const face of set.faces) {
    const css = fs.readFileSync(path.join(dir, face.css), 'utf8');
    const blocks = [...css.matchAll(/\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g)];
    for (const subset of face.subsets) {
      const wanted = `${set.prefix}-${subset}-${face.axis}-${face.style}`;
      const block = blocks.find(([, name]) => name === wanted);
      if (!block) fail(`No se encontró el bloque ${wanted} en ${set.pkg}/${face.css}`);
      const body = block[2];
      const weight = (body.match(/font-weight:\s*([^;]+);/) || [])[1];
      const range = (body.match(/unicode-range:\s*([^;]+);/) || [])[1];
      const url = (body.match(/url\(\.\/files\/([^)]+\.woff2)\)/) || [])[1];
      if (!weight || !range || !url) fail(`Bloque @font-face incompleto: ${block[1]}`);
      copyBinary(path.join(dir, 'files', url), path.join(OUT, 'fonts', url));
      fontsCss += `\n/* ${block[1]} */\n@font-face {\n`
        + `  font-family: '${set.family}';\n`
        + `  font-style: ${face.style};\n`
        + `  font-display: swap;\n`
        + `  font-weight: ${weight.trim()};\n`
        + `  src: url(fonts/${url}) format('woff2');\n`
        + `  unicode-range: ${range.trim()};\n`
        + '}\n';
    }
  }
  copyText(path.join(dir, 'LICENSE'), path.join(OUT, 'LICENSES', set.license));
}
fs.writeFileSync(path.join(OUT, 'fonts.css'), fontsCss, 'utf8');

// ---------------------------------------------------------------- manifiesto
const files = listFiles(OUT).map((abs) => {
  const buf = fs.readFileSync(abs);
  return { path: posixRel(abs), bytes: buf.length, sha256: sha256(buf) };
});
const manifest = { generatedBy: 'tools/vendor.mjs', versions, files };
fs.writeFileSync(path.join(OUT, 'VERSIONS.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const total = files.reduce((s, f) => s + f.bytes, 0);
console.log(`vendor/: ${files.length} archivos, ${formatBytes(total)}`);
for (const [k, v] of Object.entries(versions)) console.log(`  ${k}@${v}`);
