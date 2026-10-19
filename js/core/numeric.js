/*
 * js/core/numeric.js — Propietario: math.
 * Complejos, polinomios, raíces (Aberth–Ehrlich + pulido de Newton), agrupación de raíces múltiples,
 * integradores (Euler, Heun, RK4, RK45 Dormand–Prince) y utilidades → DSL.core.numeric.
 * API: docs/api/numeric.md. Todo es puro y determinista: sin DOM, sin azar.
 */
(function (DSL) {
  'use strict';

  var EPS = 2.220446049250313e-16;
  var TWO_PI = 2 * Math.PI;

  /* ================================================================ complejos */

  function C(re, im) {
    return { re: Number(re), im: im === undefined ? 0 : Number(im) };
  }
  function reOf(a) { return typeof a === 'number' ? a : a.re; }
  function imOf(a) { return typeof a === 'number' ? 0 : (a.im || 0); }

  function cdiv(ar, ai, br, bi) {
    // Algoritmo de Smith: evita desbordamientos intermedios.
    if (br === 0 && bi === 0) return { re: ar / 0, im: ai === 0 ? 0 : ai / 0 };
    var r, d;
    if (Math.abs(br) >= Math.abs(bi)) {
      r = bi / br; d = br + bi * r;
      return { re: (ar + ai * r) / d, im: (ai - ar * r) / d };
    }
    r = br / bi; d = bi + br * r;
    return { re: (ar * r + ai) / d, im: (ai * r - ar) / d };
  }

  var cx = {
    add: function (a, b) { return { re: reOf(a) + reOf(b), im: imOf(a) + imOf(b) }; },
    sub: function (a, b) { return { re: reOf(a) - reOf(b), im: imOf(a) - imOf(b) }; },
    mul: function (a, b) {
      var ar = reOf(a), ai = imOf(a), br = reOf(b), bi = imOf(b);
      return { re: ar * br - ai * bi, im: ar * bi + ai * br };
    },
    div: function (a, b) { return cdiv(reOf(a), imOf(a), reOf(b), imOf(b)); },
    inv: function (a) { return cdiv(1, 0, reOf(a), imOf(a)); },
    scale: function (a, k) { return { re: reOf(a) * k, im: imOf(a) * k }; },
    neg: function (a) { return { re: -reOf(a), im: -imOf(a) }; },
    conj: function (a) { return { re: reOf(a), im: -imOf(a) }; },
    abs: function (a) { return Math.hypot(reOf(a), imOf(a)); },
    arg: function (a) {
      var t = Math.atan2(imOf(a), reOf(a));
      return t === -Math.PI ? Math.PI : t; // intervalo (−π, π]
    },
    exp: function (a) {
      var e = Math.exp(reOf(a)), th = imOf(a);
      return { re: e * Math.cos(th), im: th === 0 ? 0 : e * Math.sin(th) };
    },
    sqrt: function (a) {
      var r = reOf(a), i = imOf(a);
      if (r === 0 && i === 0) return { re: 0, im: 0 };
      var m = Math.hypot(r, i), t;
      if (r >= 0) {
        t = Math.sqrt((m + r) / 2);
        return { re: t, im: i / (2 * t) };
      }
      t = Math.sqrt((m - r) / 2);
      return { re: Math.abs(i) / (2 * t), im: (i < 0 || Object.is(i, -0)) ? -t : t };
    },
    pow: function (a, n) {
      n = Math.round(n);
      if (n < 0) return cx.inv(cx.pow(a, -n));
      var res = { re: 1, im: 0 }, b = { re: reOf(a), im: imOf(a) };
      while (n > 0) {
        if (n & 1) res = cx.mul(res, b);
        n >>= 1;
        if (n) b = cx.mul(b, b);
      }
      return res;
    },
    fromPolar: function (r, th) { return { re: r * Math.cos(th), im: r * Math.sin(th) }; },
    isReal: function (a, eps) {
      if (eps === undefined) eps = 1e-9;
      return Math.abs(imOf(a)) <= eps * Math.max(1, Math.abs(reOf(a)));
    },
    equals: function (a, b, eps) {
      if (eps === undefined) eps = 1e-9;
      var d = Math.hypot(reOf(a) - reOf(b), imOf(a) - imOf(b));
      return d <= eps * Math.max(1, cx.abs(a), cx.abs(b));
    },
    toString: function (a, digits) {
      if (digits === undefined) digits = 4;
      var f = function (x) { return DSL.util.formatNumber(x, digits, { ascii: true }); };
      var r = reOf(a), i = imOf(a);
      var ri = f(Math.abs(i));
      if (ri === '0') return f(r);
      var jPart = (ri === '1' ? '' : ri) + 'j';
      var rr = f(r);
      if (rr === '0') return (i < 0 ? '-' : '') + jPart;
      return rr + (i < 0 ? ' - ' : ' + ') + jPart;
    }
  };

  /* ============================================================== polinomios */
  // Coeficientes reales en potencias descendentes: [a_n, …, a_1, a_0].

  function maxAbs(a) {
    var m = 0;
    for (var i = 0; i < a.length; i++) { var v = Math.abs(a[i]); if (v > m) m = v; }
    return m;
  }

  function trim(p, eps) {
    if (!p || p.length === 0) return [0];
    eps = eps || 0;
    var mx = maxAbs(p);
    if (mx === 0) return [0];
    var thr = eps * mx;
    var i = 0;
    while (i < p.length - 1 && Math.abs(p[i]) <= thr) i++;
    return Array.prototype.slice.call(p, i);
  }

  function isZeroPoly(p) {
    if (!p) return true;
    for (var i = 0; i < p.length; i++) if (p[i] !== 0) return false;
    return true;
  }

  function degree(p) {
    return isZeroPoly(p) ? -1 : trim(p).length - 1;
  }

  function peval(p, x) {
    var y = 0;
    for (var i = 0; i < p.length; i++) y = y * x + p[i];
    return y;
  }

  function pevalC(p, z) {
    var zr = reOf(z), zi = imOf(z), yr = 0, yi = 0;
    for (var i = 0; i < p.length; i++) {
      var t = yr * zr - yi * zi + p[i];
      yi = yr * zi + yi * zr;
      yr = t;
    }
    return { re: yr, im: yi };
  }

  function padd(p, q, sign) {
    var n = Math.max(p.length, q.length), out = new Array(n);
    for (var i = 0; i < n; i++) {
      var a = p[i - (n - p.length)] || 0, b = q[i - (n - q.length)] || 0;
      out[i] = a + sign * b;
    }
    return trim(out, 0);
  }

  function pmul(p, q) {
    if (!p.length || !q.length) return [0];
    var out = new Array(p.length + q.length - 1).fill(0);
    for (var i = 0; i < p.length; i++) {
      if (p[i] === 0) continue;
      for (var j = 0; j < q.length; j++) out[i + j] += p[i] * q[j];
    }
    return out;
  }

  function pscale(p, k) { return Array.prototype.map.call(p, function (c) { return c * k; }); }

  function pderiv(p) {
    var n = p.length - 1;
    if (n <= 0) return [0];
    var out = new Array(n);
    for (var i = 0; i < n; i++) out[i] = p[i] * (n - i);
    return out;
  }

  /** División larga p = q·d + r. El resto se limpia del ruido de cancelación y se recorta. */
  function divmod(p, d) {
    var a = trim(p, 0), b = trim(d, 0);
    if (isZeroPoly(b)) throw new Error('poly.divmod: no se puede dividir entre el polinomio cero.');
    var na = a.length - 1, nb = b.length - 1;
    if (na < nb || isZeroPoly(a)) return { q: [0], r: a };
    var r = a.slice(), q = new Array(na - nb + 1);
    for (var i = 0; i <= na - nb; i++) {
      var c = r[i] / b[0];
      q[i] = c;
      if (c !== 0) for (var j = 0; j <= nb; j++) r[i + j] -= c * b[j];
      r[i] = 0;
    }
    var rem = r.slice(na - nb + 1);
    var scale = Math.max(maxAbs(a), maxAbs(b) * maxAbs(q));
    for (var k = 0; k < rem.length; k++) if (Math.abs(rem[k]) <= 64 * EPS * scale) rem[k] = 0;
    return { q: q, r: trim(rem, 0) };
  }

  /** Producto complejo Π(s − r_i); devuelve los coeficientes complejos (re[], im[]). */
  function rootsProductC(roots) {
    var re = [1], im = [0];
    for (var k = 0; k < roots.length; k++) {
      var rr = reOf(roots[k]), ri = imOf(roots[k]);
      var nre = new Array(re.length + 1).fill(0), nim = new Array(re.length + 1).fill(0);
      for (var i = 0; i < re.length; i++) {
        nre[i] += re[i]; nim[i] += im[i];
        // − r·c_i
        nre[i + 1] -= rr * re[i] - ri * im[i];
        nim[i + 1] -= rr * im[i] + ri * re[i];
      }
      re = nre; im = nim;
    }
    return { re: re, im: im };
  }

  /** Coeficientes reales mónicos de Π(s − r_i); el ruido imaginario residual se descarta. */
  function fromRoots(roots) {
    return rootsProductC(roots || []).re.map(function (v) { return v + 0; });
  }

  /** Coeficientes de Taylor de p en z: c_j = p^{(j)}(z)/j!, j = 0…m−1 (división sintética repetida). */
  function taylorC(p, z, m) {
    var zr = reOf(z), zi = imOf(z);
    var br = Array.prototype.slice.call(p), bi = new Array(p.length).fill(0);
    var out = [];
    var len = br.length;
    for (var j = 0; j < m; j++) {
      if (len <= 0) { out.push({ re: 0, im: 0 }); continue; }
      // Horner sobre los coeficientes actuales; los cocientes quedan en b[0..len-2].
      var accR = br[0], accI = bi[0];
      for (var i = 1; i < len; i++) {
        var nr = accR * zr - accI * zi + br[i];
        var ni = accR * zi + accI * zr + bi[i];
        br[i - 1] = accR; bi[i - 1] = accI;
        accR = nr; accI = ni;
      }
      out.push({ re: accR, im: accI });
      len--;
    }
    return out;
  }

  var poly = {
    trim: trim,
    degree: degree,
    isZero: isZeroPoly,
    eval: peval,
    evalC: pevalC,
    add: function (p, q) { return padd(p, q, 1); },
    sub: function (p, q) { return padd(p, q, -1); },
    mul: pmul,
    scale: pscale,
    deriv: pderiv,
    divmod: divmod,
    fromRoots: fromRoots,
    taylorC: taylorC
  };

  /* ================================================================== raíces */

  /** Evalúa p/p' en z con escalado (polinomio recíproco si |z| > 1) y la cota del error de Horner. */
  function newtonRatio(q, n, zr, zi, out) {
    var az = Math.hypot(zr, zi), pr, pi, dr, di, e, i, t, c;
    if (az <= 1) {
      pr = q[0]; pi = 0; dr = 0; di = 0; e = Math.abs(q[0]);
      for (i = 1; i <= n; i++) {
        t = dr * zr - di * zi + pr; di = dr * zi + di * zr + pi; dr = t;
        t = pr * zr - pi * zi + q[i]; pi = pr * zi + pi * zr; pr = t;
        e = e * az + Math.abs(q[i]);
      }
      out.absP = Math.hypot(pr, pi);
      out.bound = e;
      if (dr === 0 && di === 0) { out.ok = false; return out; }
      var r = cdiv(pr, pi, dr, di);
      out.rr = r.re; out.ri = r.im; out.ok = true;
      return out;
    }
    // w = 1/z; recíproco q_rev(w) = w^n p(1/w); p/p' = 1/(n·w − w²·q_rev'/q_rev)
    var w = cdiv(1, 0, zr, zi), wr = w.re, wi = w.im, aw = 1 / az;
    pr = q[n]; pi = 0; dr = 0; di = 0; e = Math.abs(q[n]);
    for (i = 1; i <= n; i++) {
      c = q[n - i];
      t = dr * wr - di * wi + pr; di = dr * wi + di * wr + pi; dr = t;
      t = pr * wr - pi * wi + c; pi = pr * wi + pi * wr; pr = t;
      e = e * aw + Math.abs(c);
    }
    out.absP = Math.hypot(pr, pi);
    out.bound = e;
    if (pr === 0 && pi === 0) { out.ok = true; out.rr = 0; out.ri = 0; return out; }
    var g = cdiv(dr, di, pr, pi);                       // q'/q
    var w2r = wr * wr - wi * wi, w2i = 2 * wr * wi;
    var denR = n * wr - (w2r * g.re - w2i * g.im);
    var denI = n * wi - (w2r * g.im + w2i * g.re);
    if (denR === 0 && denI === 0) { out.ok = false; return out; }
    var rr = cdiv(1, 0, denR, denI);
    out.rr = rr.re; out.ri = rr.im; out.ok = true;
    return out;
  }

  /** Aproximaciones iniciales deterministas por el polígono de Newton (Bini, 1996). */
  function initialGuesses(q, n) {
    var pts = [], k;
    for (k = 0; k <= n; k++) {
      var a = Math.abs(q[n - k]);
      if (a > 0) pts.push([k, Math.log(a)]);
    }
    var hull = [];
    for (var i = 0; i < pts.length; i++) {
      var pt = pts[i];
      while (hull.length >= 2) {
        var o = hull[hull.length - 2], b = hull[hull.length - 1];
        var cross = (b[0] - o[0]) * (pt[1] - o[1]) - (b[1] - o[1]) * (pt[0] - o[0]);
        if (cross >= 0) hull.pop(); else break;
      }
      hull.push(pt);
    }
    var z = [], sigma = 0.7;
    for (var h = 0; h + 1 < hull.length; h++) {
      var m = hull[h + 1][0] - hull[h][0];
      var u = Math.exp((hull[h][1] - hull[h + 1][1]) / m);
      for (var j = 0; j < m; j++) {
        var ang = TWO_PI * j / m + TWO_PI * h / n + sigma;
        z.push([u * Math.cos(ang), u * Math.sin(ang)]);
      }
    }
    return z;
  }

  /** Iteración de Aberth–Ehrlich (Gauss–Seidel) + pulido de Newton sobre p. */
  function aberth(q, n, tol, maxIter) {
    var z = initialGuesses(q, n);
    var conv = new Array(n).fill(false);
    var tmp = {};
    var stopFactor = 2 * n * EPS;
    for (var it = 0; it < maxIter; it++) {
      var active = 0;
      for (var i = 0; i < n; i++) {
        if (conv[i]) continue;
        var zr = z[i][0], zi = z[i][1];
        newtonRatio(q, n, zr, zi, tmp);
        if (tmp.absP <= stopFactor * tmp.bound) { conv[i] = true; continue; }
        if (!tmp.ok) {
          // punto crítico de p: se desplaza de forma determinista
          var bump = 1e-7 * Math.max(1, Math.hypot(zr, zi));
          z[i][0] = zr + bump; z[i][1] = zi + bump;
          active++;
          continue;
        }
        var sr = 0, si = 0;
        for (var j = 0; j < n; j++) {
          if (j === i) continue;
          var dr = zr - z[j][0], di = zi - z[j][1];
          var d2 = dr * dr + di * di;
          if (d2 === 0) continue;
          sr += dr / d2; si -= di / d2;
        }
        // w = r / (1 − r·S)
        var rr = tmp.rr, ri = tmp.ri;
        var denR = 1 - (rr * sr - ri * si), denI = -(rr * si + ri * sr);
        var w = cdiv(rr, ri, denR, denI);
        if (!isFinite(w.re) || !isFinite(w.im)) { w = { re: rr, im: ri }; }
        z[i][0] = zr - w.re; z[i][1] = zi - w.im;
        if (Math.hypot(w.re, w.im) <= tol * Math.hypot(z[i][0], z[i][1])) conv[i] = true;
        active++;
      }
      if (!active) break;
    }
    // Pulido de Newton sobre el polinomio original (solo si reduce el residuo relativo).
    for (var r = 0; r < n; r++) {
      var cr = z[r][0], ci = z[r][1];
      for (var k = 0; k < 4; k++) {
        newtonRatio(q, n, cr, ci, tmp);
        if (!tmp.ok || tmp.bound === 0) break;
        var res0 = tmp.absP / tmp.bound;
        if (res0 === 0) break;
        var nr = cr - tmp.rr, ni = ci - tmp.ri;
        var stepSize = Math.hypot(tmp.rr, tmp.ri);
        newtonRatio(q, n, nr, ni, tmp);
        if (tmp.absP / tmp.bound < res0) { cr = nr; ci = ni; } else break;
        if (stepSize <= EPS * Math.hypot(cr, ci)) break;
      }
      z[r][0] = cr; z[r][1] = ci;
    }
    return z.map(function (v) { return { re: v[0], im: v[1] }; });
  }

  function quadRoots(a, b, c) {
    var disc = b * b - 4 * a * c;
    if (disc < 0) {
      var re = -b / (2 * a) + 0, im = Math.sqrt(-disc) / (2 * Math.abs(a));
      return [{ re: re, im: -im }, { re: re, im: im }];
    }
    var sq = Math.sqrt(disc);
    var qq = -0.5 * (b + (b >= 0 ? sq : -sq));
    if (qq === 0) return [{ re: 0, im: 0 }, { re: 0, im: 0 }];
    return [{ re: qq / a + 0, im: 0 }, { re: c / qq + 0, im: 0 }];
  }

  /** Limpieza: casi reales → reales exactas; pares conjugados exactos. */
  function cleanRoots(roots) {
    var i, j;
    for (i = 0; i < roots.length; i++) {
      var r = roots[i];
      if (Math.abs(r.im) <= 1e-9 * Math.max(1, Math.hypot(r.re, r.im))) r.im = 0;
      r.re += 0; // −0 → 0
    }
    var pos = [], neg = [];
    for (i = 0; i < roots.length; i++) {
      if (roots[i].im > 0) pos.push(roots[i]); else if (roots[i].im < 0) neg.push(roots[i]);
    }
    if (pos.length || neg.length) {
      var pairs = [];
      for (i = 0; i < pos.length; i++) {
        for (j = 0; j < neg.length; j++) {
          pairs.push({ i: i, j: j, d: Math.hypot(pos[i].re - neg[j].re, pos[i].im + neg[j].im) });
        }
      }
      pairs.sort(function (a, b) { return a.d - b.d || a.i - b.i || a.j - b.j; });
      var usedP = new Array(pos.length).fill(false), usedN = new Array(neg.length).fill(false);
      for (var k = 0; k < pairs.length; k++) {
        var pr = pairs[k];
        if (usedP[pr.i] || usedN[pr.j]) continue;
        var p = pos[pr.i], q = neg[pr.j];
        if (pr.d > 1e-3 * Math.max(1, Math.hypot(p.re, p.im), p.im)) continue;
        usedP[pr.i] = usedN[pr.j] = true;
        var mr = (p.re + q.re) / 2, mi = (p.im - q.im) / 2;
        p.re = q.re = mr + 0; p.im = mi; q.im = -mi;
      }
      var fixLeft = function (list, used) {
        for (var t = 0; t < list.length; t++) {
          if (!used[t] && Math.abs(list[t].im) <= 1e-6 * Math.max(1, Math.hypot(list[t].re, list[t].im))) list[t].im = 0;
        }
      };
      fixLeft(pos, usedP); fixLeft(neg, usedN);
    }
    // Casi imaginarias puras (ruido de redondeo en la parte real) → sobre el eje jω exactamente.
    for (i = 0; i < roots.length; i++) {
      if (roots[i].im !== 0 && Math.abs(roots[i].re) <= 1e-12 * Math.abs(roots[i].im)) roots[i].re = 0;
    }
    return roots;
  }

  /** Orden determinista: parte real ascendente; empates (1e-9·escala) por parte imaginaria ascendente. */
  function sortRoots(roots) {
    var scale = 1;
    for (var i = 0; i < roots.length; i++) scale = Math.max(scale, Math.hypot(roots[i].re, roots[i].im));
    var tie = 1e-9 * scale;
    var s = roots.slice().sort(function (a, b) { return a.re - b.re || a.im - b.im; });
    var out = [];
    i = 0;
    while (i < s.length) {
      var j = i + 1;
      while (j < s.length && s[j].re - s[i].re <= tie) j++;
      var g = s.slice(i, j).sort(function (a, b) { return a.im - b.im || a.re - b.re; });
      for (var k = 0; k < g.length; k++) out.push(g[k]);
      i = j;
    }
    return out;
  }

  function polyRoots(coeffs, opts) {
    opts = opts || {};
    var tol = opts.tol === undefined ? 1e-12 : opts.tol;
    var maxIter = opts.maxIter === undefined ? 500 : opts.maxIter;
    if (!coeffs || typeof coeffs.length !== 'number') throw new Error('polyRoots: se esperaba un arreglo de coeficientes.');
    for (var i = 0; i < coeffs.length; i++) {
      if (typeof coeffs[i] !== 'number' || !isFinite(coeffs[i])) throw new Error('polyRoots: todos los coeficientes deben ser números finitos.');
    }
    var p = trim(coeffs, 0);
    if (isZeroPoly(p)) throw new Error('polyRoots: el polinomio cero no tiene raíces definidas.');
    var roots = [];
    var end = p.length;
    while (end > 1 && p[end - 1] === 0) { roots.push({ re: 0, im: 0 }); end--; }
    var q = p.slice(0, end);
    var n = q.length - 1;
    if (n === 1) roots.push({ re: -q[1] / q[0] + 0, im: 0 });
    else if (n === 2) roots = roots.concat(quadRoots(q[0], q[1], q[2]));
    else if (n >= 3) roots = roots.concat(recenterClusters(cleanRoots(aberth(q, n, tol, maxIter)), q));
    return sortRoots(cleanRoots(roots));
  }

  /**
   * Raíces múltiples: Aberth detiene cada raíz en el nivel de ruido, así que el centro del grupo
   * solo es exacto a ~u^{1/m}. Se traslada cada grupo validado para que su centroide coincida con la
   * raíz múltiple refinada, conservando la dispersión (no se promedian en una raíz «exacta»).
   */
  function recenterClusters(roots, q) {
    var groups = groupRoots(roots, { coeffs: q });
    groups.forEach(function (g) {
      if (g.multiplicity < 2) return;
      var mr = 0, mi = 0;
      g.members.forEach(function (r) { mr += r.re; mi += r.im; });
      mr /= g.multiplicity; mi /= g.multiplicity;
      var dr = g.value.re - mr, di = g.value.im - mi;
      g.members.forEach(function (r) { r.re += dr; r.im += di; });
    });
    return roots;
  }

  /* ========================================= agrupación de raíces múltiples */

  function cmpComplex(a, b, tie) {
    if (Math.abs(a.re - b.re) > tie) return a.re - b.re;
    return a.im - b.im || a.re - b.re;
  }

  function clusterRoots(roots, tau, S) {
    var n = roots.length, parent = [], i, j;
    for (i = 0; i < n; i++) parent.push(i);
    var find = function (x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        var a = roots[i], b = roots[j];
        var d = Math.hypot(a.re - b.re, a.im - b.im);
        var lim = tau * Math.max(Math.hypot(a.re, a.im), Math.hypot(b.re, b.im)) + 1e-14 * S;
        if (d <= lim) {
          var ra = find(i), rb = find(j);
          if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
        }
      }
    }
    var map = {}, groups = [];
    for (i = 0; i < n; i++) {
      var r = find(i);
      if (map[r] === undefined) { map[r] = groups.length; groups.push([]); }
      groups[map[r]].push(roots[i]);
    }
    return groups.map(function (members) {
      var sr = 0, si = 0;
      for (var k = 0; k < members.length; k++) { sr += members[k].re; si += members[k].im; }
      var v = { re: sr / members.length + 0, im: si / members.length };
      if (Math.abs(v.im) <= 1e-12 * Math.max(1, Math.abs(v.re))) v.im = 0;
      return { value: v, multiplicity: members.length, members: members.slice() };
    });
  }

  /**
   * Refina el centro de un grupo de multiplicidad m: r es raíz simple de p^{(m−1)}, así que Newton
   * sobre esa derivada da r con precisión completa (el centroide de Aberth solo es exacto a ~u^{1/m}).
   */
  function refineMultiple(coeffs, g) {
    var m = g.multiplicity;
    if (m < 2) return g.value;
    var d = trim(coeffs, 0);
    for (var k = 1; k < m; k++) d = pderiv(d);
    if (d.length < 2) return g.value;
    var dd = pderiv(d);
    var spread = 0;
    for (var i = 0; i < g.members.length; i++) {
      spread = Math.max(spread, Math.hypot(g.members[i].re - g.value.re, g.members[i].im - g.value.im));
    }
    var zr = g.value.re, zi = g.value.im;
    var real = zi === 0;
    for (var it = 0; it < 30; it++) {
      var f = pevalC(d, { re: zr, im: zi }), fp = pevalC(dd, { re: zr, im: zi });
      if (fp.re === 0 && fp.im === 0) break;
      var st = cdiv(f.re, f.im, fp.re, fp.im);
      if (real) st.im = 0;
      zr -= st.re; zi -= st.im;
      if (!isFinite(zr) || !isFinite(zi)) return g.value;
      if (Math.hypot(st.re, st.im) <= 4 * EPS * Math.max(1e-300, Math.hypot(zr, zi))) break;
    }
    var moved = Math.hypot(zr - g.value.re, zi - g.value.im);
    if (moved > 4 * spread + 1e-12 * Math.max(1, Math.hypot(zr, zi))) return g.value;
    return { re: zr + 0, im: zi };
  }

  function validGrouping(groups, coeffs) {
    var c = trim(coeffs, 0), lead = c[0];
    var monic = c.map(function (v) { return v / lead; });
    var expanded = [], absRoots = [];
    groups.forEach(function (g) {
      for (var k = 0; k < g.multiplicity; k++) {
        expanded.push(g.value);
        absRoots.push({ re: -Math.hypot(g.value.re, g.value.im), im: 0 });
      }
    });
    if (expanded.length !== monic.length - 1) return false;
    var merged = fromRoots(expanded), bound = fromRoots(absRoots);
    var bmax = maxAbs(bound);
    for (var k = 0; k < monic.length; k++) {
      if (Math.abs(merged[k] - monic[k]) > 1e-9 * Math.abs(bound[k]) + 1e-14 * bmax) return false;
    }
    return true;
  }

  /**
   * Agrupa raíces casi coincidentes (raíces múltiples). Con opts.coeffs valida cada agrupación
   * reconstruyendo el polinomio: se elige la tolerancia más amplia cuya agrupación lo reproduce.
   * Devuelve [{ value, multiplicity, members }] ordenados como polyRoots.
   */
  function groupRoots(roots, opts) {
    opts = opts || {};
    var n = roots.length;
    if (!n) return [];
    var S = 0;
    for (var i = 0; i < n; i++) S = Math.max(S, Math.hypot(roots[i].re, roots[i].im));
    if (S === 0) S = 1;
    var taus = opts.coeffs ? [1e-2, 3e-3, 1e-3, 3e-4, 1e-4, 3e-5, 1e-5, 1e-6, 1e-7] : [opts.tau === undefined ? 1e-6 : opts.tau];
    var chosen = null;
    var refine = function (groups) {
      if (opts.coeffs) groups.forEach(function (gr) { gr.value = refineMultiple(opts.coeffs, gr); });
      return groups;
    };
    for (var t = 0; t < taus.length; t++) {
      var g = clusterRoots(roots, taus[t], S);
      if (g.length === n) break;                 // nada que agrupar a esta escala (ni a escalas menores)
      refine(g);
      if (!opts.coeffs || validGrouping(g, opts.coeffs)) { chosen = g; break; }
    }
    if (!chosen) chosen = refine(clusterRoots(roots, 0, S));
    // Simetría conjugada exacta entre grupos.
    var used = new Array(chosen.length).fill(false);
    for (var a = 0; a < chosen.length; a++) {
      var ga = chosen[a];
      if (used[a] || ga.value.im <= 0) continue;
      var best = -1, bd = Infinity;
      for (var b = 0; b < chosen.length; b++) {
        var gb = chosen[b];
        if (b === a || used[b] || gb.value.im >= 0 || gb.multiplicity !== ga.multiplicity) continue;
        var d = Math.hypot(ga.value.re - gb.value.re, ga.value.im + gb.value.im);
        if (d < bd) { bd = d; best = b; }
      }
      if (best >= 0) {
        var gb2 = chosen[best];
        var mr = (ga.value.re + gb2.value.re) / 2, mi = (ga.value.im - gb2.value.im) / 2;
        ga.value = { re: mr + 0, im: mi };
        gb2.value = { re: mr + 0, im: -mi };
        used[a] = used[best] = true;
      }
    }
    var tie = 1e-9 * Math.max(1, S);
    return chosen.sort(function (x, y) { return cmpComplex(x.value, y.value, tie); });
  }

  /* ============================================================ integradores */

  var workDepth = 0;
  var workCache = {};
  function work(n) {
    if (workDepth > 0) return { k1: new Array(n), k2: new Array(n), k3: new Array(n), k4: new Array(n), tmp: new Array(n) };
    var w = workCache[n];
    if (!w) w = workCache[n] = { k1: new Array(n), k2: new Array(n), k3: new Array(n), k4: new Array(n), tmp: new Array(n) };
    return w;
  }
  function copyTo(dst, src, n) { for (var i = 0; i < n; i++) dst[i] = src[i]; }

  function eulerStep(f, t, x, dt, out) {
    var n = x.length, d = f(t, x), y = out || new Array(n);
    for (var i = 0; i < n; i++) y[i] = x[i] + dt * d[i];
    return y;
  }

  function heunStep(f, t, x, dt, out) {
    var n = x.length, w = work(n), i;
    workDepth++;
    try {
      copyTo(w.k1, f(t, x), n);
      for (i = 0; i < n; i++) w.tmp[i] = x[i] + dt * w.k1[i];
      copyTo(w.k2, f(t + dt, w.tmp), n);
    } finally { workDepth--; }
    var y = out || new Array(n);
    for (i = 0; i < n; i++) y[i] = x[i] + 0.5 * dt * (w.k1[i] + w.k2[i]);
    return y;
  }

  function rk4Step(f, t, x, dt, out) {
    var n = x.length, w = work(n), i, h2 = dt / 2;
    workDepth++;
    try {
      copyTo(w.k1, f(t, x), n);
      for (i = 0; i < n; i++) w.tmp[i] = x[i] + h2 * w.k1[i];
      copyTo(w.k2, f(t + h2, w.tmp), n);
      for (i = 0; i < n; i++) w.tmp[i] = x[i] + h2 * w.k2[i];
      copyTo(w.k3, f(t + h2, w.tmp), n);
      for (i = 0; i < n; i++) w.tmp[i] = x[i] + dt * w.k3[i];
      copyTo(w.k4, f(t + dt, w.tmp), n);
    } finally { workDepth--; }
    var y = out || new Array(n);
    for (i = 0; i < n; i++) y[i] = x[i] + (dt / 6) * (w.k1[i] + 2 * w.k2[i] + 2 * w.k3[i] + w.k4[i]);
    return y;
  }

  var FEVALS = { euler: 1, heun: 2, rk4: 4 };
  var STEPPERS = { euler: eulerStep, heun: heunStep, rk4: rk4Step };

  function hermite(ta, xa, fa, tb, xb, fb, t) {
    var h = tb - ta, s = (t - ta) / h, s2 = s * s, s3 = s2 * s;
    var h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    var out = new Array(xa.length);
    for (var i = 0; i < xa.length; i++) out[i] = h00 * xa[i] + h10 * h * fa[i] + h01 * xb[i] + h11 * h * fb[i];
    return out;
  }

  function fmt(x) { return DSL.util.formatNumber(x, 6); }

  function isFiniteVec(x) {
    for (var i = 0; i < x.length; i++) if (!isFinite(x[i])) return false;
    return true;
  }

  // Coeficientes de Dormand–Prince 5(4).
  var DP = {
    c: [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1],
    a: [
      [],
      [1 / 5],
      [3 / 40, 9 / 40],
      [44 / 45, -56 / 15, 32 / 9],
      [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
      [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
      [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]
    ],
    e: [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40],
    // Extensión continua de 4.º orden (Shampine): x(t + θh) = x + h·Σ_j (Σ_i K_i·P[i][j])·θ^{j+1}.
    P: [
      [1, -8048581381 / 2820520608, 8663915743 / 2820520608, -12715105075 / 11282082432],
      [0, 0, 0, 0],
      [0, 131558114200 / 32700410799, -68118460800 / 10900136933, 87487479700 / 32700410799],
      [0, -1754552775 / 470086768, 14199869525 / 1410260304, -10690763975 / 1880347072],
      [0, 127303824393 / 49829197408, -318862633887 / 49829197408, 701980252875 / 199316789632],
      [0, -282668133 / 205662961, 2019193451 / 616988883, -1453857185 / 822651844],
      [0, 40617522 / 29380423, -110615467 / 29380423, 69997945 / 29380423]
    ]
  };

  /** Interpolante continuo de Dormand–Prince sobre el paso [t, t + h]. */
  function dpDense(t, h, x, K) {
    var n = x.length, Q = [];
    for (var i = 0; i < n; i++) {
      var q = [0, 0, 0, 0];
      for (var s = 0; s < 7; s++) {
        var k = K[s][i], row = DP.P[s];
        if (!k) continue;
        for (var j = 0; j < 4; j++) q[j] += k * row[j];
      }
      Q.push(q);
    }
    var x0 = x.slice();
    return function (te) {
      var th = (te - t) / h, out = new Array(n);
      for (var r = 0; r < n; r++) {
        var q2 = Q[r];
        out[r] = x0[r] + h * th * (q2[0] + th * (q2[1] + th * (q2[2] + th * q2[3])));
      }
      return out;
    };
  }

  function integrate(f, x0, t0, t1, opts) {
    opts = opts || {};
    var method = opts.method || 'rk4';
    if (method !== 'rk45' && !STEPPERS[method]) throw new Error('integrate: método desconocido «' + method + '» (use euler, heun, rk4 o rk45).');
    if (!(isFinite(t0) && isFinite(t1))) throw new Error('integrate: t0 y t1 deben ser finitos.');
    if (t1 < t0) throw new Error('integrate: t1 debe ser mayor o igual que t0.');
    var maxSteps = opts.maxSteps === undefined ? 100000 : opts.maxSteps;
    var tEval = opts.tEval ? Array.prototype.slice.call(opts.tEval) : null;
    if (tEval) {
      for (var q = 0; q < tEval.length; q++) {
        if (tEval[q] < t0 - 1e-12 * Math.max(1, Math.abs(t0)) || tEval[q] > t1 + 1e-12 * Math.max(1, Math.abs(t1)) || (q && tEval[q] < tEval[q - 1])) {
          throw new Error('integrate: tEval debe ser creciente y estar dentro de [t0, t1].');
        }
      }
    }
    var fe = 0;
    var g = function (t, x) { fe++; return f(t, x); };
    var x = Array.prototype.slice.call(x0).map(Number);
    var T = [], X = [], ei = 0;
    var stats = { method: method, steps: 0, rejected: 0, fevals: 0, success: true, message: 'Integración completada.' };

    // Salida: todos los pasos, o solo los instantes de tEval (Hermite cúbico entre pasos).
    var emitStart = function () {
      if (!tEval) { T.push(t0); X.push(x.slice()); return; }
      while (ei < tEval.length && tEval[ei] <= t0) { T.push(tEval[ei]); X.push(x.slice()); ei++; }
    };
    var emitStep = function (ta, xa, fa, tb, xb, fb, dense) {
      if (!tEval) { T.push(tb); X.push(xb.slice()); return; }
      while (ei < tEval.length && tEval[ei] <= tb) {
        var te = tEval[ei];
        if (te >= tb) { T.push(te); X.push(xb.slice()); }
        else if (dense) { T.push(te); X.push(dense()(te)); }
        else {
          if (!fa) fa = g(ta, xa);
          if (!fb) fb = g(tb, xb);
          T.push(te); X.push(hermite(ta, xa, fa, tb, xb, fb, te));
        }
        ei++;
      }
    };

    emitStart();
    if (t1 === t0) {
      if (tEval) { while (ei < tEval.length) { T.push(tEval[ei]); X.push(x.slice()); ei++; } }
      stats.fevals = fe;
      return { t: T, x: X, stats: stats };
    }

    if (method !== 'rk45') {
      var dt = opts.dt;
      if (!(dt > 0)) throw new Error('integrate: indique opts.dt > 0 para el método ' + method + '.');
      var step = STEPPERS[method];
      var N = Math.ceil((t1 - t0) / dt - 1e-9);
      if (N < 1) N = 1;
      var fPrev = null;
      for (var k = 0; k < N; k++) {
        if (k >= maxSteps) {
          stats.success = false;
          stats.message = 'Se alcanzó el máximo de ' + maxSteps + ' pasos en t = ' + fmt(t0 + k * dt) + '; el resultado es parcial.';
          break;
        }
        var ta = t0 + k * dt, tb = k === N - 1 ? t1 : t0 + (k + 1) * dt;
        var xb = step(g, ta, x, tb - ta);
        stats.steps++;
        if (!isFiniteVec(xb)) {
          stats.success = false;
          stats.message = 'El estado dejó de ser finito en t = ' + fmt(tb) + '; reduzca el paso.';
          break;
        }
        emitStep(ta, x, fPrev, tb, xb, null);
        fPrev = null;
        x = xb;
      }
      stats.fevals = fe;
      return { t: T, x: X, stats: stats };
    }

    // ---- RK45 (Dormand–Prince) con control del paso y FSAL
    var rtol = opts.rtol === undefined ? 1e-6 : opts.rtol;
    var atol = opts.atol === undefined ? 1e-9 : opts.atol;
    var span = t1 - t0;
    var dtMax = opts.dtMax === undefined ? span : opts.dtMax;
    var dtMin = opts.dtMin === undefined ? 1e-12 * Math.max(1, span) : opts.dtMin;
    var h = opts.dt === undefined ? span / 100 : opts.dt;
    h = Math.min(Math.max(h, dtMin), dtMax);
    var n = x.length, t = t0;
    var K = [];
    for (var s = 0; s < 7; s++) K.push(new Array(n));
    var xs = new Array(n), xn = new Array(n);
    copyTo(K[0], g(t, x), n);
    var attempts = 0;
    while (t < t1) {
      if (stats.steps >= maxSteps) {
        stats.success = false;
        stats.message = 'Se alcanzó el máximo de ' + maxSteps + ' pasos en t = ' + fmt(t) + '; el resultado es parcial.';
        break;
      }
      var last = false;
      if (t + h >= t1 || t1 - (t + h) <= 1e-12 * Math.max(1, Math.abs(t1))) { h = t1 - t; last = true; }
      var i, j;
      for (s = 1; s < 7; s++) {
        var row = DP.a[s];
        for (i = 0; i < n; i++) {
          var acc = x[i];
          for (j = 0; j < s; j++) if (row[j]) acc += h * row[j] * K[j][i];
          xs[i] = acc;
        }
        copyTo(K[s], g(t + DP.c[s] * h, xs), n);
        if (s === 6) copyTo(xn, xs, n);
      }
      // Ahora K[6] = f(t + h, xn) (FSAL).
      var errSum = 0;
      for (i = 0; i < n; i++) {
        var e = 0;
        for (j = 0; j < 7; j++) if (DP.e[j]) e += DP.e[j] * K[j][i];
        e *= h;
        var sc = atol + rtol * Math.max(Math.abs(x[i]), Math.abs(xn[i]));
        errSum += (e / sc) * (e / sc);
      }
      var err = Math.sqrt(errSum / Math.max(1, n));
      attempts++;
      if (!isFinite(err) || !isFiniteVec(xn)) {
        err = Infinity;
      }
      if (err <= 1) {
        var tb2 = last ? t1 : t + h;
        var interp = null, tS = t, hS = h, xS = x;
        emitStep(t, x, K[0].slice(), tb2, xn, K[6].slice(), function () { return interp || (interp = dpDense(tS, hS, xS, K)); });
        stats.steps++;
        t = tb2;
        x = xn.slice();
        copyTo(K[0], K[6], n);
        var fac = err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * Math.pow(err, -0.2)));
        h = Math.min(dtMax, Math.max(dtMin, h * fac));
      } else {
        stats.rejected++;
        var fac2 = isFinite(err) ? Math.max(0.2, 0.9 * Math.pow(err, -0.2)) : 0.2;
        var hn = h * Math.min(1, fac2);
        if (hn < dtMin) {
          stats.success = false;
          stats.message = 'El paso bajó de dtMin sin alcanzar la tolerancia en t = ' + fmt(t) + '; el resultado es parcial.';
          break;
        }
        h = hn;
      }
      if (attempts > 4 * maxSteps + 100) {
        stats.success = false;
        stats.message = 'Demasiados pasos rechazados en t = ' + fmt(t) + '; el resultado es parcial.';
        break;
      }
    }
    stats.fevals = fe;
    return { t: T, x: X, stats: stats };
  }

  /* ============================================================== utilidades */

  function linspace(a, b, n) {
    n = Math.max(0, Math.floor(n));
    if (n === 0) return [];
    if (n === 1) return [a];
    var out = new Array(n), h = (b - a) / (n - 1);
    for (var i = 0; i < n; i++) out[i] = a + i * h;
    out[n - 1] = b;
    return out;
  }

  function logspace(d0, d1, n) {
    return linspace(d0, d1, n).map(function (d) { return Math.pow(10, d); });
  }

  function unwrap(ph) {
    var out = new Array(ph.length);
    if (!ph.length) return out;
    var offset = 0;
    out[0] = ph[0];
    for (var i = 1; i < ph.length; i++) {
      var d = ph[i] - ph[i - 1];
      if (isFinite(d)) offset -= TWO_PI * Math.round(d / TWO_PI);
      out[i] = ph[i] + offset;
    }
    return out;
  }

  function interpOne(xs, ys, x) {
    var n = xs.length;
    if (!n) return NaN;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid; else hi = mid;
    }
    var x0 = xs[lo], x1 = xs[hi];
    if (x1 === x0) return ys[hi];
    return ys[lo] + (ys[hi] - ys[lo]) * (x - x0) / (x1 - x0);
  }

  function interp1(xs, ys, xq) {
    if (typeof xq === 'number') return interpOne(xs, ys, xq);
    return Array.prototype.map.call(xq, function (x) { return interpOne(xs, ys, x); });
  }

  function rmse(a, b) {
    var n = Math.min(a.length, b.length);
    if (!n) return NaN;
    var s = 0;
    for (var i = 0; i < n; i++) { var d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s / n);
  }

  function nearlyEqual(a, b, rtol, atol) {
    if (rtol === undefined) rtol = 1e-9;
    if (atol === undefined) atol = 1e-12;
    if (a === b) return true;
    return Math.abs(a - b) <= Math.max(atol, rtol * Math.max(Math.abs(a), Math.abs(b)));
  }

  var FACT = [1];
  function factorial(n) {
    n = Math.round(n);
    if (n < 0) return NaN;
    if (n > 170) return Infinity;
    for (var i = FACT.length; i <= n; i++) FACT[i] = FACT[i - 1] * i;
    return FACT[n];
  }

  DSL.core.numeric = {
    EPS: EPS,
    C: C,
    cx: cx,
    poly: poly,
    polyRoots: polyRoots,
    sortRoots: function (roots) { return sortRoots(roots.map(function (r) { return { re: reOf(r), im: imOf(r) }; })); },
    groupRoots: groupRoots,
    integrate: integrate,
    eulerStep: eulerStep,
    heunStep: heunStep,
    rk4Step: rk4Step,
    steppers: { euler: eulerStep, heun: heunStep, rk4: rk4Step },
    FEVALS: FEVALS,
    linspace: linspace,
    logspace: logspace,
    unwrap: unwrap,
    interp1: interp1,
    rmse: rmse,
    maxAbs: function (a) { return maxAbs(a); },
    nearlyEqual: nearlyEqual,
    factorial: factorial
  };
})(window.DSL);
