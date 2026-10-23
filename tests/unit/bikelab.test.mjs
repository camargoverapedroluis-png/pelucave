// tests/unit/bikelab.test.mjs — Propietario: bikelab.
// Laboratorio de la bicicleta (DSL.sections.bikeLab): estática del vuelco, coeficientes, funciones de
// transferencia (polos, ceros y estabilidad del lazo cerrado con el motor DSL.core.tf), terreno procedural
// determinista, simulador RK4 (reposo, respuesta a un bache, saturación del torso, caída por frenada en
// pendiente) y montaje/destrucción sobre el DOM falso sin errores de consola.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadDSL, SCRIPTS, toPlain } from '../helpers/load.mjs';

const UI = ['js/ui/icons-data.js', 'js/ui/components.js', 'js/viz/charts.js'];
const FILES = [...SCRIPTS.core, ...UI, 'js/sections/bikelab.js'];

function boot(options) {
  const r = loadDSL(FILES, options);
  return { ...r, B: r.DSL.sections.bikeLab, H: r.DSL.sections.bikeLab.helpers };
}

const DEG = Math.PI / 180;

describe('bikelab: contrato del módulo', () => {
  test('expone mount, la clase BikeSuspensionLab y los helpers, sin tocar el DOM al cargar', () => {
    const { B, H, env } = boot();
    assert.equal(typeof B.mount, 'function');
    assert.equal(typeof B.BikeSuspensionLab, 'function');
    for (const k of ['defaults', 'coefficients', 'statics', 'transferFunctions', 'analyze', 'bumpField', 'frameGeometry', 'buildDiagram', 'Scene']) {
      assert.equal(typeof H[k], 'function', k);
    }
    assert.equal(H.GROUPS.length, 4);
    assert.equal(H.BLOCKS.map((b) => b.id).join(','), 'GC,GV,G2,G1,H');
    assert.equal(H.SIGNALS.length, 7);
    assert.equal(env.document.body.childNodes.length, 0);
    assert.deepEqual(env.console.error, []);
    assert.deepEqual(env.console.warn, []);
  });

  test('los valores por omisión están dentro del rango de cada deslizador y en unidades del SI', () => {
    const { H } = boot();
    const d = H.defaults();
    for (const g of H.GROUPS) {
      for (const p of g.params) {
        assert.ok(p.def >= p.min && p.def <= p.max, p.key);
        assert.equal(d[p.key], p.def * p.factor, p.key);
        assert.equal(typeof p.sym, 'string', `${p.key}: símbolo de respaldo`);
      }
    }
    assert.ok(Math.abs(d.v - 25 / 3.6) < 1e-12, 'v en m/s');
    assert.ok(Math.abs(d.alpha - 10 * DEG) < 1e-12, 'α en radianes');
  });
});

describe('bikelab: estática del vuelco', () => {
  test('sin pendiente ni frenada el resultante es vertical y las normales reparten el peso según el CG', () => {
    const { H } = boot();
    const s = H.statics(0, 0, 0, 100);
    assert.ok(Math.abs(s.thetaStatic) < 1e-12);
    assert.ok(Math.abs(s.Nr + s.Nf - 100 * 9.81) < 1e-9);
    assert.ok(Math.abs(s.Nr - s.Nf) < 1e-9, 'CG centrado: mitad y mitad');
    assert.ok(s.tipMoment < 0, 'sin momento de vuelco');
    const back = H.statics(0, 0, -0.2, 100);
    assert.ok(back.Nr > back.Nf, 'el cuerpo atrás carga la rueda trasera');
    assert.ok(back.thetaCritFront > s.thetaCritFront, 'y aumenta el umbral frontal');
  });

  test('la pendiente y la frenada tumban el resultante; el umbral frontal es atan(a_ef/h)', () => {
    const { H } = boot();
    const slope = H.statics(30 * DEG, 0, 0, 90);
    assert.ok(Math.abs(slope.thetaStatic - 30 * DEG) < 1e-12, 'sin frenar, θ_est = α');
    assert.ok(Math.abs(slope.thetaCritFront - Math.atan((H.GEO.L / 2) / H.GEO.hCg)) < 1e-12);
    const brake = H.statics(30 * DEG, 4, 0, 90);
    assert.ok(brake.thetaStatic > slope.thetaStatic, 'frenar aumenta el ángulo');
    assert.ok(brake.Nr < slope.Nr, 'y descarga la rueda trasera');
    assert.ok(brake.thetaStatic > brake.thetaCritFront, 'a 30° frenando a 4 m/s² se supera el umbral');
    assert.ok(brake.Nr < 0, 'la normal trasera estática se hace negativa (rueda en el aire)');
  });
});

