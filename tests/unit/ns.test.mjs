// tests/unit/ns.test.mjs — Propietario: architect.
// Pruebas de js/core/ns.js y autoprueba del cargador tests/helpers/load.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadDSL, createEnv, toPlain } from '../helpers/load.mjs';

const RM = '(prefers-reduced-motion: reduce)';

/* ===================================================================== cargador */

describe('cargador vm (tests/helpers/load.mjs)', () => {
  test('window es el global del contexto y DSL queda en window', () => {
    const { DSL, env } = loadDSL([]);
    assert.equal(env.run('window === globalThis && self === window'), true);
    assert.equal(env.run('typeof window.DSL'), 'object');
    assert.equal(DSL, env.window.DSL);
  });

  test('Math.random está prohibido salvo que se permita', () => {
    const { env } = loadDSL([]);
    assert.throws(() => env.run('Math.random()'), /prohibido/);
    const { env: env2 } = loadDSL([], { allowRandom: true });
    assert.equal(typeof env2.run('Math.random()'), 'number');
    assert.equal(typeof Math.random(), 'number', 'el Math de Node no se toca');
  });

  test('toPlain convierte objetos del contexto para deepStrictEqual', () => {
    const { env } = loadDSL([]);
    const fromVm = env.run('[1, { a: [NaN, -0, Infinity] }]');
    assert.notDeepStrictEqual(fromVm, [1, { a: [NaN, -0, Infinity] }]);
    assert.deepStrictEqual(toPlain(fromVm), [1, { a: [NaN, -0, Infinity] }]);
  });

  test('reloj falso: tick ejecuta temporizadores en orden y frame llama a rAF', () => {
    const env = createEnv();
    const order = [];
    env.window.setTimeout(() => order.push('b'), 20);
    env.window.setTimeout(() => order.push('a'), 10);
    env.window.requestAnimationFrame((ts) => order.push(`raf@${ts}`));
    env.tick(15);
    assert.deepStrictEqual(order, ['a']);
    env.frame(16);
    assert.deepStrictEqual(order, ['a', 'b', 'raf@31']);
    assert.equal(env.window.performance.now(), 31);
  });

  test('DOM falso: h() construye árboles consultables', () => {
    const { DSL, document } = loadDSL([]);
    const el = DSL.util.h('div', { id: 'x', class: ['a', 'b'] }, DSL.util.h('span', { 'data-k': '1' }, 'hola'));
    document.body.appendChild(el);
    assert.equal(document.querySelector('#x'), el);
    assert.equal(document.querySelectorAll('.a.b').length, 1);
    assert.equal(document.querySelector('span[data-k="1"]').textContent, 'hola');
  });
});

/* ===================================================================== espacio de nombres */

describe('espacio de nombres', () => {
  test('crea todas las ranuras', () => {
    const { DSL } = loadDSL([]);
    for (const key of ['core', 'ui', 'viz', 'systems', 'sections', 'util', 'bus', 'prefs', 'app']) {
      assert.equal(typeof DSL[key], 'object', key);
    }
    assert.equal(typeof DSL.viz.scenes, 'object');
    assert.equal(typeof DSL.version, 'string');
  });

  test('no pisa un DSL existente', () => {
    const env = createEnv();
    env.run('window.DSL = { core: { marker: 1 } };');
    env.load(['js/core/ns.js']);
    assert.equal(env.run('DSL.core.marker'), 1);
    assert.equal(env.run('typeof DSL.util.clamp'), 'function');
  });
});

/* ===================================================================== bus */

