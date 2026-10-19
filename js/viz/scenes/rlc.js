/*
 * js/viz/scenes/rlc.js — Propietario: scenes.
 * Escena «rlc»: esquema serie limpio (fuente, R, L, C) con puntos de corriente que recorren el
 * cable (rapidez ∝ |i|, sentido según el signo), placas del capacitor con carga ∝ v_C, brillo del
 * inductor ∝ |i| y lecturas v_R, v_L, v_C junto a cada elemento. API: docs/api/scenes.md.
 */
(function (DSL) {
  'use strict';

  var scenes = DSL.viz.scenes;
  var kit = scenes.kit;
  var el = kit.el;
  var clamp = DSL.util.clamp;

  var DOT_GAP = 26;     // separación de los puntos de corriente (px)
  var DOT_SPEED = 95;   // px/s cuando |i| = i de referencia

  function pick(a, b, fallback) {
    if (typeof a === 'number' && isFinite(a)) return a;
    if (typeof b === 'number' && isFinite(b)) return b;
    return fallback;
  }

  function sub(sym, s) { return [{ sym: sym }, { sub: s }]; }

  function init(S) {
    S.is = kit.sticky(1e-9, 1.1);   // |i| de referencia (A)
    S.vs = kit.sticky(1e-9, 1.1);   // |v_C| de referencia (V)
    S.s0 = 0;
    S.vals = { u: 0, i: 0, vR: 0, vL: 0, vC: 0 };
  }

  function baseScales(S) {
    S.is.reset(S.hint('i'));
    S.vs.reset(S.hint('vC'));
  }

  function build(S) {
    var w = S.w;
    var h = S.h;
    var root = S.root;
    var pad = clamp(w * 0.04, 12, 26);
    var left = Math.round(pad + clamp(w * 0.15, 70, 130));
    var right = Math.round(w - pad - clamp(w * 0.2, 104, 170));
    var top = Math.round(pad + 44);
    var bottom = Math.round(h - pad - 36);
    if (bottom - top < 120) {
      top = Math.round(Math.max(pad + 36, (h - 120) / 2));
      bottom = top + 120;
    }
    var cy = Math.round((top + bottom) / 2);
    var W = right - left;
    var H = bottom - top;
    var narrow = W < 230;   // lazo estrecho: lecturas de R y L a ambos lados del hueco entre ambos
    var E = S.E = {};

    // geometría de los elementos
    var rs = 16;                                   // radio de la fuente
    var rLen = clamp(W * 0.18, 44, 72);
    var lLen = clamp(W * 0.2, 48, 80);
    var rc = left + W * 0.3;
    var lc = left + W * 0.7;
    var r0 = rc - rLen / 2;
    var r1 = rc + rLen / 2;
    var l0 = lc - lLen / 2;
    var l1 = lc + lLen / 2;
    var gapC = 6;                                  // semiseparación de las placas
    var mid = (r1 + l0) / 2;
    var rTxt = narrow ? { x: mid - 5, anchor: 'end' } : { x: rc, anchor: 'middle' };
    var lTxt = narrow ? { x: mid + 5, anchor: 'start' } : { x: lc, anchor: 'middle' };
    var plate = clamp(H * 0.32, 34, 52);

    // cables entre elementos
    var wd = 'M' + left + ' ' + (cy - rs) + 'V' + top + 'H' + r0 +
      'M' + r1 + ' ' + top + 'H' + l0 +
      'M' + l1 + ' ' + top + 'H' + right + 'V' + (cy - gapC) +
      'M' + right + ' ' + (cy + gapC) + 'V' + bottom + 'H' + left + 'V' + (cy + rs);
    el('path', { d: wd, class: 'sc-wire' }, root);

    // ley de Kirchhoff de tensiones en el centro del lazo
    var kvl = kit.label(root, [{ sym: 'v' }, '(', { sym: 't' }, ') = ', { sym: 'v' }, { sub: 'R' }, ' + ', { sym: 'v' }, { sub: 'L' }, ' + ', { sym: 'v' }, { sub: 'C' }],
      { x: (left + right) / 2, y: narrow ? bottom - 12 : cy + 4, anchor: 'middle' });
    kvl.el.setAttribute('data-role', 'kvl');

    // fuente
    var src = el('g', { class: 'sc-source-g' }, root);
    el('circle', { cx: left, cy: cy, r: rs, class: 'sc-component sc-component-body sc-source' }, src);
    el('path', { d: 'M' + (left - 4) + ' ' + (cy - 7) + 'h8M' + left + ' ' + (cy - 11) + 'v8M' + (left - 4) + ' ' + (cy + 8) + 'h8', class: 'sc-component sc-source' }, src);
    kit.label(src, [{ sym: 'v' }, '(', { sym: 't' }, ')'], { x: left - rs - 10, y: cy - 4, anchor: 'end', cls: 'sc-text--in' });
    E.vLabel = kit.label(src, [], { x: left - rs - 10, y: cy + 13, anchor: 'end', cls: 'sc-text--in' });

    // resistencia (zigzag)
    var zz = 'M' + r0 + ' ' + top;
    var nz = 6;
    for (var i = 1; i < 2 * nz; i++) {
      zz += 'L' + kit.r2(r0 + (i / (2 * nz)) * rLen) + ' ' + (top + (i % 2 ? -7 : 7));
    }
    zz += 'L' + r1 + ' ' + top;
    el('path', { d: zz, class: 'sc-component' }, root);
    kit.label(root, [{ sym: 'R' }, ' = ' + kit.paramText(S, 'R', 'Ω')], { x: rTxt.x, y: top - 32, anchor: rTxt.anchor });
    E.vRLabel = kit.label(root, sub('v', 'R').concat(' = '), { x: rTxt.x, y: top - 15, anchor: rTxt.anchor, cls: 'sc-text--ink' });

    // inductor (cuatro espiras) con halo de energía magnética ∝ |i|
    var hr = lLen / 8;
    var coil = 'M' + l0 + ' ' + top;
    for (var k = 0; k < 4; k++) coil += 'a' + hr + ' ' + hr + ' 0 0 1 ' + (2 * hr) + ' 0';
    var glow = el('path', { d: coil, class: 'sc-glow', opacity: 0 }, root);
    E.glow = kit.attr(glow, 'opacity');
    el('path', { d: coil, class: 'sc-component' }, root);
    kit.label(root, [{ sym: 'L' }, ' = ' + kit.paramText(S, 'L', 'H')], { x: lTxt.x, y: top - 32, anchor: lTxt.anchor });
    E.vLLabel = kit.label(root, sub('v', 'L').concat(' = '), { x: lTxt.x, y: top - 15, anchor: lTxt.anchor, cls: 'sc-text--ink' });

    // polaridades de referencia (convención pasiva con i en sentido horario)
    var pol = el('g', null, root);
    [[r0 + 4, '+'], [r1 - 4, '−'], [l0 + 4, '+'], [l1 - 4, '−']].forEach(function (m) {
      var t = el('text', { x: m[0], y: top + 18, class: 'sc-polarity', 'text-anchor': 'middle' }, pol);
      t.textContent = m[1];
    });
    var tp = el('text', { x: right - plate / 2 - 9, y: cy - 6, class: 'sc-polarity', 'text-anchor': 'middle' }, pol);
    tp.textContent = '+';
    var tm = el('text', { x: right - plate / 2 - 9, y: cy + 16, class: 'sc-polarity', 'text-anchor': 'middle' }, pol);
    tm.textContent = '−';

    // capacitor: placas con relleno de carga ∝ |v_C| y líneas de campo
    var cap = el('g', null, root);
    var fieldG = el('g', { opacity: 0 }, cap);
    E.field = kit.attr(fieldG, 'opacity');
    [-0.3, 0, 0.3].forEach(function (f) {
      el('line', { x1: right + f * plate, y1: cy - gapC + 2, x2: right + f * plate, y2: cy + gapC - 2, class: 'sc-field' }, fieldG);
    });
    E.plates = [];
    [cy - gapC - 4, cy + gapC].forEach(function (y) {
      el('rect', { x: right - plate / 2, y: y, width: plate, height: 4, rx: 1, class: 'sc-plate' }, cap);
      var fill = el('rect', { x: right, y: y + 0.75, width: 0, height: 2.5, class: 'sc-charge' }, cap);
      E.plates.push({ x: kit.len(fill, 'x'), w: kit.len(fill, 'width') });
    });
    E.plateW = plate - 2;
    E.cx = right;
    kit.label(cap, [{ sym: 'C' }, ' = ' + kit.paramText(S, 'C', 'F')], { x: right + plate / 2 + 12, y: cy - 4 });
    E.vCLabel = kit.label(cap, sub('v', 'C').concat(' = '), { x: right + plate / 2 + 12, y: cy + 13, cls: 'sc-text--out' });

    // corriente: flecha de sentido en el cable inferior y lectura
    var ig = el('g', { class: 'sc-arrow sc-arrow--zero' }, root);
    E.iArrow = kit.xform(ig);
    E.iArrowVis = kit.attr(ig, 'visibility');
    kit.arrowHead(ig, 10);
    E.iLabel = kit.label(root, [{ sym: 'i' }, ' = '], { x: (left + right) / 2, y: bottom + 24, anchor: 'middle', cls: 'sc-text--zero' });
    E.ix = (left + right) / 2;
    E.iy = bottom;

    // puntos de corriente sobre el lazo (se ocultan dentro de fuente, R, L y entre las placas)
    var P = 2 * (W + H);
    var n = Math.max(8, Math.floor(P / DOT_GAP));
    var dotsG = el('g', { class: 'sc-dots' }, root);
    E.dotsOp = kit.attr(dotsG, 'opacity');
    E.dots = [];
    for (var d = 0; d < n; d++) {
      var c = el('circle', { cx: 0, cy: 0, r: 2.6, class: 'sc-dot--zero' }, dotsG);
      E.dots.push({ xf: kit.xform(c), vis: kit.attr(c, 'visibility') });
    }
    E.loop = { left: left, right: right, top: top, bottom: bottom, W: W, H: H, P: P, n: n };
    E.hidden = [
      [r0 - left - 3, r1 - left + 3],
      [l0 - left - 3, l1 - left + 3],
      [W + (cy - gapC - 4 - top) - 2, W + (cy + gapC + 4 - top) + 2],
      [2 * W + H + (bottom - cy - rs) - 2, 2 * W + H + (bottom - cy + rs) + 2]
    ];
    E.pos = { x: 0, y: 0 };
  }

  /** Posición en el lazo para la abscisa curvilínea s (sentido horario desde la esquina superior izquierda). */
  function posAt(E, s) {
    var Lp = E.loop;
    var o = E.pos;
    if (s < Lp.W) { o.x = Lp.left + s; o.y = Lp.top; return o; }
    s -= Lp.W;
    if (s < Lp.H) { o.x = Lp.right; o.y = Lp.top + s; return o; }
    s -= Lp.H;
    if (s < Lp.W) { o.x = Lp.right - s; o.y = Lp.bottom; return o; }
    s -= Lp.W;
    o.x = Lp.left;
    o.y = Lp.bottom - s;
    return o;
  }

  function render(S, f) {
    var o = f.outputs || {};
    var st = f.state || [];
    var p = S.params;
    var V = S.vals;
    V.i = pick(o.i, st[0], 0);
    V.vC = pick(o.vC, st[1], 0);
    V.u = f.input ? kit.finite(f.input.value, 0) : 0;
    V.vR = (p.R || 0) * V.i;
    V.vL = V.u - V.vR - V.vC;

    var L = p.L > 0 ? p.L : 1;
    var C = p.C > 0 ? p.C : 1;
    S.is.observe(V.i);
    if (V.u !== 0) S.is.observe(Math.abs(V.u) * Math.sqrt(C / L));
    S.vs.observe(V.vC);
    S.vs.observe(V.u);

    var E = S.E;
    var iRef = S.is.value;
    var ir = clamp(Math.abs(V.i) / iRef, 0, 1);

    // puntos: rapidez ∝ i (con signo); en reposo o con movimiento reducido quedan quietos
    var Lp = E.loop;
    S.s0 += S.dt * DOT_SPEED * clamp(V.i / iRef, -1.5, 1.5);
    S.s0 = ((S.s0 % Lp.P) + Lp.P) % Lp.P;
    E.dotsOp(ir < 0.01 ? 0 : kit.r2(0.35 + 0.65 * Math.min(1, ir * 1.6)));
    var step = Lp.P / Lp.n;
    for (var d = 0; d < Lp.n; d++) {
      var s = (S.s0 + d * step) % Lp.P;
      var hide = false;
      for (var z = 0; z < E.hidden.length; z++) {
        if (s >= E.hidden[z][0] && s <= E.hidden[z][1]) { hide = true; break; }
      }
      var dot = E.dots[d];
      dot.vis(hide ? 'hidden' : 'visible');
      if (!hide) {
        var q = posAt(E, s);
        dot.xf.translate(q.x, q.y);
      }
    }

    // sentido de la corriente (también con movimiento reducido)
    if (ir < 0.01) {
      E.iArrowVis('hidden');
    } else {
      E.iArrowVis('visible');
      E.iArrow.matrix(V.i > 0 ? -1 : 1, 0, 0, 1, E.ix + (V.i > 0 ? -6 : 6), E.iy);
    }

    // inductor: brillo ∝ |i| (energía ½·L·i²); capacitor: carga ∝ |v_C|
    E.glow(kit.r2(0.5 * ir));
    var vr = clamp(Math.abs(V.vC) / S.vs.value, 0, 1);
    var fw = E.plateW * vr;
    for (var k = 0; k < 2; k++) {
      E.plates[k].x(E.cx - fw / 2);
      E.plates[k].w(fw);
    }
    E.field(kit.r2(0.85 * vr));

    if (S.textDue) {
      var vRef = S.vs.value;
      E.vLabel.set(kit.fmtRef(V.u, 'V', vRef));
      E.vRLabel.set(kit.fmtRef(V.vR, 'V', vRef));
      E.vLLabel.set(kit.fmtRef(V.vL, 'V', vRef));
      E.vCLabel.set(kit.fmtRef(V.vC, 'V', vRef));
      E.iLabel.set(kit.fmtRef(V.i, 'A', iRef));
    }
  }

  function summary(S, f) {
    var V = S.vals;
    var dir = Math.abs(V.i) < S.is.value * 0.01 ? 'sin corriente apreciable' : (V.i > 0 ? 'corriente en sentido horario' : 'corriente en sentido antihorario');
    return 't = ' + kit.fmt(kit.finite(f.t, 0), 's', 3) + '. Fuente v = ' + kit.fmt(V.u, 'V', 3) + '; i = ' + kit.fmt(V.i, 'A', 3) +
      ' (' + dir + '); v_R = ' + kit.fmt(V.vR, 'V', 3) + ', v_L = ' + kit.fmt(V.vL, 'V', 3) + ', v_C = ' + kit.fmt(V.vC, 'V', 3) + '.';
  }

  scenes.register('rlc', function (container, opts) {
    return kit.mount(container, opts, {
      id: 'rlc',
      cls: 'rlc',
      name: 'Escena del circuito RLC serie',
      variant: 'serie',
      init: init,
      onParams: baseScales,
      onReset: baseScales,
      build: build,
      render: render,
      summary: summary
    });
  });
})(window.DSL);
