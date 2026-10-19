// tests/unit/wizard.test.mjs — Propietario: wizard.
// Utilidades puras de la sección #modelado (texto TeX → tramos SVG, interpolación, RMSE, veredicto,
// paso de integración) y montaje sobre el DOM falso: cada elemento de la lista tiene su parte en el
// diagrama, navegación por el carril y el teclado, ensamblado de la ecuación y ajuste del paso 4.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadDSL, toPlain, SCRIPTS } from '../helpers/load.mjs';

const FILES = [
  ...SCRIPTS.core.slice(1), ...SCRIPTS.systems,
  'js/ui/icons-data.js', 'js/ui/components.js', 'js/sections/wizard.js',
];
const NB = ' ';
const THIN = ' ';

function setup(options) {
  return loadDSL(FILES, options);
}

function all(node, pred, out = []) {
  for (const c of node.childNodes || []) {
    if (c.nodeType === 1) {
      if (pred(c)) out.push(c);
      all(c, pred, out);
    }
  }
  return out;
}
const byTestid = (root, id) => all(root, (e) => e.getAttribute && e.getAttribute('data-testid') === id)[0] || null;

function mounted(options) {
  const ctx = setup(options);
  const { DSL, document, env } = ctx;
  const el = document.createElement('div');
  document.body.appendChild(el);
  const handle = DSL.sections.wizard.mount(el);
  const root = byTestid(el, 'wz-root');
  env.intersect(root, true);
  return { ...ctx, el, handle, root };
}

describe('helpers', () => {
  const load = () => setup().DSL.sections.wizard.helpers;

  test('texRuns: cursivas, sub/superíndices, puntos y fracciones', () => {
    const H = load();
    assert.deepStrictEqual(toPlain(H.texRuns('\\ddot{x}')), [{ text: 'ẍ', italic: true, script: null }]);
    assert.deepStrictEqual(toPlain(H.texRuns('\\dot{h}')), [{ text: 'ḣ', italic: true, script: null }]);
    assert.deepStrictEqual(toPlain(H.texRuns('v_C')), [
      { text: 'v', italic: true, script: null }, { text: 'C', italic: true, script: 'sub' },
    ]);
    assert.deepStrictEqual(toPlain(H.texRuns('q_{in}(t)')), [
      { text: 'q', italic: true, script: null }, { text: 'in', italic: true, script: 'sub' },
      { text: '(', italic: false, script: null }, { text: 't', italic: true, script: null },
      { text: ')', italic: false, script: null },
    ]);
    assert.equal(H.plainText('\\frac{dV}{dt}'), 'dV/dt');
    assert.equal(H.plainText('\\beta S I/N'), 'βSI/N');
    assert.equal(H.plainText('\\text{RMSE}'), 'RMSE');
  });

  test('texRuns: menos tipográfico, unario o binario', () => {
    const H = load();
    assert.equal(H.plainText('F_k = -k\\,x'), `Fk${THIN}=${THIN}−k${THIN}x`);
    assert.equal(H.plainText('a - b'), `a${THIN}−${THIN}b`);
    assert.equal(H.plainText('-x'), '−x');
    assert.ok(!H.plainText('m\\,g').includes('\\'));
  });

  test('wrapFlows envuelve cada aparición del flujo con \\htmlClass', () => {
    const H = load();
    const flow = { id: 'contagio', tex: '\\frac{\\beta S I}{N}' };
    const out = H.wrapFlows('\\dot S = -\\frac{\\beta S I}{N}', [flow]);
    assert.equal(out, '\\dot S = -\\htmlClass{wz-flow wz-flow--contagio}{\\frac{\\beta S I}{N}}');
    assert.equal(H.wrapFlows('x', []), 'x');
  });

  test('interpAt: extremos, interior y tiempos repetidos', () => {
    const H = load();
    const xs = [0, 1, 1, 2];
    const ys = [0, 1, 3, 5];
    assert.equal(H.interpAt(xs, ys, -1), 0);
    assert.equal(H.interpAt(xs, ys, 3), 5);
    assert.equal(H.interpAt(xs, ys, 0.5), 0.5);
    assert.equal(H.interpAt(xs, ys, 1.5), 4);
    assert.ok(Number.isNaN(H.interpAt([], [], 1)));
  });

  test('resample: n puntos equiespaciados con extremos exactos', () => {
    const H = load();
    const pts = toPlain(H.resample([0, 10], [0, 20], 5, 0, 10));
    assert.deepStrictEqual(pts, [{ x: 0, y: 0 }, { x: 2.5, y: 5 }, { x: 5, y: 10 }, { x: 7.5, y: 15 }, { x: 10, y: 20 }]);
  });

  test('rmseOf y verdict', () => {
    const H = load();
    assert.equal(H.rmseOf([1, 2], [1, 4]), Math.sqrt(2));
    assert.ok(Number.isNaN(H.rmseOf([], [])));
    assert.equal(H.verdict(0.01, 0.01).level, 'ruido');
    assert.equal(H.verdict(0.0125, 0.01).level, 'ruido');
    assert.equal(H.verdict(0.02, 0.01).level, 'cerca');
    assert.equal(H.verdict(0.05, 0.01).level, 'lejos');
    assert.equal(H.verdict(0.05, 0.01).tone, 'info');
    assert.equal(H.verdict(NaN, 0.01).level, 'fallo');
    assert.equal(H.verdict(NaN, 0.01).tone, 'danger');
  });

  test('dtText: milisegundos bajo 10 ms; espacio duro antes de la unidad', () => {
    const H = load();
    assert.equal(H.dtText(8e-5, 's'), `0.08${NB}ms`);
    assert.equal(H.dtText(0.01, 's'), `0.01${NB}s`);
    assert.equal(H.dtText(0.06, 'días'), `0.06${NB}días`);
    assert.equal(H.stepLabel(0, 4), 'Paso 1 de 4');
    assert.equal(H.clampInt(9, 0, 3), 3);
    assert.equal(H.clampInt(-2, 0, 3), 0);
  });
});

