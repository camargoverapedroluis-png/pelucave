// tests/unit/gallery.test.mjs — Propietario: gallery.
// Utilidades puras de #galeria (DSL.sections.gallery.helpers): TeX → Unicode, decimales del tiempo,
// escalado de unidades, límites del eje y plan de gráficas por sistema, variante y entrada.
// Sin DOM: el montaje real se prueba en tests/e2e/gallery.spec.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadDSL, SCRIPTS, toPlain } from '../helpers/load.mjs';

const { DSL } = loadDSL([...SCRIPTS.core, ...SCRIPTS.systems, 'js/sections/gallery.js']);
const GH = DSL.sections.gallery.helpers;
const S = DSL.systems;

function plan(modelId, variant, input) {
  const m = S.get(modelId);
  const d = S.describe(m, variant);
  return toPlain(GH.chartPlan(d, input, modelId)).map((g) => ({
    yLabel: g.yLabel,
    keys: g.series.map((s) => s.key),
    kinds: g.series.map((s) => s.kind),
    factors: g.series.map((s) => s.factor),
  }));
}

describe('gallery: contrato del módulo', () => {
  test('expone mount y helpers', () => {
    assert.equal(typeof DSL.sections.gallery.mount, 'function');
    for (const k of ['texPlain', 'timeDecimals', 'displayOf', 'scaleNum', 'niceRange', 'chartPlan', 'planSignature', 'horizonOf', 'readoutValue']) {
      assert.equal(typeof GH[k], 'function', k);
    }
    assert.equal(GH.INPUT_KEY, 'entrada');
  });

  test('la galería lista cinco sistemas (el péndulo queda fuera)', () => {
    const ids = S.list().map((m) => m.id);
    assert.deepEqual(toPlain(ids), ['massSpring', 'tanks', 'rlc', 'sir', 'market']);
  });
});

describe('gallery: texPlain', () => {
  test('griegas, subíndices, superíndices y barras', () => {
    assert.equal(GH.texPlain('\\omega_n'), 'ωₙ');
    assert.equal(GH.texPlain('\\zeta'), 'ζ');
    assert.equal(GH.texPlain('q_{in}(t)'), 'qᵢₙ(t)');
    assert.equal(GH.texPlain('x^2'), 'x²');
    assert.equal(GH.texPlain('R_0'), 'R₀');
    assert.equal(GH.texPlain('\\bar{x}'), 'x̄');
    assert.equal(GH.texPlain('\\theta_0'), 'θ₀');
  });

  test('subíndice sin equivalente Unicode se deja tal cual', () => {
    assert.equal(GH.texPlain('v_{C}'), 'vC');
    assert.equal(GH.texPlain('Q_d'), 'Qd');
  });

  test('comandos desconocidos y espacios TeX desaparecen', () => {
    assert.equal(GH.texPlain('\\mathrm{d}'), 'd');
    assert.equal(GH.texPlain('a\\,b'), 'a b');
    assert.equal(GH.texPlain(null), '');
    assert.equal(GH.texPlain(undefined), '');
  });
});

describe('gallery: tiempo y unidades', () => {
  test('timeDecimals según el horizonte', () => {
    assert.equal(GH.timeDecimals(15, false), 1);
    assert.equal(GH.timeDecimals(10, false), 2);
    assert.equal(GH.timeDecimals(60, false), 1);
    assert.equal(GH.timeDecimals(150, false), 0);
    assert.equal(GH.timeDecimals(0.12, false), 3);
    assert.equal(GH.timeDecimals(1e-6, false), 4);
    assert.equal(GH.timeDecimals(22, true), 0);
    assert.equal(GH.timeDecimals(0, false), 2);
    assert.equal(GH.timeDecimals(NaN, false), 2);
  });

  test('displayOf usa ParamSpec.display cuando existe', () => {
    assert.deepEqual(toPlain(GH.displayOf({ unit: 'H', display: { unit: 'mH', factor: 1000 } })), { unit: 'mH', factor: 1000 });
    assert.deepEqual(toPlain(GH.displayOf({ unit: 'kg' })), { unit: 'kg', factor: 1 });
    assert.deepEqual(toPlain(GH.displayOf({ unit: 'kg', display: { unit: 'g', factor: 0 } })), { unit: 'kg', factor: 1 });
    assert.deepEqual(toPlain(GH.displayOf(null)), { unit: '', factor: 1 });
  });

  test('scaleNum no deja restos binarios', () => {
    assert.equal(GH.scaleNum(0.0005, 1e4), 5);
    assert.equal(GH.scaleNum(0.1, 3), 0.3);
    assert.equal(GH.scaleNum(0.07, 100), 7);
    assert.equal(GH.scaleNum('2', 1.5), 3);
  });

  test('horizonOf: duración de los hints o 10 por defecto', () => {
    assert.equal(GH.horizonOf({ duration: 15 }), 15);
    assert.equal(GH.horizonOf({ duration: 0 }), 10);
    assert.equal(GH.horizonOf({ duration: Infinity }), 10);
    assert.equal(GH.horizonOf(null), 10);
  });

  test('readoutValue: número, texto o null', () => {
    assert.equal(GH.readoutValue({ value: 2.5 }), 2.5);
    assert.equal(GH.readoutValue({ value: NaN, text: '—' }), '—');
    assert.equal(GH.readoutValue({ value: 3, text: 'tres' }), 3);
    assert.equal(GH.readoutValue({ value: Infinity }), null);
  });
});

