/*
 * js/sections/hero.js — Propietario: hero-concepts.
 * Sección #inicio → DSL.sections.hero = { mount(el) → handle, helpers }.
 * Titular, entrada, dos llamadas a la acción y un fondo vivo en canvas: un par de polos conjugados
 * recorre el plano s del fondo de la página (mismos ejes y reglado que body::before) y, debajo, se
 * dibuja la respuesta al escalón que producen. Bajo coste: 30 fotogramas por segundo como máximo,
 * se pausa fuera de pantalla y con la pestaña oculta, y con movimiento reducido es un fotograma fijo.
 * API: docs/api/hero-concepts.md.
 */
(function (DSL) {
  'use strict';

  var util = DSL.util;
  var h = util.h;

  /* ------------------------------------------------------------------ constantes del fondo vivo */
  var PERIOD = 32;            // s: un ciclo completo del recorrido de los polos
  var TRAIL = 6;              // s de estela detrás de cada polo
  var TRAIL_DT = 0.08;        // s entre muestras de la estela
  var T_START = 5.18;         // s: fase inicial (ζ ≈ 0.30); también el fotograma fijo con movimiento reducido
  var FRAME = 1 / 30;         // s: como mucho 30 dibujos por segundo
  var GRID = 160;             // px: reglado mayor del plano s del fondo (css/base.css)
  var T_WIN = 14;             // s: ventana de la respuesta (ωn ≈ 1 rad/s)
  var Y_TOP = 1.8;            // tope del eje y de la respuesta
  var N_RESP = 160;           // muestras por curva
  var GHOSTS = [1.5, 3, 4.5]; // s: respuestas anteriores que quedan como estela
  var R_MIN = 64;
  var R_MAX = 160;
  var PAD = 30;               // margen para las etiquetas de los ejes
  var GAP = 40;               // separación entre el plano s y la respuesta (modo horizontal)
  var LABEL_H = 26;           // franja para la lectura de ζ y ωn bajo el plano s
  var RESP_MIN = 130;
  var RESP_MAX = 230;
  var NOTE_GAP = 18;          // px entre el dibujo y la leyenda

  /* ------------------------------------------------------------------ matemáticas puras */

  /** Par de polos en el instante `time`: ζ entre 0.12 y 0.88 y ωn alrededor de 1 rad/s. */
  function pole(time) {
    var ph = 2 * Math.PI * time / PERIOD;
    var zeta = 0.5 - 0.38 * Math.cos(ph);
    var wn = 1 + 0.12 * Math.sin(2 * ph);
    return { zeta: zeta, wn: wn, re: -zeta * wn, im: wn * Math.sqrt(Math.max(0, 1 - zeta * zeta)) };
  }

  /** Respuesta al escalón unitario de ωn²/(s² + 2ζωn s + ωn²) (forma cerrada; t < 0 da 0). */
  function stepResponse(zeta, wn, t) {
    if (!(t > 0)) return 0;
    if (zeta < 1) {
      var r = Math.sqrt(1 - zeta * zeta);
      var wd = wn * r;
      return 1 - Math.exp(-zeta * wn * t) * (Math.cos(wd * t) + (zeta / r) * Math.sin(wd * t));
    }
    if (zeta === 1) return 1 - Math.exp(-wn * t) * (1 + wn * t);
    var s = Math.sqrt(zeta * zeta - 1);
    var p1 = -wn * (zeta - s);
    var p2 = -wn * (zeta + s);
    return 1 + (p2 * Math.exp(p1 * t) - p1 * Math.exp(p2 * t)) / (p1 - p2);
  }

  /**
   * Valor de pref + k·step (k entero) dentro de [lo, hi] más cercano a pref; null si no hay ninguno.
   * Así el origen del dibujo cae sobre una intersección del reglado mayor del fondo.
   */
  function snapAxis(pref, lo, hi, step) {
    if (!(hi >= lo) || !isFinite(pref)) return null;
    var kLo = Math.ceil((lo - pref) / step - 1e-9);
    var kHi = Math.floor((hi - pref) / step + 1e-9);
    if (kLo > kHi) return null;
    var k = kLo > 0 ? kLo : kHi < 0 ? kHi : 0;
    return pref + k * step;
  }

  /**
   * Coloca el plano s y la respuesta dentro de la zona `slot` (px del canvas).
   * o: { slot: { x, y, w, h }, plane: { x, y }, grid = 160, rMax = 160, rMin = 64 }.
   * Devuelve { ox, oy, R, mode: 'vertical'|'horizontal', aligned: { x, y }, resp: { x, y, w, h },
   *            label: { x, y }, bottom, bbox }.
   * Busca el radio mayor (múltiplo de 32 px) con el que el origen coincide con el del fondo; si no
   * hay ninguno, el mayor que cabe, con el origen en otra intersección del reglado mayor.
   */
  function layoutFigure(o) {
    var s = o.slot;
    var grid = o.grid || GRID;
    var rMax = o.rMax || R_MAX;
    var rMin = o.rMin || R_MIN;
    var plane = o.plane || { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    var horizontal = s.w >= 1.35 * s.h;

    function place(R, force) {
      var xLo = s.x + R + 30;
      var xHi = horizontal ? s.x + s.w * 0.5 - GAP : s.x + s.w - 30;
      var yLo = s.y + R + PAD;
      var yHi = horizontal ? s.y + s.h - R - PAD - LABEL_H : s.y + s.h - (R + PAD + LABEL_H + RESP_MIN);
      if (!force && (xHi < xLo || yHi < yLo)) return null;
      var ox = snapAxis(plane.x, xLo, xHi, grid);
      var oy = snapAxis(plane.y, yLo, yHi, grid);
      var aligned = { x: ox !== null && Math.abs(ox - plane.x) < 0.5, y: oy !== null && Math.abs(oy - plane.y) < 0.5 };
      // el eje real del fondo cruza toda la página: alinear en y pesa más que en x
      var score = (aligned.y ? 8 : 0) + (aligned.x ? 4 : 0) + (oy !== null ? 2 : 0) + (ox !== null ? 1 : 0);
      if (ox === null) ox = xHi >= xLo ? (xLo + xHi) / 2 : xLo;
      if (oy === null) oy = yLo;
      return { R: R, ox: ox, oy: oy, aligned: aligned, score: score };
    }

    var best = null;
    for (var r = rMax; r >= rMin; r -= 32) {
      var c = place(r, false);
      if (c && (!best || c.score > best.score)) best = c;
    }
    if (!best) best = place(rMin, true);

    var R = best.R;
    var ox = best.ox;
    var oy = best.oy;
    var label = { x: ox - R - 28, y: oy + R + PAD + 2 };
    var resp;
    if (horizontal) {
      var rx = ox + 30 + GAP;
      resp = { x: rx, y: oy - R, w: Math.max(80, s.x + s.w - rx), h: 2 * R };
    } else {
      var ry = oy + R + PAD + LABEL_H;
      resp = { x: s.x, y: ry, w: s.w, h: Math.max(80, Math.min(RESP_MAX, s.y + s.h - ry)) };
    }
    var bottom = Math.max(resp.y + resp.h, oy + R + PAD + LABEL_H);
    var x0 = Math.min(ox - R - 30, label.x, resp.x) - 8;
    var y0 = Math.min(oy - R - PAD, resp.y) - 8;
    var x1 = Math.max(ox + 30, resp.x + resp.w) + 8;
    var y1 = bottom + 8;
    return {
      ox: ox, oy: oy, R: R, mode: horizontal ? 'horizontal' : 'vertical', aligned: best.aligned,
      resp: resp, label: label, bottom: bottom,
      bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    };
  }

  /** Longitud CSS ('64vw', '30svh', '12px', '50%') en px de la ventana; NaN si no se entiende. */
  function parseLen(str, vw, vh, axis) {
    var m = /^\s*(-?\d*\.?\d+)(vw|svh|lvh|dvh|vh|px|%)?\s*$/.exec(String(str || ''));
    if (!m) return NaN;
    var v = parseFloat(m[1]);
    switch (m[2]) {
      case 'vw': return v * vw / 100;
      case 'svh': case 'lvh': case 'dvh': case 'vh': return v * vh / 100;
      case '%': return v * (axis === 'x' ? vw : vh) / 100;
      default: return v;
    }
  }

  /** Origen del plano s del fondo (body::before, variables --plane-x / --plane-y) en px de la ventana. */
  function readPlane(win) {
    var vw = win.innerWidth || 0;
    var vh = win.innerHeight || 0;
    var x = NaN;
    var y = NaN;
    try {
      var cs = win.getComputedStyle(win.document.body, '::before');
      x = parseLen(cs.getPropertyValue('--plane-x'), vw, vh, 'x');
      y = parseLen(cs.getPropertyValue('--plane-y'), vw, vh, 'y');
    } catch (e) { /* sin estilos calculados: valores de css/base.css */ }
    if (!isFinite(x)) x = (vw < 768 ? 0.70 : 0.64) * vw;
    if (!isFinite(y)) y = (vw < 768 ? 0.22 : 0.30) * vh;
    return { x: x, y: y };
  }

  /* ------------------------------------------------------------------ montaje */

  function icon(name) {
    return DSL.ui && typeof DSL.ui.icon === 'function' ? DSL.ui.icon(name, { size: 18 }) : null;
  }

  function mount(el) {
    var doc = el.ownerDocument || document;
    var win = doc.defaultView || window;

    var canvas = h('canvas', { class: 'hero-canvas', 'aria-hidden': 'true', 'data-testid': 'hero-canvas' });
    var gs = h('span', { class: 'ds-math', 'data-tex': 'G(s)', translate: 'no' }, 'G(s)');
    var title = h('h1', { id: 'inicio-title', class: 'hero-title' }, 'Sistemas que cambian con el tiempo');
    var lead = h('p', { class: 'hero-lead', 'data-testid': 'hero-lead' },
      'Modele sistemas mecánicos, hidráulicos, eléctricos, biológicos y económicos, simúlelos en vivo y obtenga su función de transferencia ',
      gs, ' con el procedimiento completo.');
    var actions = h('div', { class: 'hero-actions' },
      h('a', { class: 'ds-btn ds-btn--primary hero-cta', href: '#galeria', 'data-testid': 'hero-cta-galeria' }, 'Simular un sistema'),
      h('a', { class: 'ds-btn hero-cta', href: '#transferencia', 'data-testid': 'hero-cta-transferencia' },
        h('span', null, 'Obtener ', h('span', { translate: 'no' }, 'G(s)'), ' paso a paso')));
    var copy = h('div', { class: 'hero-copy' }, title, lead, actions);

    var pauseBtn = h('button', {
      type: 'button',
      class: 'ds-btn ds-btn--ghost ds-btn--icon ds-btn--sm hero-pause',
      'data-testid': 'hero-pause'
    });
    var caption = h('p', { class: 'hero-caption', 'data-testid': 'hero-caption' },
      'Al fondo, un par de polos conjugados recorre el plano ',
      h('span', { class: 'ds-sym', translate: 'no' }, 's'),
      ' y la curva muestra su respuesta al escalón: cuanto más a la izquierda están los polos, antes se apaga la oscilación.');
    var note = h('div', { class: 'hero-note' }, pauseBtn, caption);
    var stage = h('div', { class: 'hero-stage', 'data-testid': 'hero-stage' }, note);
    var inner = h('div', { class: 'hero-inner' }, copy, stage);
    var root = h('div', { class: 'hero', 'data-testid': 'hero' }, canvas, inner);
    el.appendChild(root);

    if (DSL.core.latex && typeof DSL.core.latex.renderInto === 'function') DSL.core.latex.renderInto(lead);

    var state = {
      time: T_START,
      acc: 0,
      userPaused: false,
      frames: 0,
      draws: 0,
      drawMs: 0,
      ctx: null,
      w: 0,
      h: 0,
      layout: null,
      colors: null,
      zetaText: ''
    };

    function readColors() {
      var c = function (n, fb) { return util.cssVar(n) || fb; };
      state.colors = {
        pole: c('--c-pole', 'GrayText'),
        out: c('--c-out', 'GrayText'),
        input: c('--c-in', 'GrayText'),
        axis: c('--c-axis', 'GrayText'),
        grid: c('--c-grid', 'GrayText'),
        muted: c('--muted', 'GrayText'),
        ink: c('--ink', 'CanvasText'),
        font: (c('--font-body', 'sans-serif'))
      };
    }

    function reduced() { return !!DSL.prefs.reducedMotion; }

    /* ---------------- dibujo */

    function seg(ctx, x0, y0, x1, y1) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    function cross(ctx, x, y, r) {
      ctx.beginPath();
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
      ctx.stroke();
    }

    function drawPlane(ctx, L, C, time) {
      var ox = L.ox;
      var oy = L.oy;
      var R = L.R;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // ejes locales (coinciden con los del fondo cuando el origen está alineado)
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = C.axis;
      seg(ctx, ox, oy - R - 20, ox, oy + R + 20);
      seg(ctx, ox - R - 28, oy, ox + 22, oy);
      ctx.fillStyle = C.muted;
      ctx.font = 'italic 15px KaTeX_Math, serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('jω', ox + 7, oy - R - 16);
      ctx.fillText('σ', ox + 26, oy);
      // circunferencia ωn = 1 (semiplano izquierdo)
      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = C.axis;
      ctx.beginPath();
      ctx.arc(ox, oy, R, Math.PI / 2, 1.5 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);

      // estelas: el camino de los últimos TRAIL s, más tenue cuanto más antiguo
      var chunks = 8;
      var per = TRAIL / chunks;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = C.pole;
      for (var g = 0; g < chunks; g++) {
        var ta = time - TRAIL + g * per;
        var tb = ta + per;
        ctx.globalAlpha = 0.05 + 0.32 * (g + 1) / chunks;
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          ctx.beginPath();
          for (var tt = ta, first = true; tt <= tb + 1e-9; tt += TRAIL_DT, first = false) {
            var q = pole(tt);
            var px = ox + q.re * R;
            var py = oy - sgn * q.im * R;
            if (first) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      var p = pole(time);
      var x = ox + p.re * R;
      var yu = oy - p.im * R;
      var yl = oy + p.im * R;
      // rectas de amortiguamiento constante (origen → polo)
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = C.input;
      ctx.globalAlpha = 0.45;
      seg(ctx, ox, oy, x, yu);
      seg(ctx, ox, oy, x, yl);
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      // polos ×
      ctx.lineWidth = 2.25;
      ctx.strokeStyle = C.pole;
      cross(ctx, x, yu, 6);
      cross(ctx, x, yl, 6);
      // lectura de ζ y ωn bajo el plano s (posición fija: no salta con el polo)
      ctx.fillStyle = C.muted;
      ctx.font = '13px ' + C.font;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      var label = 'ζ = ' + util.formatNumber(p.zeta, 2, { decimals: 2 }) + '    ωn = ' +
        util.formatNumber(p.wn, 3, { decimals: 2 }) + ' rad/s';
      state.zetaText = label;
      ctx.fillText(label, L.label.x, L.label.y);
    }

    function curve(ctx, P, zeta, wn) {
      ctx.beginPath();
      for (var i = 0; i <= N_RESP; i++) {
        var t = T_WIN * i / N_RESP;
        var v = stepResponse(zeta, wn, t);
        if (v > Y_TOP) v = Y_TOP;
        var px = P.x0 + (P.x1 - P.x0) * i / N_RESP;
        var py = P.y1 - (P.y1 - P.y0) * v / Y_TOP;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    function drawResponse(ctx, L, C, time) {
      var r = L.resp;
      var P = { x0: r.x + 26, x1: r.x + r.w - 10, y0: r.y + 20, y1: r.y + r.h - 22 };
      if (P.x1 - P.x0 < 40 || P.y1 - P.y0 < 30) return;
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = C.axis;
      seg(ctx, P.x0, P.y1, P.x1, P.y1);
      seg(ctx, P.x0, P.y1, P.x0, P.y0 - 6);
      ctx.fillStyle = C.muted;
      ctx.font = 'italic 15px KaTeX_Math, serif';
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left';
      ctx.fillText('y(t)', P.x0 + 6, P.y0 - 2);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      ctx.fillText('t', P.x1, P.y1 + 5);
      // valor final y∞ = 1
      var y1 = P.y1 - (P.y1 - P.y0) / Y_TOP;
      ctx.font = '13px ' + C.font;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('1', P.x0 - 7, y1);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = C.input;
      ctx.lineWidth = 1.25;
      seg(ctx, P.x0, y1, P.x1, y1);

      var p = pole(time);
      // envolvente 1 ± e^{−σt}/√(1−ζ²): la parte real del polo fija lo rápido que se apaga
      var k = 1 / Math.sqrt(1 - p.zeta * p.zeta);
      ctx.strokeStyle = C.pole;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      for (var sg = -1; sg <= 1; sg += 2) {
        ctx.beginPath();
        var started = false;
        for (var i = 0; i <= 70; i++) {
          var t = T_WIN * i / 70;
          var v = 1 + sg * k * Math.exp(-p.zeta * p.wn * t);
          if (v > Y_TOP || v < 0) { started = false; continue; }
          var px = P.x0 + (P.x1 - P.x0) * i / 70;
          var py = P.y1 - (P.y1 - P.y0) * v / Y_TOP;
          if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // respuestas anteriores (estela) y la actual
      ctx.strokeStyle = C.out;
      ctx.lineWidth = 1.5;
      for (var g = GHOSTS.length - 1; g >= 0; g--) {
        var q = pole(time - GHOSTS[g]);
        ctx.globalAlpha = 0.28 - 0.07 * g;
        curve(ctx, P, q.zeta, q.wn);
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      curve(ctx, P, p.zeta, p.wn);
    }

    function draw() {
      var ctx = state.ctx;
      var L = state.layout;
      if (!ctx || !L || !state.colors) return;
      var t0 = util.now();
      var b = L.bbox;
      ctx.clearRect(Math.max(0, b.x), Math.max(0, b.y), Math.min(state.w, b.w), Math.min(state.h, b.h));
      drawPlane(ctx, L, state.colors, state.time);
      drawResponse(ctx, L, state.colors, state.time);
      state.draws += 1;
      state.drawMs += util.now() - t0;
    }

    /* ---------------- tamaño y disposición (lecturas de layout fuera del bucle) */

    function measure() {
      var cr = canvas.getBoundingClientRect();
      var sr = stage.getBoundingClientRect();
      if (!(cr.width > 0 && cr.height > 0)) return;
      var fit = util.fitCanvas(canvas, { width: cr.width, height: cr.height });
      state.ctx = fit.ctx;
      state.w = cr.width;
      state.h = cr.height;
      var noteH = note.getBoundingClientRect().height;
      var plane = readPlane(win);
      var top0 = cr.top + (win.scrollY || 0);
      var left0 = cr.left + (win.scrollX || 0);
      var slot = { x: sr.left - cr.left, y: sr.top - cr.top, w: sr.width, h: Math.max(160, sr.height - noteH - NOTE_GAP) };
      var L = layoutFigure({ slot: slot, plane: { x: plane.x - left0, y: plane.y - top0 }, grid: GRID });
      state.layout = L;
      // la leyenda queda justo debajo del dibujo
      var noteTop = Math.round(Math.min(L.bottom + NOTE_GAP, slot.y + sr.height - noteH) - slot.y);
      stage.style.setProperty('--hero-note-top', Math.max(0, noteTop) + 'px');
      note.setAttribute('data-placed', '');
      draw();
    }

    /* ---------------- bucle y estado de reproducción */

    var lp = util.loop(function (dt) {
      state.frames += 1;
      state.time += dt;
      state.acc += dt;
      if (state.acc + 1e-4 >= FRAME) {
        state.acc = 0;
        draw();
      }
    }, { element: root });

    function paintPause() {
      var playing = !state.userPaused;
      var label = playing ? 'Pausar la animación del fondo' : 'Reproducir la animación del fondo';
      pauseBtn.setAttribute('aria-label', label);
      pauseBtn.setAttribute('data-tip', label);
      pauseBtn.setAttribute('data-state', playing ? 'playing' : 'paused');
      pauseBtn.hidden = reduced();
      pauseBtn.textContent = '';
      var ic = icon(playing ? 'pause' : 'play');
      if (ic) pauseBtn.appendChild(ic);
      if (DSL.ui && DSL.ui.tooltips && typeof DSL.ui.tooltips.refresh === 'function') DSL.ui.tooltips.refresh(pauseBtn);
    }

    function sync() {
      if (reduced()) {
        lp.stop();
        state.time = T_START;
        draw();
      } else if (state.userPaused) {
        lp.stop();
        draw();
      } else {
        lp.start();
      }
      paintPause();
    }

    function onPause() {
      state.userPaused = !state.userPaused;
      sync();
    }
    pauseBtn.addEventListener('click', onPause);

    readColors();
    var stopSize = util.observeSize(root, measure);
    var offs = [
      DSL.bus.on('theme:change', function () { readColors(); draw(); }),
      DSL.bus.on('motion:change', sync)
    ];
    // las etiquetas usan KaTeX_Math: se redibuja cuando la fuente está lista
    if (doc.fonts && typeof doc.fonts.load === 'function') {
      doc.fonts.load('italic 15px KaTeX_Math').then(function () { if (state.ctx) draw(); }, function () {});
    }
    sync();

    var alive = true;
    return {
      destroy: function () {
        if (!alive) return;
        alive = false;
        lp.destroy();
        stopSize();
        offs.forEach(function (off) { off(); });
        pauseBtn.removeEventListener('click', onPause);
        root.remove();
      },
      /** Pausa / reanuda la animación (como el botón). */
      pause: function () { if (!state.userPaused) onPause(); },
      play: function () { if (state.userPaused) onPause(); },
      isRunning: function () { return lp.isRunning(); },
      isActive: function () { return lp.isActive(); },
      /** Fija el instante de la animación (s) y redibuja: útil para capturas deterministas. */
      setTime: function (t) { state.time = Number(t) || 0; state.acc = 0; draw(); },
      stats: function () {
        var p = pole(state.time);
        return {
          frames: state.frames,
          draws: state.draws,
          avgDrawMs: state.draws ? state.drawMs / state.draws : 0,
          time: state.time,
          zeta: p.zeta,
          wn: p.wn,
          zetaText: state.zetaText,
          running: lp.isRunning(),
          active: lp.isActive(),
          userPaused: state.userPaused,
          layout: state.layout ? JSON.parse(JSON.stringify(state.layout)) : null
        };
      }
    };
  }

  DSL.sections.hero = {
    mount: mount,
    helpers: {
      pole: pole,
      stepResponse: stepResponse,
      snapAxis: snapAxis,
      layoutFigure: layoutFigure,
      parseLen: parseLen,
      constants: { PERIOD: PERIOD, TRAIL: TRAIL, T_START: T_START, GRID: GRID, T_WIN: T_WIN }
    }
  };
})(window.DSL);