describe('bikelab: funciones de transferencia', () => {
  test('coeficientes: m_eq, ω_n, ζ y τ_w = r_c/v con los valores por omisión', () => {
    const { H } = boot();
    const c = H.coefficients(H.defaults());
    assert.ok(Math.abs(c.mEq - 0.6 * 89) < 1e-9);
    assert.ok(Math.abs(c.wn - Math.sqrt(12000 / c.mEq)) < 1e-9);
    assert.ok(c.zeta > 0.7 && c.zeta < 0.8, `ζ = ${c.zeta}`);
    assert.ok(Math.abs(c.tauW - 0.17 / (25 / 3.6)) < 1e-12);
    assert.equal(c.K1, 12000);
  });

  test('polos y ceros de cada bloque con la topología del diagrama', () => {
    const { H } = boot();
    const c = H.coefficients(H.defaults());
    const t = H.transferFunctions(c);
    const an = {};
    for (const b of H.BLOCKS) an[b.id] = H.analyze(b.tf(t));
    // G_C = (K_d s² + K_p s + K_i)/s: polo en 0, dos ceros.
    assert.equal(an.GC.poles.length, 1);
    assert.ok(Math.abs(an.GC.poles[0].re) < 1e-12 && Math.abs(an.GC.poles[0].im) < 1e-12);
    assert.equal(an.GC.zeros.length, 2);
    // G_V: polo en −1/τ_m.
    assert.ok(Math.abs(an.GV.poles[0].re + 1 / c.tauM) < 1e-9);
    assert.equal(an.GV.verdict, 'estable');
    // G_2: polos en 0 y −b/J.
    const p2 = an.G2.poles.map((z) => z.re).sort((a, b) => a - b);
    assert.ok(Math.abs(p2[0] + c.bP / c.J) < 1e-9 && Math.abs(p2[1]) < 1e-9);
    assert.equal(an.G2.verdict, 'marginal');
    // G_1: polo en −1/τ_w, ganancia estática k.
    assert.ok(Math.abs(an.G1.poles[0].re + 1 / c.tauW) < 1e-6);
    assert.ok(Math.abs(an.G1.dc - c.K1) < 1e-9);
    // H: par complejo con ω_n y ζ.
    assert.equal(an.H.poles.length, 2);
    const mag = Math.hypot(an.H.poles[0].re, an.H.poles[0].im);
    assert.ok(Math.abs(mag - c.wn) < 1e-6, 'módulo del polo = ω_n');
    assert.ok(Math.abs(-an.H.poles[0].re / mag - c.zeta) < 1e-6, 'coseno del polo = ζ');
    assert.ok(Math.abs(an.H.dc - 1 / c.k) < 1e-15);
  });

  test('lazo cerrado T(s) propio y estable con los valores por omisión; sin control queda marginal', () => {
    const { H, DSL } = boot();
    const P = DSL.core.numeric.poly;
    const c = H.coefficients(H.defaults());
    const t = H.transferFunctions(c);
    assert.equal(P.degree(t.T.den), 6);
    assert.equal(P.degree(t.T.num), 2);
    assert.deepEqual(toPlain(t.T.den), toPlain(P.add(t.L.den, t.L.num)), 'D_T = D_L + N_L');
    const T = H.analyze(t.T);
    assert.equal(T.verdict, 'estable');
    assert.ok(Math.abs(T.dc - 1) < 1e-9, 'seguimiento sin error permanente (integradores)');
    const TQ = H.analyze(t.TQ);
    assert.equal(TQ.verdict, 'estable');
    assert.ok(Math.abs(TQ.dc) < 1e-9, 'la perturbación constante se rechaza del todo');
    const open = H.coefficients({ ...H.defaults(), Kp: 0, Kd: 0, Ki: 0 });
    const T0 = H.analyze(H.transferFunctions(open).T);
    assert.notEqual(T0.verdict, 'estable');
  });

  test('texRoots agrupa los pares conjugados y las raíces repetidas', () => {
    const { H } = boot();
    assert.equal(H.texRoots([]), '\\text{ninguno}');
    const tex = H.texRoots([{ re: -1, im: 2 }, { re: -1, im: -2 }, { re: 0, im: 0 }, { re: 0, im: 0 }]);
    assert.match(tex, /\\pm/);
    assert.match(tex, /\\times 2/);
    assert.equal((tex.match(/\\pm/g) || []).length, 1, 'el par aparece una sola vez');
  });
});

