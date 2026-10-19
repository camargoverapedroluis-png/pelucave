// tests/unit/numeric.test.mjs — Propietario: math.
// Complejos, polinomios, raíces (simples, múltiples, complejas, en el origen), agrupación,
// integradores (órdenes de convergencia, RK45, tEval, límites) y utilidades de DSL.core.numeric.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadDSL, toPlain } from '../helpers/load.mjs';

const { DSL, env } = loadDSL(['js/core/numeric.js']);
const N = DSL.core.numeric;
const { cx, poly } = N;

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≉ ${b} (tol ${tol})`);
const cclose = (z, re, im, tol, msg) => {
  close(z.re, re, tol, `${msg || ''} re`);
  close(z.im, im, tol, `${msg || ''} im`);
};

describe('complejos', () => {
  test('aritmética básica y números reales como entrada', () => {
    assert.deepStrictEqual(toPlain(cx.add(N.C(1, 2), 3)), { re: 4, im: 2 });
    assert.deepStrictEqual(toPlain(cx.mul(N.C(1, 2), N.C(3, -1))), { re: 5, im: 5 });
    cclose(cx.div(N.C(5, 5), N.C(3, -1)), 1, 2, 1e-15);
    cclose(cx.div(1, N.C(0, 1e-200)), 0, -1e200, 1e185);
    assert.deepStrictEqual(toPlain(cx.conj(N.C(1, 2))), { re: 1, im: -2 });
    assert.deepStrictEqual(toPlain(cx.neg(N.C(1, -2))), { re: -1, im: 2 });
    assert.deepStrictEqual(toPlain(cx.scale(N.C(1, -2), 3)), { re: 3, im: -6 });
    close(cx.abs(N.C(3, 4)), 5, 0);
  });
  test('arg en (−π, π], raíz principal, potencias enteras y exponencial', () => {
    assert.equal(cx.arg(N.C(-1, 0)), Math.PI);
    assert.equal(cx.arg(N.C(-1, -0)), Math.PI);
    close(cx.arg(N.C(0, -1)), -Math.PI / 2, 1e-15);
    cclose(cx.sqrt(-4), 0, 2, 1e-15);
    cclose(cx.sqrt(N.C(3, 4)), 2, 1, 1e-15);
    cclose(cx.sqrt(N.C(-3, -4)), 1, -2, 1e-15);
    cclose(cx.pow(N.C(1, 1), 4), -4, 0, 1e-14);
    cclose(cx.pow(N.C(0, 2), -2), -0.25, 0, 1e-16);
    cclose(cx.exp(N.C(0, Math.PI)), -1, 0, 1e-15);
    cclose(cx.fromPolar(2, Math.PI / 2), 0, 2, 1e-15);
  });
  test('isReal, equals y toString con la unidad j', () => {
    assert.ok(cx.isReal(N.C(5, 1e-12)));
    assert.ok(!cx.isReal(N.C(5, 1e-6)));
    assert.ok(cx.equals(N.C(1, 1), N.C(1 + 1e-12, 1)));
    assert.ok(!cx.equals(N.C(1, 1), N.C(1.001, 1)));
    assert.equal(cx.toString(N.C(-1, 2)), '-1 + 2j');
    assert.equal(cx.toString(N.C(-1, -2)), '-1 - 2j');
    assert.equal(cx.toString(N.C(0, -1)), '-j');
    assert.equal(cx.toString(N.C(2.5, 0)), '2.5');
    assert.equal(cx.toString(N.C(1 / 3, 1), 3), '0.333 + j');
  });
});

describe('polinomios', () => {
  test('trim, degree, isZero', () => {
    assert.deepStrictEqual(toPlain(poly.trim([0, 0, 1, 2])), [1, 2]);
    assert.deepStrictEqual(toPlain(poly.trim([1e-20, 1, 2], 1e-14)), [1, 2]);
    assert.deepStrictEqual(toPlain(poly.trim([0, 0])), [0]);
    assert.deepStrictEqual(toPlain(poly.trim([])), [0]);
    assert.equal(poly.degree([0, 3, 1]), 1);
    assert.equal(poly.degree([0]), -1);
    assert.ok(poly.isZero([0, 0]));
    assert.ok(!poly.isZero([0, 1e-300]));
  });
  test('eval y evalC (Horner)', () => {
    assert.equal(poly.eval([1, 2, 5], 2), 13);
    cclose(poly.evalC([1, 2, 5], N.C(-1, 2)), 0, 0, 1e-14);
  });
  test('suma, resta, producto, escala, derivada', () => {
    assert.deepStrictEqual(toPlain(poly.add([1, 2], [-1, 3])), [5]);
    assert.deepStrictEqual(toPlain(poly.sub([1, 2, 3], [1, 0])), [1, 1, 3]);
    assert.deepStrictEqual(toPlain(poly.mul([1, 1], [1, -1])), [1, 0, -1]);
    assert.deepStrictEqual(toPlain(poly.scale([1, -2], 3)), [3, -6]);
    assert.deepStrictEqual(toPlain(poly.deriv([1, 2, 3, 4])), [3, 4, 3]);
    assert.deepStrictEqual(toPlain(poly.deriv([7])), [0]);
  });
  test('divmod reconstruye p = q·d + r y limpia el resto', () => {
    const p = [1, 6, 11, 6], d = [1, 1];
    const { q, r } = poly.divmod(p, d);
    assert.deepStrictEqual(toPlain(q), [1, 5, 6]);
    assert.deepStrictEqual(toPlain(r), [0]);
    const res = poly.divmod([2, 0, 1, 5], [1, 2]);
    const back = poly.add(poly.mul(res.q, [1, 2]), res.r);
    assert.deepStrictEqual(toPlain(back), [2, 0, 1, 5]);
    assert.throws(() => poly.divmod([1, 2], [0]), /polinomio cero/);
    assert.deepStrictEqual(toPlain(poly.divmod([1, 2], [1, 0, 0])), { q: [0], r: [1, 2] });
  });
  test('fromRoots: mónico real con pares conjugados', () => {
    assert.deepStrictEqual(toPlain(poly.fromRoots([N.C(-1, 2), N.C(-1, -2)])), [1, 2, 5]);
    assert.deepStrictEqual(toPlain(poly.fromRoots([-1, -2, 0])), [1, 3, 2, 0]);
    assert.deepStrictEqual(toPlain(poly.fromRoots([])), [1]);
  });
  test('taylorC: coeficientes p^(j)(z)/j!', () => {
    // p = s³ en z = 2: 8, 12, 6, 1
    const t = poly.taylorC([1, 0, 0, 0], 2, 4).map((c) => c.re);
    assert.deepStrictEqual(toPlain(t), [8, 12, 6, 1]);
    const tc = poly.taylorC([1, 2, 5], N.C(-1, 2), 3);
    cclose(tc[0], 0, 0, 1e-14); cclose(tc[1], 0, 4, 1e-14); cclose(tc[2], 1, 0, 1e-14);
  });
});

/** Residuo relativo de Horner: |p(r)| / Σ|a_k||r|^k. */
function backwardErr(p, r) {
  const v = poly.evalC(p, r);
  const az = Math.hypot(r.re, r.im);
  let s = 0;
  for (const c of p) s = s * az + Math.abs(c);
  return Math.hypot(v.re, v.im) / s;
}

function assertSorted(roots) {
  const scale = Math.max(1, ...roots.map((r) => Math.hypot(r.re, r.im)));
  for (let i = 1; i < roots.length; i++) {
    const a = roots[i - 1], b = roots[i];
    if (Math.abs(a.re - b.re) > 1e-9 * scale) assert.ok(a.re < b.re, `orden por parte real: ${a.re} ${b.re}`);
    else assert.ok(a.im <= b.im, `orden por parte imaginaria: ${a.im} ${b.im}`);
  }
}

function assertConjugateSymmetric(roots) {
  for (const r of roots) {
    if (r.im === 0) continue;
    assert.ok(roots.some((q) => q.re === r.re && q.im === -r.im), `falta el conjugado exacto de ${r.re}+${r.im}j`);
  }
}

describe('polyRoots', () => {
  test('cuadrático con raíces complejas: conjugadas exactas, la de parte imaginaria negativa primero', () => {
    const r = N.polyRoots([1, 2, 5]);
    assert.deepStrictEqual(toPlain(r), [{ re: -1, im: -2 }, { re: -1, im: 2 }]);
  });
  test('raíces reales exactas, sin ruido imaginario', () => {
    const r = N.polyRoots([2, -3, 1]);
    assert.deepStrictEqual(toPlain(r), [{ re: 0.5, im: 0 }, { re: 1, im: 0 }]);
    const r3 = N.polyRoots(poly.fromRoots([1, 2, 3]));
    r3.forEach((z, i) => { assert.equal(z.im, 0); close(z.re, i + 1, 1e-12); });
  });
  test('ceros finales → raíces exactas en 0; ceros iniciales se recortan', () => {
    const r = N.polyRoots([1, 3, 2, 0, 0]);
    assert.deepStrictEqual(toPlain(r.map((z) => [z.re, z.im])), [[-2, 0], [-1, 0], [0, 0], [0, 0]]);
    assert.ok(r.slice(2).every((z) => Object.is(z.re, 0) && Object.is(z.im, 0)));
    assert.deepStrictEqual(toPlain(N.polyRoots([0, 0, 2, -4])), [{ re: 2, im: 0 }]);
    assert.deepStrictEqual(toPlain(N.polyRoots([1, 0, 0, 0])), [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }]);
  });
  test('grado 0 → []; polinomio cero y coeficientes no finitos lanzan', () => {
    assert.deepStrictEqual(toPlain(N.polyRoots([5])), []);
    assert.throws(() => N.polyRoots([0, 0]), /polinomio cero/);
    assert.throws(() => N.polyRoots([1, NaN]), /finitos/);
    assert.throws(() => N.polyRoots([1, Infinity, 2]), /finitos/);
  });
  test('raíces de la unidad y pares conjugados de grado alto', () => {
    const r = N.polyRoots([1, 0, 0, 0, 0, -1]);
    assert.equal(r.length, 5);
    assertSorted(r); assertConjugateSymmetric(r);
    for (const z of r) close(Math.hypot(z.re, z.im), 1, 1e-14);
    const real = r.filter((z) => z.im === 0);
    assert.equal(real.length, 1);
    close(real[0].re, 1, 1e-15);
  });
  test('Wilkinson grado 10 y magnitudes muy dispares', () => {
    const w = N.polyRoots(poly.fromRoots([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    w.forEach((z, i) => { assert.equal(z.im, 0); close(z.re, i + 1, 1e-7 * (i + 1)); });
    const s = N.polyRoots(poly.fromRoots([-1e-3, -1, -1e3]));
    close(s[0].re, -1e3, 1e-9); close(s[1].re, -1, 1e-13); close(s[2].re, -1e-3, 1e-16);
  });
  test('raíces múltiples: agrupadas cerca del valor y Vieta exacto; groupRoots las fusiona', () => {
    const p3 = [1, 3, 3, 1];
    const r = N.polyRoots(p3);
    assert.equal(r.length, 3);
    for (const z of r) assert.ok(Math.hypot(z.re + 1, z.im) < 1e-4, 'cerca de −1');
    assertConjugateSymmetric(r);
    for (const z of r) assert.ok(backwardErr(p3, z) < 1e-13);
    const g = N.groupRoots(r, { coeffs: p3 });
    assert.equal(g.length, 1);
    assert.equal(g[0].multiplicity, 3);
    close(g[0].value.re, -1, 1e-13); assert.equal(g[0].value.im, 0);

    const p4 = poly.fromRoots([-2, -2, -2, -2]);
    const g4 = N.groupRoots(N.polyRoots(p4), { coeffs: p4 });
    assert.deepStrictEqual(toPlain(g4.map((x) => x.multiplicity)), [4]);
    close(g4[0].value.re, -2, 1e-12);

    // Par complejo doble: (s² + 2s + 5)²
    const pc = poly.mul([1, 2, 5], [1, 2, 5]);
    const gc = N.groupRoots(N.polyRoots(pc), { coeffs: pc });
    assert.equal(gc.length, 2);
    cclose(gc[0].value, -1, -2, 1e-12); cclose(gc[1].value, -1, 2, 1e-12);
    assert.deepStrictEqual(toPlain(gc.map((x) => x.multiplicity)), [2, 2]);
  });
  test('groupRoots no fusiona raíces distintas cercanas que no reproducen el polinomio', () => {
    const p = poly.fromRoots([-1, -1.001]);
    const g = N.groupRoots(N.polyRoots(p), { coeffs: p });
    assert.equal(g.length, 2);
    const p2 = poly.fromRoots([-1, -1, -1.01]);
    const g2 = N.groupRoots(N.polyRoots(p2), { coeffs: p2 });
    assert.deepStrictEqual(toPlain(g2.map((x) => x.multiplicity)), [1, 2]);
    close(g2[1].value.re, -1, 1e-10);
  });
  test('residuo hacia atrás pequeño, orden determinista y resultados idénticos en llamadas repetidas', () => {
    const polys = [
      [1, 2, 3, 4, 5],
      [3, -2, 0.5, 7, -1, 2],
      [1, 0.4, 10.2, 2, 25],
      [1, 0, 2, 0, 1],
      [2, 1, 0, -3, 0.25, 9, -4],
    ];
    for (const p of polys) {
      const r = N.polyRoots(p);
      assert.equal(r.length, p.length - 1);
      assertSorted(r); assertConjugateSymmetric(r);
      for (const z of r) assert.ok(backwardErr(p, z) < 1e-12, `residuo ${backwardErr(p, z)}`);
      assert.deepStrictEqual(toPlain(N.polyRoots(p)), toPlain(r));
    }
  });
  test('sortRoots aplica el orden documentado', () => {
    const s = N.sortRoots([N.C(1, 0), N.C(-1, 2), N.C(-1, -2), N.C(-3, 0)]);
    assert.deepStrictEqual(toPlain(s), [{ re: -3, im: 0 }, { re: -1, im: -2 }, { re: -1, im: 2 }, { re: 1, im: 0 }]);
  });
});

describe('integradores', () => {
  // Oscilador armónico: x'' = −x, x(0) = 1 → x = cos t.
  const osc = (t, x) => [x[1], -x[0]];
  const err = (method, dt) => {
    const r = N.integrate(osc, [1, 0], 0, 2, { method, dt });
    const xe = r.x[r.x.length - 1];
    return Math.hypot(xe[0] - Math.cos(2), xe[1] + Math.sin(2));
  };
  for (const [method, order] of [['euler', 1], ['heun', 2], ['rk4', 4]]) {
    test(`${method}: orden de convergencia ≈ ${order}`, () => {
      const e1 = err(method, 0.02), e2 = err(method, 0.01);
      const p = Math.log2(e1 / e2);
      assert.ok(Math.abs(p - order) < 0.15, `orden observado ${p}`);
    });
  }
  test('paso fijo: número de pasos, último paso recortado y t1 exacto', () => {
    const r = N.integrate((t, x) => [1], [0], 0, 1, { method: 'euler', dt: 0.3 });
    assert.equal(r.stats.steps, 4);
    assert.deepStrictEqual(toPlain(r.t.map((v) => Math.round(v * 1e12) / 1e12)), [0, 0.3, 0.6, 0.9, 1]);
    assert.equal(r.t[r.t.length - 1], 1);
    close(r.x[r.x.length - 1][0], 1, 1e-15);
    assert.equal(r.stats.fevals, 4);
    assert.equal(r.stats.method, 'euler');
    assert.ok(r.stats.success);
    const r2 = N.integrate((t, x) => [1], [0], 0, 1, { method: 'rk4', dt: 0.1 });
    assert.equal(r2.stats.steps, 10);
    assert.equal(r2.stats.fevals, 40);
  });
  test('rk45 (Dormand–Prince): error controlado por rtol y mejora al reducirlo', () => {
    const f = (t, x) => [-2 * x[0] + Math.sin(t)];
    const exact = (t) => (2 * Math.sin(t) - Math.cos(t)) / 5 + (1 + 1 / 5) * Math.exp(-2 * t);
    const run = (rtol) => {
      const r = N.integrate(f, [1], 0, 5, { method: 'rk45', rtol, atol: rtol * 1e-3 });
      assert.ok(r.stats.success, r.stats.message);
      assert.equal(r.t[r.t.length - 1], 5);
      return { e: Math.abs(r.x[r.x.length - 1][0] - exact(5)), steps: r.stats.steps };
    };
    const a = run(1e-4), b = run(1e-8);
    assert.ok(a.e < 1e-4 && b.e < 1e-8, `${a.e} ${b.e}`);
    assert.ok(b.steps > a.steps);
  });
  test('rk45 rechaza pasos y se recupera en un problema rígido moderado', () => {
    const r = N.integrate((t, x) => [-50 * (x[0] - Math.cos(t))], [0], 0, 2, { method: 'rk45', rtol: 1e-6, dt: 1 });
    assert.ok(r.stats.success);
    assert.ok(r.stats.rejected > 0);
    close(r.x[r.x.length - 1][0], Math.cos(2) + Math.sin(2) / 50, 2e-3);
  });
  test('rk45 tEval: extensión continua de Dormand–Prince (exacta en los nodos, sin error extra entre ellos)', () => {
    for (const rtol of [1e-4, 1e-6]) {
      const o = { method: 'rk45', rtol, atol: rtol * 1e-3 };
      const r = N.integrate(osc, [1, 0], 0, 10, o);
      const nodeErr = Math.max(...r.t.map((t, i) => Math.abs(r.x[i][0] - Math.cos(t))));
      // En los propios nodos aceptados, la interpolación reproduce el paso (θ = 1).
      const same = N.integrate(osc, [1, 0], 0, 10, { ...o, tEval: Array.from(r.t) });
      same.x.forEach((x, i) => close(x[0], r.x[i][0], 1e-15, `nodo ${i}`));
      // Entre nodos (θ = ¼, ½, ¾) el error no supera al global: Hermite cúbico daría ~h⁴/384 extra
      // (≈ 4e-4 con h ≈ 0.6 para rtol 1e-4).
      const mids = [];
      for (let i = 0; i + 1 < r.t.length; i++) for (const th of [0.25, 0.5, 0.75]) mids.push(r.t[i] + th * (r.t[i + 1] - r.t[i]));
      const d = N.integrate(osc, [1, 0], 0, 10, { ...o, tEval: mids });
      const midErr = Math.max(...d.t.map((t, i) => Math.abs(d.x[i][0] - Math.cos(t))));
      assert.ok(midErr <= 1.5 * nodeErr, `rtol ${rtol}: entre nodos ${midErr} > 1.5 × ${nodeErr}`);
    }
  });
  test('tEval: salida solo en los instantes pedidos (Hermite cúbico en paso fijo, DP en rk45)', () => {
    const tEval = [0, 0.25, 0.5, 1.7, 2];
    for (const method of ['rk4', 'rk45']) {
      const r = N.integrate(osc, [1, 0], 0, 2, { method, dt: 0.01, rtol: 1e-10, atol: 1e-12, tEval });
      assert.deepStrictEqual(toPlain(r.t), tEval);
      r.x.forEach((x, i) => close(x[0], Math.cos(tEval[i]), 1e-7, `${method} t=${tEval[i]}`));
    }
    assert.throws(() => N.integrate(osc, [1, 0], 0, 1, { dt: 0.1, tEval: [0.5, 0.2] }), /tEval/);
  });
  test('maxSteps devuelve un resultado parcial sin lanzar', () => {
    const r = N.integrate(osc, [1, 0], 0, 10, { method: 'rk4', dt: 0.01, maxSteps: 50 });
    assert.equal(r.stats.success, false);
    assert.match(r.stats.message, /máximo de 50 pasos/);
    assert.equal(r.t.length, 51);
    const r2 = N.integrate(osc, [1, 0], 0, 10, { method: 'rk45', maxSteps: 3 });
    assert.equal(r2.stats.success, false);
  });
  test('errores de uso: t1 < t0, método desconocido, sin dt', () => {
    assert.throws(() => N.integrate(osc, [1, 0], 1, 0, { dt: 0.1 }), /t1/);
    assert.throws(() => N.integrate(osc, [1, 0], 0, 1, { method: 'rk2', dt: 0.1 }), /método/);
    assert.throws(() => N.integrate(osc, [1, 0], 0, 1, { method: 'euler' }), /dt/);
    const r = N.integrate(osc, [1, 0], 0, 0, { dt: 0.1 });
    assert.deepStrictEqual(toPlain(r.t), [0]);
  });
  test('pasos sueltos: escriben en out y admiten out === x', () => {
    const x = [1, 0];
    const y = N.rk4Step(osc, 0, x, 0.1);
    const out = [0, 0];
    assert.equal(N.rk4Step(osc, 0, x, 0.1, out), out);
    assert.deepStrictEqual(toPlain(out), toPlain(y));
    const same = [1, 0];
    N.rk4Step(osc, 0, same, 0.1, same);
    assert.deepStrictEqual(toPlain(same), toPlain(y));
    assert.equal(N.steppers.heun, N.heunStep);
    const e = N.eulerStep(osc, 0, [1, 0], 0.5);
    assert.deepStrictEqual(toPlain(e), [1, -0.5]);
    // f que reutiliza su propio búfer: el paso no se corrompe.
    const buf = [0, 0];
    const fBuf = (t, z) => { buf[0] = z[1]; buf[1] = -z[0]; return buf; };
    assert.deepStrictEqual(toPlain(N.rk4Step(fBuf, 0, [1, 0], 0.1)), toPlain(y));
    assert.deepStrictEqual(toPlain(N.heunStep(fBuf, 0, [1, 0], 0.1)), toPlain(N.heunStep(osc, 0, [1, 0], 0.1)));
  });
});

describe('utilidades', () => {
  test('linspace y logspace incluyen ambos extremos', () => {
    const l = N.linspace(0, 1, 5);
    assert.deepStrictEqual(toPlain(l), [0, 0.25, 0.5, 0.75, 1]);
    assert.deepStrictEqual(toPlain(N.linspace(2, 3, 1)), [2]);
    assert.deepStrictEqual(toPlain(N.linspace(2, 3, 0)), []);
    const g = N.logspace(-1, 2, 4);
    g.forEach((v, i) => close(v, [0.1, 1, 10, 100][i], 1e-12));
  });
  test('unwrap elimina saltos de 2π', () => {
    const ph = [3, -3, 3, -3].map((v, i) => v);
    const u = N.unwrap([0, 3, 6 - 2 * Math.PI, 9 - 2 * Math.PI]);
    u.forEach((v, i) => close(v, [0, 3, 6, 9][i], 1e-12));
    const d = N.unwrap(ph);
    for (let i = 1; i < d.length; i++) assert.ok(Math.abs(d[i] - d[i - 1]) <= Math.PI);
  });
  test('interp1 lineal con recorte, escalar o arreglo', () => {
    assert.equal(N.interp1([0, 1, 2], [0, 10, 0], 0.5), 5);
    assert.equal(N.interp1([0, 1, 2], [0, 10, 0], -1), 0);
    assert.equal(N.interp1([0, 1, 2], [0, 10, 0], 9), 0);
    assert.deepStrictEqual(toPlain(N.interp1([0, 1, 2], [0, 10, 0], [1.5, 1])), [5, 10]);
  });
  test('rmse, maxAbs, nearlyEqual, factorial', () => {
    close(N.rmse([1, 2, 3], [1, 2, 5]), Math.sqrt(4 / 3), 1e-15);
    assert.equal(N.maxAbs([1, -7, 3]), 7);
    assert.ok(N.nearlyEqual(1, 1 + 1e-12));
    assert.ok(!N.nearlyEqual(1, 1.001));
    assert.ok(N.nearlyEqual(0, 1e-13));
    assert.equal(N.factorial(0), 1);
    assert.equal(N.factorial(5), 120);
    assert.equal(N.factorial(171), Infinity);
  });
  test('sin errores de consola durante las pruebas', () => {
    assert.deepStrictEqual(env.console.error || [], []);
  });
});
