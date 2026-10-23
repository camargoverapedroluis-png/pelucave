/*
 * js/sections/bikelab.js — Propietario: bikelab.
 * Laboratorio avanzado de la galería (#galeria, segundo montaje): dinámica de un marco de doble suspensión,
 * vectores de fuerza y control en lazo cerrado → DSL.sections.bikeLab = { mount(el) → handle, helpers,
 * BikeSuspensionLab }.
 *
 * Todo el laboratorio vive en este archivo y en css/sections/bikelab.css (prefijo bk-). No toca ningún otro
 * módulo: usa DSL.util (DOM, bucle rAF único, canvas, azar con semilla), DSL.ui (controles), DSL.viz.charts
 * (gráficas en tiempo real), DSL.core.numeric / DSL.core.tf (polinomios, polos y ceros, estabilidad) y
 * DSL.core.latex (KaTeX). API: docs/api/bikelab.md.
 *
 * Modelo (unidades del SI; todo determinista, sin Math.random):
 *   - Estática del vuelco sobre la pendiente α con frenada a_b: ángulo del resultante
 *     θ_est = atan(tan α + a_b/(g cos α)); umbrales θ_cf = atan(a_ef/h) (vuelco frontal, «over the bars») y
 *     θ_cr = −atan(b_ef/h) (vuelco trasero), con a_ef y b_ef las distancias del centro de masas efectivo
 *     (deslizador x_cg + inclinación del torso x_t) a los contactos delantero y trasero.
 *   - Lazo de control exactamente con la topología del diagrama de bloques:
 *       E = C_set − C → G_C (PID) → M → G_V (músculo, 1.er orden) → Ṁ_ag → G_2 (marco, L_p/(J s² + b s)) ─┐
 *       Q (baches + transferencia de peso por pendiente/frenada) → G_1 (neumático, K_1/(τ_w s + 1)) ───────┼─(+)→ T_reac → H → C
 *     con H(s) = 1/(m_eq s² + c s + k) la suspensión trasera y C el desplazamiento de la masa suspendida.
 *   - La horquilla delantera es un segundo orden propio (solo para la escena y el cabeceo φ = atan((C − C_f)/L)).
 *   - Ángulo de estabilidad θ = θ_est + φ. Si θ > θ_cf o θ < θ_cr durante 50 ms, el ciclista cae.
 *   - La inclinación del torso satura en ±0.35 m (con anti-windup del integrador): la T(s) lineal no lo ve.
 */
