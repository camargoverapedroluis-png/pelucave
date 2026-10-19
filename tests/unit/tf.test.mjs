// tests/unit/tf.test.mjs — Propietario: math.
// TransferFunction: normalización, errores, polos/ceros, ganancia, estabilidad, Routh (con ε y fila
// nula), Bode, fracciones parciales (reconstrucción en puntos s), y(t) analítica frente a numérica,
// métricas frente a las fórmulas canónicas de 2.º orden, parámetros, TeX y validación de texto.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadDSL, toPlain, SCRIPTS } from '../helpers/load.mjs';

const { DSL, env } = loadDSL(SCRIPTS.core);
const N = DSL.core.numeric;
const { TransferFunction: TF, partialFractions } = DSL.core.tf;
const { cx, poly } = N;

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≉ ${b} (tol ${tol})`);
const rel = (a, b, tol, msg) => close(a, b, tol * Math.max(1, Math.abs(b)), msg);

/** Comprueba Σ r/(s−p)^k = num/den en varios puntos complejos. */
function checkReconstruction(entries, num, den, tol = 1e-9) {
  const pts = [cx.fromPolar(0.7, 0.3), cx.fromPolar(1.9, 2.2), cx.fromPolar(3.3, -1.1), N.C(0.1, 4.2), N.C(-0.37, 0.61)];
  for (const s of pts) {
    if (entries.some((e) => cx.abs(cx.sub(s, e.pole)) < 1e-3)) continue;
    const Y = cx.div(poly.evalC(num, s), poly.evalC(den, s));
    let sum = N.C(0, 0);
    for (const e of entries) sum = cx.add(sum, cx.div(e.residue, cx.pow(cx.sub(s, e.pole), e.power)));
    assert.ok(cx.abs(cx.sub(sum, Y)) <= tol * Math.max(1, cx.abs(Y)), `reconstrucción en s=${s.re}+${s.im}j: ${cx.abs(cx.sub(sum, Y))}`);
  }
}

const FAMILY = {
  'primer orden': [[5], [2, 1]],
  'subamortiguado ζ=0.5': [[4], [1, 2, 4]],
  'ζ = 0.1': [[1], [1, 0.2, 1]],
  'crítico (polo doble)': [[9], [1, 6, 9]],
  'sobreamortiguado': [[2], [1, 5, 4]],
  'polo triple': [[1], [1, 3, 3, 1]],
  'polo cuádruple': [[16], poly.fromRoots([-2, -2, -2, -2])],
  'par complejo doble': [[25], poly.mul([1, 2, 5], [1, 2, 5])],
  'con cero': [[1, 3], [1, 2, 5]],
  'cero en el SPD': [[-1, 1], [1, 3, 2]],
  'integrador': [[1], [1, 1, 0]],
  'marginal oscilatorio': [[1], [1, 0, 4]],
  'inestable': [[1], [1, -1]],
  'inestable oscilatorio': [[1], [1, -1, 4]],
  'bipropio': [[2, 3, 1], [1, 4, 8]],
  'tercer orden mixto': [[1], poly.mul([1, 1], [1, 1, 1])],
  'polo doble + distinto': [[3], poly.fromRoots([-1, -1, -3])],
  'muy dispar': [[1], poly.fromRoots([-0.01, -100])],
  'cero en el origen': [[1, 0], [1, 2, 2]],
};

describe('construcción y normalización', () => {
  test('el denominador queda mónico; se conserva el original', () => {
    const G = new TF([2], [2, 4]);
    assert.deepStrictEqual(toPlain(G.num), [1]);
    assert.deepStrictEqual(toPlain(G.den), [1, 2]);
    assert.deepStrictEqual(toPlain(G.original), { num: [2], den: [2, 4] });
    assert.ok(Object.isFrozen(G.num) && Object.isFrozen(G.den));
    assert.equal(G.order, 1);
    assert.equal(G.relativeDegree, 1);
    assert.equal(G.isStrictlyProper, true);
    const H = new TF([-2], [-1, -1]);
    assert.deepStrictEqual(toPlain(H.den), [1, 1]);
    assert.deepStrictEqual(toPlain(H.num), [2]);
  });
  test('recorta coeficientes iniciales despreciables (1e-14 relativo)', () => {
    const G = new TF([0, 1], [1e-20, 1, 2]);
    assert.deepStrictEqual(toPlain(G.den), [1, 2]);
    assert.deepStrictEqual(toPlain(G.num), [1]);
  });
  test('errores TFInputError con código y campo', () => {
    const cases = [
      [() => new TF([1], [0, 0]), 'den-zero', 'den'],
      [() => new TF([1], [3]), 'den-degree', 'den'],
      [() => new TF([1, 2, 3], [1, 1]), 'improper', 'num'],
      [() => new TF([1, NaN], [1, 1]), 'nonfinite', 'num'],
      [() => new TF([1], [1, Infinity]), 'nonfinite', 'den'],
      [() => new TF([], [1, 1]), 'empty', 'num'],
    ];
    for (const [fn, code, field] of cases) {
      assert.throws(fn, (e) => e.name === 'TFInputError' && e.code === code && e.field === field && /[a-záéíóúñ]/.test(e.message), code);
    }
  });
  test('propia no estricta y numerador nulo', () => {
    const G = new TF([1, 2], [1, 1]);
    assert.equal(G.relativeDegree, 0);
    assert.equal(G.isStrictlyProper, false);
    const Z = new TF([0], [1, 1]);
    assert.deepStrictEqual(toPlain(Z.zeros()), []);
    assert.equal(Z.dcGain(), 0);
  });
});

describe('polos, ceros y ganancia', () => {
  test('polos y ceros en el orden de polyRoots', () => {
    const G = new TF([1, 3], [1, 2, 5]);
    assert.deepStrictEqual(toPlain(G.poles()), [{ re: -1, im: -2 }, { re: -1, im: 2 }]);
    assert.deepStrictEqual(toPlain(G.zeros()), [{ re: -3, im: 0 }]);
    assert.equal(G.poles(), G.poles(), 'en caché');
  });
  test('grupos de polos repetidos', () => {
    const G = new TF([1], poly.fromRoots([-1, -1, -1, -3]));
    const g = G.poleGroups();
    assert.deepStrictEqual(toPlain(g.map((x) => x.multiplicity)), [1, 3]);
    close(g[1].value.re, -1, 1e-12);
  });
  test('dcGain finito, ±∞ con polo en el origen, NaN si 0/0 (con explicación)', () => {
    assert.equal(new TF([4], [1, 2, 4]).dcGain(), 1);
    assert.equal(new TF([1], [1, 1, 0]).dcGain(), Infinity);
    assert.equal(new TF([-1], [1, 0]).dcGain(), -Infinity);
    assert.ok(Number.isNaN(new TF([1, 0], [1, 1, 0]).dcGain()));
    const info = new TF([1, 0], [1, 1, 0]).dcGainInfo();
    assert.equal(info.kind, 'indeterminado');
    assert.equal(info.limit, 1);
    assert.match(info.note, /no se cancelan/);
    assert.equal(new TF([1], [1, 1, 0]).dcGainInfo().kind, 'infinito');
    assert.match(new TF([1], [1, 1, 0]).dcGainInfo().note, /integrador/);
    const fin = new TF([3], [1, 2]).dcGainInfo();
    assert.equal(fin.kind, 'finito'); assert.equal(fin.value, 1.5);
  });
});

describe('estabilidad', () => {
  const cases = [
    [[1], [1, 2, 5], 'estable'],
    [[1], [1, 0, 4], 'marginal'],
    [[1], [1, 0], 'marginal'],
    [[1], poly.mul([1, 0, 1], [1, 1]), 'marginal'],
    [[1], [1, -1], 'inestable'],
    [[1], [1, 0, 0], 'inestable'],
    [[1], poly.mul([1, 0, 1], [1, 0, 1]), 'inestable'],
    [[1], [1, 1, 2, 8], 'inestable'],
  ];
  for (const [n, d, v] of cases) {
    test(`${JSON.stringify(d)} → ${v}`, () => {
      const G = new TF(n, d);
      assert.equal(G.stability(), v);
      assert.equal(G.isStable(), v === 'estable');
      const info = G.stabilityInfo();
      assert.equal(info.verdict, v);
      assert.equal(info.lhp + info.rhp + info.axis, G.order);
      assert.ok(info.reason.length > 20);
    });
  }
});

describe('Routh–Hurwitz', () => {
  const rhpCount = (G) => G.poles().filter((p) => p.re > 1e-9).length;
  test('caso regular estable y caso inestable con dos cambios de signo', () => {
    const A = new TF([1], [1, 2, 3, 1]).routh();
    assert.deepStrictEqual(toPlain(A.rows), [[1, 3], [2, 1], [2.5, 0], [1, 0]]);
    assert.deepStrictEqual(toPlain(A.labels), ['s^{3}', 's^{2}', 's^{1}', 's^{0}']);
    assert.equal(A.signChanges, 0);
    assert.equal(A.special, null);
    const G = new TF([1], [1, 1, 2, 8]);
    const B = G.routh();
    assert.deepStrictEqual(toPlain(B.firstColumn), [1, 1, -6, 8]);
    assert.equal(B.signChanges, 2);
    assert.equal(rhpCount(G), 2);
    assert.ok(B.notes.some((n) => /2 cambios de signo/.test(n)));
  });
  test('cero en la primera columna → método ε', () => {
    const G = new TF([1], [1, 1, 2, 2, 3]);
    const R = G.routh();
    assert.equal(R.special.type, 'zero-first-column');
    assert.equal(R.special.row, 2);
    assert.equal(R.rows[2][0], R.epsilon);
    assert.equal(R.tex[2][0], '\\varepsilon');
    assert.equal(R.tex[3][0], '-\\frac{3}{\\varepsilon}');
    assert.deepStrictEqual(toPlain(R.limitSigns), [1, 1, 1, -1, 1]);
    assert.equal(R.signChanges, 2);
    assert.equal(rhpCount(G), 2);
    assert.ok(R.notes.some((n) => /ε/.test(n)));
  });
  test('fila de ceros → polinomio auxiliar y su derivada (marginal)', () => {
    const G = new TF([1], [1, 1, 2, 1, 1]);   // (s² + 1)(s² + s + 1)
    const R = G.routh();
    assert.equal(R.special.type, 'zero-row');
    assert.equal(R.special.row, 3);
    assert.deepStrictEqual(toPlain(R.special.auxiliary), [1, 0, 1]);
    assert.equal(R.special.auxiliaryTex, 'A(s) = s^{2} + 1');
    assert.deepStrictEqual(toPlain(R.rows[3]), [2, 0, 0]);
    assert.equal(R.signChanges, 0);
    assert.equal(R.axisRoots, 2);
    assert.equal(G.stability(), 'marginal');
    assert.ok(R.notes.some((n) => /marginalmente estable/.test(n)));
  });
  test('fila de ceros con raíz en el SPD (ejemplo clásico de grado 5)', () => {
    const G = new TF([1], [1, 2, 24, 48, -25, -50]);
    const R = G.routh();
    assert.equal(R.special.type, 'zero-row');
    assert.equal(R.special.power, 3);
    assert.deepStrictEqual(toPlain(R.special.auxiliary), [2, 0, 48, 0, -50]);
    assert.deepStrictEqual(toPlain(R.rows[2]), [8, 96, 0]);
    assert.equal(R.signChanges, 1);
    assert.equal(rhpCount(G), 1);
    assert.ok(R.notes.some((n) => /Condición necesaria/.test(n)));
  });
  test('término independiente nulo (polo en el origen) y orden 1', () => {
    const R = new TF([1], [1, 2, 1, 0]).routh();
    assert.equal(R.special.type, 'zero-row');
    assert.equal(R.special.power, 0);
    assert.equal(R.signChanges, 0);
    const R1 = new TF([1], [1, 3]).routh();
    assert.deepStrictEqual(toPlain(R1.rows), [[1], [3]]);
    assert.equal(R1.signChanges, 0);
  });
  test('cambios de signo = polos en el SPD en una batería de polinomios', () => {
    const dens = [[1, 4, 6, 4, 1], [1, -2, 3, 1], [1, 3, -1, 2, 5], [1, 0.5, 4, 1, 2], [2, 1, 3, 5, 10], [1, 6, 11, 6]];
    for (const d of dens) {
      const G = new TF([1], d);
      assert.equal(G.routh().signChanges, rhpCount(G), JSON.stringify(d));
    }
  });
});

describe('Bode', () => {
  test('primer orden en la frecuencia de corte', () => {
    const b = new TF([1], [1, 1]).bode([1]);
    close(b.magDb[0], -10 * Math.log10(2), 1e-12);
    close(b.phaseDeg[0], -45, 1e-12);
    close(b.mag[0], Math.SQRT1_2, 1e-15);
  });
  test('rango por defecto: 2 décadas a cada lado, redondeado a décadas; 300 puntos', () => {
    const G = new TF([1], poly.fromRoots([-0.5, -20]));
    assert.deepStrictEqual(toPlain(G.bodeRange()), { wMin: 0.001, wMax: 10000 });
    assert.deepStrictEqual(toPlain(new TF([1], [1, 0]).bodeRange()), { wMin: 0.01, wMax: 100 });
    const b = G.bode();
    assert.equal(b.omega.length, 300);
    close(b.omega[0], 0.001, 1e-15); close(b.omega[299], 10000, 1e-9);
  });
  test('asíntota de baja frecuencia: integradores y ganancia negativa', () => {
    close(new TF([1], [1, 0]).bode([0.01])['phaseDeg'][0], -90, 1e-9);
    close(new TF([1], [1, 1, 0, 0]).bode([1e-4])['phaseDeg'][0], -180, 0.01);
    close(new TF([-1], [1, 1]).bode([1e-4])['phaseDeg'][0], 180, 0.01);
    close(new TF([1], [1, 0, 0, 0]).bode([3])['phaseDeg'][0], -270, 1e-9);
  });
  test('fase desenrollada: continua y monótona en (s+1)^-4 hasta −360°', () => {
    const b = new TF([1], [1, 4, 6, 4, 1]).bode(N.logspace(-3, 3, 400));
    for (let i = 1; i < b.phaseDeg.length; i++) {
      assert.ok(b.phaseDeg[i] <= b.phaseDeg[i - 1] + 1e-9);
      assert.ok(Math.abs(b.phaseDeg[i] - b.phaseDeg[i - 1]) < 10);
    }
    close(b.phaseDeg[0], 0, 0.5);
    close(b.phaseDeg[b.phaseDeg.length - 1], -360, 0.5);
  });
  test('cero en el SPD: de 0° a −180° sin saltos', () => {
    const b = new TF([-1, 1], [1, 1]).bode(N.logspace(-3, 3, 200));
    close(b.phaseDeg[0], 0, 0.2); close(b.phaseDeg[199], -180, 0.2);
    b.magDb.forEach((m) => close(m, 0, 1e-12));
  });
  test('polos sobre el eje jω: salto de −180° y |G| infinito en la resonancia', () => {
    const b = new TF([1], [1, 0, 1]).bode([0.5, 1, 2]);
    assert.equal(b.mag[1], Infinity);
    close(b.phaseDeg[0], 0, 1e-9); close(b.phaseDeg[2], -180, 1e-9);
  });
  test('coincide con la evaluación directa de G(jω) (módulo 360°)', () => {
    const G = new TF([2, -1, 3], [1, 2, 3, 4]);
    const om = N.logspace(-2, 2, 50);
    const b = G.bode(om);
    om.forEach((w, i) => {
      const g = G.freqResponse(w);
      close(b.mag[i], cx.abs(g), 1e-12 * cx.abs(g));
      let d = (b.phaseDeg[i] - cx.arg(g) * 180 / Math.PI) % 360;
      if (d > 180) d -= 360; if (d < -180) d += 360;
      close(d, 0, 1e-9);
    });
  });
});

describe('fracciones parciales', () => {
  for (const [name, [n, d]] of Object.entries(FAMILY)) {
    test(`Y(s) = G(s)/s se reconstruye en puntos de prueba: ${name}`, () => {
      const G = new TF(n, d);
      const pf = G.partialFractionsStep();
      const order = pf.reduce((acc, e) => acc + (e.power === e.multiplicity ? e.multiplicity : 0), 0);
      assert.equal(order, G.order + 1, 'multiplicidades = orden + 1');
      checkReconstruction(pf, G.num, G.den.concat([0]));
      const pi = G.partialFractionsImpulse();
      if (pi.length) {
        const D = G.num.length === G.den.length ? G.num[0] : 0;
        checkReconstruction(pi, poly.sub(G.num, poly.scale(G.den, D)), G.den);
      }
    });
  }
  test('residuos conocidos y orden: polo, luego potencia ascendente', () => {
    const pf = partialFractions([1], [1, 3, 2]);
    assert.deepStrictEqual(toPlain(pf.map((e) => [e.pole.re, e.residue.re])), [[-2, -1], [-1, 1]]);
    const st = new TF([1], [1, 2, 1]).partialFractionsStep();   // 1/(s(s+1)²)
    assert.deepStrictEqual(toPlain(st.map((e) => [e.pole.re, e.multiplicity, e.power])), [[-1, 2, 1], [-1, 2, 2], [0, 1, 1]]);
    st.forEach((e, i) => close(e.residue.re, [-1, -1, 1][i], 1e-12));
  });
  test('el polo del escalón se fusiona con un integrador', () => {
    const st = new TF([2], [1, 1, 0]).partialFractionsStep();   // 2/(s²(s+1))
    const origin = st.filter((e) => e.pole.re === 0 && e.pole.im === 0);
    assert.deepStrictEqual(toPlain(origin.map((e) => [e.multiplicity, e.power])), [[2, 1], [2, 2]]);
    close(origin[1].residue.re, 2, 1e-12);
    close(origin[0].residue.re, -2, 1e-12);
  });
  test('partialFractions exige una función estrictamente propia', () => {
    assert.throws(() => partialFractions([1, 2], [1, 1]), /estrictamente propia/);
  });
});

describe('respuesta al escalón', () => {
  for (const [name, [n, d]] of Object.entries(FAMILY)) {
    test(`analítica = numérica (RK4): ${name}`, () => {
      const G = new TF(n, d);
      const sa = G.stepAnalytic();
      assert.equal(sa.exact, true, sa.notes.join(' '));
      assert.match(sa.tex, /^y\(t\) = .+,\\; t \\ge 0$/);
      const t = N.linspace(0, G.timeHorizon(), 41);
      const ya = G.step(t), yn = G.stepNumeric(t);
      const scale = Math.max(1, N.maxAbs(yn));
      ya.forEach((v, i) => close(v, yn[i], 2e-7 * scale, `t=${t[i]}`));
      // El impulso es la derivada del escalón.
      const h = 1e-5 * G.timeHorizon();
      const gi = G.impulse(t.slice(1, -1));
      t.slice(1, -1).forEach((tt, i) => close(gi[i], (sa.fn(tt + h) - sa.fn(tt - h)) / (2 * h), 1e-5 * Math.max(1, N.maxAbs(gi)), `g(${tt})`));
      const inum = G.impulseNumeric(t);
      G.impulse(t).forEach((v, i) => close(v, inum[i], 2e-7 * Math.max(1, N.maxAbs(inum))));
    });
  }
  test('expresiones TeX limpias', () => {
    assert.equal(new TF([1], [1, 1]).stepAnalytic().tex, 'y(t) = 1 - e^{-t},\\; t \\ge 0');
    assert.equal(new TF([1], [1, 3, 3, 1]).stepAnalytic().tex, 'y(t) = 1 - e^{-t} - t\\,e^{-t} - 0.5\\,t^{2}\\,e^{-t},\\; t \\ge 0');
    assert.equal(new TF([4], [1, 2, 4]).stepAnalytic().tex, 'y(t) = 1 - e^{-t}\\left(\\cos(1.732t) + 0.5774\\,\\sin(1.732t)\\right),\\; t \\ge 0');
    assert.equal(new TF([1], [1, 0, 4]).stepAnalytic().tex, 'y(t) = 0.25 - 0.25\\,\\cos(2t),\\; t \\ge 0');
    assert.equal(new TF([1], [1, 0]).stepAnalytic().tex, 'y(t) = t,\\; t \\ge 0');
    assert.equal(new TF([1], [1, -1]).stepAnalytic().tex, 'y(t) = -1 + e^{t},\\; t \\ge 0');
    assert.match(new TF([1], [1, 1]).impulseAnalytic().tex, /^g\(t\) = e\^\{-t\}/);
  });
  test('términos: forma real y oscilatoria con A, B', () => {
    const sa = new TF([4], [1, 2, 4]).stepAnalytic();
    const osc = sa.terms.find((t) => t.kind === 'osc');
    close(osc.sigma, -1, 1e-12); close(osc.omega, Math.sqrt(3), 1e-12);
    close(osc.A, -1, 1e-12); close(osc.B, -1 / Math.sqrt(3), 1e-12);
    assert.equal(osc.k, 1);
    const real = sa.terms[0];
    assert.deepStrictEqual([real.kind, real.p, real.k], ['real', 0, 1]);
    close(real.c, 1, 1e-12);
    assert.ok(sa.notes.some((n) => /forma real/.test(n)));
    const tr = new TF([1], [1, 3, 3, 1]).stepAnalytic();
    assert.ok(tr.terms.some((t) => t.kind === 'real' && t.k === 3));
    assert.ok(tr.notes.some((n) => /multiplicidad 3/.test(n)));
  });
  test('bipropio: y(0⁺) = D y el impulso omite D·δ(t) con aviso', () => {
    const G = new TF([2, 3, 1], [1, 4, 8]);
    close(G.step([0])[0], 2, 1e-12);
    assert.ok(G.impulseAnalytic().notes.some((n) => /δ\(t\)/.test(n)));
    assert.equal(G.step([-1])[0], 0);
  });
  test('respaldo numérico (fn tabulada) coincide con la analítica', () => {
    const G = new TF([4], [1, 2, 4]);
    const fnum = G._numericFn('step');
    for (const t of [0, 0.3, 1.1, 2.5, 5.9, 20]) close(fnum(t), G.stepAnalytic().fn(t), 1e-8);
  });
  test('stepSamples: n puntos uniformes sobre el horizonte', () => {
    const G = new TF([1], [1, 1]);
    const s = G.stepSamples();
    assert.equal(s.t.length, 400);
    assert.equal(s.t[399], G.timeHorizon());
    close(s.y[399], 1 - Math.exp(-6), 1e-12);
  });
  test('horizonte temporal', () => {
    assert.equal(new TF([1], [1, 1]).timeHorizon(), 6);
    assert.equal(new TF([1], [1, 1]).timeHorizon({ factor: 4 }), 4);
    close(new TF([1], [1, 0, 4]).timeHorizon(), 3 * Math.PI, 1e-12);
    assert.equal(new TF([1], [1, -1]).timeHorizon(), 6);
    assert.equal(new TF([1], [1, 0]).timeHorizon(), 10);
    assert.equal(new TF([1], [1, 1e-6]).timeHorizon(), 1e5);
    assert.equal(new TF([1], [1, 1e-12]).stability(), 'estable');    // Routh: sin casos especiales, todo positivo
    assert.equal(new TF([1], [1, 1e-12]).timeHorizon(), 1e5);
    assert.equal(new TF([1], [1, 1e6]).timeHorizon(), 1e-3);
    close(new TF([1], [1, 3, 3, 1]).timeHorizon(), 12, 1e-9);
    assert.equal(new TF([1], poly.fromRoots([-0.01, 1])).timeHorizon(), 12);
  });
});

describe('métricas (stepInfo)', () => {
  test('2.º orden puro: sobrepaso y tiempo de pico iguales a las fórmulas canónicas', () => {
    for (const zeta of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      for (const wn of [0.5, 2, 10]) {
        const G = TF.fromSecondOrder(1.5, zeta, wn);
        const info = G.stepInfo();
        const c = G.secondOrderParams().canonical;
        close(info.overshootPct, c.overshootPct, 1e-7, `Mp ζ=${zeta}`);
        rel(info.peakTime, c.peakTime, 1e-9, `tp ζ=${zeta} ωn=${wn}`);
        close(info.peak, 1.5 * (1 + c.overshootPct / 100), 1e-9);
        close(info.finalValue, 1.5, 1e-12);
        // Tiempo de subida y de establecimiento exactos sobre la respuesta.
        const f = G.stepAnalytic().fn;
        close(f(info.riseTimes.t10) / 1.5, 0.1, 1e-9);
        close(f(info.riseTimes.t90) / 1.5, 0.9, 1e-9);
        close(Math.abs(f(info.settlingTime) - 1.5), 0.02 * 1.5, 1e-9);
        const after = N.linspace(info.settlingTime + 1e-9, info.tEnd, 2000).map(f);
        assert.ok(after.every((y) => Math.abs(y - 1.5) <= 0.02 * 1.5 + 1e-12));
        // ts ≈ 4/(ζωn) es aproximada: mismo orden de magnitud.
        assert.ok(info.settlingTime > 0.5 * c.settlingTime && info.settlingTime < 1.5 * c.settlingTime, `ts ζ=${zeta}`);
      }
    }
  });
  test('primer orden: tr = τ·ln 9, ts = τ·ln 50, sin sobrepaso', () => {
    const G = TF.fromFirstOrder(3, 2);
    const info = G.stepInfo();
    close(info.riseTime, 2 * Math.log(9), 1e-9);
    close(info.settlingTime, 2 * Math.log(50), 1e-9);
    assert.equal(info.overshootPct, 0);
    assert.equal(info.peak, null);
    assert.ok(info.notes.some((n) => /Sin sobrepaso/.test(n)));
    assert.deepStrictEqual(toPlain(info.settleBand), [3 - 0.06, 3 + 0.06]);
  });
  test('inestable y marginal: sin valor final ni métricas, con notas', () => {
    for (const d of [[1, -1], [1, 0, 4], [1, 1, 0]]) {
      const info = new TF([1], d).stepInfo();
      assert.equal(info.stable, false);
      for (const k of ['finalValue', 'peak', 'peakTime', 'overshootPct', 'riseTime', 'settlingTime']) assert.equal(info[k], null, k);
      assert.ok(info.notes.length >= 1);
    }
    assert.ok(new TF([1], [1, 1, 0]).stepInfo().notes.some((n) => /rampa/.test(n)));
  });
  test('fase no mínima: subimpulso y nota', () => {
    const info = new TF([-1, 1], [1, 3, 2]).stepInfo();
    close(info.undershootPct, 100 / 3, 1e-7);
    assert.ok(info.notes.some((n) => /semiplano derecho/.test(n)));
    assert.ok(info.notes.some((n) => /sentido contrario/.test(n)));
  });
  test('valor final nulo y salto inicial por término directo', () => {
    const z = new TF([1, 0], [1, 2, 2]).stepInfo();
    assert.equal(z.finalValue, 0);
    assert.equal(z.overshootPct, null);
    close(z.peakTime, Math.PI / 4, 1e-9);
    const b = new TF([2, 3, 1], [1, 4, 8]).stepInfo();
    assert.equal(b.overshootPct, null);
    assert.equal(b.riseTime, null);
    assert.ok(b.notes.some((n) => /término directo/.test(n)));
  });
  test('ventana fijada por el usuario demasiado corta: no inventa sobrepaso ni lo niega', () => {
    const G = new TF([1], [1, 0.2, 1]);
    const cut = G.stepInfo({ tEnd: 2.5 });          // y(2.5) ≈ 1.57 y subiendo; el pico está en π/ωd ≈ 3.16
    assert.equal(cut.tEnd, 2.5);
    assert.equal(cut.overshootPct, null);
    assert.equal(cut.peak, null);
    assert.equal(cut.settlingTime, null);
    assert.ok(cut.notes.some((n) => /fuera de la ventana/.test(n)));
    const early = G.stepInfo({ tEnd: 1.5 });        // y(1.5) ≈ 0.85: aún por debajo del valor final
    assert.equal(early.overshootPct, null);
    assert.ok(early.notes.some((n) => /no se puede afirmar/.test(n)));
    assert.ok(!early.notes.some((n) => /Sin sobrepaso/.test(n)));
  });
  test('amplía la ventana si la respuesta aún no se estableció', () => {
    const info = new TF([1], poly.fromRoots([-1, -1, -1, -1, -1])).stepInfo();
    assert.ok(info.settlingTime !== null && info.settlingTime < info.tEnd);
  });
});

describe('parámetros canónicos', () => {
  test('primer orden', () => {
    assert.deepStrictEqual(toPlain(new TF([5], [2, 1]).firstOrderParams()), { K: 5, tau: 2, pole: -0.5 });
    assert.equal(new TF([1, 1], [1, 2]).firstOrderParams(), null);
    assert.equal(new TF([1], [1, -1]).firstOrderParams(), null);
  });
  test('segundo orden y clasificación del amortiguamiento', () => {
    const p = new TF([8], [1, 2, 4]).secondOrderParams();
    assert.equal(p.K, 2); assert.equal(p.wn, 2); assert.equal(p.zeta, 0.5); assert.equal(p.sigma, 1);
    close(p.wd, Math.sqrt(3), 1e-15);
    assert.equal(p.damping, 'subamortiguado');
    close(p.canonical.overshootPct, 100 * Math.exp(-Math.PI / Math.sqrt(3)), 1e-12);
    assert.equal(p.canonical.settlingApprox, true);
    const lab = (z) => TF.fromSecondOrder(1, z, 3).secondOrderParams().damping;
    assert.equal(lab(0), 'no amortiguado');
    assert.equal(lab(1), 'críticamente amortiguado');
    assert.equal(lab(2), 'sobreamortiguado');
    assert.equal(lab(-0.2), 'inestable');
    assert.equal(TF.fromSecondOrder(1, 1, 3).secondOrderParams().canonical, null);
    assert.equal(TF.fromSecondOrder(1, 2, 3).secondOrderParams().wd, null);
    assert.equal(new TF([1, 1], [1, 2, 4]).secondOrderParams(), null);
    assert.equal(new TF([1], [1, 2, -4]).secondOrderParams(), null);
  });
});

describe('TeX y composición', () => {
  test('toTex normalizada, original y con lhs', () => {
    const G = new TF([2], [2, 4, 8]);
    assert.equal(G.toTex(), '\\frac{1}{s^{2} + 2 s + 4}');
    assert.equal(G.toTex({ lhs: 'G(s)' }), 'G(s) = \\frac{1}{s^{2} + 2 s + 4}');
    assert.equal(G.toTex({ normalized: false }), '\\frac{2}{2 s^{2} + 4 s + 8}');
    assert.equal(new TF([1, -1], [1, 0.333333, 0]).toTex({ digits: 3, variable: 'z' }), '\\frac{z - 1}{z^{2} + 0.333 z}');
  });
  test('toTexFactored agrupa pares conjugados y multiplicidades', () => {
    const G = new TF([2, 2], poly.mul(poly.fromRoots([0, -2, -2]), [1, 2, 5]));
    assert.equal(G.toTexFactored({ lhs: 'G(s)' }), 'G(s) = \\frac{2\\, \\left(s + 1\\right)}{\\left(s + 2\\right)^{2} \\left(s^{2} + 2 s + 5\\right) s}');
  });
  test('series y constructores estándar', () => {
    const S = TF.fromFirstOrder(2, 1).series(TF.fromFirstOrder(1, 0.5));
    assert.deepStrictEqual(toPlain(S.den), [1, 3, 2]);
    assert.deepStrictEqual(toPlain(S.num), [4]);
    assert.deepStrictEqual(toPlain(TF.fromSecondOrder(2, 0.5, 3).den), [1, 3, 9]);
    assert.throws(() => TF.fromSecondOrder(1, 0.5, 0), /ωn/);
  });
});

describe('coeficientes escritos por el usuario', () => {
  test('formas aceptadas', () => {
    assert.deepStrictEqual(toPlain(TF.parseCoeffs('[1, 2, 5]', 'den')), [1, 2, 5]);
    assert.deepStrictEqual(toPlain(TF.parseCoeffs('1;2;5', 'den')), [1, 2, 5]);
    assert.deepStrictEqual(toPlain(TF.parseCoeffs(' 1,5  −2 3e-1 ', 'num')), [1.5, -2, 0.3]);
    assert.deepStrictEqual(toPlain(TF.parseCoeffs('1 , 2', 'num')), [1, 2]);
    const G = TF.fromCoeffStrings('4', '1 2 4');
    assert.deepStrictEqual(toPlain(G.den), [1, 2, 4]);
  });
  const bad = [
    ['', '1 2', 'empty', 'num', /numerador/],
    ['1', '   ', 'empty', 'den', /denominador/],
    ['1', '[ ]', 'empty', 'den', /denominador/],
    ['1 a', '1 2', 'token', 'num', /«a» no es un número/],
    ['1', '1,2,3', 'token', 'den', /Separe los coeficientes con espacios; la coma o el punto marcan los decimales/],
    ['1e400', '1 2', 'nonfinite', 'num', /demasiado grande/],
    ['0 1', '1 2', 'leading-zero', 'num', /ceros iniciales/],
    ['1', '0 1 2', 'leading-zero', 'den', /ceros iniciales/],
    ['0', '1 2', 'num-zero', 'num', /idénticamente nula/],
    ['1', '0 0', 'den-zero', 'den', /denominador es 0/],
    ['1', '5', 'den-degree', 'den', /grado 1 o mayor/],
    ['1', '1 1 1 1 1 1', 'den-degree', 'den', /hasta grado 4/],
    ['1 2 3', '1 2', 'improper', 'num', /impropia/],
  ];
  for (const [n, d, code, field, re] of bad) {
    test(`«${n}» / «${d}» → ${code}`, () => {
      assert.throws(() => TF.fromCoeffStrings(n, d), (e) => e.name === 'TFInputError' && e.code === code && e.field === field && re.test(e.message));
    });
  }
  test('maxDenDegree configurable', () => {
    assert.equal(TF.fromCoeffStrings('1', '1 1 1 1 1 1', { maxDenDegree: 5 }).order, 5);
  });
});

/** y(t) escrita en TeX → función evaluable (solo con los números que se leen en la expresión). */
function texToFn(tex) {
  const rate = (a) => (a === 't' || a === '-t' ? a : a.replace(/t$/, '*t'));
  let s = tex.replace(/^[yg]\(t\) = /, '').replace(/,\\; t (\\ge 0|> 0)$/, '');
  s = s.replace(/ \\times 10\^\{(-?\d+)\}/g, 'e$1');
  s = s.replace(/\\left\(/g, '(').replace(/\\right\)/g, ')');
  s = s.replace(/e\^\{([^}]*)\}/g, (m, a) => `Math.exp(${rate(a)})`);
  s = s.replace(/t\^\{(\d+)\}/g, 'Math.pow(t,$1)');
  s = s.replace(/\\(cos|sin)\(([^)]*)\)/g, (m, f, a) => `Math.${f}(${rate(a)})`);
  s = s.replace(/\\,/g, '*').replace(/\)\(/g, ')*(');
  assert.ok(!/\\/.test(s), `TeX sin traducir: ${s}`);
  return new Function('t', `return ${s};`);
}

/** Términos c·e^{pt} (y la constante) de una y(t) escrita en TeX. */
function realTerms(tex) {
  const body = tex.replace(/^y\(t\) = /, '').replace(/,\\; t \\ge 0$/, '').replace(/ \\times 10\^\{(-?\d+)\}/g, 'e$1');
  return body.replace(/ - /g, ' + -').split(' + ').map((part) => {
    const m = /^(-?)([0-9.e+-]*?)(?:\\,)?(?:e\^\{(-?[0-9.]*)t\})?$/.exec(part.trim());
    assert.ok(m, `término no reconocido: ${part}`);
    const c = (m[1] ? -1 : 1) * (m[2] === '' ? 1 : Number(m[2]));
    const p = m[3] === undefined ? 0 : m[3] === '' ? 1 : m[3] === '-' ? -1 : Number(m[3]);
    return { c, p };
  });
}

describe('y(t) escrita: cifras, residuos y amortiguamiento (CORE-01)', () => {
  test('polos casi dobles: los números de la TeX reproducen y(1) y y(5); el amortiguamiento sigue a los grupos', () => {
    const G = new TF([1], [1, 2.0001, 1.0001]);
    const sa = G.stepAnalytic();
    assert.ok(sa.digits >= 6, `cifras ${sa.digits}`);
    assert.equal(G.stepDisplayDigits(), sa.digits);
    const yTex = texToFn(sa.tex);
    close(yTex(1), 0.2642, 1e-3, 'y(1) leída');
    close(yTex(5), sa.fn(5), 1e-3, 'y(5) leída');
    close(sa.fn(1), 0.2642, 1e-4);
    // Con 4 cifras (lo de antes) la lectura no sirve: 1 + 1e4·e^{−t}(…) pierde todo.
    const four = G.stepAnalytic({ digits: 4 });
    assert.equal(four.digits, 4);
    assert.notEqual(four.tex, sa.tex);
    assert.ok(Math.abs(texToFn(four.tex)(1) - 0.2642) > 1e-3);
    // Dos polos reales distintos → sobreamortiguado (no «crítico»), igual que poleGroups.
    const groups = G.poleGroups();
    assert.deepStrictEqual(toPlain(groups.map((g) => g.multiplicity)), [1, 1]);
    assert.equal(G.secondOrderParams().damping, 'sobreamortiguado');
    assert.equal(G.secondOrderParams().wd, null);
    assert.ok(sa.notes.some((n) => /muy próximos/.test(n) && /6 significativas/.test(n)), sa.notes.join(' | '));
  });
  test('un polo doble exacto sigue siendo «críticamente amortiguado» y sin nota de polos próximos', () => {
    const G = new TF([1], [1, 2, 1]);
    assert.equal(G.secondOrderParams().damping, 'críticamente amortiguado');
    assert.equal(G.stepDisplayDigits(), 4);
    assert.ok(!G.stepAnalytic().notes.some((n) => /muy próximos/.test(n)));
  });
  test('residuos reales sin parte imaginaria residual', () => {
    const G = new TF([1, 2, 3], [1, 1, 1]);
    const pf = G.partialFractionsStep();
    for (const e of pf) {
      if (e.pole.im === 0) assert.equal(e.residue.im, 0, `residuo en ${e.pole.re}`);
    }
    assert.ok(pf.every((e) => e.residue.im === 0), JSON.stringify(toPlain(pf.map((e) => e.residue))));
    assert.ok(new TF([4], [1, 2, 4]).partialFractionsStep().some((e) => e.residue.im !== 0));   // sin falsos ceros
  });
  test('muestras: y(0) = 0 exacto, sin restos de redondeo', () => {
    const G = new TF([1, 3], [1, 4, 6, 4]);
    assert.equal(G.stepSamples().y[0], 0);
    for (const y of [G.stepSamples().y, G.impulseSamples().y, G.stepSamples(400, 200).y]) {
      const mx = N.maxAbs(y);
      assert.ok(y.every((v) => v === 0 || Math.abs(v) >= 1e-12 * mx));
    }
    assert.equal(new TF([1], [1, 1]).stepSamples().y[0], 0);
  });
  test('la suma de fracciones escrita coincide con Y(s) en s = 3.1 − 0.4j (0.1 %)', () => {
    const G = new TF([1], [1, 5, 1]);
    const sa = G.stepAnalytic();
    assert.ok(sa.digits >= 6);
    const s = N.C(3.1, -0.4);
    const Y = cx.div(poly.evalC([1], s), poly.evalC([1, 5, 1, 0], s));
    let sum = N.C(0, 0);
    for (const { c, p } of realTerms(sa.tex)) sum = cx.add(sum, cx.div(N.C(c, 0), cx.sub(s, N.C(p, 0))));
    assert.ok(cx.abs(cx.sub(sum, Y)) <= 1e-3 * cx.abs(Y), `${cx.abs(cx.sub(sum, Y)) / cx.abs(Y)}`);
  });
  test('en toda la familia la TeX leída reproduce la respuesta (1e-3·máx|y|)', () => {
    const extra = {
      'casi doble': [[1], [1, 2.0001, 1.0001]],
      'masa-resorte sobreamortiguado': [[1], [1, 5, 1]],
      'tercer orden real': [[10], [1, 8, 17, 10]],
    };
    for (const [name, [n, d]] of Object.entries({ ...FAMILY, ...extra })) {
      const G = new TF(n, d);
      const sa = G.stepAnalytic();
      const yTex = texToFn(sa.tex);
      const t = N.linspace(0, G.timeHorizon(), 200);
      const ys = t.map(sa.fn), tol = 1e-3 * N.maxAbs(ys);
      t.forEach((tt, i) => close(yTex(tt), ys[i], tol, `${name} (${sa.digits} cifras) t=${tt}`));
      assert.ok([4, 6, 8, 10, 12].includes(sa.digits), name);
    }
  });
  test('{ digits } fija las cifras sin tocar la respuesta memorizada', () => {
    const G = new TF([4], [1, 2, 4]);
    const a8 = G.stepAnalytic({ digits: 8 });
    assert.equal(a8.digits, 8);
    assert.match(a8.tex, /1\.7320508t/);
    assert.equal(G.stepAnalytic().digits, 4);
    assert.match(G.stepAnalytic().tex, /1\.732t/);
    assert.equal(a8.fn(1.3), G.stepAnalytic().fn(1.3));
  });
});

describe('estabilidad: Routh primero, eje jω polo a polo (CORE-09)', () => {
  for (const den of ['1e-10 1 1', '1 1e6 1', '1e15 1', '1 1e-10', '1 2 1e-12']) {
    test(`${den} → estable`, () => {
      const G = new TF([1], den.split(' ').map(Number));
      const info = G.stabilityInfo();
      assert.equal(info.verdict, 'estable');
      assert.equal(info.method, 'routh');
      assert.equal(info.rhp + info.axis, 0);
      assert.equal(info.lhp, G.order);
      const si = G.stepInfo();
      assert.equal(si.stable, true);
      assert.ok(Number.isFinite(si.finalValue));
      if (info.slowTau * 6 > 1e5) {
        assert.ok(si.notes.some((n) => /Polo muy lento/.test(n)), si.notes.join(' | '));
        assert.match(info.reason, /más lento/);
      }
    });
  }
  test('las constantes de tiempo muy largas llevan la nota del polo lento', () => {
    const info = new TF([1], [1, 1e-10]).stabilityInfo();
    close(info.slowTau, 1e10, 1);
    assert.match(info.reason, /1×10¹⁰ s/);
    assert.ok(!/más lento/.test(new TF([1], [1e-10, 1, 1]).stabilityInfo().reason));
  });
  for (const [label, n, d] of [['1/s', [1], [1, 0]], ['1/(s²+1)', [1], [1, 0, 1]], ['Integrador 1/(s(s+1))', [1], [1, 1, 0]]]) {
    test(`${label} → marginal (caso especial de Routh y análisis del eje)`, () => {
      const info = new TF(n, d).stabilityInfo();
      assert.equal(info.verdict, 'marginal');
      assert.equal(info.method, 'polos');
      assert.ok(info.axis >= 1);
    });
  }
  test('polos en el SPD → inestable', () => {
    for (const d of [[1, -1], [1, -1, 4], [1, 1, 2, 8], [1, 0, 0], [1, 2, -3]]) assert.equal(new TF([1], d).stability(), 'inestable', JSON.stringify(d));
  });
});

describe('cero que cancela el polo del origen (CORE-10)', () => {
  test('s/(s²+s): converge a 1 (limitValue), sin la frase de la oscilación', () => {
    const si = new TF([1, 0], [1, 1, 0]).stepInfo();
    assert.equal(si.limitValue, 1);
    assert.equal(si.finalValue, null);
    assert.ok(si.notes.some((n) => /Un cero cancela el polo en el origen: la salida converge a 1/.test(n)), si.notes.join(' | '));
    assert.ok(!si.notes.some((n) => /oscila/.test(n)));
  });
  test('s²/(s(s+1)²): limitValue 0', () => {
    const si = new TF([1, 0, 0], [1, 2, 1, 0]).stepInfo();
    assert.equal(si.limitValue, 0);
    assert.ok(si.notes.some((n) => /converge a 0/.test(n)));
  });
  test('1/(s²+1) conserva la oscilación y 1/s la rampa; limitValue null', () => {
    const osc = new TF([1], [1, 0, 1]).stepInfo();
    assert.ok(osc.notes.some((n) => /oscila sin amortiguarse/.test(n)));
    assert.equal(osc.limitValue, null);
    const ramp = new TF([1], [1, 0]).stepInfo();
    assert.ok(ramp.notes.some((n) => /rampa/.test(n)));
    assert.equal(ramp.limitValue, null);
    assert.equal(new TF([1], [1, 1]).stepInfo().limitValue, null);
  });
});

describe('Bode con ganancia negativa: rama de la fase (CORE-06)', () => {
  test('1/(s−2): de −180° a −90° (rama con menor |φ| máxima)', () => {
    const b = new TF([1], [1, -2]).bode();
    assert.ok(b.phaseDeg[0] >= -180.5 && b.phaseDeg[0] <= -179.5, `${b.phaseDeg[0]}`);
    const last = b.phaseDeg.at(-1);
    assert.ok(last >= -90.5 && last <= -89.5, `${last}`);
  });
  test('−1/(s+1) y (−s+1)/(s+1) no cambian', () => {
    const a = new TF([-1], [1, 1]).bode(N.logspace(-4, 4, 50));
    close(a.phaseDeg[0], 180, 0.01); close(a.phaseDeg.at(-1), 90, 0.01);
    const z = new TF([-1, 1], [1, 1]).bode(N.logspace(-3, 3, 200));
    close(z.phaseDeg[0], 0, 0.2); close(z.phaseDeg[199], -180, 0.2);
  });
  test('empate de |φ| máxima: se conserva +180°', () => {
    const b = new TF([-1, -1], [1, 1]).bode([0.1, 1, 10]);   // −(s+1)/(s+1): ±180° constante
    b.phaseDeg.forEach((ph) => close(ph, 180, 1e-9));
    close(new TF([-1], [1, 0, 1]).bode([0.5])['phaseDeg'][0], 180, 1e-9);   // +180 → 0 frente a −180 → −360
  });
});

describe('sistemas casi sin amortiguamiento (CORE-11)', () => {
  test('1/(s² + 1e-6·s + 1): tp, tr y Mp sobre la rejilla densa', () => {
    const G = new TF([1], [1, 1e-6, 1]);
    const si = G.stepInfo();
    close(si.peakTime, Math.PI, 0.005);
    close(si.riseTime, 1.020, 0.01);
    assert.ok(si.overshootPct >= 99.9, `${si.overshootPct}`);
    assert.ok(si.notes.some((n) => /Polo muy lento/.test(n)));
  });
  test('ζ = 5e-4: los valores canónicos se mantienen', () => {
    const G = TF.fromSecondOrder(1, 5e-4, 1);
    const si = G.stepInfo(), c = G.secondOrderParams().canonical;
    close(si.overshootPct, c.overshootPct, 1e-6);
    rel(si.peakTime, c.peakTime, 1e-9);
    close(si.riseTime, 1.02, 0.01);
    // ts exacto sobre la respuesta: después no sale de la banda.
    const f = G.stepAnalytic().fn;
    close(Math.abs(f(si.settlingTime) - 1), 0.02, 1e-9);
    assert.ok(N.linspace(si.settlingTime + 1e-6, si.tEnd, 20001).every((t) => Math.abs(f(t) - 1) <= 0.02 + 1e-12));
  });
});

describe('determinismo y consola', () => {
  test('mismas entradas → resultados idénticos', () => {
    const a = new TF([1, 3], [1, 2, 3, 4, 5]), b = new TF([1, 3], [1, 2, 3, 4, 5]);
    assert.deepStrictEqual(toPlain(a.poles()), toPlain(b.poles()));
    assert.deepStrictEqual(toPlain(a.stepSamples(50)), toPlain(b.stepSamples(50)));
    assert.deepStrictEqual(toPlain(a.bode()), toPlain(b.bode()));
    assert.equal(a.stepAnalytic().tex, b.stepAnalytic().tex);
  });
  test('sin errores de consola', () => {
    assert.deepStrictEqual(env.console.error || [], []);
  });
});