describe('DSL.bus', () => {
  test('on/emit/unsubscribe', () => {
    const { DSL } = loadDSL([]);
    const got = [];
    const off = DSL.bus.on('x', (p, name) => got.push([p, name]));
    assert.equal(DSL.bus.emit('x', 1), 1);
    off();
    off(); // idempotente
    assert.equal(DSL.bus.emit('x', 2), 0);
    assert.deepStrictEqual(got, [[1, 'x']]);
    assert.equal(DSL.bus.count('x'), 0);
  });

  test('once se llama una sola vez', () => {
    const { DSL } = loadDSL([]);
    let n = 0;
    DSL.bus.once('y', () => { n += 1; });
    DSL.bus.emit('y');
    DSL.bus.emit('y');
    assert.equal(n, 1);
  });

  test('off explícito y orden de suscripción', () => {
    const { DSL } = loadDSL([]);
    const order = [];
    const a = () => order.push('a');
    const b = () => order.push('b');
    DSL.bus.on('z', a);
    DSL.bus.on('z', b);
    DSL.bus.emit('z');
    DSL.bus.off('z', a);
    DSL.bus.emit('z');
    assert.deepStrictEqual(order, ['a', 'b', 'b']);
  });

  test('un manejador que falla no detiene a los demás y se informa por console.error', () => {
    const { DSL, env } = loadDSL([]);
    let reached = false;
    DSL.bus.on('e', () => { throw new Error('boom'); });
    DSL.bus.on('e', () => { reached = true; });
    DSL.bus.emit('e');
    assert.equal(reached, true);
    assert.equal(env.console.error.length, 1);
  });

  test('un manejador dado de baja durante la emisión ya no se llama', () => {
    const { DSL } = loadDSL([]);
    const calls = [];
    let offB = null;
    DSL.bus.on('r', () => { calls.push('a'); offB(); });
    offB = DSL.bus.on('r', () => calls.push('b'));
    DSL.bus.emit('r');
    assert.deepStrictEqual(calls, ['a']);
  });

  test('on exige una función; emitter() crea buses independientes', () => {
    const { DSL } = loadDSL([]);
    // Los errores nacen en el reino del contexto vm: comparar por nombre, no con instanceof.
    assert.throws(() => DSL.bus.on('x', null), { name: 'TypeError' });
    const local = DSL.util.emitter();
    let n = 0;
    local.on('x', () => { n += 1; });
    DSL.bus.emit('x');
    local.emit('x');
    assert.equal(n, 1);
    local.clear();
    assert.equal(local.count('x'), 0);
  });
});

/* ===================================================================== números */

describe('clamp, lerp, invLerp', () => {
  test('valores básicos', () => {
    const { DSL } = loadDSL([]);
    const u = DSL.util;
    assert.equal(u.clamp(5, 0, 1), 1);
    assert.equal(u.clamp(-5, 0, 1), 0);
    assert.equal(u.clamp(0.5, 0, 1), 0.5);
    assert.equal(u.lerp(2, 4, 0.5), 3);
    assert.equal(u.invLerp(2, 4, 3), 0.5);
    assert.equal(u.invLerp(2, 2, 3), 0);
  });
});

describe('formatNumber', () => {
  const { DSL } = loadDSL([]);
  const f = DSL.util.formatNumber;
  const cases = [
    [[0.5], '0.5'],
    [[1], '1'],
    [[2.5, 3], '2.5'],
    [[12.3456, 3], '12.3'],
    [[3.14159265], '3.142'],
    [[1234.5, 3], '1235'],
    [[-2.5], '−2.5'],
    [[-2.5, 4, { ascii: true }], '-2.5'],
    [[0], '0'],
    [[-0], '0'],
    [[0.00123], '0.00123'],
    [[0.000123], '1.23×10⁻⁴'],
    [[0.000123, 4, { sci: 'e' }], '1.23e-4'],
    [[2500000, 3], '2.5×10⁶'],
    [[-2500000, 3, { sci: 'e' }], '−2.5e6'],
    [[9.99996, 4], '10'],
    [[1.5, 4, { decimals: 2 }], '1.50'],
    [[-0.001, 4, { decimals: 2 }], '0.00'],
    [[2, 4, { plus: true }], '+2'],
    [[NaN], '—'],
    [[Infinity], '∞'],
    [[-Infinity], '−∞'],
    [['3.5'], '3.5'],
  ];
  for (const [args, expected] of cases) {
    test(`formatNumber(${args.map((a) => JSON.stringify(a)).join(', ')}) → ${expected}`, () => {
      assert.equal(f(...args), expected);
    });
  }

  test('usa siempre punto decimal', () => {
    for (const x of [0.1, 1.25, 1234.5678, 0.0042]) assert.equal(f(x).includes(','), false);
  });
});

