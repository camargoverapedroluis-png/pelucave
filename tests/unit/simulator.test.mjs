// tests/unit/simulator.test.mjs — Propietario: systems.
// DSL.systems.Simulator (docs/ARCHITECTURE.md §9.4): acumulador de tiempo real, subpasos RK4 de
// paso fijo, tope de 2000 subpasos, modelos discretos por periodos, velocidad, historial en anillo,
// eventos, parámetros en vivo frente a reinicio, cambio de variante, detención por divergencia y
// determinismo bit a bit (mismas llamadas ⇒ mismo historial).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadDSL, toPlain, SCRIPTS } from '../helpers/load.mjs';

const { DSL, env } = loadDSL([...SCRIPTS.core, ...SCRIPTS.systems]);
const S = DSL.systems;
const { Simulator, RingBuffer } = S;

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≉ ${b} (tol ${tol})`);
const FRAME = 1 / 60;

function runFrames(sim, n, dt = FRAME) { let s = 0; for (let i = 0; i < n; i++) s += sim.step(dt); return s; }

describe('construcción y lectura', () => {
  test('valores iniciales, entrada por omisión y primera muestra', () => {
    const sim = new Simulator('massSpring');
    assert.equal(sim.t, 0);
    assert.equal(sim.k, 0);
    assert.equal(sim.variant, 'base');
    assert.equal(sim.speed, 1);
    assert.deepStrictEqual(toPlain(sim.state), [0, 0]);
    assert.deepStrictEqual(toPlain(sim.input), { type: 'escalon', amplitude: 1, t0: 0, width: 1, omega: 1, offset: 0 });
    assert.equal(sim.u, 1);
    assert.equal(sim.history.length, 1);
    assert.deepStrictEqual(toPlain(sim.history.get(0)), { t: 0, outputs: { x: 0, v: 0 }, state: [0, 0], u: 1 });
    assert.deepStrictEqual(toPlain(sim.params), { m: 1, b: 0.8, k: 4 });
    assert.equal(sim.timeScale, 1);
    assert.equal(sim.dt, sim.hints.dt);
    // Copias: modificar lo leído no cambia el simulador.
    sim.state[0] = 99; sim.params.m = 99;
    assert.equal(sim.state[0], 0); assert.equal(sim.params.m, 1);
  });

  test('acepta modelo como objeto, variante, parámetros parciales y dt explícito', () => {
    const sim = new Simulator(S.get('tanks'), { variant: 'cascada', params: { R2: 20 }, dt: 0.01, speed: 2 });
    assert.equal(sim.variant, 'cascada');
    assert.equal(sim.params.R2, 20);
    assert.equal(sim.params.A1, 1);
    assert.equal(sim.dt, 0.01);
    assert.equal(sim.speed, 2);
    assert.throws(() => new Simulator('tanks', { variant: 'nada' }), /no tiene la variante/);
  });
});

describe('avance continuo', () => {
  test('step(realDt) acumula realDt·velocidad·timeScale y da subpasos de dt fijo', () => {
    const sim = new Simulator('massSpring'); // timeScale 1, dt 0.01
    const dt = sim.dt;
    let total = 0;
    for (let i = 0; i < 60; i++) total += sim.step(FRAME);
    close(sim.t, total * dt, 1e-12);
    close(sim.t, 1, dt + 1e-12, 'un segundo real a 1× ≈ un segundo simulado');
    assert.equal(sim.history.length, 61, 'una muestra por llamada que avanzó');
  });

  test('la velocidad escala el avance y se limita a [0.25, 4]', () => {
    const a = new Simulator('massSpring'), b = new Simulator('massSpring', { speed: 2 });
    runFrames(a, 120); runFrames(b, 120);
    close(b.t, 2 * a.t, 2 * a.dt);
    b.setSpeed(10); assert.equal(b.speed, 4);
    b.setSpeed(0.01); assert.equal(b.speed, 0.25);
    b.setSpeed('x'); assert.equal(b.speed, 1);
  });

  test('como máximo 2000 subpasos por llamada; el resto se descarta de forma determinista', () => {
    const sim = new Simulator('rlc'); // dt 8e-5, timeScale 0.01
    const n = sim.step(1e4);
    assert.equal(n, 2000);
    close(sim.t, 2000 * sim.dt, 1e-12);
    assert.equal(sim.step(1e-9), 0, 'el acumulador quedó por debajo de dt');
  });

  test('step con dt no positivo o no finito no hace nada', () => {
    const sim = new Simulator('massSpring');
    const calls = [];
    sim.on('step', (p) => calls.push(p));
    assert.equal(sim.step(0), 0);
    assert.equal(sim.step(-1), 0);
    assert.equal(sim.step(NaN), 0);
    assert.equal(calls.length, 0);
    assert.equal(sim.history.length, 1);
  });

  test("evento 'step' con { t, state, outputs, u, substeps }", () => {
    const sim = new Simulator('rlc');
    let payload = null;
    const off = sim.on('step', (p) => { payload = p; });
    const n = sim.step(FRAME);
    assert.deepStrictEqual(Object.keys(payload).sort(), ['outputs', 'state', 'substeps', 't', 'u']);
    assert.equal(payload.substeps, n);
    assert.equal(payload.t, sim.t);
    assert.deepStrictEqual(toPlain(payload.state), toPlain(sim.state));
    off();
    sim.step(FRAME);
    assert.equal(payload.substeps, n, 'tras darse de baja no se llama');
  });

  test('advance(simAmount) avanza exactamente esa cantidad, sin velocidad, y coincide con simulate()', () => {
    for (const [id, variant, input] of [
      ['massSpring', 'base', { type: 'escalon', amplitude: 1, t0: 0.505 }],
      ['rlc', 'serie', { type: 'pulso', amplitude: 5, t0: 0.00123, width: 0.0317 }],
      ['tanks', 'torricelli', { type: 'escalon', amplitude: 0.01, t0: 5 }],
      ['sir', 'base', { type: 'pulso', amplitude: 0.6, t0: 20.03, width: 30 }],
      ['pendulum', 'nolineal', { type: 'ninguna' }],
    ]) {
      const sim = new Simulator(id, { variant, input, speed: 4 });
      const T = sim.hints.duration;
      sim.advance(T);
      close(sim.t, T, 1e-9 * T, `${id}: t final`);
      const ref = S.simulate(id, { variant, input });
      const xr = ref.x.at(-1), xs = sim.state;
      const scale = Math.max(1, ...ref.x.flat().map(Math.abs));
      xs.forEach((v, i) => close(v, xr[i], 1e-7 * scale, `${id}: estado ${i}`));
    }
  });

  test("advance registra muestras según 'auto', 'all' o 'end'", () => {
    const a = new Simulator('massSpring'); a.advance(15);
    assert.ok(a.history.length >= 700 && a.history.length <= 760, `auto: ${a.history.length}`);
    assert.equal(a.history.last().t, a.t);
    const b = new Simulator('massSpring', { historySize: 5000 }); b.advance(1, { record: 'all' });
    assert.equal(b.history.length, 101);
    const c = new Simulator('massSpring'); c.advance(15, { record: 'end' });
    assert.equal(c.history.length, 2);
  });

  test('la entrada se evalúa en el tiempo simulado y los saltos se integran por tramos', () => {
    // Escalón a mitad de un paso: el simulador parte el paso y coincide con la respuesta analítica.
    const sim = new Simulator('tanks', { variant: 'lineal', input: { type: 'escalon', amplitude: 0.05, t0: 3.017 } });
    const G = S.get('tanks').tf(sim.params, 'lineal', 'h').tf;
    sim.advance(30);
    close(sim.outputs.h, 0.05 * G.stepAnalytic().fn(30 - 3.017), 1e-9);
    assert.equal(sim.u, 0.05);
  });
});

describe('modelos discretos', () => {
  test('telaraña: una iteración por cada 1/timeScale s reales; t === k; coincide con la forma cerrada', () => {
    const sim = new Simulator('market', { variant: 'telarana' });
    assert.equal(sim.timeScale, 2);
    assert.equal(sim.step(0.4), 0, 'aún no completa un periodo');
    assert.equal(sim.step(0.1), 1);
    assert.equal(sim.k, 1);
    assert.equal(sim.t, 1);
    runFrames(sim, 300); // 5 s → 10 periodos más
    assert.equal(sim.k, 11);
    const p = sim.params;
    const Ps = (p.a - p.c) / (p.b + p.d);
    close(sim.state[0], Ps + Math.pow(-p.d / p.b, 11) * (p.P0 - Ps), 1e-9);
    sim.history.forEach((h) => assert.equal(Number.isInteger(h.t), true));
    sim.advance(4);
    assert.equal(sim.k, 15);
  });

  test('una telaraña que sale del dominio económico se detiene en el periodo de la salida, que queda registrado', () => {
    const sim = new Simulator('market', { variant: 'telarana', params: { b: 2, d: 2.4, P0: 40 } });
    const halts = [];
    sim.on('halt', (h) => halts.push(h));
    sim.advance(1000);
    assert.ok(sim.halted, 'debe detenerse');
    assert.equal(halts.length, 1);
    assert.equal(sim.k, 1);
    assert.equal(sim.halted.kind, 'dominio');
    // El evento lleva la misma clase: quien escucha no tiene que analizar el texto.
    assert.equal(halts[0].kind, 'dominio');
    assert.equal(halts[0].reason, sim.halted.reason);
    assert.match(sim.halted.reason, /dominio/);
    assert.equal(sim.halted.reason, 'La simulación se detuvo en k = 1: el precio se hizo negativo (−3 u.m.), fuera del dominio económico del modelo lineal. Con d/b = 1.2 la oscilación crece un 20 % por periodo.');
    assert.equal(sim.history.length, 2);
    assert.equal(sim.history.last().t, 1);
    close(sim.history.last().outputs.P, -3, 1e-12);
    assert.equal(sim.step(1), 0, 'detenido: no avanza');
    sim.reset();
    assert.equal(sim.halted, null);
    assert.equal(sim.k, 0);
    // En tiempo real (step) ocurre lo mismo: el periodo que sale cuenta y es el último.
    const rt = new Simulator('market', { variant: 'telarana', params: { b: 2, d: 2.4, P0: 40 } });
    assert.equal(rt.step(100), 1);
    assert.equal(rt.history.last().t, 1);
    assert.match(rt.halted.reason, /^La simulación se detuvo en k = 1: /);
  });

  test('hints de una telaraña que sale del dominio: la ventana termina en la salida y el rango de P no se dispara', () => {
    const m = S.get('market');
    const p = { ...S.defaults('market', 'telarana'), b: 2, d: 4 };
    const h = m.hints(p, 'telarana');
    assert.equal(h.duration, 1);
    const ab = p.a / p.b;
    assert.ok(h.yRange.P[0] >= -0.2 * ab && h.yRange.P[1] <= 1.2 * Math.max(p.P0, ab), JSON.stringify(toPlain(h.yRange.P)));
    const q = { ...S.defaults('market', 'telarana'), b: 2, d: 2.4 };
    assert.equal(m.hints(q, 'telarana').duration, 1);
    // Con d/b < 1 pero una primera excursión por debajo de 0, el motivo lo explica.
    // P* = 100/3.9 ≈ 25.6 y P₁ = P* − 0.95·(60 − P*) ≈ −7 u.m.
    const sim = new Simulator('market', { variant: 'telarana', params: { b: 2, d: 1.9, c: 0, P0: 60 } });
    sim.advance(100);
    assert.equal(sim.k, 1);
    assert.match(sim.halted.reason, /el precio se hizo negativo .*Con d\/b = 0\.95 la oscilación se amortigua, pero su primera excursión ya sale del dominio\./);
    assert.equal(m.hints({ ...S.defaults('market', 'telarana'), b: 2, d: 1.9, c: 0, P0: 60 }, 'telarana').duration, 1);
  });

  test('con los valores por omisión la telaraña no sale del dominio y sus hints no cambian', () => {
    const m = S.get('market');
    const p = S.defaults('market', 'telarana');
    const h = m.hints(p, 'telarana');
    assert.equal(h.duration, 22);
    assert.deepStrictEqual(toPlain(h.yRange.P), [-3.2, 43.2]);
    const sim = new Simulator('market', { variant: 'telarana' });
    sim.advance(200);
    assert.equal(sim.halted, null);
    assert.equal(sim.k, 200);
    for (const it of sim.history.toArray()) assert.ok(it.outputs.P >= 0 && it.outputs.Qd >= 0 && it.outputs.Qs >= 0);
  });

  test('el tope de estado (stateBound) sigue deteniendo los modelos sin dominio', () => {
    const grow = {
      id: 'prueba-crecimiento', variants: [{ id: 'base', timeDomain: 'discrete', timeUnit: 'periodos' }],
      params: () => [], inputs: () => [], state: () => [{ key: 'x' }], outputs: () => [{ key: 'x' }],
      x0: () => [1], next: (k, x) => [10 * x[0]], output: (t, x) => ({ x: x[0] }),
      hints: () => ({ duration: 100, dt: 1, timeScale: 1, stateBound: 1e6 }),
    };
    const sim = new Simulator(grow);
    const halts = [];
    sim.on('halt', (h) => halts.push(h));
    sim.advance(1000);
    assert.equal(halts.length, 1);
    assert.match(sim.halted.reason, /divergente/);
    assert.equal(sim.halted.kind, undefined);
    assert.equal(halts[0].kind, undefined);
    assert.equal(sim.state[0], 1e6);
    assert.equal(sim.k, 6);
  });
});

describe('parámetros, entrada, variante y reinicio', () => {
  test('setParams en vivo conserva el estado; un parámetro live:false reinicia', () => {
    const sim = new Simulator('sir');
    runFrames(sim, 60);
    const t = sim.t;
    const events = [];
    sim.on('params', (e) => events.push(['params', toPlain(e.params)]));
    sim.on('reset', () => events.push(['reset']));
    sim.setParams({ beta: 0.4 });
    assert.equal(sim.t, t, 'β se aplica en vivo');
    assert.equal(sim.params.beta, 0.4);
    sim.setParams({ N: 50000 });
    assert.equal(sim.t, 0, 'N reinicia');
    assert.equal(sim.state[0], 50000 - 10);
    assert.deepStrictEqual(events.map((e) => e[0]), ['params', 'params', 'reset']);
    assert.equal(events[0][1].beta, 0.4);
    sim.setParams({ beta: 0.4 });
    assert.equal(events.length, 3, 'sin cambios no se emite nada');
    sim.setParams({ nada: 1, gamma: NaN });
    assert.equal(events.length, 3, 'claves desconocidas o valores no finitos se ignoran');
  });

  test('setParams recalcula dt pero conserva timeScale hasta el reinicio', () => {
    const sim = new Simulator('rlc');
    const ts = sim.timeScale, dt = sim.dt;
    sim.setParams({ L: 0.05, C: 1e-5 });
    assert.ok(sim.dt < dt);
    assert.equal(sim.timeScale, ts);
    sim.reset();
    assert.notEqual(sim.timeScale, ts);
  });

  test('setInput cambia la entrada sin reiniciar', () => {
    const sim = new Simulator('massSpring');
    runFrames(sim, 30);
    const t = sim.t;
    let ev = null;
    sim.on('input', (e) => { ev = e; });
    sim.setInput({ type: 'senoidal', amplitude: 2, omega: 3 });
    assert.equal(sim.t, t);
    assert.equal(ev.input.type, 'senoidal');
    close(sim.u, 2 * Math.sin(3 * t), 1e-12);
  });

  test('reset vuelve a t = 0 y x0, vacía el historial y emite reset', () => {
    const sim = new Simulator('tanks', { variant: 'torricelli' });
    runFrames(sim, 100);
    let n = 0;
    sim.on('reset', () => n++);
    sim.reset();
    assert.equal(n, 1);
    assert.equal(sim.t, 0);
    assert.equal(sim.history.length, 1);
    close(sim.state[0], S.get('tanks').x0(sim.params, 'torricelli')[0], 0);
  });

  test('setVariant conserva las claves comunes, usa los valores por omisión del resto y la entrada de la nueva variante', () => {
    const sim = new Simulator('market', { variant: 'telarana', params: { b: 3, P0: 12 } });
    runFrames(sim, 120);
    sim.setVariant('ajuste');
    assert.equal(sim.variant, 'walras');
    assert.equal(sim.timeDomain, 'continuous');
    assert.equal(sim.params.b, 3);
    assert.equal(sim.params.P0, 12);
    assert.equal(sim.params.alpha, 0.2);
    assert.equal(sim.t, 0);
    assert.equal(sim.input.type, 'escalon');
    const tanks = new Simulator('tanks', { variant: 'lineal', params: { A: 2 } });
    tanks.setVariant('torricelli');
    assert.equal(tanks.params.A, 2);
    assert.equal(tanks.params.qin0, 0.03);
    assert.deepStrictEqual(toPlain(Object.keys(tanks.outputs)), ['h', 'qout', 'hLin']);
    assert.deepStrictEqual(toPlain(tanks.state), [tanks.outputs.h, 0], 'Torricelli: [h, Δh_lin] desde el equilibrio');
  });

  test('destroy deja el simulador inerte', () => {
    const sim = new Simulator('massSpring');
    let calls = 0;
    sim.on('step', () => calls++);
    sim.destroy();
    assert.equal(sim.destroyed, true);
    assert.equal(sim.step(1), 0);
    assert.equal(sim.advance(1), 0);
    assert.equal(calls, 0);
  });
});

describe('historial en anillo', () => {
  test('capacidad, orden y acceso', () => {
    const r = new RingBuffer(3);
    [1, 2, 3, 4, 5].forEach((v) => r.push(v));
    assert.equal(r.length, 3);
    assert.equal(r.capacity, 3);
    assert.deepStrictEqual(toPlain(r.toArray()), [3, 4, 5]);
    assert.equal(r.get(0), 3);
    assert.equal(r.get(-1), 5);
    assert.equal(r.get(3), undefined);
    assert.equal(r.last(), 5);
    const seen = [];
    r.forEach((v, i) => seen.push([v, i]));
    assert.deepStrictEqual(seen, [[3, 0], [4, 1], [5, 2]]);
    r.clear();
    assert.equal(r.length, 0);
    assert.equal(r.last(), undefined);
  });

  test('el historial del simulador conserva las últimas historySize muestras', () => {
    const sim = new Simulator('massSpring', { historySize: 50 });
    runFrames(sim, 200);
    assert.equal(sim.history.length, 50);
    assert.equal(sim.history.last().t, sim.t);
    const ts = sim.history.toArray().map((h) => h.t);
    for (let i = 1; i < ts.length; i++) assert.ok(ts[i] > ts[i - 1]);
  });
});

describe('determinismo', () => {
  function script(sim) {
    const frames = [FRAME, FRAME * 1.3, FRAME * 0.7, 0.05, FRAME];
    for (let i = 0; i < 400; i++) {
      sim.step(frames[i % frames.length]);
      if (i === 50) sim.setParams({ b: 0.3 });
      if (i === 120) sim.setInput({ type: 'pulso', amplitude: 3, t0: sim.t + 0.37, width: 0.81 });
      if (i === 200) sim.setSpeed(2.5);
      if (i === 260) sim.setParams({ k: 9 });
      if (i === 300) sim.reset();
    }
    return toPlain(sim.history.toArray());
  }

  test('las mismas llamadas producen el mismo historial, bit a bit', () => {
    const a = script(new Simulator('massSpring'));
    const b = script(new Simulator('massSpring'));
    assert.deepStrictEqual(a, b);
    assert.ok(a.length > 50);
  });

  test('también en los modelos no lineales y discretos', () => {
    for (const [id, variant] of [['sir', 'base'], ['tanks', 'torricelli'], ['market', 'telarana'], ['pendulum', 'nolineal']]) {
      const run = () => {
        const sim = new Simulator(id, { variant });
        for (let i = 0; i < 300; i++) sim.step(i % 3 ? FRAME : FRAME * 1.5);
        return toPlain(sim.history.toArray());
      };
      assert.deepStrictEqual(run(), run(), id);
    }
  });
});

test('sin errores ni avisos de consola', () => {
  assert.deepStrictEqual(env.console.error, []);
  assert.deepStrictEqual(env.console.warn, []);
});