describe('mount', () => {
  test('encabezado, carril con aria-current y paneles', () => {
    const { el, root, handle } = mounted();
    const h2 = all(el, (e) => e.localName === 'h2')[0];
    assert.equal(h2.id, 'modelado-title');
    assert.equal(h2.textContent, 'Pasos para modelar un sistema');
    for (let i = 1; i <= 4; i++) assert.ok(byTestid(el, `wz-step-${i}`), `marca ${i}`);
    assert.equal(byTestid(el, 'wz-step-1').getAttribute('aria-current'), 'step');
    assert.equal(byTestid(el, 'wz-panel-1').hidden, false);
    assert.equal(byTestid(el, 'wz-panel-2').hidden, true);
    assert.equal(root.getAttribute('data-step'), '1');
    assert.equal(handle.ready, true);
    handle.destroy();
    assert.equal(el.childNodes.length, 0);
  });

  test('cada elemento de las listas tiene su parte en el diagrama (pasos 1 y 2, cuatro ejemplos)', () => {
    const { el, handle, env } = mounted();
    for (const ex of ['massSpring', 'rlc', 'tanks', 'sir']) {
      handle.setExample(ex);
      env.tick(400);
      for (const step of [0, 1]) {
        handle.goTo(step);
        env.tick(400);
        const panel = byTestid(el, `wz-panel-${step + 1}`);
        const refs = all(panel, (e) => e.getAttribute && e.getAttribute('data-ref') !== null).map((b) => b.getAttribute('data-ref'));
        assert.ok(refs.length >= 3, `${ex} paso ${step + 1}: lista vacía`);
        const parts = all(panel, (e) => e.getAttribute && e.getAttribute('data-refs') !== null)
          .map((p) => ` ${p.getAttribute('data-refs')} `);
        for (const ref of refs) {
          assert.ok(parts.some((p) => p.includes(` ${ref} `)), `${ex} paso ${step + 1}: «${ref}» sin parte en el diagrama`);
        }
      }
    }
    handle.destroy();
  });

  test('teclado en el carril: flechas, Inicio y Fin', () => {
    const { el, root, handle, env } = mounted();
    const m1 = byTestid(el, 'wz-step-1');
    m1.focus();
    env.fire(m1, 'keydown', { key: 'ArrowRight' });
    assert.equal(root.getAttribute('data-step'), '2');
    assert.equal(byTestid(el, 'wz-step-2').getAttribute('aria-current'), 'step');
    assert.equal(byTestid(el, 'wz-step-1').getAttribute('aria-current'), null);
    env.fire(byTestid(el, 'wz-step-2'), 'keydown', { key: 'End' });
    assert.equal(root.getAttribute('data-step'), '4');
    env.fire(byTestid(el, 'wz-step-4'), 'keydown', { key: 'ArrowRight' });
    assert.equal(root.getAttribute('data-step'), '4');
    env.fire(byTestid(el, 'wz-step-4'), 'keydown', { key: 'Home' });
    assert.equal(root.getAttribute('data-step'), '1');
    env.tick(600);
    assert.equal(byTestid(el, 'wz-panel-4').hidden, true);
    handle.destroy();
  });

  test('paso 3: el ensamblado llega a todos los términos y «Mostrar todo» los completa', () => {
    const { el, handle, env } = mounted();
    handle.goTo(2);
    env.tick(6000);
    const count = byTestid(el, 'wz-asm-count');
    assert.match(count.textContent, /^4 de 4 términos$/);
    byTestid(el, 'wz-term-replay').click();
    env.tick(10);
    assert.match(count.textContent, /^0 de 4/);
    byTestid(el, 'wz-term-all').click();
    assert.match(count.textContent, /^4 de 4/);
    handle.setExample('sir');
    env.tick(400);
    byTestid(el, 'wz-term-all').click();
    assert.match(byTestid(el, 'wz-asm-count').textContent, /^5 de 5 piezas$/);
    assert.equal(byTestid(el, 'wz-linear').textContent.trim(), 'No lineal');
    handle.destroy();
  });

  test('paso 4: con el valor por defecto el ajuste no llega al ruido; invariantes presentes', () => {
    const { el, root, handle, env } = mounted();
    for (const ex of ['massSpring', 'rlc', 'tanks', 'sir']) {
      handle.setExample(ex);
      env.tick(400);
      handle.goTo(3);
      env.tick(400);
      assert.notEqual(root.getAttribute('data-fit-level'), 'ruido', ex);
      assert.ok(byTestid(el, 'wz-invariants').childNodes.length >= 1, `${ex}: sin invariantes`);
      assert.ok(byTestid(el, 'wz-rmse-value').textContent !== '—', `${ex}: RMSE vacío`);
    }
    handle.destroy();
  });

  test('destroy limpia temporizadores y no deja nodos', () => {
    const { el, handle, env } = mounted();
    handle.goTo(1);
    env.tick(200);
    // Solo queda, como mucho, el temporizador de la región viva compartida (DSL.ui.announce).
    handle.destroy();
    const before = env.pendingTimers();
    env.tick(10000);
    assert.equal(el.childNodes.length, 0);
    assert.ok(before <= 1, `temporizadores pendientes tras destroy: ${before}`);
    assert.deepStrictEqual(toPlain(env.console.error || []), []);
  });
});