describe('parseNumber', () => {
  const { DSL } = loadDSL([]);
  const p = DSL.util.parseNumber;
  const ok = [
    ['1.5', 1.5], ['1,5', 1.5], [' 2 ', 2], ['-3', -3], ['−3,25', -3.25], ['+4', 4],
    ['.5', 0.5], [',5', 0.5], ['5.', 5], ['1e-3', 0.001], ['1,5E3', 1500],
    ['1.5×10⁻³', 0.0015], ['2x10^3', 2000], ['2*10^(-2)', 0.02], ['1.23×10⁴', 12300],
    [7, 7],
  ];
  for (const [input, expected] of ok) {
    test(`parseNumber(${JSON.stringify(input)}) → ${expected}`, () => {
      assert.ok(Math.abs(p(input) - expected) < 1e-12, `${p(input)} ≠ ${expected}`);
    });
  }
  const bad = ['', '   ', 'abc', '1,2,3', '1.000,5', '1 2', '--1', '1e', 'e5', null, undefined, '0x10', 'Infinity'];
  for (const input of bad) {
    test(`parseNumber(${JSON.stringify(input)}) → NaN`, () => {
      assert.ok(Number.isNaN(p(input)));
    });
  }

  test('ida y vuelta formatNumber → parseNumber (muestra determinista)', () => {
    const rng = DSL.util.mulberry32(7);
    for (let i = 0; i < 2000; i++) {
      const mag = Math.floor(rng() * 20) - 10;
      const x = (rng() * 2 - 1) * 10 ** mag;
      for (const sci of ['unicode', 'e']) {
        const s = DSL.util.formatNumber(x, 6, { sci });
        const back = p(s);
        const tol = Math.abs(x) * 1e-5 + (Math.abs(x) < 1e-3 ? 0 : 1e-9);
        assert.ok(Math.abs(back - x) <= tol, `${x} → ${s} → ${back}`);
      }
    }
  });
});

/* ===================================================================== azar determinista */

describe('mulberry32 y gaussian', () => {
  // Implementación de referencia publicada (Tommy Ettinger), en el reino de Node.
  function reference(a) {
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  test('coincide con la referencia y es reproducible', () => {
    const { DSL } = loadDSL([]);
    for (const seed of [0, 1, 42, 123456789, 0xFFFFFFFF]) {
      const a = DSL.util.mulberry32(seed);
      const b = DSL.util.mulberry32(seed);
      const r = reference(seed >>> 0);
      for (let i = 0; i < 1000; i++) {
        const x = a();
        assert.equal(x, b());
        assert.equal(x, r());
        assert.ok(x >= 0 && x < 1);
      }
    }
  });

  test('gaussian tiene media ≈ 0 y varianza ≈ 1', () => {
    const { DSL } = loadDSL([]);
    const rng = DSL.util.mulberry32(2024);
    const n = 40000;
    let s = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const g = DSL.util.gaussian(rng);
      s += g;
      s2 += g * g;
    }
    const mean = s / n;
    const variance = s2 / n - mean * mean;
    assert.ok(Math.abs(mean) < 0.03, `media ${mean}`);
    assert.ok(Math.abs(variance - 1) < 0.04, `varianza ${variance}`);
  });
});

/* ===================================================================== temporización */

