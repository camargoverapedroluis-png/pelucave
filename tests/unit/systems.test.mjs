// tests/unit/systems.test.mjs — Propietario: systems.
// Registro y catálogo de modelos (docs/ARCHITECTURE.md §9.1–9.3): forma de cada modelo, rangos de
// parámetros, valores finitos en min/omisión/máx, invariantes físicos, respuesta al escalón simulada
// frente a la analítica de tf, Torricelli linealizado, telaraña cerrada frente a iteración, SIR
// conserva N, datos sintéticos deterministas y TeX válido (KaTeX real con throwOnError).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadDSL, toPlain, SCRIPTS } from '../helpers/load.mjs';

const require = createRequire(import.meta.url);
const katex = require('../../node_modules/katex/dist/katex.js');

const { DSL, env } = loadDSL([...SCRIPTS.core, ...SCRIPTS.systems]);
const S = DSL.systems;
const N = DSL.core.numeric;

const ALL = S.list({ all: true });
const variantsOf = (m) => toPlain(m.variants.map((v) => v.id));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≉ ${b} (tol ${tol})`);

/** Todas las combinaciones (modelo, variante). */
const PAIRS = [];
for (const m of ALL) for (const v of m.variants) PAIRS.push([m, v]);

function allFinite(arr) {
  for (const v of arr) {
    if (Array.isArray(v)) { if (!allFinite(v)) return false; } else if (!Number.isFinite(v)) return false;
  }
  return true;
}

function inputFromSpec(spec) {
  const out = { type: spec.id };
  for (const p of spec.params) out[p.key] = p.default;
  return out;
}

/** Elementos MathML con un número fijo de hijos. KaTeX pone un operador solo en un subíndice
 *  (I_{\max}) como tres hijos de <msub>: Firefox lo rechaza («Invalid markup») y un lector de pantalla
 *  lo lee mal (prueba en Firefox y WebKit antes del lanzamiento). */
const MATHML_ARITY = { msub: 2, msup: 2, msubsup: 3, mfrac: 2, mover: 2, munder: 2, munderover: 3, mroot: 2 };
function mathmlArityErrors(tex) {
  const xml = katex.renderToString(tex, { throwOnError: true, strict: 'ignore', displayMode: true, output: 'mathml' });
  const stack = [];
  const bad = [];
  for (const [, close, name, self] of xml.matchAll(/<(\/?)([a-z][\w-]*)[^>]*?(\/?)>/g)) {
    if (close) {
      const el = stack.pop();
      if (MATHML_ARITY[el.name] && el.children !== MATHML_ARITY[el.name]) bad.push(`<${el.name}> con ${el.children} hijos`);
      continue;
    }
    if (stack.length) stack[stack.length - 1].children += 1;
    if (!self) stack.push({ name, children: 0 });
  }
  return bad;
}

function checkTex(tex, where) {
  assert.equal(typeof tex, 'string', `${where}: TeX no es texto`);
  assert.ok(tex.length > 0, `${where}: TeX vacío`);
  assert.doesNotThrow(() => katex.renderToString(tex, { throwOnError: true, strict: 'ignore', displayMode: true }), `${where}: KaTeX no puede representar «${tex}»`);
  assert.deepEqual(mathmlArityErrors(tex), [], `${where}: MathML inválido para «${tex}»`);
}

/* ======================================================================= registro */

describe('registro', () => {
  test('lista en orden de registro; pendulum solo con all', () => {
    assert.deepStrictEqual(toPlain(S.list().map((m) => m.id)), ['massSpring', 'tanks', 'rlc', 'sir', 'market']);
    assert.deepStrictEqual(toPlain(ALL.map((m) => m.id)), ['massSpring', 'tanks', 'rlc', 'sir', 'market', 'pendulum']);
  });

  test('get, CATEGORIES y errores de uso', () => {
    assert.equal(S.get('rlc').id, 'rlc');
    assert.equal(S.get('nada'), null);
    assert.deepStrictEqual(toPlain(S.CATEGORIES), {
      mecanico: 'Mecánico', hidraulico: 'Hidráulico', electrico: 'Eléctrico', biologico: 'Biológico', economico: 'Económico',
    });
    assert.throws(() => S.register(S.get('rlc')), /ya está registrado/);
    assert.throws(() => S.register({ id: 'x', category: 'otra' }), /categoría/);
    assert.throws(() => S.describe('tanks', 'inexistente'), /no tiene la variante/);
    assert.throws(() => S.simulate('nada'), /Modelo desconocido/);
  });

  test('describe devuelve la forma del contrato con hints evaluadas en los valores por omisión', () => {
    const d = S.describe('tanks', 'torricelli');
    assert.equal(d.model.id, 'tanks');
    assert.deepStrictEqual(toPlain(d.variant), { id: 'torricelli', label: d.variant.label, timeDomain: 'continuous', linear: false, timeUnit: 's', summary: d.variant.summary });
    assert.deepStrictEqual(toPlain(Object.keys(d.defaults)), ['A', 'a', 'qin0']);
    assert.equal(d.sceneId, 'tanks');
    assert.ok(d.hints.duration > 0 && d.hints.dt > 0 && d.hints.timeScale > 0);
    assert.equal(d.defaultInput.type, 'escalon');
    assert.equal(d.tfPairs[0].linearized, true);
  });

  test('el alias «ajuste» equivale a la variante walras', () => {
    assert.equal(S.variantOf('market', 'ajuste').id, 'walras');
    assert.equal(S.describe('market', 'ajuste').variant.id, 'walras');
    const a = S.simulate('market', { variant: 'ajuste' });
    const b = S.simulate('market', { variant: 'walras' });
    assert.equal(a.variant, 'walras');
    assert.deepStrictEqual(toPlain(a.x), toPlain(b.x));
    assert.ok(S.get('market').tf(S.defaults('market', 'walras'), 'ajuste').tf);
  });
});

/* ======================================================================= catálogo fijo §9.3 */

const CATALOGUE = {
  massSpring: { category: 'mecanico', variants: { base: ['continuous', true, 's'] }, params: { base: ['m', 'b', 'k'] },
    state: { base: ['x', 'v'] }, outputs: { base: [['x', '--c-out'], ['v', '--c-zero']] }, tfPairs: { base: ['x'] }, scene: 'massSpring', wizard: 'base' },
  tanks: { category: 'hidraulico', variants: { lineal: ['continuous', true, 's'], torricelli: ['continuous', false, 's'], cascada: ['continuous', true, 's'] },
    params: { lineal: ['A', 'R'], torricelli: ['A', 'a', 'qin0'], cascada: ['A1', 'R1', 'A2', 'R2'] },
    state: { lineal: ['h'], torricelli: ['h', 'dhLin'], cascada: ['h1', 'h2'] },
    outputs: { lineal: [['h', '--c-out'], ['qout', '--c-zero']], torricelli: [['h', '--c-out'], ['qout', '--c-zero'], ['hLin', '--c-out']], cascada: [['h1', '--c-out'], ['h2', '--c-zero']] },
    tfPairs: { lineal: ['h'], torricelli: ['h'], cascada: ['h2'] }, scene: 'tanks', wizard: 'lineal' },
  rlc: { category: 'electrico', variants: { serie: ['continuous', true, 's'] }, params: { serie: ['R', 'L', 'C'] }, state: { serie: ['i', 'vC'] },
    outputs: { serie: [['vC', '--c-out'], ['i', '--c-zero']] }, tfPairs: { serie: ['vC', 'i'] }, scene: 'rlc', wizard: 'serie' },
  sir: { category: 'biologico', variants: { base: ['continuous', false, 'días'] }, params: { base: ['beta', 'gamma', 'N', 'I0'] }, state: { base: ['S', 'I', 'R'] },
    outputs: { base: [['S', '--c-out'], ['I', '--c-pole'], ['R', '--c-zero']] }, tfPairs: { base: [] }, scene: 'sir', wizard: 'base' },
  market: { category: 'economico', variants: { telarana: ['discrete', true, 'periodos'], walras: ['continuous', true, 's'] },
    params: { telarana: ['a', 'b', 'c', 'd', 'P0'], walras: ['a', 'b', 'c', 'd', 'P0', 'alpha'] }, state: { telarana: ['P'], walras: ['P'] },
    outputs: { telarana: [['P', '--c-state'], ['Qd', '--c-out'], ['Qs', '--c-zero']], walras: [['P', '--c-state'], ['Qd', '--c-out'], ['Qs', '--c-zero']] },
    tfPairs: { telarana: [], walras: ['P'] }, scene: 'market', wizard: null },
  pendulum: { category: 'mecanico', variants: { nolineal: ['continuous', false, 's'], lineal: ['continuous', true, 's'] },
    params: { nolineal: ['L', 'c', 'theta0'], lineal: ['L', 'c', 'theta0'] }, state: { nolineal: ['theta', 'omega'], lineal: ['theta', 'omega'] },
    outputs: { nolineal: [['theta', '--c-out'], ['omega', '--c-zero']], lineal: [['theta', '--c-out'], ['omega', '--c-zero']] },
    tfPairs: { nolineal: [], lineal: [] }, scene: null, wizard: null },
};

describe('catálogo (ids, variantes y claves fijas)', () => {
  for (const m of ALL) {
    test(m.id, () => {
      const c = CATALOGUE[m.id];
      assert.ok(c, 'modelo fuera del catálogo');
      assert.equal(m.category, c.category);
      assert.equal(m.sceneId, c.scene);
      assert.equal(m.listed, m.id !== 'pendulum');
      assert.ok(typeof m.icon === 'string' && m.icon.length > 0);
      assert.ok(m.name && m.summary);
      assert.deepStrictEqual(variantsOf(m), Object.keys(c.variants));
      for (const v of m.variants) {
        const [dom, linear, unit] = c.variants[v.id];
        assert.equal(v.timeDomain, dom, `${v.id} timeDomain`);
        assert.equal(v.linear, linear, `${v.id} linear`);
        assert.equal(v.timeUnit, unit, `${v.id} timeUnit`);
        assert.ok(v.label, `${v.id} label`);
        assert.deepStrictEqual(toPlain(m.params(v.id).map((p) => p.key)), c.params[v.id], `${v.id} params`);
        assert.deepStrictEqual(toPlain(m.state(v.id).map((s) => s.key)), c.state[v.id], `${v.id} state`);
        assert.deepStrictEqual(toPlain(m.outputs(v.id).map((o) => [o.key, o.color])), c.outputs[v.id], `${v.id} outputs`);
        assert.deepStrictEqual(toPlain(m.tfPairs(v.id).map((t) => t.outputKey)), c.tfPairs[v.id], `${v.id} tfPairs`);
      }
      if (c.wizard) assert.equal(m.wizard.variant, c.wizard);
      else assert.equal(m.wizard, null);
    });
  }

  test('lista «Desde un sistema» del motor de G(s)', () => {
    const items = [];
    for (const m of S.list()) for (const v of m.variants) for (const t of m.tfPairs(v.id)) items.push(`${m.id}/${v.id}/${t.outputKey}${t.linearized ? ' (linealizado)' : ''}`);
    assert.deepStrictEqual(items, [
      'massSpring/base/x', 'tanks/lineal/h', 'tanks/torricelli/h (linealizado)', 'tanks/cascada/h2', 'rlc/serie/vC', 'rlc/serie/i', 'market/walras/P',
    ]);
  });
});

/* ======================================================================= fichas de parámetros y entradas */

describe('fichas de parámetros y de entradas', () => {
  const INPUT_KEYS = ['amplitude', 't0', 'width', 'omega', 'offset'];
  for (const [m, v] of PAIRS) {
    test(`${m.id}/${v.id}`, () => {
      for (const p of m.params(v.id)) {
        assert.ok(p.label && p.tooltip && typeof p.symbol === 'string' && typeof p.unit === 'string', `${p.key}: textos`);
        assert.ok(p.min < p.max && p.step > 0, `${p.key}: rango`);
        assert.ok(p.default >= p.min && p.default <= p.max, `${p.key}: valor por omisión fuera de rango`);
        assert.ok(p.scale === 'linear' || p.scale === 'log');
        if (p.scale === 'log') assert.ok(p.min > 0, `${p.key}: escala log con mínimo no positivo`);
        assert.equal(typeof p.live, 'boolean');
        checkTex(p.symbol, `${m.id}.${p.key}.symbol`);
      }
      const inputs = m.inputs(v.id);
      assert.ok(inputs.length >= 1);
      for (const s of inputs) {
        assert.ok(['escalon', 'pulso', 'senoidal', 'ninguna'].includes(s.id), s.id);
        assert.ok(s.label && typeof s.unit === 'string' && s.description, `${s.id}: textos`);
        checkTex(s.symbol, `${m.id}.${s.id}.symbol`);
        for (const p of s.params) {
          assert.ok(INPUT_KEYS.includes(p.key), `${s.id}: clave ${p.key}`);
          assert.ok(p.default >= p.min && p.default <= p.max, `${s.id}.${p.key}: por omisión fuera de rango`);
          assert.ok(p.label && p.tooltip);
        }
      }
      for (const o of m.outputs(v.id)) checkTex(o.symbol, `${m.id}.${o.key}.symbol`);
    });
  }
});

/* ======================================================================= valores finitos en min/omisión/máx */

/** Conjuntos de parámetros: omisión, cada parámetro en su mín. y su máx., todos al mín. y todos al máx. */
function paramSets(m, vid) {
  const specs = m.params(vid);
  const def = Object.fromEntries(specs.map((p) => [p.key, p.default]));
  const sets = [{ name: 'omisión', p: { ...def } }];
  for (const s of specs) {
    sets.push({ name: `${s.key}=mín`, p: { ...def, [s.key]: s.min } });
    sets.push({ name: `${s.key}=máx`, p: { ...def, [s.key]: s.max } });
  }
  sets.push({ name: 'todo mín', p: Object.fromEntries(specs.map((p) => [p.key, p.min])) });
  sets.push({ name: 'todo máx', p: Object.fromEntries(specs.map((p) => [p.key, p.max])) });
  return sets;
}

describe('cada modelo en min/omisión/máx de cada parámetro produce valores finitos e invariantes válidos', () => {
  for (const [m, v] of PAIRS) {
    test(`${m.id}/${v.id}`, () => {
      for (const { name, p } of paramSets(m, v.id)) {
        const where = `${m.id}/${v.id} [${name}]`;
        const h = m.hints(p, v.id);
        assert.ok(h.duration > 0 && h.dt > 0 && h.timeScale > 0 && Number.isFinite(h.duration), `${where}: hints`);
        if (v.timeDomain === 'continuous') {
          const steps = h.duration / h.dt;
          assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6, `${where}: dt no divide la duración`);
          assert.ok(steps <= 20001, `${where}: demasiados pasos (${steps})`);
        } else {
          assert.equal(h.dt, 1);
        }
        if (h.yRange) for (const [k, r] of Object.entries(h.yRange)) assert.ok(r[0] < r[1] && allFinite(r), `${where}: yRange.${k}`);
        for (const r of m.readouts(p, v.id)) {
          assert.ok(r.id && r.label, `${where}: lectura sin id`);
          if (r.value === null) assert.ok(typeof r.text === 'string' && r.text.length > 0, `${where}: ${r.id} sin valor ni texto`);
          else assert.ok(Number.isFinite(r.value) || (Number.isNaN(r.value) && r.text), `${where}: ${r.id} = ${r.value}`);
        }
        for (const spec of m.inputs(v.id)) {
          const traj = S.simulate(m, { variant: v.id, params: p, input: inputFromSpec(spec) });
          assert.ok(traj.stats.success, `${where} ${spec.id}: ${traj.stats.message}`);
          assert.ok(allFinite(traj.t) && allFinite(traj.x) && allFinite(traj.u), `${where} ${spec.id}: estado no finito`);
          for (const [k, arr] of Object.entries(traj.outputs)) assert.ok(allFinite(arr), `${where} ${spec.id}: salida ${k} no finita`);
          for (const inv of m.invariants(traj)) {
            assert.ok(inv.ok, `${where} ${spec.id}: invariante ${inv.id} falla: ${inv.value} > ${inv.tolerance} (${inv.detail})`);
          }
        }
      }
    });
  }
});

/* ======================================================================= respuesta al escalón frente a tf */

/** Para cada modelo lineal: { params, input, outputKey, offset } tal que y_sim − offset = A·step(t). */
function stepCases() {
  const cases = [];
  const add = (id, variant, outputKey, extra = {}) => {
    const m = S.get(id);
    for (const { name, p } of paramSets(m, variant)) {
      const params = { ...p, ...(extra.params ? extra.params(p) : {}) };
      cases.push({ id, variant, outputKey, name, params, amp: extra.amp ?? 1, offset: extra.offset ? extra.offset(params) : 0 });
    }
  };
  add('massSpring', 'base', 'x', { amp: 1 });
  add('massSpring', 'base', 'v', { amp: 1 });
  add('rlc', 'serie', 'vC', { amp: 5 });
  add('rlc', 'serie', 'i', { amp: 5 });
  add('tanks', 'lineal', 'h', { amp: 0.05 });
  add('tanks', 'lineal', 'qout', { amp: 0.05 });
  add('tanks', 'cascada', 'h2', { amp: 0.05 });
  add('tanks', 'cascada', 'h1', { amp: 0.05 });
  const eq = (p) => (p.a - p.c) / (p.b + p.d);
  add('market', 'walras', 'P', { amp: 10, params: (p) => ({ P0: eq(p) }), offset: (p) => eq(p) });
  add('pendulum', 'lineal', 'theta', { amp: 2, params: () => ({ theta0: 0 }) });
  return cases;
}

describe('la respuesta al escalón simulada coincide con tf(p).stepAnalytic()', () => {
  for (const c of stepCases()) {
    test(`${c.id}/${c.variant}/${c.outputKey} [${c.name}]`, () => {
      const m = S.get(c.id);
      const G = m.tf(c.params, c.variant, c.outputKey).tf;
      const an = G.stepAnalytic();
      assert.equal(an.exact, true);
      const traj = S.simulate(m, { variant: c.variant, params: c.params, input: { type: 'escalon', amplitude: c.amp, t0: 0 } });
      const y = traj.outputs[c.outputKey];
      let maxErr = 0, maxY = 0;
      for (let i = 0; i < traj.t.length; i++) {
        const ya = c.amp * an.fn(traj.t[i]);
        maxY = Math.max(maxY, Math.abs(ya));
        maxErr = Math.max(maxErr, Math.abs(y[i] - c.offset - ya));
      }
      assert.ok(maxErr <= 5e-5 * maxY + 1e-12, `error máximo ${maxErr} (escala ${maxY})`);
    });
  }

  test('tf() y la forma canónica: masa-resorte, RLC, tanque lineal y ajuste de precio', () => {
    const ms = S.get('massSpring').tf({ m: 2, b: 1, k: 8 }, 'base', 'x').tf.secondOrderParams();
    close(ms.wn, 2, 1e-12); close(ms.zeta, 1 / (2 * Math.sqrt(16)), 1e-12); close(ms.K, 1 / 8, 1e-12);
    const rp = { R: 20, L: 0.2, C: 1e-4 };
    const r = S.get('rlc').tf(rp, 'serie', 'vC').tf.secondOrderParams();
    close(r.wn, 1 / Math.sqrt(rp.L * rp.C), 1e-9); close(r.zeta, (rp.R / 2) * Math.sqrt(rp.C / rp.L), 1e-12);
    const ri = S.get('rlc').tf(rp, 'serie', 'i').tf;
    assert.equal(ri.dcGain(), 0);
    const tk = S.get('tanks').tf({ A: 2, R: 5 }, 'lineal', 'h').tf.firstOrderParams();
    close(tk.K, 5, 1e-12); close(tk.tau, 10, 1e-12);
    const mk = { a: 100, b: 2, c: 10, d: 1.5, P0: 40, alpha: 0.2 };
    const w = S.get('market').tf(mk, 'walras').tf;
    close(w.dcGain(), 1 / 3.5, 1e-12); close(w.poles()[0].re, -0.2 * 3.5, 1e-12);
    const cas = S.get('tanks').tf({ A1: 1, R1: 8, A2: 2, R2: 4 }, 'cascada', 'h2').tf;
    assert.equal(cas.poleGroups().length, 1, 'τ1 = τ2 da un polo doble');
    assert.equal(cas.poleGroups()[0].multiplicity, 2);
    close(cas.dcGain(), 4, 1e-12);
  });
});

/* ======================================================================= Torricelli */

describe('depósito de Torricelli', () => {
  const m = S.get('tanks');
  const sets = paramSets(m, 'torricelli');

  test('la R linealizada es la inversa de la derivada numérica de q_out(h) en h₀', () => {
    for (const { name, p } of sets) {
      const lz = m.linearization(p, 'torricelli');
      const h0 = lz.operatingPoint.h0;
      const q = (h) => m.output(0, [h], 0, p, 'torricelli').qout;
      close(q(h0), p.qin0, 1e-12 * p.qin0, `${name}: q_out(h0) = q_in0`);
      const dh = 1e-5 * h0;
      const dq = (q(h0 + dh) - q(h0 - dh)) / (2 * dh);
      const Rnum = 1 / dq;
      close(lz.R, Rnum, 1e-7 * Rnum, `${name}: R`);
      close(lz.R, 2 * h0 / p.qin0, 1e-12 * lz.R, `${name}: R = 2h0/qin0`);
      close(lz.tf.dcGain(), lz.R, 1e-9 * lz.R, `${name}: K = R`);
      close(m.tf(p, 'torricelli', 'h').tf.firstOrderParams().tau, p.A * lz.R, 1e-9 * p.A * lz.R, `${name}: τ = A·R`);
    }
  });

  test('parte del equilibrio y, para escalones pequeños, el modelo no lineal tiende al linealizado', () => {
    const p = S.defaults('tanks', 'torricelli');
    const still = S.simulate(m, { variant: 'torricelli', params: p, input: { type: 'ninguna' } });
    const h0 = m.linearization(p, 'torricelli').operatingPoint.h0;
    for (const h of still.outputs.h) close(h, h0, 1e-12 * h0, 'equilibrio');
    const G = m.tf(p, 'torricelli', 'h').tf;
    let prev = Infinity;
    for (const dq of [4e-3, 1e-3, 2.5e-4]) {
      const traj = S.simulate(m, { variant: 'torricelli', params: p, input: { type: 'escalon', amplitude: dq, t0: 0 } });
      let err = 0, scale = 0;
      traj.t.forEach((t, i) => {
        const lin = dq * G.stepAnalytic().fn(t);
        scale = Math.max(scale, Math.abs(lin));
        err = Math.max(err, Math.abs(traj.outputs.h[i] - h0 - lin));
      });
      const rel = err / scale;
      assert.ok(rel < prev, `el error relativo debe bajar con Δq: ${rel} ≥ ${prev}`);
      prev = rel;
    }
    assert.ok(prev < 0.01, `con Δq pequeño el error relativo es ${prev}`);
  });
});

/* ======================================================================= telaraña */

describe('telaraña', () => {
  const m = S.get('market');

  test('la forma cerrada coincide con la iteración (converge, ciclo y diverge)', () => {
    for (const [b, d] of [[2, 1.5], [2, 2], [1, 3], [4, 0.5], [0.5, 4]]) {
      const p = { a: 100, b, c: 10, d, P0: 40 };
      const traj = S.simulate(m, { variant: 'telarana', params: p, input: { type: 'ninguna' }, duration: 30 });
      const Ps = (p.a - p.c) / (b + d);
      traj.outputs.P.forEach((P, k) => {
        const closed = Ps + Math.pow(-d / b, k) * (p.P0 - Ps);
        close(P, closed, 1e-9 * Math.max(1, Math.abs(closed)), `b=${b} d=${d} k=${k}`);
      });
      const inv = m.invariants(traj)[0];
      assert.equal(inv.id, 'formaCerrada');
      assert.ok(inv.ok, inv.detail);
    }
  });

  test('con un desplazamiento de demanda, la suma explícita coincide con la iteración y el precio va al nuevo equilibrio', () => {
    const p = S.defaults('market', 'telarana');
    const traj = S.simulate(m, { variant: 'telarana', params: p, input: { type: 'escalon', amplitude: 10, t0: 5 }, duration: 60 });
    assert.ok(m.invariants(traj)[0].ok);
    const PsD = (p.a + 10 - p.c) / (p.b + p.d);
    close(traj.outputs.P[60], PsD, 1e-4 * PsD, 'nuevo equilibrio');
    assert.equal(traj.t[7], 7);
    // Q_d(k+1) = Q_s(k): el mercado se vacía con un periodo de retraso.
    const q = S.simulate(m, { variant: 'telarana', params: p, input: { type: 'ninguna' }, duration: 10 });
    for (let k = 0; k < 10; k++) close(q.outputs.Qd[k + 1], q.outputs.Qs[k], 1e-9 * q.outputs.Qs[k]);
  });

  test('G(z) y lecturas de estabilidad', () => {
    const z = m.zTransfer({ a: 100, b: 2, c: 10, d: 1.5, P0: 40 }, 'telarana');
    close(z.pole, -0.75, 1e-15);
    assert.equal(z.stable, true);
    assert.equal(m.zTransfer({ a: 100, b: 2, c: 10, d: 1.5, P0: 40, alpha: 0.2 }, 'walras'), null);
    const div = m.readouts({ a: 100, b: 1, c: 10, d: 3, P0: 40 }, 'telarana').find((r) => r.id === 'estabilidad');
    assert.match(div.text, /diverge/);
  });

  test('el ajuste continuo coincide con su solución exacta para cada entrada', () => {
    const p = S.defaults('market', 'walras');
    for (const spec of m.inputs('walras')) {
      const traj = S.simulate(m, { variant: 'walras', params: p, input: inputFromSpec(spec) });
      const inv = m.invariants(traj)[0];
      assert.ok(inv.ok, `${spec.id}: ${inv.detail}`);
    }
  });
});

/* ======================================================================= SIR */

describe('SIR', () => {
  const m = S.get('sir');

  test('S + I + R = N en cada muestra, con y sin intervención, en los extremos de los parámetros', () => {
    for (const { name, p } of paramSets(m, 'base')) {
      for (const spec of m.inputs('base')) {
        const traj = S.simulate(m, { params: p, input: inputFromSpec(spec) });
        for (const x of traj.x) close(x[0] + x[1] + x[2], p.N, 1e-9 * p.N, `${name} ${spec.id}`);
        assert.ok(m.invariants(traj).every((i) => i.ok), `${name} ${spec.id}`);
      }
    }
  });

  test('pruebas de condiciones extremas: β ≤ γ no produce epidemia; I_max y r∞ concuerdan con la simulación', () => {
    const calm = S.simulate(m, { params: { beta: 0.05, gamma: 0.5, N: 10000, I0: 50 } });
    for (let i = 1; i < calm.t.length; i++) assert.ok(calm.outputs.I[i] <= calm.outputs.I[i - 1] + 1e-12);
    const p = S.defaults('sir');
    const traj = S.simulate(m, { params: p, duration: 400 });
    const Imax = Math.max(...traj.outputs.I);
    const r = Object.fromEntries(m.readouts(p).map((x) => [x.id, x.value]));
    close(r.Imax, Imax, 1e-4 * Imax, 'I_max');
    close(r.final / 100, traj.outputs.R.at(-1) / p.N + traj.outputs.I.at(-1) / p.N, 2e-3, 'tamaño final');
    const tPeak = traj.t[traj.outputs.I.indexOf(Imax)];
    close(r.tPico, tPeak, 0.2, 'día del pico');
    close(r.R0, 3, 1e-12); close(r.umbral, 100 * (1 - 1 / 3), 1e-9);
  });

  test('la intervención (escalón de reducción de contactos) aplana el pico', () => {
    const p = S.defaults('sir');
    const base = Math.max(...S.simulate(m, { params: p, input: { type: 'ninguna' } }).outputs.I);
    const flat = Math.max(...S.simulate(m, { params: p, input: { type: 'escalon', amplitude: 0.5, t0: 20 } }).outputs.I);
    assert.ok(flat < 0.7 * base, `${flat} vs ${base}`);
  });

  test('sin G(s): tf nulo, sin pares y linealización I\' ≈ (β−γ)I', () => {
    const p = S.defaults('sir');
    assert.equal(m.tf(p, 'base'), null);
    assert.deepStrictEqual(toPlain(m.tfPairs('base')), []);
    const lz = m.linearization(p, 'base');
    close(lz.eigenvalue, p.beta - p.gamma, 1e-15);
    assert.equal(lz.tf, null);
    // Arranque exponencial: I(t) ≈ I0·e^{(β−γ)t} durante los primeros días.
    const traj = S.simulate(m, { params: p, duration: 5 });
    const i = traj.t.findIndex((t) => t >= 5 - 1e-9);
    close(traj.outputs.I[i], p.I0 * Math.exp((p.beta - p.gamma) * 5), 0.01 * traj.outputs.I[i]);
  });
});

/* ======================================================================= invariantes con entradas discontinuas */

describe('invariantes de energía y masa con cada entrada', () => {
  for (const [id, variant] of [['massSpring', 'base'], ['rlc', 'serie'], ['tanks', 'lineal'], ['tanks', 'torricelli'], ['tanks', 'cascada'], ['pendulum', 'nolineal'], ['pendulum', 'lineal']]) {
    test(`${id}/${variant}`, () => {
      const m = S.get(id);
      for (const spec of m.inputs(variant)) {
        const traj = S.simulate(m, { variant, input: inputFromSpec(spec) });
        for (const inv of m.invariants(traj)) {
          assert.ok(inv.ok, `${spec.id}: ${inv.detail}`);
          assert.ok(inv.relative < 1e-4, `${spec.id}: residuo relativo ${inv.relative}`);
        }
      }
    });
  }

  test('un balance falso se detecta (el invariante no es una tautología)', () => {
    const m = S.get('massSpring');
    const traj = S.simulate(m, {});
    traj.x = traj.x.map(([x, v]) => [x * 1.01, v]);
    assert.equal(m.invariants(traj)[0].ok, false);
  });
});

/* ======================================================================= derivaciones y TeX */

describe('derivaciones, linealizaciones, lecturas y asistente: TeX válido y textos en español', () => {
  for (const [m, v] of PAIRS) {
    test(`${m.id}/${v.id}`, () => {
      for (const { name, p } of paramSets(m, v.id).slice(0, 3)) {
        const keys = [undefined, ...m.tfPairs(v.id).map((t) => t.outputKey)];
        for (const key of keys) {
          const steps = m.derivation(p, v.id, key);
          assert.ok(steps.length >= 3, `${name}: pasos`);
          for (const s of steps) {
            assert.ok(s.id && s.title && s.text, `${name}: paso incompleto`);
            assert.ok(Array.isArray(s.tex) && s.tex.length > 0);
            s.tex.forEach((t, i) => checkTex(t, `${m.id}/${v.id} ${s.id}[${i}]`));
            assert.doesNotMatch(s.text, /\b(fácil|simple|simplemente|rápido)\b/i);
          }
        }
        const lz = m.linearization(p, v.id);
        if (lz) lz.tex.forEach((t, i) => checkTex(t, `${m.id}/${v.id} linearization[${i}]`));
        for (const r of m.readouts(p, v.id)) if (r.tex) checkTex(r.tex, `${m.id} lectura ${r.id}`);
        const pair = m.tfPairs(v.id)[0];
        if (pair) {
          checkTex(pair.label, `${m.id} tfPairs.label`);
          const t = m.tf(p, v.id, pair.outputKey);
          checkTex(t.inputSymbol, 'inputSymbol'); checkTex(t.outputSymbol, 'outputSymbol');
          checkTex(t.tf.toTex({ lhs: 'G(s)' }), 'toTex');
          assert.ok(t.tf.poles().every((z) => Number.isFinite(z.re) && Number.isFinite(z.im)));
        }
      }
    });
  }

  test('pasos 1–3 del contrato: ley, laplace y despeje en los modelos con G(s)', () => {
    for (const m of S.list()) for (const v of m.variants) for (const pair of m.tfPairs(v.id)) {
      const ids = m.derivation(S.defaults(m, v.id), v.id, pair.outputKey).map((s) => s.id);
      for (const id of ['ley', 'laplace', 'despeje', 'canonica']) assert.ok(ids.includes(id), `${m.id}/${v.id}/${pair.outputKey}: falta ${id}`);
      assert.ok(ids.indexOf('ley') < ids.indexOf('laplace') && ids.indexOf('laplace') < ids.indexOf('despeje'));
    }
  });

  test('los números sustituidos son los de los parámetros', () => {
    const steps = S.get('massSpring').derivation({ m: 1, b: 0.8, k: 4 }, 'base', 'x');
    const can = steps.find((s) => s.id === 'canonica').tex.join(' ');
    assert.match(can, /= 2\\;\\mathrm\{rad\/s\}/);
    assert.match(can, /= 0\.2(?!\d)/);
    assert.match(steps.find((s) => s.id === 'despeje').tex[2], /s\^\{2\} \+ 0\.8 s \+ 4/);
    const sir = S.get('sir').derivation(S.defaults('sir'), 'base');
    assert.ok(sir.some((s) => s.id === 'nolineal'), 'SIR explica por qué no hay G(s)');
    const cob = S.get('market').derivation(S.defaults('market', 'telarana'), 'telarana');
    assert.ok(cob.some((s) => s.id === 'sings'), 'la telaraña explica por qué no hay G(s)');
  });

  test('datos del asistente', () => {
    for (const id of ['massSpring', 'rlc', 'tanks', 'sir']) {
      const w = S.get(id).wizard;
      for (const k of ['inputs', 'outputs', 'elements', 'environment']) {
        assert.ok(Array.isArray(w.boundary[k]) && w.boundary[k].length > 0, `${id}.boundary.${k}`);
        for (const it of w.boundary[k]) { assert.ok(it.id && it.label); if (it.symbol) checkTex(it.symbol, `${id} ${it.id}`); }
      }
      for (const l of w.laws) { assert.ok(l.id && l.title && l.text); checkTex(l.tex, `${id} ley ${l.id}`); }
      for (const t of w.equationTerms) { assert.ok(t.id && t.label && t.text); checkTex(t.tex, `${id} término ${t.id}`); }
      checkTex(w.equation.tex, `${id} ecuación`);
      checkTex(w.stateSpace.tex, `${id} espacio de estados`);
      checkTex(w.stateSpace.texWith(S.defaults(id, w.variant)), `${id} espacio de estados numérico`);
      const ms = w.measured;
      assert.ok(S.get(id).params(w.variant).some((p) => p.key === ms.param && ms.trueValue >= p.min && ms.trueValue <= p.max), `${id}: parámetro medido`);
      assert.ok(S.get(id).outputs(w.variant).some((o) => o.key === ms.outputKey));
      assert.ok(ms.noise > 0 && ms.samples > 5 && ms.duration > 0 && Number.isInteger(ms.seed));
    }
    const sir = S.get('sir').wizard;
    assert.ok(sir.causal.loops.some((l) => l.type === 'refuerzo') && sir.causal.loops.some((l) => l.type === 'equilibrio'));
    assert.equal(sir.stocksFlows.stocks.length, 3);
  });
});

/* ======================================================================= señales y datos sintéticos */

describe('señales de entrada', () => {
  test('valores de cada tipo', () => {
    const e = S.inputSignal({ type: 'escalon', amplitude: 2, t0: 1, offset: 0.5 });
    assert.deepStrictEqual([e(0), e(0.999), e(1), e(5)], [0.5, 0.5, 2.5, 2.5]);
    const p = S.inputSignal({ type: 'pulso', amplitude: 3, t0: 1, width: 2 });
    assert.deepStrictEqual([p(0.5), p(1), p(2.9), p(3), p(4)], [0, 3, 3, 0, 0]);
    const s = S.inputSignal({ type: 'senoidal', amplitude: 2, omega: Math.PI, t0: 1 });
    assert.equal(s(0.5), 0); close(s(1.5), 2, 1e-12);
    const r = S.inputSignal({ type: 'rampa', amplitude: 3, t0: 1 });
    assert.deepStrictEqual([r(0), r(1), r(3)], [0, 0, 6]);
    assert.equal(S.inputSignal({ type: 'ninguna', offset: 4 })(10), 4);
    assert.equal(S.inputSignal({ type: 'escalon' })(0), 1, 'amplitud por omisión 1');
    assert.throws(() => S.inputSignal({ type: 'rafaga' }), /desconocido/);
    assert.deepStrictEqual(toPlain(S.inputBreakpoints({ type: 'pulso', amplitude: 1, t0: 2, width: 3 })), [2, 5]);
  });

  test('simulate parte la integración en los saltos: dos muestras en t₀ con los límites laterales', () => {
    const traj = S.simulate('massSpring', { input: { type: 'escalon', amplitude: 1, t0: 1.234 } });
    const idx = traj.t.map((t, i) => (Math.abs(t - 1.234) < 1e-12 ? i : -1)).filter((i) => i >= 0);
    assert.equal(idx.length, 2);
    assert.deepStrictEqual([traj.u[idx[0]], traj.u[idx[1]]], [0, 1]);
    assert.deepStrictEqual(toPlain(traj.x[idx[0]]), toPlain(traj.x[idx[1]]));
  });

  test('simulate es determinista', () => {
    const a = S.simulate('rlc', { input: { type: 'pulso', amplitude: 5, t0: 0.003, width: 0.02 } });
    const b = S.simulate('rlc', { input: { type: 'pulso', amplitude: 5, t0: 0.003, width: 0.02 } });
    assert.deepStrictEqual(toPlain(a), toPlain(b));
  });
});

describe('datos sintéticos del asistente', () => {
  for (const id of ['massSpring', 'rlc', 'tanks', 'sir']) {
    test(id, () => {
      const a = S.syntheticData(id), b = S.syntheticData(id);
      assert.deepStrictEqual(toPlain(a), toPlain(b), 'determinista');
      const w = S.get(id).wizard.measured;
      assert.equal(a.t.length, w.samples);
      assert.ok(allFinite(a.y));
      const atTrue = S.calibrationError(id, w.trueValue, a).rmse;
      close(atTrue, w.noise, 0.4 * w.noise, 'el RMSE en el valor verdadero es del orden del ruido');
      const def = S.defaults(id, a.variant)[w.param];
      const atDef = S.calibrationError(id, def, a).rmse;
      assert.ok(atDef > atTrue, `RMSE con el valor por omisión (${atDef}) mayor que con el verdadero (${atTrue})`);
    });
  }
});

/* ======================================================================= lecturas fuera del régimen subamortiguado */

describe('lecturas que dependen del régimen (CORE-02, CORE-03)', () => {
  const ts = (q) => S.get('massSpring').readouts({ ...S.defaults('massSpring'), ...q }).find((r) => r.id === 'ts');

  test('masa-resorte sobreamortiguado: t_s medido sobre la respuesta exacta, no 4/(ζωn)', () => {
    const r = ts({ m: 1, b: 5, k: 1 });
    close(r.value, 18.96, 0.05, 'ts');
    assert.equal(r.approx, false);
    assert.equal(r.label, 'Tiempo de establecimiento (2 %)');
    const zeta = 5 / 2, wn = 1;
    assert.ok(Math.abs(r.value - 4 / (zeta * wn)) > 10, 'la regla de la envolvente daría 1.6 s');
    // Es el t_s exacto de G(s) = 1/(ms² + bs + k).
    close(r.value, new (S.helpers.tfClass())([1], [1, 5, 1]).stepInfo().settlingTime, 1e-12);
  });
  test('masa-resorte crítico: t_s = 2.917 s (polo doble en −2)', () => {
    const r = ts({ m: 1, b: 4, k: 4 });
    close(r.value, 2.917, 0.01, 'ts');
    assert.equal(r.approx, false);
  });
  test('masa-resorte subamortiguado (por omisión): 4/(ζωn) = 10 s, aproximado', () => {
    const r = ts({});
    close(r.value, 10, 1e-12);
    assert.equal(r.approx, true);
    assert.equal(r.label, 'Tiempo de establecimiento (≈, 2 %)');
    assert.equal(ts({ b: 0 }), undefined, 'sin amortiguamiento no hay t_s');
  });

  const tau = (p) => S.get('rlc').readouts(p).find((r) => r.id === 'tau');
  test('RLC sobreamortiguado: constante de tiempo dominante −1/p_lenta', () => {
    const p = { R: 100, L: 0.05, C: 1e-3 };
    const r = tau(p);
    close(r.value, 0.0995, 0.005 * 0.0995, 'τ');
    assert.equal(r.label, 'Constante de tiempo dominante');
    const slow = Math.max(...S.get('rlc').tf(p, 'serie', 'vC').tf.poles().map((z) => z.re));
    close(r.value, -1 / slow, 1e-9 * r.value, 'τ = −1/p_lenta');
    assert.ok(Math.abs(r.value - 2 * p.L / p.R) > 0.09, '2L/R = 1 ms no describe la respuesta');
  });
  test('RLC crítico: τ = 2L/R del polo doble; subamortiguado (por omisión) sin cambios', () => {
    const L = 0.2, C = 1e-4, R = 2 * Math.sqrt(L / C);
    const r = tau({ R, L, C });
    assert.match(r.label, /polo doble/);
    close(r.value, 2 * L / R, 1e-15);
    const d = tau(S.defaults('rlc'));
    assert.deepStrictEqual([d.label, d.tex, d.value], ['Constante de decaimiento', '2L/R', 0.02]);
  });
});

/* ======================================================================= balance de energía (CORE-04) */

describe('el balance de energía mide solo el error de la trayectoria (CORE-04)', () => {
  const run = (id, params, method, dt) => {
    const m = S.get(id), w = m.wizard.measured;
    const traj = S.simulate(m, { variant: m.wizard.variant, params: { ...S.defaults(id), ...params }, input: w.input, duration: w.duration, method, dt });
    return m.invariants(traj)[0];
  };
  test('masa-resorte b = 3, RK4, Δt = 0.2: se cumple (relativo ≤ 1e-3)', () => {
    const inv = run('massSpring', { b: 3 }, 'rk4', 0.2);
    assert.equal(inv.ok, true, inv.detail);
    assert.ok(inv.relative <= 1e-3, `${inv.relative}`);
    assert.equal(inv.parts.source, 'trayectoria');
  });
  test('RLC R = 90 Ω, RK4, Δt = 1.6 ms: se cumple', () => {
    const inv = run('rlc', { R: 90 }, 'rk4', 1.6e-3);
    assert.equal(inv.ok, true, inv.detail);
    assert.ok(inv.relative <= 1e-3);
  });
  test('Euler grueso (Δt = 0.2) sigue sin cumplirse, y el residuo baja con el paso en RK4', () => {
    const e = run('massSpring', { b: 3 }, 'euler', 0.2);
    assert.equal(e.ok, false);
    assert.ok(e.relative > 0.05, `${e.relative}`);
    const coarse = run('massSpring', { b: 3 }, 'rk4', 0.2).relative, fine = run('massSpring', { b: 3 }, 'rk4', 0.05).relative;
    assert.ok(fine < coarse / 100, `orden 4: ${coarse} → ${fine}`);
  });
  test('energy(variant) en los modelos con balance de energía; sin modelo, Simpson sobre las muestras', () => {
    for (const [id, v] of [['massSpring', 'base'], ['rlc', 'serie'], ['pendulum', 'nolineal'], ['pendulum', 'lineal']]) {
      const cfg = S.get(id).energy(v);
      assert.ok(cfg && typeof cfg.stored === 'function' && typeof cfg.dissipated === 'function' && typeof cfg.input === 'function', id);
    }
    const m = S.get('massSpring');
    const traj = S.simulate(m, {});
    const bare = { params: traj.params, t: traj.t, x: traj.x, u: traj.u };
    const inv = S.helpers.energyBalance(bare, m.energy('base'));
    assert.equal(inv.parts.source, 'muestras');
    assert.ok(inv.ok, inv.detail);
  });
});

/* ======================================================================= Torricelli: predicción lineal (CORE-05) */

describe('Torricelli: curva del modelo linealizado h_lin (CORE-05)', () => {
  const m = S.get('tanks');
  const p = S.defaults('tanks', 'torricelli');
  const sim = (dq) => S.simulate(m, { variant: 'torricelli', params: p, input: { type: 'escalon', amplitude: dq, t0: 5 } });

  test('descriptor y salidas', () => {
    const o = m.outputs('torricelli').find((x) => x.key === 'hLin');
    assert.deepStrictEqual(toPlain(o), { key: 'hLin', label: 'Nivel lineal (aprox.)', symbol: 'h_{lin}(t)', unit: 'm', color: '--c-out', dash: true });
    checkTex(o.symbol, 'h_lin');
    const h = m.hints(p, 'torricelli');
    assert.deepStrictEqual(toPlain(h.yRange.hLin), toPlain(h.yRange.h));
  });
  test('Δq = +0.02: h ≈ 1.274 m frente a h_lin ≈ 1.070 m; Δq = −0.008: 0.2467 frente a 0.2141', () => {
    for (const [dq, hEnd, linEnd] of [[0.02, 1.274, 1.070], [-0.008, 0.2467, 0.2141]]) {
      const traj = sim(dq);
      close(traj.outputs.h.at(-1), hEnd, 0.005 * hEnd, `h (Δq = ${dq})`);
      close(traj.outputs.hLin.at(-1), linEnd, 0.005 * linEnd, `h_lin (Δq = ${dq})`);
      assert.ok(m.invariants(traj).every((i) => i.ok), 'balance de masa');
    }
  });
  test('h_lin coincide con h₀ + Δq·G(s) (escalón analítico) a 1e-6', () => {
    const G = m.tf(p, 'torricelli', 'h').tf;
    const h0 = m.linearization(p, 'torricelli').operatingPoint.h0;
    for (const dq of [0.02, -0.008]) {
      const traj = sim(dq);
      traj.t.forEach((t, i) => close(traj.outputs.hLin[i], h0 + (t >= 5 ? dq * G.stepAnalytic().fn(t - 5) : 0), 1e-6, `t = ${t}`));
    }
  });
  test('el balance de masa y la escena solo usan h; lineal y cascada no cambian', () => {
    const traj = sim(0.02);
    const fake = { ...traj, x: traj.x.map(([h]) => [h, 123]) };
    assert.equal(m.invariants(fake)[0].value, m.invariants(traj)[0].value, 'Δh_lin no entra en el balance');
    assert.deepStrictEqual(toPlain(m.outputs('lineal').map((o) => o.key)), ['h', 'qout']);
    assert.deepStrictEqual(toPlain(m.outputs('cascada').map((o) => o.key)), ['h1', 'h2']);
    assert.ok(m.outputs('lineal').every((o) => !o.dash) && m.outputs('cascada').every((o) => !o.dash));
    assert.equal(S.simulate(m, { variant: 'lineal' }).x[0].length, 1);
    assert.equal(S.simulate(m, { variant: 'cascada' }).x[0].length, 2);
  });
  test('los textos remiten a la curva discontinua de la Galería', () => {
    const can = m.derivation(p, 'torricelli', 'h').find((s) => s.id === 'canonica').text;
    assert.match(can, /curva discontinua/);
    assert.match(can, /Galería/);
    const tip = m.inputs('torricelli')[0].params.find((x) => x.key === 'amplitude').tooltip;
    assert.match(tip, /curva discontinua/);
  });
});

/* ======================================================================= textos (CORE-07, CORE-08) */

describe('telaraña con D y textos de la corriente del RLC (CORE-07, CORE-08)', () => {
  test('los pasos 1 y 2 de la telaraña incluyen el desplazamiento D; G(z) no cambia', () => {
    const p = S.defaults('market', 'telarana');
    const steps = S.get('market').derivation(p, 'telarana');
    const [ley, dif] = steps;
    assert.equal(ley.id, 'ley'); assert.equal(dif.id, 'diferencias');
    assert.match(ley.tex[0], /Q_d\(t\) = a - b\\,P_t \+ D_\{t-1\}/);
    assert.match(ley.tex[2], /D_\{t-1\}/);
    assert.match(dif.tex[0], /P_t = \\frac\{a - c\}\{b\} - \\frac\{d\}\{b\}\\,P_\{t-1\} \+ \\frac\{D_\{t-1\}\}\{b\}/);
    assert.match(dif.tex[1], /\+ 0\.5\\,D_\{t-1\}$/);
    for (const s of [ley, dif]) s.tex.forEach((t, i) => checkTex(t, `${s.id}[${i}]`));
    const sings = steps.find((s) => s.id === 'sings');
    assert.equal(sings.tex[1], 'G(z) = \\frac{P(z)}{D(z)} = \\frac{1/b}{z + d/b} = \\frac{0.5}{z + 0.75}');
    assert.equal(S.get('market').zTransfer(p, 'telarana').tex, 'G(z) = \\frac{P(z)}{D(z)} = \\frac{0.5}{z + 0.75}');
  });
  test('RLC: con la salida i, la frase del régimen habla de la corriente', () => {
    const rl = S.get('rlc'), p = S.defaults('rlc');
    const canI = rl.derivation(p, 'serie', 'i').find((s) => s.id === 'canonica').text;
    assert.match(canI, /la corriente oscila con frecuencia ωd/);
    assert.doesNotMatch(canI, /la tensión oscila/);
    const canV = rl.derivation(p, 'serie', 'vC').find((s) => s.id === 'canonica').text;
    assert.match(canV, /Como ζ < 1, la energía pasa del inductor al capacitor y vuelve: la tensión oscila con frecuencia ωd mientras la resistencia la va apagando\./);
    for (const R of [2 * Math.sqrt(p.L / p.C), 400]) {
      assert.doesNotMatch(rl.derivation({ ...p, R }, 'serie', 'i').find((s) => s.id === 'canonica').text, /capacitor se carga sin oscilar\.$|sin sobrepasarlo/);
    }
  });
});

/* ======================================================================= ayudas de las lecturas (CORE-13) */

describe('cada lectura tiene su ayuda (CORE-13)', () => {
  for (const [m, v] of PAIRS) {
    test(`${m.id}/${v.id}`, () => {
      const ids = new Set();
      for (const { name, p } of paramSets(m, v.id)) {
        for (const r of m.readouts(p, v.id)) {
          ids.add(r.id);
          assert.equal(typeof r.tip, 'string', `${name}: ${r.id} sin tip`);
          assert.ok(r.tip.trim().length > 0 && r.tip.length <= 160, `${name}: ${r.id} tip de ${r.tip.length} caracteres`);
          assert.match(r.tip, /[a-záéíóúñ]/i);
          assert.doesNotMatch(r.tip, /\b(the|and|of|time|settling|damping)\b/i, `${r.id}: tip en inglés`);
          assert.doesNotMatch(r.tip, /\b(fácil|simple|simplemente)\b/i);
        }
      }
      assert.ok(ids.size > 0);
    });
  }
});

test('sin errores ni avisos de consola', () => {
  assert.deepStrictEqual(env.console.error, []);
  assert.deepStrictEqual(env.console.warn, []);
  assert.equal(N.EPS > 0, true);
});