(function (DSL) {
  'use strict';

  var util = DSL.util;
  var h = util.h;
  var svg = util.svg;

  /* ------------------------------------------------------------------ constantes */

  var G0 = 9.81;
  var DEG = Math.PI / 180;
  var NBSP = String.fromCharCode(0xa0);

  /** Geometría de la bicicleta (m): ejes, pivote, amortiguador y ciclista. */
  var GEO = Object.freeze({
    L: 1.16,            // distancia entre ejes
    R: 0.37,            // radio de rueda
    hCg: 1.0,           // altura del centro de masas combinado sobre el suelo
    rContact: 0.17,     // longitud de contacto del neumático (τ_w = r_c / v)
    leanMax: 0.35,      // inclinación máxima del torso (saturación del actuador)
    pivot: [0.47, 0.12],
    shockTop: [0.72, 0.30],      // anclaje del amortiguador en el tubo diagonal del triángulo principal
    rockerArm: [-0.02, 0.26],    // balancín del basculante donde empuja el amortiguador (respecto al pivote, sin rotar)
    bb: [0.44, -0.04],
    seatTop: [0.33, 0.56],
    headTop: [0.98, 0.62],
    headBottom: [1.04, 0.44],
    barEnd: [1.06, 0.70]
  });

  var FALL_HOLD_S = 0.05;        // el umbral debe superarse durante 50 ms para contar la caída
  var FALL_ANIM_S = 1.4;         // duración de la animación de caída (s reales)
  var SUBSTEP_S = 1 / 480;       // paso máximo del integrador RK4
  var READOUT_MS = 100;          // lecturas y valores del diagrama: 10 veces por segundo
  var TF_REFRESH_MS = 160;       // fórmulas con KaTeX durante un arrastre
  var TABLE_REFRESH_MS = 2000;   // «Ver datos» abierto durante la reproducción
  var CHART_WINDOW_S = 10;
  var CAMERA_TAU_S = 0.22;       // suavizado de la cámara (zoom)
  var FALL_ANNOUNCE = {
    otb: 'Pérdida de estabilidad: vuelco hacia delante (over the bars).',
    rear: 'Pérdida de estabilidad: vuelco hacia atrás.'
  };

  /* ------------------------------------------------------------------ parámetros */

  /** Grupos de deslizadores del panel. `tex` es el símbolo con KaTeX; `factor` convierte la unidad mostrada a SI. */
  var GROUPS = [
    {
      id: 'rider', title: 'Ciclista y movimiento', icon: 'activity',
      params: [
        { key: 'v', label: 'Velocidad de descenso', tex: 'v', sym: 'v', unit: 'km/h', min: 5, max: 70, step: 1, def: 25, factor: 1 / 3.6,
          tip: 'Velocidad de consigna. El ciclista vuelve a ella al soltar el freno; con τ_w = r_c/v, a más velocidad el neumático filtra menos los baches.' },
        { key: 'mp', label: 'Masa de la persona', tex: 'm_p', sym: 'mₚ', unit: 'kg', min: 40, max: 120, step: 1, def: 75, factor: 1,
          tip: 'Entra en el peso W = (m_p + m_b)·g, en la masa suspendida m_eq y en la fuerza de inercia al frenar.' },
        { key: 'mb', label: 'Masa del marco y la bicicleta', tex: 'm_b', sym: 'mb', unit: 'kg', min: 8, max: 25, step: 0.5, def: 14, factor: 1,
          tip: 'Masa de la bicicleta completa.' },
        { key: 'xcg', label: 'Posición del centro de masas', tex: 'x_{cg}', sym: 'xcg', unit: 'cm', min: -30, max: 30, step: 1, def: 0, factor: 0.01,
          tip: 'Negativo: el cuerpo atrás (más margen frente al vuelco frontal). Positivo: hacia delante. El controlador suma su propia inclinación del torso.' },
        { key: 'ab', label: 'Frenada (deceleración)', tex: 'a_b', sym: 'ab', unit: 'm/s²', min: 0, max: 8, step: 0.5, def: 3, factor: 1,
          tip: 'Deceleración que aplica el freno mientras «Frenar» está activo. Carga la rueda delantera y tumba el resultante hacia delante.' }
      ]
    },
    {
      id: 'terrain', title: 'Terreno (perturbaciones)', icon: 'layers',
      params: [
        { key: 'alpha', label: 'Inclinación de la cresta', tex: '\\alpha', sym: 'α', unit: '°', min: 0, max: 60, step: 1, def: 10, factor: DEG,
          tip: 'Pendiente del descenso. Sin frenar, el resultante forma el mismo ángulo α con la normal.' },
        { key: 'wb', label: 'Frecuencia de baches y rocas', tex: '\\omega_b', sym: 'ωb', unit: 'Hz', min: 0.2, max: 4, step: 0.1, def: 1.2, factor: 1,
          tip: 'Baches por segundo a la velocidad de consigna. La separación real varía ±35 % de forma determinista (misma semilla, mismo terreno).' },
        { key: 'Ab', label: 'Altura de los baches', tex: 'A_b', sym: 'Ab', unit: 'cm', min: 0, max: 20, step: 0.5, def: 4, factor: 0.01,
          tip: 'Amplitud máxima del perfil z_r. Cada bache mide entre el 55 % y el 100 % de esta altura.' }
      ]
    },
    {
      id: 'shock', title: 'Suspensión (marco y amortiguador)', icon: 'sliders-horizontal',
      params: [
        { key: 'k', label: 'Rigidez del resorte', tex: 'k', sym: 'k', unit: 'N/m', min: 3000, max: 40000, step: 500, def: 12000, factor: 1,
          tip: 'Constante del resorte helicoidal medida en la rueda. Fija ω_n = √(k/m_eq) y la ganancia estática 1/k de H(s).' },
        { key: 'c', label: 'Amortiguamiento viscoso', tex: 'c', sym: 'c', unit: 'N·s/m', min: 100, max: 5000, step: 50, def: 1200, factor: 1,
          tip: 'Coeficiente del amortiguador. ζ = c / (2·√(k·m_eq)): por debajo de 1 la suspensión rebota.' }
      ]
    },
    {
      id: 'control', title: 'Control biomecánico del ciclista', icon: 'git-branch',
      params: [
        { key: 'Kp', label: 'Ganancia proporcional', tex: 'K_p', sym: 'Kp', unit: '', min: 0, max: 20, step: 0.1, def: 6, factor: 1,
          tip: 'Cuánto torso mueve el ciclista por cada metro de error. Alta: respuesta viva pero más sobrepaso.' },
        { key: 'Kd', label: 'Ganancia derivativa', tex: 'K_d', sym: 'Kd', unit: '', min: 0, max: 6, step: 0.1, def: 1.5, factor: 1,
          tip: 'Anticipa el movimiento del chasis (reacciona a su velocidad). Amortigua el lazo.' },
        { key: 'Ki', label: 'Ganancia integral', tex: 'K_i', sym: 'Ki', unit: '', min: 0, max: 6, step: 0.1, def: 0.8, factor: 1,
          tip: 'Elimina el error permanente, a costa de un modo lento. Muy alta: oscilación de baja frecuencia.' },
        { key: 'thetaSet', label: 'Consigna de inclinación del chasis', tex: '\\theta^{\\mathrm{set}}', sym: 'θset', unit: '°', min: -6, max: 6, step: 0.5, def: 0, factor: DEG,
          tip: 'Referencia C_set = L·tan θ_set del lazo. Cámbiela para ver la respuesta T(s) = C/C_set.' }
      ]
    }
  ];

  var PARAM_BY_KEY = {};
  GROUPS.forEach(function (g) { g.params.forEach(function (p) { PARAM_BY_KEY[p.key] = p; }); });

  function defaults() {
    var o = {};
    GROUPS.forEach(function (g) { g.params.forEach(function (p) { o[p.key] = p.def * p.factor; }); });
    return o;
  }

  /** Parámetros fijos del modelo que no van en deslizadores. */
  var FIXED = Object.freeze({
    Kv: 1,        // ganancia del actuador muscular (m/s por unidad de mando)
    tauM: 0.2,    // constante de tiempo muscular (s)
    Lp: 4000,     // ganancia de palanca del pivote (N por metro de desplazamiento del torso)
    J: 1,         // inercia equivalente del marco en el pivote (kg)
    bP: 2,        // fricción viscosa del pivote (N·s/m)
    mEqFrac: 0.6, // fracción de la masa total que carga la suspensión trasera
    frontMass: 0.4, frontK: 0.9, frontC: 0.9,   // horquilla respecto a la trasera
    vTau: 1.2     // el ciclista recupera la velocidad de consigna en ~1.2 s
  });

  /* ------------------------------------------------------------------ utilidades puras */

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function round(x, d) { var f = Math.pow(10, d || 0); return Math.round(x * f) / f; }
  function fmt(x, digits) { return util.formatNumber(x, digits === undefined ? 3 : digits); }
  function withUnit(x, digits, unit) { return fmt(x, digits) + (unit ? (unit === '°' ? '' : NBSP) + unit : ''); }

  /** Coeficientes del modelo a partir de los parámetros SI. */
  function coefficients(p) {
    var m = p.mp + p.mb;
    var mEq = FIXED.mEqFrac * m;
    var v = Math.max(0.5, p.v);
    return {
      m: m, W: m * G0, mEq: mEq, k: p.k, c: p.c,
      wn: Math.sqrt(p.k / mEq), zeta: p.c / (2 * Math.sqrt(p.k * mEq)),
      Kp: p.Kp, Kd: p.Kd, Ki: p.Ki,
      Kv: FIXED.Kv, tauM: FIXED.tauM,
      Lp: FIXED.Lp, J: FIXED.J, bP: FIXED.bP,
      K1: p.k, tauW: GEO.rContact / v,
      mf: FIXED.frontMass * mEq, kf: FIXED.frontK * p.k, cf: FIXED.frontC * p.c,
      Cset: GEO.L * Math.tan(p.thetaSet)
    };
  }

  /**
   * Estática del vuelco: ángulo del resultante, umbrales y normales cuasiestáticas.
   * alpha (rad), ab (m/s², deceleración efectiva), xcgEff (m, positivo hacia delante), m (kg).
   */
  function statics(alpha, ab, xcgEff, m) {
    var W = m * G0;
    var ca = Math.cos(alpha);
    var sa = Math.sin(alpha);
    var aEff = GEO.L / 2 - xcgEff;           // CG → contacto delantero
    var bEff = GEO.L / 2 + xcgEff;           // CG → contacto trasero
    var push = W * sa + m * ab;              // fuerzas que tumban hacia delante, aplicadas en el CG
    var thetaStatic = Math.atan(Math.tan(alpha) + ab / (G0 * ca));
    var Nr = (W * ca * aEff - push * GEO.hCg) / GEO.L;
    var Nf = W * ca - Nr;
    return {
      W: W, push: push, aEff: aEff, bEff: bEff,
      thetaStatic: thetaStatic,
      thetaCritFront: Math.atan(aEff / GEO.hCg),
      thetaCritRear: -Math.atan(bEff / GEO.hCg),
      Nr: Nr, Nf: Nf,
      tipMoment: push * GEO.hCg - W * ca * aEff   // > 0: vuelca hacia delante (= −Nr·L)
    };
  }

  /** Transferencia de peso por pendiente y frenada, como desplazamiento equivalente del resorte trasero (m). */
  function slopeDisplacement(c, alpha, ab) {
    return (c.W * Math.sin(alpha) + c.m * ab) * GEO.hCg / (GEO.L * c.k);
  }

  /* ------------------------------------------------------------------ funciones de transferencia */

  function numeric() { return DSL.core && DSL.core.numeric; }
  function tfLib() { return DSL.core && DSL.core.tf; }

  /** Polinomios (potencias descendentes) de cada bloque y de las funciones globales. */
  function transferFunctions(c) {
    var P = numeric().poly;
    var GC = { num: [c.Kd, c.Kp, c.Ki], den: [1, 0] };
    var GV = { num: [c.Kv], den: [c.tauM, 1] };
    var G2 = { num: [c.Lp], den: [c.J, c.bP, 0] };
    var G1 = { num: [c.K1], den: [c.tauW, 1] };
    var H = { num: [1], den: [c.mEq, c.c, c.k] };
    var nL = P.mul(P.mul(P.mul(GC.num, GV.num), G2.num), H.num);
    var dL = P.mul(P.mul(P.mul(GC.den, GV.den), G2.den), H.den);
    var dT = P.add(dL, nL);
    var nQ = P.mul(G1.num, P.mul(P.mul(GC.den, GV.den), G2.den));
    var dQ = P.mul(G1.den, dT);
    return {
      GC: GC, GV: GV, G2: G2, G1: G1, H: H,
      L: { num: nL, den: dL },
      T: { num: nL, den: dT },
      TQ: { num: nQ, den: dQ }
    };
  }

  /** Raíces reales o complejas de un polinomio (vacío para constantes o polinomio nulo). */
  function rootsOf(coeffs) {
    var N = numeric();
    var P = N.poly;
    var t = P.trim(coeffs, 1e-14);
    if (t.length < 2 || P.isZero(t)) return [];
    try { return N.sortRoots(N.polyRoots(t)); } catch (err) { return []; }
  }

  /** Polos, ceros y veredicto de una función racional (TransferFunction cuando es propia). */
  function analyze(tf) {
    var out = { num: tf.num, den: tf.den, poles: rootsOf(tf.den), zeros: rootsOf(tf.num), verdict: null, reason: '', dc: null };
    var lib = tfLib();
    var N = numeric();
    var properOk = N.poly.degree(N.poly.trim(tf.num, 1e-14)) <= N.poly.degree(N.poly.trim(tf.den, 1e-14));
    if (lib && properOk && N.poly.degree(tf.den) >= 1) {
      try {
        var T = new lib.TransferFunction(tf.num, tf.den);
        var info = T.stabilityInfo();
        out.verdict = info.verdict;
        out.reason = info.reason || '';
        out.dc = T.dcGain();
        out.poles = T.poles();
        out.zeros = T.zeros();
      } catch (err) { /* se queda con las raíces calculadas */ }
    }
    return out;
  }

  /* ------------------------------------------------------------------ TeX */

  function latexLib() { return DSL.core && DSL.core.latex; }
  function texNum(x, d) { var L = latexLib(); return L ? L.num(x, d === undefined ? 4 : d) : String(round(x, 4)); }
  function texPoly(coeffs, d) { var L = latexLib(); return L ? L.poly(coeffs, 's', { digits: d === undefined ? 4 : d }) : coeffs.join(', '); }
  function texFrac(a, b) { return '\\frac{' + a + '}{' + b + '}'; }

  function texRoots(list, d) {
    var L = latexLib();
    if (!list.length) return '\\text{ninguno}';
    var seen = [];
    var parts = [];
    for (var i = 0; i < list.length; i++) {
      var z = list[i];
      if (z.im < -1e-12) continue;                       // cada par conjugado una vez
      var key = round(z.re, 6) + ':' + round(Math.abs(z.im), 6);
      if (seen.indexOf(key) >= 0) continue;
      seen.push(key);
      var count = 0;
      for (var j = 0; j < list.length; j++) if (round(list[j].re, 6) + ':' + round(Math.abs(list[j].im), 6) === key) count++;
      var s = Math.abs(z.im) > 1e-9 ? (L ? L.complexPair(z, d) : z.re + ' ± ' + Math.abs(z.im) + 'j') : texNum(z.re, d);
      if (Math.abs(z.im) > 1e-9 && count > 2) s += '\\ (\\times ' + (count / 2) + ')';
      else if (Math.abs(z.im) <= 1e-9 && count > 1) s += '\\ (\\times ' + count + ')';
      parts.push(s);
    }
    return parts.join(',\\;');
  }

  /** Fórmulas de cada bloque (simbólica y con los números actuales). */
  var BLOCKS = [
    {
      id: 'GC', name: 'G_C(s)', title: 'Controlador biomecánico del ciclista',
      sym: 'G_C(s) = K_p + K_d s + \\frac{K_i}{s}',
      role: 'Lee el error E(s) entre la inclinación deseada del chasis y la real y decide cuánto mover el torso: la parte proporcional responde al error, la derivativa a la velocidad del chasis (anticipa el cabeceo) y la integral corrige el error que queda en una pendiente mantenida.',
      numeric: function (c) {
        return 'G_C(s) = ' + texNum(c.Kp) + ' + ' + texNum(c.Kd) + '\\, s + ' + texFrac(texNum(c.Ki), 's') + ' = ' + texFrac(texPoly([c.Kd, c.Kp, c.Ki]), 's');
      },
      tf: function (t) { return t.GC; },
      notes: function (c) { return ['Polo en el origen (acción integral). Ceros: raíces de ' + 'K_d s² + K_p s + K_i.', 'Entrada E(s) en metros de error del chasis; salida M(s), el mando muscular.']; }
    },
    {
      id: 'GV', name: 'G_V(s)', title: 'Actuador de desplazamiento corporal',
      sym: 'G_V(s) = \\frac{K_v}{\\tau_m s + 1}',
      role: 'Los músculos no mueven el torso al instante: la orden M(s) se convierte en velocidad del torso Ṁ_ag(s) con un retardo de primer orden (τ_m ≈ 0.2 s). Es la parte «lenta» del ciclista: cuanto mayor es τ_m, más tarde llega la corrección a un bache o a una frenada.',
      numeric: function (c) { return 'G_V(s) = ' + texFrac(texNum(c.Kv), texNum(c.tauM) + '\\, s + 1'); },
      tf: function (t) { return t.GV; },
      notes: function (c) { return ['Polo en s = −1/τ_m = ' + fmt(-1 / c.tauM, 3) + ' rad/s.', 'Salida: velocidad del torso en m/s por unidad de mando. La posición del torso satura en ±' + fmt(GEO.leanMax * 100, 2) + ' cm (no lineal, fuera de la T(s)).']; }
    },
    {
      id: 'G2', name: 'G_2(s)', title: 'Dinámica estructural del marco y el basculante',
      sym: 'G_2(s) = \\frac{L_{\\mathrm{pivote}}}{J_{\\mathrm{marco}} s^2 + b_{\\mathrm{pivote}} s}',
      role: 'Transmite el movimiento del torso al chasis a través del pivote: la velocidad Ṁ_ag(s) se integra en posición (el 1/s) y el marco, con su inercia J y la fricción b del pivote, la convierte en una fuerza sobre la suspensión trasera. Es el par que el ciclista aplica al marco.',
      numeric: function (c) { return 'G_2(s) = ' + texFrac(texNum(c.Lp), texPoly([c.J, c.bP, 0])); },
      tf: function (t) { return t.G2; },
      notes: function (c) { return ['Polos en s = 0 (integrador) y s = −b/J = ' + fmt(-c.bP / c.J, 3) + ' rad/s.', 'L_pivote = ' + fmt(c.Lp, 4) + ' N/m: fuerza por metro de desplazamiento del torso.']; }
    },
    {
      id: 'G1', name: 'G_1(s)', title: 'Filtro de perturbación: baches y pendiente',
      sym: 'G_1(s) = \\frac{K_1}{\\tau_w s + 1},\\quad K_1 = k,\\; \\tau_w = \\frac{r_c}{v}',
      role: 'El neumático y su huella de contacto convierten el perfil del terreno Q(s) (altura de los baches más la transferencia de peso por pendiente y frenada) en una fuerza sobre la suspensión. Filtra los bordes de las rocas con una constante de tiempo τ_w = r_c/v: a más velocidad, menos filtrado.',
      numeric: function (c) { return 'G_1(s) = ' + texFrac(texNum(c.K1), texNum(c.tauW) + '\\, s + 1'); },
      tf: function (t) { return t.G1; },
      notes: function (c) { return ['Polo en s = −1/τ_w = ' + fmt(-1 / c.tauW, 3) + ' rad/s (τ_w = ' + fmt(c.tauW * 1000, 3) + ' ms).', 'Ganancia estática K_1 = k: un escalón de terreno acaba desplazando la masa suspendida la misma altura.']; }
    },
    {
      id: 'H', name: 'H(s)', title: 'Planta del amortiguador y la suspensión',
      sym: 'H(s) = \\frac{1}{m_{\\mathrm{eq}} s^2 + c s + k}',
      role: 'El sistema masa-resorte-amortiguador de la suspensión trasera: la masa suspendida m_eq responde a la fuerza total T_reac(s) (terreno más ciclista) con el desplazamiento C(s). Su frecuencia natural ω_n = √(k/m_eq) y su amortiguamiento ζ = c/(2√(k m_eq)) deciden si absorbe un bache o rebota.',
      numeric: function (c) { return 'H(s) = ' + texFrac('1', texPoly([c.mEq, c.c, c.k])); },
      tf: function (t) { return t.H; },
      notes: function (c) { return ['ω_n = ' + fmt(c.wn, 3) + ' rad/s (' + fmt(c.wn / (2 * Math.PI), 3) + ' Hz), ζ = ' + fmt(c.zeta, 3) + (c.zeta < 1 ? ' (subamortiguado: rebota).' : ' (sobreamortiguado o crítico: no rebota).'), 'Ganancia estática 1/k = ' + fmt(1 / c.k, 3) + ' m/N.']; }
    }
  ];

  var SIGNALS = [
    { id: 'Cset', name: 'C^{\\mathrm{set}}(s)', title: 'Referencia de inclinación del chasis', unit: 'm', role: 'Desplazamiento deseado de la masa suspendida trasera: C_set = L·tan θ_set. Con θ_set = 0 el ciclista intenta mantener el chasis nivelado respecto a su reposo.' },
    { id: 'E', name: 'E(s)', title: 'Error del lazo', unit: 'm', role: 'E = C_set − C. Es lo que «siente» el ciclista: cuánto se ha hundido o levantado la cola de la bicicleta respecto a lo que quiere.' },
    { id: 'M', name: 'M(s)', title: 'Mando muscular', unit: 'u.', role: 'Salida del controlador PID: la orden que el sistema nervioso envía a los músculos del tronco.' },
    { id: 'Mag', name: '\\dot{M}_{\\mathrm{ag}}(s)', title: 'Velocidad del torso', unit: 'm/s', role: 'Respuesta muscular: la velocidad con la que el torso se desplaza hacia delante (positiva) o hacia atrás (negativa).' },
    { id: 'Q', name: 'Q_{\\mathrm{baches}}(s)', title: 'Perturbación del terreno', unit: 'm', role: 'Altura del perfil bajo la rueda trasera más la transferencia de peso por pendiente y frenada expresada como desplazamiento equivalente del resorte.' },
    { id: 'Treac', name: 'T_{\\mathrm{reac}}(s)', title: 'Fuerza de reacción total', unit: 'N', role: 'Suma de la fuerza del terreno (por G_1) y de la fuerza que el ciclista aplica al marco (por G_2). Es la entrada de la suspensión.' },
    { id: 'C', name: 'C(s)', title: 'Desplazamiento de la masa suspendida', unit: 'm', role: 'Salida del sistema: desplazamiento vertical de la cola del chasis. Con la horquilla da el cabeceo φ = atan((C − C_f)/L), que se suma al ángulo del resultante para dar el ángulo de estabilidad θ.' }
  ];

  function blockById(id) { for (var i = 0; i < BLOCKS.length; i++) if (BLOCKS[i].id === id) return BLOCKS[i]; return null; }
  function signalById(id) { for (var i = 0; i < SIGNALS.length; i++) if (SIGNALS[i].id === id) return SIGNALS[i]; return null; }

  /* ------------------------------------------------------------------ terreno procedural */

  /**
   * Campo de baches y rocas a lo largo del recorrido (m), generado por delante de la bicicleta con una
   * semilla fija: la misma configuración da siempre el mismo terreno. Cada elemento es una versina
   * z = A/2·(1 − cos 2πu) de anchura w; las «rocas» son más estrechas y altas.
   */
  function bumpField(seed) {
    var rng = util.mulberry32(seed || 0x5EED);
    var bumps = [];
    var ahead = 0;          // hasta dónde está generado (m)
    var cursor = 0;         // primer bache que puede influir en consultas crecientes
    var cfg = { spacing: 6, amp: 0.04 };

    function configure(vSet, wb, amp) {
      cfg.spacing = Math.max(0.5, vSet / Math.max(0.05, wb));
      cfg.amp = Math.max(0, amp);
    }

    /** Descarta los baches aún no alcanzados por la rueda delantera y los regenera con la configuración nueva. */
    function regenerateFrom(s) {
      var keep = [];
      for (var i = 0; i < bumps.length; i++) if (bumps[i].s + bumps[i].w <= s) keep.push(bumps[i]);
      bumps = keep;
      ahead = Math.max(s, bumps.length ? bumps[bumps.length - 1].s + bumps[bumps.length - 1].w : 0);
      cursor = 0;
    }

    function ensure(sMax) {
      while (ahead < sMax) {
        var gap = cfg.spacing * (0.65 + 0.7 * rng());
        var rock = rng() < 0.3;
        var w = rock ? 0.16 + 0.12 * rng() : 0.3 + 0.35 * rng();
        var A = cfg.amp * (rock ? 0.8 + 0.2 * rng() : 0.55 + 0.45 * rng());
        var s0 = Math.max(ahead + 0.4, (bumps.length ? bumps[bumps.length - 1].s : 2.5) + gap);
        bumps.push({ s: s0, w: w, A: A, rock: rock });
        ahead = s0 + w;
      }
    }

    /** Altura z_r(s) y pendiente dz/ds en s. Escribe en out = { z, dz }. */
    function at(s, out) {
      var z = 0;
      var dz = 0;
      while (cursor > 0 && bumps[cursor - 1].s + bumps[cursor - 1].w > s - 2) cursor--;
      while (cursor < bumps.length && bumps[cursor].s + bumps[cursor].w < s - 2) cursor++;
      for (var i = cursor; i < bumps.length; i++) {
        var b = bumps[i];
        if (b.s > s) break;
        if (s >= b.s + b.w) continue;
        var u = (s - b.s) / b.w;
        var ph = 2 * Math.PI * u;
        if (b.A > 0) {
          z += b.A * 0.5 * (1 - Math.cos(ph));
          dz += b.A * Math.PI * Math.sin(ph) / b.w;
        }
      }
      out.z = z;
      out.dz = dz;
      return out;
    }

    return {
      configure: configure,
      ensure: ensure,
      at: at,
      regenerateFrom: regenerateFrom,
      list: function () { return bumps; },
      reset: function (newSeed) {
        rng = util.mulberry32(newSeed || seed || 0x5EED);
        bumps = [];
        ahead = 0;
        cursor = 0;
      }
    };
  }

  /* ------------------------------------------------------------------ simulador */

  var NS = 11;   // tamaño del vector de estado
  // índices
  var I_C = 0, I_CD = 1, I_CF = 2, I_CFD = 3, I_IE = 4, I_XV = 5, I_XT = 6, I_Y2 = 7, I_Q1 = 8, I_V = 9, I_S = 10;

  /**
   * BikeSuspensionLab(params SI opcionales) → simulador encapsulado y determinista.
   *   setParams(partial), reset(), step(dt), brake(on), state (Float64Array), out (lecturas), halted, fall.
   */
  function BikeSuspensionLab(params, opts) {
    opts = opts || {};
    this.params = defaults();
    this.t = 0;
    this.braking = false;
    this.halted = false;
    this.fall = null;                       // { kind: 'otb' | 'rear', t }
    this.state = new Float64Array(NS);
    this._k1 = new Float64Array(NS);
    this._k2 = new Float64Array(NS);
    this._k3 = new Float64Array(NS);
    this._k4 = new Float64Array(NS);
    this._tmp = new Float64Array(NS);
    this._road = { z: 0, dz: 0 };
    this._roadF = { z: 0, dz: 0 };
    this._over = 0;                         // tiempo acumulado por encima del umbral
    this.field = bumpField(opts.seed || 0x5EED);
    this.out = {};
    if (params) this.setParams(params, true);
    this.coeffs = coefficients(this.params);
    this.reset();
  }

  BikeSuspensionLab.prototype.setParams = function (partial, silent) {
    var changedTerrain = false;
    var changedSpeed = false;
    for (var key in partial) {
      if (!Object.prototype.hasOwnProperty.call(partial, key) || !PARAM_BY_KEY[key]) continue;
      var v = Number(partial[key]);
      if (!isNum(v) || v === this.params[key]) continue;
      this.params[key] = v;
      if (key === 'wb' || key === 'Ab') changedTerrain = true;
      if (key === 'v') changedSpeed = true;
    }
    this.coeffs = coefficients(this.params);
    if (!silent && (changedTerrain || changedSpeed)) {
      this.field.configure(this.params.v, this.params.wb, this.params.Ab);
      this.field.regenerateFrom(this.state[I_S] + GEO.L + 1);
      this.field.ensure(this.state[I_S] + 40);
    }
    return this.params;
  };

  BikeSuspensionLab.prototype.brake = function (on) { this.braking = !!on; };

  BikeSuspensionLab.prototype.reset = function () {
    var x = this.state;
    for (var i = 0; i < NS; i++) x[i] = 0;
    x[I_V] = this.params.v;
    this.t = 0;
    this.halted = false;
    this.fall = null;
    this._over = 0;
    this.field.reset();
    this.field.configure(this.params.v, this.params.wb, this.params.Ab);
    this.field.ensure(40);
    this.measure();
  };

  /** Deceleración efectiva del freno: con la bicicleta casi parada no puede superar la componente de la gravedad. */
  BikeSuspensionLab.prototype.brakeDecel = function (v) {
    if (!this.braking) return 0;
    var ab = this.params.ab;
    if (v > 0.3) return ab;
    return Math.min(ab, G0 * Math.sin(this.params.alpha));
  };

  /** Derivadas dx/dt en `out` para el estado `x`. */
  BikeSuspensionLab.prototype.deriv = function (x, out) {
    var p = this.params;
    var c = this.coeffs;
    var v = Math.max(0, x[I_V]);
    var s = x[I_S];
    var ab = this.brakeDecel(v);
    this.field.at(s, this._road);
    this.field.at(s + GEO.L, this._roadF);
    var zr = this._road.z;
    var zf = this._roadF.z;
    var zfd = this._roadF.dz * v;

    // Perturbación: perfil bajo la rueda trasera + transferencia de peso (pendiente y frenada).
    var Q = zr + slopeDisplacement(c, p.alpha, ab);
    // Lazo: error, PID, músculo, marco.
    var e = c.Cset - x[I_C];
    var M = c.Kp * e + c.Ki * x[I_IE] + c.Kd * (-x[I_CD]);
    var xt = x[I_XT];
    var xv = x[I_XV];
    var saturated = (xt >= GEO.leanMax && xv > 0) || (xt <= -GEO.leanMax && xv < 0);

    out[I_IE] = saturated ? 0 : e;                                  // anti-windup
    out[I_XV] = (c.Kv * M - xv) / c.tauM;                           // G_V
    out[I_XT] = saturated ? 0 : xv;                                 // integrador de G_2 (posición del torso)
    out[I_Y2] = (c.Lp * xt - c.bP * x[I_Y2]) / c.J;                 // G_2: J ẏ + b y = L_p x_t
    out[I_Q1] = (c.K1 * Q - x[I_Q1]) / c.tauW;                      // G_1
    var Treac = x[I_Q1] + x[I_Y2];
    out[I_C] = x[I_CD];
    out[I_CD] = (Treac - c.c * x[I_CD] - c.k * x[I_C]) / c.mEq;     // H
    // Horquilla delantera (solo cabeceo y escena): cuarto de vehículo clásico.
    out[I_CF] = x[I_CFD];
    out[I_CFD] = (c.kf * (zf - x[I_CF]) + c.cf * (zfd - x[I_CFD])) / c.mf;
    // Velocidad y recorrido.
    out[I_V] = this.braking ? -ab : (p.v - v) / FIXED.vTau;
    if (v <= 0 && out[I_V] < 0) out[I_V] = 0;
    out[I_S] = v;
    return out;
  };

  BikeSuspensionLab.prototype.rk4 = function (hh) {
    var x = this.state;
    var k1 = this._k1, k2 = this._k2, k3 = this._k3, k4 = this._k4, tmp = this._tmp;
    var i;
    this.deriv(x, k1);
    for (i = 0; i < NS; i++) tmp[i] = x[i] + 0.5 * hh * k1[i];
    this.deriv(tmp, k2);
    for (i = 0; i < NS; i++) tmp[i] = x[i] + 0.5 * hh * k2[i];
    this.deriv(tmp, k3);
    for (i = 0; i < NS; i++) tmp[i] = x[i] + hh * k3[i];
    this.deriv(tmp, k4);
    for (i = 0; i < NS; i++) x[i] += hh / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    x[I_XT] = clamp(x[I_XT], -GEO.leanMax, GEO.leanMax);
    if (x[I_V] < 0) x[I_V] = 0;
  };

  /** Avanza dt segundos de simulación en subpasos RK4 y actualiza las lecturas. Devuelve la caída si ocurre. */
  BikeSuspensionLab.prototype.step = function (dt) {
    if (this.halted || !(dt > 0)) return null;
    this.field.ensure(this.state[I_S] + 40);
    var n = Math.max(1, Math.ceil(dt / SUBSTEP_S));
    var hh = dt / n;
    for (var i = 0; i < n; i++) {
      this.rk4(hh);
      this.t += hh;
      var o = this.measure();
      var over = o.theta > o.thetaCritFront ? 'otb' : o.theta < o.thetaCritRear ? 'rear' : null;
      if (over) {
        this._over += hh;
        if (this._over >= FALL_HOLD_S) {
          this.halted = true;
          this.fall = { kind: over, t: 0, theta: o.theta, limit: over === 'otb' ? o.thetaCritFront : o.thetaCritRear };
          return this.fall;
        }
      } else {
        this._over = 0;
      }
    }
    return null;
  };

  /** Lecturas físicas del estado actual (sin asignaciones: reutiliza this.out). */
  BikeSuspensionLab.prototype.measure = function () {
    var x = this.state;
    var p = this.params;
    var c = this.coeffs;
    var o = this.out;
    var v = Math.max(0, x[I_V]);
    var ab = this.brakeDecel(v);
    this.field.at(x[I_S], this._road);
    this.field.at(x[I_S] + GEO.L, this._roadF);
    var zr = this._road.z;
    var zf = this._roadF.z;
    var zrd = this._road.dz * v;
    var zfd = this._roadF.dz * v;
    var dx = zr - x[I_C];
    var dxd = zrd - x[I_CD];
    var dxf = zf - x[I_CF];
    var dxfd = zfd - x[I_CFD];
    var Fs = c.k * dx + c.c * dxd;
    var Ff = c.kf * dxf + c.cf * dxfd;
    var xt = x[I_XT];
    var xcgEff = p.xcg + xt;
    var st = statics(p.alpha, ab, xcgEff, c.m);
    var phi = Math.atan2(x[I_C] - x[I_CF], GEO.L);
    var theta = st.thetaStatic + phi;
    var e = c.Cset - x[I_C];
    o.t = this.t;
    o.v = v;
    o.s = x[I_S];
    o.ab = ab;
    o.braking = this.braking;
    o.zr = zr;
    o.zf = zf;
    o.C = x[I_C];
    o.Cd = x[I_CD];
    o.Cf = x[I_CF];
    o.dx = dx;
    o.dxf = dxf;
    o.Fs = Fs;
    o.Ff = Ff;
    o.xt = xt;
    o.xcgEff = xcgEff;
    o.phi = phi;
    o.thetaStatic = st.thetaStatic;
    o.theta = theta;
    o.thetaCritFront = st.thetaCritFront;
    o.thetaCritRear = st.thetaCritRear;
    o.margin = Math.min(st.thetaCritFront - theta, theta - st.thetaCritRear);
    o.Nr = Math.max(0, st.Nr + Fs);
    o.Nf = Math.max(0, st.Nf + Ff);
    o.W = st.W;
    o.push = st.push;
    o.tipMoment = st.tipMoment;
    o.aEff = st.aEff;
    o.bEff = st.bEff;
    o.Cset = c.Cset;
    o.E = e;
    o.M = c.Kp * e + c.Ki * x[I_IE] + c.Kd * (-x[I_CD]);
    o.Mag = x[I_XV];
    o.Q = zr + slopeDisplacement(c, p.alpha, ab);
    o.Treac = x[I_Q1] + x[I_Y2];
    o.F2 = x[I_Y2];
    o.F1 = x[I_Q1];
    return o;
  };

  /* ------------------------------------------------------------------ geometría del marco (escena) */

  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function rot(p, ang) { var cs = Math.cos(ang), sn = Math.sin(ang); return [p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function scale(a, k) { return [a[0] * k, a[1] * k]; }

  var ARM = dist([0, 0], GEO.pivot);              // longitud del basculante (pivote → eje trasero)
  var ARM_ANGLE0 = Math.atan2(-GEO.pivot[1], -GEO.pivot[0]);  // dirección pivote → eje en reposo
  var SHOCK_FREE = dist(GEO.shockTop, add(GEO.pivot, rot(GEO.rockerArm, 0)));

  /**
   * Puntos del marco en el sistema del chasis (origen: eje trasero en reposo; x hacia delante, y arriba)
   * para una compresión trasera dx (m): el eje trasero sube dx (gira el basculante en torno al pivote).
   * Devuelve { axle, pivot, rocker, shockTop, shockLen, armAngle, triangle, bb, seatTop, headTop, headBottom, barEnd }.
   */
  function frameGeometry(dx, dxf) {
    var sinA = clamp(dx / ARM, -0.95, 0.95);
    var dAng = Math.asin(sinA);                 // > 0: la rueda sube → el basculante gira hacia arriba
    var armAngle = ARM_ANGLE0 - dAng;           // el eje está detrás del pivote: subir = acercar el ángulo a 0
    var axle = add(GEO.pivot, [ARM * Math.cos(armAngle), ARM * Math.sin(armAngle)]);
    var rocker = add(GEO.pivot, rot(GEO.rockerArm, -dAng));
    var shockLen = dist(GEO.shockTop, rocker);
    return {
      axle: axle,
      frontAxle: [GEO.L, -dxf],
      pivot: GEO.pivot,
      rocker: rocker,
      shockTop: GEO.shockTop,
      shockLen: shockLen,
      shockCompression: SHOCK_FREE - shockLen,
      armAngle: armAngle,
      bb: GEO.bb,
      seatTop: GEO.seatTop,
      headTop: GEO.headTop,
      headBottom: GEO.headBottom,
      barEnd: GEO.barEnd
    };
  }

  /* ------------------------------------------------------------------ escena en canvas */

  /** Dibujante de la escena: cámara dual, bicicleta articulada, ciclista, terreno, vectores y caída. */
  function Scene(canvas, stage) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = null;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.zoom = false;
    this.cam = { s: 0, ax: 0, ay: 0, init: false };
    this.layers = { W: true, N: true, Fs: true, inertia: true };
    this.colors = this.readColors();
    this.fallPose = null;
    this.frame = null;
    this.lastFrame = null;
  }

  Scene.prototype.readColors = function () {
    function c(name, fb) { return util.cssVar(name) || fb; }
    return {
      bg: c('--c-plot-bg', '#132030'),
      ink: c('--ink', '#E6EDF3'),
      muted: c('--muted', '#9AABBD'),
      subtle: c('--subtle', '#8195AA'),
      axis: c('--c-axis', '#E6EDF352'),
      grid: c('--c-grid', '#E6EDF314'),
      surface: c('--surface-3', '#26374C'),
      surface2: c('--surface-2', '#1D2B3D'),
      frame: c('--bk-frame', '#263241'),
      frameEdge: c('--bk-frame-edge', '#C7D2DE'),
      swing: c('--c-zero', '#6DD4B8'),
      weight: c('--c-pole', '#EC9088'),
      normal: c('--c-out', '#86C3EA'),
      spring: c('--c-zero', '#6DD4B8'),
      inertia: c('--accent', '#E3B25C'),
      warn: c('--warning', '#F0B87A'),
      danger: c('--danger', '#EC9088'),
      rider: c('--c-state', '#BBA8E8'),
      road: c('--c-in', '#B8C4D1')
    };
  };

  Scene.prototype.resize = function (w, hh) {
    if (!(w > 0 && hh > 0)) return;
    var fit = util.fitCanvas(this.canvas, { width: w, height: hh });
    this.ctx = fit.ctx;
    this.w = w;
    this.h = hh;
    this.dpr = fit.dpr;
    this.cam.init = false;
    if (this.lastFrame) this.draw(this.lastFrame, 0);
  };

  Scene.prototype.setZoom = function (on) { this.zoom = !!on; };

  /** Cámara objetivo: escala (px/m) y anclaje en pantalla del eje trasero. */
  Scene.prototype.target = function (o) {
    var w = this.w, hh = this.h;
    if (this.zoom) {
      var S = Math.min(w / 1.35, hh / 1.05);
      // Centro del amortiguador y del pivote aproximadamente en (0.55, 0.30) del chasis.
      return { s: S, ax: w * 0.5 - S * 0.55, ay: hh * 0.5 + S * 0.30 };
    }
    var S2 = Math.min(w / 4.1, hh / 3.0);
    return { s: S2, ax: w * 0.34, ay: hh * 0.5 + S2 * 0.42 };
  };

  Scene.prototype.updateCamera = function (dt) {
    var tg = this.target();
    var cam = this.cam;
    if (!cam.init || (DSL.prefs && DSL.prefs.reducedMotion) || !(dt > 0)) {
      if (!cam.init || (DSL.prefs && DSL.prefs.reducedMotion)) {
        cam.s = tg.s; cam.ax = tg.ax; cam.ay = tg.ay; cam.init = true;
      }
      return;
    }
    var a = 1 - Math.exp(-dt / CAMERA_TAU_S);
    cam.s += (tg.s - cam.s) * a;
    cam.ax += (tg.ax - cam.ax) * a;
    cam.ay += (tg.ay - cam.ay) * a;
    if (Math.abs(tg.s - cam.s) < 0.05 && Math.abs(tg.ax - cam.ax) < 0.1 && Math.abs(tg.ay - cam.ay) < 0.1) {
      cam.s = tg.s; cam.ax = tg.ax; cam.ay = tg.ay;
    }
  };

  /**
   * Dibuja un fotograma. frame = { o (lecturas), params, fall: { kind, t } | null, dt }.
   * El mundo se dibuja con la pendiente inclinada: e1 = dirección cuesta abajo, e2 = normal a la cresta.
   */
  Scene.prototype.draw = function (frame, dt) {
    var ctx = this.ctx;
    if (!ctx || !(this.w > 0)) { this.lastFrame = frame; return; }
    this.lastFrame = frame;
    this.updateCamera(dt);
    var o = frame.o;
    var p = frame.params;
    var C = this.colors;
    var cam = this.cam;
    var S = cam.s;
    var alpha = p.alpha;
    var e1 = [Math.cos(alpha), Math.sin(alpha)];
    var e2 = [Math.sin(alpha), -Math.cos(alpha)];
    this.frame = frame;

    // Punto en el sistema de la cresta (x cuesta abajo desde el contacto trasero, y normal) → pantalla.
    function P(x, y) { return [cam.ax + S * (x * e1[0] + y * e2[0]), cam.ay + S * (x * e1[1] + y * e2[1])]; }

    // Base del chasis: referencia trasera (0, R + C) y delantera (L, R + C_f), inclinada por el cabeceo.
    var rearRef = [0, GEO.R + o.C];
    var frontRef = [GEO.L, GEO.R + o.Cf];
    var fx = sub(frontRef, rearRef);
    var fl = Math.hypot(fx[0], fx[1]) || GEO.L;
    var f1 = [fx[0] / fl, fx[1] / fl];
    var f2 = [-f1[1], f1[0]];
    // Caída: el conjunto gira alrededor de un contacto.
    var fall = frame.fall;
    var fallAngle = 0;
    var fallPivot = null;
    if (fall) {
      var prog = clamp(fall.t / FALL_ANIM_S, 0, 1);
      var ease = prog * prog * (3 - 2 * prog);
      if (fall.kind === 'otb') { fallAngle = -ease * 1.75; fallPivot = [GEO.L, o.zf]; }
      else { fallAngle = ease * 1.55; fallPivot = [0, o.zr]; }
    }
    function world(pt) {
      // pt en coordenadas de la cresta → aplica el giro de caída si procede
      if (!fall) return pt;
      var d = sub(pt, fallPivot);
      return add(fallPivot, rot(d, fallAngle));
    }
    function chassis(pt) { // chasis → cresta
      return world(add(rearRef, add(scale(f1, pt[0]), scale(f2, pt[1]))));
    }
    function SP(pt) { return P(pt[0], pt[1]); }   // cresta → pantalla

    var geo = frameGeometry(o.dx, o.dxf);

    /* ---------- fondo y terreno */
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawTerrain(ctx, P, o, p, e1, e2);

    /* ---------- ruedas */
    var rearWheel = world([0, o.zr + GEO.R]);
    var frontWheel = world([GEO.L, o.zf + GEO.R]);
    this.drawWheel(ctx, SP(rearWheel), S * GEO.R, o.s / GEO.R, fallAngle);
    this.drawWheel(ctx, SP(frontWheel), S * GEO.R, (o.s + GEO.L) / GEO.R, fallAngle);

    /* ---------- marco: basculante (verde), amortiguador, triángulo principal, horquilla */
    var pivot = chassis(geo.pivot);
    var rocker = chassis(geo.rocker);
    var shockTop = chassis(geo.shockTop);
    var axle = rearWheel;   // el eje trasero real es el centro de la rueda
    var bb = chassis(geo.bb);
    var seatTop = chassis(geo.seatTop);
    var headTop = chassis(geo.headTop);
    var headBottom = chassis(geo.headBottom);
    var barEnd = chassis(geo.barEnd);

    // Basculante: dos brazos del pivote al eje y tirante al balancín.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.swing;
    ctx.lineWidth = Math.max(2, S * 0.028);
    this.line(ctx, SP(pivot), SP(axle));
    this.line(ctx, SP(axle), SP(rocker));
    this.line(ctx, SP(pivot), SP(rocker));

    // Triángulo principal (relleno sólido oscuro con borde claro).
    ctx.beginPath();
    var tri = [bb, seatTop, headTop, headBottom];
    for (var i = 0; i < tri.length; i++) {
      var q = SP(tri[i]);
      if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
    }
    ctx.closePath();
    ctx.fillStyle = C.frame;
    ctx.fill();
    ctx.strokeStyle = C.frameEdge;
    ctx.lineWidth = Math.max(1.5, S * 0.016);
    ctx.stroke();
    // Tubos del triángulo (tubo superior, diagonal, de sillín) como trazos del color del borde.
    ctx.lineWidth = Math.max(3, S * 0.034);
    ctx.strokeStyle = C.frame;
    this.line(ctx, SP(seatTop), SP(headTop));
    this.line(ctx, SP(bb), SP(headBottom));
    this.line(ctx, SP(bb), SP(seatTop));
    ctx.lineWidth = Math.max(1, S * 0.008);
    ctx.strokeStyle = C.frameEdge;
    this.line(ctx, SP(seatTop), SP(headTop));
    this.line(ctx, SP(bb), SP(headBottom));
    this.line(ctx, SP(bb), SP(seatTop));
    // Pivote principal.
    this.disc(ctx, SP(pivot), Math.max(3, S * 0.03), C.swing, C.bg);
    // Horquilla: barra de dirección y brazos hasta el eje delantero (los inferiores siguen a la rueda).
    ctx.strokeStyle = C.frame;
    ctx.lineWidth = Math.max(3, S * 0.03);
    this.line(ctx, SP(headTop), SP(barEnd));
    var forkDir = sub(frontWheel, headBottom);
    var forkLen = Math.hypot(forkDir[0], forkDir[1]) || 1;
    var forkU = [forkDir[0] / forkLen, forkDir[1] / forkLen];
    var stanchionEnd = add(headBottom, scale(forkU, 0.26));
    ctx.lineWidth = Math.max(4, S * 0.04);
    this.line(ctx, SP(headBottom), SP(stanchionEnd));
    ctx.strokeStyle = C.frameEdge;
    ctx.lineWidth = Math.max(2, S * 0.022);
    this.line(ctx, SP(add(headBottom, scale(forkU, 0.12))), SP(frontWheel));
    // Bielas y pedales.
    var pedalR = 0.17;
    ctx.strokeStyle = C.frameEdge;
    ctx.lineWidth = Math.max(1.5, S * 0.014);
    var pedalF = chassis(add(geo.bb, [pedalR, 0]));
    var pedalB = chassis(add(geo.bb, [-pedalR, 0]));
    this.line(ctx, SP(pedalB), SP(pedalF));
    this.disc(ctx, SP(bb), Math.max(2.5, S * 0.024), C.frameEdge, C.frame);

    // Amortiguador: cuerpo del amortiguador desde el anclaje superior y resorte helicoidal hasta el balancín.
    this.drawShock(ctx, SP(shockTop), SP(rocker), S, geo, C);

    /* ---------- ciclista */
    this.drawRider(ctx, SP, chassis, geo, o, S, C, fall, frame);

    /* ---------- vectores de fuerza */
    if (!fall) this.drawVectors(ctx, P, SP, chassis, world, geo, o, p, S, C, e1, e2, rocker, shockTop);

    /* ---------- rótulos del modo zoom */
    if (this.zoom && !fall) this.drawZoomLabels(ctx, SP, chassis, geo, o, S, C, rocker, shockTop, pivot);

    /* ---------- HUD */
    this.drawHud(ctx, o, p, C, fall);
    ctx.restore();
  };

  Scene.prototype.line = function (ctx, a, b) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  };

  Scene.prototype.disc = function (ctx, c, r, stroke, fill) {
    ctx.beginPath();
    ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1, r * 0.35); ctx.stroke(); }
  };

  Scene.prototype.drawTerrain = function (ctx, P, o, p, e1, e2) {
    var C = this.colors;
    var S = this.cam.s;
    var span = Math.max(this.w, this.h) / S + 2;   // metros visibles a cada lado
    var step = this.zoom ? 0.03 : 0.08;
    var road = { z: 0, dz: 0 };
    var field = this.frame.field;
    // Superficie con baches.
    ctx.beginPath();
    var first = true;
    var xStart = -span;
    var xEnd = span;
    for (var d = xStart; d <= xEnd; d += step) {
      field.at(o.s + d, road);
      var q = P(d, road.z);
      if (first) { ctx.moveTo(q[0], q[1]); first = false; } else ctx.lineTo(q[0], q[1]);
    }
    // Cierre por debajo (hacia el interior de la montaña).
    var qEnd = P(xEnd, -3);
    var qStart = P(xStart, -3);
    ctx.lineTo(qEnd[0], qEnd[1]);
    ctx.lineTo(qStart[0], qStart[1]);
    ctx.closePath();
    ctx.fillStyle = C.surface2;
    ctx.fill();
    ctx.strokeStyle = C.road;
    ctx.lineWidth = Math.max(1.5, S * 0.012);
    ctx.stroke();
    // Rayado de la montaña (textura técnica) y marcas cada metro.
    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 1;
    var hatchGap = this.zoom ? 0.25 : 0.5;
    var s0 = Math.floor((o.s - span) / hatchGap) * hatchGap;
    for (var d2 = s0; d2 <= o.s + span; d2 += hatchGap) {
      var dd = d2 - o.s;
      field.at(d2, road);
      var a = P(dd, road.z - 0.02);
      var b = P(dd - 0.12, road.z - 0.18);
      this.line(ctx, a, b);
    }
    // Marcas de distancia (metros) sobre la cresta.
    ctx.fillStyle = C.muted;
    ctx.font = '500 11px ' + (util.cssVar('--font-body') || 'system-ui, sans-serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var tickEvery = this.zoom ? 0.5 : 2;
    var sm = Math.ceil((o.s - span) / tickEvery) * tickEvery;
    for (var d3 = sm; d3 <= o.s + span; d3 += tickEvery) {
      var dd3 = d3 - o.s;
      field.at(d3, road);
      var q3 = P(dd3, road.z - 0.22);
      ctx.strokeStyle = C.axis;
      this.line(ctx, P(dd3, road.z - 0.02), P(dd3, road.z - 0.1));
      if (!this.zoom || Math.abs(d3 - Math.round(d3)) < 1e-9) ctx.fillText(fmt(d3, 4) + ' m', q3[0], q3[1]);
    }
    // Indicación de la pendiente α: arco en la esquina inferior izquierda del terreno.
    var ang = p.alpha;
    if (ang > 0.001) {
      // Anclado a la pantalla: el punto de la cresta que queda a 70 px del borde izquierdo.
      var dAlpha = (70 - this.cam.ax) / (S * e1[0]);
      field.at(o.s + dAlpha, road);
      var base = P(dAlpha, road.z);
      ctx.strokeStyle = C.axis;
      ctx.setLineDash([4, 4]);
      this.line(ctx, base, [base[0] + 70, base[1]]);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(base[0], base[1], 42, 0, ang);
      ctx.strokeStyle = C.inertia;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = C.inertia;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('α = ' + fmt(ang / DEG, 3) + '°', base[0] + 48, base[1] + 24);
    }
  };

  Scene.prototype.drawWheel = function (ctx, c, r, turns, extraAngle) {
    var C = this.colors;
    ctx.beginPath();
    ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2.5, r * 0.11);
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c[0], c[1], r * 0.82, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.muted;
    ctx.stroke();
    var n = 8;
    var a0 = turns + (extraAngle || 0);
    ctx.strokeStyle = C.muted;
    ctx.lineWidth = 1;
    for (var i = 0; i < n; i++) {
      var a = a0 + i * Math.PI * 2 / n;
      ctx.beginPath();
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(c[0] + Math.cos(a) * r * 0.82, c[1] + Math.sin(a) * r * 0.82);
      ctx.stroke();
    }
    this.disc(ctx, c, Math.max(2, r * 0.1), C.muted, C.bg);
  };

  /** Amortiguador central: cuerpo (anclaje superior → mitad) y resorte helicoidal comprimido. */
  Scene.prototype.drawShock = function (ctx, top, bottom, S, geo, C) {
    var dx = bottom[0] - top[0];
    var dy = bottom[1] - top[1];
    var len = Math.hypot(dx, dy) || 1;
    var ux = dx / len, uy = dy / len;
    var nx = -uy, ny = ux;
    var bodyLen = len * 0.42;
    var bodyW = Math.max(5, S * 0.055);
    // Cuerpo del amortiguador (cilindro).
    ctx.beginPath();
    ctx.moveTo(top[0] + nx * bodyW / 2, top[1] + ny * bodyW / 2);
    ctx.lineTo(top[0] + ux * bodyLen + nx * bodyW / 2, top[1] + uy * bodyLen + ny * bodyW / 2);
    ctx.lineTo(top[0] + ux * bodyLen - nx * bodyW / 2, top[1] + uy * bodyLen - ny * bodyW / 2);
    ctx.lineTo(top[0] - nx * bodyW / 2, top[1] - ny * bodyW / 2);
    ctx.closePath();
    ctx.fillStyle = C.surface;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    // Vástago.
    ctx.strokeStyle = C.muted;
    ctx.lineWidth = Math.max(2, S * 0.02);
    this.line(ctx, [top[0] + ux * bodyLen, top[1] + uy * bodyLen], bottom);
    // Resorte helicoidal: zigzag entre el 8 % y el 92 % de la longitud, con amplitud fija.
    var coils = 9;
    var a = Math.max(5, S * 0.06);
    var s0 = len * 0.06;
    var s1 = len * 0.94;
    ctx.beginPath();
    ctx.moveTo(top[0] + ux * s0, top[1] + uy * s0);
    var segs = coils * 2;
    for (var i = 1; i <= segs; i++) {
      var t = s0 + (s1 - s0) * i / segs;
      var side = i === segs ? 0 : (i % 2 ? 1 : -1);
      ctx.lineTo(top[0] + ux * t + nx * a * side, top[1] + uy * t + ny * a * side);
    }
    ctx.strokeStyle = C.spring;
    ctx.lineWidth = Math.max(2, S * 0.022);
    ctx.lineJoin = 'round';
    ctx.stroke();
    // Ojales.
    this.disc(ctx, top, Math.max(2.5, S * 0.022), C.ink, C.bg);
    this.disc(ctx, bottom, Math.max(2.5, S * 0.022), C.swing, C.bg);
  };

  /** Ciclista: figura articulada sobre el chasis; el torso se inclina con x_cg efectivo. */
  Scene.prototype.drawRider = function (ctx, SP, chassis, geo, o, S, C, fall, frame) {
    var lean = clamp(o.xcgEff, -0.65, 0.65);
    var hip = [0.24 + 0.45 * lean, 0.74 - 0.06 * Math.abs(lean)];
    var shoulder = [hip[0] + 0.44 + 0.25 * lean, hip[1] + 0.30 - 0.05 * Math.abs(lean)];
    var head = [shoulder[0] + 0.11 + 0.04 * lean, shoulder[1] + 0.15];
    var hand = [geo.barEnd[0] - 0.02, geo.barEnd[1] + 0.02];
    var pedalF = add(geo.bb, [0.17, 0]);
    var pedalB = add(geo.bb, [-0.17, 0]);
    var kneeF = add(scale(add(hip, pedalF), 0.5), [0.16, 0.06]);
    var kneeB = add(scale(add(hip, pedalB), 0.5), [0.14, 0.03]);
    var elbow = add(scale(add(shoulder, hand), 0.5), [0.0, -0.1]);
    // Al caer, el ciclista sale despedido: trayectoria parabólica desde el CG con la velocidad actual.
    var fly = null;
    if (fall && fall.t > 0.35) {
      var tf = fall.t - 0.35;
      var dir = fall.kind === 'otb' ? 1 : -1;
      var v0 = Math.max(1.5, o.v);
      fly = [dir * v0 * 0.45 * tf, 1.2 * tf - 0.5 * 5.5 * tf * tf];
    }
    function R(pt) {
      if (!fly) return SP(chassis(pt));
      var q = chassis(pt);
      var spun = rot(sub(q, chassis(hip)), fall.kind === 'otb' ? -tfSpin() : tfSpin());
      return SP(add(add(chassis(hip), spun), fly));
    }
    function tfSpin() { return (fall.t - 0.35) * 2.2; }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.rider;
    ctx.lineWidth = Math.max(4, S * 0.05);
    // piernas
    this.polyline(ctx, [R(hip), R(kneeB), R(pedalB)]);
    this.polyline(ctx, [R(hip), R(kneeF), R(pedalF)]);
    // tronco y brazo
    ctx.lineWidth = Math.max(5, S * 0.07);
    this.polyline(ctx, [R(hip), R(shoulder)]);
    ctx.lineWidth = Math.max(4, S * 0.045);
    this.polyline(ctx, [R(shoulder), R(elbow), R(hand)]);
    // cabeza (casco)
    var hp = R(head);
    this.disc(ctx, hp, Math.max(6, S * 0.085), C.rider, C.bg);
    this.riderHip = chassis(hip);
    this.riderShoulder = chassis(shoulder);
  };

  Scene.prototype.polyline = function (ctx, pts) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]); else ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.stroke();
  };

  /** Flecha con punta proporcional; from/to en píxeles. */
  Scene.prototype.arrow = function (ctx, from, to, color, width, label, labelSide) {
    var dx = to[0] - from[0];
    var dy = to[1] - from[1];
    var len = Math.hypot(dx, dy);
    if (len < 2) return;
    var ux = dx / len, uy = dy / len;
    var head = clamp(len * 0.28, 7, 16);
    var wing = head * 0.55;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0] - ux * head * 0.6, to[1] - uy * head * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(to[0], to[1]);
    ctx.lineTo(to[0] - ux * head - uy * wing, to[1] - uy * head + ux * wing);
    ctx.lineTo(to[0] - ux * head + uy * wing, to[1] - uy * head - ux * wing);
    ctx.closePath();
    ctx.fill();
    if (label) {
      var lx = to[0] + ux * 10 + (labelSide ? -uy * labelSide : 0);
      var ly = to[1] + uy * 10 + (labelSide ? ux * labelSide : 0);
      this.label(ctx, label, lx, ly, color);
    }
  };

  Scene.prototype.label = function (ctx, text, x, y, color, align) {
    ctx.font = '600 12px ' + (util.cssVar('--font-body') || 'system-ui, sans-serif');
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.colors.bg;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };

  Scene.prototype.drawVectors = function (ctx, P, SP, chassis, world, geo, o, p, S, C, e1, e2, rocker, shockTop) {
    var layers = this.layers;
    var kN = (this.zoom ? 0.55 : 0.85) / Math.max(1, o.W);   // metros de flecha por newton (el peso mide 0.85 m)
    var maxLen = (this.zoom ? 0.9 : 1.5) * S;                  // ninguna flecha supera 1.5 m en pantalla
    var width = Math.max(2, S * 0.018);
    function len(px) { return clamp(px, -maxLen, maxLen); }
    var cg = chassis([GEO.L / 2 + o.xcgEff, GEO.hCg - GEO.R]);   // CG a 1.0 m del suelo en el chasis
    var cgS = SP(cg);
    // Marca del CG.
    this.disc(ctx, cgS, Math.max(3, S * 0.03), C.ink, C.bg);
    if (layers.W) {
      // Peso: vertical real (hacia abajo en pantalla).
      var wl = len(o.W * kN * S);
      this.arrow(ctx, cgS, [cgS[0], cgS[1] + wl], C.weight, width, 'W = ' + withUnit(o.W, 4, 'N'), 0);
    }
    if (layers.N) {
      var rc = SP(world([0, o.zr]));
      var fc = SP(world([GEO.L, o.zf]));
      var nr = len(o.Nr * kN * S);
      var nf = len(o.Nf * kN * S);
      this.arrow(ctx, [rc[0] - e2[0] * 2, rc[1] - e2[1] * 2], [rc[0] + e2[0] * nr, rc[1] + e2[1] * nr], C.normal, width, 'Nt = ' + withUnit(o.Nr, 4, 'N'), -34);
      this.arrow(ctx, [fc[0] - e2[0] * 2, fc[1] - e2[1] * 2], [fc[0] + e2[0] * nf, fc[1] + e2[1] * nf], C.normal, width, 'Nd = ' + withUnit(o.Nf, 4, 'N'), 34);
    }
    if (layers.Fs) {
      // Fuerza del resorte y amortiguador a lo largo del eje del amortiguador, aplicada en el ojal inferior:
      // positiva (compresión) empuja el balancín hacia el anclaje superior.
      var a = SP(rocker);
      var b = SP(shockTop);
      var ux = b[0] - a[0], uy = b[1] - a[1];
      var ln = Math.hypot(ux, uy) || 1;
      ux /= ln; uy /= ln;
      var fs = len(o.Fs * kN * S * 1.6);
      this.arrow(ctx, [a[0], a[1]], [a[0] + ux * fs, a[1] + uy * fs], C.spring, width, 'Fs = ' + withUnit(o.Fs, 4, 'N'), -26);
    }
    if (layers.inertia) {
      // Fuerza de inercia (frenada) cuesta abajo desde el CG, y arco del momento de vuelco en el contacto delantero.
      if (o.ab > 0.01) {
        var fi = o.push - o.W * Math.sin(p.alpha);   // m·a_b
        var il = len(fi * kN * S);
        this.arrow(ctx, cgS, [cgS[0] + e1[0] * il, cgS[1] + e1[1] * il], C.inertia, width, 'm·ab = ' + withUnit(fi, 4, 'N'), -18);
      }
      var fcS = SP(world([GEO.L, o.zf]));
      var mom = o.tipMoment;
      var r = Math.max(14, S * 0.26);
      var sweep = clamp(Math.abs(mom) / Math.max(1, o.W * GEO.L * 0.6), 0.08, 1) * Math.PI * 0.9;
      var tone = mom > 0 ? C.danger : C.inertia;
      ctx.beginPath();
      // Ángulo de referencia: normal a la cresta (hacia arriba), barrido hacia delante si vuelca.
      var base = Math.atan2(e2[1], e2[0]);
      var from = mom > 0 ? base : base - sweep;
      var to = mom > 0 ? base + sweep : base;
      ctx.arc(fcS[0], fcS[1], r, from, to);
      ctx.strokeStyle = tone;
      ctx.lineWidth = Math.max(1.5, width * 0.8);
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      var tipA = mom > 0 ? to : from;
      var tip = [fcS[0] + Math.cos(tipA) * r, fcS[1] + Math.sin(tipA) * r];
      var tangent = mom > 0 ? [-Math.sin(tipA), Math.cos(tipA)] : [Math.sin(tipA), -Math.cos(tipA)];
      this.arrow(ctx, [tip[0] - tangent[0] * 8, tip[1] - tangent[1] * 8], [tip[0] + tangent[0] * 6, tip[1] + tangent[1] * 6], tone, Math.max(1.5, width * 0.8), null);
      this.label(ctx, 'τ = ' + withUnit(mom, 4, 'N·m'), fcS[0] + Math.cos(base) * (r + 18) + 30, fcS[1] + Math.sin(base) * (r + 18), tone);
    }
  };

  Scene.prototype.drawZoomLabels = function (ctx, SP, chassis, geo, o, S, C, rocker, shockTop, pivot) {
    // Cota de la compresión del amortiguador junto al resorte.
    var a = SP(rocker);
    var b = SP(shockTop);
    var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    var ux = b[0] - a[0], uy = b[1] - a[1];
    var ln = Math.hypot(ux, uy) || 1;
    var nx = -uy / ln, ny = ux / ln;
    var off = Math.max(18, S * 0.12);
    ctx.strokeStyle = C.muted;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    this.line(ctx, [a[0] + nx * off * 0.6, a[1] + ny * off * 0.6], [a[0] + nx * off * 1.3, a[1] + ny * off * 1.3]);
    this.line(ctx, [b[0] + nx * off * 0.6, b[1] + ny * off * 0.6], [b[0] + nx * off * 1.3, b[1] + ny * off * 1.3]);
    ctx.setLineDash([]);
    this.arrow(ctx, [mx + nx * off, my + ny * off], [a[0] + nx * off, a[1] + ny * off], C.muted, 1.25, null);
    this.arrow(ctx, [mx + nx * off, my + ny * off], [b[0] + nx * off, b[1] + ny * off], C.muted, 1.25, null);
    this.label(ctx, 'Δx = ' + withUnit(o.dx * 1000, 3, 'mm'), mx + nx * (off + 16), my + ny * (off + 16), C.ink);
    this.label(ctx, 'pivote', SP(pivot)[0] - Math.max(14, S * 0.09), SP(pivot)[1] + Math.max(12, S * 0.07), C.swing);
    this.label(ctx, 'basculante', SP(scale(add(pivot, chassis(geo.axle)), 0.5))[0], SP(scale(add(pivot, chassis(geo.axle)), 0.5))[1] + Math.max(12, S * 0.07), C.swing);
    var ms = [(a[0] + b[0]) / 2 - nx * Math.max(20, S * 0.13), (a[1] + b[1]) / 2 - ny * Math.max(20, S * 0.13)];
    this.label(ctx, 'k = ' + withUnit(this.lastFrame.params.k, 4, 'N/m'), ms[0], ms[1] - 8, C.spring);
    this.label(ctx, 'c = ' + withUnit(this.lastFrame.params.c, 4, 'N·s/m'), ms[0], ms[1] + 8, C.spring);
  };

  Scene.prototype.drawHud = function (ctx, o, p, C, fall) {
    var font = util.cssVar('--font-body') || 'system-ui, sans-serif';
    ctx.font = '500 12px ' + font;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    var x = 12, y = 10;
    var lines = [
      ['v = ' + withUnit(o.v * 3.6, 3, 'km/h') + (o.braking ? '  ·  frenando ' + withUnit(o.ab, 2, 'm/s²') : ''), C.ink],
      ['θ = ' + withUnit(o.theta / DEG, 3, '°') + '   umbral ' + withUnit(o.thetaCritFront / DEG, 3, '°'), o.margin < 3 * DEG ? C.danger : o.margin < 8 * DEG ? C.warn : C.muted],
      ['Δx = ' + withUnit(o.dx * 1000, 3, 'mm') + '   Fs = ' + withUnit(o.Fs, 4, 'N'), C.muted]
    ];
    var w = 0;
    for (var i = 0; i < lines.length; i++) w = Math.max(w, ctx.measureText(lines[i][0]).width);
    ctx.fillStyle = C.bg;
    ctx.globalAlpha = 0.82;
    this.roundRect(ctx, x - 6, y - 5, w + 12, lines.length * 17 + 8, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
    for (var j = 0; j < lines.length; j++) {
      ctx.fillStyle = lines[j][1];
      ctx.fillText(lines[j][0], x, y + j * 17);
    }
    // Barra de margen de estabilidad (abajo a la derecha): verde → ámbar → rojo.
    var bw = Math.min(160, this.w * 0.3), bh = 8;
    var bx = this.w - bw - 12, by = this.h - 24;
    var frac = clamp(o.margin / (25 * DEG), 0, 1);
    ctx.fillStyle = C.surface;
    this.roundRect(ctx, bx, by, bw, bh, 4);
    ctx.fill();
    ctx.fillStyle = frac < 0.15 ? C.danger : frac < 0.35 ? C.warn : C.spring;
    this.roundRect(ctx, bx, by, Math.max(2, bw * frac), bh, 4);
    ctx.fill();
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('margen de vuelco ' + withUnit(o.margin / DEG, 3, '°'), bx + bw, by - 3);
    if (this.zoom) this.label(ctx, 'Zoom al marco y amortiguador', this.w - 12, 16, C.muted, 'right');
  };

  Scene.prototype.roundRect = function (ctx, x, y, w, hh, r) {
    r = Math.min(r, w / 2, hh / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + hh - r);
    ctx.quadraticCurveTo(x + w, y + hh, x + w - r, y + hh);
    ctx.lineTo(x + r, y + hh);
    ctx.quadraticCurveTo(x, y + hh, x, y + hh - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  /* ------------------------------------------------------------------ diagrama de bloques (SVG) */

  var DIAGRAM = {
    w: 820, h: 300,
    sum1: [92, 190], sum2: [596, 190], r: 15,
    GC: [160, 162, 80, 56], GV: [298, 162, 80, 56], G2: [436, 162, 80, 56], H: [658, 162, 80, 56],
    G1: [556, 42, 80, 56],
    out: 800, fbY: 262, liveY: 240
  };

  /** Construye el SVG del diagrama con sus bloques, sumadores, señales y valores en vivo. */
  function buildDiagram(onPick, onHover) {
    var D = DIAGRAM;
    var root = svg('svg', {
      class: 'bk-diagram',
      viewBox: '0 0 ' + D.w + ' ' + D.h,
      role: 'group',
      'aria-label': 'Diagrama de bloques del lazo cerrado: referencia C set, sumador, G C, G V, G 2, segundo sumador con la perturbación Q por G 1, planta H y salida C realimentada',
      'data-testid': 'bk-diagram'
    });
    var defs = svg('defs');
    var marker = svg('marker', { id: util.uid('bk-arrow'), viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    marker.appendChild(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'bk-diagram__head' }));
    defs.appendChild(marker);
    root.appendChild(defs);
    var arrowUrl = 'url(#' + marker.getAttribute('id') + ')';
    var wires = svg('g', { class: 'bk-diagram__wires' });
    var nodes = svg('g', { class: 'bk-diagram__nodes' });
    var labels = svg('g', { class: 'bk-diagram__labels' });
    root.appendChild(wires);
    root.appendChild(nodes);
    root.appendChild(labels);
    var items = {};   // id → { el, kind }
    var lives = {};   // id → <text> con el valor en vivo

    function wire(d, flow) {
      var p = svg('path', { d: d, class: 'bk-diagram__wire', 'marker-end': arrowUrl });
      wires.appendChild(p);
      if (flow) {
        var f = svg('path', { d: d, class: 'bk-diagram__flow', 'aria-hidden': 'true' });
        wires.appendChild(f);
      }
      return p;
    }
    function text(x, y, parts, cls, anchor) {
      var t = svg('text', { x: x, y: y, class: cls || 'bk-diagram__text', 'text-anchor': anchor || 'middle' });
      parts.forEach(function (pt) {
        if (typeof pt === 'string') t.appendChild(svg('tspan', null, pt));
        else t.appendChild(svg('tspan', { 'baseline-shift': pt.sup ? 'super' : 'sub', 'font-size': '72%' }, pt.sup || pt.sub));
      });
      return t;
    }
    function interactive(id, el, label, kind) {
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', label);
      el.setAttribute('aria-pressed', 'false');
      el.setAttribute('data-id', id);
      el.setAttribute('data-testid', 'bk-diagram-' + id);
      el.classList.add('bk-diagram__hit');
      el.addEventListener('click', function () { onPick(id, kind); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(id, kind); }
      });
      el.addEventListener('mouseenter', function () { onHover(id, kind, true); });
      el.addEventListener('mouseleave', function () { onHover(id, kind, false); });
      el.addEventListener('focus', function () { onHover(id, kind, true); });
      el.addEventListener('blur', function () { onHover(id, kind, false); });
      items[id] = { el: el, kind: kind };
    }
    function block(id, box, main, subscript, title) {
      var g = svg('g', { class: 'bk-diagram__block' });
      g.appendChild(svg('rect', { x: box[0], y: box[1], width: box[2], height: box[3], rx: 8 }));
      var t = text(box[0] + box[2] / 2, box[1] + box[3] / 2 + 6, [main, { sub: subscript }, '(s)'], 'bk-diagram__text bk-diagram__text--block');
      g.appendChild(t);
      nodes.appendChild(g);
      interactive(id, g, 'Bloque ' + main + ' ' + subscript + '(s): ' + title, 'block');
      return g;
    }
    function sum(c, signs) {
      var g = svg('g', { class: 'bk-diagram__sum' });
      g.appendChild(svg('circle', { cx: c[0], cy: c[1], r: D.r }));
      g.appendChild(svg('path', { d: 'M ' + (c[0] - D.r * 0.7) + ' ' + (c[1] - D.r * 0.7) + ' L ' + (c[0] + D.r * 0.7) + ' ' + (c[1] + D.r * 0.7) + ' M ' + (c[0] + D.r * 0.7) + ' ' + (c[1] - D.r * 0.7) + ' L ' + (c[0] - D.r * 0.7) + ' ' + (c[1] + D.r * 0.7), class: 'bk-diagram__sumx' }));
      signs.forEach(function (s) { g.appendChild(text(c[0] + s[0], c[1] + s[1], [s[2]], 'bk-diagram__text bk-diagram__text--sign')); });
      nodes.appendChild(g);
      return g;
    }
    function signal(id, x, y, parts, title, anchor, liveY) {
      var g = svg('g', { class: 'bk-diagram__signal' });
      // Zona de impacto invisible que cubre el rótulo y su valor en vivo (los textos solos dejan huecos).
      var hx = anchor === 'end' ? x - 96 : anchor === 'start' ? x : x - 48;
      var top = Math.min(y, liveY === undefined ? y + 15 : liveY) - 16;
      var bottom = Math.max(y, liveY === undefined ? y + 15 : liveY) + 6;
      g.appendChild(svg('rect', { x: hx, y: top, width: 96, height: bottom - top, rx: 6, class: 'bk-diagram__hitbox' }));
      g.appendChild(text(x, y, parts, 'bk-diagram__text bk-diagram__text--signal', anchor));
      var live = svg('text', { x: x, y: liveY === undefined ? y + 15 : liveY, class: 'bk-diagram__text bk-diagram__text--live', 'text-anchor': anchor || 'middle', 'data-live': id });
      live.appendChild(svg('tspan', null, '—'));
      lives[id] = live;
      g.appendChild(live);
      labels.appendChild(g);
      interactive(id, g, 'Señal ' + title, 'signal');
      return g;
    }

    var s1 = D.sum1, s2 = D.sum2;
    // Cables del camino directo.
    wire('M 18 ' + s1[1] + ' H ' + (s1[0] - D.r), true);
    wire('M ' + (s1[0] + D.r) + ' ' + s1[1] + ' H ' + D.GC[0], true);
    wire('M ' + (D.GC[0] + D.GC[2]) + ' ' + s1[1] + ' H ' + D.GV[0], true);
    wire('M ' + (D.GV[0] + D.GV[2]) + ' ' + s1[1] + ' H ' + D.G2[0], true);
    wire('M ' + (D.G2[0] + D.G2[2]) + ' ' + s1[1] + ' H ' + (s2[0] - D.r), true);
    wire('M ' + (s2[0] + D.r) + ' ' + s2[1] + ' H ' + D.H[0], true);
    wire('M ' + (D.H[0] + D.H[2]) + ' ' + s2[1] + ' H ' + D.out, true);
    // Perturbación por arriba.
    wire('M 478 ' + (D.G1[1] + D.G1[3] / 2) + ' H ' + D.G1[0], true);
    wire('M ' + (D.G1[0] + D.G1[2] / 2) + ' ' + (D.G1[1] + D.G1[3]) + ' V ' + (s2[1] - D.r), true);
    // Realimentación por abajo (sin punta hasta el sumador).
    var fbX = D.H[0] + D.H[2] + 40;
    wires.appendChild(svg('circle', { cx: fbX, cy: s2[1], r: 4, class: 'bk-diagram__tap' }));
    wire('M ' + fbX + ' ' + s2[1] + ' V ' + D.fbY + ' H ' + s1[0] + ' V ' + (s1[1] + D.r), true);

    sum(s1, [[-D.r - 7, -9, '+'], [-11, D.r + 16, '−']]);
    sum(s2, [[-D.r - 8, -9, '+'], [11, -D.r - 5, '+']]);

    block('GC', D.GC, 'G', 'C', 'controlador biomecánico del ciclista');
    block('GV', D.GV, 'G', 'V', 'actuador de desplazamiento corporal');
    block('G2', D.G2, 'G', '2', 'dinámica estructural del marco y basculante');
    block('G1', D.G1, 'G', '1', 'filtro de perturbación de baches y pendiente');
    block('H', D.H, 'H', '', 'planta del amortiguador y la suspensión');

    signal('Cset', 42, s1[1] - 22, ['C', { sup: 'set' }, '(s)'], 'C set: referencia de inclinación del chasis', 'middle', D.liveY);
    signal('E', (s1[0] + D.r + D.GC[0]) / 2, s1[1] - 12, ['E(s)'], 'E: error del lazo', 'middle', D.liveY);
    signal('M', (D.GC[0] + D.GC[2] + D.GV[0]) / 2, s1[1] - 12, ['M(s)'], 'M: mando muscular', 'middle', D.liveY);
    signal('Mag', (D.GV[0] + D.GV[2] + D.G2[0]) / 2 - 3, s1[1] - 12, ['Ṁ', { sub: 'ag' }, '(s)'], 'M punto ag: velocidad del torso', 'middle', D.liveY);
    signal('Q', 466, D.G1[1] + D.G1[3] / 2 - 8, ['Q', { sub: 'baches' }, '(s)'], 'Q: perturbación de baches y pendiente', 'end', D.G1[1] + D.G1[3] / 2 + 16);
    signal('Treac', (s2[0] + D.r + D.H[0]) / 2 - 2, s2[1] - 12, ['T', { sub: 'reac' }, '(s)'], 'T reac: fuerza de reacción total', 'middle', D.liveY);
    signal('C', D.out - 16, s2[1] - 22, ['C(s)'], 'C: desplazamiento de la masa suspendida (salida)', 'middle', D.liveY);
    labels.appendChild(text(D.G1[0] + D.G1[2] / 2 + 70, D.G1[1] + D.G1[3] / 2 + 5, ['perturbación'], 'bk-diagram__text bk-diagram__text--note', 'start'));
    labels.appendChild(text(s1[0] + 180, D.fbY + 16, ['realimentación negativa de C(s)'], 'bk-diagram__text bk-diagram__text--note', 'middle'));

    return {
      el: root,
      items: items,
      setPressed: function (id) {
        for (var k in items) items[k].el.setAttribute('aria-pressed', String(k === id));
      },
      setHover: function (id, on) {
        var it = items[id];
        if (it) it.el.classList.toggle('is-hover', !!on);
      },
      live: function (id, textValue) {
        var t = lives[id];
        if (t && t.textContent !== textValue) t.textContent = textValue;
      }
    };
  }

  /* ------------------------------------------------------------------ montaje */

  function mount(el) {
    var ui = DSL.ui;
    var charts = DSL.viz && DSL.viz.charts;
    var latex = latexLib();
    var alive = true;
    var cleanups = [];
    var timers = [];

    function reduced() { return !!(DSL.prefs && DSL.prefs.reducedMotion); }
    function later(fn, ms) {
      var id = setTimeout(function () {
        var i = timers.indexOf(id);
        if (i >= 0) timers.splice(i, 1);
        if (alive) fn();
      }, ms);
      timers.push(id);
      return id;
    }
    function cancel(id) {
      if (id === null || id === undefined) return null;
      clearTimeout(id);
      var i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
      return null;
    }
    function renderTex(target, tex, display) {
      if (latex && typeof latex.render === 'function') latex.render(target, tex, { display: !!display });
      else target.textContent = tex;
      return target;
    }
    function texSpan(tex, cls) { return renderTex(h('span', { class: cls || 'ds-math', translate: 'no' }), tex, false); }
    function texBlock(tex) { return renderTex(h('div', { class: 'ds-math-block', translate: 'no' }), tex, true); }

    /* ---------------------------------------------------------------- modelo y estado de la vista */

    var lab = new BikeSuspensionLab();
    var app = { playing: false, speed: 1, zoom: false, fall: null, fallClock: 0, tableClock: 0, readClock: 0, view: 'algebra', pick: null, pickKind: null };
    var scene = null;
    var loop = null;
    var chartsList = [];
    var sliders = [];
    var readouts = [];
    var diagram = null;
    var tfState = { timer: null, dirty: true };

    /* ---------------------------------------------------------------- cabecera de la tarjeta */

    var titleId = util.uid('bk-title');
    var head = h('div', { class: 'bk-head' },
      h('span', { class: 'bk-head__icon', 'aria-hidden': 'true' }, ui.icon('bike', { size: 24 })),
      h('div', { class: 'bk-head__main' },
        h('h3', { class: 'bk-head__title', id: titleId, 'data-testid': 'bk-title' }, 'Laboratorio avanzado: dinámica de marco de doble suspensión, vectores de fuerza y control en lazo cerrado'),
        h('p', { class: 'bk-lead' }, 'Un ciclista desciende una cresta con baches sobre una bicicleta de doble suspensión. Cambie en vivo la velocidad, las masas, la posición del cuerpo, la pendiente, los baches y el resorte y amortiguador: la escena, los vectores de fuerza, las gráficas y las funciones de transferencia del lazo de control se actualizan al instante. Si el momento de vuelco supera el límite, el ciclista cae.')),
      h('div', { class: 'bk-head__chips' },
        ui.chip({ label: 'Mecánico', testid: 'bk-chip-category' }),
        ui.chip({ label: 'Lazo cerrado PID', tone: 'accent' }),
        ui.chip({ label: 'Segundo orden + no lineal', tone: 'info', title: 'La suspensión es lineal; la caída, la saturación del torso y la frenada no.' })));

    /* ---------------------------------------------------------------- visor: escena + gráficas + dock */

    var canvas = h('canvas', { class: 'bk-canvas', 'data-testid': 'bk-canvas' });
    var summaryId = util.uid('bk-summary');
    var summary = h('p', { class: 'sr-only', id: summaryId, 'data-testid': 'bk-summary' });
    var stage = h('div', {
      class: 'bk-stage',
      role: 'img',
      'aria-label': 'Escena del descenso: bicicleta de doble suspensión con ciclista, terreno con baches y vectores de fuerza.',
      'aria-describedby': summaryId,
      'data-testid': 'bk-stage'
    }, canvas);

    var zoomBtn = ui.button({
      label: 'Zoom al marco y amortiguador', icon: 'zoom-in', variant: 'secondary', size: 'sm', pressed: false,
      testid: 'bk-zoom',
      onClick: function (e, pressed) { setZoom(pressed); }
    });
    var layerBtns = {};
    var layersBox = h('div', { class: 'bk-layers', role: 'group', 'aria-label': 'Capas de vectores de fuerza' },
      h('span', { class: 'bk-layers__title' }, 'Vectores:'));
    [['W', 'Peso W', 'weight'], ['N', 'Normales N', 'normal'], ['Fs', 'Resorte y amortiguador Fs', 'spring'], ['inertia', 'Inercia y momento τ', 'inertia']].forEach(function (d) {
      var b = ui.button({
        label: d[1], variant: 'ghost', size: 'sm', pressed: true, testid: 'bk-layer-' + d[0],
        className: 'bk-layer bk-layer--' + d[2],
        onClick: function (e, pressed) { if (scene) scene.layers[d[0]] = pressed; requestPaint(); }
      });
      layerBtns[d[0]] = b;
      layersBox.appendChild(b);
    });
    var tools = h('div', { class: 'bk-tools' }, zoomBtn, layersBox);

    var fallTitle = h('strong', { class: 'bk-fall__title' });
    var fallText = h('p', { class: 'bk-fall__text' });
    var retryBtn = ui.button({ label: 'Reintentar', icon: 'rotate-ccw', variant: 'primary', testid: 'bk-retry', onClick: function () { retry(); } });
    var fallBox = h('div', { class: 'bk-fall', role: 'alert', 'data-testid': 'bk-fall' },
      h('span', { class: 'bk-fall__icon' }, ui.icon('triangle-alert', { size: 22 })),
      h('div', { class: 'bk-fall__body' }, fallTitle, fallText, h('div', { class: 'bk-fall__actions' }, retryBtn)));
    fallBox.hidden = true;

    var chartsBox = h('div', { class: 'bk-charts', 'data-testid': 'bk-charts' });
    var dataRow = h('div', { class: 'bk-data', 'data-testid': 'bk-data' });
    var dock = h('div', { class: 'bk-dock ds-glass', 'data-testid': 'bk-dock' });
    var viewer = h('div', { class: 'bk-viewer', 'data-testid': 'bk-viewer' },
      tools,
      h('div', { class: 'bk-main' }, h('div', { class: 'bk-scenewrap' }, stage, summary, fallBox), chartsBox),
      dock);

    /* ---------------------------------------------------------------- paneles de parámetros */

    var panelsBox = h('div', { class: 'bk-panels' });
    var restoreBtn = ui.button({
      label: 'Restablecer parámetros', icon: 'sliders-horizontal', variant: 'ghost', size: 'sm', testid: 'bk-params-restore',
      onClick: function () { restoreParams(); }
    });
    var readList = h('div', { class: 'bk-readouts', 'data-testid': 'bk-readouts' });

    /* ---------------------------------------------------------------- funciones de transferencia */

    var tfTitleId = util.uid('bk-tft');
    var algebraBox = h('div', { class: 'bk-algebra', 'data-testid': 'bk-algebra' });
    var diagramBox = h('div', { class: 'bk-diagrambox', 'data-testid': 'bk-diagrambox' });
    var detailBox = h('div', { class: 'ds-panel bk-detail', 'data-testid': 'bk-detail', 'aria-live': 'off' });
    var viewSeg = ui.segmented({
      label: 'Modo de visualización del lazo',
      options: [{ value: 'algebra', label: 'Vista algebraica', icon: 'sigma' }, { value: 'diagram', label: 'Diagrama de bloques', icon: 'git-branch' }],
      value: 'algebra', equal: false, testid: 'bk-view',
      onChange: function (v) { setView(v); }
    });
    var verdictChip = h('span', { class: 'bk-verdict', 'data-testid': 'bk-verdict' });
    var tfSection = h('section', { class: 'bk-tf', 'aria-labelledby': tfTitleId },
      h('div', { class: 'bk-tf__head' },
        h('div', null,
          h('h4', { class: 'bk-tf__title', id: tfTitleId }, 'Funciones de transferencia y diagrama de bloques del lazo'),
          h('p', { class: 'bk-tf__lead' }, 'Cada bloque se calcula con los parámetros actuales en el dominio de Laplace. Elija la vista y pulse o pase el cursor por un bloque o una señal para ver su ecuación, sus polos y ceros, sus valores en vivo y su papel en la bicicleta.')),
        h('div', { class: 'bk-tf__controls' }, h('div', { class: 'bk-seg-wrap' }, viewSeg.el), verdictChip)),
      algebraBox, diagramBox, detailBox);
    diagramBox.hidden = true;

    var root = h('article', { class: 'bk is-pending', 'aria-labelledby': titleId, 'data-testid': 'bk-root' }, head, viewer, dataRow, panelsBox, tfSection);
    el.appendChild(root);

    /* ---------------------------------------------------------------- transporte y freno */

    var transport = ui.transport({
      playing: false, speed: 1, timeLabel: 't', timeUnit: 's', timeDecimals: 2,
      label: 'Controles del descenso', testidPrefix: 'bk',
      onPlay: function () { play(); },
      onPause: function () { pause(); },
      onReset: function () { restart(); },
      onSpeed: function (x) { app.speed = x; }
    });
    var brakeBtn = ui.button({
      label: 'Frenar', icon: 'octagon-x', variant: 'secondary', pressed: false, testid: 'bk-brake',
      title: 'Aplica la deceleración a_b mientras está activo. Frenar en un bache o en una pendiente fuerte tumba al ciclista hacia delante.',
      className: 'bk-brake',
      onClick: function (e, pressed) { setBrake(pressed); }
    });
    dock.appendChild(transport.el);
    dock.appendChild(brakeBtn);

    function setBrake(on) {
      lab.brake(on);
      brakeBtn.classList.toggle('is-braking', !!on);
      if (!app.playing) { lab.measure(); requestPaint(); }
    }

    function setZoom(on) {
      app.zoom = !!on;
      if (scene) scene.setZoom(app.zoom);
      root.classList.toggle('is-zoom', app.zoom);
      requestPaint();
    }

    /* ---------------------------------------------------------------- bucle */

    function ensureLoop() {
      if (loop) return;
      loop = util.loop(tick, { element: viewer, rootMargin: '64px' });
    }

    function syncLoop() {
      if (!loop) return;
      if (app.playing || app.fall) loop.start();
      else loop.stop();
    }

    function setPlaying(on) {
      app.playing = !!on;
      transport.setPlaying(app.playing);
      syncLoop();
    }

    function play() {
      if (lab.halted) { retry(); }
      setPlaying(true);
    }
    function pause() {
      setPlaying(false);
      refreshTables();
      requestPaint();
    }
    function restart() {
      lab.reset();
      app.fall = null;
      app.fallClock = 0;
      fallBox.hidden = true;
      brakeBtn.setAttribute('aria-pressed', 'false');
      brakeBtn.classList.remove('is-braking');
      lab.brake(false);
      chartsList.forEach(function (c) { c.handle.clear(); });
      transport.setTime(0);
      pushSample(true);
      requestPaint();
    }
    function retry() {
      restart();
      setPlaying(true);
      if (retryBtn.ownerDocument && retryBtn.ownerDocument.activeElement === retryBtn) {
        var play1 = dock.querySelector('[data-testid="bk-play"]');
        if (play1) play1.focus({ preventScroll: true });
      }
    }

    function tick(dt) {
      if (!alive) return;
      if (app.fall) {
        app.fall.t += reduced() ? FALL_ANIM_S : dt;
        if (app.fall.t >= FALL_ANIM_S) {
          app.fall.t = FALL_ANIM_S;
          loop.stop();
        }
        paint(dt);
        return;
      }
      if (!app.playing) return;
      var simDt = dt * app.speed;
      var fall = lab.step(simDt);
      lab.measure();
      pushSample(false);
      paint(dt);
      transport.setTime(lab.t);
      app.tableClock += dt;
      if (app.tableClock * 1000 >= TABLE_REFRESH_MS) { app.tableClock = 0; refreshTables(); }
      app.readClock += dt;
      if (app.readClock * 1000 >= READOUT_MS) { app.readClock = 0; updateReadouts(); updateLive(); }
      if (fall) onFall(fall);
    }

    function onFall(fall) {
      app.fall = { kind: fall.kind, t: 0 };
      app.playing = false;
      transport.setPlaying(false);
      fallTitle.textContent = FALL_ANNOUNCE[fall.kind];
      fallText.textContent = 'El ángulo de estabilidad θ = ' + withUnit(fall.theta / DEG, 3, '°') + ' superó el umbral crítico de ' +
        withUnit(fall.limit / DEG, 3, '°') + '. ' + (fall.kind === 'otb'
          ? 'Reduzca la pendiente o la frenada, lleve el centro de masas hacia atrás o suba K_d para que el ciclista reaccione antes.'
          : 'Lleve el centro de masas hacia delante o reduzca la altura de los baches para no levantar la rueda delantera.');
      fallText.setAttribute('data-kind', fall.kind);
      fallBox.hidden = false;           // role="alert": el lector de pantalla lo anuncia al aparecer
      updateReadouts();
      updateLive();
      refreshTables();
      syncLoop();
    }

    var paintFrame = null;
    function requestPaint() {
      if (paintFrame !== null || (loop && loop.isActive())) return;
      paintFrame = util.raf(function () {
        paintFrame = null;
        if (!alive) return;
        paint(0);
        updateReadouts();
        updateLive();
      });
    }

    var frame = { o: null, params: null, fall: null, field: null };
    function paint(dt) {
      if (!scene) return;
      frame.o = lab.out;
      frame.field = lab.field;
      frame.params = lab.params;
      frame.fall = app.fall;
      scene.draw(frame, dt);
      updateSummary();
    }

    var summaryClock = 0;
    function updateSummary() {
      var o = lab.out;
      var now = util.now();
      if (now - summaryClock < 500) return;
      summaryClock = now;
      var txt = 't = ' + withUnit(lab.t, 2, 's') + '. Velocidad ' + withUnit(o.v * 3.6, 3, 'km/h') +
        (o.braking ? ', frenando' : '') + '. Ángulo de estabilidad ' + withUnit(o.theta / DEG, 3, '°') +
        ' frente a un umbral de ' + withUnit(o.thetaCritFront / DEG, 3, '°') + '. Compresión del amortiguador ' +
        withUnit(o.dx * 1000, 3, 'mm') + '. ' + (app.fall ? FALL_ANNOUNCE[app.fall.kind] : 'El ciclista mantiene el control.');
      if (summary.textContent !== txt) summary.textContent = txt;
    }

    /* ---------------------------------------------------------------- gráficas */

    var CHARTS = [
      { id: 'dx', yLabel: 'Longitud (mm)', aria: 'Serie temporal: compresión del amortiguador y perfil del terreno',
        series: [{ key: 'dx', label: 'Compresión Δx', color: '--c-out', unit: 'mm' }, { key: 'zr', label: 'Perfil del terreno z_r', color: '--c-in', dash: true, unit: 'mm' }],
        values: function (o) { return { dx: o.dx * 1000, zr: o.zr * 1000 }; } },
      { id: 'theta', yLabel: 'Ángulo (°)', aria: 'Serie temporal: ángulo de estabilidad frente al umbral crítico de caída',
        series: [{ key: 'theta', label: 'Ángulo de estabilidad θ', color: '--c-state', unit: '°' }, { key: 'crit', label: 'Umbral de vuelco frontal', color: '--c-pole', dash: true, unit: '°' }, { key: 'critR', label: 'Umbral de vuelco trasero', color: '--c-pole', dash: [2, 3], unit: '°' }],
        values: function (o) { return { theta: o.theta / DEG, crit: o.thetaCritFront / DEG, critR: o.thetaCritRear / DEG }; } },
      { id: 'fs', yLabel: 'Fuerza (N)', aria: 'Serie temporal: fuerza en el amortiguador (esfuerzo en el marco)',
        series: [{ key: 'fs', label: 'Fuerza en el amortiguador F_s', color: '--c-zero', unit: 'N' }, { key: 'treac', label: 'Reacción total T_reac', color: '--c-series-5', dash: true, unit: 'N' }],
        values: function (o) { return { fs: o.Fs, treac: o.Treac }; } }
    ];

    function addChart(spec) {
      if (!charts || typeof charts.createTimeChart !== 'function') return;
      var testid = 'bk-chart-' + spec.id;
      var cv = h('canvas', { 'data-testid': testid });
      var fr = h('div', { class: 'ch-frame bk-chart' }, cv);
      chartsBox.appendChild(fr);
      var handle = charts.createTimeChart(cv, {
        series: spec.series,
        xLabel: 'Tiempo t (s)', xSymbol: 't', xUnit: 's',
        yLabel: spec.yLabel,
        window: CHART_WINDOW_S,
        yRange: 'auto',
        maxPoints: 2400,
        ariaLabel: spec.aria,
        testid: testid
      });
      var toggle = typeof charts.dataToggle === 'function' ? charts.dataToggle(handle, {
        container: dataRow,
        label: 'Ver datos: ' + spec.yLabel.toLowerCase(),
        hideLabel: 'Ocultar datos: ' + spec.yLabel.toLowerCase(),
        testid: testid
      }) : null;
      chartsList.push({ spec: spec, handle: handle, toggle: toggle, frame: fr });
    }

    var lastPushT = null;
    function pushSample(force) {
      if (!chartsList.length) return;
      var t = lab.t;
      if (!force && lastPushT !== null && t - lastPushT < CHART_WINDOW_S / 1200) return;
      lastPushT = t;
      var o = lab.out;
      for (var i = 0; i < chartsList.length; i++) chartsList[i].handle.push(t, chartsList[i].spec.values(o));
    }

    function refreshTables() {
      chartsList.forEach(function (c) { if (c.toggle && c.toggle.isOpen()) c.toggle.refresh(); });
    }

    /* ---------------------------------------------------------------- deslizadores */

    function makeSlider(spec) {
      var s = ui.slider({
        label: spec.label,
        symbol: spec.sym,
        unit: spec.unit,
        min: spec.min, max: spec.max, step: spec.step,
        value: round(lab.params[spec.key] / spec.factor, 6),
        defaultValue: spec.def,
        tooltip: spec.tip,
        testid: 'bk-param-' + spec.key,
        onInput: function (v) { applyParam(spec.key, v * spec.factor, false); },
        onChange: function (v) { applyParam(spec.key, v * spec.factor, true); }
      });
      var sym = s.el.querySelector('.ds-slider__sym');
      if (sym && latex && latex.available && latex.available()) latex.render(sym, spec.tex);
      return { slider: s, spec: spec };
    }

    function buildPanels() {
      GROUPS.forEach(function (g, gi) {
        var tid = util.uid('bk-pt');
        var list = h('div', { class: 'bk-sliders', 'data-testid': 'bk-params-' + g.id });
        g.params.forEach(function (spec) {
          var s = makeSlider(spec);
          sliders.push(s);
          list.appendChild(s.slider.el);
        });
        var headRow = h('div', { class: 'bk-panel__head' },
          h('h4', { class: 'bk-panel__title', id: tid }, ui.icon(g.icon, { size: 18 }), ' ', g.title),
          gi === 0 ? restoreBtn : null);
        panelsBox.appendChild(h('section', { class: 'ds-panel bk-panel bk-panel--' + g.id, 'aria-labelledby': tid }, headRow, list));
      });
      var rid = util.uid('bk-rt');
      panelsBox.appendChild(h('section', { class: 'ds-panel bk-panel bk-panel--read', 'aria-labelledby': rid },
        h('div', { class: 'bk-panel__head' }, h('h4', { class: 'bk-panel__title', id: rid }, ui.icon('gauge', { size: 18 }), ' ', 'Lecturas en vivo')),
        readList));
      paintRestore();
    }

    function applyParam(key, value, commit) {
      var o = {};
      o[key] = value;
      lab.setParams(o);
      lab.measure();
      paintRestore();
      tfState.dirty = true;
      scheduleTf(commit ? 0 : TF_REFRESH_MS);
      if (!app.playing) requestPaint();
    }

    function paintRestore() {
      var dirty = sliders.some(function (s) { return Math.abs(lab.params[s.spec.key] - s.spec.def * s.spec.factor) > 1e-12; });
      if (!dirty && !restoreBtn.disabled && restoreBtn.ownerDocument && restoreBtn.ownerDocument.activeElement === restoreBtn) {
        var target = sliders[0] ? sliders[0].slider.el.querySelector('input[type="range"]') : null;
        if (target) target.focus({ preventScroll: true });
      }
      restoreBtn.disabled = !dirty;
    }

    function syncSliders() {
      sliders.forEach(function (s) { s.slider.set(round(lab.params[s.spec.key] / s.spec.factor, 6), { silent: true }); });
    }

    function restoreParams() {
      var before = Object.assign({}, lab.params);
      lab.setParams(defaults());
      lab.measure();
      syncSliders();
      paintRestore();
      tfState.dirty = true;
      scheduleTf(0);
      requestPaint();
      ui.toast('Parámetros restablecidos a sus valores por omisión.', {
        tone: 'neutral', testid: 'bk-toast',
        returnFocus: sliders[0] ? sliders[0].slider.el.querySelector('input[type="range"]') : null,
        action: {
          label: 'Deshacer',
          onClick: function () {
            if (!alive) return;
            lab.setParams(before);
            lab.measure();
            syncSliders();
            paintRestore();
            tfState.dirty = true;
            scheduleTf(0);
            requestPaint();
          }
        }
      });
    }

    /* ---------------------------------------------------------------- lecturas */

    var READOUTS = [
      { id: 'theta', label: 'Ángulo de estabilidad', tex: '\\theta', unit: '°', digits: 3, get: function (o) { return o.theta / DEG; }, tip: 'Ángulo del resultante de fuerzas más el cabeceo del chasis. Si supera el umbral, el ciclista cae.' },
      { id: 'margin', label: 'Margen hasta el vuelco', tex: '\\theta_{c} - \\theta', unit: '°', digits: 3, get: function (o) { return o.margin / DEG; }, tone: function (o) { return o.margin < 3 * DEG ? 'danger' : o.margin < 8 * DEG ? 'warning' : 'success'; }, tip: 'Distancia angular al umbral más cercano (frontal o trasero).' },
      { id: 'Nr', label: 'Normal trasera', tex: 'N_t', unit: 'N', digits: 4, get: function (o) { return o.Nr; } },
      { id: 'Nf', label: 'Normal delantera', tex: 'N_d', unit: 'N', digits: 4, get: function (o) { return o.Nf; } },
      { id: 'dx', label: 'Compresión del amortiguador', tex: '\\Delta x', unit: 'mm', digits: 3, get: function (o) { return o.dx * 1000; } },
      { id: 'Fs', label: 'Fuerza en el amortiguador', tex: 'F_s', unit: 'N', digits: 4, get: function (o) { return o.Fs; }, tip: 'k·Δx + c·Δẋ: esfuerzo que el marco transmite al amortiguador.' },
      { id: 'xt', label: 'Inclinación del torso (control)', tex: 'x_t', unit: 'cm', digits: 3, get: function (o) { return o.xt * 100; }, tip: 'Desplazamiento que el controlador ha pedido al torso; satura en ±35 cm.' },
      { id: 'E', label: 'Error del lazo', tex: 'E', unit: 'mm', digits: 3, get: function (o) { return o.E * 1000; } },
      { id: 'wn', label: 'Frecuencia natural de la suspensión', tex: '\\omega_n', unit: 'rad/s', digits: 3, get: function () { return lab.coeffs.wn; } },
      { id: 'zeta', label: 'Amortiguamiento relativo', tex: '\\zeta', unit: '', digits: 3, get: function () { return lab.coeffs.zeta; }, tone: function () { return lab.coeffs.zeta < 0.3 ? 'warning' : null; } }
    ];

    function buildReadouts() {
      var o = lab.out;
      READOUTS.forEach(function (r) {
        var ro = ui.readout({
          label: r.label, tex: r.tex, value: r.get(o), unit: r.unit, digits: r.digits,
          tone: r.tone ? r.tone(o) : null, tip: r.tip || null,
          testid: 'bk-readout-' + r.id, className: 'bk-readout'
        });
        readList.appendChild(ro.el);
        readouts.push({ r: r, ro: ro, tone: r.tone ? r.tone(o) : null });
      });
    }

    function updateReadouts() {
      if (!readouts.length) return;
      var o = lab.out;
      readouts.forEach(function (slot) {
        slot.ro.set(slot.r.get(o));
        var tone = slot.r.tone ? slot.r.tone(o) : null;
        if (tone !== slot.tone) {
          if (slot.tone) slot.ro.el.classList.remove('ds-readout--' + slot.tone);
          if (tone) slot.ro.el.classList.add('ds-readout--' + tone);
          slot.tone = tone;
        }
      });
    }

    /* ---------------------------------------------------------------- funciones de transferencia */

    var tfCache = null;   // { c, t, an: { id → analyze() } }

    function computeTf() {
      var c = lab.coeffs;
      var t = transferFunctions(c);
      var an = {};
      BLOCKS.forEach(function (b) { an[b.id] = analyze(b.tf(t)); });
      an.T = analyze(t.T);
      an.TQ = analyze(t.TQ);
      an.L = analyze(t.L);
      tfCache = { c: c, t: t, an: an };
      return tfCache;
    }

    function scheduleTf(ms) {
      if (!tfBuilt) return;
      if (tfState.timer !== null && ms > 0) return;
      tfState.timer = cancel(tfState.timer);
      tfState.timer = later(function () {
        tfState.timer = null;
        if (tfState.dirty) renderTf();
      }, ms);
    }

    var tfBuilt = false;
    var algebraRows = [];
    var TEX_T_SYM = 'T(s) = \\frac{C(s)}{C^{\\mathrm{set}}(s)} = \\frac{G_C(s)\\, G_V(s)\\, G_2(s)\\, H(s)}{1 + G_C(s)\\, G_V(s)\\, G_2(s)\\, H(s)}';
    var TEX_Q_SYM = 'C(s) = T(s)\\, C^{\\mathrm{set}}(s) + \\frac{G_1(s)\\, H(s)}{1 + G_C(s)\\, G_V(s)\\, G_2(s)\\, H(s)}\\, Q_{\\mathrm{baches}}(s)';

    function buildTf() {
      tfBuilt = true;
      BLOCKS.forEach(function (b) {
        var numEl = h('div', { class: 'bk-eq__num' });
        var rootsEl = h('p', { class: 'bk-eq__roots' });
        var pickBtn = ui.button({
          label: 'Ver detalle', icon: 'info', variant: 'ghost', size: 'sm', testid: 'bk-eq-pick-' + b.id,
          ariaLabel: 'Ver detalle de ' + b.title,
          onClick: function () { pick(b.id, 'block'); }
        });
        var row = h('div', { class: 'bk-eq', 'data-testid': 'bk-eq-' + b.id },
          h('div', { class: 'bk-eq__head' }, h('h5', { class: 'bk-eq__title' }, b.title), texSpan(b.name, 'ds-math bk-eq__sym'), pickBtn),
          texBlock(b.sym),
          numEl, rootsEl);
        row.addEventListener('click', function (e) {
          if (e.target && e.target.closest && e.target.closest('button') === pickBtn) return;
          pick(b.id, 'block');
        });
        algebraBox.appendChild(row);
        algebraRows.push({ id: b.id, row: row, numEl: numEl, rootsEl: rootsEl });
      });
      var tNum = h('div', { class: 'bk-eq__num' });
      var tRoots = h('p', { class: 'bk-eq__roots' });
      var tRow = h('div', { class: 'bk-eq bk-eq--global', 'data-testid': 'bk-eq-T' },
        h('div', { class: 'bk-eq__head' }, h('h5', { class: 'bk-eq__title' }, 'Función de transferencia global en lazo cerrado'), texSpan('T(s)', 'ds-math bk-eq__sym')),
        texBlock(TEX_T_SYM), tNum, tRoots,
        h('p', { class: 'bk-eq__note' }, 'Con la perturbación, la salida completa es:'),
        texBlock(TEX_Q_SYM));
      algebraBox.appendChild(tRow);
      algebraRows.push({ id: 'T', row: tRow, numEl: tNum, rootsEl: tRoots });
      diagram = buildDiagram(pick, hover);
      diagramBox.appendChild(diagram.el);
      diagramBox.appendChild(h('p', { class: 'bk-diagram__hint' }, 'Pulse un bloque o una señal (también con Tab e Intro) para ver su ecuación, polos y ceros, valores en vivo y explicación física.'));
      renderTf();
      pick('H', 'block');
    }

    function renderTf() {
      tfState.dirty = false;
      var cache = computeTf();
      algebraRows.forEach(function (r) {
        var an = cache.an[r.id];
        if (r.id === 'T') {
          r.numEl.textContent = '';
          r.numEl.appendChild(texBlock('T(s) = ' + texFrac(texPoly(cache.t.T.num), texPoly(cache.t.T.den))));
        } else {
          var b = blockById(r.id);
          r.numEl.textContent = '';
          r.numEl.appendChild(texBlock(b.numeric(cache.c)));
        }
        r.rootsEl.textContent = '';
        r.rootsEl.appendChild(h('span', null, 'Polos: '));
        r.rootsEl.appendChild(texSpan(texRoots(an.poles)));
        r.rootsEl.appendChild(h('span', null, ' · Ceros: '));
        r.rootsEl.appendChild(texSpan(texRoots(an.zeros)));
        if (r.id === 'T' && an.verdict) {
          r.rootsEl.appendChild(h('span', null, ' · Lazo cerrado ' + an.verdict + '.'));
        }
      });
      var T = cache.an.T;
      verdictChip.textContent = '';
      var tone = T.verdict === 'estable' ? 'success' : T.verdict === 'marginal' ? 'warning' : 'danger';
      verdictChip.appendChild(ui.chip({
        label: 'Lazo cerrado ' + (T.verdict || 'sin veredicto'), tone: tone,
        icon: T.verdict === 'estable' ? 'circle-check' : 'triangle-alert',
        title: T.reason || null
      }));
      if (app.pick) renderDetail();
    }

    function hover(id, kind, on) {
      if (diagram) diagram.setHover(id, on);
      if (on && app.pick !== id) renderDetail(id, kind, true);
      else if (!on && app.pick) renderDetail();
    }

    function pick(id, kind) {
      app.pick = id;
      app.pickKind = kind;
      if (diagram) diagram.setPressed(id);
      algebraRows.forEach(function (r) { r.row.classList.toggle('is-selected', r.id === id); });
      renderDetail();
    }

    /** Panel de detalle del bloque o señal elegido (o, al pasar el cursor, del señalado). */
    function renderDetail(id, kind, preview) {
      id = id || app.pick;
      kind = kind || app.pickKind;
      if (!id || !tfCache) return;
      detailBox.textContent = '';
      detailBox.classList.toggle('is-preview', !!preview);
      var o = lab.out;
      var c = tfCache.c;
      if (kind === 'block') {
        var b = blockById(id);
        var an = tfCache.an[id];
        var liveIn = liveSignalsFor(id, o);
        detailBox.appendChild(h('div', { class: 'bk-detail__head' },
          h('h5', { class: 'bk-detail__title' }, b.title),
          texSpan(b.name, 'ds-math bk-detail__sym')));
        detailBox.appendChild(texBlock(b.sym));
        detailBox.appendChild(texBlock(b.numeric(c)));
        var roots = h('p', { class: 'bk-detail__roots' });
        roots.appendChild(h('span', null, 'Polos: '));
        roots.appendChild(texSpan(texRoots(an.poles)));
        roots.appendChild(h('span', null, ' · Ceros: '));
        roots.appendChild(texSpan(texRoots(an.zeros)));
        if (an.verdict) roots.appendChild(h('span', null, ' · Bloque ' + an.verdict + (an.dc !== null && isFinite(an.dc) ? ', ganancia estática ' + fmt(an.dc, 4) : '') + '.'));
        detailBox.appendChild(roots);
        var liveList = h('dl', { class: 'bk-detail__live' });
        liveIn.forEach(function (it) {
          liveList.appendChild(h('div', null, h('dt', null, it[0]), h('dd', { translate: 'no' }, it[1])));
        });
        detailBox.appendChild(liveList);
        detailBox.appendChild(h('p', { class: 'bk-detail__role' }, b.role));
        var notes = b.notes(c);
        detailBox.appendChild(h('ul', { class: 'bk-detail__notes' }, notes.map(function (n) { return h('li', null, n); })));
      } else {
        var sg = signalById(id);
        detailBox.appendChild(h('div', { class: 'bk-detail__head' },
          h('h5', { class: 'bk-detail__title' }, sg.title),
          texSpan(sg.name, 'ds-math bk-detail__sym')));
        var val = signalValue(id, o);
        var dl = h('dl', { class: 'bk-detail__live' },
          h('div', null, h('dt', null, 'Valor en vivo'), h('dd', { translate: 'no' }, val)));
        detailBox.appendChild(dl);
        detailBox.appendChild(h('p', { class: 'bk-detail__role' }, sg.role));
        if (id === 'C') {
          detailBox.appendChild(h('p', { class: 'bk-detail__role' }, 'Ahora: cabeceo φ = ' + withUnit(o.phi / DEG, 3, '°') + ', ángulo del resultante θ_est = ' + withUnit(o.thetaStatic / DEG, 3, '°') + ', ángulo de estabilidad θ = ' + withUnit(o.theta / DEG, 3, '°') + '.'));
        }
      }
    }

    function signalValue(id, o) {
      switch (id) {
        case 'Cset': return withUnit(o.Cset * 1000, 3, 'mm');
        case 'E': return withUnit(o.E * 1000, 3, 'mm');
        case 'M': return fmt(o.M, 3);
        case 'Mag': return withUnit(o.Mag, 3, 'm/s');
        case 'Q': return withUnit(o.Q * 1000, 3, 'mm');
        case 'Treac': return withUnit(o.Treac, 4, 'N');
        case 'C': return withUnit(o.C * 1000, 3, 'mm');
        default: return '—';
      }
    }

    function liveSignalsFor(id, o) {
      switch (id) {
        case 'GC': return [['Entrada E', signalValue('E', o)], ['Salida M', signalValue('M', o)]];
        case 'GV': return [['Entrada M', signalValue('M', o)], ['Salida Ṁag', signalValue('Mag', o)], ['Posición del torso', withUnit(o.xt * 100, 3, 'cm')]];
        case 'G2': return [['Entrada Ṁag', signalValue('Mag', o)], ['Salida (fuerza del ciclista)', withUnit(o.F2, 4, 'N')]];
        case 'G1': return [['Entrada Q', signalValue('Q', o)], ['Salida (fuerza del terreno)', withUnit(o.F1, 4, 'N')]];
        case 'H': return [['Entrada T reac', signalValue('Treac', o)], ['Salida C', signalValue('C', o)], ['Compresión Δx', withUnit(o.dx * 1000, 3, 'mm')]];
        default: return [];
      }
    }

    var liveClock = 0;
    function updateLive() {
      if (!diagram) return;
      var o = lab.out;
      SIGNALS.forEach(function (sg) { diagram.live(sg.id, signalValue(sg.id, o)); });
      var now = util.now();
      if (app.pick && now - liveClock >= READOUT_MS * 3) {
        liveClock = now;
        var dds = detailBox.querySelectorAll('dd');
        if (dds.length && !detailBox.classList.contains('is-preview')) {
          if (app.pickKind === 'block') {
            var vals = liveSignalsFor(app.pick, o);
            for (var i = 0; i < dds.length && i < vals.length; i++) if (dds[i].textContent !== vals[i][1]) dds[i].textContent = vals[i][1];
          } else if (dds[0]) {
            var v = signalValue(app.pick, o);
            if (dds[0].textContent !== v) dds[0].textContent = v;
          }
        }
      }
    }

    function setView(v) {
      app.view = v;
      algebraBox.hidden = v !== 'algebra';
      diagramBox.hidden = v !== 'diagram';
      root.classList.toggle('is-diagram', v === 'diagram');
    }

    /* ---------------------------------------------------------------- escena */

    function buildScene() {
      scene = new Scene(canvas, stage);
      scene.setZoom(app.zoom);
      cleanups.push(util.observeSize(stage, function (size) {
        if (!alive || !scene) return;
        scene.resize(size.width, size.height);
      }));
      scene.resize(stage.clientWidth, stage.clientHeight);
      cleanups.push(DSL.bus.on('theme:change', function () {
        if (scene) { scene.colors = scene.readColors(); requestPaint(); }
      }));
      cleanups.push(DSL.bus.on('motion:change', function () { requestPaint(); }));
      lab.measure();
      paint(0);
    }

    /* ---------------------------------------------------------------- inicio perezoso por fases */

    var phase = { done: false, next: 0, lazy: null, ms: [] };
    var PHASES = [
      function () { ensureLoop(); buildScene(); },
      function () { buildPanels(); },
      function () { buildReadouts(); },
      function () { addChart(CHARTS[0]); },
      function () { addChart(CHARTS[1]); },
      function () { addChart(CHARTS[2]); },
      function () { buildTf(); },
      function () {
        phase.done = true;
        root.classList.remove('is-pending');
        pushSample(true);
        updateReadouts();
        updateLive();
        requestPaint();
        // Con movimiento reducido el laboratorio empieza en pausa; si no, arranca solo.
        setPlaying(!reduced());
      }
    ];

    function runPhase(i) {
      if (!alive || i < phase.next || i >= PHASES.length) return;
      phase.next = i + 1;
      var t0 = util.now();
      PHASES[i]();
      phase.ms[i] = Math.round(util.now() - t0);
    }

    function ensureInit() {
      if (phase.done || !alive) return;
      if (phase.lazy && typeof phase.lazy.ensure === 'function') phase.lazy.ensure();
      while (!phase.done && alive && phase.next < PHASES.length) runPhase(phase.next);
    }

    if (typeof util.lazyInit === 'function') {
      phase.lazy = util.lazyInit(root, PHASES.map(function (fn, i) { return function () { runPhase(i); }; }), { rootMargin: '200px' });
      cleanups.push(function () { if (phase.lazy && typeof phase.lazy.destroy === 'function') phase.lazy.destroy(); });
    } else {
      cleanups.push(util.onVisible(root, function (visible) { if (visible) ensureInit(); }, { once: true, rootMargin: '200px' }));
    }

    /* ---------------------------------------------------------------- handle */

    return {
      /** Completa en el acto las fases pendientes. */
      init: function () { ensureInit(); },
      lab: lab,
      setZoom: function (on) { zoomBtn.setAttribute('aria-pressed', String(!!on)); setZoom(on); },
      pick: function (id, kind) { ensureInit(); pick(id, kind || (blockById(id) ? 'block' : 'signal')); },
      state: function () {
        var o = lab.out;
        return {
          ready: phase.done,
          initPhases: phase.ms.slice(),
          playing: app.playing,
          running: !!(loop && loop.isActive()),
          zoom: app.zoom,
          view: app.view,
          pick: app.pick,
          braking: lab.braking,
          t: lab.t,
          speed: app.speed,
          halted: lab.halted,
          fall: app.fall ? app.fall.kind : null,
          params: Object.assign({}, lab.params),
          theta: o.theta, margin: o.margin, dx: o.dx, Fs: o.Fs, xt: o.xt,
          verdict: tfCache ? tfCache.an.T.verdict : null,
          charts: chartsList.map(function (c) {
            var st = c.handle && typeof c.handle.stats === 'function' ? c.handle.stats() : null;
            return { testid: 'bk-chart-' + c.spec.id, points: st ? st.points : 0 };
          })
        };
      },
      destroy: function () {
        if (!alive) return;
        alive = false;
        if (paintFrame !== null) util.cancelRaf(paintFrame);
        paintFrame = null;
        if (loop) loop.destroy();
        loop = null;
        tfState.timer = cancel(tfState.timer);
        chartsList.forEach(function (c) { if (c.toggle) c.toggle.destroy(); if (c.handle) c.handle.destroy(); });
        chartsList = [];
        sliders.forEach(function (s) { s.slider.destroy(); });
        readouts.forEach(function (r) { r.ro.destroy(); });
        viewSeg.destroy();
        transport.destroy();
        cleanups.forEach(function (fn) { try { fn(); } catch (err) { /* ya liberado */ } });
        cleanups = [];
        timers.slice().forEach(function (id) { clearTimeout(id); });
        timers = [];
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  DSL.sections.bikeLab = {
    mount: mount,
    BikeSuspensionLab: BikeSuspensionLab,
    helpers: {
      GEO: GEO,
      FIXED: FIXED,
      GROUPS: GROUPS,
      BLOCKS: BLOCKS,
      SIGNALS: SIGNALS,
      defaults: defaults,
      coefficients: coefficients,
      statics: statics,
      slopeDisplacement: slopeDisplacement,
      transferFunctions: transferFunctions,
      analyze: analyze,
      rootsOf: rootsOf,
      texRoots: texRoots,
      bumpField: bumpField,
      frameGeometry: frameGeometry,
      buildDiagram: buildDiagram,
      Scene: Scene
    }
  };
})(window.DSL);
