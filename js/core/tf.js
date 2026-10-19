/*
 * js/core/tf.js — Propietario: math.
 * Clase TransferFunction: normalización, polos y ceros, ganancia en continua, estabilidad, tabla de
 * Routh-Hurwitz (casos especiales incluidos), Bode con fase desenrollada, fracciones parciales de G(s)/s
 * (polos reales, complejos y repetidos), y(t) analítica con TeX, métricas del escalón y validación de
 * coeficientes escritos por el usuario → DSL.core.tf. API: docs/api/tf.md.
 */
(function (DSL) {
  'use strict';

  var N = DSL.core.numeric;
  var P = N.poly;
  var cx = N.cx;
  var EPS = N.EPS;
  var DEG = 180 / Math.PI;

  /* ================================================================ errores */

  class TFInputError extends Error {
    constructor(message, info) {
      super(message);
      info = info || {};
      this.name = 'TFInputError';
      this.field = info.field === undefined ? null : info.field;
      this.code = info.code === undefined ? null : info.code;
      this.token = info.token === undefined ? null : info.token;
    }
  }

  var FIELD = { num: 'numerador', den: 'denominador' };
  function fieldName(f) { return FIELD[f] || 'polinomio'; }

  /* ===================================================== formato TeX (perezoso) */

  function fmtText(x, d) { return DSL.util.formatNumber(x, d === undefined ? 4 : d); }

  // latex.js se carga después: se usa en tiempo de llamada, con un respaldo mínimo.
  function texNum(x, d) {
    var L = DSL.core.latex;
    if (L && typeof L.num === 'function') return L.num(x, d);
    if (x === Infinity) return '\\infty';
    if (x === -Infinity) return '-\\infty';
    return DSL.util.formatNumber(x, d === undefined ? 4 : d, { ascii: true, sci: 'e' });
  }
  function texPoly(c, v, d) {
    var L = DSL.core.latex;
    if (L && typeof L.poly === 'function') return L.poly(c, v, { digits: d });
    var n = c.length - 1, parts = [];
    for (var i = 0; i < c.length; i++) {
      if (c[i] === 0) continue;
      var pw = n - i, m = texNum(Math.abs(c[i]), d);
      var vp = pw === 0 ? '' : pw === 1 ? v : v + '^{' + pw + '}';
      var body = pw === 0 ? m : (m === '1' ? vp : m + ' ' + vp);
      parts.push((c[i] < 0 ? '-' : '+') + ' ' + body);
    }
    if (!parts.length) return '0';
    var s = parts.join(' ');
    return s.charAt(0) === '+' ? s.slice(2) : '-' + s.slice(2);
  }

  /* ======================================================== utilidades varias */

  function freezeRoots(list) {
    return Object.freeze(list.map(function (r) { return Object.freeze({ re: r.re, im: r.im }); }));
  }

  function absC(z) { return Math.hypot(z.re, z.im); }

  /** Tolerancia por raíz para «sobre el eje jω»: |Re p| ≤ 1e-9·max(1, |p|). */
  function axisTol(z) { return 1e-9 * Math.max(1, absC(z)); }
  function onAxis(z) { return Math.abs(z.re) <= axisTol(z); }

  function rootScale(roots) {
    var s = 0;
    for (var i = 0; i < roots.length; i++) s = Math.max(s, absC(roots[i]));
    return s;
  }

  function padLeft(p, len) {
    var out = new Array(len).fill(0);
    for (var i = 0; i < p.length; i++) out[len - p.length + i] = p[i];
    return out;
  }

  function lowestNonzero(p) {
    for (var i = p.length - 1; i >= 0; i--) if (p[i] !== 0) return { value: p[i], order: p.length - 1 - i };
    return null;
  }

  function trailingZeros(p) {
    var k = 0;
    for (var i = p.length - 1; i > 0 && p[i] === 0; i--) k++;
    return k;
  }

  function toCoeffArray(v, field) {
    if (!v || typeof v.length !== 'number' || typeof v === 'string') {
      throw new TFInputError('Los coeficientes del ' + fieldName(field) + ' deben ser una lista de números.', { field: field, code: 'nonfinite' });
    }
    if (v.length === 0) {
      throw new TFInputError('Escriba al menos un coeficiente en el ' + fieldName(field) + '.', { field: field, code: 'empty' });
    }
    var out = [];
    for (var i = 0; i < v.length; i++) {
      var c = v[i];
      if (typeof c !== 'number' || !isFinite(c)) {
        throw new TFInputError('El coeficiente ' + (i + 1) + ' del ' + fieldName(field) + ' no es un número finito.', { field: field, code: 'nonfinite', token: String(c) });
      }
      out.push(c + 0);
    }
    return out;
  }

  /* ================================================ fracciones parciales */

  // (a + h)·Q(h) truncada a m términos (series complejas).
  function seriesMulLinear(Q, a, m) {
    var R = [];
    for (var j = 0; j < m; j++) {
      var q = Q[j] || { re: 0, im: 0 };
      var qm = j > 0 ? (Q[j - 1] || { re: 0, im: 0 }) : { re: 0, im: 0 };
      R.push({ re: a.re * q.re - a.im * q.im + qm.re, im: a.re * q.im + a.im * q.re + qm.im });
    }
    return R;
  }

  function seriesDiv(A, Q, m) {
    var H = [];
    for (var j = 0; j < m; j++) {
      var acc = { re: A[j].re, im: A[j].im };
      for (var i = 1; i <= j; i++) {
        var pr = cx.mul(Q[i], H[j - i]);
        acc.re -= pr.re; acc.im -= pr.im;
      }
      H.push(cx.div(acc, Q[0]));
    }
    return H;
  }

  /**
   * Núcleo de fracciones parciales de num/den (estrictamente propia).
   * Devuelve { entries: [{ pole, multiplicity, power, residue }], groups }.
   */
  function pfCore(num, den, roots) {
    var d = P.trim(den, 0), nn = P.trim(num, 0);
    if (d.length < 2) throw new Error('partialFractions: el denominador debe tener grado ≥ 1.');
    if (!P.isZero(nn) && nn.length >= d.length) throw new Error('partialFractions: la función racional debe ser estrictamente propia.');
    var lead = d[0];
    var r = roots || N.polyRoots(d);
    var groups = N.groupRoots(r, { coeffs: d });
    var entries = [];
    for (var gi = 0; gi < groups.length; gi++) {
      var g = groups[gi], p = g.value, m = g.multiplicity;
      var Q = [{ re: lead, im: 0 }];
      for (var k = 1; k < m; k++) Q.push({ re: 0, im: 0 });
      for (var hj = 0; hj < groups.length; hj++) {
        if (hj === gi) continue;
        var dd = cx.sub(p, groups[hj].value);
        for (var t = 0; t < groups[hj].multiplicity; t++) Q = seriesMulLinear(Q, dd, m);
      }
      var Nt = P.isZero(nn) ? Q.map(function () { return { re: 0, im: 0 }; }) : P.taylorC(nn, p, m);
      var H = seriesDiv(Nt, Q, m);
      for (var pw = 1; pw <= m; pw++) {
        var res = H[m - pw];
        entries.push({ pole: { re: p.re, im: p.im }, multiplicity: m, power: pw, residue: { re: res.re + 0, im: res.im + 0 } });
      }
    }
    // Residuos reales exactos para polos reales; conjugados exactos para pares conjugados.
    entries.forEach(function (e) { if (e.pole.im === 0) e.residue.im = 0; });
    entries.forEach(function (e) {
      if (e.pole.im <= 0) return;
      for (var i = 0; i < entries.length; i++) {
        var f = entries[i];
        if (f.pole.im < 0 && f.power === e.power && f.pole.re === e.pole.re && f.pole.im === -e.pole.im) {
          var rr = (e.residue.re + f.residue.re) / 2, ri = (e.residue.im - f.residue.im) / 2;
          e.residue = { re: rr + 0, im: ri + 0 };
          f.residue = { re: rr + 0, im: -ri + 0 };
          break;
        }
      }
    });
    // Ruido de redondeo: una parte real o imaginaria ≤ 1e-12·|r| es 0 exactamente (−1 ∓ 5.6e-17j → −1).
    entries.forEach(function (e) {
      var mag = absC(e.residue);
      if (Math.abs(e.residue.re) <= 1e-12 * mag) e.residue.re = 0;
      if (Math.abs(e.residue.im) <= 1e-12 * mag) e.residue.im = 0;
    });
    return { entries: entries, groups: groups };
  }

  /** Comprueba Σ r/(s−p)^k = num/den en puntos complejos de prueba. */
  function pfCheck(entries, num, den) {
    var S = 0;
    entries.forEach(function (e) { S = Math.max(S, absC(e.pole)); });
    if (S === 0) S = 1;
    var probes = [[0.5, 0.9], [0.93, 2.1], [1.4, 1.3], [2.5, 0.4], [1.17, -2.6]];
    var checked = 0;
    for (var i = 0; i < probes.length; i++) {
      var s = cx.fromPolar(probes[i][0] * S, probes[i][1]);
      var near = entries.some(function (e) { return absC(cx.sub(s, e.pole)) < 1e-3 * S; });
      if (near) continue;
      var Y = cx.div(P.evalC(num, s), P.evalC(den, s));
      var sum = { re: 0, im: 0 }, mag = 0;
      for (var k = 0; k < entries.length; k++) {
        var e = entries[k];
        var term = cx.div(e.residue, cx.pow(cx.sub(s, e.pole), e.power));
        sum.re += term.re; sum.im += term.im; mag += absC(term);
      }
      var err = absC(cx.sub(sum, Y));
      if (!(err <= 1e-8 * (absC(Y) + 1e-4 * mag) + 1e-300)) return false;
      checked++;
    }
    return checked > 0;
  }

  /* ===================================================== términos temporales */

  function buildTerms(entries) {
    var terms = [];
    entries.forEach(function (e) {
      if (e.pole.im === 0) {
        terms.push({ kind: 'real', p: e.pole.re, k: e.power, c: e.residue.re });
      } else if (e.pole.im > 0) {
        terms.push({ kind: 'osc', sigma: e.pole.re, omega: e.pole.im, k: e.power, A: 2 * e.residue.re, B: -2 * e.residue.im });
      }
    });
    // Orden de presentación: polo en el origen (régimen permanente) primero; luego el orden de los polos.
    var origin = terms.filter(function (t) { return t.kind === 'real' && t.p === 0; });
    var rest = terms.filter(function (t) { return !(t.kind === 'real' && t.p === 0); });
    return origin.concat(rest);
  }

  function evalTerms(terms, t) {
    if (!(t >= 0)) return 0;
    var y = 0;
    for (var i = 0; i < terms.length; i++) {
      var tm = terms[i];
      var tk = tm.k === 1 ? 1 : Math.pow(t, tm.k - 1) / N.factorial(tm.k - 1);
      if (tm.kind === 'real') {
        if (tm.c === 0) continue;
        y += tm.c * tk * (tm.p === 0 ? 1 : Math.exp(tm.p * t));
      } else {
        if (tm.A === 0 && tm.B === 0) continue;
        var wt = tm.omega * t;
        y += tk * (tm.sigma === 0 ? 1 : Math.exp(tm.sigma * t)) * (tm.A * Math.cos(wt) + tm.B * Math.sin(wt));
      }
    }
    return y;
  }

  function expTex(p, d) {
    var m = texNum(Math.abs(p), d);
    return 'e^{' + (p < 0 ? '-' : '') + (m === '1' ? '' : m) + 't}';
  }
  function tPowTex(k) { return k === 1 ? '' : k === 2 ? 't' : 't^{' + (k - 1) + '}'; }
  function wtTex(w, d) { var m = texNum(w, d); return (m === '1' ? '' : m) + 't'; }

  /** ¿Se escribe como 0 la parte real `re` de un polo re + j·im? (exacta, o sobre el eje jω si lo hay). */
  function axisPrinter(hasAxis) {
    return function (re, im) {
      if (re === 0) return true;
      return !!hasAxis && Math.abs(re) <= 1e-9 * Math.max(1, Math.hypot(re, im));
    };
  }

  function termScale(terms) {
    var scale = 0;
    terms.forEach(function (tm) {
      var fk = N.factorial(tm.k - 1);
      scale = Math.max(scale, tm.kind === 'real' ? Math.abs(tm.c) / fk : Math.max(Math.abs(tm.A), Math.abs(tm.B)) / fk);
    });
    return scale;
  }

  /** x redondeado a d cifras exactamente como lo escribe DSL.core.latex.num(x, d). */
  function roundDisp(x, d) {
    if (x === 0 || !isFinite(x)) return x;
    return Number(DSL.util.formatNumber(x, d, { sci: 'e', ascii: true }));
  }

  /**
   * Términos tal como se muestran con d cifras (mismas reglas de omisión que termTex): coeficientes,
   * polos, σ y ω redondeados. evalTerms(roundTerms(…), t) es la y(t) que el estudiante lee.
   */
  function roundTerms(terms, d, isAxis) {
    var scale = termScale(terms), out = [];
    terms.forEach(function (tm) {
      var fk = N.factorial(tm.k - 1);
      if (tm.kind === 'real') {
        var a = tm.c / fk;
        if (!(Math.abs(a) > 1e-10 * scale)) return;
        out.push({ kind: 'real', k: tm.k, c: roundDisp(a, d) * fk, p: isAxis(tm.p, 0) ? 0 : roundDisp(tm.p, d) });
        return;
      }
      var A = tm.A / fk, B = tm.B / fk, big = Math.max(Math.abs(A), Math.abs(B));
      if (!(big > 1e-10 * scale)) return;
      var useA = Math.abs(A) > 1e-9 * big, useB = Math.abs(B) > 1e-9 * big;
      out.push({
        kind: 'osc', k: tm.k, A: useA ? roundDisp(A, d) * fk : 0, B: useB ? roundDisp(B, d) * fk : 0,
        sigma: isAxis(tm.sigma, tm.omega) ? 0 : roundDisp(tm.sigma, d), omega: roundDisp(tm.omega, d)
      });
    });
    return out;
  }

  /** Σ r/(s − p)^k de unos términos en forma real (Laplace de evalTerms). */
  function termsLaplace(terms, s) {
    var sum = { re: 0, im: 0 };
    terms.forEach(function (tm) {
      var term;
      if (tm.kind === 'real') {
        term = cx.div({ re: tm.c, im: 0 }, cx.pow(cx.sub(s, { re: tm.p, im: 0 }), tm.k));
      } else {
        // A cos ωt + B sen ωt = r e^{jωt} + r̄ e^{−jωt} con r = (A − jB)/2 (por cada t^{k−1}/(k−1)!).
        var r = { re: tm.A / 2, im: -tm.B / 2 }, p = { re: tm.sigma, im: tm.omega };
        var t1 = cx.div(r, cx.pow(cx.sub(s, p), tm.k));
        var t2 = cx.div(cx.conj(r), cx.pow(cx.sub(s, cx.conj(p)), tm.k));
        term = cx.add(t1, t2);
      }
      sum.re += term.re; sum.im += term.im;
    });
    return sum;
  }

  /** Clave de escritura de un polo con d cifras (dos polos distintos deben escribirse distinto). */
  function poleKey(p, d, isAxis) {
    var re = isAxis(p.re, p.im) ? '0' : texNum(p.re, d);
    return p.im === 0 ? re : re + '|' + (p.im < 0 ? '-' : '+') + texNum(Math.abs(p.im), d);
  }

  var DISPLAY_DIGITS = [4, 6, 8, 10, 12];

  /**
   * Menor número de cifras d ∈ {4, 6, 8, 10, 12} con el que la respuesta escrita (polos y residuos
   * redondeados a d cifras) reproduce la exacta en 200 instantes de [0, T] dentro de 1e-3·máx|y|,
   * la suma de fracciones escrita reproduce num/den en puntos complejos dentro de 1e-3 relativo, y
   * polos distintos se escriben distinto. Si ninguno basta, 12.
   */
  function displayDigits(terms, groups, fnExact, T, num, den, isAxis) {
    var ts = N.linspace(0, T, 200), ye = ts.map(fnExact);
    var tolT = 1e-3 * N.maxAbs(ye);
    var S = 0;
    groups.forEach(function (g) { S = Math.max(S, absC(g.value)); });
    if (!(S > 0)) S = 1;
    var probes = [];
    [[0.5, 0.9], [0.93, 2.1], [1.4, 1.3], [1.17, -2.6], [0.7, -0.6]].forEach(function (pr) {
      var s = cx.fromPolar(pr[0] * S, pr[1]);
      if (groups.some(function (g) { return absC(cx.sub(s, g.value)) < 0.05 * S; })) return;
      probes.push({ s: s, Y: cx.div(P.evalC(num, s), P.evalC(den, s)) });
    });
    for (var i = 0; i < DISPLAY_DIGITS.length; i++) {
      var d = DISPLAY_DIGITS[i];
      var keys = groups.map(function (g) { return poleKey(g.value, d, isAxis); });
      var distinct = keys.every(function (k, j) { return keys.indexOf(k) === j; });
      if (!distinct) continue;
      var rt = roundTerms(terms, d, isAxis);
      var ok = true;
      for (var j = 0; j < ts.length && ok; j++) if (!(Math.abs(evalTerms(rt, ts[j]) - ye[j]) <= tolT)) ok = false;
      for (var q = 0; q < probes.length && ok; q++) {
        var Yr = termsLaplace(rt, probes[q].s);
        if (!(absC(cx.sub(Yr, probes[q].Y)) <= 1e-3 * absC(probes[q].Y))) ok = false;
      }
      if (ok) return d;
    }
    return DISPLAY_DIGITS[DISPLAY_DIGITS.length - 1];
  }

  /** TeX de cada término: { sign, body } (body sin signo) o null si es despreciable. */
  function termTex(tm, scale, d, isAxis) {
    var fk = N.factorial(tm.k - 1);
    var tp = tPowTex(tm.k);
    if (tm.kind === 'real') {
      var a = tm.c / fk;
      if (!(Math.abs(a) > 1e-10 * scale)) return null;
      var mag = texNum(Math.abs(a), d);
      if (mag === '0') return null;
      var pz = isAxis(tm.p, 0) ? 0 : tm.p;
      var factors = [tp, pz === 0 ? '' : expTex(pz, d)].filter(Boolean).join('\\,');
      var body = factors ? (mag === '1' ? factors : mag + '\\,' + factors) : mag;
      return { sign: a < 0 ? -1 : 1, body: body };
    }
    var A = tm.A / fk, B = tm.B / fk;
    var big = Math.max(Math.abs(A), Math.abs(B));
    if (!(big > 1e-10 * scale)) return null;
    var useA = Math.abs(A) > 1e-9 * big && texNum(Math.abs(A), d) !== '0';
    var useB = Math.abs(B) > 1e-9 * big && texNum(Math.abs(B), d) !== '0';
    if (!useA && !useB) return null;
    var sign = useA ? (A < 0 ? -1 : 1) : (B < 0 ? -1 : 1);
    var a2 = Math.abs(A), b2 = B * sign;
    var wt = wtTex(tm.omega, d);
    var cosT = '\\cos(' + wt + ')', sinT = '\\sin(' + wt + ')';
    var sz = isAxis(tm.sigma, tm.omega) ? 0 : tm.sigma;
    var pre = [tp, sz === 0 ? '' : expTex(sz, d)].filter(Boolean).join('\\,');
    var inner;
    if (useA && useB) {
      var ma = texNum(a2, d), mb = texNum(Math.abs(b2), d);
      inner = (ma === '1' ? '' : ma + '\\,') + cosT + (b2 < 0 ? ' - ' : ' + ') + (mb === '1' ? '' : mb + '\\,') + sinT;
      return { sign: sign, body: (pre ? pre + '\\left(' + inner + '\\right)' : '\\left(' + inner + '\\right)') };
    }
    var coef = texNum(useA ? a2 : Math.abs(b2), d);
    var trig = useA ? cosT : sinT;
    var parts = [coef === '1' ? '' : coef, pre, trig].filter(Boolean).join('\\,');
    return { sign: sign, body: parts };
  }

  function assembleTex(lhs, terms, digits, domain, isAxis) {
    var scale = termScale(terms);
    var out = '';
    terms.forEach(function (tm) {
      var tt = termTex(tm, scale, digits, isAxis);
      tm.tex = tt ? (tt.sign < 0 ? '-' : '') + tt.body : '';
      if (!tt) return;
      if (!out) out = (tt.sign < 0 ? '-' : '') + tt.body;
      else out += (tt.sign < 0 ? ' - ' : ' + ') + tt.body;
    });
    return lhs + ' = ' + (out || '0') + ',\\; ' + domain;
  }

  /* ============================================ simulación numérica (respaldo) */

  function ssOf(tf) {
    var a = tf.den, n = a.length - 1, b = padLeft(tf.num, n + 1), D = b[0];
    var Cv = new Array(n);
    for (var i = 0; i < n; i++) Cv[i] = b[n - i] - D * a[n - i];
    return { n: n, a: a, C: Cv, D: D };
  }

  function ssDeriv(ss, u) {
    var n = ss.n, a = ss.a;
    return function (t, x) {
      var dx = new Array(n);
      for (var i = 0; i < n - 1; i++) dx[i] = x[i + 1];
      var s = u;
      for (var j = 0; j < n; j++) s -= a[n - j] * x[j];
      dx[n - 1] = s;
      return dx;
    };
  }

  function ssOutput(ss, x, u, kind) {
    var y = kind === 'step' ? ss.D * u : 0;
    for (var i = 0; i < ss.n; i++) y += ss.C[i] * x[i];
    return y;
  }

  function stepSize(tf, tMax) {
    var rho = rootScale(tf.poles()) || 1;
    var dt = Math.min(tMax / 4000, 0.1 / rho);
    if (tMax / dt > 2e6) dt = tMax / 2e6;
    return dt;
  }

  /** RK4 de la realización canónica controlable, aterrizando exactamente en cada instante pedido. */
  function simulateAt(tf, times, kind) {
    var ss = ssOf(tf), u = kind === 'step' ? 1 : 0, f = ssDeriv(ss, u);
    var out = new Array(times.length).fill(0);
    var idx = [];
    for (var i = 0; i < times.length; i++) if (times[i] >= 0) idx.push(i);
    idx.sort(function (p, q) { return times[p] - times[q] || p - q; });
    if (!idx.length) return out;
    var tMax = times[idx[idx.length - 1]];
    var h = tMax > 0 ? stepSize(tf, tMax) : 1;
    var x = new Array(ss.n).fill(0);
    if (kind === 'impulse') x[ss.n - 1] = 1;
    var t = 0;
    for (var k = 0; k < idx.length; k++) {
      var target = times[idx[k]];
      while (t < target) {
        var hh = Math.min(h, target - t);
        if (target - (t + hh) < 1e-12 * h) hh = target - t;
        x = N.rk4Step(f, t, x, hh);
        t = t + hh === target ? target : t + hh;
        if (target - t < 1e-14 * Math.max(1, target)) t = target;
      }
      out[idx[k]] = ssOutput(ss, x, u, kind);
    }
    return out;
  }

  /** Tabla densa (y, y') para evaluar fn(t) numérica con Hermite cúbico. */
  function numericFn(tf, kind) {
    var table = null;
    var build = function (Tm) {
      var M = 4000, ss = ssOf(tf), u = kind === 'step' ? 1 : 0, f = ssDeriv(ss, u);
      var H = Tm / M, rho = rootScale(tf.poles()) || 1;
      var sub = Math.max(1, Math.min(500, Math.ceil(H * rho / 0.05)));
      var x = new Array(ss.n).fill(0);
      if (kind === 'impulse') x[ss.n - 1] = 1;
      var ts = [], ys = [], dys = [];
      for (var i = 0; i <= M; i++) {
        var t = i * H;
        var dx = f(t, x);
        ts.push(t); ys.push(ssOutput(ss, x, u, kind));
        var dy = 0;
        for (var j = 0; j < ss.n; j++) dy += ss.C[j] * dx[j];
        dys.push(dy);
        if (i < M) for (var s = 0; s < sub; s++) x = N.rk4Step(f, t + s * H / sub, x, H / sub);
      }
      table = { T: Tm, H: H, t: ts, y: ys, dy: dys };
    };
    return function (t) {
      if (!(t >= 0)) return 0;
      if (!table || t > table.T) build(Math.max(t * 1.25, table ? table.T * 2 : tf.timeHorizon() * 2));
      var i = Math.min(table.t.length - 2, Math.floor(t / table.H));
      var ta = table.t[i], h = table.H, s = (t - ta) / h, s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * table.y[i] + (s3 - 2 * s2 + s) * h * table.dy[i] +
        (-2 * s3 + 3 * s2) * table.y[i + 1] + (s3 - s2) * h * table.dy[i + 1];
    };
  }

  /* ========================================================= Routh–Hurwitz */

  function routhBuild(a, epsVal) {
    var n = a.length - 1, w = Math.floor(n / 2) + 1, i, j;
    var rows = [], errs = [], specials = [], epsCells = [];
    var r0 = new Array(w).fill(0), r1 = new Array(w).fill(0);
    for (j = 0; j < w; j++) {
      if (2 * j <= n) r0[j] = a[2 * j];
      if (2 * j + 1 <= n) r1[j] = a[2 * j + 1];
    }
    rows.push(r0); errs.push(r0.map(Math.abs));
    if (n >= 1) { rows.push(r1); errs.push(r1.map(Math.abs)); }
    for (i = 1; i <= n; i++) {
      if (i >= 2) {
        var A = rows[i - 2], B = rows[i - 1], row = new Array(w).fill(0), er = new Array(w).fill(0);
        for (j = 0; j < w - 1; j++) {
          var p1 = B[0] * A[j + 1], p2 = A[0] * B[j + 1];
          row[j] = (p1 - p2) / B[0];
          er[j] = (Math.abs(p1) + Math.abs(p2)) / Math.abs(B[0]);
        }
        rows.push(row); errs.push(er);
      }
      var cur = rows[i], ce = errs[i];
      var meaningful = Math.floor((n - i) / 2) + 1;
      var isZ = function (k) { return cur[k] === 0 || Math.abs(cur[k]) <= 1e-10 * ce[k]; };
      var allZero = true;
      for (j = 0; j < meaningful; j++) if (!isZ(j)) { allZero = false; break; }
      if (allZero) {
        var prev = rows[i - 1], kp = n - (i - 1);
        var aux = new Array(kp + 1).fill(0);
        for (j = 0; 2 * j <= kp; j++) aux[2 * j] = prev[j];
        var nr = new Array(w).fill(0);
        for (j = 0; kp - 2 * j >= 1; j++) nr[j] = (kp - 2 * j) * prev[j];
        rows[i] = nr; errs[i] = nr.map(Math.abs);
        specials.push({ type: 'zero-row', row: i, power: n - i, auxiliary: aux, auxPower: kp });
      } else if (isZ(0)) {
        for (j = 1; j < w; j++) if (isZ(j)) cur[j] = 0;
        cur[0] = epsVal; ce[0] = epsVal;
        epsCells.push(i);
        specials.push({ type: 'zero-first-column', row: i, power: n - i, epsilon: epsVal });
      } else {
        for (j = 0; j < w; j++) if (isZ(j)) cur[j] = 0;
      }
    }
    return { rows: rows, specials: specials, epsCells: epsCells };
  }

  function plural(n, one, many) { return n === 1 ? one : many; }

  /* ===================================================== validación de texto */

  var SPLIT_RE = /[\s;]+/;

  function parseCoeffs(str, field) {
    var s = str === null || str === undefined ? '' : String(str);
    s = s.replace(/^[\s ]+|[\s ]+$/g, '');
    if (/^[[(]/.test(s)) s = s.slice(1);
    if (/[\])]$/.test(s)) s = s.slice(0, -1);
    s = s.replace(/^[\s ]+|[\s ]+$/g, '');
    if (!s) {
      throw new TFInputError('Escriba los coeficientes del ' + fieldName(field) + ' separados por espacios, en potencias descendentes de s; por ejemplo: 1 2 5.', { field: field, code: 'empty' });
    }
    var tokens = s.replace(/ /g, ' ').split(SPLIT_RE).filter(Boolean);
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      if (tok === ',') continue;                       // «1 , 2»: la coma suelta separa
      var t = tok.length > 1 && /,$/.test(tok) ? tok.slice(0, -1) : tok;
      var v = DSL.util.parseNumber(t);
      if (v !== v) {
        var msg = /,/.test(t)
          ? '«' + tok + '» no es un coeficiente válido. Separe los coeficientes con espacios; la coma o el punto marcan los decimales.'
          : '«' + tok + '» no es un número. Escriba solo los coeficientes del ' + fieldName(field) + ', en potencias descendentes de s; por ejemplo: 1 0.5 4.';
        throw new TFInputError(msg, { field: field, code: 'token', token: tok });
      }
      if (!isFinite(v)) {
        throw new TFInputError('«' + tok + '» es demasiado grande para calcular con él. Use coeficientes finitos (por ejemplo, entre −1e15 y 1e15).', { field: field, code: 'nonfinite', token: tok });
      }
      out.push(v + 0);
    }
    if (!out.length) {
      throw new TFInputError('Escriba los coeficientes del ' + fieldName(field) + ' separados por espacios, en potencias descendentes de s; por ejemplo: 1 2 5.', { field: field, code: 'empty' });
    }
    return out;
  }

  var HORIZON_MAX = 1e5;

  /** |y| < 1e-12·máx|y| → 0 exactamente (y(0) = 0 sin ruido de redondeo en una G estrictamente propia). */
  function flushTiny(y) {
    var thr = 1e-12 * N.maxAbs(y);
    for (var i = 0; i < y.length; i++) if (Math.abs(y[i]) < thr) y[i] = 0;
    return y;
  }

  /** Primer par de grupos de polos distintos con |p_a − p_b| ≤ 1e-3·max(|p_a|, |p_b|), o null. */
  function closePoles(groups) {
    for (var a = 0; a < groups.length; a++) {
      for (var b = a + 1; b < groups.length; b++) {
        var pa = groups[a].value, pb = groups[b].value;
        if (absC(cx.sub(pa, pb)) <= 1e-3 * Math.max(absC(pa), absC(pb))) return [pa, pb];
      }
    }
    return null;
  }

  /** Copia de un resultado de stepInfo (el memorizado no se comparte con quien lo modifique). */
  function copyInfo(r) {
    var o = Object.assign({}, r);
    o.notes = r.notes.slice();
    if (r.settleBand) o.settleBand = r.settleBand.slice();
    if (r.riseTimes) o.riseTimes = { t10: r.riseTimes.t10, t90: r.riseTimes.t90 };
    return o;
  }

  /**
   * Envolvente E(t) ≥ |y(t) − y∞| a partir de los términos de y(t): cada modo aporta
   * |coef|·t^{k−1}/(k−1)!·e^{Re p·t} (√(A² + B²) en los pares conjugados); se omite el término del origen.
   */
  function envelopeOf(terms) {
    var list = [];
    terms.forEach(function (t) {
      if (t.kind === 'real' && t.p === 0 && t.k === 1) return;
      list.push({
        k: t.k, fk: N.factorial(t.k - 1),
        a: t.kind === 'real' ? Math.abs(t.c) : Math.hypot(t.A, t.B),
        s: t.kind === 'real' ? t.p : t.sigma
      });
    });
    return function (t) {
      var e = 0;
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        e += m.a * (m.k === 1 ? 1 : Math.pow(t, m.k - 1) / m.fk) * Math.exp(m.s * t);
      }
      return e;
    };
  }

  /* ================================================================== clase */

  class TransferFunction {
    constructor(num, den) {
      var n = toCoeffArray(num, 'num'), d = toCoeffArray(den, 'den');
      n = P.trim(n, 1e-14);
      d = P.trim(d, 1e-14);
      if (P.isZero(d)) {
        throw new TFInputError('El denominador es 0: G(s) no está definida. Escriba al menos un coeficiente distinto de cero.', { field: 'den', code: 'den-zero' });
      }
      if (d.length < 2) {
        throw new TFInputError('El denominador debe tener grado 1 o mayor (al menos dos coeficientes, por ejemplo «1 2» para s + 2).', { field: 'den', code: 'den-degree' });
      }
      var dn = P.isZero(n) ? -1 : n.length - 1, dd = d.length - 1;
      if (dn > dd) {
        throw new TFInputError('El numerador (grado ' + dn + ') no puede tener mayor grado que el denominador (grado ' + dd + '): G(s) sería impropia.', { field: 'num', code: 'improper' });
      }
      var lead = d[0];
      Object.defineProperty(this, '_orig', { value: Object.freeze({ num: Object.freeze(n.slice()), den: Object.freeze(d.slice()) }) });
      Object.defineProperty(this, '_num', { value: Object.freeze(n.map(function (c) { return c / lead + 0; })) });
      var dm = d.map(function (c) { return c / lead + 0; });
      dm[0] = 1;
      Object.defineProperty(this, '_den', { value: Object.freeze(dm) });
      Object.defineProperty(this, '_cache', { value: {} });
    }

    get num() { return this._num; }
    get den() { return this._den; }
    get original() { return this._orig; }
    get order() { return this._den.length - 1; }
    get relativeDegree() { return P.isZero(this._num) ? Infinity : this.order - (this._num.length - 1); }
    get isStrictlyProper() { return this.relativeDegree > 0; }

    _memo(key, fn) {
      if (!(key in this._cache)) this._cache[key] = fn.call(this);
      return this._cache[key];
    }

    /* ---------------------------------------------------- polos, ceros, ganancia */

    poles() { return this._memo('poles', function () { return freezeRoots(N.polyRoots(this._den)); }); }

    zeros() {
      return this._memo('zeros', function () {
        if (P.isZero(this._num) || this._num.length < 2) return Object.freeze([]);
        return freezeRoots(N.polyRoots(this._num));
      });
    }

    /** Polos agrupados por multiplicidad: [{ value, multiplicity, members }]. */
    poleGroups() {
      return this._memo('poleGroups', function () {
        return Object.freeze(N.groupRoots(this.poles().slice(), { coeffs: this._den }).map(function (g) {
          return Object.freeze({ value: Object.freeze({ re: g.value.re, im: g.value.im }), multiplicity: g.multiplicity });
        }));
      });
    }

    zeroGroups() {
      return this._memo('zeroGroups', function () {
        var z = this.zeros();
        if (!z.length) return Object.freeze([]);
        return Object.freeze(N.groupRoots(z.slice(), { coeffs: this._num }).map(function (g) {
          return Object.freeze({ value: Object.freeze({ re: g.value.re, im: g.value.im }), multiplicity: g.multiplicity });
        }));
      });
    }

    dcGain() {
      var n0 = this._num[this._num.length - 1], d0 = this._den[this._den.length - 1];
      if (d0 !== 0) return n0 / d0 + 0;
      if (n0 === 0) return NaN;
      var low = lowestNonzero(this._den);
      return n0 / low.value > 0 ? Infinity : -Infinity;
    }

    /** Ganancia en continua con explicación: { value, kind, limit, note }. */
    dcGainInfo() {
      var v = this.dcGain();
      var qz = P.isZero(this._num) ? Infinity : trailingZeros(this._num);
      var qp = trailingZeros(this._den);
      if (isFinite(v)) {
        return { value: v, kind: 'finito', limit: v, note: 'G(0) = ' + fmtText(this._num[this._num.length - 1]) + ' / ' + fmtText(this._den[this._den.length - 1]) + ' = ' + fmtText(v) + '.' };
      }
      if (v !== v) {
        var limit;
        if (qz > qp) limit = 0;
        else if (qz === qp) limit = this._num[this._num.length - 1 - qz] / this._den[this._den.length - 1 - qp];
        else limit = (lowestNonzero(this._num).value / lowestNonzero(this._den).value) > 0 ? Infinity : -Infinity;
        return {
          value: NaN, kind: 'indeterminado', limit: limit,
          note: 'num(0) = den(0) = 0: G(s) tiene a la vez un cero y un polo en s = 0, que no se cancelan automáticamente. Al simplificar el factor s común, el límite cuando s → 0 vale ' + fmtText(limit) + '.'
        };
      }
      return {
        value: v, kind: 'infinito', limit: v,
        note: 'Hay ' + (qp === 1 ? 'un polo' : qp + ' polos') + ' en s = 0 (integrador): |G(jω)| crece sin límite cuando ω → 0, así que la ganancia en continua es infinita y la respuesta al escalón no se estabiliza.'
      };
    }

    /* -------------------------------------------------------------- estabilidad */

    /**
     * Estabilidad. Primero decide Routh–Hurwitz con los coeficientes del denominador: sin fila nula ni
     * cero en la primera columna, todos los elementos positivos → estable y cada cambio de signo es un
     * polo en el SPD (sin tolerancias relativas al polo más grande: 1e-10·s² + s + 1 es estable). Solo
     * un caso especial de la tabla lleva al análisis polo a polo sobre el eje jω, con la tolerancia
     * |Re p| ≤ 1e-9·max(1, |p|) de cada polo.
     */
    _stab() {
      return this._memo('stab', function () {
        var groups = this.poleGroups();
        var base = this._routhBase();
        var n = this.order;
        var lhp = 0, rhp = 0, axis = 0, axisRepeated = false, method;
        if (!base.t1.specials.length) {
          method = 'routh';
          var fc = base.t1.rows.map(function (r) { return r[0]; });
          var changes = 0;
          for (var i = 1; i < fc.length; i++) if ((fc[i] > 0) !== (fc[i - 1] > 0)) changes++;
          rhp = changes;
          lhp = n - changes;
        } else {
          method = 'polos';
          groups.forEach(function (g) {
            var re = g.value.re;
            if (onAxis(g.value)) { axis += g.multiplicity; if (g.multiplicity > 1) axisRepeated = true; }
            else if (re < 0) lhp += g.multiplicity;
            else rhp += g.multiplicity;
          });
        }
        // Constante de tiempo del modo más lento (solo para un sistema estable).
        var slowTau = null;
        if (rhp === 0 && axis === 0) {
          slowTau = 0;
          groups.forEach(function (g) { slowTau = Math.max(slowTau, g.value.re < 0 ? -1 / g.value.re : Infinity); });
        }
        var verdict, reason;
        if (rhp > 0) {
          verdict = 'inestable';
          reason = 'Hay ' + rhp + ' ' + plural(rhp, 'polo', 'polos') + ' con parte real positiva: la respuesta crece sin límite.';
        } else if (axisRepeated) {
          verdict = 'inestable';
          reason = 'Hay un polo repetido sobre el eje jω: la respuesta crece sin límite (como una rampa o como t·sen ωt).';
        } else if (axis > 0) {
          verdict = 'marginal';
          reason = 'Hay ' + plural(axis, 'un polo simple', axis + ' polos simples') + ' sobre el eje jω y ninguno en el semiplano derecho: la respuesta libre no decae a cero, pero tampoco crece sin límite.';
        } else {
          verdict = 'estable';
          reason = 'Todos los polos tienen parte real negativa: la respuesta libre decae a cero.';
          if (slowTau !== null && 6 * slowTau > HORIZON_MAX) {
            reason += ' El modo más lento tiene τ ≈ ' + (isFinite(slowTau) ? fmtText(slowTau, 3) + ' s' : '∞') +
              ': la respuesta tarda mucho en establecerse y las gráficas muestran solo su comienzo.';
          }
        }
        return Object.freeze({
          verdict: verdict, reason: reason, lhp: lhp, rhp: rhp, axis: axis, axisRepeated: axisRepeated,
          method: method, slowTau: slowTau, isAxis: axisPrinter(axis > 0)
        });
      });
    }

    /** Tabla de Routh numérica con ε (compartida por la estabilidad y por routh()). */
    _routhBase() {
      return this._memo('routhBase', function () {
        var a = this._den.slice();
        var minNz = Infinity;
        a.forEach(function (c) { if (c !== 0) minNz = Math.min(minNz, Math.abs(c)); });
        var e1 = 1e-6 * Math.min(1, minNz);
        return { a: a, e1: e1, t1: routhBuild(a, e1) };
      });
    }

    stability() { return this._stab().verdict; }
    isStable() { return this.stability() === 'estable'; }
    stabilityInfo() {
      var s = this._stab();
      return {
        verdict: s.verdict, reason: s.reason, lhp: s.lhp, rhp: s.rhp, axis: s.axis, axisRepeated: s.axisRepeated,
        method: s.method, slowTau: s.slowTau
      };
    }

    /* ------------------------------------------------------------ Routh-Hurwitz */

    routh() {
      return this._memo('routh', function () {
        var base = this._routhBase();
        var a = base.a, n = this.order, e1 = base.e1;
        var t1 = base.t1, t2 = routhBuild(a, e1 * 1e-3), t3 = routhBuild(a, e1 * 1e-6);
        var hasEps = t1.epsCells.length > 0;
        var same = t2.rows.length === t1.rows.length && t3.rows.length === t1.rows.length;
        var rows = t1.rows;
        var labels = rows.map(function (_, i) { return 's^{' + (n - i) + '}'; });
        // Comportamiento asintótico de cada celda cuando ε → 0⁺: c·ε^k.
        var tex = [], limitSigns = [];
        for (var i = 0; i < rows.length; i++) {
          var trow = [];
          for (var j = 0; j < rows[i].length; j++) {
            var v1 = rows[i][j];
            var cell;
            if (hasEps && same && t1.epsCells.indexOf(i) >= 0 && j === 0) {
              cell = { k: 1, c: 1, v: v1 };
            } else if (hasEps && same) {
              var v2 = t2.rows[i][j], v3 = t3.rows[i][j];
              if (v3 === 0 && v2 === 0) cell = { k: 0, c: 0, v: 0 };
              else if (Math.abs(v3 - v2) <= 1e-9 * Math.max(Math.abs(v2), Math.abs(v3))) cell = { k: 0, c: v3, v: v3 };
              else {
                var kk = Math.round(Math.log(Math.abs(v3 / v2)) / Math.log(1e-3));
                if (!isFinite(kk)) kk = 0;
                cell = { k: kk, c: v3 / Math.pow(e1 * 1e-6, kk), v: v3 };
              }
            } else {
              cell = { k: 0, c: v1, v: v1 };
            }
            if (j === 0) limitSigns.push(cell.v > 0 ? 1 : cell.v < 0 ? -1 : 0);
            trow.push(cellTex(cell));
          }
          tex.push(trow);
        }
        var signChanges = 0, prevSign = 0;
        limitSigns.forEach(function (s) {
          if (s === 0) return;
          if (prevSign !== 0 && s !== prevSign) signChanges++;
          prevSign = s;
        });
        var specials = t1.specials.map(function (s) {
          var o = { type: s.type, row: s.row, power: s.power };
          if (s.type === 'zero-row') { o.auxiliary = s.auxiliary.slice(); o.auxiliaryTex = 'A(s) = ' + texPoly(s.auxiliary, 's', 4); }
          else o.epsilon = s.epsilon;
          return o;
        });
        // Notas en español.
        var notes = [];
        var missing = a.some(function (c) { return c === 0; });
        var negative = a.some(function (c) { return c < 0; });
        if (missing || negative) {
          notes.push('Condición necesaria: todos los coeficientes del denominador deben existir y tener el mismo signo. Aquí ' +
            (negative ? 'hay coeficientes negativos' : 'falta algún coeficiente') + ', así que el sistema no puede ser asintóticamente estable.');
        } else if (n >= 3) {
          notes.push('Todos los coeficientes son positivos: se cumple la condición necesaria (para orden ≥ 3 no es suficiente; la tabla decide).');
        } else {
          notes.push('Todos los coeficientes son positivos: para orden ' + n + ' esto basta para la estabilidad.');
        }
        var axisFromAux = 0;
        specials.forEach(function (s) {
          if (s.type === 'zero-first-column') {
            notes.push('Fila s^' + s.power + ': el primer elemento es 0 y la fila no es nula. Se sustituye por ε > 0 pequeño y se continúa; los signos se leen con ε → 0⁺.');
          } else {
            var ar = N.polyRoots(s.auxiliary);
            var sc = Math.max(1, rootScale(ar));
            var onAxis = ar.filter(function (r) { return Math.abs(r.re) <= 1e-7 * sc; }).length;
            axisFromAux += onAxis;
            notes.push('Fila s^' + s.power + ' nula: con la fila s^' + (s.power + 1) + ' se forma el polinomio auxiliar A(s) y la fila se sustituye por los coeficientes de dA/ds. ' +
              'Las raíces de A(s) son simétricas respecto al origen y también son polos' +
              (onAxis ? '; ' + onAxis + ' ' + plural(onAxis, 'está', 'están') + ' sobre el eje jω.' : '.'));
          }
        });
        notes.push(signChanges === 0
          ? 'Sin cambios de signo en la primera columna: ninguna raíz en el semiplano derecho.'
          : signChanges + ' ' + plural(signChanges, 'cambio', 'cambios') + ' de signo en la primera columna: ' + signChanges + ' ' + plural(signChanges, 'raíz', 'raíces') + ' en el semiplano derecho.');
        var verdict = this.stability();
        notes.push('Conclusión: sistema ' + (verdict === 'estable' ? 'estable' : verdict === 'marginal' ? 'marginalmente estable (polos simples sobre el eje jω)' : 'inestable') + '.');
        return Object.freeze({
          rows: rows.map(function (r) { return r.slice(); }),
          labels: labels,
          firstColumn: rows.map(function (r) { return r[0]; }),
          signChanges: signChanges,
          limitSigns: limitSigns,
          special: specials[0] || null,
          specials: specials,
          epsilon: hasEps ? e1 : null,
          axisRoots: axisFromAux,
          tex: tex,
          notes: notes
        });
      });
    }

    /* ------------------------------------------------------- frecuencia, Bode */

    evalAt(s) {
      return cx.div(P.evalC(this._num, s), P.evalC(this._den, s));
    }

    freqResponse(w) { return this.evalAt({ re: 0, im: w }); }

    bodeRange() {
      var mags = [];
      this.poles().concat(this.zeros()).forEach(function (r) { var m = absC(r); if (m > 0) mags.push(m); });
      var scale = mags.length ? Math.max.apply(null, mags) : 0;
      mags = mags.filter(function (m) { return m > 1e-12 * scale; });
      if (!mags.length) return { wMin: 0.01, wMax: 100 };
      var lo = Math.min.apply(null, mags) / 100, hi = Math.max.apply(null, mags) * 100;
      return { wMin: Math.pow(10, Math.floor(Math.log10(lo) + 1e-9)), wMax: Math.pow(10, Math.ceil(Math.log10(hi) - 1e-9)) };
    }

    _bodeGrid() {
      var r = this.bodeRange();
      return N.logspace(Math.log10(r.wMin), Math.log10(r.wMax), 300);
    }

    /**
     * Rama de la fase cuando la ganancia de baja frecuencia es negativa: el ancla +180° o −180°
     * (−90°·(polos − ceros en el origen) ± 180°). Se elige la que da menor máx|φ| sobre la rejilla por
     * omisión de bode(); en empate, +180°. Así 1/(s − 2) va de −180° a −90° y −1/(s + 1), de +180° a +90°.
     * Devuelve el desplazamiento (0 o −360) que se suma a la fase anclada en +180°.
     */
    _bodeShift() {
      return this._memo('bodeShift', function () {
        var nLow = lowestNonzero(this._num), dLow = lowestNonzero(this._den);
        if (!nLow || !(nLow.value / dLow.value < 0)) return 0;
        var ph = this._bodePhase(this._bodeGrid(), 0);
        var mx = 0, mxAlt = 0;
        for (var i = 0; i < ph.length; i++) {
          if (!isFinite(ph[i])) continue;
          mx = Math.max(mx, Math.abs(ph[i]));
          mxAlt = Math.max(mxAlt, Math.abs(ph[i] - 360));
        }
        return mxAlt < mx - 1e-9 ? -360 : 0;
      });
    }

    /** Fase desenrollada (grados) en cada ω, anclada a la asíntota de baja frecuencia más `extra`. */
    _bodePhase(om, extra) {
      var K = this._num[0];
      var zs = this.zeros(), ps = this.poles();
      var scale = Math.max(1, rootScale(ps), rootScale(zs));
      var tiny = 1e-12 * scale;
      // Fase continua de (jω − r) en función de ω.
      var factor = function (r, w) {
        var a = -r.re, b = w - r.im;
        if (Math.abs(a) <= tiny) return b > 0 ? 90 : b < 0 ? -90 : 0;
        if (a > 0) return Math.atan(b / a) * DEG;
        return 180 - Math.atan(b / -a) * DEG;
      };
      var sumAt = function (w) {
        var ph = K < 0 ? 180 : 0;
        for (var i = 0; i < zs.length; i++) ph += factor(zs[i], w);
        for (var j = 0; j < ps.length; j++) ph -= factor(ps[j], w);
        return ph;
      };
      // Asíntota de baja frecuencia: −90°·(polos − ceros en el origen) + 180° si G0 < 0.
      var nLow = lowestNonzero(this._num), dLow = lowestNonzero(this._den);
      var anchor = -90 * (dLow.order - nLow.order) + (nLow.value / dLow.value < 0 ? 180 : 0) + extra;
      var limit = sumAt(tiny * 1e-3);
      var shift = 360 * Math.round((anchor - limit) / 360);
      var out = new Array(om.length);
      for (var k = 0; k < om.length; k++) {
        var w = om[k];
        var g = this.freqResponse(w);
        var m = absC(g);
        var ph = sumAt(w) + shift;
        if (isFinite(g.re) && isFinite(g.im) && m > 0) {
          var direct = Math.atan2(g.im, g.re) * DEG;
          var dlt = direct - ph;
          dlt -= 360 * Math.round(dlt / 360);
          ph += dlt;
        }
        out[k] = ph;
      }
      return out;
    }

    bode(omegas) {
      if (!omegas) omegas = this._bodeGrid();
      var om = Array.prototype.slice.call(omegas);
      var mag = [], magDb = [], phaseDeg = [];
      if (P.isZero(this._num)) {
        om.forEach(function () { mag.push(0); magDb.push(-Infinity); phaseDeg.push(NaN); });
        return { omega: om, mag: mag, magDb: magDb, phaseDeg: phaseDeg };
      }
      phaseDeg = this._bodePhase(om, this._bodeShift());
      for (var k = 0; k < om.length; k++) {
        var m = absC(this.freqResponse(om[k]));
        mag.push(m);
        magDb.push(20 * Math.log10(m));
      }
      return { omega: om, mag: mag, magDb: magDb, phaseDeg: phaseDeg };
    }

    /* ---------------------------------------------- fracciones parciales, y(t) */

    partialFractionsStep() {
      return this._memo('pfStep', function () {
        var yden = this._den.concat([0]);
        var core = pfCore(this._num, yden, N.polyRoots(yden));
        return Object.freeze(core.entries.map(freezeEntry));
      });
    }

    partialFractionsImpulse() {
      return this._memo('pfImp', function () {
        var sp = this._strictPart();
        if (P.isZero(sp.num)) return Object.freeze([]);
        var core = pfCore(sp.num, this._den, this.poles().slice());
        return Object.freeze(core.entries.map(freezeEntry));
      });
    }

    _strictPart() {
      var n = this.order, b = padLeft(this._num, n + 1), D = this._num.length === n + 1 ? this._num[0] : 0;
      var r = new Array(n);
      for (var i = 1; i <= n; i++) r[i - 1] = b[i] - D * this._den[i];
      var scale = Math.max(N.maxAbs(b), Math.abs(D) * N.maxAbs(this._den));
      for (var j = 0; j < r.length; j++) if (Math.abs(r[j]) <= 64 * EPS * scale) r[j] = 0;
      return { num: P.trim(r, 0), D: D };
    }

    _analytic(kind) {
      var self = this;
      var notes = [];
      var num, den, roots, lhs, domain;
      var D = 0;
      if (kind === 'step') {
        num = this._num; den = this._den.concat([0]); roots = N.polyRoots(den);
        lhs = 'y(t)'; domain = 't \\ge 0';
      } else {
        var sp = this._strictPart();
        num = sp.num; den = this._den; roots = this.poles().slice(); D = sp.D;
        lhs = 'g(t)'; domain = 't > 0';
        if (D !== 0) notes.push('G(s) es propia pero no estrictamente propia: la respuesta al impulso incluye además el término D·δ(t) con D = ' + fmtText(D) + ', que no se dibuja.');
      }
      if (P.isZero(num)) {
        var zeroFn = function () { return 0; };
        return { exact: true, fn: zeroFn, terms: [], tex: lhs + ' = 0,\\; ' + domain, notes: notes, residues: [], digits: 4, _lhs: lhs, _domain: domain };
      }
      var core = pfCore(num, den, roots);
      var ok = pfCheck(core.entries, num, den);
      var terms = buildTerms(core.entries);
      var fnA = function (t) { return evalTerms(terms, t); };
      // y(0⁺) = lím s→∞ s·Y(s)
      var dd = P.trim(den, 0), nn = P.trim(num, 0);
      var y0 = nn.length === dd.length - 1 ? nn[0] / dd[0] : 0;
      var T = this.timeHorizon();
      if (ok) {
        var A = 0;
        for (var i = 0; i <= 64; i++) A = Math.max(A, Math.abs(fnA(T * i / 64)));
        if (!(Math.abs(fnA(0) - y0) <= 1e-9 * A + 1e-12 * Math.abs(y0) + 1e-300)) ok = false;
      }
      core.groups.forEach(function (g) {
        if (g.multiplicity < 2 || g.value.im < 0) return;
        var isOrigin = g.value.re === 0 && g.value.im === 0;
        var where = isOrigin ? 's = 0' : 's = ' + cx.toString(g.value, 4).replace(/-/g, '−').replace(' + ', ' ± ');
        notes.push('Polo de multiplicidad ' + g.multiplicity + ' en ' + where +
          (isOrigin && kind === 'step' ? ' (incluye el polo 1/s del escalón)' : '') +
          ': aporta términos de la forma c·tᵏ·e^(p·t)/k!, con k = 0…' + (g.multiplicity - 1) + '.');
      });
      if (terms.some(function (t) { return t.kind === 'osc'; })) {
        notes.push('Cada par de polos complejos conjugados σ ± jω se combina en la forma real e^(σt)·(A·cos ωt + B·sen ωt).');
      }
      var exact = ok;
      var fn = fnA, tex, digits = 4;
      var isAxis = this._stab().isAxis;
      if (exact) {
        digits = displayDigits(terms, core.groups, fnA, T, num, den, isAxis);
        tex = assembleTex(lhs, terms, digits, domain, isAxis);
        var close = closePoles(core.groups);
        if (close) {
          var fz = function (z) { return cx.toString(z, digits).replace(/-/g, '−'); };
          var pa = close[0], pb = close[1];
          var conj = pa.re === pb.re && pa.im === -pb.im;
          notes.push('Los polos ' + (conj
            ? 's = ' + fz({ re: pa.re, im: Math.abs(pa.im) }).replace(' + ', ' ± ')
            : 's = ' + fz(pa) + ' y s = ' + fz(pb)) +
            ' están muy próximos: los residuos son grandes y casi se cancelan' +
            (digits > 4 ? '; se muestran con más cifras (' + digits + ' significativas).' : '.'));
        }
      } else {
        fn = numericFn(self, kind);
        tex = '';
        terms.forEach(function (t) { t.tex = ''; });
        notes.push('No se obtuvo una expresión analítica fiable (polos casi repetidos y mal condicionados): la curva se calcula por simulación numérica (RK4) de una realización en espacio de estados.');
      }
      return {
        exact: exact, fn: fn, terms: terms, tex: tex, notes: notes,
        residues: core.entries.map(freezeEntry), digits: digits, _lhs: lhs, _domain: domain
      };
    }

    /** El mismo resultado con la TeX escrita a `digits` cifras (los términos se copian). */
    _withDigits(a, digits) {
      var d = Math.round(digits);
      if (!a.exact || !(d >= 1) || d === a.digits || !a.terms.length) return a;
      var terms = a.terms.map(function (t) { return Object.assign({}, t); });
      var tex = assembleTex(a._lhs, terms, d, a._domain, this._stab().isAxis);
      return Object.assign({}, a, { terms: terms, tex: tex, digits: d });
    }

    /** y(t) analítica. Por omisión la TeX usa stepDisplayDigits() cifras; { digits } fija otras. */
    stepAnalytic(opts) {
      var a = this._memo('stepA', function () { return this._analytic('step'); });
      return opts && opts.digits !== undefined ? this._withDigits(a, opts.digits) : a;
    }

    impulseAnalytic(opts) {
      var a = this._memo('impA', function () { return this._analytic('impulse'); });
      return opts && opts.digits !== undefined ? this._withDigits(a, opts.digits) : a;
    }

    /**
     * Cifras significativas con que escribir polos y residuos de Y(s) = G(s)/s para que lo escrito
     * reproduzca la respuesta: el menor d ∈ {4, 6, 8, 10, 12} con el que la y(t) rehecha con los
     * valores redondeados coincide con la exacta en 200 instantes (1e-3·máx|y|), la suma de fracciones
     * escrita coincide con Y(s) en puntos complejos (1e-3 relativo) y polos distintos se leen distintos.
     */
    stepDisplayDigits() { return this.stepAnalytic().digits; }

    step(tArray) {
      var a = this.stepAnalytic();
      if (a.exact) return Array.prototype.map.call(tArray, function (t) { return a.fn(t); });
      return simulateAt(this, Array.prototype.slice.call(tArray), 'step');
    }

    impulse(tArray) {
      var a = this.impulseAnalytic();
      if (a.exact) return Array.prototype.map.call(tArray, function (t) { return a.fn(t); });
      return simulateAt(this, Array.prototype.slice.call(tArray), 'impulse');
    }

    stepNumeric(tArray) { return simulateAt(this, Array.prototype.slice.call(tArray), 'step'); }
    impulseNumeric(tArray) { return simulateAt(this, Array.prototype.slice.call(tArray), 'impulse'); }
    _numericFn(kind) { return numericFn(this, kind || 'step'); }

    timeHorizon(opts) {
      var factor = opts && opts.factor !== undefined ? opts.factor : 6;
      var groups = this.poleGroups();
      var stable = this._stab().verdict === 'estable';
      var T = 0, uMax = 0, uOsc = 0;
      groups.forEach(function (g) {
        var re = g.value.re, w = Math.abs(g.value.im), m = g.multiplicity, tol = axisTol(g.value);
        // Con veredicto «estable» (Routh) todo modo con Re p < 0 decae, por pequeño que sea |Re p|.
        var axis = stable ? !(re < 0) : Math.abs(re) <= tol;
        if (!axis && re < 0) {
          T = Math.max(T, factor * (1 + 0.5 * (m - 1)) / -re);
        } else if (axis) {
          if (w > tol) T = Math.max(T, 3 * 2 * Math.PI / w);
        } else {
          uMax = Math.max(uMax, re);
          if (w > tol) uOsc = Math.max(uOsc, 3 * 2 * Math.PI / w);
        }
      });
      if (uMax > 0) {
        var cap = 12 / uMax;
        T = Math.min(Math.max(T, 6 / uMax, Math.min(uOsc, cap)), cap);
      }
      if (!(T > 0)) T = 10;
      return Math.min(HORIZON_MAX, Math.max(1e-3, T));
    }

    stepSamples(n, tEnd) {
      n = n === undefined ? 400 : n;
      tEnd = tEnd === undefined ? this.timeHorizon() : tEnd;
      var t = N.linspace(0, tEnd, n);
      return { t: t, y: flushTiny(this.step(t)) };
    }

    impulseSamples(n, tEnd) {
      n = n === undefined ? 400 : n;
      tEnd = tEnd === undefined ? this.timeHorizon() : tEnd;
      var t = N.linspace(0, tEnd, n);
      return { t: t, y: flushTiny(this.impulse(t)) };
    }

    stepInfo(opts) {
      var plain = !opts || Object.keys(opts).length === 0;
      var res = plain ? this._memo('stepInfo', function () { return this._stepInfo({}); }) : this._stepInfo(opts);
      return copyInfo(res);
    }

    _stepInfo(opts) {
      var settle = opts.settle === undefined ? 0.02 : opts.settle;
      var rise = opts.rise || [0.1, 0.9];
      var n = Math.max(50, opts.n === undefined ? 4000 : opts.n);
      var userEnd = opts.tEnd > 0 ? opts.tEnd : null;
      var tEnd = userEnd || this.timeHorizon();
      var st = this._stab(), stab = st.verdict;
      var sa = this.stepAnalytic();
      var f = sa.fn;
      var notes = [];
      var res = {
        stable: stab === 'estable', finalValue: null, limitValue: null, peak: null, peakTime: null, overshootPct: null,
        undershootPct: null, riseTime: null, riseTimes: null, settlingTime: null, settleBand: null,
        tEnd: tEnd, exact: sa.exact, notes: notes
      };
      if (!sa.exact) notes.push('La respuesta se obtuvo por simulación numérica: las métricas son aproximadas.');
      var rhpZeros = this.zeros().filter(function (z) { return z.re > axisTol(z); });
      if (rhpZeros.length) {
        notes.push('Hay ' + plural(rhpZeros.length, 'un cero', rhpZeros.length + ' ceros') + ' en el semiplano derecho (s = ' +
          rhpZeros.map(function (z) { return cx.toString(z, 4).replace(/-/g, '−'); }).join(', ') + '): sistema de fase no mínima.');
      }
      if (stab !== 'estable') {
        var dci = this.dcGainInfo();
        if (stab === 'marginal') {
          var axisPair = this.poleGroups().some(function (g) { return g.value.im !== 0 && onAxis(g.value); });
          if (axisPair) {
            notes.push('Sistema marginalmente estable: la respuesta oscila sin amortiguarse; no hay valor final ni métricas de establecimiento.');
          } else if (dci.kind === 'indeterminado' && isFinite(dci.limit)) {
            // Un cero en s = 0 cancela el polo del origen: la salida converge, pero sin cancelación automática
            // el veredicto sigue siendo «marginal» y finalValue queda en null.
            res.limitValue = dci.limit + 0;
            notes.push('Un cero cancela el polo en el origen: la salida converge a ' + fmtText(dci.limit) +
              '. Como la cancelación no se aplica automáticamente, el sistema figura como marginalmente estable y no se informan valor final ni métricas de establecimiento.');
          } else if (dci.kind === 'infinito' || dci.kind === 'indeterminado') {
            notes.push('Sistema marginalmente estable con integrador: ante un escalón la salida crece como una rampa; no hay valor final ni métricas de establecimiento.');
          } else {
            notes.push('Sistema marginalmente estable: hay un polo sobre el eje jω, así que la respuesta no se estabiliza; no hay valor final ni métricas de establecimiento.');
          }
        } else {
          notes.push('Sistema inestable: la respuesta crece sin límite; el teorema del valor final no se aplica y las métricas no están definidas.');
        }
        return res;
      }
      var yf = this.dcGain();
      res.finalValue = yf;
      if (st.slowTau !== null && 6 * st.slowTau > HORIZON_MAX) {
        notes.push('Polo muy lento (τ ≈ ' + (isFinite(st.slowTau) ? fmtText(st.slowTau, 3) + ' s' : '∞') + '): la respuesta tarda mucho en establecerse.');
      }
      // Escala de la oscilación más rápida: la rejilla debe tener ≥ 20 muestras por periodo (≤ NMAX muestras).
      var wMax = 0;
      this.poles().forEach(function (p) { wMax = Math.max(wMax, Math.abs(p.im)); });
      var period = wMax > 0 ? 2 * Math.PI / wMax : Infinity;
      var NMAX = 200001;
      var env = sa.exact ? envelopeOf(sa.terms) : null;
      var ts, ys, aliased = false, attempt = 0;
      var sample = function () {
        var m = n;
        if (isFinite(period)) m = Math.max(n, Math.min(NMAX, Math.ceil(20 * tEnd / period) + 1));
        aliased = isFinite(period) && 20 * tEnd / period > m - 1;
        // Submuestreada y con envolvente: las muestras de la oscilación no aportan nada (se mide sobre la
        // envolvente, que es suave, y los extremos en la rejilla densa); basta la rejilla base.
        if (aliased && env) m = n;
        ts = N.linspace(0, tEnd, m);
        ys = ts.map(f);
      };
      var bandAbs, refScale;
      for (;;) {
        sample();
        var envMode0 = aliased && !!env;
        var maxAbsY = N.maxAbs(ys);
        refScale = Math.abs(yf) > 1e-12 * maxAbsY ? Math.abs(yf) : maxAbsY;
        bandAbs = settle * refScale;
        var lastOut = -1;
        for (var i = 0; i < ys.length; i++) if ((envMode0 ? env(ts[i]) : Math.abs(ys[i] - yf)) > bandAbs) lastOut = i;
        var needMore = lastOut === ys.length - 1;
        if (!needMore && refScale === Math.abs(yf) && !envMode0) {
          // Por encima del valor final y aún subiendo en el borde: el pico queda fuera de la ventana.
          var zl = ys[ys.length - 1] / yf, zp = ys[ys.length - 2] / yf;
          if (zl > 1 + 1e-9 && zl >= zp) needMore = true;
        }
        if (needMore && !userEnd && attempt < 4) { tEnd *= 2; attempt++; continue; }
        break;
      }
      res.tEnd = tEnd;
      var envMode = aliased && !!env;
      // Rejilla densa (≥ 50 muestras por periodo) en [0, min(tEnd, 4 periodos)] para el primer pico y
      // los cruces del 10 % y el 90 %; después, la rejilla de toda la ventana.
      var tsM = ts, ysM = ys, nDense = 0;
      if (isFinite(period)) {
        var tD = Math.min(tEnd, 4 * period);
        var mD = Math.ceil(50 * tD / period) + 1;
        if (tD / (mD - 1) < tEnd / (ts.length - 1)) {
          tsM = N.linspace(0, tD, mD);
          ysM = tsM.map(f);
          for (var q0 = 0; q0 < ts.length; q0++) if (ts[q0] > tD) { tsM.push(ts[q0]); ysM.push(ys[q0]); }
          nDense = mD;
        }
      }
      // Con la ventana submuestreada, los extremos se buscan solo en la parte densa.
      var searchEnd = envMode && nDense ? nDense : ysM.length;
      // Extremos: raíz de y'(t) = g(t) (impulso analítico) si se dispone de ella; si no, sección áurea.
      var ia = sa.exact ? this.impulseAnalytic() : null;
      var dfn = ia && ia.exact ? ia.fn : null;
      var bisect = function (g, a, b) {
        var ga = g(a);
        for (var it = 0; it < 80; it++) {
          var m = 0.5 * (a + b), gm = g(m);
          if ((gm > 0) === (ga > 0)) { a = m; ga = gm; } else b = m;
          if (b - a <= 1e-13 * tEnd) break;
        }
        return 0.5 * (a + b);
      };
      var extremum = function (h, sgn, idx) {
        if (dfn && idx > 0 && idx < tsM.length - 1) {
          var d0 = sgn * dfn(tsM[idx - 1]), d1 = sgn * dfn(tsM[idx]), d2 = sgn * dfn(tsM[idx + 1]);
          var lo = null, hi = null;
          if (d0 > 0 && d1 <= 0) { lo = tsM[idx - 1]; hi = tsM[idx]; } else if (d1 > 0 && d2 <= 0) { lo = tsM[idx]; hi = tsM[idx + 1]; }
          if (lo !== null) return bisect(function (t) { return sgn * dfn(t); }, lo, hi);
        }
        return refinePeak(h, tsM, idx);
      };
      // Banda de establecimiento (con la ventana submuestreada, sobre la envolvente de |y − y∞|).
      res.settleBand = [yf - bandAbs, yf + bandAbs];
      var devAt = function (j) { return envMode ? env(tsM[j]) : Math.abs(ysM[j] - yf); };
      var lastIdx = -1, tOut = null;
      for (var j = 0; j < tsM.length; j++) if (devAt(j) > bandAbs) lastIdx = j;
      if (!envMode && isFinite(period) && lastIdx < tsM.length - 1) {
        // Un pico de |y − y∞| entre dos muestras puede salir de la banda aunque ninguna muestra lo haga:
        // con paso h la muestra pierde como mucho el factor cos(πh/T). Se revisan (de atrás hacia
        // delante) las muestras por encima de la banda reducida y se refina su máximo.
        var dev = function (t) { return Math.abs(f(t) - yf); };
        for (var j2 = tsM.length - 2; j2 > lastIdx; j2--) {
          var h2 = tsM[j2 + 1] - tsM[j2];
          if (!(devAt(j2) > bandAbs * Math.cos(Math.min(Math.PI / 2, Math.PI * h2 / period)))) continue;
          var tm2 = refinePeak(dev, tsM, j2);
          if (dev(tm2) > bandAbs) { lastIdx = j2; tOut = tm2; break; }
        }
      }
      if (lastIdx < 0) res.settlingTime = 0;
      else if (lastIdx === tsM.length - 1) notes.push('La respuesta no entra en la banda del ±' + fmtText(settle * 100) + ' % dentro de la ventana calculada.');
      else {
        res.settlingTime = bisect(envMode
          ? function (t) { return env(t) - bandAbs; }
          : function (t) { return Math.abs(f(t) - yf) - bandAbs; }, tOut !== null ? tOut : tsM[lastIdx], tsM[lastIdx + 1]);
        if (envMode) notes.push('La oscilación es demasiado rápida para muestrearla en toda la ventana: el tiempo de establecimiento se toma de la envolvente de |y − y∞| (cota superior, con un error menor que medio periodo).');
      }
      if (refScale !== Math.abs(yf)) {
        notes.push('El valor final es 0: el sobrepaso y el tiempo de subida no están definidos; la banda de establecimiento se toma respecto al máximo de |y(t)|.');
        var im = 0;
        for (var q = 1; q < searchEnd; q++) if (Math.abs(ysM[q]) > Math.abs(ysM[im])) im = q;
        var sgY = ysM[im] < 0 ? -1 : 1;
        var pk = extremum(function (t) { return sgY * f(t); }, sgY, im);
        res.peakTime = pk; res.peak = f(pk);
        return res;
      }
      var z = ysM.map(function (y) { return y / yf; });
      var zf = function (t) { return f(t) / yf; };
      // Pico y sobrepaso.
      var iMax = 0;
      for (var k = 1; k < searchEnd; k++) if (z[k] > z[iMax]) iMax = k;
      if (iMax === 0 && z[0] > 1 + 1e-9) {
        notes.push('El máximo está en t = 0⁺, por el salto que produce el término directo de G(s): el sobrepaso y el tiempo de pico no se definen como en un sistema estrictamente propio.');
      } else if (z[iMax] > 1 + 1e-9 && iMax < z.length - 1) {
        var tp = extremum(zf, yf < 0 ? -1 : 1, iMax);
        res.peakTime = tp; res.peak = f(tp);
        res.overshootPct = Math.max(0, (zf(tp) - 1) * 100);
      } else if (z[iMax] > 1 + 1e-9) {
        notes.push('La respuesta sigue por encima del valor final y subiendo en t = ' + fmtText(tEnd) + ': el pico queda fuera de la ventana calculada, así que el sobrepaso no se puede medir aquí.');
      } else if (lastIdx === tsM.length - 1) {
        notes.push('La ventana termina antes de que la respuesta se establezca: no se puede afirmar si habrá sobrepaso.');
      } else {
        res.overshootPct = 0;
        notes.push('Sin sobrepaso: la respuesta no supera el valor final, así que el tiempo de pico no está definido.');
      }
      // Subimpulso inicial (fase no mínima): solo si la salida parte cerca de 0.
      if (z[0] < rise[0]) {
        var iMin = 0;
        for (var q2 = 1; q2 < searchEnd; q2++) if (z[q2] < z[iMin]) iMin = q2;
        if (z[iMin] < -1e-9) {
          var tu = iMin === 0 ? 0 : extremum(function (t) { return -zf(t); }, yf < 0 ? 1 : -1, iMin);
          res.undershootPct = Math.max(0, -zf(tu) * 100);
          notes.push('La respuesta arranca en sentido contrario al valor final (subimpulso del ' + fmtText(res.undershootPct, 3) + ' %), típico de un cero en el semiplano derecho.');
        } else {
          res.undershootPct = 0;
        }
      }
      // Tiempo de subida 10–90 %.
      if (z[0] >= rise[0]) {
        notes.push('La respuesta parte de y(0⁺) = ' + fmtText(ysM[0]) + ' por el término directo de G(s): el tiempo de subida ' + Math.round(rise[0] * 100) + '–' + Math.round(rise[1] * 100) + ' % no está definido.');
      } else {
        var cross = function (level, from) {
          for (var c = Math.max(1, from); c < z.length; c++) {
            if (z[c - 1] < level && z[c] >= level) return bisect(function (t) { return zf(t) - level; }, tsM[c - 1], tsM[c]);
          }
          return null;
        };
        var t10 = cross(rise[0], 1);
        var i10 = 1;
        if (t10 !== null) while (i10 < tsM.length && tsM[i10] <= t10) i10++;
        var t90 = t10 === null ? null : cross(rise[1], i10);
        if (t10 !== null && t90 !== null) {
          res.riseTimes = { t10: t10, t90: t90 };
          res.riseTime = t90 - t10;
        }
      }
      // Segundo orden puro: lo medido debe coincidir con los valores exactos; si no, no se informa.
      var so = this.secondOrderParams();
      if (so && so.canonical && so.wd > 0) {
        var cn = so.canonical, wd = so.wd, sg = so.sigma, bad = [];
        if (res.peakTime !== null && Math.abs(res.peakTime - cn.peakTime) > 0.05 * cn.peakTime) {
          bad.push('tiempo de pico'); res.peakTime = null; res.peak = null;
        }
        if (res.overshootPct !== null && Math.abs(res.overshootPct - cn.overshootPct) > 0.05 * cn.overshootPct + 1e-3) {
          bad.push('sobrepaso'); res.overshootPct = null; res.peak = null; res.peakTime = null;
        }
        if (res.riseTime !== null) {
          var yc = function (t) { return 1 - Math.exp(-sg * t) * (Math.cos(wd * t) + sg / wd * Math.sin(wd * t)); };
          var lev = function (L) { return bisect(function (t) { return yc(t) - L; }, 0, Math.PI / wd); };
          var trc = lev(rise[1]) - lev(rise[0]);
          if (Math.abs(res.riseTime - trc) > 0.05 * trc) { bad.push('tiempo de subida'); res.riseTime = null; res.riseTimes = null; }
        }
        if (bad.length) {
          notes.push('Medición descartada (' + bad.join(', ') + '): difiere más de un 5 % del valor exacto del segundo orden puro, así que el muestreo no basta para esta respuesta.');
        }
      }
      notes.push('Métricas medidas sobre ' + tsM.length + ' muestras en [0, ' + fmtText(tEnd) + '] y refinadas por bisección; la banda de establecimiento es ±' + fmtText(settle * 100) + ' % del valor final.');
      return res;
    }

    /* ------------------------------------------------------------- parámetros */

    firstOrderParams() {
      if (this.order !== 1 || this._num.length !== 1) return null;
      var a0 = this._den[1];
      if (!(a0 > 0)) return null;
      return { K: this._num[0] / a0, tau: 1 / a0, pole: -a0 };
    }

    secondOrderParams() {
      if (this.order !== 2 || this._num.length !== 1) return null;
      var a1 = this._den[1], a0 = this._den[2];
      if (!(a0 > 0)) return null;
      var wn = Math.sqrt(a0), zeta = a1 / (2 * wn), K = this._num[0] / a0;
      // El régimen sigue a la agrupación de los polos (poleGroups): polo real doble ⇔ crítico;
      // dos polos reales distintos ⇔ sobreamortiguado; par complejo ⇔ subamortiguado. Así el paso
      // de la forma canónica y las fracciones parciales describen la misma respuesta.
      var groups = this.poleGroups();
      var damping;
      if (zeta < -1e-12) damping = 'inestable';
      else if (Math.abs(zeta) <= 1e-12) damping = 'no amortiguado';
      else if (groups.length === 1) damping = 'críticamente amortiguado';
      else if (groups[0].value.im !== 0) damping = 'subamortiguado';
      else damping = 'sobreamortiguado';
      var wd = Math.abs(zeta) < 1 && damping !== 'críticamente amortiguado' && damping !== 'sobreamortiguado' ? wn * Math.sqrt(1 - zeta * zeta) : null;
      var canonical = null;
      if (damping === 'subamortiguado') {
        canonical = {
          overshootPct: 100 * Math.exp(-zeta * Math.PI / Math.sqrt(1 - zeta * zeta)),
          peakTime: Math.PI / wd,
          settlingTime: 4 / (zeta * wn),
          settlingApprox: true,
          riseTime0to100: (Math.PI - Math.acos(zeta)) / wd
        };
      }
      return { K: K, wn: wn, zeta: zeta, wd: wd, sigma: zeta * wn, damping: damping, canonical: canonical };
    }

    /* ---------------------------------------------------------------- TeX */

    toTex(opts) {
      opts = opts || {};
      var d = opts.digits === undefined ? 4 : opts.digits, v = opts.variable || 's';
      var useOrig = opts.normalized === false;
      var nn = useOrig ? this._orig.num : this._num, dd = useOrig ? this._orig.den : this._den;
      var t = '\\frac{' + texPoly(nn, v, d) + '}{' + texPoly(dd, v, d) + '}';
      return opts.lhs ? opts.lhs + ' = ' + t : t;
    }

    /** Forma factorizada: K·Π(s − z)/Π(s − p), pares conjugados como factores cuadráticos. */
    toTexFactored(opts) {
      opts = opts || {};
      var d = opts.digits === undefined ? 4 : opts.digits, v = opts.variable || 's';
      var factorsOf = function (groups) {
        var out = [];
        groups.forEach(function (g) {
          var r = g.value, f;
          if (r.im < 0) return;
          if (r.im > 0) f = '\\left(' + texPoly([1, -2 * r.re, r.re * r.re + r.im * r.im], v, d) + '\\right)';
          else if (r.re === 0) f = v;
          else f = '\\left(' + texPoly([1, -r.re], v, d) + '\\right)';
          out.push(f + (g.multiplicity > 1 ? '^{' + g.multiplicity + '}' : ''));
        });
        return out.join(' ');
      };
      var K = P.isZero(this._num) ? 0 : this._num[0];
      var numF = factorsOf(this.zeroGroups());
      var kTex = texNum(K, d);
      var numTex = numF ? (kTex === '1' ? numF : kTex === '-1' ? '-' + numF : kTex + '\\, ' + numF) : kTex;
      var t = '\\frac{' + numTex + '}{' + (factorsOf(this.poleGroups()) || '1') + '}';
      return opts.lhs ? opts.lhs + ' = ' + t : t;
    }

    series(other) {
      if (!other || !other._den) throw new Error('series: se esperaba otra TransferFunction.');
      return new TransferFunction(P.mul(this._num, other._num), P.mul(this._den, other._den));
    }

    /* ---------------------------------------------------- constructores */

    static fromFirstOrder(K, tau) { return new TransferFunction([K], [tau, 1]); }

    static fromSecondOrder(K, zeta, wn) {
      if (!(wn > 0)) throw new Error('fromSecondOrder: ωn debe ser un número positivo.');
      return new TransferFunction([K * wn * wn], [1, 2 * zeta * wn, wn * wn]);
    }

    static parseCoeffs(str, field) { return parseCoeffs(str, field || null); }

    static fromCoeffStrings(numStr, denStr, opts) {
      var maxDen = opts && opts.maxDenDegree !== undefined ? opts.maxDenDegree : 4;
      var num = parseCoeffs(numStr, 'num');
      var den = parseCoeffs(denStr, 'den');
      var allZero = function (p) { return p.every(function (c) { return c === 0; }); };
      if (allZero(num)) {
        throw new TFInputError('El numerador es 0: G(s) sería idénticamente nula. Escriba al menos un coeficiente distinto de cero.', { field: 'num', code: 'num-zero' });
      }
      if (allZero(den)) {
        throw new TFInputError('El denominador es 0: G(s) no está definida. Escriba al menos un coeficiente distinto de cero.', { field: 'den', code: 'den-zero' });
      }
      if (num.length > 1 && num[0] === 0) {
        throw new TFInputError('El primer coeficiente del numerador es 0. Quite los ceros iniciales: el primer coeficiente corresponde a la potencia más alta de s.', { field: 'num', code: 'leading-zero', token: '0' });
      }
      if (den.length > 1 && den[0] === 0) {
        throw new TFInputError('El primer coeficiente del denominador es 0. Quite los ceros iniciales: el primer coeficiente corresponde a la potencia más alta de s.', { field: 'den', code: 'leading-zero', token: '0' });
      }
      var dd = den.length - 1, dn = num.length - 1;
      if (dd < 1) {
        throw new TFInputError('El denominador debe tener grado 1 o mayor: escriba al menos dos coeficientes (por ejemplo «1 2» para s + 2).', { field: 'den', code: 'den-degree' });
      }
      if (dd > maxDen) {
        throw new TFInputError('El denominador tiene grado ' + dd + '; aquí se admite hasta grado ' + maxDen + ' (' + (maxDen + 1) + ' coeficientes).', { field: 'den', code: 'den-degree' });
      }
      if (dn > dd) {
        throw new TFInputError('El numerador (grado ' + dn + ') no puede tener mayor grado que el denominador (grado ' + dd + '): G(s) sería impropia. Quite coeficientes del numerador o añada potencias al denominador.', { field: 'num', code: 'improper' });
      }
      return new TransferFunction(num, den);
    }
  }

  function freezeEntry(e) {
    return Object.freeze({
      pole: Object.freeze({ re: e.pole.re, im: e.pole.im }),
      multiplicity: e.multiplicity,
      power: e.power,
      residue: Object.freeze({ re: e.residue.re, im: e.residue.im })
    });
  }

  function cellTex(cell) {
    if (cell.k === 0) return texNum(cell.c, 4);
    var c = cell.c, mag = texNum(Math.abs(c), 4), sg = c < 0 ? '-' : '';
    if (cell.k === 1) return sg + (mag === '1' ? '' : mag + '\\,') + '\\varepsilon';
    if (cell.k === -1) return sg + '\\frac{' + mag + '}{\\varepsilon}';
    if (cell.k > 1) return sg + (mag === '1' ? '' : mag + '\\,') + '\\varepsilon^{' + cell.k + '}';
    return sg + '\\frac{' + mag + '}{\\varepsilon^{' + (-cell.k) + '}}';
  }

  /** Fracciones parciales de num/den estrictamente propia (polos de cualquier multiplicidad). */
  function partialFractions(num, den) {
    var core = pfCore(toCoeffArray(num, 'num'), toCoeffArray(den, 'den'));
    return core.entries.map(freezeEntry);
  }

  function refinePeak(g, ts, i) {
    var a = ts[Math.max(0, i - 1)], b = ts[Math.min(ts.length - 1, i + 1)];
    var gr = (Math.sqrt(5) - 1) / 2;
    var c = b - gr * (b - a), d = a + gr * (b - a), gc = g(c), gd = g(d);
    for (var it = 0; it < 90; it++) {
      if (gc > gd) { b = d; d = c; gd = gc; c = b - gr * (b - a); gc = g(c); }
      else { a = c; c = d; gc = gd; d = a + gr * (b - a); gd = g(d); }
      if (b - a <= 1e-14 * Math.max(1, Math.abs(b))) break;
    }
    var m = 0.5 * (a + b);
    // El extremo de la ventana puede ser mejor (pico en el borde de la muestra).
    var best = m, gb = g(m);
    [ts[i]].forEach(function (t) { if (g(t) > gb) { best = t; gb = g(t); } });
    return best;
  }

  DSL.core.tf = {
    TransferFunction: TransferFunction,
    TFInputError: TFInputError,
    partialFractions: partialFractions
  };
})(window.DSL);