describe('debounce y throttle', () => {
  test('debounce agrupa y usa los últimos argumentos; cancel y flush', () => {
    const { DSL, env } = loadDSL([]);
    const calls = [];
    const d = DSL.util.debounce((x) => calls.push(x), 100);
    d(1); env.tick(50); d(2); env.tick(99);
    assert.deepStrictEqual(calls, []);
    assert.equal(d.pending(), true);
    env.tick(1);
    assert.deepStrictEqual(calls, [2]);
    d(3); d.cancel(); env.tick(200);
    assert.deepStrictEqual(calls, [2]);
    d(4); assert.equal(d.flush(), 2);
    assert.deepStrictEqual(calls, [2, 4]);
  });

  test('throttle: flanco inicial inmediato y final con la última llamada', () => {
    const { DSL, env } = loadDSL([]);
    env.tick(1000);
    const calls = [];
    const t = DSL.util.throttle((x) => calls.push([x, env.clock.now]), 100);
    t(1); t(2); t(3);
    assert.deepStrictEqual(calls, [[1, 1000]]);
    env.tick(100);
    assert.deepStrictEqual(calls, [[1, 1000], [3, 1100]]);
    env.tick(500);
    t(4);
    assert.deepStrictEqual(calls.at(-1), [4, 1600]);
    t(5); t.cancel(); env.tick(500);
    assert.equal(calls.length, 3);
  });
});

describe('loop (ticker rAF compartido)', () => {
  test('dt = 0 en el primer frame, luego en segundos y recortado a maxDt', () => {
    const { DSL, env } = loadDSL([]);
    const dts = [];
    const lp = DSL.util.loop((dt) => dts.push(dt), { maxDt: 0.05 });
    assert.equal(env.pendingFrames(), 0, 'no se programa nada hasta start()');
    lp.start();
    env.frame(16); env.frame(16); env.frame(200);
    assert.deepStrictEqual(dts, [0, 0.016, 0.05]);
    lp.stop();
    env.frames(3);
    assert.equal(dts.length, 3);
    assert.equal(env.pendingFrames(), 0, 'el ticker se detiene si no hay bucles activos');
  });

  test('varios bucles comparten un único requestAnimationFrame', () => {
    const { DSL, env } = loadDSL([]);
    let a = 0;
    let b = 0;
    DSL.util.loop(() => { a += 1; }, { autostart: true });
    DSL.util.loop(() => { b += 1; }, { autostart: true });
    assert.equal(env.pendingFrames(), 1);
    env.frames(5);
    assert.equal(a, 5);
    assert.equal(b, 5);
  });

  test('se pausa con la pestaña oculta y reanuda con dt = 0', () => {
    const { DSL, env } = loadDSL([]);
    const dts = [];
    const lp = DSL.util.loop((dt) => dts.push(dt), { autostart: true });
    env.frame(16); env.frame(16);
    env.setHidden(true);
    assert.equal(lp.isActive(), false);
    assert.equal(lp.isRunning(), true);
    env.frames(4);
    env.setHidden(false);
    env.frame(16); env.frame(16);
    assert.deepStrictEqual(dts, [0, 0.016, 0, 0.016]);
  });

  test('con element se pausa fuera de pantalla', () => {
    const { DSL, env, document } = loadDSL([]);
    const el = document.createElement('div');
    let n = 0;
    const lp = DSL.util.loop(() => { n += 1; }, { element: el, autostart: true });
    env.frames(3);
    assert.equal(n, 0, 'aún no es visible');
    env.intersect(el, true);
    env.frames(3);
    assert.equal(n, 3);
    env.intersect(el, false);
    env.frames(3);
    assert.equal(n, 3);
    lp.destroy();
    env.intersect(el, true);
    env.frames(3);
    assert.equal(n, 3, 'destroy desconecta el observador');
    assert.equal(lp.start().isRunning(), false, 'un bucle destruido no arranca');
  });

  test('un error en el callback lo detiene y se informa', () => {
    const { DSL, env } = loadDSL([]);
    const lp = DSL.util.loop(() => { throw new Error('x'); }, { autostart: true });
    env.frames(3);
    assert.equal(lp.isRunning(), false);
    assert.equal(env.console.error.length, 1);
  });
});

