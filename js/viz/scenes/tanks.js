/*
 * js/viz/scenes/tanks.js — Propietario: scenes.
 * Escena «tanks», variantes lineal | torricelli | cascada: tanques con nivel h y onda de superficie
 * proporcional al caudal neto, chorro de entrada de ancho ∝ q_in, salida por válvula (lineal, cascada)
 * u orificio con chorro de Torricelli, marcador de nivel, línea discontinua de equilibrio o h₀ y
 * franja de lecturas. Vista pura: el estado llega en render(frame). API: docs/api/scenes.md.
 */
(function (DSL) {
  'use strict';

  var scenes = DSL.viz.scenes;
  var kit = scenes.kit;
  var el = kit.el;
  var clamp = DSL.util.clamp;

  var SQ2G = Math.sqrt(2 * kit.G);
  var NSURF = 28;           // segmentos de la superficie libre
  var STREAK = 16;          // periodo (px) de las estrías de los chorros
  var FALL = 70;            // px/s de las estrías (caída aparente, decorativa)
  var WAVE = 2 * Math.PI * 0.7;   // rad/s de la onda superficial
  var SLOT = 132;           // ancho de cada lectura de la franja superior
  // placa bajo los rótulos que caen sobre el fluido (h∞, h₀, h₁∞, h₂∞): margen alrededor del texto de
  // 13 px con subíndice (tinta de −9.6 a +4.1 px respecto a la línea base) y desplazamiento de la línea
  // base respecto al centro de la placa, que se sitúa sobre la línea de referencia
  var TAG_PADX = 4;
  var TAG_UP = 13;
  var TAG_DOWN = 7;
  var TAG_BASE = 3;

  function pick(a, b, fallback) {
    if (typeof a === 'number' && isFinite(a)) return a;
    if (typeof b === 'number' && isFinite(b)) return b;
    return fallback;
  }

  function sub(sym, s) { return [{ sym: sym }, { sub: s }]; }

  /** Lecturas de la franja superior según la variante. */
  function stripItems(variant) {
    if (variant === 'cascada') {
      return [
        { key: 'qin', parts: sub('q', 'in'), cls: 'sc-text--in', unit: 'm³/s' },
        { key: 'h1', parts: sub('h', '1'), cls: 'sc-text--out', unit: 'm' },
        { key: 'q1', parts: sub('q', '1'), cls: 'sc-text--out', unit: 'm³/s' },
        { key: 'h2', parts: sub('h', '2'), cls: 'sc-text--zero', unit: 'm' },
        { key: 'q2', parts: sub('q', '2'), cls: 'sc-text--zero', unit: 'm³/s' }
      ];
    }
    return [
      { key: 'qin', parts: sub('q', 'in'), cls: 'sc-text--in', unit: 'm³/s' },
      { key: 'h', parts: [{ sym: 'h' }], cls: 'sc-text--out', unit: 'm' },
      { key: 'qout', parts: sub('q', 'out'), cls: 'sc-text--zero', unit: 'm³/s' },
      { key: 'heq', parts: variant === 'torricelli' ? sub('h', '0') : sub('h', '∞'), cls: '', unit: 'm' }
    ];
  }

  function opPoint(p) {
    var a = p.a > 0 ? p.a : 1;
    var q = p.qin0 > 0 ? p.qin0 : 0;
    var r = q / (a * SQ2G);
    return r * r;
  }

  function init(S) {
    S.hs = kit.sticky(1e-6, 1.3);    // capacidad visible del tanque (m)
    S.qs = kit.sticky(1e-9, 1);      // caudal de referencia para anchos de chorro (m³/s)
    S.phase = 0;
    S.fall = 0;
    S.qinMode = null;
    S.vals = { qin: 0, h: 0, qout: 0, heq: 0, h1: 0, h2: 0, q1: 0, q2: 0 };
  }

  function baseScales(S) {
    var p = S.params;
    var base;
    if (S.variant === 'cascada') base = Math.max(S.hint('h1'), S.hint('h2'));
    else base = S.hint('h');
    if (S.variant === 'torricelli') base = Math.max(base, opPoint(p) * 1.25);
    S.hs.reset(base);
    S.qs.reset(S.variant === 'torricelli' ? (p.qin0 || 0) : 0);
    S.qinMode = null;
  }

  /* ------------------------------------------------------------------ piezas */

  function pipe(parent, d) {
    el('path', { d: d, class: 'sc-pipe' }, parent);
    el('path', { d: d, class: 'sc-pipe-in' }, parent);
  }

  function valve(parent, x, y) {
    var g = el('g', { class: 'sc-valve-g' }, parent);
    kit.xform(g).translate(x, y);
    el('path', { d: 'M0 0V-12M-5 -12H5', class: 'sc-struct' }, g);
    el('path', { d: 'M-8 -6L8 6V-6L-8 6Z', class: 'sc-valve' }, g);
    return g;
  }

  /** Chorro vertical (entrada o caída entre tanques): rectángulo + estrías recortadas. */
  function stream(S, parent, defs, x, yTop, cls) {
    var id = DSL.util.uid('sc-clip');
    var cp = el('clipPath', { id: id, clipPathUnits: 'userSpaceOnUse' }, defs);
    var cr = el('rect', { x: x, y: yTop, width: 0, height: 0 }, cp);
    var rect = el('rect', { x: x, y: yTop, width: 0, height: 0, class: 'sc-stream sc-stream--' + cls }, parent);
    var outer = el('g', { 'clip-path': 'url(#' + id + ')' }, parent);
    var inner = el('g', null, outer);
    var span = S.h + STREAK * 2;
    var d = '';
    for (var y = 0; y < span; y += STREAK) d += 'M-2.5 ' + y + 'v7M2.5 ' + (y + STREAK / 2) + 'v7';
    el('path', { d: d, class: 'sc-streaks' }, inner);
    return {
      x: x,
      yTop: yTop,
      rx: kit.len(rect, 'x'),
      rw: kit.len(rect, 'width'),
      rh: kit.len(rect, 'height'),
      cx: kit.len(cr, 'x'),
      cw: kit.len(cr, 'width'),
      ch: kit.len(cr, 'height'),
      streaks: kit.xform(inner)
    };
  }

  function setStream(st, width, yBottom, fall) {
    var hgt = Math.max(0, yBottom - st.yTop);
    if (width < 0.5) hgt = 0;
    st.rx(st.x - width / 2);
    st.rw(width);
    st.rh(hgt);
    st.cx(st.x - width / 2);
    st.cw(width);
    st.ch(hgt);
    st.streaks.translate(st.x, st.yTop + (fall % STREAK) - STREAK);
  }

  /**
   * Tanque: paredes, fondo tenue, líquido (polígono vivo), superficie (polilínea viva), marcador de
   * nivel con símbolo, línea de equilibrio con símbolo. cfg: { x0, x1, yTop, yB, cls, sym, eqSym, impactX }.
   */
  function tank(S, parent, cfg) {
    var g = el('g', { class: 'sc-tank-g' }, parent);
    el('rect', { x: cfg.x0, y: cfg.yTop, width: cfg.x1 - cfg.x0, height: cfg.yB - cfg.yTop, class: 'sc-tank-back' }, g);
    var liquid = el('polygon', { class: 'sc-liquid sc-liquid--' + cfg.cls }, g);
    var surface = el('polyline', { class: 'sc-surface sc-surface--' + cfg.cls }, g);
    var eq = el('line', { x1: cfg.x0 + 2, x2: cfg.x1 - 2, y1: cfg.yB, y2: cfg.yB, class: 'sc-ref' }, g);
    // rótulo de la referencia sobre su línea, con placa del color del lienzo: legible sobre el agua
    // (contraste del texto sobre --c-plot-bg en ambos temas) y sobre el fondo vacío del tanque
    var tag = el('g', { class: 'sc-tag' }, g);
    var tagW = kit.textWidth(cfg.eqSym) + 2 * TAG_PADX;
    el('rect', { x: -TAG_PADX, y: -TAG_UP, width: kit.r2(tagW), height: TAG_UP + TAG_DOWN, rx: 4, class: 'sc-tag-bg' }, tag);
    kit.label(tag, cfg.eqSym, { x: 0, y: 0, cls: 'sc-text--in' });
    el('path', { d: 'M' + cfg.x0 + ' ' + (cfg.yTop - 4) + 'V' + cfg.yB + 'H' + cfg.x1 + 'V' + (cfg.yTop - 4), class: 'sc-tank' }, g);
    var marker = el('path', { d: 'M0 0L7 -4.5V4.5Z', class: 'sc-marker--' + cfg.cls }, g);
    var mLabel = kit.label(g, cfg.sym, { move: true, x: cfg.x1 + 12, y: cfg.yB, cls: 'sc-text--' + cfg.cls });
    var xL = cfg.x0 + 1.5;
    var xR = cfg.x1 - 1.5;
    var yIn = cfg.yB - 1.5;
    var xs = new Float64Array(NSURF + 1);
    var env = new Float64Array(NSURF + 1);
    var dist = new Float64Array(NSURF + 1);
    var sigma = Math.max(18, (xR - xL) * 0.18);
    for (var i = 0; i <= NSURF; i++) {
      var x = xL + (i / NSURF) * (xR - xL);
      xs[i] = x;
      var dd = cfg.impactX === null ? 1e9 : Math.abs(x - cfg.impactX);
      dist[i] = dd;
      env[i] = Math.exp(-(dd / sigma) * (dd / sigma));
    }
    var T = {
      x0: cfg.x0, x1: cfg.x1, xL: xL, xR: xR, yTop: cfg.yTop, yB: cfg.yB, yIn: yIn,
      full: Math.max(10, yIn - cfg.yTop - 6),
      lMax: typeof cfg.lMax === 'number' ? cfg.lMax : cfg.yB - 24,
      liquid: kit.points(liquid, NSURF + 3),
      surface: kit.points(surface, NSURF + 1),
      xs: xs, env: env, dist: dist,
      eqY1: kit.len(eq, 'y1'),
      eqY2: kit.len(eq, 'y2'),
      eqVis: kit.attr(eq, 'visibility'),
      eqTag: kit.xform(tag),
      eqTagVis: kit.attr(tag, 'visibility'),
      marker: kit.xform(marker),
      mLabel: mLabel
    };
    T.liquid.set(0, xL, yIn);
    T.liquid.set(1, xR, yIn);
    return T;
  }

  /** Nivel en px, ola neta y salpicadura (px), fase (rad). */
  function setTank(T, hpx, waveA, splashA, phase) {
    var yLevel = T.yIn - clamp(hpx, 0, T.full + 4);
    var k1 = (2 * Math.PI * 1.5) / (T.xR - T.xL);
    for (var i = 0; i <= NSURF; i++) {
      var y = yLevel;
      if (waveA > 0) y += waveA * Math.sin(k1 * (T.xs[i] - T.xL) * 1.0 - phase);
      if (splashA > 0) y += splashA * T.env[i] * Math.sin(0.33 * T.dist[i] - 2.2 * phase);
      if (hpx <= 0.5) y = T.yIn;
      y = clamp(y, T.yTop, T.yIn);
      T.surface.set(i, T.xs[i], y);
      T.liquid.set(NSURF + 2 - i, T.xs[i], y);
    }
    T.liquid.flush();
    T.surface.flush();
    T.marker.translate(T.x1 + 3, yLevel);
    var ly = clamp(yLevel + 4, T.yTop + 10, T.lMax);
    T.mLabel.xf.translate(T.x1 + 12, ly);
    return yLevel;
  }

  function setEq(T, hpx) {
    if (!(hpx > T.full * 0.015) || hpx > T.full + 6) {
      T.eqVis('hidden');
      T.eqTagVis('hidden');
      return;
    }
    var y = T.yIn - hpx;
    T.eqVis('visible');
    T.eqTagVis('visible');
    T.eqY1(y);
    T.eqY2(y);
    // placa centrada en la línea; junto al fondo o la boca del tanque se queda dentro de él
    var yc = clamp(y, T.yTop + TAG_UP - TAG_BASE + 1, T.yIn - TAG_DOWN - TAG_BASE - 1);
    T.eqTag.translate(T.xL + 5, yc + TAG_BASE);
  }

  /* ------------------------------------------------------------------ construcción */

  function build(S) {
    var w = S.w;
    var h = S.h;
    var root = S.root;
    var v = S.variant;
    var pad = clamp(w * 0.04, 12, 26);
    var E = S.E = {};
    var defs = el('defs', null, root);

    // franja de lecturas arriba a la derecha (el símbolo q_in de la tubería queda a la izquierda)
    // en lienzos estrechos dos columnas más justas antes que una columna alta
    var avail = w - 2 * pad - 64;
    var slot = Math.min(SLOT, Math.max(108, avail / 2));
    var sp = kit.strip(root, stripItems(v), { left: pad + 64, right: w - pad, top: pad, slot: slot });
    E.strip = sp.labels;
    E.stripKeys = Object.keys(sp.labels);
    var top = Math.max(pad + 18, sp.bottom - 12);
    var yFloor = h - pad - 10;
    var floorG = el('g', null, root);
    el('line', { x1: pad, y1: yFloor, x2: w - pad, y2: yFloor, class: 'sc-ground' }, floorG);
    kit.hatch(floorG, pad, yFloor, w - pad, yFloor, 1, 10);

    if (v === 'cascada') buildCascade(S, root, defs, pad, top, yFloor);
    else buildSingle(S, root, defs, pad, top, yFloor, v === 'torricelli');
  }

  function buildSingle(S, root, defs, pad, top, yFloor, tor) {
    var w = S.w;
    var h = S.h;
    var E = S.E;
    var yPipe = top + 16;
    var tankTop = yPipe + 24;
    var drop = tor ? clamp(h * 0.2, 36, 96) : clamp(h * 0.18, 44, 84);
    var tankB = yFloor - drop;
    if (tankB - tankTop < 70) {
      tankB = Math.min(yFloor - 34, tankTop + 70);
      drop = yFloor - tankB;
    }
    var th = tankB - tankTop;
    var tankX = pad + clamp(w * 0.1, 30, 110);
    var tw = clamp(w * 0.3, 96, 300);
    var outLen = clamp(w * 0.2, 80, 170);
    if (tor) {
      var yOr = tankB - 6;
      var xMax = 2 * Math.sqrt(0.8 * th * (yFloor - yOr));
      var room = w - pad - (tankX + tw) - 10;
      if (xMax > room) tw = Math.max(96, w - pad - 10 - tankX - xMax);
    } else {
      tw = Math.min(tw, Math.max(96, w - pad - 56 - outLen - tankX));
    }
    var x0 = Math.round(tankX);
    var x1 = Math.round(tankX + tw);
    var mouthX = x0 + 0.62 * (x1 - x0);

    // soporte del tanque
    var legs = el('g', null, root);
    el('path', { d: 'M' + (x0 + 10) + ' ' + tankB + 'V' + yFloor + 'M' + (x1 - 10) + ' ' + tankB + 'V' + yFloor, class: 'sc-struct' }, legs);

    // tubería de entrada y su chorro
    var g = el('g', null, root);
    pipe(g, 'M' + pad + ' ' + yPipe + 'H' + mouthX + 'V' + (yPipe + 12));
    kit.label(g, sub('q', 'in'), { x: pad + 2, y: yPipe - 10, cls: 'sc-text--in' });
    E.inStream = stream(S, g, defs, mouthX, yPipe + 12, 'in');

    E.tanks = [tank(S, root, {
      x0: x0, x1: x1, yTop: tankTop, yB: tankB, cls: 'out',
      sym: [{ sym: 'h' }], eqSym: tor ? sub('h', '0') : sub('h', '∞'), impactX: mouthX,
      lMax: tor ? tankB - 36 : undefined   // con Torricelli, «h» nunca pisa la etiqueta q_out del orificio
    })];

    if (tor) {
      // orificio y chorro parabólico de Torricelli: x = 2·√(h·H) al caer una altura H
      var yO = tankB - 6;
      var og = el('g', null, root);
      el('path', { d: 'M' + x1 + ' ' + (yO - 3.5) + 'h6M' + x1 + ' ' + (yO + 3.5) + 'h6', class: 'sc-struct' }, og);
      var jet = el('path', { d: 'M0 0Q0.5 0 1 1', class: 'sc-jet sc-jet--zero' }, og);
      var puddle = el('ellipse', { cx: 0, cy: 0, rx: 12, ry: 2.5, class: 'sc-puddle--zero' }, og);
      E.jet = { x: x1 + 6, y: yO, H: yFloor - 1.5 - yO, xf: kit.xform(jet), width: kit.attr(jet, 'stroke-width'), vis: kit.attr(og, 'opacity'), puddle: kit.xform(puddle), room: w - pad - x1 - 10 };
      E.jetVisEl = kit.attr(jet, 'visibility');
      E.puddleVis = kit.attr(puddle, 'visibility');
      kit.label(og, sub('q', 'out'), { x: x1 + 12, y: yO - 9, cls: 'sc-text--zero' });
      kit.label(root, [{ sym: 'a' }], { x: x1 - 2, y: tankB + 16, anchor: 'end' });
    } else {
      // salida por el fondo con válvula R y caída a un depósito
      var pipeY = tankB + 16;
      var xo = x0 + 0.8 * (x1 - x0);
      var xm = x1 + outLen;
      var xv = x1 + outLen * 0.42;
      var outG = el('g', null, root);
      pipe(outG, 'M' + xo + ' ' + (tankB - 1) + 'V' + pipeY + 'H' + xm + 'V' + (pipeY + 12));
      valve(outG, xv, pipeY);
      kit.label(outG, [{ sym: 'R' }], { x: xv, y: pipeY + 23, anchor: 'middle' });
      el('path', { d: 'M' + (xm - 18) + ' ' + (yFloor - 12) + 'V' + yFloor + 'H' + (xm + 18) + 'V' + (yFloor - 12), class: 'sc-basin' }, outG);
      E.outStream = stream(S, outG, defs, xm, pipeY + 12, 'zero');
      E.outBottom = yFloor - 2;
      kit.label(outG, sub('q', 'out'), { x: xm + 12, y: (pipeY + yFloor) / 2 + 4, cls: 'sc-text--zero' });
    }
  }

  function buildCascade(S, root, defs, pad, top, yFloor) {
    var w = S.w;
    var E = S.E;
    var yPipe = top + 16;
    var t1Top = yPipe + 24;
    var th = Math.max(56, (yFloor - 54 - t1Top - 16 - 26) / 2);
    var t1B = t1Top + th;
    var pipe1Y = t1B + 16;
    var t2Top = pipe1Y + 26;
    var t2B = t2Top + th;
    var tw = clamp(w * 0.22, 84, 220);
    var gap = clamp(w * 0.14, 64, 150);
    var outLen = clamp(w * 0.15, 64, 150);
    var t1x = pad + clamp(w * 0.08, 24, 90);
    // si no cabe, se estrechan los tanques
    var need = t1x + 2 * tw + gap + outLen + 44 - (w - pad);
    if (need > 0) {
      var tw0 = tw;
      tw = Math.max(64, tw - need / 2);
      need -= 2 * (tw0 - tw);
    }
    if (need > 0) {
      // aún no cabe: se acortan por igual el hueco entre tanques, la salida y el margen izquierdo
      var cut = Math.min(need / 3, 14);
      gap -= cut;
      outLen -= cut;
      t1x = Math.max(pad + 10, t1x - (need - 2 * cut));
    }
    var a0 = Math.round(t1x);
    var a1 = Math.round(t1x + tw);
    var b0 = Math.round(a1 + gap);
    var b1 = Math.round(b0 + tw);
    var mouth1 = a0 + 0.62 * tw;
    var mouth2 = b0 + 0.62 * tw;

    var legs = el('g', null, root);
    el('path', {
      d: 'M' + (a0 + 10) + ' ' + t1B + 'V' + yFloor + 'M' + (a1 - 10) + ' ' + t1B + 'V' + yFloor +
        'M' + (b0 + 10) + ' ' + t2B + 'V' + yFloor + 'M' + (b1 - 10) + ' ' + t2B + 'V' + yFloor,
      class: 'sc-struct'
    }, legs);

    var g = el('g', null, root);
    pipe(g, 'M' + pad + ' ' + yPipe + 'H' + mouth1 + 'V' + (yPipe + 12));
    kit.label(g, sub('q', 'in'), { x: pad + 2, y: yPipe - 10, cls: 'sc-text--in' });
    E.inStream = stream(S, g, defs, mouth1, yPipe + 12, 'in');

    // tanque 1 → válvula R₁ → cae al tanque 2
    var xo1 = a0 + 0.8 * tw;
    var g1 = el('g', null, root);
    pipe(g1, 'M' + xo1 + ' ' + (t1B - 1) + 'H' + xo1 + 'V' + pipe1Y + 'H' + mouth2 + 'V' + (pipe1Y + 12));
    var xv1 = (a1 + b0) / 2 + 4;
    valve(g1, xv1, pipe1Y);
    kit.label(g1, sub('R', '1'), { x: xv1, y: pipe1Y + 23, anchor: 'middle' });
    E.midStream = stream(S, g1, defs, mouth2, pipe1Y + 12, 'out');
    kit.label(g1, sub('q', '1'), { x: mouth2 + 12, y: pipe1Y + 22, cls: 'sc-text--out' });

    // tanque 2 → válvula R₂ → depósito
    var pipe2Y = t2B + 16;
    var xo2 = b0 + 0.8 * tw;
    var xm2 = b1 + outLen;
    var xv2 = b1 + outLen * 0.42;
    var g2 = el('g', null, root);
    pipe(g2, 'M' + xo2 + ' ' + (t2B - 1) + 'V' + pipe2Y + 'H' + xm2 + 'V' + (pipe2Y + 12));
    valve(g2, xv2, pipe2Y);
    kit.label(g2, sub('R', '2'), { x: xv2, y: pipe2Y + 23, anchor: 'middle' });
    el('path', { d: 'M' + (xm2 - 18) + ' ' + (yFloor - 12) + 'V' + yFloor + 'H' + (xm2 + 18) + 'V' + (yFloor - 12), class: 'sc-basin' }, g2);
    E.outStream = stream(S, g2, defs, xm2, pipe2Y + 12, 'zero');
    E.outBottom = yFloor - 2;
    kit.label(g2, sub('q', '2'), { x: xm2 + 12, y: (pipe2Y + 12 + yFloor) / 2 + 2, cls: 'sc-text--zero' });

    E.tanks = [
      tank(S, root, { x0: a0, x1: a1, yTop: t1Top, yB: t1B, cls: 'out', sym: sub('h', '1'), eqSym: sub('h', '1∞'), impactX: mouth1 }),
      tank(S, root, { x0: b0, x1: b1, yTop: t2Top, yB: t2B, cls: 'zero', sym: sub('h', '2'), eqSym: sub('h', '2∞'), impactX: mouth2 })
    ];
  }

  /* ------------------------------------------------------------------ caudal de entrada */

  /**
   * Caudal de entrada total. Lineal y cascada: u. Torricelli: u puede ser el caudal total o una
   * desviación sobre q_in0; la convención se deduce una vez con model.deriv (A·dh/dt + q_out).
   */
  function inflow(S, f, u, qout) {
    var o = f.outputs || {};
    if (typeof o.qin === 'number' && isFinite(o.qin)) return o.qin;
    if (S.variant !== 'torricelli') return u;
    var p = S.params;
    if (S.qinMode === 'u') return u;
    if (S.qinMode === 'dev') return (p.qin0 || 0) + u;
    var m = S.model;
    if (m && typeof m.deriv === 'function' && f.state && f.state.length) {
      var d = null;
      try { d = m.deriv(kit.finite(f.t, 0), f.state, u, p, S.variant); } catch (e) { d = null; }
      if (d && isFinite(d[0])) {
        var q = (p.A > 0 ? p.A : 1) * d[0] + qout;
        var tol = 1e-7 * Math.max(1, Math.abs(q));
        if (Math.abs(q - u) <= tol) S.qinMode = 'u';
        else if (Math.abs(q - ((p.qin0 || 0) + u)) <= tol) S.qinMode = 'dev';
        return q;
      }
    }
    return u;
  }

  /* ------------------------------------------------------------------ render */

  function render(S, f) {
    var o = f.outputs || {};
    var st = f.state || [];
    var p = S.params;
    var u = f.input ? kit.finite(f.input.value, 0) : 0;
    var V = S.vals;
    var cas = S.variant === 'cascada';
    var tor = S.variant === 'torricelli';

    if (cas) {
      V.h1 = Math.max(0, pick(o.h1, st[0], 0));
      V.h2 = Math.max(0, pick(o.h2, st[1], 0));
      V.qin = u;
      V.q1 = p.R1 > 0 ? V.h1 / p.R1 : 0;
      V.q2 = p.R2 > 0 ? V.h2 / p.R2 : 0;
      V.qout = V.q2;
    } else {
      V.h = Math.max(0, pick(o.h, st[0], 0));
      if (tor) V.qout = pick(o.qout, null, (p.a > 0 ? p.a : 0) * SQ2G * Math.sqrt(V.h));
      else V.qout = pick(o.qout, null, p.R > 0 ? V.h / p.R : 0);
      V.qin = inflow(S, f, u, V.qout);
      if (tor) {
        V.heq = opPoint(p);
      } else {
        V.heq = (p.R > 0 ? p.R : 0) * V.qin;
      }
    }

    // escalas pegajosas (capacidad visible y caudal de referencia)
    var grow = false;
    if (cas) {
      grow = S.hs.observe(Math.max(V.h1, V.h2, (p.R1 || 0) * V.qin, (p.R2 || 0) * V.qin)) || grow;
    } else {
      var hCur = tor && p.a > 0 ? Math.pow(Math.max(0, V.qin) / (p.a * SQ2G), 2) : 0;
      grow = S.hs.observe(Math.max(V.h, V.heq, hCur)) || grow;
    }
    if (grow) {
      S.invalidate();
      return;
    }
    S.qs.observe(Math.max(Math.abs(V.qin), V.qout, cas ? V.q1 : 0));

    var E = S.E;
    var qRef = S.qs.value;
    var cap = S.hs.value;
    S.phase += S.dt * WAVE;
    S.fall += S.dt * FALL;
    if (S.phase > 1e4) S.phase -= 2 * Math.PI * 1000;
    if (S.fall > 1e5) S.fall %= STREAK;
    var calm = S.reduced();

    function width(q) {
      var r = q / qRef;
      return r > 0.004 ? 2 + 10 * clamp(r, 0, 1) : 0;
    }

    var T1 = E.tanks[0];
    var px1 = T1.full / cap;
    if (cas) {
      var T2 = E.tanks[1];
      var px2 = T2.full / cap;
      var net1 = V.qin - V.q1;
      var net2 = V.q1 - V.q2;
      var y1 = setTank(T1, V.h1 * px1, calm ? 0 : 2.6 * clamp(Math.abs(net1) / qRef, 0, 1), calm ? 0 : 2 * clamp(V.qin / qRef, 0, 1), S.phase);
      var y2 = setTank(T2, V.h2 * px2, calm ? 0 : 2.6 * clamp(Math.abs(net2) / qRef, 0, 1), calm ? 0 : 2 * clamp(V.q1 / qRef, 0, 1), S.phase + 1.3);
      setEq(T1, (p.R1 || 0) * V.qin * px1);
      setEq(T2, (p.R2 || 0) * V.qin * px2);
      setStream(E.inStream, width(V.qin), y1, S.fall);
      setStream(E.midStream, width(V.q1), y2, S.fall);
      setStream(E.outStream, width(V.q2), E.outBottom, S.fall);
    } else {
      var net = V.qin - V.qout;
      var yl = setTank(T1, V.h * px1, calm ? 0 : 2.6 * clamp(Math.abs(net) / qRef, 0, 1), calm ? 0 : 2 * clamp(V.qin / qRef, 0, 1), S.phase);
      setEq(T1, V.heq * px1);
      setStream(E.inStream, width(V.qin), yl, S.fall);
      if (tor) {
        var J = E.jet;
        var hpx = V.h * px1;
        var X = Math.min(2 * Math.sqrt(Math.max(0, hpx) * J.H), J.room);
        var jw = V.qout / qRef;
        if (jw < 0.004 || X < 1) {
          E.jetVisEl('hidden');
          E.puddleVis('hidden');
        } else {
          E.jetVisEl('visible');
          E.puddleVis('visible');
          J.xf.scale(J.x, J.y, X, J.H);
          J.width(kit.r2(1.5 + 4.5 * clamp(jw, 0, 1)));
          J.puddle.scale(J.x + X, J.y + J.H + 1, 0.5 + 0.7 * clamp(jw, 0, 1), 1);
        }
      } else {
        setStream(E.outStream, width(V.qout), E.outBottom, S.fall);
      }
    }

    if (S.textDue) {
      var keys = E.stripKeys;
      for (var i = 0; i < keys.length; i++) {
        var lb = E.strip[keys[i]];
        lb.set(kit.fmtRef(V[keys[i]], lb.unit, lb.unit === 'm' ? cap : qRef));
      }
    }
  }

  function trend(net, ref) {
    if (net > ref * 0.01) return 'subiendo';
    if (net < -ref * 0.01) return 'bajando';
    return 'estable';
  }

  function summary(S, f) {
    var V = S.vals;
    var tt = 't = ' + kit.fmt(kit.finite(f.t, 0), 's', 3) + '. ';
    var ref = S.qs.value || 1;
    if (S.variant === 'cascada') {
      return tt + 'Tanque 1: nivel h₁ = ' + kit.fmt(V.h1, 'm', 3) + ' (' + trend(V.qin - V.q1, ref) + '). Tanque 2: nivel h₂ = ' +
        kit.fmt(V.h2, 'm', 3) + ' (' + trend(V.q1 - V.q2, ref) + '). Entra q_in = ' + kit.fmt(V.qin, 'm³/s', 3) +
        ', pasa q₁ = ' + kit.fmt(V.q1, 'm³/s', 3) + ' y sale q₂ = ' + kit.fmt(V.q2, 'm³/s', 3) + '.';
    }
    var eqName = S.variant === 'torricelli' ? 'punto de operación h₀ = ' : 'equilibrio h∞ = ';
    return tt + 'Nivel h = ' + kit.fmt(V.h, 'm', 3) + ' (' + trend(V.qin - V.qout, ref) + '); ' + eqName + kit.fmt(V.heq, 'm', 3) +
      '. Entra q_in = ' + kit.fmt(V.qin, 'm³/s', 3) + ' y sale q_out = ' + kit.fmt(V.qout, 'm³/s', 3) + '.';
  }

  var NAMES = {
    lineal: 'Escena de un tanque con descarga lineal',
    torricelli: 'Escena de un tanque con descarga de Torricelli',
    cascada: 'Escena de dos tanques en cascada'
  };

  scenes.register('tanks', function (container, opts) {
    var variant = opts.variant || 'lineal';
    var def = {
      id: 'tanks',
      cls: 'tanks',
      name: NAMES[variant] || NAMES.lineal,
      variant: variant,
      init: function (S) {
        init(S);
        def.name = NAMES[S.variant] || NAMES.lineal;
      },
      onParams: baseScales,
      onReset: baseScales,
      build: build,
      render: render,
      summary: summary
    };
    return kit.mount(container, opts, def);
  });
})(window.DSL);
