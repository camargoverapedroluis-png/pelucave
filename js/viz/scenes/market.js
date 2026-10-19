/*
 * js/viz/scenes/market.js — Propietario: scenes.
 * Escena «market»: plano P–Q con oferta y demanda y punto de equilibrio. Variante telarana (discreta):
 * la telaraña se dibuja periodo a periodo. Variante walras (continua): marcador de precio que se
 * desliza, flecha de exceso de demanda u oferta y sentido del ajuste dP/dt. API: docs/api/scenes.md.
 */
(function (DSL) {
  'use strict';

  var scenes = DSL.viz.scenes;
  var kit = scenes.kit;
  var el = kit.el;
  var util = DSL.util;
  var clamp = util.clamp;

  var MAXK = 48;        // periodos visibles de la telaraña
  var GAP = 12;         // hueco (con divisor en su centro) al inicio de cada ranura de la franja
  var ROW_H = 21;       // paso entre filas de la franja
  var VAL_TPL = '−8.88×10⁹';   // la lectura más ancha que escribe sig(): cada ranura la reserva
  var K_TPL = '9999';          // periodo k más ancho que se reserva
  // cajas de las etiquetas móviles del cuadro (texto de 13 px): alto sobre y bajo la línea base
  var ASC = 13.5;
  var DESC = 4;
  var STEPY = 5;        // pasos de la rejilla en la que se busca el hueco libre más cercano
  var STEPX = 10;
  var NBOX = 8;         // cajas ocupadas por fotograma (punto de equilibrio + etiquetas)

  function pick(a, b, fallback) {
    if (typeof a === 'number' && isFinite(a)) return a;
    if (typeof b === 'number' && isFinite(b)) return b;
    return fallback;
  }

  function sub(sym, s) { return [{ sym: sym }, { sub: s }]; }

  function pr(p, key, fallback) { return typeof p[key] === 'number' && isFinite(p[key]) ? p[key] : fallback; }

  function init(S) {
    S.ps = kit.sticky(1e-9, 1.15);    // precio máximo representado
    S.qs = kit.sticky(1e-9, 1.05);    // cantidad máxima representada
    S.hist = new Float64Array(MAXK + 1);
    S.histK0 = 0;
    S.histN = 0;
    S.lastK = -1;
    S.anim = 1;
    S.periodClock = 0;
    S.animDur = 0.4;
    S.drawn = -1;
    S.vals = { P: 0, Qd: 0, Qs: 0, D: 0, Pstar: 0, Qstar: 0, k: 0, excess: 0 };
  }

  function baseScales(S) {
    var p = S.params;
    var a = pr(p, 'a', 10);
    var b = Math.max(1e-9, pr(p, 'b', 1));
    var c = pr(p, 'c', 0);
    var d = Math.max(0, pr(p, 'd', 1));
    var P0 = pr(p, 'P0', 0);
    var pStar = (a - c) / (b + d);
    var pb = Math.max(a / b, P0, pStar, S.hint('P'));
    S.ps.reset(pb * 1.12);
    S.pBase = S.ps.value;
    S.qs.reset(Math.max(a, c + d * S.ps.value, S.hint('Qd'), S.hint('Qs')) * 1.04);
    S.histN = 0;
    S.lastK = -1;
    S.drawn = -1;
    S.anim = 1;
  }

  function build(S) {
    var w = S.w;
    var h = S.h;
    var root = S.root;
    var tel = S.variant !== 'walras';
    var pad = clamp(w * 0.04, 12, 26);
    var E = S.E = {};

    // franja de lecturas (arriba a la derecha) y título del eje P (arriba a la izquierda)
    var items = tel ?
      [{ key: 'k', parts: [{ sym: 'k' }], cls: '' }, { key: 'P', parts: [{ sym: 'P' }], cls: 'sc-text--state' },
        { key: 'Qd', parts: sub('Q', 'd'), cls: 'sc-text--out' }, { key: 'Qs', parts: sub('Q', 's'), cls: 'sc-text--zero' }] :
      [{ key: 'P', parts: [{ sym: 'P' }], cls: 'sc-text--state' }, { key: 'Qd', parts: sub('Q', 'd'), cls: 'sc-text--out' },
        { key: 'Qs', parts: sub('Q', 's'), cls: 'sc-text--zero' }, { key: 'excess', parts: sub('Q', 'd').concat([' − ', { sym: 'Q' }, { sub: 's' }]), cls: '' }];
    // cada ranura reserva el ancho de su lectura más ancha (sig(): 4 cifras, científica compacta desde
    // 10⁵) más el hueco con divisor; la 2.ª fila puede empezar bajo el título del eje P
    items.forEach(function (it) {
      it.slot = Math.ceil(kit.textWidth(it.parts.concat(' = ', it.key === 'k' ? K_TPL : VAL_TPL))) + GAP;
    });
    // filas a 21 px: la caja de una lectura con subíndice (−13.3 a +7.1 px) no toca la de la fila siguiente
    var sp = kit.strip(root, items, { left: pad + 64, leftRest: pad, right: w - pad, top: pad, sep: GAP, rowH: ROW_H });
    E.strip = sp.labels;
    kit.label(root, ['Precio ', { sym: 'P' }], { x: pad, y: pad + 11 });

    var x0 = Math.round(pad + 40);
    // Contenedor muy estrecho (p. ej. durante una captura que colapsa el layout): la caja nunca
    // queda con anchura negativa (integrador, a petición de gallery).
    var x1 = Math.max(x0 + 40, Math.round(w - pad - 8));
    var y0 = Math.round(pad + 32 + (sp.rows - 1) * ROW_H);
    var y1 = Math.round(h - pad - 34);
    if (y1 - y0 < 40) y1 = y0 + 40;   // lienzo muy bajo: el gráfico no desaparece
    E.plot = { x0: x0, x1: x1, y0: y0, y1: y1 };
    var Pmax = S.ps.value;
    var Qmax = S.qs.value;
    E.sx = (x1 - x0) / Qmax;
    E.sy = (y1 - y0) / Pmax;

    // rejilla y ejes con marcas
    var stepP = kit.niceStep(Pmax, clamp(Math.floor((y1 - y0) / 44), 2, 8));
    var stepQ = kit.niceStep(Qmax, clamp(Math.floor((x1 - x0) / 64), 2, 10));
    var gd = '';
    var tg = el('g', null, root);
    kit.ticks(0, Pmax, stepP).forEach(function (v) {
      var y = kit.r2(y1 - v * E.sy);
      if (v > 0) gd += 'M' + x0 + ' ' + y + 'H' + x1;
      var t = el('text', { x: x0 - 7, y: y + 4, class: 'sc-text sc-tick', 'text-anchor': 'end' }, tg);
      t.textContent = util.formatNumber(v, 3);
    });
    kit.ticks(0, Qmax, stepQ).forEach(function (v) {
      var x = kit.r2(x0 + v * E.sx);
      if (v > 0) gd += 'M' + x + ' ' + y0 + 'V' + y1;
      var t = el('text', { x: x, y: y1 + 17, class: 'sc-text sc-tick', 'text-anchor': 'middle' }, tg);
      t.textContent = util.formatNumber(v, 3);
    });
    el('path', { d: gd, class: 'sc-grid' }, root);
    el('path', { d: 'M' + x0 + ' ' + y0 + 'V' + y1 + 'H' + x1, class: 'sc-ground' }, root);
    kit.label(root, ['Cantidad ', { sym: 'Q' }], { x: x1, y: y1 + 32, anchor: 'end' });

    // recorte del área de trazado
    var id = util.uid('sc-clip');
    var cp = el('clipPath', { id: id, clipPathUnits: 'userSpaceOnUse' }, el('defs', null, root));
    el('rect', { x: x0, y: y0 - 2, width: x1 - x0 + 2, height: y1 - y0 + 2 }, cp);
    var plotG = el('g', { 'clip-path': 'url(#' + id + ')' }, root);

    // curvas: demanda original (fantasma si se desplaza), demanda, oferta
    var ghost = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, class: 'sc-ghost sc-ghost--out', visibility: 'hidden' }, plotG);
    E.ghost = lineSet(ghost);
    E.ghostVis = kit.attr(ghost, 'visibility');
    E.demand = lineSet(el('line', { x1: 0, y1: 0, x2: 0, y2: 0, class: 'sc-curve sc-curve--out' }, plotG));
    E.supply = lineSet(el('line', { x1: 0, y1: 0, x2: 0, y2: 0, class: 'sc-curve sc-curve--zero' }, plotG));
    E.dLabel = kit.label(root, ['Demanda'], { move: true, cls: 'sc-text--out sc-plot-label', anchor: 'start' });
    E.sLabel = kit.label(root, ['Oferta'], { move: true, cls: 'sc-text--zero sc-plot-label', anchor: 'end' });
    E.dVis = kit.attr(E.dLabel.el, 'visibility');
    E.sVis = kit.attr(E.sLabel.el, 'visibility');
    E.dW = kit.textWidth('Demanda');
    E.sW = kit.textWidth('Oferta');
    // cajas ocupadas en el fotograma en curso (x0, y0, x1, y1): sin asignaciones por fotograma
    E.boxes = new Float64Array(4 * NBOX);
    E.nBox = 0;

    // proyecciones del equilibrio
    var eqG = el('g', null, plotG);
    E.eqRefVis = kit.attr(eqG, 'visibility');
    E.eqH = lineSet(el('line', { x1: x0, y1: 0, x2: 0, y2: 0, class: 'sc-ref' }, eqG));
    E.eqV = lineSet(el('line', { x1: 0, y1: 0, x2: 0, y2: y1, class: 'sc-ref' }, eqG));

    if (tel) {
      // tramos de la telaraña: nacen en el origen del cuadro y se recortan a él en cada fotograma
      var cw = el('g', { class: 'sc-cobweb-g' }, plotG);
      E.segs = [];
      for (var i = 0; i < 2 * MAXK; i++) {
        var ln = el('line', { x1: x0, y1: y1, x2: x0, y2: y1, class: 'sc-cobweb', visibility: 'hidden' }, cw);
        var seg = lineSet(ln);
        seg.vis = kit.attr(ln, 'visibility');
        E.segs.push(seg);
      }
      var cur = el('circle', { cx: 0, cy: 0, r: 4.5, class: 'sc-price-dot--state' }, plotG);
      E.cur = kit.xform(cur);
      E.curVis = kit.attr(cur, 'visibility');
      S.drawn = -1;
    } else {
      var pg = el('g', null, plotG);
      E.pLine = lineSet(el('line', { x1: x0, y1: 0, x2: 0, y2: 0, class: 'sc-price-line' }, pg));
      var exG = el('g', { class: 'sc-arrow sc-arrow--ink' }, pg);
      E.exVis = kit.attr(exG, 'visibility');
      E.exShaft = lineSet(el('line', { x1: 0, y1: 0, x2: 0, y2: 0, class: 'sc-shaft sc-shaft--thin' }, exG));
      E.exHead = kit.xform(kit.arrowHead(exG, 8));
      E.exLabel = kit.label(pg, [], { move: true, anchor: 'middle', cls: 'sc-plot-label' });
      E.exLabelVis = kit.attr(E.exLabel.el, 'visibility');
      E.exText = '';
      E.exW = 0;
      var dS = el('circle', { cx: 0, cy: 0, r: 4.5, class: 'sc-price-dot--zero' }, pg);
      var dD = el('circle', { cx: 0, cy: 0, r: 4.5, class: 'sc-price-dot--out' }, pg);
      E.dotS = kit.xform(dS);
      E.dotD = kit.xform(dD);
      // sentido del ajuste de precio junto al eje P
      var adj = el('g', { class: 'sc-arrow sc-arrow--state' }, root);
      E.adjVis = kit.attr(adj, 'visibility');
      E.adjShaft = lineSet(el('line', { x1: 0, y1: 0, x2: 0, y2: 0, class: 'sc-shaft' }, adj));
      E.adjHead = kit.xform(kit.arrowHead(adj, 8));
    }

    // punto de equilibrio y su etiqueta (encima de todo)
    var eqPt = el('circle', { cx: 0, cy: 0, r: 5, class: 'sc-eq-point' }, root);
    E.eqPt = kit.xform(eqPt);
    E.eqPtVis = kit.attr(eqPt, 'visibility');
    var pParts = [{ sym: 'P' }, '* = '];
    var qParts = [{ sym: 'Q' }, '* = '];
    E.eqLabel = kit.label(root, pParts, { move: true, cls: 'sc-text--ink sc-plot-label' });
    E.qLabel = kit.label(root, qParts, { move: true, cls: 'sc-text--ink sc-plot-label' });
    E.eqPre = kit.textWidth(pParts);
    E.qPre = kit.textWidth(qParts);
    E.eqW = E.eqPre;
    E.qW = E.qPre;
  }

  /**
   * Lectura de la franja con ancho acotado: 4 cifras significativas con los decimales fijos dentro de
   * cada década (como mucho 3; |v| < 0.0005 es 0.000) y, desde 10⁵, forma científica compacta de
   * 3 cifras («−8.19×10⁵»; 2 cifras desde 10¹⁰ y 1 desde 10¹⁰⁰, para no crecer). Cifras tabulares.
   */
  function sig(v, plus) {
    var av = Math.abs(v);
    if (!(av >= 5e-4)) {
      v = 0;
      av = 0;
    }
    var pl = !!plus && v !== 0;
    if (av >= 1e5) return util.formatNumber(v, av >= 1e100 ? 1 : (av >= 1e10 ? 2 : 3), { sciMin: 1e-12, sciMax: 1e5, plus: pl });
    var dec = av > 0 ? clamp(3 - Math.floor(Math.log(av) / Math.LN10 + 1e-9), 0, 3) : 3;
    return util.formatNumber(v, 6, { decimals: dec, sciMin: 1e-12, sciMax: 1e9, plus: pl });
  }

  function lineSet(node) {
    return { x1: kit.len(node, 'x1'), y1: kit.len(node, 'y1'), x2: kit.len(node, 'x2'), y2: kit.len(node, 'y2') };
  }

  function setLine(L, ax, ay, bx, by) {
    L.x1(ax);
    L.y1(ay);
    L.x2(bx);
    L.y2(by);
  }

  /* ------------------------------------------------------------------ historia de la telaraña */

  function pushPeriod(S, k, P, D) {
    var p = S.params;
    var a = pr(p, 'a', 10);
    var b = Math.max(1e-9, pr(p, 'b', 1));
    var c = pr(p, 'c', 0);
    var d = pr(p, 'd', 1);
    if (S.histN === 0 || k < S.lastK) {
      S.histN = 1;
      S.histK0 = k;
      S.hist[0] = P;
      S.lastK = k;
      S.drawn = -1;
      return 1;
    }
    if (k === S.lastK) {
      S.hist[S.histN - 1] = P;
      return 0;
    }
    var added = 0;
    // periodos que no llegaron (varias iteraciones en un mismo frame): misma recurrencia del modelo
    for (var j = S.lastK + 1; j <= k; j++) {
      var prev = S.hist[S.histN - 1];
      var val = j === k ? P : (a + D - c - d * prev) / b;
      if (S.histN === MAXK + 1) {
        S.hist.copyWithin(0, 1);
        S.histN--;
        S.histK0++;
        S.drawn = -1;
      }
      S.hist[S.histN++] = val;
      added++;
    }
    S.lastK = k;
    return added;
  }

  /* ------------------------------------------------------------------ render */

  function render(S, f) {
    var o = f.outputs || {};
    var st = f.state || [];
    var p = S.params;
    var tel = S.variant !== 'walras';
    var V = S.vals;
    var a = pr(p, 'a', 10);
    var b = Math.max(1e-9, pr(p, 'b', 1));
    var c = pr(p, 'c', 0);
    var d = Math.max(0, pr(p, 'd', 1));
    var u = f.input ? kit.finite(f.input.value, 0) : 0;

    V.P = pick(o.P, st[0], 0);
    V.D = typeof o.Qd === 'number' && isFinite(o.Qd) ? o.Qd - (a - b * V.P) : (tel ? 0 : u);
    if (Math.abs(V.D) < 1e-12) V.D = 0;
    V.Qd = pick(o.Qd, null, a + V.D - b * V.P);
    V.Qs = pick(o.Qs, null, c + d * V.P);
    V.excess = V.Qd - V.Qs;
    V.Pstar = (a + V.D - c) / (b + d);
    V.Qstar = c + d * V.Pstar;
    V.k = kit.finite(f.t, 0);

    // escalas: crecen con el precio (hasta 4 veces la base: una telaraña divergente sale del cuadro)
    var grow = false;
    var pAbs = Math.max(Math.abs(V.P), V.Pstar);
    if (pAbs <= S.pBase * 4 && S.ps.observe(pAbs)) grow = true;
    if (S.qs.observe(Math.max(a + V.D, V.Qstar))) grow = true;
    if (grow) {
      S.invalidate();
      return;
    }

    var E = S.E;
    var Pl = E.plot;
    var sx = E.sx;
    var sy = E.sy;
    var Pmax = S.ps.value;
    function X(q) { return Pl.x0 + q * sx; }
    function Y(pp) { return Pl.y1 - pp * sy; }

    // curvas
    setLine(E.demand, X(a + V.D), Y(0), X(a + V.D - b * Pmax), Y(Pmax));
    setLine(E.supply, X(c), Y(0), X(c + d * Pmax), Y(Pmax));
    if (V.D !== 0) {
      E.ghostVis('visible');
      setLine(E.ghost, X(a), Y(0), X(a - b * Pmax), Y(Pmax));
    } else {
      E.ghostVis('hidden');
    }

    // equilibrio: el punto y sus proyecciones solo si caen en el cuadro (P* < 0 con D muy negativa)
    var ex = X(V.Qstar);
    var ey = Y(V.Pstar);
    var cx = clamp(ex, Pl.x0, Pl.x1);
    var cy = clamp(ey, Pl.y0, Pl.y1);
    var eqIn = Math.abs(ex - cx) < 0.5 && Math.abs(ey - cy) < 0.5;
    E.eqPtVis(eqIn ? 'visible' : 'hidden');
    E.eqRefVis(eqIn ? 'visible' : 'hidden');
    E.eqPt.translate(cx, cy);
    setLine(E.eqH, Pl.x0, cy, cx, cy);
    setLine(E.eqV, cx, cy, cx, Pl.y1);

    if (S.textDue) {
      E.strip.P.set(sig(V.P));
      E.strip.Qd.set(sig(V.Qd));
      E.strip.Qs.set(sig(V.Qs));
      if (E.strip.k) E.strip.k.set(String(Math.round(V.k)));
      if (E.strip.excess) E.strip.excess.set(sig(V.excess, true));
      var ps = util.formatNumber(V.Pstar, 3);
      var qs = util.formatNumber(V.Qstar, 3);
      E.eqLabel.set(ps);
      E.qLabel.set(qs);
      E.eqW = E.eqPre + kit.textWidth(ps);
      E.qW = E.qPre + kit.textWidth(qs);
    }

    // etiquetas del cuadro sin choques: primero el punto de equilibrio como obstáculo, luego P*, Q*
    // (junto a sus proyecciones) y las rectas (cerca de su extremo superior visible)
    E.nBox = 0;
    if (eqIn) claim(E, cx - 6, cy - 6, cx + 6, cy + 6);
    place(E, E.eqLabel, E.eqW, 'start', Pl.x0 + 6, cy - 6);
    place(E, E.qLabel, E.qW, 'start', cx + 6, Pl.y1 - 7);
    curveLabel(E, E.dLabel, E.dVis, E.dW, a + V.D, -b, S, X, Y, true);
    curveLabel(E, E.sLabel, E.sVis, E.sW, c, d, S, X, Y, false);

    if (tel) renderCobweb(S, E, V, X, Y, a, b, c, d);
    else renderWalras(S, E, V, X, Y);
  }

  /* ------------------------------------------------------------------ etiquetas sin choques */

  /** Reserva la caja (x0, y0, x1, y1) en el fotograma en curso. */
  function claim(E, x0, y0, x1, y1) {
    if (E.nBox >= NBOX) return;
    var o = 4 * E.nBox++;
    E.boxes[o] = x0;
    E.boxes[o + 1] = y0;
    E.boxes[o + 2] = x1;
    E.boxes[o + 3] = y1;
  }

  /** ¿Está libre la caja de una etiqueta con su borde izquierdo en bx y línea base en y (ancho w)? */
  function free(E, bx, y, w) {
    var B = E.boxes;
    var x0 = bx - 2;
    var x1 = bx + w + 2;
    var y0 = y - ASC - 0.5;
    var y1 = y + DESC + 0.5;
    for (var i = 0; i < E.nBox; i++) {
      var o = 4 * i;
      if (x0 < B[o + 2] && x1 > B[o] && y0 < B[o + 3] && y1 > B[o + 1]) return false;
    }
    return true;
  }

  /**
   * Coloca una etiqueta móvil dentro del cuadro sin pisar las cajas ya reservadas: la posición
   * preferida (ancla x, línea base y; recortada al cuadro) o, si choca, el hueco libre más cercano de
   * una rejilla de pasos STEPX × STEPY. Si no hay ninguno, se queda en la preferida. Sin asignaciones.
   * Devuelve true si quedó libre.
   */
  function place(E, lb, w, anchor, px, py, noSearch) {
    var Pl = E.plot;
    var off = anchor === 'end' ? w : (anchor === 'middle' ? w / 2 : 0);
    var xlo = Pl.x0 + 3 + off;
    var xhi = Math.max(xlo, Pl.x1 - 3 - w + off);
    var ylo = Pl.y0 + ASC + 1;
    var yhi = Math.max(ylo, Pl.y1 - DESC - 1);
    px = clamp(px, xlo, xhi);
    py = clamp(py, ylo, yhi);
    var bx = px;
    var by = py;
    var ok = free(E, px - off, py, w);
    if (!ok && !noSearch) {
      var best = Infinity;
      var nk = Math.floor((yhi - ylo) / STEPY) + 1;
      var nj = Math.floor((xhi - xlo) / STEPX) + 1;
      for (var k = 0; k <= nk; k++) {
        var dy = k * STEPY;
        if (dy * dy >= best) break;
        for (var j = 0; j <= nj; j++) {
          var dx = j * STEPX;
          var d2 = dx * dx + dy * dy;
          if (d2 >= best) break;
          for (var q = 0; q < 4; q++) {
            if ((q & 1 && k === 0) || (q & 2 && j === 0)) continue;
            var y = py + (q & 1 ? dy : -dy);       // primero hacia arriba
            var x = px + (q & 2 ? -dx : dx);       // primero hacia la derecha
            if (y < ylo || y > yhi || x < xlo || x > xhi) continue;
            if (free(E, x - off, y, w)) {
              best = d2;
              bx = x;
              by = y;
              ok = true;
              break;
            }
          }
        }
      }
    }
    lb.xf.translate(bx, by);
    claim(E, bx - off, by - ASC, bx - off + w, by + DESC);
    return ok;
  }

  /**
   * Etiqueta de la recta Q = q0 + m·P: cerca del extremo superior del tramo visible en el cuadro,
   * a la derecha (demanda) o a la izquierda (oferta) de la recta; oculta si la recta no se ve.
   */
  function curveLabel(E, lb, vis, w, q0, m, S, X, Y, right) {
    var Pmax = S.ps.value;
    var Qmax = S.qs.value;
    var lo = 0;
    var hi = Pmax;
    if (m !== 0) {
      var pa = -q0 / m;
      var pb = (Qmax - q0) / m;
      lo = Math.max(0, Math.min(pa, pb));
      hi = Math.min(Pmax, Math.max(pa, pb));
    } else if (q0 < 0 || q0 > Qmax) {
      hi = -1;
    }
    if (!(hi >= lo)) {
      vis('hidden');
      return;
    }
    vis('visible');
    var pp = hi - 0.1 * (hi - lo);
    var q = q0 + m * pp;
    place(E, lb, w, right ? 'start' : 'end', X(q) + (right ? 10 : -10), Y(pp) + 4);
  }

  function renderCobweb(S, E, V, X, Y, a, b, c, d) {
    var added = pushPeriod(S, Math.round(V.k), V.P, V.D);
    S.periodClock += S.realDt;
    if (added > 0) {
      if (S.periodClock > 0) S.animDur = clamp(S.periodClock * 0.6, 0.12, 0.5);
      S.periodClock = 0;
      S.anim = 0;
    }
    if (S.dt === 0 || S.reduced()) S.anim = 1;
    else S.anim = Math.min(1, S.anim + S.dt / S.animDur);

    var n = S.histN;
    var H = S.hist;
    var last = n - 1;
    // tramos completos (solo se reescriben si cambió la historia)
    if (S.drawn !== last) {
      for (var s = 0; s < E.segs.length; s++) E.segs[s].vis('hidden');
      for (var j = 1; j < last; j++) drawPeriod(E, H, j, 1, X, Y, c, d);
      S.drawn = last;
    }
    if (last >= 1) drawPeriod(E, H, last, S.anim, X, Y, c, d);
    // punto actual: la punta del tramo vertical (precio P_k sobre la demanda); en k = 0, P₀ sobre la oferta.
    // Fuera del cuadro (telaraña divergente) no se dibuja: nunca se pinta un precio en un borde falso.
    var lastP = H[Math.max(0, last)];
    var qx;
    var yP;
    if (last >= 1) {
      var prevP = H[last - 1];
      qx = X(c + d * prevP);
      yP = Y(S.anim < 0.5 ? prevP + (lastP - prevP) * S.anim * 2 : lastP);
    } else {
      qx = X(c + d * lastP);
      yP = Y(lastP);
    }
    var Pl = E.plot;
    var kx = clamp(qx, Pl.x0, Pl.x1);
    var ky = clamp(yP, Pl.y0, Pl.y1);
    E.curVis(Math.abs(kx - qx) < 0.5 && Math.abs(ky - yP) < 0.5 ? 'visible' : 'hidden');
    E.cur.translate(kx, ky);
  }

  /**
   * Tramo de la telaraña recortado al cuadro P–Q (los tramos son verticales u horizontales): sus
   * extremos nunca salen del cuadro y queda oculto si no lo cruza.
   */
  function clipSeg(seg, Pl, ax, ay, bx, by) {
    var vis = ax === bx ?
      ax >= Pl.x0 && ax <= Pl.x1 && Math.max(ay, by) >= Pl.y0 && Math.min(ay, by) <= Pl.y1 :
      ay >= Pl.y0 && ay <= Pl.y1 && Math.max(ax, bx) >= Pl.x0 && Math.min(ax, bx) <= Pl.x1;
    setLine(seg, clamp(ax, Pl.x0, Pl.x1), clamp(ay, Pl.y0, Pl.y1), clamp(bx, Pl.x0, Pl.x1), clamp(by, Pl.y0, Pl.y1));
    seg.vis(vis ? 'visible' : 'hidden');
  }

  /** Periodo j: tramo vertical (oferta → demanda) y horizontal (demanda → oferta), con avance t ∈ [0, 1]. */
  function drawPeriod(E, H, j, t, X, Y, c, d) {
    var Pp = H[j - 1];
    var Pj = H[j];
    var Qj = c + d * Pp;
    var Qn = c + d * Pj;
    var v = E.segs[2 * (j - 1)];
    var hz = E.segs[2 * (j - 1) + 1];
    if (!v || !hz) return;
    var Pl = E.plot;
    var tv = Math.min(1, t * 2);
    var xq = X(Qj);
    clipSeg(v, Pl, xq, Y(Pp), xq, Y(Pp + (Pj - Pp) * tv));
    if (t <= 0.5) {
      hz.vis('hidden');
    } else {
      var th = (t - 0.5) * 2;
      var yq = Y(Pj);
      clipSeg(hz, Pl, xq, yq, X(Qj + (Qn - Qj) * th), yq);
    }
  }

  function renderWalras(S, E, V, X, Y) {
    var Pl = E.plot;
    var py = Y(V.P);
    var xs = X(V.Qs);
    var xd = X(V.Qd);
    // precio fuera del cuadro: ni flechas ni rótulo (quedarían sobre los ejes o fuera del lienzo)
    var pIn = py >= Pl.y0 - 0.5 && py <= Pl.y1 + 0.5;
    setLine(E.pLine, Pl.x0, py, Math.max(xs, xd), py);
    E.dotS.translate(xs, py);
    E.dotD.translate(xd, py);
    var gap = xd - xs;
    var rel = Math.abs(V.excess) / Math.max(1e-9, S.qs.value);
    if (!pIn || Math.abs(gap) < 14 || rel < 0.01) {
      E.exVis('hidden');
      E.exLabelVis('hidden');
    } else {
      var sg = gap > 0 ? 1 : -1;
      E.exVis('visible');
      setLine(E.exShaft, xs + sg * 6, py, xd - sg * 12, py);
      E.exHead.matrix(sg, 0, 0, 1, xd - sg * 6, py);
      var want = gap > 0 ? 'exceso de demanda' : 'exceso de oferta';
      if (want !== E.exText) {
        E.exText = want;
        E.exW = kit.textWidth(want);
        E.exLabel.set(want);
      }
      // sobre la línea de precio o, si choca con otra etiqueta, debajo; si tampoco cabe, solo la flecha
      var mx = (Math.max(Pl.x0, Math.min(xs, xd)) + Math.min(Pl.x1, Math.max(xs, xd))) / 2;
      var ok = place(E, E.exLabel, E.exW, 'middle', mx, py - 10, true);
      if (!ok) {
        E.nBox--;
        ok = place(E, E.exLabel, E.exW, 'middle', mx, py + 18, true);
      }
      E.exLabelVis(ok ? 'visible' : 'hidden');
    }
    // dP/dt = α·(Qd − Qs): flecha vertical junto al eje P, longitud ∝ exceso
    var len = clamp(rel * 4, 0, 1) * 34;
    if (!pIn || len < 6) {
      E.adjVis('hidden');
    } else {
      var up = V.excess > 0;
      var ax = Pl.x0 + 14;
      E.adjVis('visible');
      setLine(E.adjShaft, ax, py, ax, py + (up ? -(len - 7) : (len - 7)));
      E.adjHead.matrix(0, up ? -1 : 1, up ? 1 : -1, 0, ax, py + (up ? -len : len));
    }
  }

  function summary(S, f) {
    var V = S.vals;
    var tel = S.variant !== 'walras';
    var head = tel ? 'Periodo k = ' + util.formatNumber(V.k, 4) + ': ' : 't = ' + kit.fmt(kit.finite(f.t, 0), 's', 3) + ': ';
    var rel = Math.abs(V.P - V.Pstar) / Math.max(1e-9, Math.abs(V.Pstar));
    var where = rel < 0.01 ? 'en el equilibrio' : (V.P > V.Pstar ? 'por encima del equilibrio' : 'por debajo del equilibrio');
    var s = head + 'precio P = ' + util.formatNumber(V.P, 4) + ' (' + where + ' P* = ' + util.formatNumber(V.Pstar, 3) + '), demanda Qd = ' +
      util.formatNumber(V.Qd, 4) + ', oferta Qs = ' + util.formatNumber(V.Qs, 4);
    if (!tel && rel >= 0.01) s += '; ' + (V.excess > 0 ? 'hay exceso de demanda y el precio sube' : 'hay exceso de oferta y el precio baja');
    if (tel) {
      var p = S.params;
      var ratio = pr(p, 'd', 1) / Math.max(1e-9, pr(p, 'b', 1));
      s += '; d/b = ' + util.formatNumber(ratio, 3) + (ratio < 1 ? ', la telaraña converge' : (ratio > 1 ? ', la telaraña diverge' : ', la telaraña cicla'));
    }
    return s + '.';
  }

  var NAMES = {
    telarana: 'Escena del modelo de la telaraña: oferta, demanda y trayectoria del precio',
    walras: 'Escena del ajuste continuo del precio: oferta, demanda y exceso de demanda'
  };

  scenes.register('market', function (container, opts) {
    var def = {
      id: 'market',
      cls: 'market',
      name: NAMES[opts.variant] || NAMES.telarana,
      variant: opts.variant || 'telarana',
      init: function (S) {
        init(S);
        def.name = NAMES[S.variant] || NAMES.telarana;
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