/* ===================================================================== DOM */

describe('onVisible, observeSize, fitCanvas', () => {
  test('onVisible solo avisa en los cambios; once se desconecta', () => {
    const { DSL, env, document } = loadDSL([]);
    const el = document.createElement('div');
    const seen = [];
    DSL.util.onVisible(el, (v) => seen.push(v));
    env.intersect(el, true); env.intersect(el, true); env.intersect(el, false);
    assert.deepStrictEqual(seen, [true, false]);
    const once = [];
    DSL.util.onVisible(el, (v) => once.push(v), { once: true });
    env.intersect(el, true); env.intersect(el, false); env.intersect(el, true);
    assert.deepStrictEqual(once, [true]);
  });

  test('onVisible sin IntersectionObserver avisa visible en el acto', () => {
    const { DSL, document } = loadDSL([], { intersection: false });
    const seen = [];
    const stop = DSL.util.onVisible(document.createElement('div'), (v) => seen.push(v));
    assert.deepStrictEqual(seen, [true]);
    assert.equal(typeof stop, 'function');
  });

  test('observeSize agrupa cambios en un frame', () => {
    const { DSL, env, document } = loadDSL([]);
    const el = document.createElement('div');
    const sizes = [];
    DSL.util.observeSize(el, (s) => sizes.push(toPlain(s)));
    env.resize(el, 100, 50);
    env.resize(el, 200, 80);
    assert.deepStrictEqual(sizes, []);
    env.frame();
    assert.deepStrictEqual(sizes, [{ width: 200, height: 80 }]);
  });

  test('fitCanvas usa DPR con tope 2 y fija la transformación', () => {
    const { DSL, document } = loadDSL([], { dpr: 3 });
    const c = document.createElement('canvas');
    c.clientWidth = 200;
    c.clientHeight = 100;
    const r = DSL.util.fitCanvas(c);
    assert.equal(r.dpr, 2);
    assert.equal(c.width, 400);
    assert.equal(c.height, 200);
    assert.deepStrictEqual(toPlain(c.getContext('2d').calls.at(-1)), ['setTransform', 2, 0, 0, 2, 0, 0]);
    const r2 = DSL.util.fitCanvas(c, { width: 50, height: 20, maxDpr: 1 });
    assert.equal(r2.dpr, 1);
    assert.equal(c.width, 50);
  });
});

