// tests/unit/contract.test.mjs — Propietario: architect.
// Guardas del contrato de docs/ARCHITECTURE.md que no dependen de ningún módulo concreto:
//   1. index.html enlaza exactamente los scripts y hojas del contrato, en orden, y todos existen.
//   2. Todo script propio es un script clásico (sin import/export) y se ejecuta en el nivel superior
//      sin Chart.js, sin KaTeX y sin contenido en el DOM, sin errores de consola (§9 «Carga»).
//   3. Tras cargarlos, existen las ranuras públicas: secciones con mount() y DSL.ui.shell.
//   4. Ningún archivo propio usa Math.random ni colores literales fuera de css/tokens.css.
//   5. Archivo único: las caras que tools/build.mjs omite (DIST_PRUNED_FONTS) existen una vez cada una en las
//      hojas de vendor/, el recorte no toca nada más, y js/ no usa TeX que las pediría.
//   6. README.md dice lo mismo que la app: tema oscuro por defecto recordado en dsl.v1.theme, títulos de las
//      tarjetas de conceptos y nombres de los pasos del asistente.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, createEnv } from '../helpers/load.mjs';
import { DIST_PRUNED_FONTS, TEX_UNREACHABLE, pruneFontFaces, fontFaceRules, findUnreachableTex } from '../../tools/lib.mjs';

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
const styles = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
const own = scripts.filter((s) => !s.startsWith('vendor/'));

const EXPECTED_SCRIPTS = [
  'vendor/chart.js/chart.umd.min.js', 'vendor/katex/katex.min.js',
  'js/core/ns.js', 'js/core/numeric.js', 'js/core/tf.js', 'js/core/latex.js',
  'js/ui/icons-data.js', 'js/ui/components.js', 'js/ui/shell.js', 'js/viz/charts.js',
  'js/systems/registry.js', 'js/systems/simulator.js', 'js/systems/massSpring.js', 'js/systems/tanks.js',
  'js/systems/rlc.js', 'js/systems/sir.js', 'js/systems/market.js', 'js/systems/pendulum.js',
  'js/viz/scenes/registry.js', 'js/viz/scenes/massSpring.js', 'js/viz/scenes/tanks.js', 'js/viz/scenes/rlc.js',
  'js/viz/scenes/sir.js', 'js/viz/scenes/market.js',
  'js/anim/pelucaveParams.js', 'js/anim/pelucaveAsset.js', 'js/anim/pelucaveTransition.js', 'js/anim/pelucaveOverlay.js',
  'js/sections/hero.js', 'js/sections/concepts.js', 'js/sections/wizard.js', 'js/sections/gallery.js',
  'js/sections/tfengine.js', 'js/app.js',
];
const EXPECTED_STYLES = [
  'vendor/fonts.css', 'vendor/katex/katex.min.css', 'css/tokens.css', 'css/base.css', 'css/components.css',
  'css/shell.css', 'css/charts.css', 'css/scenes.css', 'css/pelucave.css', 'css/sections/hero.css', 'css/sections/concepts.css',
  'css/sections/wizard.css', 'css/sections/gallery.css', 'css/sections/tfengine.css',
];

function walk(dir, ext) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, ext));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

describe('index.html', () => {
  test('enlaza los scripts del contrato en orden', () => {
    assert.deepStrictEqual(scripts, EXPECTED_SCRIPTS);
  });
  test('enlaza las hojas del contrato en orden', () => {
    assert.deepStrictEqual(styles, EXPECTED_STYLES);
  });
  test('todos los recursos enlazados existen', () => {
    for (const f of [...scripts, ...styles]) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  });
  test('cinco secciones con su montaje y su destino aria-labelledby', () => {
    for (const [id, mount] of [['inicio', 'hero'], ['conceptos', 'concepts'], ['modelado', 'wizard'], ['galeria', 'gallery'], ['transferencia', 'tfengine']]) {
      const re = new RegExp(`<section id="${id}"[^>]*aria-labelledby="${id}-title"[^>]*>\\s*<div data-mount="${mount}"></div>\\s*</section>`);
      assert.match(html, re, id);
    }
  });
});

