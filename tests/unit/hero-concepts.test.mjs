// tests/unit/hero-concepts.test.mjs — Propietario: hero-concepts.
// Cálculos puros de #inicio (polos, respuesta al escalón, colocación de la figura) y de #conceptos
// (lazo abierto/cerrado, oscilador, ecuación en diferencias, superposición en los depósitos y
// Euler/Heun/RK4 frente a RK45 en el péndulo). Sin DOM: solo DSL.sections.*.helpers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadDSL, toPlain, SCRIPTS } from '../helpers/load.mjs';

const { DSL } = loadDSL([
  ...SCRIPTS.core, ...SCRIPTS.systems, 'js/sections/hero.js', 'js/sections/concepts.js',
]);
const HH = DSL.sections.hero.helpers;
const CH = DSL.sections.concepts.helpers;
const TF = DSL.core.tf.TransferFunction;
const N = DSL.core.numeric;
const G = DSL.systems.G;

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≉ ${b} (tol ${tol})`);
const DEG = Math.PI / 180;

/* ====================================================================== #inicio */

describe('hero: matemáticas del fondo', () => {
  test('stepResponse coincide con DSL.core.tf (sub, crítico y sobreamortiguado)', () => {
    const t = N.linspace(0, 14, 141);
    for (const zeta of [0.12, 0.3, 0.7, 1, 1.6]) {
      for (const wn of [0.88, 1, 1.12]) {
        const ref = new TF([wn * wn], [1, 2 * zeta * wn, wn * wn]).step(t);
        t.forEach((tt, i) => close(HH.stepResponse(zeta, wn, tt), ref[i], 1e-9, `ζ=${zeta} ωn=${wn} t=${tt}`));
      }
    }
    assert.equal(HH.stepResponse(0.3, 1, 0), 0);
    assert.equal(HH.stepResponse(0.3, 1, -1), 0);
  });

  test('pole: ζ en [0.12, 0.88], |p| = ωn, parte real −ζωn; T_START da ζ ≈ 0.30', () => {
    for (let k = 0; k <= 64; k++) {
      const p = HH.pole(k * HH.constants.PERIOD / 64);
      assert.ok(p.zeta >= 0.12 - 1e-12 && p.zeta <= 0.88 + 1e-12, `ζ=${p.zeta}`);
      assert.ok(p.wn >= 0.88 - 1e-12 && p.wn <= 1.12 + 1e-12, `ωn=${p.wn}`);
      close(Math.hypot(p.re, p.im), p.wn, 1e-12, 'módulo');
      close(p.re, -p.zeta * p.wn, 1e-15, 'parte real');
    }
    close(HH.pole(HH.constants.T_START).zeta, 0.30, 0.01, 'ζ inicial');
    const p0 = HH.pole(7.25);
    const p1 = HH.pole(7.25 + HH.constants.PERIOD);
    for (const k of ['zeta', 'wn', 're', 'im']) close(p1[k], p0[k], 1e-12, `periodo (${k})`);
  });

  test('snapAxis: la intersección del reglado más cercana dentro del intervalo', () => {
    assert.equal(HH.snapAxis(100, 0, 500, 160), 100);
    assert.equal(HH.snapAxis(100, 200, 500, 160), 260);
    assert.equal(HH.snapAxis(100, -400, 50, 160), -60);
    assert.equal(HH.snapAxis(100, 110, 200, 160), null);
    assert.equal(HH.snapAxis(100, 300, 200, 160), null);
    assert.equal(HH.snapAxis(NaN, 0, 500, 160), null);
  });

  test('parseLen entiende vw, svh, px y %', () => {
    close(HH.parseLen('64vw', 1440, 900, 'x'), 921.6, 1e-9);
    close(HH.parseLen('30svh', 1440, 900, 'y'), 270, 1e-9);
    assert.equal(HH.parseLen(' 12px ', 1440, 900), 12);
    assert.equal(HH.parseLen('50%', 1000, 800, 'x'), 500);
    assert.equal(HH.parseLen('50%', 1000, 800, 'y'), 400);
    assert.ok(Number.isNaN(HH.parseLen('calc(1px)', 1000, 800)));
  });

  test('layoutFigure: alinea el origen con el plano del fondo cuando cabe, con el radio mayor', () => {
    const L = HH.layoutFigure({ slot: { x: 700, y: 100, w: 640, h: 700 }, plane: { x: 1020, y: 300 } });
    assert.equal(L.mode, 'vertical');
    assert.equal(L.R, 160);
    assert.equal(L.ox, 1020);
    assert.equal(L.oy, 300);
    assert.deepEqual(toPlain(L.aligned), { x: true, y: true });
    // la respuesta queda debajo del plano y dentro de la zona
    assert.ok(L.resp.y >= L.oy + L.R, 'respuesta bajo el plano');
    assert.ok(L.resp.y + L.resp.h <= 100 + 700 + 1e-9, 'respuesta dentro de la zona');
  });

  test('layoutFigure: si el plano cae fuera, el origen va a otra intersección del reglado', () => {
    const slot = { x: 520, y: 80, w: 460, h: 560 };
    const plane = { x: 655.36, y: 165.4 };
    const L = HH.layoutFigure({ slot, plane });
    const onGrid = (v, p) => Math.abs(((v - p) / 160) - Math.round((v - p) / 160)) < 1e-9;
    assert.ok(onGrid(L.ox, plane.x), `ox=${L.ox} en el reglado`);
    assert.ok(onGrid(L.oy, plane.y), `oy=${L.oy} en el reglado`);
    assert.ok(L.ox - L.R >= slot.x + 30 - 1e-9, 'margen izquierdo');
    assert.ok(L.ox + 30 <= slot.x + slot.w + 1e-9, 'margen derecho');
    assert.ok(L.R >= 64 && L.R <= 160 && (L.R - 64) % 32 === 0, `R=${L.R}`);
  });

  test('layoutFigure: zona apaisada → modo horizontal con la respuesta a la derecha; determinista', () => {
    const o = { slot: { x: 0, y: 0, w: 900, h: 420 }, plane: { x: 300, y: 200 } };
    const L = HH.layoutFigure(o);
    assert.equal(L.mode, 'horizontal');
    assert.ok(L.resp.x > L.ox + 30, 'respuesta a la derecha');
    assert.ok(L.resp.x + L.resp.w <= 900 + 1e-9);
    assert.equal(L.resp.h, 2 * L.R);
    assert.deepEqual(toPlain(HH.layoutFigure(o)), toPlain(L));
  });
});

/* ====================================================================== #conceptos */

describe('conceptos a: sistema en lazo abierto y cerrado', () => {
  const open = CH.feedbackModel(false);
  const closed = CH.feedbackModel(true);
  const S = CH.constants.SYS;

  test('valores finales: F/k en lazo abierto y K·r/(k + K) en lazo cerrado', () => {
    close(open.info.finalValue, S.F / S.k, 1e-12);
    close(closed.info.finalValue, S.K * S.r / (S.k + S.K), 1e-12);
    close(open.y[0], 0, 1e-12);
    close(closed.y[0], 0, 1e-12);
    assert.ok(closed.info.overshootPct > open.info.overshootPct, 'la ganancia K reduce el amortiguamiento');
    close(closed.wn, Math.sqrt((S.k + S.K) / S.m), 1e-12);
    close(open.zeta, S.b / (2 * Math.sqrt(S.k * S.m)), 1e-12);
  });

  test('u = K·(r − y) muestra a muestra; F constante en lazo abierto', () => {
    closed.y.forEach((y, i) => close(closed.u[i], S.K * (S.r - y), 1e-12));
    open.u.forEach((u) => assert.equal(u, S.F));
  });

  test('la velocidad es la derivada de la posición', () => {
    for (const m of [open, closed]) {
      for (let i = 1; i < m.t.length - 1; i += 20) {
        const fd = (m.y[i + 1] - m.y[i - 1]) / (m.t[i + 1] - m.t[i - 1]);
        close(m.v[i], fd, 2e-3, `t=${m.t[i]}`);
      }
    }
  });

  test('cumple la EDO del lazo cerrado: ÿ + (b/m)ẏ + ((k + K)/m)y = K·r/m', () => {
    const m = closed;
    for (let i = 2; i < m.t.length - 2; i += 25) {
      const dt = m.t[1] - m.t[0];
      const acc = (m.v[i + 1] - m.v[i - 1]) / (2 * dt);
      const res = acc + (S.b / S.m) * m.v[i] + ((S.k + S.K) / S.m) * m.y[i] - S.K * S.r / S.m;
      close(res, 0, 5e-3, `residuo en t=${m.t[i]}`);
    }
  });
});

describe('conceptos b: oscilador recorrido en t', () => {
  test('RK45 coincide con la solución analítica del oscilador amortiguado', () => {
    const O = CH.constants.OSC;
    const r = CH.oscillator();
    const wn = Math.sqrt(O.k / O.m);
    const zeta = O.b / (2 * Math.sqrt(O.k * O.m));
    const wd = wn * Math.sqrt(1 - zeta * zeta);
    const exact = (t) => O.x0 * Math.exp(-zeta * wn * t) * (Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t));
    assert.equal(r.t.length, O.n);
    assert.equal(r.x[0], O.x0);
    assert.equal(r.v[0], 0);
    r.t.forEach((t, i) => close(r.x[i], exact(t), 1e-8, `t=${t}`));
  });

  test('sampleUniform interpola linealmente y satura en los extremos', () => {
    const arr = [0, 10, 20, 30];
    assert.equal(CH.sampleUniform(arr, 3, 1.5), 15);
    assert.equal(CH.sampleUniform(arr, 3, -1), 0);
    assert.equal(CH.sampleUniform(arr, 3, 9), 30);
    assert.equal(CH.sampleUniform(arr, 3, 3), 30);
  });
});

describe('conceptos c: EDO frente a ecuación en diferencias', () => {
  test('veredicto según aT (z = 1 − aT) con sus fronteras', () => {
    const v = (aT) => CH.discreteVerdict(aT).key;
    assert.equal(v(0.4), 'monotona');
    assert.equal(v(1 - 1e-6), 'monotona');
    assert.equal(v(1), 'unpaso');
    assert.equal(v(1 + 1e-12), 'unpaso');
    assert.equal(v(1.5), 'oscilante');
    assert.equal(v(2), 'limite');
    assert.equal(v(2 - 1e-12), 'limite');
    assert.equal(v(2.05), 'diverge');
    assert.equal(CH.discreteVerdict(2.05).tone, 'danger');
    assert.equal(CH.discreteVerdict(0.4).tone, 'success');
    close(CH.discreteVerdict(1.5).z, -0.5, 1e-15);
  });

  test('y[k] = 1 − (1 − aT)^k y la curva continua 1 − e^(−at)', () => {
    for (const [a, T] of [[1, 0.4], [2, 0.75], [0.5, 2], [3, 0.05]]) {
      const r = CH.firstOrder(a, T);
      close(r.tEnd, Math.max(6 / a, 6 * T), 1e-12);
      r.disc.y.forEach((y, k) => close(y, 1 - Math.pow(1 - a * T, k), 1e-12, `a=${a} T=${T} k=${k}`));
      r.disc.t.forEach((t, k) => close(t, k * T, 1e-12));
      r.cont.t.forEach((t, i) => close(r.cont.y[i], 1 - Math.exp(-a * t), 1e-9, `a=${a} t=${t}`));
      assert.equal(r.truncated, false);
    }
  });

  test('una secuencia divergente se corta al pasar de |y| = 6', () => {
    const r = CH.firstOrder(1, 2.4);
    assert.equal(r.verdict.key, 'diverge');
    assert.equal(r.truncated, true);
    const ys = r.disc.y;
    assert.ok(Math.abs(ys[ys.length - 1]) > 6);
    ys.slice(0, -1).forEach((y) => assert.ok(Math.abs(y) <= 6));
  });
});

describe('conceptos d (i): proporcionalidad y superposición en los depósitos', () => {
  test('depósito lineal: R del modelo linealizado de Torricelli', () => {
    const P = CH.constants.TANK;
    const h0 = Math.pow(P.qin0 / (P.a * Math.sqrt(2 * G)), 2);
    close(CH.tankParams('lineal').R, 2 * h0 / P.qin0, 1e-12);
    close(CH.tankParams('lineal').R, 30.58, 0.01);
  });

  test('lineal: la respuesta a u₁ + u₂ es y₁ + y₂ y la de 2u₁ es 2y₁ (redondeo)', () => {
    const r = CH.superposition('lineal', 0.01, 0.012);
    assert.equal(r.linear, true);
    assert.ok(r.maxMismatch < 1e-12, `desajuste ${r.maxMismatch}`);
    assert.ok(r.maxProp < 1e-12, `proporcionalidad ${r.maxProp}`);
    // y₁ frente a la solución exacta del primer orden A·ḣ = q − h/R
    const R = CH.tankParams('lineal').R;
    const tau = CH.constants.TANK.A * R;
    r.t.forEach((t, i) => close(r.y1[i], 0.01 * R * (1 - Math.exp(-t / tau)), 1e-7, `t=${t}`));
  });

  test('Torricelli: ni superposición ni proporcionalidad (desajuste > 1 %)', () => {
    const r = CH.superposition('torricelli', 0.01, 0.012);
    assert.equal(r.linear, false);
    assert.ok(r.relMismatch > 0.01, `relativo ${r.relMismatch}`);
    assert.ok(r.relProp > 0.01, `proporcionalidad ${r.relProp}`);
    assert.ok(r.y1.every(Number.isFinite) && r.y12.every(Number.isFinite));
    // el desajuste es exactamente y(u₁ + u₂) − (y₁ + y₂)
    r.t.forEach((t, i) => close(r.mismatch[i], r.y12[i] - r.y1[i] - r.y2[i], 1e-15));
  });

  test('el pulso empieza en t = 30 s y la malla llega a 120 s; determinista', () => {
    const r = CH.superposition('torricelli', 0.01, 0.012);
    assert.equal(r.t[0], 0);
    close(r.t[r.t.length - 1], 120, 1e-9);
    r.t.forEach((t, i) => { if (t <= 30) close(r.y2[i], 0, 1e-15); });
    assert.deepEqual(toPlain(CH.superposition('torricelli', 0.01, 0.012)), toPlain(r));
  });
});

describe('conceptos d (ii): Euler, Heun y RK4 frente a RK45', () => {
  test('con el mismo paso: error Euler > Heun > RK4 y evaluaciones 1, 2 y 4 por paso', () => {
    const r = CH.methodsComparison(0.05, 30 * DEG);
    const [e, hn, k4] = r.methods;
    assert.deepEqual(toPlain(r.methods.map((m) => m.id)), ['euler', 'heun', 'rk4']);
    assert.ok(e.maxErr > hn.maxErr && hn.maxErr > k4.maxErr, `${e.maxErr} > ${hn.maxErr} > ${k4.maxErr}`);
    assert.equal(e.fevals, 200);
    assert.equal(hn.fevals, 400);
    assert.equal(k4.fevals, 800);
    // sin rozamiento Euler gana energía; RK4 casi la conserva
    assert.ok(e.drift > 0);
    assert.ok(Math.abs(k4.drift) < Math.abs(hn.drift) && Math.abs(hn.drift) < Math.abs(e.drift));
  });

  test('órdenes observados ≈ 1, 2 y 4 cuando h es pequeño', () => {
    const order = (h, id) => CH.methodsComparison(h, 30 * DEG).methods.find((m) => m.id === id).order;
    const pe = order(0.005, 'euler');
    const ph = order(0.02, 'heun');
    const p4 = order(0.05, 'rk4');
    assert.ok(pe > 0.9 && pe < 1.3, `Euler ${pe}`);
    assert.ok(ph > 1.8 && ph < 2.2, `Heun ${ph}`);
    assert.ok(p4 > 3.7 && p4 < 4.3, `RK4 ${p4}`);
  });

  test('el error se mide contra la referencia en la malla del método (RK4, h = 0.01, error < 1e-6)', () => {
    const r = CH.methodsComparison(0.01, 80 * DEG, { orders: false });
    const k4 = r.methods[2];
    assert.ok(k4.maxErr < 1e-6, `RK4 ${k4.maxErr}`);
    assert.equal(k4.order, null);
    // la referencia conserva la energía del péndulo sin rozamiento
    const th = r.ref.theta;
    assert.ok(Math.max(...th) <= 80 * DEG + 1e-8);
    close(Math.min(...th), -80 * DEG, 1e-3);
  });

  test('observedOrder: solo da orden con los dos errores sobre el umbral y sin crecimiento (reglas ref, growth, nofinite)', () => {
    // por encima del umbral y decreciente: log₂(e(h)/e(h/2))
    const ok = CH.observedOrder(1.6e-5, 1e-6, 1e-9);
    close(ok.order, 4, 1e-12);
    assert.equal(ok.note, null);
    close(CH.observedOrder(2e-3, 1e-3, 0).order, 1, 1e-12);
    // un error en el nivel de la referencia (≤ umbral) no da orden: «ref»
    assert.deepEqual(toPlain(CH.observedOrder(5e-8, 1e-9, 1e-8)), { order: null, note: 'ref' });
    assert.deepEqual(toPlain(CH.observedOrder(1e-8, 1e-9, 1e-8)), { order: null, note: 'ref' });
    // el error crece al reducir h: nunca un orden negativo, «growth»
    assert.deepEqual(toPlain(CH.observedOrder(1e-6, 2e-6, 1e-9)), { order: null, note: 'growth' });
    // NaN o infinito: «nofinite»
    assert.deepEqual(toPlain(CH.observedOrder(NaN, 1e-6, 1e-9)), { order: null, note: 'nofinite' });
    assert.deepEqual(toPlain(CH.observedOrder(1e-3, Infinity, 1e-9)), { order: null, note: 'nofinite' });
  });

  test('pendulumReference: error estimado > 0 y por debajo de 1e-9; se calcula una vez por θ₀ (caché)', () => {
    const a = CH.pendulumReference(150 * DEG);
    assert.ok(a.error > 0, `error ${a.error}`);
    assert.ok(a.error < 1e-9, `error ${a.error}`);
    assert.equal(a.t.length, CH.constants.PEND.nPlot);
    assert.equal(a.theta.length, a.t.length);
    close(a.theta[0], 150 * DEG, 1e-15);
    assert.equal(CH.pendulumReference(150 * DEG), a, 'la misma θ₀ devuelve el objeto en caché');
    assert.notEqual(CH.pendulumReference(80 * DEG), a);
  });

  test('methodsComparison: orderFloor = refFactor × error de la referencia, y las órdenes respetan ese umbral', () => {
    for (const th of [80, 150, 170]) {
      const r = CH.methodsComparison(th === 170 ? 0.005 : 0.01, th * DEG);
      close(r.orderFloor, CH.constants.PEND.refFactor * r.refError, 1e-24, `θ₀ = ${th}°`);
      assert.equal(CH.constants.PEND.refFactor, 100);
      assert.equal(r.refError, CH.pendulumReference(th * DEG).error);
      for (const m of r.methods) {
        if (m.order === null) {
          assert.ok(m.orderNote === 'ref' || m.orderNote === 'growth' || m.orderNote === 'nofinite', `${m.id} ${m.orderNote}`);
        } else {
          assert.ok(m.maxErr > r.orderFloor && m.halfErr > r.orderFloor, `${m.id} θ₀ = ${th}°`);
          assert.ok(m.order >= 0, `${m.id} θ₀ = ${th}°: ${m.order}`);
        }
      }
    }
  });

  test('eqFrame: [−3 % de tEnd, tEnd + 3 %]; el último punto queda a menos del 4 % del borde derecho', () => {
    for (const tEnd of [6, 8, 2.5, 0.4 * 15]) {
      const [lo, hi] = CH.eqFrame(tEnd);
      close(lo, -0.03 * tEnd, 1e-12);
      close(hi, 1.03 * tEnd, 1e-12);
      assert.ok((hi - tEnd) / (hi - lo) < 0.04, `tEnd = ${tEnd}`);
    }
  });

  test('clipSeries corta la curva fuera de escala y plotLimit sigue a la referencia', () => {
    const pts = CH.clipSeries([0, 1, 2, 3, 4], [0, 1, 5, 6, 1], 2, 600);
    assert.deepEqual(toPlain(pts), [
      { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: null }, { x: 4, y: 1 },
    ]);
    const neg = CH.clipSeries([0, 1], [0, -9], 2, 600);
    assert.equal(neg[1].y, -2);
    const r = CH.methodsComparison(0.1, 40 * DEG, { orders: false });
    close(CH.plotLimit(r), 1.5 * 40 * DEG + 0.05, 1e-6);
  });
});
