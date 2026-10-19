// tools/build.mjs — Propietario: architect.
// Genera dist/sistemas-dinamicos.html: un único archivo autocontenido a partir de index.html.
//
// - Cada <link rel="stylesheet" href> se sustituye por <style> con su CSS; cada url() relativa
//   del CSS (fuentes woff2, imágenes) se incrusta como data: URI en base64.
// - Cada <script src> se sustituye por <script> con su código; se escapan "</script" y "<!--".
// - Se conserva el orden del documento. No se minifica ni se reordena nada.
// - Determinista: mismas entradas ⇒ mismos bytes. La fecha del banner solo aparece si se
//   pasa BUILD_DATE (texto libre, p. ej. 2026-10-17) o SOURCE_DATE_EPOCH (segundos Unix).
// - Comprueba al final que no queda ninguna referencia a archivos externos ni a la red.
// - Solo en el archivo único: omite las reglas @font-face de DIST_PRUNED_FONTS (tools/lib.mjs), caras que la
//   app no puede usar (KaTeX Fraktur, Script, Typewriter, SansSerif, Math/Main-BoldItalic y Caligraphic-Bold;
//   Bricolage latin-ext; IBM Plex Sans cursiva latin-ext). vendor/ no cambia. Antes de nada, una guarda falla
//   si js/ contiene TeX que llevaría a una de esas caras (\mathfrak, \mathscr, \mathtt, \texttt, \mathsf,
//   \boldsymbol, \bm y sus alias; ver TEX_UNREACHABLE); al final, otra falla si alguna cara de la lista no
//   aparece exactamente una vez en las hojas enlazadas.
//
// Uso: node tools/build.mjs            (BUILD_DATE=2026-10-17 node tools/build.mjs)
//      node tools/build.mjs --out=<archivo>   escribe en otra ruta (comprobaciones sin tocar dist/)
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, rel, posixRel, readJSON, writeAtomic, fail, formatBytes, sha256, MIME, listFiles,
  DIST_PRUNED_FONTS, pruneFontFaces, findUnreachableTex,
} from './lib.mjs';

const INPUT = rel('index.html');
const outArg = process.argv.slice(2).find((a) => a.startsWith('--out='));
const OUTPUT = outArg ? path.resolve(outArg.slice('--out='.length)) : rel('dist', 'sistemas-dinamicos.html');
const pkg = readJSON(rel('package.json'));

// Guarda: ningún TeX de js/ puede pedir una cara que el archivo único omite.
const texHits = findUnreachableTex(listFiles(rel('js')).filter((f) => f.endsWith('.js')));
if (texHits.length) {
  fail('js/ usa TeX que necesita una fuente que el archivo único no incrusta (DIST_PRUNED_FONTS, tools/lib.mjs):\n  '
    + texHits.map((t) => `${t.file}:${t.line} «${t.text}» → ${t.face}`).join('\n  ')
    + '\nUse \\mathrm, \\text, \\mathcal o \\mathbf, o saque la cara de la lista.');
}

/** Caras omitidas: { file, abs } (nombre del woff2 y su ruta, solo para el informe de tamaño). */
const pruned = [];

function resolveLocal(fromDir, ref, what) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) {
    fail(`${what}: referencia externa no permitida «${ref}». Todo debe ser local (vendor/).`);
  }
  const clean = ref.split('#')[0].split('?')[0];
  const abs = path.resolve(fromDir, decodeURI(clean));
  if (!abs.startsWith(ROOT)) fail(`${what}: «${ref}» sale de la raíz del proyecto.`);
  if (!fs.existsSync(abs)) fail(`${what}: no existe «${posixRel(abs)}».`);
  return abs;
}

function attr(tag, name) {
  // (?:^|\s) y no \b: «data-src» no debe contar como «src».
  const m = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4]) : null;
}

function dataUri(abs) {
  const ext = path.extname(abs).toLowerCase();
  const mime = MIME[ext];
  if (!mime) fail(`Tipo de recurso no soportado para incrustar: ${posixRel(abs)}`);
  return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
}

