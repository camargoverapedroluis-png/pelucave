// tests/unit/latex.test.mjs — Propietario: math.
// Formato TeX (números, complejos, polinomios, fracciones, texto) y render con KaTeX o sin él.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadDSL, SCRIPTS } from '../helpers/load.mjs';

const { DSL, env } = loadDSL(SCRIPTS.core);
const L = DSL.core.latex;

function fakeKatex() {
  const calls = [];
  return {
    calls,
    render(tex, el, opts) { calls.push({ tex, opts }); el.textContent = `K[${opts.displayMode ? 'D' : 'I'}]:${tex}`; },
    renderToString(tex, opts) { calls.push({ tex, opts, string: true }); return `<span class="katex">${tex}</span>`; },
  };
}

describe('formato TeX', () => {
  test('num: punto decimal, signo ASCII, cifras significativas y notación científica', () => {
    assert.equal(L.num(1.5), '1.5');
    assert.equal(L.num(-2), '-2');
    assert.equal(L.num(1 / 3), '0.3333');
    assert.equal(L.num(1 / 3, 2), '0.33');
    assert.equal(L.num(2.00000001), '2');
    assert.equal(L.num(-0), '0');
    assert.equal(L.num(1.2e-5), '1.2 \\times 10^{-5}');
    assert.equal(L.num(1e-5), '10^{-5}');
    assert.equal(L.num(-3.5e7), '-3.5 \\times 10^{7}');
    assert.equal(L.num(1234567), '1.235 \\times 10^{6}');
    assert.equal(L.num(12345), '12345');
    assert.equal(L.num(Infinity), '\\infty');
    assert.equal(L.num(-Infinity), '-\\infty');
    assert.equal(L.num(NaN), '\\text{indefinido}');
  });
  test('complex y complexPair con la unidad j', () => {
    assert.equal(L.complex({ re: -1, im: 2 }), '-1 + 2j');
    assert.equal(L.complex({ re: -1, im: -2 }), '-1 - 2j');
    assert.equal(L.complex({ re: 0, im: 1 }), 'j');
    assert.equal(L.complex({ re: 0, im: -1 }), '-j');
    assert.equal(L.complex({ re: 3, im: 0 }), '3');
    assert.equal(L.complex(2.5), '2.5');
    assert.equal(L.complex({ re: -0.5, im: Math.sqrt(3) / 2 }, 3), '-0.5 + 0.866j');
    assert.equal(L.complexPair({ re: -1, im: -2 }), '-1 \\pm 2j');
    assert.equal(L.complexPair({ re: 0, im: 3 }), '\\pm 3j');
    assert.equal(L.complexPair({ re: -4, im: 0 }), '-4');
  });
  test('poly: omite términos nulos y coeficientes unitarios, conserva signos', () => {
    assert.equal(L.poly([1, 0.5, -3]), 's^{2} + 0.5 s - 3');
    assert.equal(L.poly([-1, 0, 1]), '-s^{2} + 1');
    assert.equal(L.poly([1, 0, 0]), 's^{2}');
    assert.equal(L.poly([2, -1]), '2 s - 1');
    assert.equal(L.poly([0]), '0');
    assert.equal(L.poly([]), '0');
    assert.equal(L.poly([1, 2], 'z'), 'z + 2');
    assert.equal(L.poly([1, 1 / 3], 's', { digits: 2 }), 's + 0.33');
    assert.equal(L.poly([3e-6, 1]), '3 \\times 10^{-6}\\, s + 1');
    assert.equal(L.poly([1, 1e-20, 1], 's', { digits: 4 }), 's^{2} + 10^{-20} s + 1');
  });
  test('frac y text', () => {
    assert.equal(L.frac('1', 's + 1'), '\\frac{1}{s + 1}');
    assert.equal(L.text('50 % de R_0 & {x}'), '\\text{50 \\% de R\\_0 \\& \\{x\\}}');
  });
});