describe('scripts propios', () => {
  test('son scripts clásicos válidos (sin import/export de módulos)', () => {
    for (const f of own) {
      const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.doesNotThrow(() => new vm.Script(code, { filename: f }), `${f} no compila como script clásico`);
      assert.doesNotMatch(code, /^\s*(import|export)\s/m, `${f} usa sintaxis de módulo`);
    }
  });

  test('se ejecutan sin Chart, sin KaTeX y sin DOM de contenido, y sin errores de consola', () => {
    const env = createEnv({ readyState: 'loading' });
    for (const f of own) {
      assert.doesNotThrow(() => env.load([f]), `${f} falla al cargarse`);
    }
    const DSL = env.window.DSL;
    for (const key of ['hero', 'concepts', 'wizard', 'gallery', 'tfengine']) {
      assert.equal(typeof DSL.sections[key]?.mount, 'function', `DSL.sections.${key}.mount`);
    }
    assert.equal(typeof DSL.ui.shell?.mountHeader, 'function', 'DSL.ui.shell.mountHeader');
    assert.equal(typeof DSL.ui.shell?.mountFooter, 'function', 'DSL.ui.shell.mountFooter');
    assert.ok(Object.keys(DSL.iconsData || {}).length >= 40, 'DSL.iconsData');
    assert.deepStrictEqual(env.console.error, [], 'errores de consola al cargar');
  });
});