describe('gallery: niceRange', () => {
  test('contiene el intervalo y es estable', () => {
    for (const [lo, hi] of [[0, 1], [-0.37, 2.4], [0.01, 0.012], [-5, -1], [1000, 1003], [0, 9800]]) {
      const r = GH.niceRange(lo, hi);
      assert.ok(r.min <= lo && r.max >= hi, `${lo}..${hi} → ${r.min}..${r.max}`);
      assert.ok(r.max > r.min);
      assert.deepEqual(toPlain(GH.niceRange(lo, hi)), toPlain(r));
    }
  });

  test('deja un margen: el máximo no toca el borde; un rango positivo empieza en 0', () => {
    const r = GH.niceRange(0, 50);
    assert.equal(r.min, 0);
    assert.ok(r.max > 50, `max ${r.max}`);
    const p = GH.niceRange(0.02, 0.4);
    assert.ok(p.min >= 0 && p.max > 0.4, `${p.min}..${p.max}`);
  });

  test('intervalo degenerado se abre; orden invertido se corrige; sin datos → null', () => {
    const r = GH.niceRange(2, 2);
    assert.ok(r.min < 2 && r.max > 2);
    const a = GH.niceRange(3, -1);
    assert.ok(a.min <= -1 && a.max >= 3);
    assert.equal(GH.niceRange(Infinity, -Infinity), null);
    assert.equal(GH.niceRange(NaN, 1), null);
  });
});

describe('gallery: plan de gráficas', () => {
  test('masa-resorte: posición y velocidad; la fuerza no se dibuja (otra unidad, sin sitio)', () => {
    const p = plan('massSpring', 'base', 'escalon');
    assert.equal(p.length, 2);
    assert.deepEqual(p.map((g) => g.yLabel), ['Posición (m)', 'Velocidad (m/s)']);
    assert.deepEqual(p.map((g) => g.keys), [['x'], ['v']]);
  });

  test('depósito lineal: la entrada se suma al grupo de caudal', () => {
    const p = plan('tanks', 'lineal', 'escalon');
    assert.deepEqual(p.map((g) => g.keys), [['h'], ['qout', 'entrada']]);
    assert.deepEqual(p[1].kinds, ['output', 'input']);
    assert.equal(p[1].yLabel, 'Caudal (m³/s)');
  });

  test('cascada: los dos niveles juntos y la entrada en su propia gráfica en L/s', () => {
    const p = plan('tanks', 'cascada', 'escalon');
    assert.deepEqual(p.map((g) => g.keys), [['h1', 'h2'], ['entrada']]);
    assert.equal(p[1].factors[0], 1000);
    assert.match(p[1].yLabel, /\(L\/s\)$/);
  });

  test('RLC: la tensión de la fuente junto a vC; la corriente aparte', () => {
    const p = plan('rlc', 'serie', 'senoidal');
    assert.deepEqual(p.map((g) => g.keys), [['vC', 'entrada'], ['i']]);
    assert.deepEqual(p.map((g) => g.yLabel), ['Tensión (V)', 'Corriente (A)']);
  });

  test('SIR: sin entrada, una sola gráfica; con entrada, la reducción en %', () => {
    const none = plan('sir', 'base', 'ninguna');
    assert.equal(none.length, 1);
    assert.deepEqual(none[0].keys, ['S', 'I', 'R']);
    assert.equal(none[0].yLabel, 'Personas');
    const step = plan('sir', 'base', 'escalon');
    assert.equal(step.length, 2);
    assert.deepEqual(step[1].keys, ['entrada']);
    assert.equal(step[1].factors[0], 100);
    assert.equal(step[1].yLabel, 'Reducción de contactos u (%)');
  });

  test('mercado: precio y cantidades; el desplazamiento de la demanda va con las cantidades', () => {
    for (const v of ['telarana', 'walras']) {
      const p = plan('market', v, 'escalon');
      assert.deepEqual(p.map((g) => g.keys), [['P'], ['Qd', 'Qs', 'entrada']], v);
    }
    assert.deepEqual(plan('market', 'telarana', 'ninguna').map((g) => g.keys), [['P'], ['Qd', 'Qs']]);
  });

  test('todas las combinaciones: como mucho dos gráficas, claves únicas, etiquetas no vacías', () => {
    for (const m of S.list()) {
      for (const v of m.variants) {
        const d = S.describe(m, v.id);
        for (const inp of d.inputs) {
          const p = GH.chartPlan(d, inp.id, m.id);
          assert.ok(p.length >= 1 && p.length <= 2, `${m.id}/${v.id}/${inp.id}`);
          const keys = p.flatMap((g) => g.series.map((s) => s.key));
          assert.equal(new Set(keys).size, keys.length, `${m.id}/${v.id}/${inp.id}`);
          p.forEach((g, i) => {
            assert.equal(g.id, 'g' + (i + 1));
            assert.ok(g.yLabel && g.noun, `${m.id}/${v.id}/${inp.id}`);
            g.series.forEach((s) => assert.ok(s.label && !/\\/.test(s.label), `etiqueta TeX sin convertir: ${s.label}`));
          });
          const inputs = p.flatMap((g) => g.series.filter((s) => s.kind === 'input'));
          if (inp.id === 'ninguna') assert.equal(inputs.length, 0);
          inputs.forEach((s) => { assert.equal(s.dash, true); assert.equal(s.color, '--c-in'); });
        }
      }
    }
  });

  test('planSignature cambia con la entrada solo si cambia el plan', () => {
    const d = S.describe(S.get('tanks'), 'lineal');
    const a = GH.planSignature(GH.chartPlan(d, 'escalon', 'tanks'));
    const b = GH.planSignature(GH.chartPlan(d, 'senoidal', 'tanks'));
    assert.equal(a, b);
    const sir = S.describe(S.get('sir'), 'base');
    assert.notEqual(
      GH.planSignature(GH.chartPlan(sir, 'ninguna', 'sir')),
      GH.planSignature(GH.chartPlan(sir, 'escalon', 'sir')),
    );
  });
});
