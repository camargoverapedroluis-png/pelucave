// tests/unit/scenes.test.mjs — Propietario: scenes.
// Registro de escenas (DSL.viz.scenes), utilidades del kit (escalas «bonitas», escalas pegajosas,
// marcas) y ciclo de vida de las cinco escenas sobre el DOM falso: montaje, render con fotogramas del
// contrato, resumen textual, reconstrucción al cambiar tamaño, variante o escala, y destrucción.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadDSL, toPlain } from '../helpers/load.mjs';

const FILES = [
  'js/viz/scenes/registry.js', 'js/viz/scenes/massSpring.js', 'js/viz/scenes/tanks.js',
  'js/viz/scenes/rlc.js', 'js/viz/scenes/sir.js', 'js/viz/scenes/market.js',
];

function setup(opts = {}) {
  const ctx = loadDSL(FILES, opts);
  return ctx;
}

function stage(document, w = 600, h = 375) {
  const el = document.createElement('div');
  el.clientWidth = w;
  el.clientHeight = h;
  document.body.appendChild(el);
  return el;
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

const FRAMES = {
  massSpring: { variant: 'base', params: { m: 1, b: 0.6, k: 4 }, at: (t) => ({ state: [0.2 * Math.sin(t), 0.2 * Math.cos(t)], outputs: { x: 0.2 * Math.sin(t), v: 0.2 * Math.cos(t) }, input: { type: 'escalon', value: 1 } }) },
  tanks: { variant: 'lineal', params: { A: 1, R: 2 }, at: (t) => ({ state: [1 - Math.exp(-t / 2)], outputs: { h: 1 - Math.exp(-t / 2), qout: (1 - Math.exp(-t / 2)) / 2 }, input: { type: 'escalon', value: 0.5 } }) },
  rlc: { variant: 'serie', params: { R: 1, L: 0.5, C: 0.1 }, at: (t) => ({ state: [0.3 * Math.sin(3 * t), 1 - Math.cos(3 * t)], outputs: { i: 0.3 * Math.sin(3 * t), vC: 1 - Math.cos(3 * t) }, input: { type: 'escalon', value: 1 } }) },
  sir: { variant: 'base', params: { beta: 0.3, gamma: 0.1, N: 10000, I0: 10 }, at: (t) => ({ state: [9000 - 50 * t, 900, 100 + 50 * t], outputs: { S: 9000 - 50 * t, I: 900, R: 100 + 50 * t }, input: { type: 'ninguna', value: 0 } }) },
  market: { variant: 'telarana', params: { a: 10, b: 1, c: 1, d: 0.8, P0: 8 }, at: (k) => { const P = 5 + 3 * Math.pow(-0.8, k); return { state: [P], outputs: { P, Qd: 10 - P, Qs: 1 + 0.8 * (5 + 3 * Math.pow(-0.8, Math.max(0, k - 1))) }, input: { type: 'ninguna', value: 0 } }; } },
};

function frame(id, t, dt = 0) {
  const f = FRAMES[id];
  const discrete = id === 'market';
  const tt = discrete ? Math.round(t) : t;
  return { t: tt, dt, params: { ...f.params }, variant: f.variant, ...f.at(tt) };
}

describe('registro', () => {
  test('registra las cinco escenas del contrato en orden', () => {
    const { DSL } = setup();
    assert.deepStrictEqual(toPlain(DSL.viz.scenes.list()), ['massSpring', 'tanks', 'rlc', 'sir', 'market']);
    for (const id of ['massSpring', 'tanks', 'rlc', 'sir', 'market']) assert.equal(DSL.viz.scenes.has(id), true);
    assert.equal(DSL.viz.scenes.has('pendulum'), false);
  });

  test('errores de uso con mensajes en español', () => {
    const { DSL, document } = setup();
    const sc = DSL.viz.scenes;
    assert.throws(() => sc.register('massSpring', () => ({})), /ya está registrada/);
    assert.throws(() => sc.register('', () => ({})), /texto no vacío/);
    assert.throws(() => sc.register('x', null), /debe ser una función/);
    assert.throws(() => sc.create('nada', stage(document)), /no existe la escena «nada»/);
    assert.throws(() => sc.create('rlc', null), /falta el contenedor/);
  });

  test('una fábrica registrada recibe el contenedor y las opciones', () => {
    const { DSL, document } = setup();
    let got = null;
    DSL.viz.scenes.register('prueba', (c, o) => { got = [c, o]; return { render() {}, resize() {}, destroy() {} }; });
    const el = stage(document);
    DSL.viz.scenes.create('prueba', el, { variant: 'v' });
    assert.equal(got[0], el);
    assert.equal(got[1].variant, 'v');
  });
});

describe('kit', () => {
  test('niceCeil redondea a la escala 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ', () => {
    const { DSL } = setup();
    const k = DSL.viz.scenes.kit;
    const cases = [[0.9, 1], [1, 1], [1.1, 1.2], [11.2, 12], [13, 15], [0.26, 0.3], [0.031, 0.04], [7, 8], [8.5, 10], [450, 500], [0, 1], [-3, 1]];
    for (const [x, want] of cases) assert.equal(k.niceCeil(x), want, `niceCeil(${x})`);
  });

  test('niceStep y ticks sin errores de coma flotante', () => {
    const { DSL } = setup();
    const k = DSL.viz.scenes.kit;
    assert.equal(k.niceStep(12, 5), 2.5);
    assert.equal(k.niceStep(0.6, 2), 0.5);
    assert.deepStrictEqual(toPlain(k.ticks(-0.3, 0.3, 0.1)), [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3]);
    assert.deepStrictEqual(toPlain(k.ticks(0, 12, 2.5)), [0, 2.5, 5, 7.5, 10]);
  });

  test('la escala pegajosa solo crece y vuelve a su base con reset', () => {
    const { DSL } = setup();
    const s = DSL.viz.scenes.kit.sticky(1e-6, 1.25);
    assert.equal(s.reset(0.4), 0.4);
    assert.equal(s.observe(0.2), false);
    assert.equal(s.observe(-0.38), false);
    assert.equal(s.observe(0.5), true);
    assert.equal(s.value, 0.8);           // 0.5 × 1.25 = 0.625 → 0.8
    assert.equal(s.observe(0.1), false);
    assert.equal(s.value, 0.8);
    s.reset(0.4);
    assert.equal(s.value, 0.4);
    assert.equal(s.observe(NaN), false);
  });

  test('fmt usa punto decimal y espacio duro antes de la unidad', () => {
    const { DSL } = setup();
    assert.equal(DSL.viz.scenes.kit.fmt(-0.1234, 'm', 3), '−0.123 m');
    assert.equal(DSL.viz.scenes.kit.fmt(2, ''), '2');
  });

  test('fmtRef fija los decimales por la escala: ancho estable, sin notación científica ni «−0»', () => {
    const { DSL } = setup();
    const { fmtRef } = DSL.viz.scenes.kit;
    assert.equal(fmtRef(3.14159, 'V', 12), '3.1 V');
    assert.equal(fmtRef(-2.47e-4, 'V', 12), '0.0 V');
    assert.equal(fmtRef(0.0123, 'A', 0.5), '0.012 A');
    assert.equal(fmtRef(-0.0004, 'm', 1), '0.00 m');
    // escala aún desconocida: tres cifras significativas
    assert.equal(fmtRef(0, 'V', 1e-9), '0 V');
    assert.equal(fmtRef(2.5e-8, 'V', 0), '2.5×10⁻⁸ V');
  });
});

describe('kit: anchos de texto y franja de lecturas', () => {
  test('textWidth: em por carácter × px × 1.03; subíndices al 86 %; 13 px por omisión', () => {
    const { DSL } = setup();
    const { textWidth } = DSL.viz.scenes.kit;
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);
    near(textWidth('00', 10), 2 * 0.62 * 10 * 1.03);
    near(textWidth('0'), 0.62 * 13 * 1.03);
    near(textWidth('1.5', 20), (0.62 + 0.31 + 0.62) * 20 * 1.03);
    // partes como en label(): texto, { sym } y { sub } (86 %)
    near(textWidth([{ sym: 'Q' }, { sub: 'd' }, ' = '], 13), (0.72 + 0.6 * 0.86 + 0.27 + 0.62 + 0.27) * 13 * 1.03);
    near(textWidth(['ab', { sym: 'c' }], 13), textWidth('abc', 13));
    // la lectura más ancha de la franja del mercado es más ancha que una lectura corriente
    assert.ok(textWidth('−8.88×10⁹') > textWidth('25.74'));
    assert.equal(textWidth([], 13), 0);
  });

  test('strip: ranuras por elemento (slot), segunda fila desde leftRest, divisores (sep) y data-slot', () => {
    const { DSL, document } = setup();
    const k = DSL.viz.scenes.kit;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const items = [
      { key: 'a', parts: [{ sym: 'a' }], slot: 100 },
      { key: 'b', parts: [{ sym: 'b' }], slot: 120 },
      { key: 'c', parts: [{ sym: 'c' }], slot: 150 },
      { key: 'd', parts: [{ sym: 'd' }] },
    ];
    // ancho útil de la 1.ª fila: 400 − 160 = 240 → caben a (100) y b (120); c y d pasan a la 2.ª,
    // que empieza en leftRest = 20 (ancho 380: 150 + 124 = 274 caben)
    const sp = k.strip(svg, items, { left: 160, leftRest: 20, right: 400, top: 10, rowH: 20, sep: 8 });
    assert.equal(sp.rows, 2);
    assert.equal(sp.bottom, 10 + 2 * 20);
    const slot = (key) => sp.labels[key].el.getAttribute('data-slot');
    // texto anclado al final de su ranura; las ranuras de una fila acaban en right
    assert.equal(slot('b'), '280 400');
    assert.equal(slot('a'), '180 280');
    assert.equal(slot('d'), '276 400');     // slot por omisión: 124
    assert.equal(slot('c'), '126 276');
    for (const key of ['a', 'b', 'c', 'd']) {
      assert.match(sp.labels[key].el.getAttribute('class'), /(^|\s)sc-readout(\s|$)/);
      assert.equal(sp.labels[key].el.getAttribute('text-anchor'), 'end');
    }
    assert.equal(Number(sp.labels.a.el.getAttribute('x')), 280);
    assert.equal(Number(sp.labels.c.el.getAttribute('y')), 10 + 11 + 20);
    // divisor en el centro del hueco al inicio de cada ranura que no abre fila: b y d
    const seps = all(svg, (n) => (n.getAttribute('class') || '') === 'sc-strip-sep');
    assert.deepStrictEqual(seps.map((n) => Number(n.getAttribute('x1'))), [284, 280]);
    // sin leftRest, la 2.ª fila usa left: c (150) ya no cabe con d (124) en 240 → tres filas
    const svg2 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const sp2 = k.strip(svg2, items, { left: 160, right: 400, top: 0 });
    assert.equal(sp2.rows, 3);
    assert.equal(all(svg2, (n) => (n.getAttribute('class') || '') === 'sc-strip-sep').length, 0);
  });

  test('mercado: la franja escribe 4 cifras y, desde 10⁵, la forma científica compacta que cabe en su ranura', () => {
    const { DSL, document, env } = setup();
    const el = stage(document);
    const p = { a: 10, b: 2, c: 1, d: 4, P0: 8 };
    const inst = DSL.viz.scenes.create('market', el, { variant: 'telarana', params: p });
    const fr = (k, P, Qd, Qs) => ({ t: k, dt: 0, params: p, variant: 'telarana', state: [P], outputs: { P, Qd, Qs }, input: { type: 'ninguna', value: 0 } });
    const read = () => {
      const out = {};
      all(el.childNodes[0], (n) => /(^|\s)sc-readout(\s|$)/.test(n.getAttribute('class') || '')).forEach((n) => {
        const [key, val] = n.textContent.split(' = ');
        out[key] = { val, slot: n.getAttribute('data-slot').split(' ').map(Number), w: DSL.viz.scenes.kit.textWidth(n.textContent) };
      });
      return out;
    };
    inst.render(fr(3, -819185, 1638470, -3276730));
    env.frame(16);
    let r = read();
    assert.equal(r.P.val, '−8.19×10⁵');
    assert.equal(r.Qd.val, '1.64×10⁶');
    assert.equal(r.Qs.val, '−3.28×10⁶');
    for (const key of ['P', 'Qd', 'Qs']) assert.ok(r[key].w <= r[key].slot[1] - r[key].slot[0], `${key}: ${r[key].w} > ranura`);
    inst.render(fr(4, 25.739, 0.0004, 3));
    env.frame(16);
    r = read();
    assert.equal(r.P.val, '25.74');
    assert.equal(r.Qd.val, '0.000');
    assert.equal(r.Qs.val, '3.000');
    assert.equal(r.k.val, '4');
    inst.destroy();
  });
});

