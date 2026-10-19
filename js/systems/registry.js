/*
 * js/systems/registry.js — Propietario: systems.
 * Registro de modelos, señales de entrada, simulación por lotes y utilidades compartidas
 * de los modelos → DSL.systems (register, get, list, describe, inputSignal, simulate…).
 * API: docs/api/systems.md.
 */
(function (DSL) {
  'use strict';

  var util = DSL.util;
  var S = DSL.systems;

  var CATEGORIES = Object.freeze({
    mecanico: 'Mecánico',
    hidraulico: 'Hidráulico',
    electrico: 'Eléctrico',
    biologico: 'Biológico',
    economico: 'Económico'
  });

  var INPUT_TYPES = ['escalon', 'pulso', 'senoidal', 'rampa', 'ninguna'];
  var G_ACC = 9.81;

  var models = [];
  var byId = Object.create(null);

  /* ------------------------------------------------------------------ dependencias perezosas */

  function N() { return DSL.core.numeric; }
  function LX() { return DSL.core.latex; }
  function TF() { return DSL.core.tf.TransferFunction; }

  /* ------------------------------------------------------------------ registro */

  function isFn(f) { return typeof f === 'function'; }

  function register(model) {
    if (!model || typeof model !== 'object') throw new Error('register: se esperaba un objeto de modelo.');
    var id = model.id;
    if (typeof id !== 'string' || !id) throw new Error('register: el modelo necesita un id de texto.');
    if (byId[id]) throw new Error('register: el modelo «' + id + '» ya está registrado.');
    if (!CATEGORIES[model.category]) throw new Error('register: categoría desconocida en «' + id + '»: ' + model.category);
    if (!Array.isArray(model.variants) || !model.variants.length) throw new Error('register: «' + id + '» necesita al menos una variante.');
    ['params', 'inputs', 'state', 'outputs', 'x0', 'output', 'hints', 'tfPairs', 'tf', 'derivation', 'invariants', 'readouts'].forEach(function (k) {
      if (!isFn(model[k])) throw new Error('register: «' + id + '» necesita la función ' + k + '().');
    });
    model.variants.forEach(function (v) {
      if (!v || typeof v.id !== 'string') throw new Error('register: variante sin id en «' + id + '».');
      if (v.timeDomain !== 'continuous' && v.timeDomain !== 'discrete') throw new Error('register: timeDomain inválido en «' + id + '/' + v.id + '».');
      if (v.timeDomain === 'continuous' && !isFn(model.deriv)) throw new Error('register: «' + id + '/' + v.id + '» es continua y necesita deriv().');
      if (v.timeDomain === 'discrete' && !isFn(model.next)) throw new Error('register: «' + id + '/' + v.id + '» es discreta y necesita next().');
    });
    if (!('listed' in model)) model.listed = true;
    if (!('sceneId' in model)) model.sceneId = null;
    if (!('wizard' in model)) model.wizard = null;
    if (!isFn(model.linearization)) model.linearization = function () { return null; };
    byId[id] = model;
    models.push(model);
    return model;
  }

  function get(id) { return (typeof id === 'string' && byId[id]) || null; }

  function list(opts) {
    var all = !!(opts && opts.all);
    return models.filter(function (m) { return all || m.listed !== false; });
  }

  function resolve(modelOrId) {
    var m = typeof modelOrId === 'string' ? get(modelOrId) : modelOrId;
    if (!m || typeof m !== 'object' || !m.id) throw new Error('Modelo desconocido: «' + modelOrId + '».');
    return m;
  }

  /** Variante por id (acepta los alias de model.variantAliases); sin id, la primera. */
  function variantOf(modelOrId, variantId) {
    var m = resolve(modelOrId);
    if (variantId === undefined || variantId === null || variantId === '') return m.variants[0];
    var id = (m.variantAliases && m.variantAliases[variantId]) || variantId;
    for (var i = 0; i < m.variants.length; i++) if (m.variants[i].id === id) return m.variants[i];
    throw new Error('El modelo «' + m.id + '» no tiene la variante «' + variantId + '».');
  }

  function defaultsOf(m, vid) {
    var out = {};
    m.params(vid).forEach(function (p) { out[p.key] = p.default; });
    return out;
  }

  function mergeParams(m, vid, given) {
    var p = defaultsOf(m, vid);
    if (given) Object.keys(given).forEach(function (k) {
      if (k in p && typeof given[k] === 'number' && isFinite(given[k])) p[k] = given[k];
    });
    return p;
  }

  /** Entrada por omisión de una variante: la primera de inputs(variant) con sus valores por omisión. */
  function defaultInput(modelOrId, variantId) {
    var m = resolve(modelOrId);
    var v = variantOf(m, variantId);
    var specs = m.inputs(v.id);
    if (!specs.length) return { type: 'ninguna', offset: 0 };
    var s = specs[0];
    var out = { type: s.id };
    (s.params || []).forEach(function (p) { out[p.key] = p.default; });
    return out;
  }

  function describe(modelOrId, variantId) {
    var m = resolve(modelOrId);
    var v = variantOf(m, variantId);
    var defaults = defaultsOf(m, v.id);
    return {
      model: m,
      variant: { id: v.id, label: v.label, timeDomain: v.timeDomain, linear: v.linear, timeUnit: v.timeUnit, summary: v.summary || '' },
      params: m.params(v.id),
      defaults: defaults,
      inputs: m.inputs(v.id),
      defaultInput: defaultInput(m, v.id),
      state: m.state(v.id),
      outputs: m.outputs(v.id),
      tfPairs: m.tfPairs(v.id),
      hints: m.hints(defaults, v.id),
      sceneId: m.sceneId
    };
  }

  /* ------------------------------------------------------------------ señales de entrada */

  function numOr(x, d) { return typeof x === 'number' && isFinite(x) ? x : d; }

  function normalizeInput(spec) {
    spec = spec || {};
    var type = spec.type || 'ninguna';
    if (INPUT_TYPES.indexOf(type) < 0) throw new Error('inputSignal: tipo de entrada desconocido «' + type + '».');
    return {
      type: type,
      amplitude: numOr(spec.amplitude, type === 'ninguna' ? 0 : 1),
      t0: numOr(spec.t0, 0),
      width: Math.max(0, numOr(spec.width, 1)),
      omega: numOr(spec.omega, 1),
      offset: numOr(spec.offset, 0)
    };
  }

  /** (t) → u. Tipos: escalon, pulso, senoidal, rampa (amplitude = pendiente), ninguna. */
  function inputSignal(spec) {
    var s = normalizeInput(spec);
    var A = s.amplitude, t0 = s.t0, off = s.offset, w = s.width, om = s.omega;
    var fn;
    switch (s.type) {
      case 'escalon': fn = function (t) { return off + (t >= t0 ? A : 0); }; break;
      case 'pulso': fn = function (t) { return off + (t >= t0 && t < t0 + w ? A : 0); }; break;
      case 'senoidal': fn = function (t) { return off + (t >= t0 ? A * Math.sin(om * (t - t0)) : 0); }; break;
      case 'rampa': fn = function (t) { return off + (t >= t0 ? A * (t - t0) : 0); }; break;
      default: fn = function () { return off; };
    }
    fn.spec = s;
    return fn;
  }

  /** Instantes de discontinuidad de la entrada (escalón y pulso), para no integrar a través de un salto. */
  function inputBreakpoints(spec) {
    var s = normalizeInput(spec);
    if (s.type === 'escalon' && s.amplitude !== 0) return [s.t0];
    if (s.type === 'pulso' && s.amplitude !== 0 && s.width > 0) return [s.t0, s.t0 + s.width];
    return [];
  }

  /* ------------------------------------------------------------------ simulación por lotes */

  /**
   * Trayectoria completa. Continuo: RK4 (u otro método) de paso fijo, por tramos entre las
   * discontinuidades de la entrada (en cada salto hay dos muestras con el mismo t: límite por la
   * izquierda y por la derecha). Discreto: itera next() durante `duration` periodos.
   */
  function simulate(modelOrId, opts) {
    opts = opts || {};
    var m = resolve(modelOrId);
    var v = variantOf(m, opts.variant);
    var vid = v.id;
    var p = mergeParams(m, vid, opts.params);
    var input = normalizeInput(opts.input || defaultInput(m, vid));
    var uf = inputSignal(input);
    var hints = m.hints(p, vid);
    var duration = opts.duration > 0 ? opts.duration : hints.duration;
    var T = [], X = [], U = [];
    var stats;

    if (v.timeDomain === 'discrete') {
      var n = Math.max(0, Math.round(duration));
      var x = m.x0(p, vid).slice();
      for (var k = 0; k <= n; k++) {
        var uk = uf(k);
        T.push(k); X.push(x.slice()); U.push(uk);
        if (k < n) x = m.next(k, x, uk, p, vid).slice();
      }
      stats = { method: 'iteración', steps: n, success: X.every(finiteRow), message: '' };
    } else {
      var dt = opts.dt > 0 ? opts.dt : hints.dt;
      var method = opts.method || 'rk4';
      var bps = inputBreakpoints(input).filter(function (b) { return b > 0 && b < duration; });
      var edges = [0].concat(bps, [duration]);
      var xs = m.x0(p, vid).slice();
      var steps = 0, ok = true, msg = '';
      for (var e = 0; e + 1 < edges.length; e++) {
        var ta = edges[e], tb = edges[e + 1];
        if (!(tb > ta)) continue;
        var uSeg = segmentInput(uf, ta, tb);
        var f = makeDeriv(m, p, vid, uSeg);
        var res = N().integrate(f, xs, ta, tb, {
          method: method, dt: dt, maxSteps: Math.ceil((tb - ta) / dt) + 16
        });
        for (var i = 0; i < res.t.length; i++) {
          T.push(res.t[i]); X.push(res.x[i]); U.push(uSeg(res.t[i]));
        }
        steps += res.stats.steps;
        xs = res.x[res.x.length - 1].slice();
        if (!res.stats.success) { ok = false; msg = res.stats.message; break; }
      }
      stats = { method: method, steps: steps, dt: dt, success: ok, message: msg };
    }

    var outputs = {};
    m.outputs(vid).forEach(function (o) { outputs[o.key] = new Array(T.length); });
    for (var j = 0; j < T.length; j++) {
      var o = m.output(T[j], X[j], U[j], p, vid);
      for (var key in outputs) outputs[key][j] = o[key];
    }
    return {
      modelId: m.id, variant: vid, timeDomain: v.timeDomain, timeUnit: v.timeUnit,
      params: p, input: input, duration: duration,
      t: T, x: X, u: U, outputs: outputs, stats: stats
    };
  }

  function finiteRow(r) { for (var i = 0; i < r.length; i++) if (!isFinite(r[i])) return false; return true; }

  /** Entrada evaluada dentro del tramo abierto (ta, tb): en los extremos da los límites laterales. */
  function segmentInput(uf, ta, tb) {
    var d = 1e-9 * Math.max(1, Math.abs(tb), Math.abs(ta));
    if (tb - ta <= 4 * d) return function () { return uf(0.5 * (ta + tb)); };
    var lo = ta + d, hi = tb - d;
    return function (t) { return uf(t < lo ? lo : t > hi ? hi : t); };
  }

  function makeDeriv(m, p, vid, uf) {
    return function (t, x) { return m.deriv(t, x, uf(t), p, vid); };
  }

  /* ------------------------------------------------------------------ datos sintéticos (asistente) */

  /**
   * «Datos medidos» deterministas para el paso 4 del asistente: simula con param = trueValue,
   * muestrea `samples` puntos uniformes en (0, duration] y suma ruido gaussiano con semilla.
   */
  function syntheticData(modelOrId, overrides) {
    var m = resolve(modelOrId);
    if (!m.wizard || !m.wizard.measured) throw new Error('syntheticData: «' + m.id + '» no define datos medidos.');
    var spec = Object.assign({}, m.wizard.measured, overrides || {});
    var params = Object.assign({}, spec.params || {});
    params[spec.param] = spec.trueValue;
    var traj = simulate(m, { variant: m.wizard.variant, params: params, input: spec.input, duration: spec.duration });
    var rng = util.mulberry32(spec.seed >>> 0);
    var t = [], y = [];
    var tt = traj.t, yy = traj.outputs[spec.outputKey];
    for (var i = 1; i <= spec.samples; i++) {
      var ti = spec.duration * i / spec.samples;
      t.push(ti);
      y.push(N().interp1(tt, yy, ti) + spec.noise * util.gaussian(rng));
    }
    return {
      modelId: m.id, variant: m.wizard.variant, param: spec.param, trueValue: spec.trueValue,
      outputKey: spec.outputKey, noise: spec.noise, seed: spec.seed, input: traj.input,
      duration: spec.duration, t: t, y: y
    };
  }

  /** RMSE entre los datos (syntheticData) y el modelo con data.param = value. */
  function calibrationError(modelOrId, value, data, extraParams) {
    var m = resolve(modelOrId);
    var params = Object.assign({}, extraParams || {});
    params[data.param] = value;
    var traj = simulate(m, { variant: data.variant, params: params, input: data.input, duration: data.duration });
    var model = N().interp1(traj.t, traj.outputs[data.outputKey], data.t);
    return { rmse: N().rmse(model, data.y), t: traj.t, y: traj.outputs[data.outputKey] };
  }

  /* ------------------------------------------------------------------ utilidades para los modelos */

  /** Redondeo «bonito» al más cercano (en escala log) de 1, 2, 2.5, 5 × 10^k. */
  function niceNumber(x) {
    if (!(x > 0) || !isFinite(x)) return 1;
    var e = Math.floor(Math.log10(x));
    var base = Math.pow(10, e);
    var cands = [1, 2, 2.5, 5, 10];
    var best = 1, bestD = Infinity;
    for (var i = 0; i < cands.length; i++) {
      var d = Math.abs(Math.log(x / (cands[i] * base)));
      if (d < bestD) { bestD = d; best = cands[i]; }
    }
    return +(best * base).toPrecision(6);
  }

  /** Redondeo hacia arriba a 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10^k. */
  function niceCeil(x) {
    if (!(x > 0) || !isFinite(x)) return 1;
    var e = Math.floor(Math.log10(x));
    var base = Math.pow(10, e);
    var cands = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < cands.length; i++) {
      var c = +(cands[i] * base).toPrecision(6);
      if (c >= x * (1 - 1e-9)) return c;
    }
    return 10 * base;
  }

  /**
   * Pistas de simulación a partir de los polos de una G(s):
   * duración = horizonte de tf (≤ `cycles` periodos del modo dominante oscilatorio), dt ≤ 0.1/|p|max
   * y ≤ duración/1500 (divide exactamente la duración), timeScale para ~`seconds` s reales a 1×.
   */
  function hintsFromTF(G, o) {
    o = o || {};
    var cycles = o.cycles || 40, seconds = o.seconds || 12, maxSteps = o.maxSteps || 20000;
    var poles = G.poles();
    var maxAbs = 0, slow = null;
    for (var i = 0; i < poles.length; i++) {
      var pp = poles[i], a = Math.sqrt(pp.re * pp.re + pp.im * pp.im);
      if (a > maxAbs) maxAbs = a;
      if (!slow || Math.abs(pp.re) < Math.abs(slow.re) - 1e-12 * a) slow = pp;
    }
    var duration = G.timeHorizon();
    if (slow && Math.abs(slow.im) > 1e-9 * Math.max(1, maxAbs)) duration = Math.min(duration, cycles * 2 * Math.PI / Math.abs(slow.im));
    if (o.factor) duration *= o.factor;
    duration = niceCeil(duration);
    var dt = duration / 1500;
    if (maxAbs > 0) dt = Math.min(dt, 0.1 / maxAbs);
    if (duration / dt > maxSteps) duration = maxSteps * dt;
    var n = Math.max(1, Math.ceil(duration / dt - 1e-9));
    dt = duration / n;
    return { duration: duration, dt: dt, timeScale: niceNumber(duration / seconds) };
  }

  /** Regla del trapecio sobre muestras (t, y). */
  function trapz(t, y) {
    var s = 0;
    for (var i = 1; i < t.length; i++) s += 0.5 * (t[i] - t[i - 1]) * (y[i] + y[i - 1]);
    return s;
  }

  /**
   * Cuadratura sobre muestras (t, y): Simpson compuesto en cada par de intervalos iguales
   * (los saltos de la entrada llegan como intervalos de longitud nula y cortan los pares);
   * trapecio en los intervalos sueltos.
   */
  function quad(t, y) {
    var s = 0, i = 1, n = t.length;
    while (i < n) {
      var h1 = t[i] - t[i - 1];
      if (i + 1 < n && h1 > 0) {
        var h2 = t[i + 1] - t[i];
        if (Math.abs(h2 - h1) <= 1e-9 * h1) {
          s += (h1 + h2) / 6 * (y[i - 1] + 4 * y[i] + y[i + 1]);
          i += 2;
          continue;
        }
      }
      s += 0.5 * h1 * (y[i] + y[i - 1]);
      i += 1;
    }
    return s;
  }

  /** Mín. y máx. de un array (ignora no finitos). */
  function range(a) {
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < a.length; i++) { var v = a[i]; if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    return [lo, hi];
  }

  /** Rango del eje con margen: incluye `include` (p. ej. 0). */
  function padRange(lo, hi, include, pad) {
    pad = pad === undefined ? 0.08 : pad;
    if (include !== undefined && include !== null) { lo = Math.min(lo, include); hi = Math.max(hi, include); }
    if (!isFinite(lo) || !isFinite(hi)) return [-1, 1];
    var span = hi - lo;
    if (!(span > 0)) span = Math.max(1e-9, Math.abs(hi) || 1);
    return [lo - pad * span, hi + pad * span];
  }

  /* Gauss–Legendre de 3 puntos en [0, 1]: exacta hasta grado 5. */
  var GL3 = [[0.5 - 0.5 * Math.sqrt(0.6), 5 / 18], [0.5, 8 / 18], [0.5 + 0.5 * Math.sqrt(0.6), 5 / 18]];

  /**
   * ∫P_dis dt y ∫P_ent dt sobre la trayectoria continua que dio el integrador: entre dos muestras,
   * x(t) es el interpolante cúbico de Hermite con x y ẋ = f(t, x, u) en los extremos (mismo orden que
   * RK4) y cada tramo se integra con Gauss–Legendre de 3 puntos. Así el residuo del balance refleja el
   * error de la trayectoria (método y paso) y no el de una cuadratura gruesa sobre las muestras.
   * Devuelve null si la trayectoria no es de un modelo continuo registrado.
   */
  function denseEnergy(traj, cfg) {
    var m = traj && typeof traj.modelId === 'string' ? get(traj.modelId) : null;
    if (!m || !isFn(m.deriv) || traj.timeDomain !== 'continuous' || !traj.input) return null;
    var p = traj.params, vid = traj.variant, t = traj.t, X = traj.x, U = traj.u;
    var uf = inputSignal(traj.input);
    var nx = X[0].length, xm = new Array(nx);
    var D = 0, W = 0, f0 = null, f1;
    for (var i = 0; i + 1 < t.length; i++) {
      var h = t[i + 1] - t[i];
      if (!(h > 0)) { f0 = null; continue; }
      if (!f0) f0 = m.deriv(t[i], X[i], U[i], p, vid);
      f1 = m.deriv(t[i + 1], X[i + 1], U[i + 1], p, vid);
      for (var g = 0; g < 3; g++) {
        var s = GL3[g][0], s2 = s * s, s3 = s2 * s;
        var h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
        for (var k = 0; k < nx; k++) xm[k] = h00 * X[i][k] + h10 * h * f0[k] + h01 * X[i + 1][k] + h11 * h * f1[k];
        var u = uf(t[i] + s * h);
        D += GL3[g][1] * h * cfg.dissipated(xm, u, p);
        W += GL3[g][1] * h * cfg.input(xm, u, p);
      }
      f0 = f1;
    }
    return { D: D, W: W };
  }

  /**
   * Invariante de balance de energía: ΔE + ∫P_dis dt = ∫P_in dt.
   * cfg: { stored(x, p), dissipated(x, u, p), input(x, u, p), unit, tolerance = 1e-3 (relativa) }
   * (los modelos lo exponen con energy(variant)). Las integrales se toman sobre la trayectoria continua
   * del integrador (denseEnergy); para trayectorias que no salen de simulate(), Simpson sobre las muestras.
   */
  function energyBalance(traj, cfg) {
    var p = traj.params, t = traj.t, X = traj.x, U = traj.u;
    var n = t.length;
    var Emax = 0;
    for (var i = 0; i < n; i++) Emax = Math.max(Emax, Math.abs(cfg.stored(X[i], p)));
    var E0 = cfg.stored(X[0], p), E1 = cfg.stored(X[n - 1], p);
    var dense = denseEnergy(traj, cfg), D, W;
    if (dense) {
      D = dense.D; W = dense.W;
    } else {
      var Pd = new Array(n), Pin = new Array(n);
      for (var j = 0; j < n; j++) { Pd[j] = cfg.dissipated(X[j], U[j], p); Pin[j] = cfg.input(X[j], U[j], p); }
      D = quad(t, Pd); W = quad(t, Pin);
    }
    var res = (E1 - E0) + D - W;
    var scale = Math.max(Emax, Math.abs(D), Math.abs(W), 1e-300);
    var relTol = cfg.tolerance || 1e-3;
    var tol = relTol * scale;
    var f = function (x) { return util.formatNumber(x, 4); };
    return {
      id: 'energia', label: 'Balance de energía',
      tex: '\\Delta E + E_{\\mathrm{dis}} = W_{\\mathrm{ent}}',
      value: res, tolerance: tol, relative: Math.abs(res) / scale, unit: cfg.unit || 'J',
      ok: Math.abs(res) <= tol,
      detail: 'Energía almacenada: ' + f(E0) + ' → ' + f(E1) + ' ' + (cfg.unit || 'J') +
        '; disipada: ' + f(D) + '; aportada por la entrada: ' + f(W) + '. Residuo: ' + f(res) + '.',
      parts: { E0: E0, E1: E1, dissipated: D, input: W, source: dense ? 'trayectoria' : 'muestras' }
    };
  }

  /* ---------------------------------------------------- TeX con números */

  function texNum(x, d) { return LX().num(x, d === undefined ? 4 : d); }

  /**
   * Combinación lineal en TeX: lin([[m, '\\ddot{x}'], [b, '\\dot{x}'], [k, 'x']]) → '\\ddot{x} + 0.8\\,\\dot{x} + 4\\,x'.
   * Omite términos nulos y coeficientes unitarios; un símbolo vacío es un término constante.
   */
  function lin(terms, d) {
    var out = '';
    for (var i = 0; i < terms.length; i++) {
      var c = terms[i][0], sym = terms[i][1] || '';
      if (c === 0 || !isFinite(c)) continue;
      var neg = c < 0, a = Math.abs(c);
      var body;
      if (sym && Math.abs(a - 1) < 1e-12) body = sym;
      else body = texNum(a, d) + (sym ? '\\,' + sym : '');
      if (!out) out = (neg ? '-' : '') + body;
      else out += (neg ? ' - ' : ' + ') + body;
    }
    return out || '0';
  }

  /** Unidad en TeX: '\\;\\mathrm{rad/s}'. */
  function unitTex(u) { return u ? '\\;\\mathrm{' + u + '}' : ''; }

  /** Construye un ParamSpec con valores por omisión del contrato. */
  function param(o) {
    return {
      key: o.key, label: o.label, symbol: o.symbol, unit: o.unit || '',
      min: o.min, max: o.max, step: o.step, default: o.default,
      tooltip: o.tooltip, scale: o.scale || 'linear', live: o.live !== false,
      display: o.display || null
    };
  }

  /** Ficha de una entrada { id, label, symbol, unit, description, params }. */
  var INPUT_LABELS = { escalon: 'Escalón', pulso: 'Pulso', senoidal: 'Senoidal', rampa: 'Rampa', ninguna: 'Sin entrada' };
  function inputSpec(id, o) {
    o = o || {};
    return {
      id: id, label: o.label || INPUT_LABELS[id], symbol: o.symbol || 'u(t)', unit: o.unit || '',
      description: o.description || '', params: (o.params || []).map(param)
    };
  }

  function timeKey(unit) { return unit === 'días' ? 'día' : unit === 'periodos' ? 'periodo' : 's'; }

  /** Parámetros de entrada estándar con las claves fijas del contrato. */
  var inputParams = {
    amplitude: function (o) {
      return Object.assign({ key: 'amplitude', label: 'Amplitud', tooltip: 'Tamaño del cambio de la entrada respecto de su valor de reposo.' }, o);
    },
    t0: function (o) {
      return Object.assign({ key: 't0', label: 'Instante de inicio', symbol: 't_0', min: 0, step: 0.1, default: 0,
        tooltip: 'Momento en que la entrada empieza a actuar.' }, o);
    },
    width: function (o) {
      return Object.assign({ key: 'width', label: 'Duración del pulso', symbol: 'T_p',
        tooltip: 'Tiempo durante el que la entrada permanece activa antes de volver a su valor de reposo.' }, o);
    },
    omega: function (o) {
      return Object.assign({ key: 'omega', label: 'Frecuencia angular', symbol: '\\omega', unit: 'rad/s',
        tooltip: 'Rapidez de la oscilación de la entrada: ω = 2π/T. Cerca de la frecuencia natural del sistema aparece la resonancia.' }, o);
    },
    offset: function (o) {
      return Object.assign({ key: 'offset', label: 'Valor de reposo', tooltip: 'Valor constante alrededor del cual varía la entrada.' }, o);
    }
  };

  /* ------------------------------------------------------------------ exportación */

  S.CATEGORIES = CATEGORIES;
  S.G = G_ACC;
  S.register = register;
  S.get = get;
  S.list = list;
  S.describe = describe;
  S.variantOf = variantOf;
  S.defaults = function (modelOrId, variantId) { var m = resolve(modelOrId); return defaultsOf(m, variantOf(m, variantId).id); };
  S.defaultInput = defaultInput;
  S.inputSignal = inputSignal;
  S.inputBreakpoints = inputBreakpoints;
  S.normalizeInput = normalizeInput;
  S.simulate = simulate;
  S.syntheticData = syntheticData;
  S.calibrationError = calibrationError;
  S.helpers = {
    G: G_ACC,
    resolve: resolve,
    mergeParams: mergeParams,
    niceNumber: niceNumber,
    niceCeil: niceCeil,
    hintsFromTF: hintsFromTF,
    trapz: trapz,
    quad: quad,
    range: range,
    padRange: padRange,
    energyBalance: energyBalance,
    denseEnergy: denseEnergy,
    segmentInput: segmentInput,
    num: texNum,
    lin: lin,
    unitTex: unitTex,
    param: param,
    inputSpec: inputSpec,
    inputParams: inputParams,
    timeKey: timeKey,
    tfClass: TF
  };
})(window.DSL);