describe('bikelab: terreno procedural', () => {
  test('misma semilla y configuración ⇒ mismo perfil; altura dentro de A_b; derivada coherente', () => {
    const { H } = boot();
    const make = () => { const f = H.bumpField(7); f.configure(7, 1.2, 0.04); f.ensure(60); return f; };
    const a = make();
    const b = make();
    const oa = { z: 0, dz: 0 };
    const ob = { z: 0, dz: 0 };
    let maxZ = 0;
    let bumps = 0;
    for (let s = 0; s <= 60; s += 0.01) {
      a.at(s, oa);
      b.at(s, ob);
      assert.equal(oa.z, ob.z);
      maxZ = Math.max(maxZ, oa.z);
      assert.ok(oa.z >= 0 && oa.z <= 0.04 + 1e-12, `z en [0, A_b] en s = ${s}`);
      // derivada numérica frente a la analítica
      const o2 = { z: 0, dz: 0 };
      a.at(s + 1e-5, o2);
      const num = (o2.z - oa.z) / 1e-5;
      assert.ok(Math.abs(num - oa.dz) < 2e-3 + Math.abs(oa.dz) * 1e-2, `dz/ds en s = ${s}`);
    }
    assert.ok(maxZ > 0.02, 'hay baches de altura apreciable');
    const list = a.list();
    assert.ok(list.length >= 6, `baches generados: ${list.length}`);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].s >= list[i - 1].s + list[i - 1].w, 'no se solapan');
    assert.ok(list[0].s >= 2.5, 'el primero deja arrancar');
  });

  test('con A_b = 0 el perfil es plano y regenerateFrom conserva los baches ya pasados', () => {
    const { H } = boot();
    const f = H.bumpField(3);
    f.configure(7, 1, 0);
    f.ensure(30);
    const o = { z: 0, dz: 0 };
    for (let s = 0; s < 30; s += 0.5) { f.at(s, o); assert.equal(o.z, 0); }
    const g = H.bumpField(3);
    g.configure(7, 1, 0.05);
    g.ensure(40);
    const before = g.list().slice();
    g.regenerateFrom(15);
    const kept = g.list().slice();
    assert.ok(kept.length < before.length);
    for (const b of kept) assert.ok(b.s + b.w <= 15);
    g.configure(7, 3, 0.05);
    g.ensure(40);
    assert.ok(g.list().length > kept.length, 'se regenera por delante con la nueva frecuencia');
    assert.ok(g.list().slice(kept.length).every((b) => b.s >= 15), 'solo por delante de la bicicleta');
  });
});

