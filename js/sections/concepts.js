/*
 * js/sections/concepts.js — Propietario: hero-concepts.
 * Sección #conceptos → DSL.sections.concepts = { mount(el) → handle, helpers }.
 * Cuatro tarjetas con figuras calculadas en vivo por el motor (DSL.core y DSL.systems):
 *   a «¿Qué es un sistema dinámico?»: diagrama de bloques animado con conmutador de realimentación.
 *   b «La variable independiente: el tiempo t»: oscilador amortiguado que se recorre con t.
 *   c «Ecuaciones de representación»: EDO frente a ecuación en diferencias (paso T).
 *   d «Linealidad vs. no linealidad»: superposición (depósito lineal / Torricelli) y métodos
 *     numéricos (Euler, Heun, RK4 frente a RK45) sobre el péndulo no lineal.
 * Al montar: DOM, KaTeX compuesto y los textos baratos (la altura final de cada tarjeta queda fija). Después,
 * cada tarjeta se prepara por fases (DSL.util.lazyInit o localLazy): al acercarse a la vista o en reposo.
 * Escucha concepts:open { card, tab }. API: docs/api/hero-concepts.md.
 */
(function (DSL) {
  'use strict';

  var util = DSL.util;
  var h = util.h;
  var svg = util.svg;
  var fmt = util.formatNumber;
  var NB = '\u00A0';

  function N() { return DSL.core.numeric; }
  function TFc() { return DSL.core.tf.TransferFunction; }
  function LX() { return DSL.core.latex; }
  function UI() { return DSL.ui; }
  function CH() { return DSL.viz && DSL.viz.charts; }
  function reduced() { return !!DSL.prefs.reducedMotion; }
  function noop() {}
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

  /* ================================================================== datos fijos de las figuras */

  // a: masa-resorte-amortiguador; lazo abierto con F = 2 N o cerrado con u = K·(r − y)
  var SYS = Object.freeze({ m: 1, b: 1.2, k: 2, F: 2, K: 6, r: 1, T: 10, n: 401, tPre: 0.6, speed: 2 });
  var U_RANGE = [-1.5, 6.5];
  var Y_RANGE = [0, 1.6];
  // b: oscilador libre amortiguado
  var OSC = Object.freeze({ m: 1, b: 0.5, k: 6, x0: 0.2, T: 10, n: 1001 });
  // c: primer orden dy/dt = −a·y + a·u con u = 1
  var CAP = 6;
  // d (i): depósitos (Torricelli y el lineal equivalente en el punto de operación)
  var TANK = Object.freeze({ A: 0.5, a: 0.01, qin0: 0.03, T: 120, dt: 0.1, t1: 30, w2: 40 });
  // d (ii): péndulo no lineal sin rozamiento. Referencia RK45 a rtol 1e-13; su error se estima una vez
  // por θ₀ como |ref(rtol 1e-13) − ref(rtol 1e-12)| y el orden observado solo se muestra si los dos
  // errores del par superan refFactor veces esa estimación.
  var PEND = Object.freeze({
    L: 1, c: 0, T: 10, refRtol: 1e-13, refAtol: 1e-15, estRtol: 1e-12, estAtol: 1e-14, refFactor: 100,
    maxSteps: 400000, nPlot: 401
  });
  // Cada método tiene su color y su trazo (nunca solo el color): Euler [8,3], Heun [2,3], RK4 continuo.
  var METHODS = [
    { id: 'euler', label: 'Euler', order: 1, color: '--c-pole', dash: [8, 3], tex: 'O(h)' },
    { id: 'heun', label: 'Heun', order: 2, color: '--c-state', dash: [2, 3], tex: 'O(h^{2})' },
    { id: 'rk4', label: 'RK4', order: 4, color: '--c-zero', dash: null, tex: 'O(h^{4})' }
  ];
  var REF_DASH = [6, 4];
  var ORDER_NOTES = {
    ref: 'error en el nivel de la referencia',
    growth: 'el error no baja al reducir h',
    nofinite: 'sin un error finito'
  };

  /* ================================================================== cálculos puros (helpers) */

  /** a: respuesta del sistema en lazo abierto (closed = false) o cerrado. Todo desde DSL.core.tf. */
  function feedbackModel(closed) {
    var TF = TFc();
    var G = closed
      ? new TF([SYS.K * SYS.r / SYS.m], [1, SYS.b / SYS.m, (SYS.k + SYS.K) / SYS.m])
      : new TF([SYS.F / SYS.m], [1, SYS.b / SYS.m, SYS.k / SYS.m]);
    var t = N().linspace(0, SYS.T, SYS.n);
    var y = G.step(t);
    var v = G.impulse(t);
    var u = closed
      ? y.map(function (yy) { return SYS.K * (SYS.r - yy); })
      : t.map(function () { return SYS.F; });
    var so = G.secondOrderParams();
    return {
      closed: !!closed, t: t, y: y, v: v, u: u, info: G.stepInfo(),
      wn: so ? so.wn : null, zeta: so ? so.zeta : null
    };
  }

  /** b: oscilador libre m·ẍ + b·ẋ + k·x = 0 con RK45 (Dormand–Prince) en una malla uniforme. */
  function oscillator() {
    var f = function (t, x) { return [x[1], -(OSC.b * x[1] + OSC.k * x[0]) / OSC.m]; };
    var t = N().linspace(0, OSC.T, OSC.n);
    var r = N().integrate(f, [OSC.x0, 0], 0, OSC.T, { method: 'rk45', rtol: 1e-10, atol: 1e-12, tEval: t });
    return {
      t: t,
      x: r.x.map(function (s) { return s[0]; }),
      v: r.x.map(function (s) { return s[1]; }),
      stats: r.stats
    };
  }

  /** Interpolación lineal en una malla uniforme de [0, T]. */
  function sampleUniform(arr, T, t) {
    var n = arr.length - 1;
    var q = clamp(t / T, 0, 1) * n;
    var i = Math.min(n - 1, Math.floor(q));
    var f = q - i;
    return arr[i] + (arr[i + 1] - arr[i]) * f;
  }

  /** c: veredicto de la ecuación en diferencias según aT (polo discreto z = 1 − aT). */
  function discreteVerdict(aT) {
    var eps = 1e-9;
    var z = 1 - aT;
    if (aT < 1 - eps) {
      return { key: 'monotona', tone: 'success', z: z, title: 'Converge sin oscilar',
        text: '0 < z < 1: cada paso acerca y[k] al valor final, como la curva continua.' };
    }
    if (aT <= 1 + eps) {
      return { key: 'unpaso', tone: 'success', z: z, title: 'Llega en un solo paso',
        text: 'z = 0: y[1] ya vale el valor final.' };
    }
    if (aT < 2 - eps) {
      return { key: 'oscilante', tone: 'warning', z: z, title: 'Converge oscilando',
        text: '−1 < z < 0: y[k] salta por encima y por debajo del valor final, cada vez menos. La curva continua no oscila.' };
    }
    if (aT <= 2 + eps) {
      return { key: 'limite', tone: 'warning', z: z, title: 'Oscila sin amortiguarse',
        text: 'z = −1: y[k] alterna entre dos valores para siempre.' };
    }
    return { key: 'diverge', tone: 'danger', z: z, title: 'Diverge',
      text: '|z| > 1: la ecuación en diferencias es inestable aunque el sistema continuo sea estable. Reduzca T hasta que aT < 2.' };
  }

  /**
   * c: el mismo primer orden en continuo (analítico, DSL.core.tf) y en discreto
   * (y[k+1] = y[k] + T·f(y[k]), es decir, un paso de Euler: DSL.core.numeric.eulerStep).
   */
  function firstOrder(a, T) {
    var tEnd = Math.max(6 / a, 6 * T);
    var G = new (TFc())([a], [1, a]);
    var tc = N().linspace(0, tEnd, 301);
    var yc = G.step(tc);
    var f = function (t, x) { return [-a * x[0] + a * 1]; };
    var K = Math.floor(tEnd / T + 1e-9);
    var ks = [0];
    var ys = [0];
    var x = [0];
    var truncated = false;
    for (var i = 0; i < K; i++) {
      x = N().eulerStep(f, i * T, x, T);
      ks.push(i + 1);
      ys.push(x[0]);
      if (Math.abs(x[0]) > CAP) { truncated = true; break; }
    }
    return {
      a: a, T: T, aT: a * T, z: 1 - a * T, tEnd: tEnd,
      cont: { t: tc, y: yc },
      disc: { k: ks, t: ks.map(function (k) { return k * T; }), y: ys },
      truncated: truncated,
      verdict: discreteVerdict(a * T)
    };
  }

  function tankParams(variant) {
    var g = DSL.systems.G || 9.81;
    if (variant === 'torricelli') return { A: TANK.A, a: TANK.a, qin0: TANK.qin0 };
    var h0 = Math.pow(TANK.qin0 / (TANK.a * Math.sqrt(2 * g)), 2);
    return { A: TANK.A, R: 2 * h0 / TANK.qin0 };     // depósito lineal equivalente: R del modelo linealizado
  }

  /** d (i): integra el modelo «tanks» con una entrada u(t) a trozos (RK4, cortes en las discontinuidades). */
  function runTank(variant, uFn, breaks) {
    var model = DSL.systems.get('tanks');
    var p = tankParams(variant);
    var x = model.x0(p, variant).slice();
    var h0 = x[0];
    var edges = [0].concat(breaks, [TANK.T]);
    var t = [];
    var y = [];
    for (var e = 0; e + 1 < edges.length; e++) {
      var ta = edges[e];
      var tb = edges[e + 1];
      var d = 1e-9 * Math.max(1, tb);
      var uSeg = (function (lo, hi) {
        return function (tt) { return uFn(tt < lo ? lo : tt > hi ? hi : tt); };
      })(ta + d, tb - d);
      var f = (function (us) {
        return function (tt, xx) { return model.deriv(tt, xx, us(tt), p, variant); };
      })(uSeg);
      var r = N().integrate(f, x, ta, tb, { method: 'rk4', dt: TANK.dt });
      for (var i = e === 0 ? 0 : 1; i < r.t.length; i++) {
        t.push(r.t[i]);
        y.push(r.x[i][0] - h0);
      }
      x = r.x[r.x.length - 1].slice();
    }
    return { t: t, y: y, h0: h0 };
  }

  /**
   * d (i): u₁ = escalón de amplitud A1 (m³/s) desde t = 0; u₂ = pulso de amplitud A2 entre 30 y 70 s.
   * Compara y(u₁ + u₂) con y₁ + y₂ (superposición) e y(2u₁) con 2·y₁ (proporcionalidad).
   */
  function superposition(variant, A1, A2) {
    var b0 = TANK.t1;
    var b1 = TANK.t1 + TANK.w2;
    var u1 = function () { return A1; };
    var u2 = function (t) { return t >= b0 && t < b1 ? A2 : 0; };
    var br = [b0, b1];
    var r1 = runTank(variant, u1, br);
    var r2 = runTank(variant, u2, br);
    var r12 = runTank(variant, function (t) { return u1(t) + u2(t); }, br);
    var r2u = runTank(variant, function (t) { return 2 * u1(t); }, br);
    var sum = new Array(r1.t.length);
    var mis = new Array(r1.t.length);
    var maxMis = 0;
    var maxY = 0;
    var maxProp = 0;
    var maxY2 = 0;
    for (var i = 0; i < r1.t.length; i++) {
      sum[i] = r1.y[i] + r2.y[i];
      mis[i] = r12.y[i] - sum[i];
      maxMis = Math.max(maxMis, Math.abs(mis[i]));
      maxY = Math.max(maxY, Math.abs(r12.y[i]));
      maxProp = Math.max(maxProp, Math.abs(r2u.y[i] - 2 * r1.y[i]));
      maxY2 = Math.max(maxY2, Math.abs(r2u.y[i]));
    }
    return {
      variant: variant, A1: A1, A2: A2, t: r1.t, y1: r1.y, y2: r2.y, y12: r12.y, sum: sum, mismatch: mis,
      maxMismatch: maxMis, relMismatch: maxY > 0 ? maxMis / maxY : 0,
      maxProp: maxProp, relProp: maxY2 > 0 ? maxProp / maxY2 : 0,
      linear: variant !== 'torricelli'
    };
  }

  /** d (ii): péndulo θ̈ + (g/L)·sen θ = 0 desde θ₀ en reposo: { f, x0, energy, E0 } (modelo «pendulum»). */
  function pendulumSetup(theta0) {
    var model = DSL.systems.get('pendulum');
    var g = DSL.systems.G || 9.81;
    var p = { L: PEND.L, c: PEND.c, theta0: theta0 };
    var f = function (t, x) { return model.deriv(t, x, 0, p, 'nolineal'); };
    var x0 = model.x0(p, 'nolineal');
    var energy = function (x) { return 0.5 * PEND.L * PEND.L * x[1] * x[1] + g * PEND.L * (1 - Math.cos(x[0])); };
    return { f: f, x0: x0, energy: energy, E0: energy(x0) };
  }

  function rk45Ref(S, times, rtol, atol) {
    return N().integrate(S.f, S.x0, 0, PEND.T, { method: 'rk45', rtol: rtol, atol: atol, tEval: times, maxSteps: PEND.maxSteps });
  }

  // Caché por θ₀ (acotada): la referencia de la gráfica y la estimación de su error no dependen de h.
  var refStore = { keys: [], map: {} };

  /**
   * d (ii): referencia RK45 (rtol 1e-13, atol 1e-15) en 401 instantes de [0, T] y estimación de su error,
   * max |θ(rtol 1e-13) − θ(rtol 1e-12)| en esos instantes. Se calcula una vez por θ₀.
   * Devuelve { t, theta, steps, fevals, error }.
   */
  function pendulumReference(theta0) {
    var key = String(theta0);
    var hit = refStore.map[key];
    if (hit) return hit;
    var S = pendulumSetup(theta0);
    var tRef = N().linspace(0, PEND.T, PEND.nPlot);
    var fine = rk45Ref(S, tRef, PEND.refRtol, PEND.refAtol);
    var coarse = rk45Ref(S, tRef, PEND.estRtol, PEND.estAtol);
    var est = 0;
    for (var i = 0; i < tRef.length; i++) {
      var d = Math.abs(fine.x[i][0] - coarse.x[i][0]);
      if (!(d <= est)) est = d;
    }
    hit = {
      t: tRef, theta: fine.x.map(function (s) { return s[0]; }),
      steps: fine.stats.steps, fevals: fine.stats.fevals, error: est
    };
    refStore.map[key] = hit;
    refStore.keys.push(key);
    if (refStore.keys.length > 32) delete refStore.map[refStore.keys.shift()];
    return hit;
  }

  /** Une dos mallas crecientes en una sola, sin repetir instantes. */
  function mergeGrids(a, b) {
    var out = [];
    var i = 0;
    var j = 0;
    while (i < a.length || j < b.length) {
      var v = j >= b.length || (i < a.length && a[i] <= b[j]) ? a[i++] : b[j++];
      if (!out.length || v > out[out.length - 1]) out.push(v);
    }
    return out;
  }

  /**
   * Orden observado log₂(e(h)/e(h/2)) solo cuando los dos errores superan `floor` (refFactor veces el error
   * estimado de la referencia) y el error no crece al reducir h. Si no: { order: null, note }.
   */
  function observedOrder(eh, eh2, floor) {
    if (!(isFinite(eh) && isFinite(eh2))) return { order: null, note: 'nofinite' };
    if (!(eh > floor && eh2 > floor)) return { order: null, note: 'ref' };
    if (!(eh / eh2 >= 1)) return { order: null, note: 'growth' };
    return { order: Math.log(eh / eh2) / Math.LN2, note: null };
  }

  /**
   * d (ii): Euler, Heun y RK4 con paso h frente a RK45 (rtol 1e-13) sobre el péndulo no lineal
   * θ̈ + (g/L)·sen θ = 0, θ(0) = θ₀, θ̇(0) = 0. Errores en la malla de cada método, deriva de energía
   * y orden observado log₂(e(h)/e(h/2)) (ver observedOrder).
   */
  function methodsComparison(hStep, theta0, opts) {
    opts = opts || {};
    var S = pendulumSetup(theta0);
    var E0 = S.E0;
    var ref = pendulumReference(theta0);
    var floor = PEND.refFactor * ref.error;
    var runs = METHODS.map(function (m) {
      return {
        m: m,
        a: N().integrate(S.f, S.x0, 0, PEND.T, { method: m.id, dt: hStep }),
        b: opts.orders === false ? null : N().integrate(S.f, S.x0, 0, PEND.T, { method: m.id, dt: hStep / 2 })
      };
    });
    // Los tres métodos usan la misma malla para el mismo paso: una sola integración de referencia en la unión.
    function longest(key) {
      return runs.reduce(function (best, r) { return r[key] && r[key].t.length > best.length ? r[key].t : best; }, []);
    }
    var grid = mergeGrids(longest('a'), longest('b'));
    var refRun = rk45Ref(S, grid, PEND.refRtol, PEND.refAtol);
    var refAt = new Map();
    for (var q = 0; q < refRun.t.length; q++) refAt.set(grid[q], refRun.x[q]);
    function measure(r) {
      var maxErr = 0;
      for (var i = 0; i < r.t.length; i++) {
        var e = Math.abs(r.x[i][0] - refAt.get(r.t[i])[0]);
        if (!(e <= maxErr)) maxErr = e;            // NaN también cuenta como error
      }
      var last = r.x[r.x.length - 1];
      var refLast = refAt.get(r.t[r.t.length - 1]);
      return {
        t: r.t, theta: r.x.map(function (s) { return s[0]; }),
        maxErr: maxErr, finalErr: Math.abs(last[0] - refLast[0]),
        drift: E0 > 0 ? (S.energy(last) - E0) / E0 : 0,
        maxAbs: r.x.reduce(function (acc, s) { return Math.max(acc, Math.abs(s[0])); }, 0),
        fevals: r.stats.fevals, steps: r.stats.steps, success: r.stats.success
      };
    }
    var out = runs.map(function (run) {
      var a = measure(run.a);
      var half = run.b ? measure(run.b) : null;
      var o = half ? observedOrder(a.maxErr, half.maxErr, floor) : { order: null, note: null };
      return Object.assign({
        id: run.m.id, label: run.m.label, theoretical: run.m.order, order: o.order, orderNote: o.note,
        halfErr: half ? half.maxErr : null
      }, a);
    });
    return {
      h: hStep, theta0: theta0, methods: out,
      ref: { t: ref.t, theta: ref.theta, steps: ref.steps, fevals: ref.fevals, error: ref.error },
      refError: ref.error, orderFloor: floor,
      E0: E0
    };
  }

  /** d (ii): escala vertical de la gráfica: 1.5 veces la amplitud de la referencia (más un margen). */
  function plotLimit(r) {
    var amp = 0;
    for (var i = 0; i < r.ref.theta.length; i++) amp = Math.max(amp, Math.abs(r.ref.theta[i]));
    return 1.5 * amp + 0.05;
  }

  /**
   * Submuestrea (≤ maxPts) y corta la curva donde |y| supera lim: el primer punto fuera se fija en el
   * borde para que la curva salga visiblemente de la gráfica; los siguientes son huecos (y: null).
   */
  function clipSeries(t, y, lim, maxPts) {
    var stride = Math.max(1, Math.ceil(t.length / maxPts));
    var pts = [];
    var outside = false;
    function push(i) {
      var v = y[i];
      if (isFinite(v) && Math.abs(v) <= lim) {
        outside = false;
        pts.push({ x: t[i], y: v });
      } else if (!outside) {
        outside = true;
        pts.push({ x: t[i], y: isFinite(v) ? (v > 0 ? lim : -lim) : null });
      } else {
        pts.push({ x: t[i], y: null });
      }
    }
    for (var i = 0; i < t.length; i += stride) push(i);
    if ((t.length - 1) % stride) push(t.length - 1);
    return pts;
  }

  /* ================================================================== utilidades de interfaz */

  function texInline(src, plain) {
    return h('span', { class: 'ds-math', 'data-tex': src, translate: 'no' }, plain || src);
  }
  function texBlock(src, testid, cls) {
    return h('div', {
      class: ['ds-math-block', 'cc-eq', cls], 'data-tex': src, 'data-tex-display': 'true',
      translate: 'no', 'data-testid': testid || null
    }, src);
  }
  function renderTex(root) {
    var L = LX();
    if (L && typeof L.renderInto === 'function') L.renderInto(root);
  }
  function setTex(el, src) {
    if (el.getAttribute('data-tex') === src) return;
    el.setAttribute('data-tex', src);
    renderTex(el);
  }
  function tnum(x, d) { return LX() ? LX().num(x, d || 4) : String(x); }

  function iconEl(name, size) {
    var ui = UI();
    return ui && typeof ui.icon === 'function' ? ui.icon(name, { size: size || 18 }) : null;
  }

  /** Botón Reproducir/Pausar con el glifo del sistema de diseño. */
  function playButton(testid, onClick) {
    var btn = h('button', {
      type: 'button', class: 'ds-btn ds-btn--primary ds-btn--icon cc-play', 'data-testid': testid
    }, h('span', { class: 'ds-playglyph', 'aria-hidden': 'true' },
      h('span', { class: 'ds-playglyph__a' }), h('span', { class: 'ds-playglyph__b' })));
    btn.addEventListener('click', onClick);
    function set(playing) {
      var label = playing ? 'Pausar' : 'Reproducir';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('data-tip', label);
      btn.setAttribute('data-state', playing ? 'playing' : 'paused');
      var ui = UI();
      if (ui && ui.tooltips && ui.tooltips.refresh) ui.tooltips.refresh(btn);
    }
    set(false);
    return { el: btn, set: set, destroy: function () { btn.removeEventListener('click', onClick); } };
  }

  /**
   * Aviso en línea (icono + texto) con tono; set(tone, title, text). Tonos: success, warning, danger, info
   * (acento) y neutral (el aviso informativo base, sin modificador). Un título vacío no se muestra.
   */
  function callout(testid) {
    var ic = h('span', { class: 'cc-callout__icon', 'aria-hidden': 'true' });
    var title = h('strong', { class: 'cc-callout__title' });
    var text = h('span', { class: 'cc-callout__text' });
    var el = h('div', { class: 'ds-callout cc-callout', 'data-testid': testid }, ic, h('p', null, title, ' ', text));
    var tone = null;
    return {
      el: el,
      set: function (t, ti, tx) {
        if (t !== tone) {
          if (tone && toneClass(tone)) el.classList.remove('ds-callout--' + toneClass(tone));
          tone = t;
          if (toneClass(t)) el.classList.add('ds-callout--' + toneClass(t));
          el.setAttribute('data-tone', t);
          ic.textContent = '';
          var i = iconEl(t === 'success' ? 'circle-check' : t === 'danger' ? 'circle-alert' : t === 'warning' ? 'triangle-alert' : 'info', 18);
          if (i) ic.appendChild(i);
        }
        title.textContent = ti || '';
        title.hidden = !ti;
        text.textContent = tx;
      }
    };
  }
  function toneClass(t) { return t === 'info' ? 'accent' : t === 'neutral' ? null : t; }

  /** Coalesce: como mucho una ejecución por frame, con los últimos argumentos. */
  function perFrame(fn) {
    var id = null;
    var args = null;
    var f = function () {
      args = arguments;
      if (id !== null) return;
      id = util.raf(function () { id = null; fn.apply(null, args); });
    };
    f.cancel = function () { if (id !== null) util.cancelRaf(id); id = null; };
    return f;
  }

  function colors() {
    var c = function (n, fb) { return util.cssVar(n) || fb; };
    return {
      input: c('--c-in', 'GrayText'), out: c('--c-out', 'GrayText'), state: c('--c-state', 'GrayText'),
      pole: c('--c-pole', 'GrayText'), zero: c('--c-zero', 'GrayText'), axis: c('--c-axis', 'GrayText'),
      grid: c('--c-grid', 'GrayText'), muted: c('--muted', 'GrayText'), ink: c('--ink', 'CanvasText'),
      surface: c('--surface-3', 'Canvas'), plot: c('--c-plot-bg', 'Canvas'), accent: c('--accent', 'Highlight'),
      font: c('--font-body', 'sans-serif')
    };
  }

  /**
   * Superficie 2D fuera del documento (OffscreenCanvas o, sin él, un lienzo suelto) de wCss × hCss px CSS a dpr.
   * Escribir texto en un lienzo del documento obliga al navegador a recalcular estilos (y el layout) si el DOM
   * cambió en ese frame; en una superficie fuera del documento, no. El bucle compone con drawImage.
   */
  function surface(wCss, hCss, dpr) {
    var bw = Math.max(1, Math.round(wCss * dpr));
    var bh = Math.max(1, Math.round(hCss * dpr));
    var cv;
    if (typeof OffscreenCanvas === 'function') {
      cv = new OffscreenCanvas(bw, bh);
    } else {
      cv = document.createElement('canvas');
      cv.width = bw;
      cv.height = bh;
    }
    var c = cv.getContext('2d');
    if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas: cv, ctx: c, w: wCss, h: hCss };
  }

  /** Letra en cursiva de KaTeX_Math sobre una superficie propia (rótulos que se mueven en cada frame). */
  function glyph(ch, color, dpr) {
    var s = surface(16, 20, dpr);
    if (s.ctx) {
      s.ctx.font = 'italic 14px KaTeX_Math, serif';
      s.ctx.fillStyle = color;
      s.ctx.textAlign = 'center';
      s.ctx.textBaseline = 'middle';
      s.ctx.fillText(ch, 8, 10);
    }
    return s;
  }
  function stamp(c, s, cx, cy) {
    if (s && s.ctx) c.drawImage(s.canvas, cx - s.w / 2, cy - s.h / 2, s.w, s.h);
  }

  /** Lienzo de una gráfica, con role="img" y nombre desde que se crea (la gráfica lo sustituye por su resumen). */
  function chartCanvas(testid, label) {
    return h('canvas', { 'data-testid': testid, role: 'img', 'aria-label': label });
  }

  /**
   * Marco .ch-frame de una gráfica dentro de su contenedor. Mientras la gráfica no existe, el contenedor lleva
   * data-chart="pending", que reserva en CSS el hueco del botón «Ver datos» (la altura no cambia al crearla).
   */
  function chartFig(canvas, cls, mod) {
    var frame = h('div', { class: ['ch-frame', 'cc-chart', mod] }, canvas);
    var el = h('div', { class: cls, 'data-chart': 'pending' }, frame);
    return { el: el, frame: frame, charted: function () { el.removeAttribute('data-chart'); } };
  }

  /** Muestra de leyenda (SVG) con el mismo trazo que la serie: continuo o con su patrón de guiones. */
  function keySwatch(cls, dash) {
    var ln = svg('line', { x1: 1, y1: 3, x2: 21, y2: 3 });
    if (dash) ln.setAttribute('stroke-dasharray', dash.join(' '));
    return svg('svg', { class: 'cc-key ' + cls, viewBox: '0 0 22 6', width: 22, height: 6, 'aria-hidden': 'true', focusable: 'false' }, ln);
  }

  /** a: ecuación del sistema en lazo abierto o cerrado (TeX). */
  function sysTex(closed) {
    return closed
      ? '\\begin{aligned} u(t) &= K\\,\\bigl(r - y(t)\\bigr) \\\\ \\ddot{y} + ' + tnum(SYS.b) + '\\,\\dot{y} + ' + tnum(SYS.k + SYS.K) + '\\,y &= ' + tnum(SYS.K) + '\\,r \\end{aligned}'
      : '\\begin{aligned} m\\,\\ddot{y} + b\\,\\dot{y} + k\\,y &= u(t) \\\\ \\ddot{y} + ' + tnum(SYS.b) + '\\,\\dot{y} + ' + tnum(SYS.k) + '\\,y &= ' + tnum(SYS.F) + ' \\end{aligned}';
  }

  /** a: textos de los valores del diagrama de bloques (entrada, salida, estado). */
  function bdText(kind, uv, yv, vv) {
    if (kind === 'u') return 'u = ' + unitText(uv, 3, 'N');
    if (kind === 'y') return 'y = ' + unitText(yv, 3, 'm');
    return '(' + unitText(yv, 3, 'm') + ', ' + unitText(vv, 3, 'm/s') + ')';
  }

  function line(ctx, x0, y0, x1, y1) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  function unitText(v, digits, unit) { return fmt(v, digits) + (unit ? NB + unit : ''); }

  function cardShell(id, title, extraTitle) {
    var titleId = util.uid('cc-title');
    var head = h('h3', { id: titleId, class: 'cc-card__title' }, title, extraTitle || null);
    var el = h('article', {
      class: ['ds-card', 'cc-card', 'cc-card--' + id], 'aria-labelledby': titleId, 'data-card': id,
      'data-testid': 'cc-card-' + id, tabindex: '-1'
    }, head);
    return { el: el, head: head };
  }

  /* ================================================================== a. ¿Qué es un sistema dinámico? */

  function buildSistema(ctx0) {
    var shell = cardShell('sistema', '¿Qué es un sistema dinámico?');
    var el = shell.el;

    var def = h('p', { class: 'cc-def' },
      'Es un conjunto de elementos interconectados cuyas reglas de movimiento o cambio se describen mediante ecuaciones.');
    var explain = h('p', null,
      'Aquí, una masa, un resorte y un amortiguador forman el sistema. La entrada ', texInline('u(t)'),
      ' es la fuerza aplicada; el estado ', texInline('x(t) = (y,\\,\\dot{y})'),
      ' guarda la posición y la velocidad, y la salida ', texInline('y(t)'), ' es la posición que se mide.');
    // La ecuación y los valores del diagrama se escriben al construir (la altura final queda reservada).
    var eq = texBlock(sysTex(false), 'cc-sys-eq');

    // diagrama de bloques: nodos HTML y cables en una capa SVG medida. Los lienzos son decorativos (el
    // diagrama entero es role="img" con su resumen), pero llevan nombre por si se leen fuera de contexto.
    var wires = svg('svg', { class: 'cc-bd__wires', 'aria-hidden': 'true', focusable: 'false' });
    var sparkIn = h('canvas', { class: 'cc-bd__spark', role: 'img', 'aria-label': 'Traza de la entrada u(t).', 'aria-hidden': 'true' });
    var sparkOut = h('canvas', { class: 'cc-bd__spark', role: 'img', 'aria-label': 'Traza de la salida y(t).', 'aria-hidden': 'true' });
    var schem = h('canvas', { class: 'cc-bd__schem', role: 'img', 'aria-label': 'Esquema de la masa, el resorte y el amortiguador.', 'aria-hidden': 'true' });
    var vIn = h('span', { class: 'cc-bd__value', 'data-testid': 'cc-bd-u' }, bdText('u', 0, 0, 0));
    var vOut = h('span', { class: 'cc-bd__value', 'data-testid': 'cc-bd-y' }, bdText('y', 0, 0, 0));
    var vState = h('span', { class: 'cc-bd__value', 'data-testid': 'cc-bd-x' }, bdText('x', 0, 0, 0));
    var src = h('span', { class: 'cc-bd__note' }, 'Fuerza externa');
    var nIn = h('div', { class: 'cc-bd__node cc-bd__node--in' },
      h('span', { class: 'cc-bd__label' }, 'Entrada ', texInline('u(t)')), sparkIn, vIn, src);
    var nSys = h('div', { class: 'cc-bd__node cc-bd__node--sys' },
      h('span', { class: 'cc-bd__label' }, 'Sistema'), schem,
      h('span', { class: 'cc-bd__state' }, texInline('x(t) = (y,\\,\\dot{y})'), vState));
    var nOut = h('div', { class: 'cc-bd__node cc-bd__node--out' },
      h('span', { class: 'cc-bd__label' }, 'Salida ', texInline('y(t)')), sparkOut, vOut,
      h('span', { class: 'cc-bd__note' }, 'Posición medida'));
    var nCtl = h('div', { class: 'cc-bd__node cc-bd__node--ctl' },
      h('span', { class: 'cc-bd__label' }, 'Controlador'),
      texInline('u = K\\,(r - y)'),
      h('span', { class: 'cc-bd__note' }, 'K = 6' + NB + 'N/m, r = 1' + NB + 'm'));
    var bd = h('div', {
      class: 'cc-bd', role: 'img', 'data-testid': 'cc-bd', 'data-loop': 'open',
      'aria-label': 'Diagrama de bloques del sistema.'
    }, wires, nIn, nSys, nOut, nCtl);

    // cv: contextos y tamaños CSS de los tres lienzos, fijados en measure() (nunca se lee el layout en el bucle).
    var A = { data: null, closed: false, tau: SYS.T, playing: false, dotPhase: 0, geom: null, colors: null, ready: false,
      cv: { in: null, out: null, schem: null }, glyphs: null };

    var toggle = UI().toggle({
      label: 'Realimentación',
      description: 'Cierra el lazo: un controlador compara la salida con la referencia r = 1 m y fija la fuerza.',
      testid: 'cc-sys-feedback',
      onChange: function (on) { setClosed(on, true); }
    });
    var play = playButton('cc-sys-play', function () { if (A.playing) pause(); else start(true); });
    var rFinal = UI().readout({ label: 'Valor final', tex: 'y_\\infty', value: null, unit: 'm', digits: 3, testid: 'cc-sys-final' });
    var rMp = UI().readout({ label: 'Sobrepaso', tex: 'M_p', value: null, unit: '%', digits: 3, testid: 'cc-sys-mp' });
    var rTs = UI().readout({ label: 'Establecimiento (2 %)', tex: 't_s', value: null, unit: 's', digits: 3, testid: 'cc-sys-ts' });

    var controls = h('div', { class: 'cc-controls' }, toggle.el, h('div', { class: 'cc-cluster' }, play.el,
      h('span', { class: 'cc-hint' }, 'Recorre la respuesta')));
    var readouts = h('div', { class: 'cc-readouts' }, rFinal.el, rMp.el, rTs.el);
    var body = h('div', { class: 'cc-body cc-body--sistema' },
      h('div', { class: 'cc-text' }, def, explain),
      h('div', { class: 'cc-fig' }, bd),
      h('div', { class: 'cc-eqs' }, eq),
      h('div', { class: 'cc-side' }, controls, readouts));
    el.appendChild(body);

    var lp = util.loop(frame, { element: bd });
    var stopSize = noop;

    function setClosed(on, user) {
      A.closed = !!on;
      A.data = feedbackModel(A.closed);
      bd.setAttribute('data-loop', A.closed ? 'closed' : 'open');
      src.textContent = A.closed ? 'La fija el controlador' : 'Fuerza externa';
      setTex(eq, sysTex(A.closed));
      var info = A.data.info;
      rFinal.set(info.finalValue);
      rMp.set(info.overshootPct);
      rTs.set(info.settlingTime);
      bd.setAttribute('aria-label', summary());
      if (user) {
        UI().announce((A.closed ? 'Lazo cerrado' : 'Lazo abierto') + ': valor final ' + unitText(info.finalValue, 3, 'm') +
          ', sobrepaso ' + unitText(info.overshootPct, 3, '%') + ', establecimiento ' + unitText(info.settlingTime, 3, 's') + '.');
        start(true);
      } else {
        paint();
      }
    }

    function summary() {
      var i = A.data.info;
      return 'Diagrama de bloques: entrada u(t), sistema masa-resorte-amortiguador con estado x(t) y salida y(t). ' +
        (A.closed ? 'Lazo cerrado: el controlador fija u = K·(r − y). ' : 'Lazo abierto: fuerza externa de 2 N. ') +
        'La salida se estabiliza en ' + unitText(i.finalValue, 3, 'm') + ' con un sobrepaso del ' + unitText(i.overshootPct, 3, '%') + '.';
    }

    function start(restart) {
      if (!A.ready) return;
      if (reduced()) {
        A.tau = SYS.T;
        A.playing = false;
        play.set(false);
        paint();
        return;
      }
      if (restart || A.tau >= SYS.T) A.tau = -SYS.tPre;
      A.playing = true;
      play.set(true);
      lp.start();
    }
    function pause() {
      A.playing = false;
      play.set(false);
      lp.stop();
      paint();
    }

    function frame(dt) {
      A.tau += dt * SYS.speed;
      A.dotPhase = (A.dotPhase + dt / 1.6) % 1;
      if (A.tau >= SYS.T) {
        A.tau = SYS.T;
        A.playing = false;
        play.set(false);
        lp.stop();
      }
      paint();
    }

    /* -------- dibujo */

    function valueAt(arr, tau) {
      if (tau < 0) return 0;
      return sampleUniform(arr, SYS.T, tau);
    }

    function spark(fit, arr, range, color, tau) {
      if (!fit) return;
      var c = fit.ctx;
      var W = fit.width;
      var H = fit.height;
      var C = A.colors;
      c.clearRect(0, 0, W, H);
      var x0 = 4;
      var x1 = W - 6;
      var y0 = 6;
      var y1 = H - 6;
      var X = function (t) { return x0 + (x1 - x0) * (t + SYS.tPre) / (SYS.T + SYS.tPre); };
      var Y = function (v) { return y1 - (y1 - y0) * (v - range[0]) / (range[1] - range[0]); };
      c.lineWidth = 1;
      c.strokeStyle = C.axis;
      c.setLineDash([2, 3]);
      line(c, x0, Y(0), x1, Y(0));
      c.setLineDash([]);
      c.lineJoin = 'round';
      c.lineCap = 'round';
      function path(upTo) {
        c.beginPath();
        c.moveTo(X(-SYS.tPre), Y(0));
        c.lineTo(X(0), Y(0));
        var n = arr.length - 1;
        for (var i = 0; i <= n; i++) {
          var t = SYS.T * i / n;
          if (t > upTo) {
            c.lineTo(X(upTo), Y(valueAt(arr, upTo)));
            break;
          }
          c.lineTo(X(t), Y(arr[i]));
        }
        c.stroke();
      }
      c.strokeStyle = color;
      c.globalAlpha = 0.3;
      c.lineWidth = 1.5;
      path(SYS.T);
      c.globalAlpha = 1;
      c.lineWidth = 2;
      if (tau > -SYS.tPre) path(tau);
      var px = X(tau);
      var py = Y(valueAt(arr, tau));
      c.fillStyle = color;
      c.beginPath();
      c.arc(px, py, 3.5, 0, 2 * Math.PI);
      c.fill();
    }

    function drawSchem(yv, uv) {
      var fit = A.cv.schem;
      if (!fit) return;
      var c = fit.ctx;
      var W = fit.width;
      var H = fit.height;
      var C = A.colors;
      c.clearRect(0, 0, W, H);
      var cy = H / 2;
      var wall = 10;
      var mw = Math.min(46, W * 0.16);
      var mh = Math.min(42, H * 0.56);
      var rest = W * 0.36;
      var span = W * 0.26;                       // px por metro
      var mx = rest + yv * span;
      c.lineWidth = 1.25;
      c.strokeStyle = C.muted;
      // pared
      line(c, wall, cy - mh / 2 - 8, wall, cy + mh / 2 + 8);
      for (var i = 0; i < 6; i++) {
        var yy = cy - mh / 2 - 6 + i * (mh + 12) / 5;
        line(c, wall, yy, wall - 6, yy + 6);
      }
      // resorte (carril superior)
      var ys = cy - mh / 4;
      var coils = 7;
      var sx0 = wall;
      var sx1 = mx;
      var lead = 8;
      c.beginPath();
      c.moveTo(sx0, ys);
      c.lineTo(sx0 + lead, ys);
      var seg = (sx1 - sx0 - 2 * lead) / (2 * coils);
      for (var k = 0; k < 2 * coils; k++) {
        c.lineTo(sx0 + lead + seg * (k + 0.5), ys + (k % 2 ? 6 : -6));
      }
      c.lineTo(sx1 - lead, ys);
      c.lineTo(sx1, ys);
      c.stroke();
      // amortiguador (carril inferior): cilindro fijo y vástago unido a la masa
      var yd = cy + mh / 4;
      var cylX = wall + 18;
      var cylW = Math.max(26, rest * 0.42);
      line(c, wall, yd, cylX, yd);
      c.beginPath();
      c.moveTo(cylX + cylW, yd - 7);
      c.lineTo(cylX, yd - 7);
      c.lineTo(cylX, yd + 7);
      c.lineTo(cylX + cylW, yd + 7);
      c.stroke();
      var pistonX = clamp(mx - (rest - (cylX + cylW * 0.6)), cylX + 4, cylX + cylW - 3);
      line(c, pistonX, yd - 5, pistonX, yd + 5);
      line(c, pistonX, yd, mx, yd);
      // masa
      c.fillStyle = C.surface;
      c.strokeStyle = C.out;
      c.lineWidth = 1.5;
      c.beginPath();
      c.rect(mx, cy - mh / 2, mw, mh);
      c.fill();
      c.stroke();
      // fuerza de entrada sobre la masa
      if (Math.abs(uv) > 1e-3) {
        var ax = mx + mw + 4;
        var len = clamp(uv * 7, -mx + wall + 24, W - ax - 14);
        c.strokeStyle = C.input;
        c.fillStyle = C.input;
        c.lineWidth = 2;
        var tip = len >= 0 ? ax + len : mx - 4 + len;
        var base = len >= 0 ? ax : mx - 4;
        line(c, base, cy, tip, cy);
        var dir = len >= 0 ? 1 : -1;
        c.beginPath();
        c.moveTo(tip + dir * 6, cy);
        c.lineTo(tip - dir * 2, cy - 5);
        c.lineTo(tip - dir * 2, cy + 5);
        c.closePath();
        c.fill();
      }
      // etiquetas: letras ya compuestas fuera del documento (fillText aquí recalcularía estilos en cada frame)
      var G = A.glyphs;
      if (G) {
        stamp(c, G.k, (sx0 + sx1) / 2, ys - 15);
        stamp(c, G.b, cylX + cylW / 2, yd + 16);
        stamp(c, G.m, mx + mw / 2, cy);
      }
    }

    function buildGlyphs() {
      var fit = A.cv.schem;
      if (!fit || !A.colors) { A.glyphs = null; return; }
      A.glyphs = {
        k: glyph('k', A.colors.muted, fit.dpr),
        b: glyph('b', A.colors.muted, fit.dpr),
        m: glyph('m', A.colors.ink, fit.dpr)
      };
    }

    function paintWires() {
      var g = A.geom;
      while (wires.firstChild) wires.removeChild(wires.firstChild);
      if (!g) return;
      wires.setAttribute('viewBox', '0 0 ' + g.w + ' ' + g.h);
      wires.setAttribute('width', g.w);
      wires.setAttribute('height', g.h);
      function poly(pts, cls) {
        var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
        wires.appendChild(svg('path', { d: d, class: cls }));
        var a = pts[pts.length - 2];
        var b = pts[pts.length - 1];
        var dx = b[0] - a[0];
        var dy = b[1] - a[1];
        var L = Math.hypot(dx, dy) || 1;
        var ux = dx / L;
        var uy = dy / L;
        var tri = [
          [b[0], b[1]],
          [b[0] - 8 * ux - 4.5 * uy, b[1] - 8 * uy + 4.5 * ux],
          [b[0] - 8 * ux + 4.5 * uy, b[1] - 8 * uy - 4.5 * ux]
        ];
        wires.appendChild(svg('path', {
          d: 'M' + tri.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' L') + ' Z',
          class: cls + ' cc-bd__head'
        }));
      }
      poly(g.wires.u, 'cc-bd__wire');
      poly(g.wires.y, 'cc-bd__wire');
      poly(g.wires.fb1, 'cc-bd__wire cc-bd__wire--fb');
      poly(g.wires.fb2, 'cc-bd__wire cc-bd__wire--fb');
      poly(g.wires.r, 'cc-bd__wire cc-bd__wire--fb');
      var rl = svg('text', { x: g.rLabel[0], y: g.rLabel[1], class: 'cc-bd__rlabel' });
      rl.textContent = 'r';
      wires.appendChild(rl);
      A.dots = ['u', 'y', 'fb1', 'fb2'].map(function (k) {
        var dot = svg('circle', { r: 3.5, class: 'cc-bd__dot cc-bd__dot--' + k, cx: 0, cy: 0, visibility: 'hidden' });
        wires.appendChild(dot);
        return { key: k, el: dot, pts: g.wires[k] };
      });
    }

    function along(pts, f) {
      var lens = [];
      var total = 0;
      for (var i = 1; i < pts.length; i++) {
        var l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        lens.push(l);
        total += l;
      }
      var d = f * total;
      for (var j = 0; j < lens.length; j++) {
        if (d <= lens[j] || j === lens.length - 1) {
          var q = lens[j] ? d / lens[j] : 0;
          return [pts[j][0] + (pts[j + 1][0] - pts[j][0]) * q, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * q];
        }
        d -= lens[j];
      }
      return pts[0];
    }

    function paintDots() {
      if (!A.dots) return;
      var show = A.playing && !reduced();
      A.dots.forEach(function (d) {
        var on = show && (A.closed || (d.key !== 'fb1' && d.key !== 'fb2'));
        d.el.setAttribute('visibility', on ? 'visible' : 'hidden');
        if (!on) return;
        var p = along(d.pts, A.dotPhase);
        d.el.setAttribute('cx', p[0].toFixed(1));
        d.el.setAttribute('cy', p[1].toFixed(1));
      });
    }

    function paint() {
      if (!A.ready || !A.data) return;
      var d = A.data;
      var tau = A.tau;
      var uv = valueAt(d.u, tau);
      var yv = valueAt(d.y, tau);
      var vv = valueAt(d.v, tau);
      // primero los lienzos (tamaños en caché), después las escrituras en el DOM
      spark(A.cv.in, d.u, U_RANGE, A.colors.input, tau);
      spark(A.cv.out, d.y, Y_RANGE, A.colors.out, tau);
      drawSchem(yv, uv);
      vIn.textContent = bdText('u', uv, yv, vv);
      vOut.textContent = bdText('y', uv, yv, vv);
      vState.textContent = bdText('x', uv, yv, vv);
      paintDots();
    }

    /** Ajusta los tres lienzos a su tamaño CSS (lectura de layout fuera del bucle) y compone las letras del esquema. */
    function fitCanvases() {
      function fitOne(cv) {
        var w = cv.clientWidth;
        var hh = cv.clientHeight;
        if (!(w > 0 && hh > 0)) return null;
        return util.fitCanvas(cv, { width: w, height: hh });
      }
      A.cv.in = fitOne(sparkIn);
      A.cv.out = fitOne(sparkOut);
      A.cv.schem = fitOne(schem);
      buildGlyphs();
    }

    function measure() {
      var br = bd.getBoundingClientRect();
      if (!(br.width > 0)) return;
      fitCanvases();
      function rel(node) {
        var r = node.getBoundingClientRect();
        return {
          l: r.left - br.left, t: r.top - br.top, r: r.right - br.left, b: r.bottom - br.top,
          cx: (r.left + r.right) / 2 - br.left, cy: (r.top + r.bottom) / 2 - br.top
        };
      }
      var I = rel(nIn);
      var S = rel(nSys);
      var O = rel(nOut);
      var C = rel(nCtl);
      var w = {};
      var rLabel;
      if (Math.abs(I.cy - S.cy) < 40 && I.r < S.l) {
        var yRow = S.cy;
        w.u = [[I.r, yRow], [S.l, yRow]];
        w.y = [[S.r, yRow], [O.l, yRow]];
        w.fb1 = [[O.cx, O.b], [O.cx, C.cy], [C.r, C.cy]];
        w.fb2 = [[C.l, C.cy], [I.cx, C.cy], [I.cx, I.b]];
        w.r = [[C.cx, Math.min(br.height - 2, C.b + 26)], [C.cx, C.b]];
        rLabel = [C.cx + 8, Math.min(br.height - 4, C.b + 22)];
      } else {
        var lx = Math.max(6, Math.min(I.l, C.l) - 14);
        w.u = [[I.cx, I.b], [S.cx, S.t]];
        w.y = [[S.cx, S.b], [O.cx, O.t]];
        w.fb1 = [[O.cx, O.b], [C.cx, C.t]];
        w.fb2 = [[C.l, C.cy], [lx, C.cy], [lx, I.cy], [I.l, I.cy]];
        w.r = [[Math.min(br.width - 2, C.r + 26), C.cy], [C.r, C.cy]];
        rLabel = [Math.min(br.width - 10, C.r + 14), C.cy - 8];
      }
      A.geom = { w: br.width, h: br.height, wires: w, rLabel: rLabel };
      paintWires();
      paint();
    }

    function init() {
      if (A.ready) return;
      A.ready = true;
      A.colors = colors();
      renderTex(el);
      setClosed(false, false);
      stopSize = util.observeSize(bd, measure);
      start(true);
    }

    return {
      id: 'sistema', el: el, phases: [init],
      isReady: function () { return A.ready; },
      theme: function () {
        if (!A.ready) return;
        A.colors = colors();
        buildGlyphs();
        paint();
      },
      motion: function () { if (!A.ready) return; if (reduced()) { lp.stop(); A.playing = false; A.tau = SYS.T; play.set(false); paint(); } },
      state: function () {
        return { ready: A.ready, closed: A.closed, tau: A.tau, playing: A.playing, final: A.data && A.data.info.finalValue,
          overshoot: A.data && A.data.info.overshootPct, settling: A.data && A.data.info.settlingTime };
      },
      destroy: function () { lp.destroy(); stopSize(); play.destroy(); toggle.destroy(); }
    };
  }

  /* ================================================================== b. El tiempo t */

  /** b: geometría del lienzo del oscilador (px CSS). */
  function oscGeometry(W, H) {
    var zone = clamp(W * 0.22, 84, 140);
    var top = 34;
    var bottom = H - 30;
    return {
      W: W, H: H, zone: zone, top: top, bottom: bottom, mid: (top + bottom) / 2,
      scale: (bottom - top) / 2 / (OSC.x0 * 1.15), px0: zone + 26, px1: W - 30, cx: zone / 2, mw: 40, mh: 30
    };
  }

  function buildTiempo() {
    var shell = cardShell('tiempo', 'La variable independiente: el tiempo ', texInline('t'));
    var el = shell.el;
    var text = h('p', null,
      'El tiempo ', texInline('t'), ' es la variable independiente: el modelo se evalúa conforme este transcurre y a cada instante le corresponde un estado. Arrastre ',
      texInline('t'), ' o pulse «Reproducir»: la masa y su traza avanzan juntas.');
    var eq = texBlock('\\begin{gathered} m\\,\\ddot{x} + b\\,\\dot{x} + k\\,x = 0 \\\\ \\ddot{x} + ' + tnum(OSC.b / OSC.m) + '\\,\\dot{x} + ' +
      tnum(OSC.k / OSC.m) + '\\,x = 0 \\\\ x(0) = ' + tnum(OSC.x0) + '\\ \\mathrm{m},\\quad \\dot{x}(0) = 0 \\end{gathered}', 'cc-time-eq');
    var canvas = h('canvas', {
      class: 'cc-osc__canvas', role: 'img', 'data-testid': 'cc-time-canvas',
      'aria-label': 'Oscilador amortiguado: la masa colgada del resorte y la traza de x frente a t.'
    });
    var frameEl = h('div', { class: 'cc-osc' }, canvas);

    var B = { data: null, t: 0, playing: false, ready: false, colors: null };
    // Vista en caché: tamaño CSS, contexto, capa estática y sprite de la masa. Se rehacen solo al cambiar el
    // tamaño (observeSize) o el tema; el bucle no lee el layout ni cambia ctx.font.
    var V = { ctx: null, geo: null, layer: null, sprite: null, label: null, dpr: 1 };
    var LABEL_W = 132;
    var LABEL_H = 22;
    var lp = util.loop(function timeFrame(dt) {
      B.t += dt;
      var end = B.t >= OSC.T;
      if (end) B.t = OSC.T;
      draw();                                   // primero el lienzo…
      slider.set(B.t, { silent: true });        // …después las escrituras en el DOM
      readouts();
      if (end) stopPlay();
    }, { element: canvas });

    function editStart() { if (B.playing) stopPlay(); }
    var play = playButton('cc-time-play', function () { if (B.playing) stopPlay(); else startPlay(); });
    var slider = UI().slider({
      label: 'Tiempo', symbol: 't', unit: 's', min: 0, max: OSC.T, step: 0.01, value: 0,
      tooltip: 'La variable independiente. Al moverla se evalúa el estado en ese instante.',
      testid: 'cc-time-t',
      onEditStart: editStart,
      onInput: function (v) {
        if (B.playing) stopPlay();
        B.t = v;
        render();
      },
      onChange: function (v) {
        if (B.playing) stopPlay();
        B.t = v;
        render();
        describe();
      }
    });
    // Escribir en el campo numérico detiene la reproducción (si no, el bucle reescribiría el valor tecleado).
    var numberEl = slider.el.querySelector('.ds-slider__number');
    if (numberEl) numberEl.addEventListener('focusin', editStart);
    var rx = UI().readout({ label: 'Posición', tex: 'x(t)', value: null, unit: 'm', digits: 3, testid: 'cc-time-x' });
    var rv = UI().readout({ label: 'Velocidad', tex: '\\dot{x}(t)', value: null, unit: 'm/s', digits: 3, testid: 'cc-time-v' });

    el.appendChild(h('div', { class: 'cc-body cc-body--tiempo' },
      h('div', { class: 'cc-text' }, text),
      h('div', { class: 'cc-fig' }, frameEl),
      h('div', { class: 'cc-eqs' }, eq),
      h('div', { class: 'cc-side' },
        h('div', { class: 'cc-time-controls' }, play.el, slider.el),
        h('div', { class: 'cc-readouts' }, rx.el, rv.el))));

    function startPlay() {
      if (!B.ready) return;
      if (B.t >= OSC.T - 1e-9) B.t = 0;
      if (reduced()) {
        // movimiento reducido: se muestra el estado final
        B.t = OSC.T;
        slider.set(B.t, { silent: true });
        render();
        describe();
        return;
      }
      B.playing = true;
      play.set(true);
      lp.start();
    }
    function stopPlay() {
      B.playing = false;
      play.set(false);
      lp.stop();
      describe();
    }

    function describe() {
      if (!B.data) return;
      var x = sampleUniform(B.data.x, OSC.T, B.t);
      canvas.setAttribute('aria-label', 'Oscilador amortiguado: la masa y la traza de x frente a t hasta t = ' +
        unitText(B.t, 3, 's') + '; en ese instante x = ' + unitText(x, 3, 'm') + '.');
    }

    function readouts() {
      if (!B.data) return;
      rx.set(sampleUniform(B.data.x, OSC.T, B.t));
      rv.set(sampleUniform(B.data.v, OSC.T, B.t));
    }
    function render() {
      draw();
      readouts();
    }

    /** Capa estática (ejes, marcas, rótulos, soporte), sprite de la masa y superficie del rótulo «t = …». */
    function buildLayers() {
      var g = V.geo;
      var C = B.colors;
      if (!g || !V.ctx) return;
      var L = surface(g.W, g.H, V.dpr);
      var c = L.ctx;
      if (!c) return;
      var Y = function (xx) { return g.mid - xx * g.scale; };
      var X = function (tt) { return g.px0 + (g.px1 - g.px0) * tt / OSC.T; };
      c.font = '13px ' + C.font;
      // eje x = 0 que cruza las dos zonas
      c.lineWidth = 1;
      c.strokeStyle = C.axis;
      c.setLineDash([3, 4]);
      line(c, 8, g.mid, g.W - 20, g.mid);
      c.setLineDash([]);
      // ejes de la traza
      line(c, g.px0, g.top - 8, g.px0, g.bottom + 6);
      c.fillStyle = C.muted;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      for (var s = 0; s <= OSC.T; s += 2) {
        line(c, X(s), g.bottom + 2, X(s), g.bottom + 6);
        c.fillText(String(s), X(s), g.bottom + 8);
      }
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      c.fillText(fmt(OSC.x0, 2), g.px0 - 6, Y(OSC.x0));
      c.fillText('0', g.px0 - 6, g.mid);
      c.fillText(fmt(-OSC.x0, 2), g.px0 - 6, Y(-OSC.x0));
      c.font = 'italic 15px KaTeX_Math, serif';
      c.textAlign = 'left';
      c.textBaseline = 'bottom';
      c.fillText('x', g.px0 + 6, g.top - 4);
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      c.fillText('t', g.W - 6, g.mid);
      // soporte del resorte
      c.strokeStyle = C.muted;
      c.lineWidth = 1.25;
      line(c, g.cx - 26, 8, g.cx + 26, 8);
      for (var i = 0; i < 6; i++) line(c, g.cx - 24 + i * 10, 8, g.cx - 30 + i * 10, 2);
      V.layer = L.canvas;
      // sprite de la masa (con 2 px de margen para el trazo)
      var P = surface(g.mw + 4, g.mh + 4, V.dpr);
      var m = P.ctx;
      if (m) {
        m.fillStyle = C.surface;
        m.strokeStyle = C.out;
        m.lineWidth = 1.5;
        m.beginPath();
        m.rect(2, 2, g.mw, g.mh);
        m.fill();
        m.stroke();
        m.fillStyle = C.ink;
        m.font = 'italic 14px KaTeX_Math, serif';
        m.textAlign = 'center';
        m.textBaseline = 'middle';
        m.fillText('m', 2 + g.mw / 2, 2 + g.mh / 2);
      }
      V.sprite = P.canvas;
      // rótulo «t = …»: se reescribe en cada frame sobre su propia superficie (fuente fijada aquí, una vez)
      V.label = surface(LABEL_W, LABEL_H, V.dpr);
      if (V.label.ctx) {
        V.label.ctx.font = '600 15px ' + C.font;
        V.label.ctx.fillStyle = C.ink;
        V.label.ctx.textAlign = 'right';
        V.label.ctx.textBaseline = 'top';
      }
    }

    function onSize(size) {
      if (!B.ready || !(size.width > 0 && size.height > 0)) return;
      var fit = util.fitCanvas(canvas, { width: size.width, height: size.height });
      V.ctx = fit.ctx;
      V.dpr = fit.dpr;
      V.geo = oscGeometry(size.width, size.height);
      buildLayers();
      draw();
    }

    function draw() {
      var c = V.ctx;
      var g = V.geo;
      if (!B.ready || !c || !g || !V.layer || !B.data) return;
      var C = B.colors;
      var d = B.data;
      var t = B.t;
      var x = sampleUniform(d.x, OSC.T, t);
      var Y = function (xx) { return g.mid - xx * g.scale; };
      var X = function (tt) { return g.px0 + (g.px1 - g.px0) * tt / OSC.T; };
      c.clearRect(0, 0, g.W, g.H);
      c.drawImage(V.layer, 0, 0, g.W, g.H);
      // resorte hasta la masa (zona izquierda)
      var cx = g.cx;
      var my = Y(x);
      var coils = 8;
      var sy0 = 8;
      var sy1 = my - g.mh / 2;
      c.strokeStyle = C.muted;
      c.lineWidth = 1.25;
      c.lineJoin = 'miter';
      c.beginPath();
      c.moveTo(cx, sy0);
      c.lineTo(cx, sy0 + 6);
      var segH = (sy1 - sy0 - 12) / (2 * coils);
      for (var k = 0; k < 2 * coils; k++) c.lineTo(cx + (k % 2 ? 9 : -9), sy0 + 6 + segH * (k + 0.5));
      c.lineTo(cx, sy1 - 6);
      c.lineTo(cx, sy1);
      c.stroke();
      if (V.sprite) c.drawImage(V.sprite, cx - g.mw / 2 - 2, my - g.mh / 2 - 2, g.mw + 4, g.mh + 4);
      // traza x(t) solo hasta el instante actual
      c.strokeStyle = C.out;
      c.lineWidth = 2;
      c.lineJoin = 'round';
      c.beginPath();
      var n = d.x.length - 1;
      var last = Math.min(n, Math.floor(t / OSC.T * n));
      for (var j = 0; j <= last; j++) {
        var tt = OSC.T * j / n;
        if (j === 0) c.moveTo(X(tt), Y(d.x[j])); else c.lineTo(X(tt), Y(d.x[j]));
      }
      c.lineTo(X(t), Y(x));
      c.stroke();
      // enlace masa ↔ punto actual
      c.globalAlpha = 0.45;
      c.lineWidth = 1;
      c.setLineDash([2, 4]);
      line(c, cx + g.mw / 2 + 4, my, X(t), my);
      c.setLineDash([]);
      c.globalAlpha = 1;
      // instante actual
      c.strokeStyle = C.accent;
      line(c, X(t), g.top - 8, X(t), g.bottom);
      c.fillStyle = C.out;
      c.beginPath();
      c.arc(X(t), my, 4.5, 0, 2 * Math.PI);
      c.fill();
      var lb = V.label;
      if (lb && lb.ctx) {
        lb.ctx.clearRect(0, 0, LABEL_W, LABEL_H);
        lb.ctx.fillText('t = ' + fmt(t, 4, { decimals: 2 }) + NB + 's', LABEL_W - 2, 2);
        c.drawImage(lb.canvas, g.W - 12 - (LABEL_W - 2), 8 - 2, LABEL_W, LABEL_H);
      }
    }

    var stopSize = noop;
    function init() {
      if (B.ready) return;
      B.ready = true;
      B.colors = colors();
      B.data = oscillator();
      renderTex(el);
      stopSize = util.observeSize(frameEl, onSize);
      // primera medida, fuera del bucle (después la da el observador de tamaño)
      onSize({ width: frameEl.clientWidth, height: frameEl.clientHeight });
      if (reduced()) {
        B.t = OSC.T;
        slider.set(B.t, { silent: true });
        render();
        describe();
      } else {
        render();
        startPlay();
      }
    }

    return {
      id: 'tiempo', el: el, phases: [init],
      isReady: function () { return B.ready; },
      theme: function () { if (!B.ready) return; B.colors = colors(); buildLayers(); draw(); },
      motion: function () { if (B.ready && reduced() && B.playing) { stopPlay(); B.t = OSC.T; slider.set(B.t, { silent: true }); render(); } },
      state: function () {
        return { ready: B.ready, t: B.t, playing: B.playing,
          x: B.data ? sampleUniform(B.data.x, OSC.T, B.t) : null, v: B.data ? sampleUniform(B.data.v, OSC.T, B.t) : null };
      },
      destroy: function () {
        lp.destroy(); stopSize(); play.destroy();
        if (numberEl) numberEl.removeEventListener('focusin', editStart);
        slider.destroy();
      }
    };
  }

  /* ================================================================== c. Ecuaciones de representación */

  /**
   * c: marco horizontal de la gráfica, el mismo con tallos y con escalera: [−p, tEnd + p] con p = 3 % de tEnd
   * (el último punto, en tEnd, queda a menos del 4 % del borde derecho).
   */
  function eqFrame(tEnd) {
    var pad = 0.03 * tEnd;
    return [-pad, tEnd + pad];
  }

  function buildEcuaciones() {
    var shell = cardShell('ecuaciones', 'Ecuaciones de representación');
    var el = shell.el;
    var text = h('p', null,
      'En tiempo continuo el modelo es una ecuación diferencial ordinaria (EDO): da la derivada del estado en cada instante. En tiempo discreto es una ecuación en diferencias: da el estado siguiente cada ',
      texInline('T'), ' segundos. Abajo, el mismo sistema de primer orden en las dos formas, con una entrada escalón ', texInline('u = 1'), '.');
    var eqC = texBlock('\\frac{dy}{dt} = -a\\,y(t) + a\\,u(t)', 'cc-eq-cont');
    var eqD = texBlock('y[k+1] = y[k] + T\\,\\bigl(-a\\,y[k] + a\\,u[k]\\bigr)', 'cc-eq-disc');
    var eqN = texBlock('', 'cc-eq-num');
    var eqs = h('div', { class: 'cc-eqs' },
      h('div', { class: 'cc-eqrow' }, h('span', { class: 'cc-eqrow__label' }, 'Tiempo continuo (EDO)'), eqC),
      h('div', { class: 'cc-eqrow' }, h('span', { class: 'cc-eqrow__label' }, 'Tiempo discreto (ecuación en diferencias)'), eqD),
      h('div', { class: 'cc-eqrow' }, h('span', { class: 'cc-eqrow__label' }, 'Con los valores actuales'), eqN));

    var C = { a: 1, T: 0.4, view: 'tallos', chart: null, frame: null, ready: false, last: null };
    var update = perFrame(function (mode) { compute(mode); });
    var sA = UI().slider({
      label: 'Tasa de respuesta', symbol: 'a', unit: '1/s', min: 0.2, max: 3, step: 0.05, value: C.a,
      tooltip: 'a = 1/τ: cuanto mayor, más rápido responde el sistema continuo.',
      testid: 'cc-eq-a',
      onInput: function (v) { C.a = v; update('drag'); },
      onChange: function (v) { C.a = v; update('release'); announce(); }
    });
    var sT = UI().slider({
      label: 'Periodo de muestreo', symbol: 'T', unit: 's', min: 0.05, max: 2.5, step: 0.05, value: C.T,
      tooltip: 'Tiempo entre dos muestras de la ecuación en diferencias. Si aT supera 2, la secuencia diverge.',
      testid: 'cc-eq-T',
      onInput: function (v) { C.T = v; update('drag'); },
      onChange: function (v) { C.T = v; update('release'); announce(); }
    });
    var seg = UI().segmented({
      label: 'Cómo se dibuja la secuencia', testid: 'cc-eq-view', value: C.view,
      options: [{ value: 'tallos', label: 'Tallos' }, { value: 'escalera', label: 'Escalera' }],
      onChange: function (v) { C.view = v; compute('release'); }
    });
    var rAT = UI().readout({ label: 'Producto', tex: 'aT', value: null, digits: 3, testid: 'cc-eq-aT' });
    var rZ = UI().readout({ label: 'Polo discreto', tex: 'z = 1 - aT', value: null, digits: 3, testid: 'cc-eq-z' });
    var verdict = callout('cc-eq-verdict');
    var canvas = chartCanvas('cc-eq-chart', 'Gráfica: la salida continua y(t) y la secuencia discreta y[k] del mismo sistema de primer orden.');
    var fig = chartFig(canvas, 'cc-fig', 'cc-chart--eq');

    el.appendChild(h('div', { class: 'cc-body cc-body--ecuaciones' },
      h('div', { class: 'cc-text' }, text),
      eqs,
      h('div', { class: 'cc-side' },
        h('div', { class: 'cc-controls' }, sA.el, sT.el, h('div', { class: 'cc-seg-row' }, h('span', { class: 'cc-seg-label', 'aria-hidden': 'true' }, 'Secuencia'), seg.el))),
      fig.el,
      h('div', { class: 'cc-out' }, h('div', { class: 'cc-readouts' }, rAT.el, rZ.el), verdict.el)));

    function createChart(frame) {
      var ch = CH();
      if (!ch || typeof ch.createXYChart !== 'function') return;
      C.chart = ch.createXYChart(canvas, {
        ariaLabel: 'EDO frente a ecuación en diferencias', xLabel: 'Tiempo t (s)', yLabel: 'Salida y',
        testid: 'cc-eq-chart', dataToggle: true, xRange: frame
      });
      C.frame = frame;
      fig.charted();
    }

    /**
     * El marco x sigue a tEnd. Con setXRange (si la gráfica lo ofrece) cambia en el acto; si no, la gráfica se
     * vuelve a crear con el marco nuevo al soltar (durante el arrastre conserva el anterior).
     */
    function syncFrame(frame, mode) {
      if (!C.chart || (C.frame && C.frame[0] === frame[0] && C.frame[1] === frame[1])) return;
      if (typeof C.chart.setXRange === 'function') {
        C.chart.setXRange(frame);
        C.frame = frame;
        return;
      }
      if (mode === 'drag') return;
      C.chart.destroy();
      C.chart = null;
      createChart(frame);
    }

    function compute(mode) {
      var r = firstOrder(C.a, C.T);
      C.last = r;
      setTex(eqN, 'y[k+1] = ' + tnum(r.z, 3) + '\\,y[k] + ' + tnum(r.aT, 3) + '\\,u[k]');
      rAT.set(r.aT);
      rZ.set(r.z);
      var v = r.verdict;
      verdict.set(v.tone, v.title + '.', v.text + (r.truncated ? ' La secuencia se corta al pasar de |y| = 6.' : ''));
      draw(mode);
    }

    function draw(mode) {
      var r = C.last;
      if (!C.chart || !r) return;
      syncFrame(eqFrame(r.tEnd), mode);
      if (!C.chart) return;
      var disc = r.disc.t.map(function (t, i) { return { x: t, y: r.disc.y[i] }; });
      if (C.view === 'escalera' && !r.truncated) disc.push({ x: r.tEnd, y: disc[disc.length - 1].y });
      C.chart.update([
        { key: 'u', label: 'Entrada u = 1', kind: 'line', color: '--c-in', dash: REF_DASH.slice(), points: [{ x: 0, y: 1 }, { x: r.tEnd, y: 1 }] },
        { key: 'cont', label: 'Continuo y(t)', kind: 'line', color: '--c-out', points: r.cont.t.map(function (t, i) { return { x: t, y: r.cont.y[i] }; }) },
        { key: 'disc', label: 'Discreto y[k]', kind: C.view === 'escalera' ? 'steps' : 'stems', color: '--c-zero', points: disc }
      ], { mode: mode === 'drag' ? 'drag' : 'release' });
      C.chart.describe('EDO frente a ecuación en diferencias con a = ' + fmt(r.a, 3) + ' 1/s y T = ' + fmt(r.T, 3) +
        ' s: aT = ' + fmt(r.aT, 3) + ', z = ' + fmt(r.z, 3) + '. ' + r.verdict.title + '.');
    }

    var announce = util.debounce(function () {
      if (!C.last) return;
      UI().announce('aT = ' + fmt(C.last.aT, 3) + ', z = ' + fmt(C.last.z, 3) + ': ' + C.last.verdict.title + '.');
    }, 350);

    // Al construir: ecuación con los valores, lecturas y veredicto (barato), para reservar la altura final.
    compute('release');

    var phases = [
      function () {
        C.ready = true;
        renderTex(el);
        createChart(eqFrame(C.last.tEnd));
      },
      function () { draw('release'); }
    ];

    return {
      id: 'ecuaciones', el: el, phases: phases,
      isReady: function () { return C.ready; },
      state: function () {
        var r = C.last;
        return { ready: C.ready, a: C.a, T: C.T, view: C.view, aT: r && r.aT, z: r && r.z, verdict: r && r.verdict.key,
          samples: r && r.disc.y.length, truncated: r && r.truncated, frame: C.frame ? C.frame.slice() : null };
      },
      destroy: function () {
        update.cancel();
        announce.cancel();
        if (C.chart) C.chart.destroy();
        sA.destroy(); sT.destroy(); seg.destroy();
      }
    };
  }

  /* ================================================================== d. Linealidad vs. no linealidad */

  function buildLinealidad() {
    var shell = cardShell('linealidad', 'Linealidad vs. no linealidad');
    var el = shell.el;
    var intro = h('p', { class: 'cc-intro-text' },
      'Un sistema es lineal cuando cumple dos propiedades: proporcionalidad (si la entrada se multiplica por ', texInline('k'),
      ', la salida también) y superposición (la respuesta a ', texInline('u_1 + u_2'),
      ' es la suma de las respuestas). Los sistemas no lineales no las cumplen y casi nunca tienen una solución cerrada: se resuelven con métodos numéricos.');

    /* ---------- (i) proporcionalidad y superposición */
    var S = { variant: 'torricelli', A1: 10, A2: 12, chart: null, last: null, ready: false };
    var supUpdate = perFrame(function (mode) { computeSup(mode); });
    var supSeg = UI().segmented({
      label: 'Sistema', testid: 'cc-sup-system', value: S.variant, equal: false,
      options: [{ value: 'lineal', label: 'Depósito lineal' }, { value: 'torricelli', label: 'Depósito de Torricelli' }],
      onChange: function (v) { S.variant = v; computeSup('release'); announceSup(); }
    });
    var supEq = texBlock('', 'cc-sup-eq');
    var s1 = UI().slider({
      label: 'Escalón', symbol: 'u₁', unit: 'L/s', min: 0, max: 20, step: 0.5, value: S.A1,
      tooltip: 'Aumento constante del caudal de entrada desde t = 0.',
      testid: 'cc-sup-u1',
      onInput: function (v) { S.A1 = v; supUpdate('drag'); },
      onChange: function (v) { S.A1 = v; supUpdate('release'); announceSup(); }
    });
    var s2 = UI().slider({
      label: 'Pulso', symbol: 'u₂', unit: 'L/s', min: 0, max: 20, step: 0.5, value: S.A2,
      tooltip: 'Aumento del caudal de entrada entre t = 30 s y t = 70 s.',
      testid: 'cc-sup-u2',
      onInput: function (v) { S.A2 = v; supUpdate('drag'); },
      onChange: function (v) { S.A2 = v; supUpdate('release'); announceSup(); }
    });
    var rSup = UI().readout({ label: 'Superposición: máx. |y(u₁ + u₂) − y₁ − y₂|', value: null, unit: 'm', digits: 2, testid: 'cc-sup-mismatch' });
    var rProp = UI().readout({ label: 'Proporcionalidad: máx. |y(2u₁) − 2y₁|', value: null, unit: 'm', digits: 2, testid: 'cc-sup-prop' });
    var supVerdict = callout('cc-sup-verdict');
    var supCanvas = chartCanvas('cc-sup-chart', 'Gráfica de superposición: variación del nivel del depósito con u₁, con u₂ y con las dos a la vez.');
    var supFig = chartFig(supCanvas, 'cc-panel__fig', 'cc-chart--sup');
    var supText = h('p', null,
      'Dos entradas sobre un depósito: un escalón ', texInline('u_1'), ' y un pulso ', texInline('u_2'),
      '. La curva ', texInline('y(u_1 + u_2)'), ', de trazo largo, es la respuesta a las dos a la vez; la de trazo medio es la suma ',
      texInline('y_1 + y_2'), '. Si no coinciden, el área sombreada mide el desajuste.');
    var panelSup = h('div', { class: 'cc-panel cc-panel--sup', 'data-testid': 'cc-panel-superposicion' },
      supFig.el,
      h('div', { class: 'cc-panel__side' },
        supText,
        h('div', { class: 'cc-seg-row' }, h('span', { class: 'cc-seg-label', 'aria-hidden': 'true' }, 'Sistema'), supSeg.el),
        supEq, s1.el, s2.el,
        h('div', { class: 'cc-readouts cc-readouts--stack' }, rSup.el, rProp.el),
        supVerdict.el));

    /** Calcula (barato: cuatro integraciones RK4) y escribe ecuación, lecturas y veredicto; la gráfica, si existe. */
    function computeSup(mode) {
      var r = superposition(S.variant, S.A1 / 1000, S.A2 / 1000);
      S.last = r;
      setTex(supEq, S.variant === 'torricelli'
        ? 'A\\,\\dot{h} = q_{in} - a\\sqrt{2gh}'
        : '\\begin{gathered} A\\,\\dot{h} = q_{in} - \\frac{h}{R} \\\\ R = ' + tnum(tankParams('lineal').R, 3) + '\\ \\mathrm{s/m^2} \\end{gathered}');
      rSup.set(r.maxMismatch);
      rProp.set(r.maxProp);
      if (r.A1 === 0 || r.A2 === 0) {
        // Con una entrada nula las dos propiedades se cumplen de forma trivial en cualquier sistema.
        supVerdict.set('neutral', '', 'Con una entrada nula la prueba es trivial: elija dos entradas distintas de cero.');
      } else if (r.linear) {
        supVerdict.set('success', 'Se cumplen las dos propiedades.',
          'El desajuste es del orden del redondeo (' + fmt(r.relMismatch, 2) + ' relativo): las curvas coinciden.');
      } else {
        supVerdict.set('warning', 'No se cumplen.',
          'El caudal de salida crece con √h, no con h: la respuesta a la suma difiere un ' + fmt(100 * r.relMismatch, 2) +
          ' % de la suma de respuestas, y duplicar u₁ no duplica la respuesta (' + fmt(100 * r.relProp, 2) + ' %).');
      }
      drawSup(mode);
    }
    function drawSup(mode) {
      var r = S.last;
      if (!S.chart || !r) return;
      var stride = 2;
      var pts = function (arr) {
        var out = [];
        for (var i = 0; i < r.t.length; i += stride) out.push({ x: r.t[i], y: arr[i] });
        return out;
      };
      // Color y trazo distintos en cada serie: u₁ continuo, u₂ [2,3], u₁ + u₂ [8,3], suma [6,4], desajuste relleno.
      S.chart.update([
        { key: 'mis', label: 'Desajuste y(u₁ + u₂) − (y₁ + y₂)', kind: 'line', color: '--c-pole', fill: true, alpha: 0.9, points: pts(r.mismatch) },
        { key: 'y1', label: 'Respuesta a u₁', kind: 'line', color: '--c-in', alpha: 0.6, points: pts(r.y1) },
        { key: 'y2', label: 'Respuesta a u₂', kind: 'line', color: '--c-state', alpha: 0.6, dash: [2, 3], points: pts(r.y2) },
        { key: 'y12', label: 'Respuesta a u₁ + u₂', kind: 'line', color: '--c-out', dash: [8, 3], points: pts(r.y12) },
        { key: 'sum', label: 'Suma y₁ + y₂', kind: 'line', color: '--c-zero', dash: REF_DASH.slice(), points: pts(r.sum) }
      ], { mode: mode === 'drag' ? 'drag' : 'release' });
      S.chart.describe('Superposición en el ' + (r.linear ? 'depósito lineal' : 'depósito de Torricelli') +
        ': desajuste máximo ' + unitText(r.maxMismatch, 2, 'm') + ' (' + fmt(100 * r.relMismatch, 2) + ' %).');
    }
    var announceSup = util.debounce(function () {
      if (!S.last) return;
      UI().announce((S.last.linear ? 'Depósito lineal' : 'Depósito de Torricelli') + ': desajuste de superposición ' +
        unitText(S.last.maxMismatch, 2, 'm') + '.');
    }, 350);

    /* ---------- (ii) métodos numéricos */
    var M = { h: 0.1, theta0Deg: 80, chart: null, last: null, ready: false };
    var metUpdate = perFrame(function (mode) { computeMet(mode); });
    var sh = UI().slider({
      label: 'Paso de integración', symbol: 'h', unit: 's', min: 0.005, max: 0.5, value: M.h, scale: 'log',
      tooltip: 'Distancia entre dos instantes que calcula cada método. Los tres usan el mismo paso.',
      testid: 'cc-num-h',
      onInput: function (v) { M.h = v; metUpdate('drag'); },
      onChange: function (v) { M.h = v; metUpdate('release'); announceMet(); }
    });
    var sth = UI().slider({
      label: 'Ángulo inicial', symbol: 'θ₀', unit: '°', min: 10, max: 170, step: 1, value: M.theta0Deg,
      tooltip: 'Se suelta desde este ángulo, en reposo. Con ángulos grandes el péndulo es claramente no lineal.',
      testid: 'cc-num-theta0',
      onInput: function (v) { M.theta0Deg = v; metUpdate('drag'); },
      onChange: function (v) { M.theta0Deg = v; metUpdate('release'); announceMet(); }
    });
    var metEq = texBlock('\\begin{gathered} \\ddot{\\theta} + \\frac{g}{L}\\,\\sin\\theta = 0 \\\\ \\theta(0) = \\theta_0,\\quad \\dot{\\theta}(0) = 0 \\end{gathered}', 'cc-num-eq');
    var metText = h('p', null,
      'El péndulo no lineal no tiene una solución con funciones elementales: hay que integrarlo paso a paso. Con el mismo paso ',
      texInline('h'), ', Euler, Heun y RK4 se comparan con una referencia RK45 adaptativa (Dormand–Prince, tolerancia ',
      texInline('10^{-13}'), '). Sin rozamiento la energía debería conservarse: su deriva delata el error.');
    var tbody = h('tbody');
    var table = h('table', { class: 'ds-table cc-num-table', 'data-testid': 'cc-num-table' },
      h('caption', { class: 'sr-only' }, 'Error de cada método frente a la referencia RK45'),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, 'Método'),
        h('th', { scope: 'col' }, 'Orden'),
        h('th', { scope: 'col' }, 'Evaluaciones de f'),
        h('th', { scope: 'col' }, 'Error máximo (rad)'),
        h('th', { scope: 'col' }, 'Orden observado'),
        h('th', { scope: 'col' }, 'Deriva de energía'))),
      tbody);
    var rows = {};
    METHODS.forEach(function (m) {
      var cells = {
        fevals: h('td', { 'data-testid': 'cc-num-fevals-' + m.id }),
        err: h('td', { 'data-testid': 'cc-num-err-' + m.id }),
        order: h('td', { 'data-testid': 'cc-num-order-' + m.id }),
        drift: h('td', { 'data-testid': 'cc-num-drift-' + m.id })
      };
      tbody.appendChild(h('tr', { 'data-method': m.id },
        h('th', { scope: 'row', class: 'cc-num-method' }, keySwatch('cc-key--' + m.id, m.dash), m.label),
        h('td', null, texInline(m.tex)), cells.fevals, cells.err, cells.order, cells.drift));
      rows[m.id] = cells;
    });
    var tableWrap = h('div', { class: 'cc-table-wrap' }, table);
    var refErrEl = h('span', { class: 'cc-num-referr', 'data-testid': 'cc-num-referr' }, '—');
    var metNote = h('p', { class: 'cc-note' },
      'Orden observado: ', texInline('\\log_2\\bigl(e(h)/e(h/2)\\bigr)'),
      '. Se acerca al orden teórico solo cuando h es pequeño. Se omite («—») si alguno de los dos errores no supera 100 veces el error estimado de la referencia, que con este ángulo es de ',
      refErrEl, '.');
    var metCanvas = chartCanvas('cc-num-chart', 'Gráfica de los métodos numéricos: ángulo θ del péndulo frente al tiempo con Euler, Heun, RK4 y la referencia RK45.');
    var metFig = chartFig(metCanvas, 'cc-panel__fig', 'cc-chart--num');
    var panelMet = h('div', { class: 'cc-panel cc-panel--met', 'data-testid': 'cc-panel-metodos' },
      metFig.el,
      h('div', { class: 'cc-panel__side' }, metText, metEq, sh.el, sth.el),
      h('div', { class: 'cc-panel__wide' }, tableWrap, metNote));

    /** Calcula la comparación y rellena la tabla; la gráfica, si ya existe (se crea al mostrar la pestaña). */
    function computeMet(mode) {
      var r = methodsComparison(M.h, M.theta0Deg * Math.PI / 180);
      M.last = r;
      M.ready = true;
      r.methods.forEach(function (m) {
        var c = rows[m.id];
        c.fevals.textContent = String(m.fevals);
        c.err.textContent = isFinite(m.maxErr) ? fmt(m.maxErr, 2) : '∞';
        if (m.order === null) {
          c.order.textContent = '—';
          if (m.orderNote) c.order.appendChild(h('span', { class: 'cc-num-why' }, ORDER_NOTES[m.orderNote]));
        } else {
          c.order.textContent = fmt(m.order, 3, { decimals: 2 });
        }
        c.drift.textContent = isFinite(m.drift) ? fmt(100 * m.drift, 2, { plus: true }) + NB + '%' : '—';
      });
      refErrEl.textContent = fmt(r.refError, 2) + NB + 'rad';
      drawMet(mode);
    }
    function drawMet(mode) {
      var r = M.last;
      if (!M.chart || !r) return;
      var ds = [{ key: 'ref', label: 'Referencia RK45', kind: 'line', color: '--c-in', dash: REF_DASH.slice(),
        points: r.ref.t.map(function (t, i) { return { x: t, y: r.ref.theta[i] }; }) }];
      var lim = plotLimit(r);
      r.methods.forEach(function (m, k) {
        var d = { key: m.id, label: m.label, kind: 'line', color: METHODS[k].color, points: clipSeries(m.t, m.theta, lim, 600) };
        if (METHODS[k].dash) d.dash = METHODS[k].dash.slice();
        ds.push(d);
      });
      M.chart.update(ds, { mode: mode === 'drag' ? 'drag' : 'release' });
      var out = r.methods.filter(function (m) { return !(m.maxAbs <= lim); }).map(function (m) { return m.label; });
      M.chart.describe('Péndulo no lineal con θ₀ = ' + fmt(M.theta0Deg, 3) + '° y paso h = ' + fmt(M.h, 3) + ' s. Error máximo: ' +
        r.methods.map(function (m) { return m.label + ' ' + fmt(m.maxErr, 2) + ' rad'; }).join(', ') + '.' +
        (out.length ? ' ' + out.join(' y ') + (out.length > 1 ? ' se salen' : ' se sale') + ' de la escala.' : ''));
    }
    var announceMet = util.debounce(function () {
      if (!M.last) return;
      UI().announce('Paso h = ' + fmt(M.h, 3) + ' s. Error máximo: ' +
        M.last.methods.map(function (m) { return m.label + ' ' + fmt(m.maxErr, 2) + ' rad'; }).join(', ') + '.');
    }, 400);

    /* ---------- pestañas */
    var current = 'superposicion';
    var tabs = UI().tabs({
      label: 'Linealidad vs. no linealidad', testid: 'cc-lin-tabs', value: current,
      tabs: [
        { id: 'superposicion', label: 'Proporcionalidad y superposición', panel: panelSup },
        { id: 'metodos', label: 'Métodos numéricos', panel: panelMet }
      ],
      onChange: function (id) { current = id; ensurePanel(id); }
    });
    el.appendChild(h('div', { class: 'cc-body cc-body--linealidad' }, h('div', { class: 'cc-text' }, intro), tabs.el));

    // Al construir: ecuación, lecturas y veredicto de la superposición (la altura final queda reservada).
    computeSup('release');

    var ready = false;
    function supChart() {
      if (S.chart) return;
      var ch = CH();
      S.ready = true;
      renderTex(panelSup);
      if (ch) S.chart = ch.createXYChart(supCanvas, {
        ariaLabel: 'Superposición', xLabel: 'Tiempo t (s)', yLabel: 'Variación del nivel Δh (m)', testid: 'cc-sup-chart', dataToggle: true,
        xRange: [0, TANK.T]
      });
      supFig.charted();
    }
    function metChart() {
      if (M.chart) return;
      var ch = CH();
      renderTex(panelMet);
      if (ch) M.chart = ch.createXYChart(metCanvas, {
        ariaLabel: 'Métodos numéricos', xLabel: 'Tiempo t (s)', yLabel: 'Ángulo θ (rad)', testid: 'cc-num-chart', dataToggle: true,
        xRange: [0, PEND.T]
      });
      metFig.charted();
    }
    /** La pestaña visible tiene su gráfica; la de métodos se calcula antes (en reposo) y su gráfica se crea al mostrarla. */
    function ensurePanel(id) {
      if (!ready) return;
      if (id === 'superposicion' && !S.chart) {
        supChart();
        drawSup('release');
      }
      if (id === 'metodos') {
        if (!M.last) computeMet('release');
        if (!M.chart) {
          metChart();
          drawMet('release');
        }
      }
    }

    /* Fases de preparación (cada una ≲ 50 ms a 1×): gráfica de la pestaña visible, su primer dibujo y el cálculo de métodos. */
    var phases = [
      function () {
        ready = true;
        renderTex(intro);
        if (current === 'superposicion') supChart(); else ensurePanel(current);
      },
      function () { ensurePanel(current); if (current === 'superposicion') drawSup('release'); },
      // métodos en dos fases cortas: la referencia (y su error estimado) queda en caché; después, la tabla
      function () { if (!M.last) pendulumReference(M.theta0Deg * Math.PI / 180); },
      function () { if (!M.last) computeMet('release'); }
    ];

    return {
      id: 'linealidad', el: el, phases: phases,
      isReady: function () { return ready; },
      select: function (tab) {
        if (tab !== 'superposicion' && tab !== 'metodos') return false;
        tabs.select(tab);
        current = tab;
        ensurePanel(tab);
        return true;
      },
      tabButton: function (tab) { return tabs.tablist.querySelector('[data-tab="' + tab + '"]'); },
      state: function () {
        return {
          ready: ready, tab: current,
          superposition: S.last ? { variant: S.last.variant, maxMismatch: S.last.maxMismatch, relMismatch: S.last.relMismatch,
            maxProp: S.last.maxProp, relProp: S.last.relProp } : null,
          methods: M.last ? { h: M.last.h, theta0: M.last.theta0, refError: M.last.refError, rows: M.last.methods.map(function (m) {
            return { id: m.id, maxErr: m.maxErr, finalErr: m.finalErr, order: m.order, orderNote: m.orderNote, fevals: m.fevals, drift: m.drift };
          }) } : null
        };
      },
      destroy: function () {
        supUpdate.cancel(); metUpdate.cancel(); announceSup.cancel(); announceMet.cancel();
        if (S.chart) S.chart.destroy();
        if (M.chart) M.chart.destroy();
        supSeg.destroy(); s1.destroy(); s2.destroy(); sh.destroy(); sth.destroy(); tabs.destroy();
      }
    };
  }

  /* ================================================================== montaje de la sección */

  var CARD_ORDER = ['sistema', 'tiempo', 'ecuaciones', 'linealidad'];
  var LAZY_MARGIN = '200px';
  var IDLE_DELAY = 1200;        // ms tras «load» antes de preparar en reposo las tarjetas que falten
  var ALIGN_BAND = 40;          // px: la tarjeta abierta debe quedar entre la barra y la barra + 40 px
  var ALIGN_HOLD = 1500;        // ms durante los que un cambio de tamaño puede pedir otra corrección

  function requestIdle(fn) {
    var w = typeof window !== 'undefined' ? window : null;
    if (w && typeof w.requestIdleCallback === 'function') {
      var id = w.requestIdleCallback(fn, { timeout: 1500 });
      return function () { w.cancelIdleCallback(id); };
    }
    var t = setTimeout(fn, 40);
    return function () { clearTimeout(t); };
  }

  /**
   * Respaldo de DSL.util.lazyInit(el, phases, { rootMargin }) → { ensure(), done, destroy() }: al acercarse a la
   * vista ejecuta una fase por frame; step() ejecuta la siguiente (la usa la preparación en reposo); ensure() las
   * que falten, en el acto. Al terminar fija el.dataset.lazy = 'done'.
   */
  function localLazy(el, phases, opts) {
    var i = 0;
    var alive = true;
    var rafId = null;
    var stopVis = noop;
    el.setAttribute('data-lazy', 'pending');
    function finish() {
      el.setAttribute('data-lazy', 'done');
      stopVis();
      if (rafId !== null) util.cancelRaf(rafId);
      rafId = null;
    }
    function step() {
      if (!alive || i >= phases.length) return false;
      var f = phases[i++];
      f();
      if (i >= phases.length) finish();
      return true;
    }
    function chain() {
      rafId = null;
      if (step() && i < phases.length) rafId = util.raf(chain);
    }
    var api = {
      step: step,
      ensure: function () { while (step()) { /* todas las fases que falten */ } },
      get done() { return i >= phases.length; },
      destroy: function () {
        alive = false;
        stopVis();
        if (rafId !== null) util.cancelRaf(rafId);
        rafId = null;
      }
    };
    var stop = util.onVisible(el, function (v) { if (v && rafId === null && alive) chain(); }, { once: true, rootMargin: opts.rootMargin });
    if (i < phases.length) stopVis = stop; else stop();
    return api;
  }

  function clock() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  }

  /**
   * Preparación por fases de una tarjeta: DSL.util.lazyInit si existe; si no, localLazy. Cada fase registra su error
   * y deja en log { card, phase, start, ms } (stats() del montaje: ninguna fase debe acercarse a una tarea larga).
   */
  function lazyCard(key, card, log) {
    var phases = card.phases.map(function (fn, i) {
      return function () {
        var t0 = clock();
        try {
          fn();
        } catch (err) {
          console.error('[concepts] No se pudo preparar la tarjeta «' + key + '»:', err);
        }
        if (log) log.push({ card: key, phase: i, start: t0, ms: clock() - t0 });
      };
    });
    var opts = { rootMargin: LAZY_MARGIN };
    if (typeof util.lazyInit === 'function') {
      var hnd = util.lazyInit(card.el, phases, opts);
      if (hnd && typeof hnd.ensure === 'function') return hnd;
    }
    return localLazy(card.el, phases, opts);
  }

  function mount(el) {
    var doc = el.ownerDocument;
    var win = doc && doc.defaultView;
    var head = h('header', { class: 'cc-head' },
      h('h2', { id: 'conceptos-title' }, 'Conceptos fundamentales'),
      h('p', { class: 'cc-lead' },
        'Cuatro ideas sostienen el resto del laboratorio. Cada figura se calcula en vivo con el mismo motor que usan las simulaciones y la función de transferencia.'));
    var grid = h('div', { class: 'cc-grid', 'data-testid': 'cc-grid' });
    var cards = {
      sistema: buildSistema(),
      tiempo: buildTiempo(),
      ecuaciones: buildEcuaciones(),
      linealidad: buildLinealidad()
    };
    CARD_ORDER.forEach(function (k) { grid.appendChild(cards[k].el); });
    var root = h('div', { class: 'cc', 'data-testid': 'concepts' }, head, grid);
    // KaTeX es síncrono: toda la sección queda compuesta al montar (sin TeX crudo en el árbol accesible y con la
    // altura final de cada fórmula reservada antes de preparar las tarjetas).
    renderTex(root);
    el.appendChild(root);

    var alive = true;
    var cleanups = [];
    var lazies = {};
    var phaseLog = [];
    CARD_ORDER.forEach(function (k) { lazies[k] = lazyCard(k, cards[k], phaseLog); });
    var ui = UI();
    if (ui && typeof ui.reveal === 'function') cleanups.push(ui.reveal(grid, { items: '.cc-card', stagger: 90 }));

    /* -------- preparación en reposo (solo con el respaldo localLazy; DSL.util.lazyInit tiene su propia cola):
       tras «load» y una pausa, una fase por llamada de requestIdleCallback */
    var idle = { cancel: noop, timer: null };
    function pendingCard() {
      for (var i = 0; i < CARD_ORDER.length; i++) {
        var k = CARD_ORDER[i];
        if (typeof lazies[k].step === 'function' && !lazies[k].done) return k;
      }
      return null;
    }
    function idleStep() {
      idle.cancel = noop;
      if (!alive) return;
      var k = pendingCard();
      if (!k) return;
      lazies[k].step();
      idle.cancel = requestIdle(idleStep);
    }
    function startIdle() {
      if (win) win.removeEventListener('load', startIdle);
      if (!alive || idle.timer !== null) return;
      idle.timer = setTimeout(function () {
        idle.timer = null;
        idle.cancel = requestIdle(idleStep);
      }, IDLE_DELAY);
    }
    if (doc && doc.readyState === 'complete') startIdle();
    else if (win) win.addEventListener('load', startIdle);

    /* -------- concepts:open: la tarjeta (y su pestaña) queda bajo la barra aunque cambien alturas mientras llega */

    /**
     * Borde superior de la tarjeta sin la traslación de su aparición (ds-reveal): scrollIntoView alinearía la caja
     * desplazada y, al terminar la aparición, la tarjeta quedaría bajo la barra.
     */
    function layoutTop(card) {
      var top = card.getBoundingClientRect().top;
      try {
        var tf = win.getComputedStyle(card).transform;
        if (tf && tf !== 'none' && typeof win.DOMMatrixReadOnly === 'function') top -= new win.DOMMatrixReadOnly(tf).m42;
      } catch (e) { /* sin transformación legible */ }
      return top;
    }
    /** Lleva la tarjeta a su scroll-margin-top (la barra + 16 px), suave o al instante. */
    function scrollCardTo(card, behavior) {
      if (!win || typeof win.scrollTo !== 'function') {
        card.scrollIntoView(true);
        return;
      }
      var margin = parseFloat(win.getComputedStyle(card).scrollMarginTop);
      if (!isFinite(margin)) margin = (parseFloat(util.cssVar('--header-h')) || 64) + 16;
      var y = Math.max(0, (win.scrollY || 0) + layoutTop(card) - margin);
      try { win.scrollTo({ top: y, behavior: behavior }); } catch (e) { win.scrollTo(0, y); }
    }

    var align = { stop: noop };
    function keepAligned(card) {
      align.stop();
      if (!win || typeof win.addEventListener !== 'function') return;
      var USER = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
      var hasEnd = 'onscrollend' in win;
      var timer = null;
      var sizeTimer = null;
      var stopSize = noop;
      var active = true;
      function outside() {
        var hh = parseFloat(util.cssVar('--header-h')) || 64;
        var top = layoutTop(card);
        return top < hh - 0.5 || top > hh + ALIGN_BAND;
      }
      function realign() {
        if (outside()) scrollCardTo(card, 'auto');
      }
      function stop() {
        if (!active) return;
        active = false;
        if (timer !== null) clearTimeout(timer);
        if (sizeTimer !== null) clearTimeout(sizeTimer);
        stopSize();
        if (hasEnd) win.removeEventListener('scrollend', onEnd);
        USER.forEach(function (t) { win.removeEventListener(t, stop, true); });
        if (align.stop === stop) align.stop = noop;
      }
      function onEnd() {
        if (!active) return;
        if (hasEnd) win.removeEventListener('scrollend', onEnd);
        if (timer !== null) clearTimeout(timer);
        timer = null;
        realign();
        // Una corrección más tras el siguiente cambio de tamaño del documento (inicios perezosos) en 1,5 s.
        var body = doc.body;
        if (!body) { stop(); return; }
        var base = body.getBoundingClientRect();
        stopSize = util.observeSize(body, function (s) {
          if (!active) return;
          if (Math.abs(s.height - base.height) < 0.5 && Math.abs(s.width - base.width) < 0.5) return;
          realign();
          stop();
        });
        sizeTimer = setTimeout(stop, ALIGN_HOLD);
      }
      USER.forEach(function (t) { win.addEventListener(t, stop, true); });
      if (hasEnd) win.addEventListener('scrollend', onEnd);
      timer = setTimeout(onEnd, hasEnd ? 1600 : 700);
      align.stop = stop;
    }

    var hlTimer = null;
    function open(p) {
      p = p || {};
      var c = cards[p.card];
      if (!c) return false;
      lazies[p.card].ensure();
      var target = c.el;
      if (p.tab && c.select && c.select(p.tab)) target = c.tabButton(p.tab) || c.el;
      CARD_ORDER.forEach(function (k) { cards[k].el.classList.remove('is-highlight'); });
      c.el.classList.add('is-highlight');
      if (hlTimer) clearTimeout(hlTimer);
      hlTimer = setTimeout(function () { c.el.classList.remove('is-highlight'); hlTimer = null; }, 1800);
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
      scrollCardTo(c.el, reduced() ? 'auto' : 'smooth');
      keepAligned(c.el);
      return true;
    }

    var offs = [
      DSL.bus.on('concepts:open', function (p) { open(p); }),
      DSL.bus.on('theme:change', function () { CARD_ORDER.forEach(function (k) { if (cards[k].theme) cards[k].theme(); }); }),
      DSL.bus.on('motion:change', function () { CARD_ORDER.forEach(function (k) { if (cards[k].motion) cards[k].motion(); }); })
    ];
    if (doc && doc.fonts && typeof doc.fonts.load === 'function') {
      doc.fonts.load('italic 14px KaTeX_Math').then(function () {
        if (!alive) return;
        CARD_ORDER.forEach(function (k) { if (cards[k].theme) cards[k].theme(); });
      }, noop);
    }

    return {
      destroy: function () {
        if (!alive) return;
        alive = false;
        if (hlTimer) clearTimeout(hlTimer);
        if (idle.timer !== null) clearTimeout(idle.timer);
        idle.cancel();
        if (win) win.removeEventListener('load', startIdle);
        align.stop();
        CARD_ORDER.forEach(function (k) { if (lazies[k] && typeof lazies[k].destroy === 'function') lazies[k].destroy(); });
        cleanups.forEach(function (f) { f(); });
        offs.forEach(function (f) { f(); });
        CARD_ORDER.forEach(function (k) { cards[k].destroy(); });
        root.remove();
      },
      /** Abre y resalta una tarjeta (y su pestaña), como concepts:open. Síncrono: prepara antes la tarjeta. */
      open: open,
      /** Fuerza la preparación de todas las tarjetas (pruebas y capturas). */
      initAll: function () { CARD_ORDER.forEach(function (k) { lazies[k].ensure(); }); },
      /** Fases ya ejecutadas, en orden: { card, phase, start (performance.now), ms }. */
      stats: function () { return { phases: phaseLog.map(function (p) { return { card: p.card, phase: p.phase, start: p.start, ms: p.ms }; }) }; },
      state: function () {
        var out = {};
        CARD_ORDER.forEach(function (k) { out[k] = cards[k].state ? cards[k].state() : null; });
        return out;
      }
    };
  }

  DSL.sections.concepts = {
    mount: mount,
    helpers: {
      feedbackModel: feedbackModel,
      oscillator: oscillator,
      sampleUniform: sampleUniform,
      discreteVerdict: discreteVerdict,
      firstOrder: firstOrder,
      tankParams: tankParams,
      runTank: runTank,
      superposition: superposition,
      methodsComparison: methodsComparison,
      pendulumReference: pendulumReference,
      observedOrder: observedOrder,
      plotLimit: plotLimit,
      clipSeries: clipSeries,
      eqFrame: eqFrame,
      constants: { SYS: SYS, OSC: OSC, TANK: TANK, PEND: PEND, METHODS: METHODS.map(function (m) { return m.id; }) }
    }
  };
})(window.DSL);
