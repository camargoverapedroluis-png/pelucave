/*
 * js/viz/scenes/registry.js — Propietario: scenes.
 * Registro de escenas físicas (DSL.viz.scenes: register, create, has, list) y kit compartido
 * (DSL.viz.scenes.kit) para escenas SVG construidas una vez y actualizadas por atributos y
 * transformaciones en cada frame, sin crear objetos. API: docs/api/scenes.md.
 */
(function (DSL) {
  'use strict';

  var util = DSL.util;
  var SVG_NS = util.SVG_NS;
  var NBSP = ' ';
  var SUB_SHIFT = 4;            // px de desplazamiento de los subíndices (dy)
  var TEXT_PERIOD = 0.1;        // s reales entre reformateos de etiquetas numéricas (10 Hz)
  var SUMMARY_PERIOD = 0.5;     // s reales entre actualizaciones del resumen textual

  var factories = Object.create(null);
  var order = [];

  /* ------------------------------------------------------------------ registro */

  function register(id, factory) {
    if (typeof id !== 'string' || !id) throw new Error('DSL.viz.scenes.register: el id de la escena debe ser un texto no vacío.');
    if (typeof factory !== 'function') throw new Error('DSL.viz.scenes.register: la fábrica de «' + id + '» debe ser una función.');
    if (factories[id]) throw new Error('DSL.viz.scenes.register: la escena «' + id + '» ya está registrada.');
    factories[id] = factory;
    order.push(id);
    return factory;
  }

  function has(id) { return !!factories[id]; }

  function list() { return order.slice(); }

  function create(id, container, opts) {
    var factory = factories[id];
    if (!factory) {
      throw new Error('DSL.viz.scenes.create: no existe la escena «' + id + '». Escenas disponibles: ' + order.join(', ') + '.');
    }
    if (!container || typeof container.appendChild !== 'function') {
      throw new Error('DSL.viz.scenes.create: falta el contenedor de la escena «' + id + '».');
    }
    return factory(container, opts || {});
  }

  /* ------------------------------------------------------------------ números */

  var NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

  /** Redondea hacia arriba a 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6 u 8 × 10ⁿ (escalas de reglas y capacidades). */
  function niceCeil(x) {
    if (!(x > 0) || !isFinite(x)) return 1;
    var e = Math.floor(Math.log(x) / Math.LN10);
    var p = Math.pow(10, e);
    var f = x / p;
    for (var i = 0; i < NICE.length; i++) {
      if (f <= NICE[i] * 1.000001) return Math.round(NICE[i] * p * 1e9) / 1e9;
    }
    return 10 * p;
  }

  /** Paso «bonito» para unas maxTicks divisiones de [0, span]. */
  function niceStep(span, maxTicks) {
    if (!(span > 0)) return 1;
    var raw = span / Math.max(1, maxTicks || 4);
    var e = Math.floor(Math.log(raw) / Math.LN10);
    var p = Math.pow(10, e);
    var f = raw / p;
    var n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * p;
  }

  /** Valores de marcas en [lo, hi] con el paso dado (sin errores de coma flotante visibles). */
  function ticks(lo, hi, step) {
    var out = [];
    if (!(step > 0) || !(hi >= lo)) return out;
    var start = Math.ceil(lo / step - 1e-9);
    var end = Math.floor(hi / step + 1e-9);
    for (var i = start; i <= end && out.length < 64; i++) out.push(Math.round(i * step * 1e9) / 1e9 + 0);
    return out;
  }

  function finite(v, fallback) { return typeof v === 'number' && isFinite(v) ? v : fallback; }

  /**
   * «número unidad» con decimales fijos según la escala ref (≈ 3 cifras a esa escala): ancho estable,
   * sin notación científica para valores casi nulos y sin «−0».
   */
  function fmtRef(v, unit, ref) {
    ref = Math.abs(ref);
    if (!(ref > 1e-6) || !isFinite(ref)) return fmt(v, unit, 3);   // escala aún desconocida o diminuta
    var dec = Math.max(0, Math.min(6, 2 - Math.floor(Math.log(ref) / Math.LN10 + 1e-9)));
    var q = Math.pow(10, -dec) / 2;
    if (Math.abs(v) < q) v = 0;
    var s = util.formatNumber(v, 12, { decimals: dec, sciMin: 1e-12, sciMax: 1e12 });
    return unit ? s + NBSP + unit : s;
  }

  /**
   * Valor de un parámetro para una etiqueta fija: en la unidad de presentación del modelo si la
   * declara (ParamSpec.display = { unit, factor }, p. ej. C en µF), si no en SI. Solo al construir.
   */
  function paramText(S, key, unit) {
    var v = S.params[key];
    var m = S.model;
    if (m && typeof m.params === 'function') {
      try {
        var specs = m.params(S.variant) || [];
        for (var i = 0; i < specs.length; i++) {
          var d = specs[i] && specs[i].key === key ? specs[i].display : null;
          if (d && d.unit && typeof d.factor === 'number' && isFinite(d.factor)) return fmt(v * d.factor, d.unit, 3);
        }
      } catch (e) { /* sin especificación: SI */ }
    }
    return fmt(v, unit, 3);
  }

  /** Texto «número unidad» con espacio duro y punto decimal. */
  function fmt(v, unit, digits) {
    var s = util.formatNumber(v, digits || 3);
    return unit ? s + NBSP + unit : s;
  }

  /**
   * Escala pegajosa: solo crece durante una ejecución (la escena no «respira» con cada oscilación)
   * y vuelve a su base con reset(). observe(v) devuelve true si la escala cambió.
   */
  function sticky(min, headroom) {
    var s = {
      min: min > 0 ? min : 1e-9,
      headroom: headroom || 1.2,
      base: 0,
      value: 0,
      reset: function (base) {
        s.base = base > 0 && isFinite(base) ? niceCeil(base) : 0;
        s.value = Math.max(s.base, s.min);
        return s.value;
      },
      observe: function (v) {
        v = Math.abs(v);
        if (!isFinite(v) || v <= s.value * 0.97) return false;
        s.value = Math.max(niceCeil(v * s.headroom), s.min);
        return true;
      }
    };
    s.reset(0);
    return s;
  }

  /* ------------------------------------------------------------------ DOM SVG sin asignaciones por frame */

  var factorySvg = null;
  function factoryRoot() {
    if (!factorySvg && typeof document !== 'undefined' && document.createElementNS) {
      factorySvg = document.createElementNS(SVG_NS, 'svg');
    }
    return factorySvg;
  }

  /** Crea un elemento SVG con atributos y lo añade a parent. */
  function el(tag, attrs, parent) {
    var node = util.svg(tag, attrs || null);
    if (parent) parent.appendChild(node);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /**
   * Setter numérico de un atributo de longitud (x, y, width, height, x1…, cx, r…).
   * Usa SVGAnimatedLength.baseVal cuando existe (sin crear cadenas) y recuerda el último valor.
   */
  function len(node, name) {
    var anim = node[name];
    var base = anim && anim.baseVal && typeof anim.baseVal.value === 'number' ? anim.baseVal : null;
    var last = NaN;
    return function (v) {
      if (v === last) return;
      last = v;
      if (base) base.value = v;
      else node.setAttribute(name, v);
    };
  }

  /** Setter de un atributo cualquiera con caché (opacity, stroke-width, class…). */
  function attr(node, name) {
    var last;
    return function (v) {
      if (v === last) return;
      last = v;
      node.setAttribute(name, v);
    };
  }

  /**
   * Transformación afín de un elemento a través de una SVGTransform propia (sin cadenas por frame).
   * Métodos: matrix(a,b,c,d,e,f), translate(x,y), scale(x,y,sx,sy), rotate(x,y,rad).
   */
  function xform(node) {
    var list = node.transform && node.transform.baseVal;
    var root = factoryRoot();
    var tf = null;
    var m = null;
    if (list && typeof list.initialize === 'function' && root && typeof root.createSVGTransform === 'function') {
      tf = list.initialize(root.createSVGTransform());
      m = root.createSVGMatrix();
    }
    var c = [NaN, NaN, NaN, NaN, NaN, NaN];
    var h = {
      matrix: function (a, b, cc, d, e, f) {
        if (a === c[0] && b === c[1] && cc === c[2] && d === c[3] && e === c[4] && f === c[5]) return h;
        c[0] = a; c[1] = b; c[2] = cc; c[3] = d; c[4] = e; c[5] = f;
        if (tf) {
          m.a = a; m.b = b; m.c = cc; m.d = d; m.e = e; m.f = f;
          tf.setMatrix(m);
        } else {
          node.setAttribute('transform', 'matrix(' + a + ' ' + b + ' ' + cc + ' ' + d + ' ' + e + ' ' + f + ')');
        }
        return h;
      },
      translate: function (x, y) { return h.matrix(1, 0, 0, 1, x, y); },
      scale: function (x, y, sx, sy) { return h.matrix(sx, 0, 0, sy, x, y); },
      rotate: function (x, y, rad) {
        var cs = Math.cos(rad);
        var sn = Math.sin(rad);
        return h.matrix(cs, sn, -sn, cs, x, y);
      }
    };
    h.translate(0, 0);
    return h;
  }

  /**
   * Lista de n puntos vivos de un <polyline>/<polygon>: set(i, x, y) escribe sin crear objetos
   * (SVGPointList); sin esa API (pruebas en Node) acumula y escribe el atributo en flush().
   */
  function points(node, n) {
    var listApi = node.points;
    var root = factoryRoot();
    var live = null;
    var xs = new Float64Array(n);
    var ys = new Float64Array(n);
    if (listApi && typeof listApi.appendItem === 'function' && root && typeof root.createSVGPoint === 'function') {
      listApi.clear();
      for (var i = 0; i < n; i++) listApi.appendItem(root.createSVGPoint());
      live = [];
      for (var j = 0; j < n; j++) live.push(listApi.getItem(j));
    }
    var dirty = false;
    return {
      n: n,
      set: function (i, x, y) {
        if (xs[i] === x && ys[i] === y) return;
        xs[i] = x;
        ys[i] = y;
        if (live) {
          live[i].x = x;
          live[i].y = y;
        } else {
          dirty = true;
        }
      },
      x: function (i) { return xs[i]; },
      y: function (i) { return ys[i]; },
      flush: function () {
        if (live || !dirty) return;
        dirty = false;
        var s = '';
        for (var k = 0; k < n; k++) s += (k ? ' ' : '') + xs[k] + ',' + ys[k];
        node.setAttribute('points', s);
      }
    };
  }

  /** Setter de texto con caché: un único nodo de texto que solo cambia si cambia la cadena. */
  function textSetter(node) {
    var t = document.createTextNode('');
    node.appendChild(t);
    var last = '';
    return function (s) {
      if (s === last) return;
      last = s;
      t.data = s;
    };
  }

  /**
   * Etiqueta SVG con partes fijas y una parte variable final.
   * parts: textos, { sym: 'x' } (cursiva), { sub: 'R' } (subíndice). Devuelve { el, set(texto), xf }.
   * opts: { x, y, anchor, cls, move: true → transformación propia para desplazarla sin cadenas }.
   */
  function label(parent, parts, opts) {
    opts = opts || {};
    var t = el('text', {
      x: opts.move ? 0 : (opts.x || 0),
      y: opts.move ? 0 : (opts.y || 0),
      class: ['sc-text', opts.cls].filter(Boolean).join(' '),
      'text-anchor': opts.anchor || 'start'
    }, parent);
    var shifted = false;
    (parts || []).forEach(function (part) {
      var a = {};
      var text;
      if (typeof part === 'string') {
        text = part;
      } else if (part.sub !== undefined) {
        a.class = 'sc-sub';
        text = part.sub;
      } else {
        a.class = 'sc-sym';
        text = part.sym;
      }
      var isSub = typeof part === 'object' && part.sub !== undefined;
      if (isSub && !shifted) a.dy = SUB_SHIFT;
      if (!isSub && shifted) a.dy = -SUB_SHIFT;
      shifted = isSub;
      var span = el('tspan', a, t);
      span.textContent = text;
    });
    var va = { class: 'sc-num' };
    if (shifted) va.dy = -SUB_SHIFT;
    var vspan = el('tspan', va, t);
    var out = { el: t, set: textSetter(vspan), xf: null };
    if (opts.move) {
      out.xf = xform(t);
      out.xf.translate(opts.x || 0, opts.y || 0);
    }
    return out;
  }

  /**
   * Ancho estimado (px, por exceso) de un texto de escena: partes como en label() (textos, { sym },
   * { sub } al 86 %), en IBM Plex Sans 500 a px píxeles (13 por defecto, --text-xs). Sin leer el
   * layout: sirve para reservar ranuras y evitar choques de etiquetas en cada fotograma sin
   * asignaciones. Anchos de avance medidos en Chromium y redondeados hacia arriba, más un 3 %.
   */
  function charEm(c) {
    if (c >= '0' && c <= '9') return 0.62;
    switch (c) {
      case '.': case ',': case '·': case ':': case ';': return 0.31;
      case ' ': case NBSP: return 0.27;
      case '−': case '+': case '×': case '=': case '*': case '-': case '<': case '>': return 0.62;
      case '∞': return 0.86;
      case '⁰': case '¹': case '²': case '³': case '⁴': case '⁵': case '⁶': case '⁷': case '⁸': case '⁹': case '⁻': case '⁺': return 0.4;
      case 'i': case 'l': case 'j': case 'f': case 'r': case 't': case 'I': case '(': case ')': return 0.4;
      case 'm': case 'w': case 'M': case 'W': return 0.88;
      default: return c >= 'A' && c <= 'Z' ? 0.72 : 0.6;
    }
  }

  function emOf(s, k) {
    var em = 0;
    for (var j = 0; j < s.length; j++) em += charEm(s.charAt(j)) * k;
    return em;
  }

  function textWidth(parts, px) {
    var size = px || 13;
    var em = 0;
    if (typeof parts === 'string') {
      em = emOf(parts, 1);    // sin crear objetos: se usa también en render()
    } else {
      for (var i = 0; parts && i < parts.length; i++) {
        var part = parts[i];
        if (typeof part === 'string') em += emOf(part, 1);
        else if (part && part.sub !== undefined) em += emOf(String(part.sub), 0.86);
        else if (part && part.sym !== undefined) em += emOf(String(part.sym), 1);
      }
    }
    return em * size * 1.03;
  }

  /**
   * Franja de lecturas alineada a la derecha (filas de ranuras, texto anclado al final).
   * items: [{ key, parts, cls, unit?, slot? }]; opts: { left, right, top, slot = 124, rowH = 18,
   *   leftRest? (borde izquierdo de la 2.ª fila y siguientes; por defecto left),
   *   sep? (px de hueco al inicio de cada ranura: dibuja en su centro un divisor vertical .sc-strip-sep) }.
   * Cada ranura mide it.slot u opts.slot; las filas se llenan en orden con las ranuras que caben
   * (con ranuras iguales, floor(ancho / slot) por fila). Cada texto lleva la clase sc-readout y
   * data-slot="x0 x1" (su ranura en unidades de la caja de vista).
   * Devuelve { labels: { [key]: label (con .unit) }, rows, bottom }.
   */
  function strip(parent, items, opts) {
    var slot = opts.slot || 124;
    var rowH = opts.rowH || 18;
    var gap = opts.sep > 0 ? opts.sep : 0;
    var rowOf = [];
    var rowUsed = [0];
    var row = 0;
    items.forEach(function (it) {
      var sw = it.slot || slot;
      var left = row === 0 || opts.leftRest === undefined ? opts.left : opts.leftRest;
      if (rowUsed[row] > 0 && rowUsed[row] + sw > opts.right - left + 1e-6 * sw) {
        row++;
        rowUsed[row] = 0;
      }
      rowOf.push(row);
      rowUsed[row] += sw;
    });
    var rows = items.length ? row + 1 : 0;
    var labels = {};
    items.forEach(function (it, i) {
      var r = rowOf[i];
      var x = opts.right;
      for (var j = i + 1; j < items.length; j++) if (rowOf[j] === r) x -= items[j].slot || slot;
      var sw = it.slot || slot;
      var y = opts.top + 11 + r * rowH;
      var lb = label(parent, it.parts.concat(' = '), {
        x: x,
        y: y,
        anchor: 'end',
        cls: ['sc-readout', it.cls].filter(Boolean).join(' ')
      });
      lb.el.setAttribute('data-slot', r2(x - sw) + ' ' + r2(x));
      if (gap && i > 0 && rowOf[i - 1] === r) {
        var sx = r2(x - sw + gap / 2);
        el('line', { x1: sx, x2: sx, y1: y - 10, y2: y + 3, class: 'sc-strip-sep' }, parent);
      }
      lb.unit = it.unit || '';
      labels[it.key] = lb;
    });
    return { labels: labels, rows: rows, bottom: opts.top + rows * rowH };
  }

  /** Punta de flecha (triángulo) apuntando a +x con la punta en el origen. */
  function arrowHead(parent, size, cls) {
    var s = size || 8;
    return el('path', { d: 'M0 0 L' + (-s) + ' ' + (-s * 0.55) + ' L' + (-s) + ' ' + (s * 0.55) + ' Z', class: cls || 'sc-head' }, parent);
  }

  /** Rayado de suelo o pared: segmentos cortos a 45° a lo largo de una línea. */
  function hatch(parent, x0, y0, x1, y1, side, gap) {
    var g = gap || 9;
    var d = '';
    var dx = x1 - x0;
    var dy = y1 - y0;
    var L = Math.sqrt(dx * dx + dy * dy);
    if (L < 1) return null;
    var ux = dx / L;
    var uy = dy / L;
    // normal hacia el lado pedido
    var nx = -uy * side;
    var ny = ux * side;
    for (var s = g * 0.5; s < L; s += g) {
      var px = x0 + ux * s;
      var py = y0 + uy * s;
      d += 'M' + r2(px) + ' ' + r2(py) + 'l' + r2(nx * 7 - ux * 7) + ' ' + r2(ny * 7 - uy * 7);
    }
    return el('path', { d: d, class: 'sc-hatch' }, parent);
  }

  function r2(v) { return Math.round(v * 100) / 100; }

  function copyParams(src) {
    var out = {};
    if (src) Object.keys(src).forEach(function (k) { out[k] = src[k]; });
    return out;
  }

  function sameParams(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k) && a[k] !== b[k]) return false;
    for (var j in a) if (Object.prototype.hasOwnProperty.call(a, j) && !Object.prototype.hasOwnProperty.call(b, j)) return false;
    return true;
  }

  function resolveModel(model) {
    if (model && typeof model === 'object') return model;
    if (typeof model === 'string' && DSL.systems && typeof DSL.systems.get === 'function') return DSL.systems.get(model) || null;
    return null;
  }

  /* ------------------------------------------------------------------ montaje común de una escena */

  /**
   * Monta una escena SVG en container. def: {
   *   id, name (nombre accesible), variant? (por defecto), init(S), onParams(S), onReset(S),
   *   build(S) (crea el SVG para S.w × S.h; puede llamarse de nuevo), render(S, frame), summary(S, frame)
   * }. Devuelve la SceneInstance del contrato más el, summary(), testid.
   */
  function mount(container, opts, def) {
    opts = opts || {};
    var testid = opts.testid || ('sc-' + def.id);
    var sumId = util.uid('sc-sum');
    var root = el('svg', {
      class: 'sc-root sc-' + def.cls,
      role: 'img',
      'aria-label': def.name,
      'aria-describedby': sumId,
      'data-testid': testid,
      'data-variant': opts.variant || def.variant || null,
      focusable: 'false',
      xmlns: SVG_NS
    });
    var summaryEl = util.h('p', {
      class: 'sc-summary',
      id: sumId,
      'data-testid': testid + '-summary',
      'aria-live': opts.live ? 'polite' : null
    });
    container.appendChild(root);
    container.appendChild(summaryEl);

    var S = {
      id: def.id,
      testid: testid,
      root: root,
      container: container,
      opts: opts,
      model: resolveModel(opts.model),
      variant: opts.variant || def.variant || null,
      params: copyParams(opts.params),
      w: 0,
      h: 0,
      t: -Infinity,
      dt: 0,
      realDt: 0,
      frame: null,
      textDue: true,
      textClock: 0,
      dirty: false,
      built: false,
      destroyed: false,
      kit: kit,
      reduced: function () { return !!(DSL.prefs && DSL.prefs.reducedMotion); },
      /** Rango sugerido por el modelo (hints.yRange[key]) → máximo absoluto, o 0. */
      hint: function (key) {
        var m = S.model;
        if (!m || typeof m.hints !== 'function') return 0;
        try {
          var hs = m.hints(S.params, S.variant);
          var r = hs && hs.yRange && hs.yRange[key];
          if (r && r.length === 2) return Math.max(Math.abs(finite(r[0], 0)), Math.abs(finite(r[1], 0)));
        } catch (e) { /* sin sugerencias: la escena usa su propia estimación */ }
        return 0;
      },
      /** Pide reconstruir el SVG (cambio de escala, variante o tamaño). */
      invalidate: function () { S.dirty = true; }
    };

    var lastSummary = '';
    var sumClock = Infinity;
    var sumT = NaN;
    var sumParamsVersion = -1;
    var paramsVersion = 0;

    function setSummary(text) {
      if (text === lastSummary) return;
      lastSummary = text;
      summaryEl.textContent = text;
      root.setAttribute('aria-label', text ? def.name + '. ' + text : def.name);
    }

    function rebuild() {
      S.dirty = false;
      if (!(S.w > 0 && S.h > 0)) return;
      clear(root);
      root.setAttribute('viewBox', '0 0 ' + r2(S.w) + ' ' + r2(S.h));
      def.build(S);
      S.built = true;
      S.textDue = true;
    }

    function draw(frame) {
      if (S.dirty || !S.built) rebuild();
      if (!S.built) return;
      def.render(S, frame);
      if (S.dirty) {
        // la escala creció durante este frame: se reconstruye y se repinta con el mismo estado
        rebuild();
        if (S.built) def.render(S, frame);
      }
    }

    function sizeTo(w, h) {
      w = Math.round(w * 100) / 100;
      h = Math.round(h * 100) / 100;
      if (Math.abs(w - S.w) < 0.5 && Math.abs(h - S.h) < 0.5) return false;
      S.w = w;
      S.h = h;
      S.dirty = true;
      return true;
    }

    function redrawLast() {
      if (S.destroyed) return;
      if (S.frame) {
        var keepDt = S.dt;
        S.dt = 0;
        S.realDt = 0;
        S.textDue = true;
        draw(S.frame);
        S.dt = keepDt;
      } else if (S.dirty) {
        rebuild();
      }
    }

    if (typeof def.init === 'function') def.init(S);
    if (typeof def.onParams === 'function') def.onParams(S);
    root.setAttribute('aria-label', def.name);

    // tamaño inicial (lectura de layout solo al crear y en resize(), nunca en render)
    sizeTo(container.clientWidth || 0, container.clientHeight || 0);
    var stopSize = util.observeSize(container, function (size) {
      if (S.destroyed) return;
      if (sizeTo(size.width, size.height)) redrawLast();
    });
    if (S.dirty) rebuild();

    var inst = {
      el: root,
      testid: testid,
      render: function (frame) {
        if (S.destroyed || !frame) return;
        if (frame.variant && frame.variant !== S.variant) inst.setVariant(frame.variant, frame.params);
        if (frame.params && !sameParams(S.params, frame.params)) {
          S.params = copyParams(frame.params);
          paramsVersion++;
          if (typeof def.onParams === 'function') def.onParams(S);
          S.dirty = true;
        }
        var t = finite(frame.t, 0);
        if (t < S.t - 1e-9) {
          if (typeof def.onReset === 'function') def.onReset(S);
          S.dirty = true;
        }
        S.t = t;
        var dt = finite(frame.dt, 0);
        dt = dt > 0 ? Math.min(dt, 0.1) : 0;
        S.realDt = dt;
        S.dt = S.reduced() ? 0 : dt;
        S.textClock += dt;
        if (dt === 0 || S.textClock >= TEXT_PERIOD) {
          S.textDue = true;
          S.textClock = 0;
        }
        S.frame = frame;
        if (!(S.w > 0 && S.h > 0)) return;
        draw(frame);
        S.textDue = false;
        sumClock += dt;
        if (sumClock >= SUMMARY_PERIOD || (dt === 0 && (t !== sumT || paramsVersion !== sumParamsVersion))) {
          sumClock = 0;
          sumT = t;
          sumParamsVersion = paramsVersion;
          setSummary(def.summary(S, frame) || '');
        }
      },
      setVariant: function (variantId, params) {
        if (S.destroyed) return;
        if (variantId) {
          S.variant = variantId;
          root.setAttribute('data-variant', variantId);
        }
        if (params) S.params = copyParams(params);
        paramsVersion++;
        if (typeof def.init === 'function') def.init(S);
        if (typeof def.onParams === 'function') def.onParams(S);
        lastSummary = null;
        setSummary('');
        S.t = -Infinity;
        S.frame = null;
        S.dirty = true;
        rebuild();
      },
      resize: function () {
        if (S.destroyed) return;
        if (sizeTo(container.clientWidth || 0, container.clientHeight || 0)) redrawLast();
      },
      /** Resumen textual del último fotograma pintado (se recalcula al pedirlo). */
      summary: function () {
        if (!S.destroyed && S.frame && S.built) setSummary(def.summary(S, S.frame) || '');
        return lastSummary;
      },
      destroy: function () {
        if (S.destroyed) return;
        S.destroyed = true;
        stopSize();
        if (root.parentNode) root.parentNode.removeChild(root);
        if (summaryEl.parentNode) summaryEl.parentNode.removeChild(summaryEl);
        S.frame = null;
      }
    };
    return inst;
  }

  /* ------------------------------------------------------------------ exportación */

  var kit = {
    NBSP: NBSP,
    G: 9.81,
    mount: mount,
    el: el,
    clear: clear,
    len: len,
    attr: attr,
    xform: xform,
    points: points,
    text: textSetter,
    label: label,
    textWidth: textWidth,
    strip: strip,
    arrowHead: arrowHead,
    hatch: hatch,
    sticky: sticky,
    niceCeil: niceCeil,
    niceStep: niceStep,
    ticks: ticks,
    fmt: fmt,
    fmtRef: fmtRef,
    paramText: paramText,
    finite: finite,
    r2: r2,
    sameParams: sameParams
  };

  var scenes = DSL.viz.scenes || (DSL.viz.scenes = {});
  scenes.register = register;
  scenes.create = create;
  scenes.has = has;
  scenes.list = list;
  scenes.kit = kit;
})(window.DSL);