describe('bikelab: simulador', () => {
  test('en llano, sin baches ni frenada, la bicicleta no se mueve del reposo y mantiene la velocidad', () => {
    const { B } = boot();
    const lab = new B.BikeSuspensionLab({ alpha: 0, Ab: 0, thetaSet: 0 });
    for (let i = 0; i < 120; i++) lab.step(1 / 60);
    const o = lab.out;
    assert.ok(Math.abs(o.C) < 1e-9, 'C = 0');
    assert.ok(Math.abs(o.dx) < 1e-9, 'Δx = 0');
    assert.ok(Math.abs(o.theta) < 1e-9, 'θ = 0');
    assert.ok(Math.abs(o.v - 25 / 3.6) < 1e-9);
    assert.ok(Math.abs(o.s - 2 * 25 / 3.6) < 1e-6, 'recorrido = v·t');
    assert.equal(lab.halted, false);
    assert.equal(lab.fall, null);
  });

  test('en pendiente el controlador inclina el torso hacia atrás y lleva C hacia la consigna', () => {
    const { B } = boot();
    const lab = new B.BikeSuspensionLab({ alpha: 15 * DEG, Ab: 0 });
    lab.step(0.05);
    const early = lab.out.C;
    assert.ok(early > 0, 'la transferencia de peso levanta la cola al principio');
    for (let i = 0; i < 60 * 12; i++) lab.step(1 / 60);
    const o = lab.out;
    assert.ok(o.xt < -0.05, `el torso va hacia atrás: x_t = ${o.xt}`);
    assert.ok(Math.abs(o.E) < 0.004, `error final pequeño: E = ${o.E} m`);
    assert.ok(o.theta < o.thetaCritFront, 'sin caída');
    assert.equal(lab.fall, null);
  });

  test('un bache comprime el amortiguador, genera fuerza y se recupera; el cabeceo acompaña al bache', () => {
    const { B } = boot();
    const lab = new B.BikeSuspensionLab({ alpha: 0, Ab: 0.06, wb: 0.4 });
    let maxDx = 0;
    let maxFs = 0;
    let maxZr = 0;
    for (let i = 0; i < 60 * 6; i++) {
      lab.step(1 / 60);
      maxDx = Math.max(maxDx, lab.out.dx);
      maxFs = Math.max(maxFs, Math.abs(lab.out.Fs));
      maxZr = Math.max(maxZr, lab.out.zr);
    }
    assert.ok(maxZr > 0.03, 'la rueda trasera pasó por un bache');
    assert.ok(maxDx > 0.02 && maxDx < 0.12, `compresión máxima plausible: ${maxDx} m`);
    assert.ok(maxFs > 200, `fuerza máxima: ${maxFs} N`);
    // Tras el bache (perfil plano) la suspensión vuelve al reposo.
    const lab2 = new B.BikeSuspensionLab({ alpha: 0, Ab: 0.06, wb: 0.4 });
    for (let i = 0; i < 60 * 3; i++) lab2.step(1 / 60);
    lab2.setParams({ Ab: 0 });
    for (let i = 0; i < 60 * 8; i++) lab2.step(1 / 60);
    assert.ok(Math.abs(lab2.out.dx) < 0.003, `vuelve al reposo: Δx = ${lab2.out.dx}`);
  });

  test('frenar fuerte en una pendiente de 25° provoca el vuelco hacia delante y detiene la simulación', () => {
    const { B } = boot();
    const lab = new B.BikeSuspensionLab({ alpha: 25 * DEG, Ab: 0, ab: 6 });
    for (let i = 0; i < 60 * 2; i++) lab.step(1 / 60);
    assert.equal(lab.fall, null, 'sin frenar aguanta');
    lab.brake(true);
    let fall = null;
    for (let i = 0; i < 60 * 6 && !fall; i++) fall = lab.step(1 / 60);
    assert.ok(fall, 'cae');
    assert.equal(fall.kind, 'otb');
    assert.ok(fall.theta > fall.limit);
    assert.equal(lab.halted, true);
    assert.equal(lab.step(1 / 60), null, 'detenida: step no avanza');
    const tHalt = lab.t;
    lab.step(1 / 60);
    assert.equal(lab.t, tHalt);
    lab.reset();
    assert.equal(lab.halted, false);
    assert.equal(lab.fall, null);
    assert.equal(lab.t, 0);
    assert.equal(lab.braking, true, 'reset no suelta el freno (lo hace la vista)');
  });

  test('el torso satura en ±0.35 m y la velocidad nunca es negativa', () => {
    const { B, H } = boot();
    const lab = new B.BikeSuspensionLab({ alpha: 45 * DEG, Ab: 0, xcg: -0.3, ab: 8, v: 2 });
    lab.brake(true);
    for (let i = 0; i < 60 * 8; i++) lab.step(1 / 60);
    assert.ok(Math.abs(lab.out.xt) <= H.GEO.leanMax + 1e-12);
    assert.ok(lab.out.v >= 0);
  });

  test('el simulador es determinista: dos instancias iguales dan la misma trayectoria', () => {
    const { B } = boot();
    const a = new B.BikeSuspensionLab();
    const b = new B.BikeSuspensionLab();
    for (let i = 0; i < 200; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
      assert.equal(a.out.C, b.out.C);
      assert.equal(a.out.theta, b.out.theta);
    }
  });
});

