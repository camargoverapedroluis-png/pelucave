/*
 * js/viz/scenes/sir.js — Propietario: scenes.
 * Escena «sir»: diagrama de stocks y flujos S → I → R (depósitos llenos en proporción, válvulas con
 * partículas cuya rapidez sigue a β·S·I/N y γ·I) y rejilla de población de 20 × 20 puntos coloreada
 * de forma determinista según las proporciones actuales. API: docs/api/scenes.md.
 */
(function (DSL) {
  'use strict';

  var scenes = DSL.viz.scenes;
  var kit = scenes.kit;
  var el = kit.el;
  var util = DSL.util;
  var clamp = util.clamp;

  var GRID = 20;               // 20 × 20 = 400 puntos
  var DOTS = GRID * GRID;
  var PARTICLES = 5;           // partículas por tubería
  var SEED = 20240917;         // orden de contagio determinista
  var THIN = ' ';         // separador de miles (espacio fino duro)
  var NBSPPCT = kit.NBSP + '%';  // «50 %» con espacio duro

  var ORDER = null;            // rango → índice de punto (orden de contagio), común a todas las instancias

  /** Orden de contagio: distancia a un foco con ruido de semilla fija y desempate por índice. */
  function infectionOrder() {
    if (ORDER) return ORDER;
    var rng = util.mulberry32(SEED);
    var keys = [];
    for (var i = 0; i < DOTS; i++) {
      var gx = i % GRID;
      var gy = Math.floor(i / GRID);
      var dx = gx - 7.6;
      var dy = gy - 8.4;
      var d = Math.sqrt(dx * dx + dy * 1.15 * dy) + 2.6 * (rng() - 0.5) + 1.2 * util.gaussian(rng) * 0.5;
      keys.push({ i: i, d: d });
    }
    keys.sort(function (a, b) { return a.d - b.d || a.i - b.i; });
    ORDER = keys.map(function (k) { return k.i; });
    return ORDER;
  }

  function people(v) {
    var n = Math.round(Math.max(0, v));
    var s = String(n);
    if (n < 10000) return s;
    var out = '';
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += THIN;
      out += s.charAt(i);
    }
    return out;
  }

  function pick(a, b, fallback) {
    if (typeof a === 'number' && isFinite(a)) return a;
    if (typeof b === 'number' && isFinite(b)) return b;
    return fallback;
  }

  function init(S) {
    S.fs = kit.sticky(1e-9, 1.1);    // flujo de referencia (personas/día)
    S.ph = [0, 0];
    S.nR = 0;
    S.nI = 0;
    S.vals = { S: 0, I: 0, R: 0, inf: 0, rec: 0, N: 1, u: 0 };
  }

  function baseScales(S) {
    var p = S.params;
    var N = p.N > 0 ? p.N : 1;
    S.fs.reset(Math.max(p.beta || 0, p.gamma || 0) * N / 8);
  }

  function build(S) {
    var w = S.w;
    var h = S.h;
    var root = S.root;
    var pad = clamp(w * 0.04, 12, 26);
    var E = S.E = {};
    var side = w >= 520 && w / h >= 1.3;
    var rx;
    var ry;
    var rw;
    var rh;
    var gx;
    var gy;
    var gs;
    var legendBeside = false;
    if (side) {
      gs = Math.min(h - 2 * pad - 44, (w - 2 * pad) * 0.36);
      gx = w - pad - gs;
      gy = pad + (h - 2 * pad - 44 - gs) / 2;
      rx = pad;
      ry = pad;
      rw = gx - pad - Math.max(24, w * 0.05);
      rh = h - 2 * pad;
    } else {
      // apilado: stocks arriba; rejilla debajo con la leyenda debajo o al lado (lo que dé más rejilla)
      rx = pad;
      ry = pad;
      rw = w - 2 * pad;
      rh = clamp((h - 2 * pad) * 0.5, 122, 200);
      var room = h - pad - (ry + rh + 6);
      var gBelow = Math.min(room - 44, rw);
      var gBeside = Math.min(room - 4, rw - 172);
      legendBeside = gBeside > gBelow;
      gs = Math.max(40, legendBeside ? gBeside : gBelow);
      gx = legendBeside ? Math.max(pad, (w - gs - 172) / 2) : (w - gs) / 2;
      gy = ry + rh + 6;
    }

    // ---------- stocks y flujos
    var pl = Math.max(72, rw * 0.2);
    var sw = clamp((rw - 2 * pl) / 3, 38, 110);
    pl = (rw - 3 * sw) / 2;
    var sh = clamp(rh - 96, 56, 190);
    var sTop = ry + Math.max(34, (rh - sh - 34 - 60) / 2 + 34);
    var sBot = sTop + sh;
    var cy = sTop + sh * 0.5;
    var defs = [
      { key: 'S', name: 'Susceptibles', cls: 'out' },
      { key: 'I', name: 'Infectados', cls: 'pole' },
      { key: 'R', name: 'Recuperados', cls: 'zero' }
    ];
    E.stocks = defs.map(function (d, i) {
      var x = rx + i * (sw + pl);
      var g = el('g', { class: 'sc-stock-g' }, root);
      // depósitos estrechos: los nombres de los extremos se alinean con su borde exterior
      var nAnchor = sw >= 84 || i === 1 ? 'middle' : (i === 0 ? 'start' : 'end');
      var nx = nAnchor === 'middle' ? x + sw / 2 : (nAnchor === 'start' ? x : x + sw);
      var name = el('text', { x: nx, y: sTop - 12, class: 'sc-text', 'text-anchor': nAnchor }, g);
      name.textContent = d.name;
      el('rect', { x: x, y: sTop, width: sw, height: sh, rx: 3, class: 'sc-stock' }, g);
      var fill = el('rect', { x: x + 1.5, y: sBot - 1.5, width: sw - 3, height: 0, class: 'sc-stock-fill--' + d.cls }, g);
      var line = el('line', { x1: x + 1.5, x2: x + sw - 1.5, y1: sBot, y2: sBot, class: 'sc-stock-level sc-stock-level--' + d.cls }, g);
      var lb = kit.label(g, [{ sym: d.key }, ' = '], { x: x + sw / 2, y: sBot + 19, anchor: 'middle', cls: 'sc-text--' + d.cls });
      return {
        y: kit.len(fill, 'y'), hgt: kit.len(fill, 'height'),
        ly1: kit.len(line, 'y1'), ly2: kit.len(line, 'y2'),
        label: lb, inner: sh - 3, bottom: sBot - 1.5
      };
    });

    var flows = [
      { from: 0, cls: 'pole', parts: [{ sym: 'β' }, { sym: 'S' }, { sym: 'I' }, '/', { sym: 'N' }],
        alt: [{ sym: 'β' }, '(1−', { sym: 'u' }, ')', { sym: 'S' }, { sym: 'I' }, '/', { sym: 'N' }] },
      { from: 1, cls: 'zero', parts: [{ sym: 'γ' }, { sym: 'I' }] }
    ];
    E.flows = flows.map(function (fl) {
      var xa = rx + fl.from * (sw + pl) + sw;
      var xb = xa + pl;
      var xm = (xa + xb) / 2;
      var g = el('g', null, root);
      el('path', { d: 'M' + xa + ' ' + (cy - 5) + 'H' + xb + 'M' + xa + ' ' + (cy + 5) + 'H' + xb, class: 'sc-flowpipe' }, g);
      var pg = el('g', { opacity: 0 }, g);
      var parts = [];
      for (var k = 0; k < PARTICLES; k++) {
        var c = el('circle', { cx: 0, cy: 0, r: 2.4, class: 'sc-particle--' + fl.cls }, pg);
        parts.push(kit.xform(c));
      }
      var vg = el('g', null, g);
      kit.xform(vg).translate(xm, cy);
      el('path', { d: 'M-7 -7L7 7V-7L-7 7Z', class: 'sc-valve' }, vg);
      el('path', { d: 'M0 7V15', class: 'sc-struct' }, vg);
      el('circle', { cx: 0, cy: 19, r: 4, class: 'sc-valve' }, vg);
      // fórmula sobre la tubería; valor bajo la válvula
      var formula = kit.label(g, fl.parts, { x: xm, y: cy - 14, anchor: 'middle', cls: 'sc-text--' + fl.cls });
      // con distanciamiento (u > 0) se muestra la tasa efectiva β(1 − u)·S·I/N
      var alt = fl.alt ? kit.label(g, fl.alt, { x: xm, y: cy - 14, anchor: 'middle', cls: 'sc-text--' + fl.cls }) : null;
      if (alt) alt.el.setAttribute('visibility', 'hidden');
      var val = kit.label(g, [], { x: xm, y: cy + 40, anchor: 'middle', cls: 'sc-text--' + fl.cls });
      // flecha de sentido al final de la tubería
      var ah = el('g', { class: 'sc-arrow sc-arrow--' + fl.cls }, g);
      kit.xform(ah).translate(xb - 1, cy);
      kit.arrowHead(ah, 7);
      return {
        xa: xa + 3, xb: xb - 9, cy: cy, parts: parts, op: kit.attr(pg, 'opacity'), value: val,
        plainVis: alt ? kit.attr(formula.el, 'visibility') : null, altVis: alt ? kit.attr(alt.el, 'visibility') : null
      };
    });

    // ---------- rejilla de población
    var order = infectionOrder();
    var cell = gs / GRID;
    var r = Math.max(1.6, cell * 0.33);
    var popG = el('g', { class: 'sc-pop-g', 'data-testid': S.testid + '-grid' }, root);
    var nodes = new Array(DOTS);
    for (var i = 0; i < DOTS; i++) {
      var cx = gx + (i % GRID + 0.5) * cell;
      var cyy = gy + (Math.floor(i / GRID) + 0.5) * cell;
      nodes[i] = el('circle', { cx: kit.r2(cx), cy: kit.r2(cyy), r: kit.r2(r), class: 'sc-pop sc-pop--s' }, popG);
    }
    E.byRank = order.map(function (idx) { return nodes[idx]; });
    E.rSmall = kit.r2(r * 0.78);
    E.rFull = kit.r2(r);
    S.nR = 0;
    S.nI = 0;

    // leyenda: forma + color + texto
    var ly = legendBeside ? gy + gs / 2 - 4 : gy + gs + 20;
    var lx0 = legendBeside ? gx + gs + 18 : gx;
    var lg = el('g', null, root);
    var items = [['s', 'S'], ['i', 'I'], ['r', 'R']];
    var lx = lx0;
    items.forEach(function (it) {
      el('circle', { cx: lx + 4, cy: ly - 4, r: 4, class: 'sc-legend-' + it[0] }, lg);
      kit.label(lg, [{ sym: it[1] }], { x: lx + 12, y: ly });
      lx += 30;
    });
    var per = (S.params.N > 0 ? S.params.N : DOTS) / DOTS;
    E.perLabel = kit.label(lg, ['cada punto ≈ ' + people(per) + (Math.round(per) === 1 ? ' persona' : ' personas')], { x: lx0, y: ly + 18 });
  }

  function setClass(node, cls, small, E) {
    node.setAttribute('class', 'sc-pop sc-pop--' + cls);
    node.setAttribute('r', small ? E.rSmall : E.rFull);
  }

  function render(S, f) {
    var o = f.outputs || {};
    var st = f.state || [];
    var p = S.params;
    var V = S.vals;
    V.N = p.N > 0 ? p.N : 1;
    V.S = Math.max(0, pick(o.S, st[0], V.N));
    V.I = Math.max(0, pick(o.I, st[1], 0));
    V.R = Math.max(0, pick(o.R, st[2], 0));
    // u: fracción de contactos evitada (distanciamiento), como en el modelo: β(1 − u)·S·I/N
    V.u = f.input ? clamp(kit.finite(f.input.value, 0), 0, 1) : 0;
    V.inf = (p.beta || 0) * (1 - V.u) * V.S * V.I / V.N;
    V.rec = (p.gamma || 0) * V.I;
    S.fs.observe(Math.max(V.inf, V.rec));

    var E = S.E;
    // stocks
    var vals = [V.S, V.I, V.R];
    for (var k = 0; k < 3; k++) {
      var sk = E.stocks[k];
      var hh = clamp(vals[k] / V.N, 0, 1) * sk.inner;
      sk.y(sk.bottom - hh);
      sk.hgt(hh);
      sk.ly1(sk.bottom - hh);
      sk.ly2(sk.bottom - hh);
    }

    // partículas de los flujos: rapidez ∝ caudal / caudal de referencia
    var flowsV = [V.inf, V.rec];
    for (var j = 0; j < 2; j++) {
      var fl = E.flows[j];
      var rel = flowsV[j] / S.fs.value;
      fl.op(rel < 0.002 ? 0 : kit.r2(clamp(0.35 + rel * 2, 0, 1)));
      S.ph[j] = (S.ph[j] + S.dt * 0.9 * clamp(rel, 0, 1.5)) % 1;
      for (var q = 0; q < PARTICLES; q++) {
        var fr = (S.ph[j] + q / PARTICLES) % 1;
        fl.parts[q].translate(fl.xa + fr * (fl.xb - fl.xa), fl.cy);
      }
    }

    // rejilla: R en el foco, I en el frente, S fuera; solo cambian los puntos que cruzan un umbral
    var nR = Math.round(V.R / V.N * DOTS);
    var nI = Math.round(V.I / V.N * DOTS);
    if (nI === 0 && V.I >= 0.5) nI = 1;
    nR = clamp(nR, 0, DOTS);
    nI = clamp(nI, 0, DOTS - nR);
    if (nR !== S.nR || nI !== S.nI) {
      var oldI = S.nR + S.nI;
      var newI = nR + nI;
      var lo = Math.min(S.nR, nR);
      var hi = Math.max(oldI, newI);
      for (var rk = lo; rk < hi; rk++) {
        var cls = rk < nR ? 'r' : (rk < newI ? 'i' : 's');
        var was = rk < S.nR ? 'r' : (rk < oldI ? 'i' : 's');
        if (cls !== was) setClass(E.byRank[rk], cls, cls === 'r', E);
      }
      S.nR = nR;
      S.nI = nI;
    }

    if (S.textDue) {
      E.stocks[0].label.set(people(V.S));
      E.stocks[1].label.set(people(V.I));
      E.stocks[2].label.set(people(V.R));
      var dist = V.u > 5e-4;
      E.flows[0].plainVis(dist ? 'hidden' : 'visible');
      E.flows[0].altVis(dist ? 'visible' : 'hidden');
      E.flows[0].value.set(kit.fmtRef(V.inf, '/día', S.fs.value));
      E.flows[1].value.set(kit.fmtRef(V.rec, '/día', S.fs.value));
    }
  }

  function summary(S, f) {
    var V = S.vals;
    var phase = V.inf > V.rec * 1.01 ? 'los contagios superan a las recuperaciones y los infectados crecen' :
      (V.I < 0.5 ? 'no quedan infectados' : 'las recuperaciones superan a los contagios y los infectados disminuyen');
    return 'Día ' + util.formatNumber(kit.finite(f.t, 0), 3) + ': S = ' + people(V.S) + ', I = ' + people(V.I) + ', R = ' + people(V.R) +
      ' personas; contagios ' + kit.fmt(V.inf, 'por día', 3) + (V.u > 5e-4 ? ' (con distanciamiento u = ' + util.formatNumber(100 * V.u, 3) + NBSPPCT + ')' : '') + ' y recuperaciones ' + kit.fmt(V.rec, 'por día', 3) + '; ' + phase + '.';
  }

  scenes.register('sir', function (container, opts) {
    return kit.mount(container, opts, {
      id: 'sir',
      cls: 'sir',
      name: 'Escena del modelo epidémico SIR',
      variant: 'base',
      init: init,
      onParams: baseScales,
      onReset: baseScales,
      build: build,
      render: render,
      summary: summary
    });
  });
})(window.DSL);