describe('render sin KaTeX', () => {
  test('render deja el TeX como texto con la clase tex-fallback', () => {
    assert.equal(L.available(), false);
    const el = DSL.util.h('span');
    assert.equal(L.render(el, 'x^{2}'), false);
    assert.equal(el.textContent, 'x^{2}');
    assert.ok(el.classList.contains('tex-fallback'));
  });
  test('toHtml escapa el TeX dentro de <code>', () => {
    assert.equal(L.toHtml('a<b & c'), '<code class="tex-fallback">a&lt;b &amp; c</code>');
  });
  test('renderInto procesa cada [data-tex] y devuelve cuántos hay', () => {
    const root = DSL.util.h('div', null,
      DSL.util.h('span', { 'data-tex': 'a+b' }),
      DSL.util.h('p', null, DSL.util.h('span', { 'data-tex': '\\frac{1}{s}', 'data-tex-display': '' })));
    assert.equal(L.renderInto(root), 2);
    assert.equal(root.querySelectorAll('[data-tex]')[1].textContent, '\\frac{1}{s}');
    assert.equal(L.renderInto(null), 0);
  });
  test('sin errores de consola', () => {
    assert.deepStrictEqual(env.console.error || [], []);
  });
});

describe('render con KaTeX', () => {
  const katex = fakeKatex();
  const ctx = loadDSL(SCRIPTS.core, { globals: { katex } });
  const LK = ctx.DSL.core.latex;
  const h = ctx.DSL.util.h;

  test('render usa las opciones del contrato y quita el respaldo', () => {
    assert.equal(LK.available(), true);
    const el = h('span', { class: 'tex-fallback' });
    assert.equal(LK.render(el, 'G(s)', { display: true }), true);
    const call = katex.calls[katex.calls.length - 1];
    assert.equal(call.tex, 'G(s)');
    assert.equal(call.opts.displayMode, true);
    assert.equal(call.opts.throwOnError, false);
    assert.equal(call.opts.strict, 'ignore');
    assert.equal(call.opts.output, 'htmlAndMathml');
    assert.equal(el.textContent, 'K[D]:G(s)');
    assert.ok(!el.classList.contains('tex-fallback'));
  });
  test('toHtml usa renderToString', () => {
    assert.equal(LK.toHtml('x', { display: false }), '<span class="katex">x</span>');
  });
  test('renderInto es idempotente: no vuelve a renderizar lo que no cambió', () => {
    const a = h('span', { 'data-tex': 'a' });
    const b = h('span', { 'data-tex': 'b', 'data-tex-display': '' });
    const c = h('span', { 'data-tex': 'c', 'data-tex-display': 'false' });
    const root = h('div', null, a, h('p', null, b, c));
    const before = katex.calls.length;
    assert.equal(LK.renderInto(root), 3);
    assert.equal(katex.calls.length - before, 3);
    assert.equal(b.textContent, 'K[D]:b');
    assert.equal(c.textContent, 'K[I]:c');
    assert.equal(LK.renderInto(root), 3);
    assert.equal(katex.calls.length - before, 3, 'sin trabajo repetido');
    a.setAttribute('data-tex', 'a2');
    LK.renderInto(root);
    assert.equal(katex.calls.length - before, 4);
    assert.equal(a.textContent, 'K[I]:a2');
  });
  test('renderInto también renderiza el propio contenedor si lleva data-tex', () => {
    const leaf = h('span', { 'data-tex': 'x' });
    assert.equal(LK.renderInto(leaf), 1);
    assert.equal(leaf.textContent, 'K[I]:x');
  });
  test('si KaTeX lanza, queda el respaldo sin errores de consola', () => {
    const bad = loadDSL(SCRIPTS.core, { globals: { katex: { render() { throw new Error('x'); }, renderToString() { throw new Error('x'); } } } });
    const el = bad.DSL.util.h('span');
    assert.equal(bad.DSL.core.latex.render(el, 'y'), false);
    assert.equal(el.textContent, 'y');
    assert.match(bad.DSL.core.latex.toHtml('y'), /tex-fallback/);
    assert.deepStrictEqual(bad.env.console.error || [], []);
  });
});
