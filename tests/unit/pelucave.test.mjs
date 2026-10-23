// tests/unit/pelucave.test.mjs — Propietario: anim.
// Transición Pelucave: parámetros idénticos al JSON exportado del arnés e inmutables; easings iguales a los de
// GSAP 3.12.5 (valores de referencia tomados de la biblioteca); timeline puro (fases, valores de calibración en
// los instantes clave, sobrepaso elástico, inercia, determinismo); matrices; asset generado; y el rig sobre el DOM
// falso (construcción, escrituras mínimas, reproducción con el ticker, movimiento reducido, destrucción).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadDSL, toPlain } from '../helpers/load.mjs';

const FILES = ['js/anim/pelucaveParams.js', 'js/anim/pelucaveAsset.js', 'js/anim/pelucaveTransition.js'];

/** JSON exportado por el arnés (directiva de integración). Debe coincidir carácter a carácter. */
const JSON_CALIBRADO = {
  mandibula: {
    anguloApertura: 32, dx: -6, dy: 10, contraccion: -3, pivoteX: 384, pivoteY: 452,
    separacionInicial: 0, separacionMaxima: 28, anguloSuperior: -4, anguloInferior: 0, pivoteSupX: 426, pivoteSupY: 390,
  },
  cabeza: { anguloAnticipacion: -8, retraccion: 18, anguloApertura: 5, squash: 0.05, pivoteX: 420, pivoteY: 699 },
  inercia: { retrasoOjo: 0.06, retrasoPelo: 0.09, amplitudOjo: 10, amplitudPelo: 14, rotacionPelo: -5 },
  elastico: { amplitud: 1.2, periodo: 0.35 },
  fases: { anticipacion: 0.28, apertura: 0.18, climax: 0.35, recuperacion: 0.9 },
  dummy: { tamano: 56, distancia: 260, elevacion: -40 },
};