function inlineCss(cssPath) {
  const dir = path.dirname(cssPath);
  let css = fs.readFileSync(cssPath, 'utf8');
  if (/@import\b/.test(css)) fail(`${posixRel(cssPath)}: @import no está soportado; enlace la hoja desde index.html.`);
  css = css.replace(/\/\*[#@] sourceMappingURL=[^*]*\*\//g, '');
  // Antes de incrustar: las caras omitidas no llegan a convertirse en data: URI.
  const p = pruneFontFaces(css, DIST_PRUNED_FONTS);
  css = p.css;
  p.removed.forEach((file, i) => pruned.push({ file, abs: path.resolve(dir, decodeURI(p.urls[i])) }));
  css = css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (whole, _q, ref) => {
    const r = ref.trim();
    if (r.startsWith('data:') || r.startsWith('#')) return whole;
    return `url(${dataUri(resolveLocal(dir, r, posixRel(cssPath)))})`;
  });
  return css.replace(/<\/style/gi, '<\\/style');
}

function inlineJs(jsPath) {
  let js = fs.readFileSync(jsPath, 'utf8');
  js = js.replace(/\n?\/\/[#@] sourceMappingURL=[^\n]*/g, '');
  // "</script" cerraría el elemento; "<!--" activa el modo de escape del analizador HTML.
  js = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  return js;
}

let html = fs.readFileSync(INPUT, 'utf8');
const counts = { css: 0, js: 0 };

// Hojas de estilo enlazadas.
html = html.replace(/<link\b[^>]*>/gi, (tag) => {
  const relAttr = (attr(tag, 'rel') || '').toLowerCase();
  if (relAttr !== 'stylesheet') return tag;
  const href = attr(tag, 'href');
  if (!href) fail(`<link rel="stylesheet"> sin href: ${tag}`);
  const abs = resolveLocal(ROOT, href, 'index.html');
  counts.css += 1;
  return `<style data-src="${posixRel(abs)}">\n${inlineCss(abs)}\n</style>`;
});

// Scripts externos.
html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (whole, attrs, body) => {
  const src = attr(`<x ${attrs}>`, 'src');
  if (!src) return whole;
  if (body.trim()) fail(`<script src="${src}"> no debe tener contenido.`);
  if (/\btype\s*=\s*["']?module/i.test(attrs)) fail(`Los scripts deben ser clásicos (sin type="module"): ${src}`);
  const abs = resolveLocal(ROOT, src, 'index.html');
  counts.js += 1;
  return `<script data-src="${posixRel(abs)}">\n${inlineJs(abs)}\n</script>`;
});

// Toda cara de la lista se omitió exactamente una vez (si vendor/ cambia, la lista debe revisarse).
{
  const seen = pruned.map((p) => p.file);
  const missing = DIST_PRUNED_FONTS.filter((f) => !seen.includes(f));
  const twice = seen.filter((f, i) => seen.indexOf(f) !== i);
  if (missing.length || twice.length) {
    fail('DIST_PRUNED_FONTS (tools/lib.mjs) no cuadra con las hojas enlazadas:'
      + (missing.length ? ` sin @font-face para ${missing.join(', ')}.` : '')
      + (twice.length ? ` Declaradas más de una vez: ${twice.join(', ')}.` : ''));
  }
}

// Banner determinista tras el doctype.
let date = process.env.BUILD_DATE || '';
if (!date && process.env.SOURCE_DATE_EPOCH) {
  const secs = Number(process.env.SOURCE_DATE_EPOCH);
  if (Number.isFinite(secs)) date = new Date(secs * 1000).toISOString().slice(0, 10);
}
const banner = `<!-- Laboratorio de Sistemas Dinámicos v${pkg.version} · archivo autocontenido generado por tools/build.mjs`
  + (date ? ` · ${date}` : '') + ' -->';
if (!/^<!doctype html>/i.test(html)) fail('index.html debe empezar por <!doctype html>.');
html = html.replace(/^<!doctype html>\s*/i, (d) => `${d.trim()}\n${banner}\n`);

// Verificación: nada externo.
const leftovers = [];
for (const m of html.matchAll(/<(script|img|link|iframe|audio|video|source|embed|object)\b[^>]*?\s(src|href|data)\s*=\s*["']?([^"'\s>]+)/gi)) {
  const ref = m[3];
  if (!ref.startsWith('data:') && !ref.startsWith('#')) leftovers.push(`${m[1]} ${m[2]}=${ref}`);
}
for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
  for (const u of m[1].matchAll(/url\(\s*["']?([^"')]+)/g)) {
    if (!u[1].startsWith('data:') && !u[1].startsWith('#')) leftovers.push(`url(${u[1]})`);
  }
}
if (leftovers.length) fail(`Quedan referencias externas en el build:\n  ${leftovers.join('\n  ')}`);

writeAtomic(OUTPUT, html);
const bytes = Buffer.byteLength(html, 'utf8');
console.log(`${posixRel(OUTPUT)}: ${formatBytes(bytes)} (${bytes} bytes) · ${counts.css} hojas de estilo y ${counts.js} scripts incrustados`);
const woff = pruned.reduce((n, p) => n + (fs.existsSync(p.abs) ? fs.statSync(p.abs).size : 0), 0);
console.log(`${pruned.length} caras tipográficas sin uso omitidas (${formatBytes(woff)} de woff2; ver DIST_PRUNED_FONTS en tools/lib.mjs)`);
console.log(`sha256 ${sha256(Buffer.from(html, 'utf8'))}`);