describe('reglas globales de código', () => {
  test('ningún archivo propio usa Math.random', () => {
    const files = [...walk(path.join(ROOT, 'js'), '.js')];
    for (const f of files) {
      const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      assert.doesNotMatch(code, /Math\.random\s*\(/, path.relative(ROOT, f));
    }
  });

  test('solo css/tokens.css contiene colores literales', () => {
    const files = walk(path.join(ROOT, 'css'), '.css').filter((f) => !f.endsWith(`${path.sep}tokens.css`));
    for (const f of files) {
      const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      assert.doesNotMatch(code, /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|hwb)\(/, path.relative(ROOT, f));
    }
  });
});

describe('archivo único: caras tipográficas omitidas (tools/build.mjs)', () => {
  const sheets = styles.filter((s) => s.startsWith('vendor/')).map((s) => ({
    href: s, css: fs.readFileSync(path.join(ROOT, s), 'utf8'),
  }));
  const BS = String.fromCharCode(92);
  const hit = (s) => TEX_UNREACHABLE.some(({ re }) => { re.lastIndex = 0; return re.test(s); });

  test('cada cara de DIST_PRUNED_FONTS aparece una sola vez en las hojas de vendor/ enlazadas', () => {
    const files = sheets.flatMap((s) => fontFaceRules(s.css).map((r) => r.file));
    for (const f of DIST_PRUNED_FONTS) {
      assert.equal(files.filter((x) => x === f).length, 1, f);
    }
  });

  test('el recorte quita solo esas reglas: el resto del CSS queda igual y sigue cada cara necesaria', () => {
    const removed = [];
    const kept = [];
    for (const s of sheets) {
      assert.equal(pruneFontFaces(s.css, []).css, s.css, `${s.href}: con la lista vacía no cambia nada`);
      const before = fontFaceRules(s.css);
      const out = pruneFontFaces(s.css, DIST_PRUNED_FONTS);
      removed.push(...out.removed);
      assert.equal(out.urls.length, out.removed.length);
      const after = fontFaceRules(out.css);
      assert.deepStrictEqual(after, before.filter((r) => !DIST_PRUNED_FONTS.includes(r.file)), `${s.href}: reglas que quedan`);
      assert.deepStrictEqual(pruneFontFaces(out.css, DIST_PRUNED_FONTS).removed, [], `${s.href}: idempotente`);
      // Fuera de las reglas @font-face (y sus comentarios de nombre) no cambia ni un byte.
      const strip = (css) => css.replace(/(\/\*\s*[\w.-]+\s*\*\/\s*)?@font-face\s*\{[^}]*\}\s*/g, '');
      assert.equal(strip(out.css), strip(s.css), `${s.href}: resto del CSS`);
      assert.doesNotMatch(out.css, new RegExp(DIST_PRUNED_FONTS.map((f) => f.replace(/[.]/g, '\\.')).join('|')), s.href);
      kept.push(...after.map((r) => r.file));
    }
    assert.deepStrictEqual(removed.slice().sort(), DIST_PRUNED_FONTS.slice().sort());
    for (const f of [
      'KaTeX_Main-Regular.woff2', 'KaTeX_Main-Bold.woff2', 'KaTeX_Main-Italic.woff2', 'KaTeX_Math-Italic.woff2',
      'KaTeX_Caligraphic-Regular.woff2', 'KaTeX_AMS-Regular.woff2', 'KaTeX_Size1-Regular.woff2', 'KaTeX_Size2-Regular.woff2',
      'KaTeX_Size3-Regular.woff2', 'KaTeX_Size4-Regular.woff2',
      'bricolage-grotesque-latin-opsz-normal.woff2', 'ibm-plex-sans-latin-wght-normal.woff2',
      'ibm-plex-sans-latin-ext-wght-normal.woff2', 'ibm-plex-sans-latin-wght-italic.woff2', 'ibm-plex-sans-greek-wght-normal.woff2',
    ]) assert.ok(kept.includes(f), `se incrusta ${f}`);
  });

  test('js/ no usa TeX que pediría una cara omitida', () => {
    const files = walk(path.join(ROOT, 'js'), '.js');
    assert.ok(files.length > 20);
    assert.deepStrictEqual(findUnreachableTex(files), []);
  });

  test('findUnreachableTex (la guarda del build) señala archivo, línea y cara', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsl-tex-'));
    try {
      const file = path.join(dir, 'muestra.js');
      // Fuente JS tal como se escribe: las barras van dobladas dentro de las cadenas.
      fs.writeFileSync(file, [`var ok = '${BS}${BS}mathbf{x} + ${BS}${BS}mathcal{L}';`, `var mal = '${BS}${BS}boldsymbol{x}';`].join('\n'));
      const hits = findUnreachableTex([file]);
      assert.equal(hits.length, 1);
      assert.equal(hits[0].line, 2);
      assert.equal(hits[0].text, `${BS}${BS}boldsymbol`);
      assert.match(hits[0].face, /BoldItalic/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('la guarda reconoce esas órdenes (y sus alias) sin confundir las que sí se usan', () => {
    const positives = ['mathfrak{g}', 'frak A', 'mathscr{L}', 'mathtt{x}', 'texttt{a}', 'tt x', 'verb|a|', 'mathsf{A}',
      'textsf{a}', 'sf A', 'boldsymbol{x}', 'bm{x}', `textbf{${BS}textit{a}}`, `textit{${BS}textbf{a}}`].map((s) => BS + s);
    positives.push(`'${BS}${BS}boldsymbol{x}'`, '\u{1D504}');
    for (const s of positives) assert.ok(hit(s), s);
    const negatives = ['mathbf{x}', 'mathcal{L}', 'mathrm{d}', 'text{tt sf bm}', 'item', 'sfrac', 'bmatrix', 'textbf{a}',
      'textit{a}', 'dfrac', 'htmlClass{x}{y}', 'textbackslash'].map((s) => BS + s);
    negatives.push('texto con tt, sf y bm');
    for (const s of negatives) assert.ok(!hit(s), s);
  });
});

describe('README.md coincide con la app', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const row = (anchor) => readme.split('\n').find((l) => l.startsWith(`| \`${anchor}\` |`)) || '';

  test('tema: oscuro por defecto y recordado en localStorage (dsl.v1.theme)', () => {
    assert.match(html, /<html\b[^>]*\sdata-theme="dark"/);
    assert.match(html, /localStorage\.getItem\('dsl\.v1\.theme'\)/);
    const line = readme.split('\n').find((l) => l.includes('**Tema claro u oscuro:**')) || '';
    assert.match(line, /empieza en oscuro/);
    assert.match(line, /dsl\.v1\.theme/);
    assert.doesNotMatch(readme, /sigue la preferencia del sistema/);
  });

  test('#conceptos: los títulos de las cuatro tarjetas de js/sections/concepts.js', () => {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'sections', 'concepts.js'), 'utf8');
    const titles = [...src.matchAll(/cardShell\('(\w+)', '([^']+)'(?:, texInline\('([^']+)'\))?\)/g)].map((m) => m[2] + (m[3] || ''));
    assert.deepStrictEqual(titles, ['¿Qué es un sistema dinámico?', 'La variable independiente: el tiempo t',
      'Ecuaciones de representación', 'Linealidad vs. no linealidad']);
    const r = row('#conceptos');
    for (const t of titles) assert.ok(r.includes(`«${t}»`), t);
    assert.doesNotMatch(r, /desplegable/i);
  });

  test('#modelado: los cuatro pasos de js/sections/wizard.js, en orden', () => {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'sections', 'wizard.js'), 'utf8');
    const block = src.match(/var STEPS = \[([\s\S]*?)\n {2}\];/);
    assert.ok(block, 'STEPS');
    const steps = [...block[1].matchAll(/\btitle: '([^']+)'/g)].map((m) => m[1]);
    assert.equal(steps.length, 4);
    assert.ok(row('#modelado').includes(`(${steps.join(' → ')})`), steps.join(' → '));
  });
});