const near = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≉ ${b}`.trim());

function setup(opts) {
  return loadDSL(FILES, opts);
}

describe('parámetros calibrados', () => {
  test('coinciden exactamente con el JSON exportado del arnés', () => {
    const { DSL } = setup();
    assert.deepStrictEqual(toPlain(DSL.anim.pelucaveParams), JSON_CALIBRADO);
  });

  test('son inmutables en profundidad', () => {
    const { DSL } = setup();
    const p = DSL.anim.pelucaveParams;
    for (const k of Object.keys(JSON_CALIBRADO)) assert.ok(Object.isFrozen(p[k]), k);
    assert.throws(() => { p.mandibula.anguloApertura = 1; }, TypeError);
    assert.throws(() => { p.fases.nueva = 1; }, TypeError);
  });

  test('la geometría fija del asset está en unidades del viewBox 0 0 762 734', () => {
    const { DSL } = setup();
    const g = toPlain(DSL.anim.pelucaveGeometria);
    assert.deepStrictEqual(g.viewBox, { x: 0, y: 0, width: 762, height: 734 });
    assert.deepStrictEqual(g.lineaDental, { arriba: { x: 418, y: 395 }, abajo: { x: 528, y: 690 } });
    for (const k of ['superior', 'inferior', 'pelo']) {
      const b = g.bboxReposo[k];
      assert.ok(b.width > 0 && b.height > 0 && b.x >= 0 && b.x + b.width <= 762 && b.y + b.height <= 734, k);
    }
  });
});

describe('easings (fórmulas de GSAP 3.12.5)', () => {
  const P = [0, 0.1, 0.25, 0.33, 0.5, 0.66, 0.75, 0.9, 1];
  // Valores devueltos por gsap.parseEase(nombre)(p) en GSAP 3.12.5.
  const REF = {
    'power1.in': [0, 0.010000000000000002, 0.0625, 0.10890000000000001, 0.25, 0.43560000000000004, 0.5625, 0.81, 1],
    'power1.out': [0, 0.18999999999999995, 0.4375, 0.5511000000000001, 0.75, 0.8844000000000001, 0.9375, 0.99, 1],
    'power2.in': [0, 0.0010000000000000002, 0.015625, 0.035937000000000004, 0.125, 0.28749600000000003, 0.421875, 0.7290000000000001, 1],
    'power2.out': [0, 0.2709999999999999, 0.578125, 0.6992370000000001, 0.875, 0.960696, 0.984375, 0.999, 1],
    'power2.inOut': [0, 0.004000000000000001, 0.0625, 0.14374800000000001, 0.5, 0.842784, 0.9375, 0.996, 1],
    'power3.in': [0, 0.00010000000000000002, 0.00390625, 0.011859210000000002, 0.0625, 0.18974736000000003, 0.31640625, 0.6561, 1],
    'elastic.out(1.2, 0.35)': [0, 1.434607475213324, 0.9250160842393841, 0.8812780868336754, 1.0371492119050092, 0.987737868200399, 0.9994206062796441, 1.0011975838961809, 1],
  };

  test('las curvas power coinciden con GSAP', () => {
    const { DSL } = setup();
    const E = DSL.anim.pelucave.easings.byName;
    for (const name of Object.keys(REF).filter((n) => n.startsWith('power'))) {
      P.forEach((p, i) => near(E[name](p), REF[name][i], 1e-12, `${name}(${p})`));
    }
  });

  test('elastic.out(1.2, 0.35) coincide con GSAP, sobrepasa y termina exactamente en 1', () => {
    const { DSL } = setup();
    const e = DSL.anim.pelucave.easings.elasticOut(1.2, 0.35);
    P.forEach((p, i) => near(e(p), REF['elastic.out(1.2, 0.35)'][i], 1e-12, `elastic(${p})`));
    assert.equal(e(1), 1);
    assert.ok(e(0.1) > 1.3, 'primer sobrepaso');
    assert.ok(e(0.25) < 1, 'rebote por debajo');
  });

  test('power2.inOut es simétrica y monótona', () => {
    const { DSL } = setup();
    const e = DSL.anim.pelucave.easings.byName['power2.inOut'];
    for (let i = 1; i <= 20; i++) {
      const p = i / 20;
      assert.ok(e(p) >= e((i - 1) / 20), `monótona en ${p}`);
      near(e(p) + e(1 - p), 1, 1e-12, 'simetría');
    }
  });
});

describe('timeline puro', () => {
  const P = JSON_CALIBRADO;

  test('duración, inicios de fase y phaseAt', () => {
    const { DSL } = setup();
    const tl = DSL.anim.pelucave.createTimeline();
    near(tl.duration, 1.8, 1e-12, 'duración = suma de fases + retraso del pelo');
    const s = toPlain(tl.starts);
    near(s.anticipacion, 0); near(s.apertura, 0.28); near(s.climax, 0.46); near(s.recuperacion, 0.81); near(s.fin, 1.71);
    assert.equal(tl.phaseAt(0), 'anticipacion');
    assert.equal(tl.phaseAt(0.3), 'apertura');
    assert.equal(tl.phaseAt(0.46), 'climax');
    assert.equal(tl.phaseAt(1), 'recuperacion');
    assert.equal(tl.phaseAt(1.75), 'fin');
  });

  test('reposo en t = 0 y en t = duración (el objeto ya ha salido y es invisible)', () => {
    const { DSL } = setup();
    const tl = DSL.anim.pelucave.createTimeline();
    const rest = toPlain(tl.restState());
    assert.deepStrictEqual(toPlain(tl.stateAt(0)), rest);
    const end = toPlain(tl.stateAt(tl.duration));
    for (const k of Object.keys(rest)) {
      if (k.startsWith('dummy')) continue;
      near(end[k], rest[k], 1e-12, k);
    }
    near(end.dummyO, 0, 1e-12, 'dummy invisible');
    near(end.dummyX, P.dummy.distancia * 1.5, 1e-12, 'dummy expulsado');
  });

  test('anticipación: la cabeza gira hacia atrás, se retrae y se aprieta; la mandíbula se contrae', () => {
    const { DSL } = setup();
    const tl = DSL.anim.pelucave.createTimeline();
    const s = tl.stateAt(0.28);
    near(s.cabezaRot, P.cabeza.anguloAnticipacion); near(s.cabezaX, -P.cabeza.retraccion);
    near(s.cabezaSx, 1 + P.cabeza.squash); near(s.cabezaSy, 1 - P.cabeza.squash);
    near(s.mandAngle, P.mandibula.contraccion); near(s.supAngle, -P.mandibula.contraccion * 0.3);
    near(s.separacion, P.mandibula.separacionInicial * 0.5);
    const mid = tl.stateAt(0.14);
    assert.ok(mid.cabezaRot < 0 && mid.cabezaRot > P.cabeza.anguloAnticipacion, 'a mitad de camino');
  });

  test('apertura: valores máximos calibrados y aceleración power3.in', () => {
    const { DSL } = setup();
    const tl = DSL.anim.pelucave.createTimeline();
    const s = tl.stateAt(0.46);
    near(s.mandAngle, P.mandibula.anguloApertura + P.mandibula.anguloInferior);
    near(s.mandX, P.mandibula.dx); near(s.mandY, P.mandibula.dy);
    near(s.supAngle, P.mandibula.anguloSuperior); near(s.separacion, P.mandibula.separacionMaxima);
    near(s.cabezaRot, P.cabeza.anguloApertura); near(s.cabezaX, -P.cabeza.retraccion * 0.3);
    near(s.cabezaSx, 1 - P.cabeza.squash); near(s.cabezaSy, 1 + P.cabeza.squash);
    const half = tl.stateAt(0.37).mandAngle;
    const linear = (P.mandibula.contraccion + s.mandAngle) / 2;
    assert.ok(half < linear - 10, `power3.in: a mitad de fase ${half} ≪ ${linear}`);
  });

  test('clímax: el objeto nace en el centro de la cavidad y sale hacia +X; recoil de la cabeza', () => {
    const { DSL } = setup();
    const tl = DSL.anim.pelucave.createTimeline();
    const antes = tl.stateAt(0.459);
    near(antes.dummyO, 0); near(antes.dummyS, 0);
    const nace = tl.stateAt(0.46);
    near(nace.dummyO, 1); near(nace.dummyS, 0.15); near(nace.dummyX, 0); near(nace.dummyY, 0);
    const fin = tl.stateAt(0.81);
    near(fin.dummyS, 1); near(fin.dummyX, P.dummy.distancia); near(fin.dummyY, P.dummy.elevacion);
    const recoil = tl.stateAt(0.635);
    near(recoil.cabezaX, -P.cabeza.retraccion * 0.6); near(recoil.cabezaRot, P.cabeza.anguloApertura * 0.6);
    assert.ok(tl.stateAt(0.6).dummyX > tl.stateAt(0.5).dummyX, 'avanza hacia +X');
  });

  test('recuperación: sobrepaso elástico (cruza por debajo de 0) y vuelta exacta al reposo', () => {
    const { DSL } = setup();
    const tl = DSL.anim.pelucave.createTimeline();
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0.81; t <= 1.71; t += 0.005) {
      const a = tl.stateAt(t).mandAngle;
      min = Math.min(min, a);
      max = Math.max(max, a);
    }
    assert.ok(min < -1, `cruza por debajo de 0 (mín ${min})`);
    assert.ok(max <= P.mandibula.anguloApertura + 1e-9, 'no supera la apertura máxima');
    near(tl.stateAt(1.71).mandAngle, 0, 1e-12);
    near(tl.stateAt(1.71).cabezaRot, 0, 1e-12);
  });

  test('inercia secundaria: ojo y pelo reaccionan con retraso y terminan después', () => {
    const { DSL } = setup();
    const tl = DSL.anim.pelucave.createTimeline();
    const t = tl.stateAt(0.03);
    assert.notEqual(t.mandAngle, 0, 'la mandíbula ya se mueve');
    assert.equal(t.ojoX, 0, 'el ojo aún no (retraso 0.06)');
    assert.equal(t.peloX, 0, 'el pelo aún no (retraso 0.09)');
    near(tl.stateAt(1.77).ojoX, 0, 1e-12, 'el ojo termina en 1.77');
    near(tl.stateAt(1.8).peloX, 0, 1e-12, 'el pelo termina en 1.80');
    assert.ok(Math.abs(tl.stateAt(1.0).peloRot) > 0, 'el pelo sigue oscilando en la recuperación');
  });

  test('determinismo: scrub adelante y atrás, acotado a [0, duración] y reutilizando el objeto', () => {
    const { DSL } = setup();
    const tl = DSL.anim.pelucave.createTimeline();
    const a = toPlain(tl.stateAt(0.5));
    tl.stateAt(1.2);
    tl.stateAt(0.1);
    assert.deepStrictEqual(toPlain(tl.stateAt(0.5)), a);
    assert.deepStrictEqual(toPlain(tl.stateAt(-1)), toPlain(tl.stateAt(0)));
    assert.deepStrictEqual(toPlain(tl.stateAt(99)), toPlain(tl.stateAt(tl.duration)));
    assert.deepStrictEqual(toPlain(tl.stateAt(NaN)), toPlain(tl.stateAt(0)));
    const into = {};
    assert.equal(tl.stateAt(0.7, into), into);
  });

  test('cada segmento parte del valor final del anterior en su canal (sin saltos)', () => {
    const { DSL } = setup();
    const tl = DSL.anim.pelucave.createTimeline();
    const eps = 1e-4;
    for (let t = eps; t < 1.8; t += 0.01) {
      const a = tl.stateAt(t - eps);
      const b = tl.stateAt(t + eps);
      for (const k of Object.keys(a)) {
        if (k.startsWith('dummy') && Math.abs(t - 0.46) < 0.02) continue; // el único salto: el set() del clímax
        assert.ok(Math.abs(b[k] - a[k]) < 3, `${k} continuo en t=${t.toFixed(2)}`);
      }
    }
  });

  test('sin argumento usa los parámetros calibrados; rechaza parámetros incompletos', () => {
    const { DSL } = setup();
    const tl = DSL.anim.pelucave.createTimeline(null);
    assert.equal(tl.params, DSL.anim.pelucaveParams);
    assert.throws(() => DSL.anim.pelucave.createTimeline({ mandibula: {} }), /Faltan secciones en los parámetros: cabeza, inercia/);
  });
});

describe('matrices', () => {
  test('rotación horaria con Y hacia abajo y pivote fijo', () => {
    const { DSL } = setup();
    const M = DSL.anim.pelucave.matrix;
    const p = M.apply(M.rotate(90), { x: 1, y: 0 });
    near(p.x, 0, 1e-12); near(p.y, 1, 1e-12);
    const pivot = { x: 384, y: 452 };
    const q = M.apply(M.rotateAbout(pivot, 37), pivot);
    near(q.x, pivot.x, 1e-9); near(q.y, pivot.y, 1e-9);
  });

  test('multiply aplica B primero; compose encadena; headMatrix en reposo es la identidad', () => {
    const { DSL } = setup();
    const M = DSL.anim.pelucave.matrix;
    const p = M.apply(M.multiply(M.translate(10, 0), M.scale(2)), { x: 1, y: 0 });
    near(p.x, 12); near(p.y, 0);
    const h = M.headMatrix({ pivot: { x: 420, y: 699 }, angle: 0, dx: 0, dy: 0, sx: 1, sy: 1 });
    assert.equal(M.toSvgString(h), 'matrix(1,0,0,1,0,0)');
    assert.equal(M.toSvgString(M.compose()), 'matrix(1,0,0,1,0,0)');
  });

  test('toSvgString redondea a 4 decimales solo al serializar y nunca escribe −0', () => {
    const { DSL } = setup();
    const M = DSL.anim.pelucave.matrix;
    assert.equal(M.toSvgString(M.translate(-0.00001, 1.23456789)), 'matrix(1,0,0,1,0,1.2346)');
    assert.equal(M.toSvgString(M.rotate(-0.0001)), 'matrix(1,0,0,1,0,0)');
  });

  test('normal de la línea dental: unitaria, perpendicular y hacia abajo-izquierda', () => {
    const { DSL } = setup();
    const G = DSL.anim.pelucave.geometry;
    const g = DSL.anim.pelucaveGeometria.lineaDental;
    const n = G.mouthNormal(g.arriba, g.abajo);
    near(Math.hypot(n.x, n.y), 1, 1e-12);
    assert.ok(n.x < -0.9 && n.y > 0.3, JSON.stringify(n));
    near(n.x * (g.abajo.x - g.arriba.x) + n.y * (g.abajo.y - g.arriba.y), 0, 1e-9);
  });
});

describe('asset generado (js/anim/pelucaveAsset.js)', () => {
  test('reparto de las 15 formas en cinco capas y silueta sólida de un solo subtrazo', () => {
    const { DSL } = setup();
    const A = DSL.anim.pelucaveAsset;
    assert.deepStrictEqual(toPlain(A.viewBox), { x: 0, y: 0, width: 762, height: 734 });
    const counts = Object.fromEntries(Object.keys(A.paths).map((k) => [k, A.paths[k].length]));
    assert.deepStrictEqual(counts, { craneo: 1, pelo: 2, ojo: 2, mandibulaSuperior: 5, mandibulaInferior: 5 });
    for (const k of Object.keys(A.paths)) for (const d of A.paths[k]) assert.match(d, /^M[\d.\s-]/, `${k}: d empieza por M`);
    assert.ok(A.craneo === undefined && A.paths.craneo[0].startsWith(A.craneoSolido), 'la silueta sólida es el primer subtrazo');
    assert.match(A.craneoSolido, /Z$/);
    assert.ok(A.craneoSolido.length < A.paths.craneo[0].length, 'sin los agujeros');
    assert.ok((A.paths.craneo[0].match(/Z/g) || []).length === 13, 'contorno + 12 agujeros');
    assert.ok(Object.isFrozen(A) && Object.isFrozen(A.paths) && Object.isFrozen(A.paths.ojo));
  });
});

describe('rig sobre el DOM falso', () => {
  function mount(opts, rigOpts) {
    const ctx = setup(opts);
    const container = ctx.document.createElement('div');
    ctx.document.body.appendChild(container);
    const rig = ctx.DSL.anim.pelucave.createRig(container, rigOpts);
    return { ...ctx, container, rig };
  }

  test('construye la jerarquía de capas con ids únicos por instancia y clip en la mandíbula', () => {
    const { DSL, container, rig, env } = mount();
    assert.equal(container.children.length, 1);
    assert.equal(rig.el.getAttribute('class'), 'pv-root');
    assert.equal(rig.el.getAttribute('viewBox'), '0 0 762 734');
    assert.equal(rig.el.getAttribute('aria-hidden'), 'true');
    const n = rig.nodes;
    assert.equal(n.cabeza.getAttribute('class'), 'pv-cabeza');
    assert.equal(n.mandSup.getAttribute('class'), 'pv-pieza pv-mandibula-superior');
    assert.equal(n.mandInf.getAttribute('class'), 'pv-pieza pv-mandibula-inferior');
    assert.match(n.mandibula.getAttribute('clip-path'), /^url\(#pv-\d+-clip-craneo\)$/);
    assert.equal(n.cabeza.children.length, 5, 'craneo, cuencas, pelo, ojo, mandibula');
    assert.equal(n.cuencas.children.length, 3, 'rellenos de ojo y ambas arcadas');
    const other = DSL.anim.pelucave.createRig(container);
    assert.notEqual(other.nodes.mandibula.getAttribute('clip-path'), n.mandibula.getAttribute('clip-path'));
    assert.deepStrictEqual(env.console.error, []);
  });

  test('en reposo todas las matrices son la identidad y el objeto es invisible', () => {
    const { rig } = mount();
    for (const k of ['cabeza', 'mandSup', 'mandInf', 'ojo', 'pelo']) {
      assert.equal(rig.nodes[k].getAttribute('transform'), 'matrix(1,0,0,1,0,0)', k);
    }
    assert.equal(rig.nodes.dummy.getAttribute('opacity'), '0.000');
    const p = rig.ejectionPoint();
    near(p.x, (416.483 + 123.839 / 2 + 366.248 + 166.752 / 2) / 2, 1e-9, 'centro de la cavidad x');
    near(p.y, (353 + 332 / 2 + 376 + 316.404 / 2) / 2, 1e-9, 'centro de la cavidad y');
  });

  test('setTime escribe transform y opacidad; repetir el mismo instante no escribe nada', () => {
    const { rig } = mount();
    rig.setTime(0.46);
    const inf = rig.nodes.mandInf.getAttribute('transform');
    assert.notEqual(inf, 'matrix(1,0,0,1,0,0)');
    // cabeza en apertura: +5° (b > 0) con stretch (sx 0.95, sy 1.05) sobre el cuello
    assert.match(rig.nodes.cabeza.getAttribute('transform'), /^matrix\(0\.94\d+,0\.08\d+,-0\.09\d+,1\.04\d+,/);
    assert.equal(rig.nodes.dummy.getAttribute('opacity'), '1.000');
    let writes = 0;
    for (const node of Object.values(rig.nodes)) {
      const orig = node.setAttribute.bind(node);
      node.setAttribute = (a, v) => { writes += 1; orig(a, v); };
    }
    rig.setTime(0.46);
    assert.equal(writes, 0, 'sin escrituras redundantes');
    // En el clímax la mandíbula está quieta (hasta la recuperación): solo cabeza, ojo, pelo y objeto cambian.
    rig.setTime(0.47);
    assert.equal(writes, 4, 'cabeza, ojo, pelo y transform del objeto');
    // En plena apertura se mueven las cinco capas más el objeto (que viaja con la cavidad); su opacidad no.
    rig.setTime(0.30);
    writes = 0;
    rig.setTime(0.31);
    assert.equal(writes, 6, 'una escritura por nodo que cambia');
  });

  test('el pivote del cóndilo no resbala: la matriz de la arcada inferior lo deja fijo salvo dx/dy/separación', () => {
    const { DSL, rig } = mount();
    const M = DSL.anim.pelucave.matrix;
    const G = DSL.anim.pelucave.geometry;
    const P = DSL.anim.pelucaveParams;
    rig.setTime(0.46);
    const s = rig.state();
    const n = G.mouthNormal(DSL.anim.pelucaveGeometria.lineaDental.arriba, DSL.anim.pelucaveGeometria.lineaDental.abajo);
    const m = rig.nodes.mandInf.getAttribute('transform').match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
    const mat = { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] };
    const pivot = { x: P.mandibula.pivoteX, y: P.mandibula.pivoteY };
    // La matriz escrita lleva 4 decimales: sobre coordenadas de ~450 u el error de redondeo es < 0.1 u (subpíxel).
    const moved = M.apply(mat, pivot);
    near(moved.x, pivot.x + s.mandX + n.x * s.separacion, 0.1);
    near(moved.y, pivot.y + s.mandY + n.y * s.separacion, 0.1);
  });

  test('scrub determinista: el mismo instante produce los mismos atributos', () => {
    const { rig } = mount();
    const snap = () => Object.fromEntries(Object.entries(rig.nodes).map(([k, n]) => [k, [n.getAttribute('transform'), n.getAttribute('opacity')]]));
    rig.setTime(0.9);
    const a = snap();
    rig.setTime(1.4);
    rig.setTime(0.2);
    rig.setTime(0.9);
    assert.deepStrictEqual(snap(), a);
  });

  test('play avanza con el ticker compartido, completa una vez y se puede interrumpir', () => {
    const { rig, env } = mount();
    let done = 0;
    rig.play(() => { done += 1; });
    assert.equal(rig.isPlaying(), true);
    env.frames(10);
    near(rig.time(), 9 * 0.016, 1e-9, 'primer frame dt = 0, después 16 ms');
    assert.equal(rig.phaseAt(), 'anticipacion');
    env.frames(130);
    assert.equal(done, 1);
    assert.equal(rig.isPlaying(), false);
    near(rig.time(), rig.duration, 1e-12);
    env.frames(5);
    assert.equal(done, 1, 'no vuelve a completar');

    rig.play({ onComplete: () => { done += 10; } });
    env.frames(20);
    rig.stop();
    assert.equal(rig.isPlaying(), false);
    env.frames(200);
    assert.equal(done, 1, 'tras stop no se completa');
    rig.reset();
    assert.equal(rig.time(), 0);
    assert.deepStrictEqual(env.console.error, []);
  });

  test('con movimiento reducido play() salta al final y completa en el acto', () => {
    const { rig, env } = mount();
    env.setMedia('(prefers-reduced-motion: reduce)', true);
    let done = 0;
    rig.play(() => { done += 1; });
    assert.equal(done, 1);
    assert.equal(rig.isPlaying(), false);
    near(rig.time(), rig.duration, 1e-12);
    assert.equal(rig.nodes.dummy.getAttribute('opacity'), '0.000');
  });

  test('opciones: etiqueta accesible, contenido propio del objeto y destrucción', () => {
    const { DSL, container, rig, env } = mount(undefined, { label: 'Logo Pelucave' });
    assert.equal(rig.el.getAttribute('role'), 'img');
    assert.equal(rig.el.getAttribute('aria-label'), 'Logo Pelucave');
    assert.equal(rig.el.hasAttribute('aria-hidden'), false);
    const custom = DSL.util.svg('circle', { r: 10 });
    const other = DSL.anim.pelucave.createRig(container, { dummyContent: custom });
    assert.equal(other.nodes.dummy.firstChild, custom);
    rig.destroy();
    other.destroy();
    assert.equal(container.children.length, 0);
    rig.destroy();
    assert.deepStrictEqual(env.console.error, []);
  });

  test('errores de uso en español', () => {
    const { DSL } = setup();
    assert.throws(() => DSL.anim.pelucave.createRig(null), /falta el contenedor/);
  });
});