describe('h, svg, escapeHtml, uid, cssVar, ready', () => {
  test('h aplica props, eventos, dataset, estilos y aplana hijos', () => {
    const { DSL } = loadDSL([]);
    let clicks = 0;
    const el = DSL.util.h('button', {
      class: ['ds-btn', false, 'is-on'],
      type: 'button',
      disabled: true,
      hidden: false,
      'aria-label': 'Reproducir',
      dataset: { testid: 'gl-play', fooBar: 1 },
      style: { '--x': '3px', color: 'red' },
      onClick: () => { clicks += 1; },
    }, ['a', null, ['b', 3]], false);
    assert.equal(el.getAttribute('class'), 'ds-btn is-on');
    assert.equal(el.getAttribute('disabled'), '');
    assert.equal(el.hasAttribute('hidden'), false);
    assert.equal(el.getAttribute('aria-label'), 'Reproducir');
    assert.equal(el.getAttribute('data-testid'), 'gl-play');
    assert.equal(el.getAttribute('data-foo-bar'), '1');
    assert.equal(el.style.getPropertyValue('--x'), '3px');
    assert.equal(el.style.color, 'red');
    assert.equal(el.textContent, 'ab3');
    el.click();
    assert.equal(clicks, 1);
  });

  test('h asigna value/checked como propiedades y text como contenido', () => {
    const { DSL } = loadDSL([]);
    const input = DSL.util.h('input', { type: 'range', value: 5, checked: true });
    assert.equal(input.value, 5);
    assert.equal(input.checked, true);
    assert.equal(DSL.util.h('p', { text: '<b>' }).textContent, '<b>');
  });

  test('svg crea nodos en el espacio de nombres SVG', () => {
    const { DSL } = loadDSL([]);
    const c = DSL.util.svg('svg', { viewBox: '0 0 24 24' }, DSL.util.svg('circle', { cx: 1, cy: 2, r: 3 }));
    assert.equal(c.namespaceURI, 'http://www.w3.org/2000/svg');
    assert.equal(c.getAttribute('viewBox'), '0 0 24 24');
    assert.equal(c.firstChild.getAttribute('r'), '3');
  });

  test('escapeHtml, uid y cssVar', () => {
    const { DSL, env } = loadDSL([], { cssVars: { '--bg': '#0F1823' } });
    assert.equal(DSL.util.escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    assert.equal(DSL.util.escapeHtml(null), '');
    const a = DSL.util.uid('gl');
    const b = DSL.util.uid('gl');
    assert.notEqual(a, b);
    assert.match(a, /^gl-\d+$/);
    assert.equal(DSL.util.cssVar('--bg'), '#0F1823');
    assert.equal(DSL.util.cssVar('bg'), '#0F1823');
    assert.equal(DSL.util.cssVar('--nope'), '');
    env.setCssVar('--bg', '#FFFFFF');
    assert.equal(DSL.util.cssVar('--bg'), '#FFFFFF');
  });

  test('ready espera a DOMContentLoaded si el documento está cargando', () => {
    const { DSL, env } = loadDSL([], { readyState: 'loading' });
    let n = 0;
    DSL.util.ready(() => { n += 1; });
    assert.equal(n, 0);
    env.domReady();
    assert.equal(n, 1);
    DSL.util.ready(() => { n += 1; });
    assert.equal(n, 2, 'con el DOM listo se ejecuta en el acto');
  });
});

/* ===================================================================== almacenamiento y preferencias */

describe('store', () => {
  test('JSON con prefijo dsl.v1.', () => {
    const { DSL, env } = loadDSL([]);
    assert.equal(DSL.util.store.get('theme', 'x'), 'x');
    assert.equal(DSL.util.store.set('theme', 'light'), true);
    assert.equal(env.storage.get('dsl.v1.theme'), '"light"');
    assert.equal(DSL.util.store.get('theme'), 'light');
    assert.equal(DSL.util.store.remove('theme'), true);
    assert.equal(DSL.util.store.get('theme', null), null);
  });

  test('nunca lanza si el almacenamiento falla', () => {
    const { DSL } = loadDSL([], { storage: 'throw' });
    assert.equal(DSL.util.store.get('theme', 'dark'), 'dark');
    assert.equal(DSL.util.store.set('theme', 'light'), false);
    assert.equal(DSL.util.store.remove('theme'), false);
  });
});

describe('DSL.prefs', () => {
  test('reducedMotion inicial y en vivo con evento motion:change', () => {
    const { DSL, env } = loadDSL([], { media: { [RM]: true } });
    assert.equal(DSL.prefs.reducedMotion, true);
    const seen = [];
    DSL.bus.on('motion:change', (p) => seen.push(p.reducedMotion));
    env.setMedia(RM, false);
    assert.equal(DSL.prefs.reducedMotion, false);
    env.setMedia(RM, false);
    assert.deepStrictEqual(seen, [false], 'sin cambio no hay evento');
  });

  test('setReducedMotion fuerza y devuelve el control al sistema', () => {
    const { DSL, env } = loadDSL([]);
    const seen = [];
    DSL.bus.on('motion:change', (p) => seen.push(p.reducedMotion));
    DSL.prefs.setReducedMotion(true);
    env.setMedia(RM, false);
    assert.equal(DSL.prefs.reducedMotion, true, 'la preferencia forzada manda');
    env.setMedia(RM, true);
    DSL.prefs.setReducedMotion(null);
    assert.equal(DSL.prefs.reducedMotion, true);
    env.setMedia(RM, false);
    assert.equal(DSL.prefs.reducedMotion, false);
    assert.deepStrictEqual(seen, [true, false]);
  });

  test('setTheme: atributo, almacenamiento, meta theme-color y evento', () => {
    const { DSL, env, document } = loadDSL([], { cssVars: { '--bg': '#EEF2F6' } });
    assert.equal(DSL.prefs.theme, 'dark');
    const seen = [];
    DSL.bus.on('theme:change', (p) => seen.push(p.theme));
    assert.equal(DSL.prefs.setTheme('light'), 'light');
    assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
    assert.equal(env.storage.get('dsl.v1.theme'), '"light"');
    assert.equal(document.querySelector('meta[name="theme-color"]').getAttribute('content'), '#EEF2F6');
    DSL.prefs.setTheme('light');
    assert.deepStrictEqual(seen, ['light'], 'sin cambio no hay evento');
    assert.equal(DSL.prefs.toggleTheme(), 'dark');
    assert.deepStrictEqual(seen, ['light', 'dark']);
    assert.throws(() => DSL.prefs.setTheme('sepia'), /Tema desconocido/);
    DSL.prefs.setTheme('light', { persist: false });
    assert.equal(env.storage.get('dsl.v1.theme'), '"dark"');
  });

  test('setTheme funciona aunque el almacenamiento falle', () => {
    const { DSL, document } = loadDSL([], { storage: 'throw' });
    assert.equal(DSL.prefs.setTheme('light'), 'light');
    assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
  });

  test('el tema inicial se lee de <html data-theme>', () => {
    const env = createEnv();
    env.document.documentElement.setAttribute('data-theme', 'light');
    env.load(['js/core/ns.js']);
    assert.equal(env.run('DSL.prefs.theme'), 'light');
  });
});

/* ===================================================================== lazyInit y yieldTask (FND-07) */

describe('util.lazyInit', () => {
  function page(n = 2) {
    const r = loadDSL([]);
    const { DSL, document } = r;
    const els = Array.from({ length: n }, (_, i) => {
      const el = DSL.util.h('div', { id: 'lz' + i });
      document.body.appendChild(el);
      return el;
    });
    return { ...r, els };
  }

  test('cola ociosa FIFO: arranca 800 ms tras app:ready y ejecuta una fase por llamada', () => {
    const { DSL, env, els } = page(2);
    const order = [];
    const a = DSL.util.lazyInit(els[0], [() => order.push('a1'), () => order.push('a2')]);
    const b = DSL.util.lazyInit(els[1], [() => order.push('b1')]);
    env.tick(5000);
    assert.deepStrictEqual(order, [], 'nada antes de app:ready');
    DSL.bus.emit('app:ready', {});
    env.tick(799);
    assert.deepStrictEqual(order, []);
    env.tick(2);
    assert.deepStrictEqual(order, ['a1'], 'una fase por llamada ociosa');
    env.tick(1);
    assert.deepStrictEqual(order, ['a1', 'a2']);
    assert.equal(a.done, true);
    assert.equal(els[0].dataset.lazy, 'done');
    assert.equal(b.done, false);
    env.tick(5);
    assert.deepStrictEqual(order, ['a1', 'a2', 'b1']);
    assert.equal(b.done, true);
    env.tick(1000);
    assert.equal(order.length, 3, 'cada fase una sola vez');
    a.ensure();
    assert.equal(order.length, 3);
  });

  test('cerca del viewport ejecuta en el acto, en orden, todas las fases pendientes', () => {
    const { DSL, env, els } = page(1);
    const order = [];
    const lz = DSL.util.lazyInit(els[0], [() => order.push(1), () => order.push(2), () => order.push(3)], { rootMargin: '400px' });
    DSL.bus.emit('app:ready', {});
    env.tick(801);
    assert.deepStrictEqual(order, [1]);
    env.intersect(els[0], true);
    assert.deepStrictEqual(order, [1, 2, 3], 'síncrono en el callback de visibilidad');
    assert.equal(lz.done, true);
    assert.equal(els[0].dataset.lazy, 'done');
    env.tick(1000);
    assert.deepStrictEqual(order, [1, 2, 3]);
  });

  test('ensure() ejecuta ya lo pendiente; destroy() descarta el resto', () => {
    const { DSL, env, els } = page(2);
    const order = [];
    const a = DSL.util.lazyInit(els[0], [() => order.push('a1'), () => order.push('a2')]);
    const b = DSL.util.lazyInit(els[1], [() => order.push('b1'), () => order.push('b2')]);
    a.ensure();
    assert.deepStrictEqual(order, ['a1', 'a2']);
    b.destroy();
    DSL.bus.emit('app:ready', {});
    env.tick(3000);
    assert.deepStrictEqual(order, ['a1', 'a2']);
    assert.equal(b.done, false);
    assert.equal(els[1].dataset.lazy, undefined);
  });

  test('una fase que lanza registra console.error y detiene solo esa instancia', () => {
    const { DSL, env, els } = page(2);
    const order = [];
    const a = DSL.util.lazyInit(els[0], [() => { throw new Error('fallo de fase'); }, () => order.push('a2')]);
    DSL.util.lazyInit(els[1], [() => order.push('b1')]);
    DSL.bus.emit('app:ready', {});
    env.tick(900);
    assert.equal(env.console.error.length, 1);
    assert.match(String(env.console.error[0][0]), /lazyInit/);
    assert.deepStrictEqual(order, ['b1'], 'las demás instancias siguen');
    assert.equal(a.done, false);
    assert.equal(els[0].dataset.lazy, 'error');
    a.ensure();
    assert.deepStrictEqual(order, ['b1'], 'una instancia detenida no continúa');
  });

  test('usa requestIdleCallback con timeout 2000 si existe; tras app:ready, una instancia nueva espera los 800 ms', () => {
    const calls = [];
    let env;
    const ric = (cb, o) => { calls.push(o && o.timeout); env.window.setTimeout(() => cb({ timeRemaining: () => 10, didTimeout: false }), 5); return calls.length; };
    const r = loadDSL([], { globals: { requestIdleCallback: ric } });
    env = r.env;
    const { DSL, document } = r;
    DSL.bus.emit('app:ready', {});
    env.tick(100);
    const el = document.body.appendChild(DSL.util.h('div'));
    const order = [];
    DSL.util.lazyInit(el, [() => order.push(1), () => order.push(2)]);
    env.tick(600);
    assert.deepStrictEqual(order, [], 'los 800 ms cuentan desde app:ready');
    env.tick(106);
    assert.deepStrictEqual(order, [1]);
    env.tick(10);
    assert.deepStrictEqual(order, [1, 2]);
    assert.ok(calls.length >= 2 && calls.every((t) => t === 2000));
  });

  test('sin fases: queda hecha en el acto', () => {
    const { DSL, els } = page(1);
    const lz = DSL.util.lazyInit(els[0], []);
    assert.equal(lz.done, true);
    assert.equal(els[0].dataset.lazy, 'done');
  });
});

describe('util.yieldTask', () => {
  test('promesa resuelta con setTimeout(0) sin scheduler.yield', async () => {
    const { DSL, env } = loadDSL([]);
    let done = false;
    const p = DSL.util.yieldTask().then(() => { done = true; });
    await Promise.resolve();
    assert.equal(done, false);
    env.tick(0);
    await p;
    assert.equal(done, true);
  });

  test('usa scheduler.yield si existe', async () => {
    let used = 0;
    const scheduler = { yield: () => { used++; return Promise.resolve('y'); } };
    const { DSL } = loadDSL([], { globals: { scheduler } });
    assert.equal(await DSL.util.yieldTask(), 'y');
    assert.equal(used, 1);
  });
});
