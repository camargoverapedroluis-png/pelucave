// tools/lib.mjs — Propietario: architect.
// Utilidades compartidas por las herramientas de construcción (Node ≥ 20, sin dependencias).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

/** Raíz del proyecto (carpeta que contiene package.json). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Ruta absoluta a partir de una ruta relativa a la raíz. */
export function rel(...parts) {
  return path.join(ROOT, ...parts);
}

/** Ruta POSIX relativa a la raíz (para mensajes y manifiestos deterministas). */
export function posixRel(abs) {
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Escritura atómica: escribe en un archivo temporal del mismo directorio y lo renombra.
 * Evita archivos a medio escribir si dos procesos regeneran el mismo archivo a la vez.
 */
export function writeAtomic(file, data) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmp, data);
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ya no existe */ }
    throw err;
  }
}

/** Escribe solo si el contenido cambia (mantiene mtime estable). Devuelve true si escribió. */
export function writeIfChanged(file, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  if (fs.existsSync(file) && fs.readFileSync(file).equals(buf)) return false;
  writeAtomic(file, buf);
  return true;
}

/** Lista recursiva de archivos ordenada de forma determinista (rutas absolutas). */
export function listFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (d) => {
    const entries = fs.readdirSync(d, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out;
}

export function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

/**
 * Caras tipográficas que el archivo único (dist) NO incrusta porque la app no puede llegar a usarlas.
 * vendor/ no cambia: index.html sigue declarándolas todas (y el navegador nunca las pide).
 * - KaTeX: js/ solo usa \mathrm, \text, \mathcal y \mathbf (más la cursiva matemática por defecto), así que
 *   Fraktur, Script, Typewriter, SansSerif, Math-BoldItalic, Main-BoldItalic y Caligraphic-Bold son
 *   inalcanzables. Lo garantiza findUnreachableTex(), que tools/build.mjs y contract.test.mjs ejecutan.
 * - Bricolage Grotesque latin-ext e IBM Plex Sans cursiva latin-ext: ningún titular ni texto en cursiva lleva
 *   caracteres de esos rangos (ẋ, ḣ, ᵢ… solo aparecen en texto normal). Lo comprueba
 *   tests/e2e/integration.spec.mjs («fuentes») tras un recorrido completo. Si un titular los necesitara,
 *   la pila de --font-display cae en IBM Plex Sans latin-ext normal, que sí se incrusta.
 * Cada nombre debe corresponder a exactamente un @font-face de las hojas enlazadas; si no, el build falla.
 */
export const DIST_PRUNED_FONTS = Object.freeze([
  'KaTeX_Caligraphic-Bold.woff2',
  'KaTeX_Fraktur-Bold.woff2',
  'KaTeX_Fraktur-Regular.woff2',
  'KaTeX_Main-BoldItalic.woff2',
  'KaTeX_Math-BoldItalic.woff2',
  'KaTeX_SansSerif-Bold.woff2',
  'KaTeX_SansSerif-Italic.woff2',
  'KaTeX_SansSerif-Regular.woff2',
  'KaTeX_Script-Regular.woff2',
  'KaTeX_Typewriter-Regular.woff2',
  'bricolage-grotesque-latin-ext-opsz-normal.woff2',
  'ibm-plex-sans-latin-ext-wght-italic.woff2',
]);

// Una regla @font-face, con el comentario /* nombre */ que la precede en vendor/fonts.css si lo hay.
const FONT_FACE_RE = /(\/\*\s*([^*]*?)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}\s*/g;

/** Primera url() de un bloque CSS, sin comillas ni ?/# (o null). */
function faceUrl(body) {
  const m = body.match(/url\(\s*["']?([^"')]+?)["']?\s*\)/);
  return m ? m[1].trim().split(/[?#]/)[0] : null;
}

/** Nombre del archivo (sin ruta) de la primera url() de un bloque CSS (o null). */
function faceFile(body) {
  const url = faceUrl(body);
  return url ? url.split('/').pop() : null;
}

/**
 * Quita del CSS las reglas @font-face cuya url() apunta a uno de `files` (nombres de archivo, sin ruta),
 * junto con su comentario de nombre. No toca nada más.
 * → { css, removed: string[] (nombres, en orden de aparición), urls: string[] (sus url() tal cual) }.
 */
export function pruneFontFaces(css, files) {
  const drop = new Set(files);
  const removed = [];
  const urls = [];
  const out = css.replace(FONT_FACE_RE, (whole, comment, commentText, body) => {
    const file = faceFile(body);
    if (!file || !drop.has(file)) return whole;
    removed.push(file);
    urls.push(faceUrl(body));
    const ownName = commentText && commentText === file.replace(/\.[a-z0-9]+$/i, '');
    return comment && !ownName ? comment : '';
  });
  return { css: out, removed, urls };
}

/** Descriptores de cada @font-face del CSS: { file, family, style, weight, unicodeRange }. */
export function fontFaceRules(css) {
  const rules = [];
  for (const m of css.matchAll(FONT_FACE_RE)) {
    const body = m[3];
    const get = (name) => {
      const d = body.match(new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+)`, 'i'));
      return d ? d[1].trim() : null;
    };
    rules.push({
      file: faceFile(body),
      family: (get('font-family') || '').replace(/^["']|["']$/g, ''),
      style: get('font-style') || 'normal',
      weight: get('font-weight') || '400',
      unicodeRange: get('unicode-range'),
    });
  }
  return rules;
}

/**
 * Órdenes de TeX que llevarían a una cara de DIST_PRUNED_FONTS (con sus alias de KaTeX), los cruces negrita +
 * cursiva de texto (Main-BoldItalic) y los caracteres alfanuméricos matemáticos de Unicode (U+1D400–U+1D7FF,
 * que KaTeX dibuja con Fraktur, Script, SansSerif, Typewriter o BoldItalic).
 */
export const TEX_UNREACHABLE = Object.freeze([
  { re: /\\+(?:mathfrak|frak)(?![a-zA-Z])/g, face: 'KaTeX_Fraktur' },
  { re: /\\+mathscr(?![a-zA-Z])/g, face: 'KaTeX_Script' },
  { re: /\\+(?:mathtt|texttt|tt|verb)(?![a-zA-Z])/g, face: 'KaTeX_Typewriter' },
  { re: /\\+(?:mathsf|mathsfit|textsf|sf)(?![a-zA-Z])/g, face: 'KaTeX_SansSerif' },
  { re: /\\+(?:boldsymbol|bm)(?![a-zA-Z])/g, face: 'KaTeX_Math-BoldItalic / KaTeX_Main-BoldItalic / KaTeX_Caligraphic-Bold' },
  { re: /\\+(?:textbf|bf|bfseries)(?![a-zA-Z])[^}\n]*\\+(?:textit|emph|it|itshape)(?![a-zA-Z])|\\+(?:textit|emph|it|itshape)(?![a-zA-Z])[^}\n]*\\+(?:textbf|bf|bfseries)(?![a-zA-Z])/g, face: 'KaTeX_Main-BoldItalic' },
  { re: /[\u{1D400}-\u{1D7FF}]/gu, face: 'KaTeX (alfanuméricos matemáticos)' },
]);

/** Busca TEX_UNREACHABLE en `files` (rutas absolutas). → [{ file, line, text, face }] (vacío si no hay nada). */
export function findUnreachableTex(files) {
  const hits = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const { re, face } of TEX_UNREACHABLE) {
        for (const m of line.matchAll(re)) hits.push({ file: posixRel(file), line: i + 1, text: m[0], face });
      }
    });
  }
  return hits;
}

/** Tipos MIME para incrustar recursos como data: URI. */
export const MIME = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};
