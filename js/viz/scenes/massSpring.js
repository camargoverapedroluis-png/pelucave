/*
 * js/viz/scenes/massSpring.js — Propietario: scenes.
 * Escena «massSpring»: pared, resorte en zigzag estirado por x, amortiguador (cilindro y pistón),
 * bloque sobre ruedas, regla de desplazamiento con la flecha x, flecha de fuerza F(t) y velocidad v.
 * Vista pura: el estado llega en render(frame). API: docs/api/scenes.md.
 */
(function (DSL) {
  'use strict';

  var scenes = DSL.viz.scenes;
  var kit = scenes.kit;
  var el = kit.el;
  var clamp = DSL.util.clamp;

  var TRAVEL = 0.28;   // recorrido máximo del bloque / longitud de reposo del resorte
  var COILS = 7;       // dientes del zigzag
  var ROD = 0.66;      // vástago del amortiguador (fracción de la longitud de reposo)
  var CYL_END = 0.65;  // extremo abierto del cilindro (fracción de la longitud de reposo)

  function pick(a, b, fallback) {
    if (typeof a === 'number' && isFinite(a)) return a;
    if (typeof b === 'number' && isFinite(b)) return b;
    return fallback;
  }

  function init(S) {
    S.xs = kit.sticky(1e-6, 1.25);   // |x| máximo representado (m)
    S.fs = kit.sticky(1e-9, 1);      // |F| de referencia (N)
    S.vs = kit.sticky(1e-9, 1.1);    // |v| de referencia (m/s)
  }

  function baseScales(S) {
    S.xs.reset(S.hint('x'));
    S.vs.reset(S.hint('v'));
    S.fs.reset(0);
  }

  function build(S) {
    var w = S.w;
    var h = S.h;
    var root = S.root;
    var pad = clamp(w * 0.04, 12, 28);
    var bh = Math.round(clamp(Math.min(h * 0.32, w * 0.17, h - 2 * pad - 116), 40, 110));
    var bw = Math.round(bh * 1.18);
    var wheelR = clamp(Math.round(bh * 0.075), 4, 7);
    var total = 34 + bh + 2 * wheelR + 1 + 26 + 42;
    var top = Math.max(pad * 0.5, (h - total) / 2);
    var blockTop = Math.round(top + 34);
    var blockBottom = blockTop + bh;
    var yFloor = blockBottom + 2 * wheelR + 1;
    var yRuler = yFloor + 26;
    var xWall = Math.round(pad + 12);
    var rightSpace = clamp(w * 0.16, 78, 150);
    var A = Math.max(60, (w - pad - rightSpace) - xWall - bw);
    var L = A / (1 + TRAVEL);
    var travel = TRAVEL * L;
    var xEq = xWall + L;
    var yS = blockTop + bh * 0.3;
    var yD = blockTop + bh * 0.72;
    var amp = clamp(bh * 0.15, 6, 12);
    var lead = clamp(L * 0.06, 6, 14);
    var dh = clamp(bh * 0.26, 12, 22);
    var cyl0 = xWall + 6;
    var cyl1 = xWall + CYL_END * L;
    var yMid = blockTop + bh / 2;
    var arrowMax = rightSpace - 14;

    var Lo = S.L = {
      bw: bw, bh: bh, blockTop: blockTop, xWall: xWall, xEq: xEq, travel: travel, L: L,
      yS: yS, yD: yD, amp: amp, lead: lead, yRuler: yRuler, yMid: yMid, wheelR: wheelR, arrowMax: arrowMax
    };
    var E = S.E = {};

    // suelo y pared con rayado
    var ground = el('g', { class: 'sc-ground-g' }, root);
    el('line', { x1: xWall, y1: yFloor, x2: w - pad, y2: yFloor, class: 'sc-ground' }, ground);
    kit.hatch(ground, xWall, yFloor, w - pad, yFloor, 1, 10);
    el('line', { x1: xWall, y1: blockTop - 18, x2: xWall, y2: yFloor, class: 'sc-ground' }, ground);
    kit.hatch(ground, xWall, blockTop - 18, xWall, yFloor, 1, 10);

    // regla de desplazamiento (m)
    var ruler = el('g', { class: 'sc-ruler' }, root);
    el('line', { x1: xEq - travel, y1: yRuler, x2: xEq + travel, y2: yRuler, class: 'sc-axis' }, ruler);
    var xMax = S.xs.value;
    var perSide = clamp(Math.floor(travel / 42), 1, 4);
    var step = kit.niceStep(xMax, perSide);
    var tv = kit.ticks(-xMax, xMax, step);
    var tickPath = '';
    tv.forEach(function (v) {
      var x = kit.r2(xEq + (v / xMax) * travel);
      tickPath += 'M' + x + ' ' + yRuler + 'v' + (v === 0 ? 7 : 5);
      var t = el('text', { x: x, y: yRuler + 19, class: 'sc-text sc-tick', 'text-anchor': 'middle' }, ruler);
      t.textContent = DSL.util.formatNumber(v, 3);
    });
    el('path', { d: tickPath, class: 'sc-axis' }, ruler);
    kit.label(ruler, [{ sym: 'x' }, ' (m)'], { x: xEq + travel + 12, y: yRuler + 4, cls: 'sc-tick' });

    // línea de equilibrio
    el('line', { x1: xEq, y1: blockTop - 16, x2: xEq, y2: yRuler - 2, class: 'sc-ref' }, root);

    // amortiguador: cilindro fijo con fluido
    var damper = el('g', { class: 'sc-damper' }, root);
    el('rect', { x: cyl0, y: yD - dh / 2, width: cyl1 - cyl0, height: dh, class: 'sc-damper-fluid' }, damper);
    el('line', { x1: xWall, y1: yD, x2: cyl0, y2: yD, class: 'sc-struct' }, damper);
    el('path', { d: 'M' + cyl1 + ' ' + (yD - dh / 2) + 'H' + cyl0 + 'V' + (yD + dh / 2) + 'H' + cyl1, class: 'sc-struct' }, damper);
    var shortCyl = cyl1 - cyl0 < 100;   // cilindro corto: la lectura arranca en su borde y no pisa la pared
    kit.label(damper, [{ sym: 'b' }, ' = '], { x: shortCyl ? cyl0 + 2 : (cyl0 + cyl1) / 2, y: yD + dh / 2 + 15, anchor: shortCyl ? 'start' : 'middle' })
      .set(kit.paramText(S, 'b', 'N·s/m'));

    // resorte (polilínea viva)
    var spring = el('polyline', { class: 'sc-spring' }, root);
    E.spring = kit.points(spring, 2 * COILS + 3);
    E.kLabel = kit.label(root, [{ sym: 'k' }, ' = '], { anchor: 'middle', move: true, x: xEq / 2, y: yS - amp - 7 });
    E.kLabel.set(kit.paramText(S, 'k', 'N/m'));

    // conjunto móvil (bloque, ruedas, vástago, pistón, índice de la regla, flechas de F y v)
    var mover = el('g', { class: 'sc-mover', 'data-testid': S.testid + '-mass' }, root);
    E.mover = kit.xform(mover);
    var rodX0 = xEq - ROD * L;
    el('line', { x1: rodX0, y1: yD, x2: xEq, y2: yD, class: 'sc-rod' }, mover);
    el('rect', { x: rodX0 - 2, y: yD - dh / 2 + 2.5, width: 4, height: dh - 5, rx: 1, class: 'sc-piston' }, mover);
    el('line', { x1: xEq, y1: yFloor + 2, x2: xEq, y2: yRuler - 3, class: 'sc-index' }, mover);
    el('rect', { x: xEq, y: blockTop, width: bw, height: bh, rx: 4, class: 'sc-mass' }, mover);
    var mLabel = el('text', { x: xEq + bw / 2, y: blockTop + bh / 2 + 1, class: 'sc-text sc-text--ink sc-mass-sym', 'text-anchor': 'middle' }, mover);
    mLabel.textContent = 'm';
    var mVal = el('text', { x: xEq + bw / 2, y: blockTop + bh / 2 + 18, class: 'sc-text', 'text-anchor': 'middle' }, mover);
    mVal.textContent = kit.paramText(S, 'm', 'kg');
    E.wheels = [];
    [0.25, 0.75].forEach(function (f) {
      var wg = el('g', null, mover);
      kit.xform(wg).translate(xEq + bw * f, blockBottom + wheelR);
      var spin = el('g', null, wg);
      el('circle', { cx: 0, cy: 0, r: wheelR, class: 'sc-wheel' }, spin);
      el('path', { d: 'M' + (-wheelR + 1.5) + ' 0H' + (wheelR - 1.5) + 'M0 ' + (-wheelR + 1.5) + 'V' + (wheelR - 1.5), class: 'sc-wheel-spoke' }, spin);
      E.wheels.push(kit.xform(spin));
    });

    // flecha de fuerza F(t), anclada a la cara derecha del bloque
    var fg = el('g', { class: 'sc-arrow sc-arrow--in' }, mover);
    E.fArrow = kit.xform(fg);
    E.fVis = kit.attr(fg, 'opacity');
    var fShaft = el('line', { x1: 0, y1: 0, x2: 10, y2: 0, class: 'sc-shaft' }, fg);
    E.fShaftX2 = kit.len(fShaft, 'x2');
    E.fHead = kit.xform(kit.arrowHead(fg, 9));
    E.fLabel = kit.label(mover, [{ sym: 'F' }, '(', { sym: 't' }, ') = '], { x: xEq + bw + 8, y: yMid - 11, cls: 'sc-text--in' });

    // velocidad v sobre el bloque
    var vg = el('g', { class: 'sc-arrow sc-arrow--zero' }, mover);
    E.vArrow = kit.xform(vg);
    E.vVis = kit.attr(vg, 'opacity');
    var vShaft = el('line', { x1: 0, y1: 0, x2: 10, y2: 0, class: 'sc-shaft sc-shaft--thin' }, vg);
    E.vShaftX2 = kit.len(vShaft, 'x2');
    E.vHead = kit.xform(kit.arrowHead(vg, 7));
    E.vLabel = kit.label(mover, [{ sym: 'v' }, ' = '], { x: xEq + bw / 2, y: blockTop - 17, anchor: 'middle', cls: 'sc-text--zero' });

    // flecha x sobre la regla y lectura móvil
    var xg = el('g', { class: 'sc-arrow sc-arrow--out' }, root);
    E.xVis = kit.attr(xg, 'opacity');
    var xShaft = el('line', { x1: xEq, y1: yRuler, x2: xEq, y2: yRuler, class: 'sc-shaft' }, xg);
    E.xShaftX2 = kit.len(xShaft, 'x2');
    E.xHead = kit.xform(kit.arrowHead(xg, 8));
    E.xLabel = kit.label(mover, [{ sym: 'x' }, ' = '], { x: xEq, y: yRuler + 38, anchor: 'middle', cls: 'sc-text--out' });

    Lo.vArrowMax = clamp(bw * 0.85, 28, 90);
  }

  function render(S, f) {
    var o = f.outputs || {};
    var st = f.state || [];
    var p = S.params;
    var x = pick(o.x, st[0], 0);
    var v = pick(o.v, st[1], 0);
    var F = f.input ? kit.finite(f.input.value, 0) : 0;
    var k = p.k > 0 ? p.k : 1;
    var m = p.m > 0 ? p.m : 1;

    // escalas pegajosas: x crece con el estado y con la deflexión estática esperada F/k
    var grew = S.xs.observe(x);
    if (F !== 0 && S.xs.observe((Math.abs(F) / k) * 1.6)) grew = true;
    if (grew) {
      S.invalidate();
      return;
    }
    S.fs.observe(F);
    S.vs.observe(v);

    var Lo = S.L;
    var E = S.E;
    var dx = clamp(x / S.xs.value, -1.06, 1.06) * Lo.travel;
    var bl = Lo.xEq + dx;
    E.mover.translate(dx, 0);

    // ruedas: rodadura sin deslizamiento (ángulo = recorrido / radio)
    var ang = dx / Lo.wheelR;
    E.wheels[0].rotate(0, 0, ang);
    E.wheels[1].rotate(0, 0, ang);

    // resorte: guías rectas fijas y zigzag repartido entre ellas
    var sp = E.spring;
    var x0 = Lo.xWall;
    var x1 = x0 + Lo.lead;
    var x2 = bl - Lo.lead;
    var n2 = 2 * COILS;
    sp.set(0, x0, Lo.yS);
    sp.set(1, x1, Lo.yS);
    for (var j = 1; j < n2; j++) {
      sp.set(j + 1, x1 + (j / n2) * (x2 - x1), Lo.yS + (j % 2 ? -Lo.amp : Lo.amp));
    }
    sp.set(n2 + 1, x2, Lo.yS);
    sp.set(n2 + 2, bl, Lo.yS);
    sp.flush();
    E.kLabel.xf.translate((x0 + bl) / 2, Lo.yS - Lo.amp - 7);

    // F(t): flecha proporcional a |F| / F de referencia; el sentido sigue al signo
    var fl = S.fs.value > 0 ? (Math.abs(F) / S.fs.value) * Lo.arrowMax : 0;
    if (fl < 3) {
      E.fVis(0);
    } else {
      E.fVis(1);
      var sx = F < 0 ? -1 : 1;
      E.fArrow.matrix(sx, 0, 0, 1, Lo.xEq + Lo.bw + (F < 0 ? fl + 2 : 2), Lo.yMid);
      E.fShaftX2(fl - 6);
      E.fHead.translate(fl, 0);
    }

    // v: flecha sobre el bloque, referencia max(|v| observado, x_ref·ωn)
    var wn = Math.sqrt(k / m);
    var vRef = Math.max(S.vs.value, S.xs.value * wn * 0.8);
    var vl = vRef > 0 ? clamp(Math.abs(v) / vRef, 0, 1) * Lo.vArrowMax : 0;
    if (vl < 3) {
      E.vVis(0);
    } else {
      E.vVis(1);
      var vs = v < 0 ? -1 : 1;
      E.vArrow.matrix(vs, 0, 0, 1, Lo.xEq + Lo.bw / 2 - vs * vl / 2, Lo.blockTop - 8);
      E.vShaftX2(vl - 5);
      E.vHead.translate(vl, 0);
    }

    // x sobre la regla
    if (Math.abs(dx) < 4) {
      E.xVis(0);
    } else {
      E.xVis(1);
      var xs = dx < 0 ? -1 : 1;
      E.xShaftX2(bl - xs * 6);
      E.xHead.matrix(xs, 0, 0, 1, bl, Lo.yRuler);
    }

    if (S.textDue) {
      E.xLabel.set(kit.fmtRef(x, 'm', S.xs.value));
      E.vLabel.set(kit.fmtRef(v, 'm/s', vRef));
      E.fLabel.set(kit.fmtRef(F, 'N', Math.max(S.fs.value, k * S.xs.value)));
    }
  }

  function summary(S, f) {
    var o = f.outputs || {};
    var st = f.state || [];
    var x = pick(o.x, st[0], 0);
    var v = pick(o.v, st[1], 0);
    var F = f.input ? kit.finite(f.input.value, 0) : 0;
    var where = Math.abs(x) < S.xs.value * 0.02 ? 'en el equilibrio' : (x > 0 ? 'estirando el resorte' : 'comprimiendo el resorte');
    return 't = ' + kit.fmt(kit.finite(f.t, 0), 's', 3) + '. Desplazamiento x = ' + kit.fmt(x, 'm', 3) + ' (' + where +
      '), velocidad v = ' + kit.fmt(v, 'm/s', 3) + ', fuerza aplicada F = ' + kit.fmt(F, 'N', 3) + '.';
  }

  scenes.register('massSpring', function (container, opts) {
    return kit.mount(container, opts, {
      id: 'massSpring',
      cls: 'mass-spring',
      name: 'Escena del sistema masa-resorte-amortiguador',
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