describe('escenas sobre el DOM falso', () => {
  for (const id of ['massSpring', 'tanks', 'rlc', 'sir', 'market']) {
    test(`${id}: monta un SVG accesible, pinta fotogramas y se destruye limpio`, () => {
      const { DSL, document, env } = setup();
      const el = stage(document);
      const f0 = frame(id, 0);
      const inst = DSL.viz.scenes.create(id, el, { variant: f0.variant, params: f0.params });
      for (const k of ['render', 'resize', 'destroy', 'setVariant', 'summary']) assert.equal(typeof inst[k], 'function', k);
      const svg = el.childNodes[0];
      assert.equal(svg.localName, 'svg');
      assert.equal(svg.getAttribute('role'), 'img');
      assert.match(svg.getAttribute('class'), /\bsc-root\b/);
      assert.match(svg.getAttribute('aria-label'), /^Escena/);
      assert.equal(svg.getAttribute('data-testid'), `sc-${id}`);
      const sum = el.childNodes[1];
      assert.equal(sum.getAttribute('id'), svg.getAttribute('aria-describedby'));
      assert.equal(svg.getAttribute('viewBox'), '0 0 600 375');

      for (let i = 0; i <= 40; i++) inst.render(frame(id, i * 0.25, i ? 1 / 60 : 0));
      inst.render(frame(id, 10, 0));
      assert.ok(inst.summary().length > 20, 'resumen textual');
      assert.equal(sum.textContent, inst.summary());
      assert.match(svg.getAttribute('aria-label'), /^Escena[^.]*\. /);
      assert.doesNotMatch(inst.summary(), /NaN|undefined|Infinity/);
      assert.ok(all(svg, () => true).length > 10, 'dibujo con elementos');

      // cambio de tamaño: nueva caja de vista y se repinta el último estado
      env.resize(el, 360, 260);
      env.frame(16);
      assert.equal(svg.getAttribute('viewBox'), '0 0 360 260');
      assert.equal(env.console.error.length, 0);

      inst.destroy();
      assert.equal(el.childNodes.length, 0);
      inst.render(frame(id, 1, 0));   // tras destroy no hace nada
      assert.equal(el.childNodes.length, 0);
    });
  }

  test('sin tamaño no pinta hasta recibirlo y entonces dibuja el último fotograma', () => {
    const { DSL, document, env } = setup();
    const el = stage(document, 0, 0);
    const inst = DSL.viz.scenes.create('rlc', el, { params: FRAMES.rlc.params });
    inst.render(frame('rlc', 1, 0));
    const svg = el.childNodes[0];
    assert.equal(svg.childNodes.length, 0);
    env.resize(el, 500, 320);
    env.frame(16);
    assert.ok(svg.childNodes.length > 0);
    assert.match(inst.summary(), /^t = 1 s/);
  });

  test('tanks.setVariant cambia a dos tanques y el nombre accesible', () => {
    const { DSL, document } = setup();
    const el = stage(document);
    const inst = DSL.viz.scenes.create('tanks', el, { variant: 'lineal', params: { A: 1, R: 2 } });
    const svg = el.childNodes[0];
    assert.match(svg.getAttribute('aria-label'), /descarga lineal/);
    inst.setVariant('cascada', { A1: 1, R1: 1, A2: 1.5, R2: 1.2 });
    inst.render({ t: 2, dt: 0, state: [0.3, 0.1], outputs: { h1: 0.3, h2: 0.1 }, params: { A1: 1, R1: 1, A2: 1.5, R2: 1.2 }, input: { type: 'escalon', value: 0.5 }, variant: 'cascada' });
    assert.match(svg.getAttribute('aria-label'), /dos tanques en cascada/);
    assert.equal(all(svg, (n) => /(^|\s)sc-tank(\s|$)/.test(n.getAttribute('class') || '')).length, 2);
    assert.match(inst.summary(), /h₁ = 0\.3 m/);
    assert.match(inst.summary(), /sale q₂ = 0\.0833 m³\/s/);
  });

  test('torricelli deduce con model.deriv si la entrada es el caudal total o una desviación sobre q_in0', () => {
    const { DSL, document } = setup();
    const p = { A: 1, a: 0.05, qin0: 0.1 };
    const g = 9.81;
    const qout = (h) => p.a * Math.sqrt(2 * g * h);
    const devModel = { deriv: (t, x, u, pp) => [(pp.qin0 + u - qout(x[0])) / pp.A] };
    const totModel = { deriv: (t, x, u, pp) => [(u - qout(x[0])) / pp.A] };
    for (const [model, u, want] of [[devModel, 0.02, /Entra q_in = 0\.12 m³\/s/], [totModel, 0.12, /Entra q_in = 0\.12 m³\/s/]]) {
      const el = stage(document);
      const inst = DSL.viz.scenes.create('tanks', el, { model, variant: 'torricelli', params: p });
      inst.render({ t: 1, dt: 0, state: [0.2], outputs: { h: 0.2, qout: qout(0.2) }, params: p, input: { type: 'escalon', value: u }, variant: 'torricelli' });
      assert.match(inst.summary(), want);
      assert.match(inst.summary(), /punto de operación h₀ = 0\.204 m/);
    }
  });

  test('sir: la rejilla de 400 puntos refleja las proporciones de forma determinista', () => {
    const { DSL, document } = setup();
    const el = stage(document);
    const p = { beta: 0.3, gamma: 0.1, N: 10000, I0: 10 };
    const inst = DSL.viz.scenes.create('sir', el, { params: p });
    const count = () => {
      const dots = all(el.childNodes[0], (n) => /(^|\s)sc-pop(\s|$)/.test(n.getAttribute('class') || ''));
      const c = { s: 0, i: 0, r: 0, n: dots.length };
      dots.forEach((d) => { c[/sc-pop--(\w)/.exec(d.getAttribute('class'))[1]]++; });
      return c;
    };
    inst.render({ t: 0, dt: 0, state: [9990, 10, 0], outputs: { S: 9990, I: 10, R: 0 }, params: p, input: { type: 'ninguna', value: 0 }, variant: 'base' });
    assert.deepStrictEqual(count(), { s: 399, i: 1, r: 0, n: 400 });   // un infectado visible aunque 10/25 < 0.5
    inst.render({ t: 40, dt: 0, state: [5000, 2500, 2500], outputs: { S: 5000, I: 2500, R: 2500 }, params: p, input: { type: 'ninguna', value: 0 }, variant: 'base' });
    assert.deepStrictEqual(count(), { s: 200, i: 100, r: 100, n: 400 });
    inst.render({ t: 41, dt: 0, state: [5000, 2000, 3000], outputs: { S: 5000, I: 2000, R: 3000 }, params: p, input: { type: 'ninguna', value: 0 }, variant: 'base' });
    assert.deepStrictEqual(count(), { s: 200, i: 80, r: 120, n: 400 });
    // misma entrada en otra instancia → mismos puntos en cada estado
    const el2 = stage(document);
    const inst2 = DSL.viz.scenes.create('sir', el2, { params: p });
    inst2.render({ t: 41, dt: 0, state: [5000, 2000, 3000], outputs: { S: 5000, I: 2000, R: 3000 }, params: p, input: { type: 'ninguna', value: 0 }, variant: 'base' });
    const cls = (root) => all(root, (n) => /(^|\s)sc-pop(\s|$)/.test(n.getAttribute('class') || '')).map((n) => n.getAttribute('class'));
    assert.deepStrictEqual(cls(el2.childNodes[0]), cls(el.childNodes[0]));
  });

  test('sir: con distanciamiento u el flujo de contagio es β(1 − u)·S·I/N y la fórmula lo dice', () => {
    const { DSL, document } = setup();
    const el = stage(document);
    const p = { beta: 0.3, gamma: 0.1, N: 10000, I0: 10 };
    const inst = DSL.viz.scenes.create('sir', el, { params: p });
    const fr = (u) => ({ t: 30, dt: 0, state: [5000, 2000, 3000], outputs: { S: 5000, I: 2000, R: 3000 }, params: p, input: { type: 'escalon', value: u }, variant: 'base' });
    const visibleTexts = () => all(el.childNodes[0], (n) => n.tagName === 'text' && n.getAttribute('visibility') !== 'hidden').map((n) => n.textContent);
    inst.render(fr(0));
    assert.match(inst.summary(), /contagios 300 por día y/);          // 0.3·5000·2000/10000
    assert.ok(visibleTexts().includes('βSI/N'));
    assert.ok(!visibleTexts().includes('β(1−u)SI/N'));
    inst.render({ ...fr(0.5), t: 31 });
    assert.match(inst.summary(), /contagios 150 por día \(con distanciamiento u = 50 %\)/);
    assert.ok(visibleTexts().includes('β(1−u)SI/N'));
    assert.ok(!visibleTexts().includes('βSI/N'));
  });

  test('las etiquetas de parámetros usan la unidad de presentación del modelo si la declara', () => {
    const { DSL, document } = setup();
    const el = stage(document);
    const model = { id: 'rlc', params: () => [{ key: 'C', display: { unit: 'µF', factor: 1e6 } }, { key: 'L', display: { unit: 'mH', factor: 1000 } }, { key: 'R', display: null }] };
    const p = { R: 20, L: 0.2, C: 1e-4 };
    const inst = DSL.viz.scenes.create('rlc', el, { model, variant: 'serie', params: p });
    inst.render({ t: 0, dt: 0, state: [0, 0], outputs: { i: 0, vC: 0 }, params: p, input: { type: 'escalon', value: 5 }, variant: 'serie' });
    const texts = all(el.childNodes[0], (n) => n.tagName === 'text').map((n) => n.textContent);
    for (const s of ['C = 100 µF', 'L = 200 mH', 'R = 20 Ω']) assert.ok(texts.includes(s), s);
  });

  test('market: la telaraña rellena los periodos que no llegaron con la recurrencia del modelo', () => {
    const { DSL, document } = setup();
    const el = stage(document);
    const p = FRAMES.market.params;
    const inst = DSL.viz.scenes.create('market', el, { variant: 'telarana', params: p });
    inst.render(frame('market', 0));
    inst.render(frame('market', 5));     // salta de k = 0 a k = 5
    const segs = all(el.childNodes[0], (n) => /\bsc-cobweb\b/.test(n.getAttribute('class') || '') && n.getAttribute('visibility') === 'visible');
    assert.equal(segs.length, 10);       // 5 periodos × (vertical + horizontal)
    assert.match(inst.summary(), /^Periodo k = 5: precio P = 4\.017/);
    assert.match(inst.summary(), /la telaraña converge/);
    // reinicio: t retrocede → historia vacía
    inst.render(frame('market', 0));
    const after = all(el.childNodes[0], (n) => /\bsc-cobweb\b/.test(n.getAttribute('class') || '') && n.getAttribute('visibility') === 'visible');
    assert.equal(after.length, 0);
  });

  test('massSpring: la escala crece con el estado y se reinicia al retroceder el tiempo', () => {
    const { DSL, document } = setup();
    const el = stage(document);
    const p = { m: 1, b: 0.6, k: 4 };
    const inst = DSL.viz.scenes.create('massSpring', el, { params: p });
    const ruler = () => all(el.childNodes[0], (n) => /\bsc-tick\b/.test(n.getAttribute('class') || '') && n.localName === 'text').map((n) => n.textContent);
    inst.render({ t: 0, dt: 0, state: [0, 0], outputs: { x: 0, v: 0 }, params: p, input: { type: 'escalon', value: 1 }, variant: 'base' });
    const before = ruler();
    assert.ok(before.includes('0.5'), before.join(' '));     // F/k·1.6·1.25 = 0.5
    inst.render({ t: 1, dt: 0, state: [1.3, 0], outputs: { x: 1.3, v: 0 }, params: p, input: { type: 'escalon', value: 1 }, variant: 'base' });
    assert.notDeepStrictEqual(ruler(), before);
    inst.render({ t: 0, dt: 0, state: [0, 0], outputs: { x: 0, v: 0 }, params: p, input: { type: 'escalon', value: 1 }, variant: 'base' });
    assert.deepStrictEqual(ruler(), before);
  });

  test('con movimiento reducido el movimiento decorativo no avanza (rlc: puntos de corriente)', () => {
    const { DSL, document } = setup({ media: { '(prefers-reduced-motion: reduce)': true } });
    assert.equal(DSL.prefs.reducedMotion, true);
    const el = stage(document);
    const inst = DSL.viz.scenes.create('rlc', el, { params: FRAMES.rlc.params });
    const dots = () => all(el.childNodes[0], (n) => /\bsc-dot--zero\b/.test(n.getAttribute('class') || '')).map((n) => n.getAttribute('transform'));
    const f = frame('rlc', 0.5);
    inst.render({ ...f, dt: 0 });
    const a = dots();
    for (let i = 0; i < 30; i++) inst.render({ ...f, dt: 1 / 60 });
    assert.deepStrictEqual(dots(), a);
    DSL.prefs.setReducedMotion(false);
    for (let i = 0; i < 30; i++) inst.render({ ...f, dt: 1 / 60 });
    assert.notDeepStrictEqual(dots(), a);
  });
});