describe('bikelab: geometría del marco', () => {
  test('al comprimir, el basculante gira y el amortiguador se acorta', () => {
    const { H } = boot();
    const g0 = H.frameGeometry(0, 0);
    const g1 = H.frameGeometry(0.05, 0);
    assert.ok(g1.axle[1] > g0.axle[1], 'el eje trasero sube');
    assert.ok(g1.shockLen < g0.shockLen, 'el resorte se comprime');
    assert.ok(Math.abs(g0.shockCompression) < 1e-12);
    assert.ok(g1.shockCompression > 0.01, `compresión del amortiguador: ${g1.shockCompression}`);
  });
});

describe('bikelab: montaje sobre el DOM falso', () => {
  function mountLab(options) {
    const r = boot(options);
    const el = r.document.createElement('div');
    r.document.body.appendChild(el);
    const handle = r.B.mount(el);
    return { ...r, el, handle };
  }

  test('mount es barato, pinta la cabecera y deja el laboratorio pendiente hasta el inicio perezoso', () => {
    const { el, handle, env } = mountLab();
    const root = el.querySelector('.bk');
    assert.ok(root);
    assert.ok(root.classList.contains('is-pending'));
    assert.equal(el.querySelector('[data-testid="bk-title"]').textContent.slice(0, 22), 'Laboratorio avanzado: ');
    assert.ok(el.querySelector('[data-testid="bk-stage"]'));
    assert.ok(el.querySelector('[data-testid="bk-dock"]'));
    assert.equal(el.querySelectorAll('.bk-sliders').length, 0, 'los paneles se construyen después');
    assert.equal(handle.state().ready, false);
    assert.deepEqual(env.console.error, []);
    handle.destroy();
    assert.equal(el.childNodes.length, 0);
  });

  test('init() construye todo: deslizadores, lecturas, gráficas inertes, ecuaciones y diagrama; sin errores', () => {
    const { el, handle, env, H } = mountLab();
    handle.init();
    const st = handle.state();
    assert.equal(st.ready, true);
    assert.equal(st.initPhases.length, 8);
    const n = H.GROUPS.reduce((acc, g) => acc + g.params.length, 0);
    assert.equal(el.querySelectorAll('.ds-slider').length, n);
    assert.ok(el.querySelectorAll('.bk-readout').length >= 8);
    assert.equal(el.querySelectorAll('.bk-chart').length, 3);
    assert.equal(el.querySelectorAll('.bk-eq').length, 6, 'cinco bloques y la T(s) global');
    assert.ok(el.querySelector('[data-testid="bk-diagram"]'));
    for (const id of ['GC', 'GV', 'G2', 'G1', 'H', 'Cset', 'E', 'M', 'Mag', 'Q', 'Treac', 'C']) {
      assert.ok(el.querySelector(`[data-testid="bk-diagram-${id}"]`), id);
    }
    assert.equal(st.pick, 'H');
    assert.equal(st.verdict, 'estable');
    assert.ok(el.querySelector('[data-testid="bk-detail"]').textContent.includes('Planta del amortiguador'));
    assert.deepEqual(env.console.error, []);
    // Sin Chart.js la capa de gráficas avisa una vez y queda inerte: es el único aviso esperado.
    assert.deepEqual(toPlain(env.console.warn).map((w) => w[0]), ['[charts] Chart.js no está cargado: las gráficas quedan inertes.']);
    handle.destroy();
  });

  test('con movimiento reducido empieza en pausa; sin él, en marcha', () => {
    const a = mountLab({ media: { '(prefers-reduced-motion: reduce)': true } });
    a.handle.init();
    assert.equal(a.handle.state().playing, false);
    a.handle.destroy();
    const b = mountLab();
    b.handle.init();
    assert.equal(b.handle.state().playing, true);
    b.handle.destroy();
  });

  test('zoom, capas, freno, elección de bloques y restablecer parámetros', () => {
    const { el, handle, env } = mountLab();
    handle.init();
    const zoom = el.querySelector('[data-testid="bk-zoom"]');
    zoom.click();
    assert.equal(handle.state().zoom, true);
    assert.equal(zoom.getAttribute('aria-pressed'), 'true');
    zoom.click();
    assert.equal(handle.state().zoom, false);

    const brake = el.querySelector('[data-testid="bk-brake"]');
    brake.click();
    assert.equal(handle.state().braking, true);
    brake.click();
    assert.equal(handle.state().braking, false);

    el.querySelector('[data-testid="bk-diagram-GC"]').click();
    assert.equal(handle.state().pick, 'GC');
    assert.ok(el.querySelector('[data-testid="bk-detail"]').textContent.includes('Controlador biomecánico'));
    el.querySelector('[data-testid="bk-diagram-E"]').click();
    assert.equal(handle.state().pick, 'E');
    assert.ok(el.querySelector('[data-testid="bk-detail"]').textContent.includes('Error del lazo'));
    el.querySelector('[data-testid="bk-eq-pick-H"]').click();
    assert.equal(handle.state().pick, 'H');

    const seg = el.querySelector('[data-testid="bk-view-diagram"]');
    seg.click();
    assert.equal(handle.state().view, 'diagram');
    assert.equal(el.querySelector('[data-testid="bk-algebra"]').hidden, true);
    assert.equal(el.querySelector('[data-testid="bk-diagrambox"]').hidden, false);

    const restore = el.querySelector('[data-testid="bk-params-restore"]');
    assert.equal(restore.disabled, true);
    const kInput = el.querySelector('[data-testid="bk-param-k-input"]');
    kInput.value = '20000';
    env.fire(kInput, 'input');
    env.fire(kInput, 'change');
    assert.equal(handle.state().params.k, 20000);
    assert.equal(restore.disabled, false);
    restore.click();
    assert.equal(handle.state().params.k, 12000);
    assert.equal(restore.disabled, true);
    assert.deepEqual(env.console.error, []);
    handle.destroy();
  });

  test('la simulación avanza con el bucle de fotogramas y una caída muestra el aviso con «Reintentar»', () => {
    const { el, handle, env } = mountLab();
    handle.init();
    env.intersect(el.querySelector('[data-testid="bk-viewer"]'), true);
    env.frames(30);
    assert.ok(handle.state().t > 0.3, `t = ${handle.state().t}`);
    // Pendiente extrema y frenada: cae.
    const alpha = el.querySelector('[data-testid="bk-param-alpha-input"]');
    alpha.value = '55';
    env.fire(alpha, 'input');
    env.fire(alpha, 'change');
    el.querySelector('[data-testid="bk-brake"]').click();
    env.frames(240);
    const st = handle.state();
    assert.equal(st.fall, 'otb');
    assert.equal(st.halted, true);
    const fallBox = el.querySelector('[data-testid="bk-fall"]');
    assert.equal(fallBox.hidden, false);
    assert.match(fallBox.textContent, /vuelco hacia delante/i);
    el.querySelector('[data-testid="bk-retry"]').click();
    const after = handle.state();
    assert.equal(after.fall, null);
    assert.equal(after.halted, false);
    assert.equal(after.braking, false, 'Reintentar suelta el freno');
    assert.equal(after.playing, true);
    assert.equal(fallBox.hidden, true);
    assert.deepEqual(env.console.error, []);
    handle.destroy();
    assert.equal(env.pendingTimers(), 0, 'sin temporizadores tras destroy');
  });
});
