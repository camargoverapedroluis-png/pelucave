/*
 * js/core/ns.js — Propietario: architect.
 * Crea window.DSL: espacios de nombres, bus de eventos, preferencias (movimiento reducido, tema)
 * y utilidades pequeñas y estables. Script clásico; se carga antes que cualquier módulo propio.
 * API documentada en docs/api/ns.md; pruebas en tests/unit/ns.test.mjs.
 */
(function (global) {
  'use strict';

  var DSL = global.DSL || {};
  global.DSL = DSL;

  DSL.version = '1.0.0';
  DSL.core = DSL.core || {};
  DSL.ui = DSL.ui || {};
  DSL.viz = DSL.viz || {};
  DSL.viz.scenes = DSL.viz.scenes || {};
  DSL.systems = DSL.systems || {};
  DSL.sections = DSL.sections || {};
  DSL.app = DSL.app || {};
  DSL.util = DSL.util || {};
  DSL.prefs = DSL.prefs || {};

  var doc = global.document || null;
  var util = DSL.util;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var STORE_PREFIX = 'dsl.v1.';

  function reportError(where, err) {
    if (global.console && typeof global.console.error === 'function') {
      global.console.error('[DSL] ' + where + ':', err);
    }
  }

  /* ------------------------------------------------------------------ emisor de eventos */

  /** Crea un emisor independiente { on, off, once, emit, count, clear }. */
  function emitter() {
    var handlers = Object.create(null);

    function off(event, fn) {
      var list = handlers[event];
      if (!list) return;
      var i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) delete handlers[event];
    }

    function on(event, fn) {
      if (typeof fn !== 'function') throw new TypeError('on("' + event + '"): el manejador debe ser una función');
      (handlers[event] || (handlers[event] = [])).push(fn);
      var active = true;
      return function unsubscribe() {
        if (!active) return;
        active = false;
        off(event, fn);
      };
    }

    function once(event, fn) {
      var un = on(event, function (payload, name) {
        un();
        fn(payload, name);
      });
      return un;
    }

    /** Llama a los manejadores en orden de suscripción. Un error no detiene a los demás. */
    function emit(event, payload) {
      var list = handlers[event];
      if (!list) return 0;
      var snapshot = list.slice();
      var called = 0;
      for (var i = 0; i < snapshot.length; i++) {
        // Si un manejador anterior dio de baja a este, no se llama.
        if (!handlers[event] || handlers[event].indexOf(snapshot[i]) < 0) continue;
        called++;
        try {
          snapshot[i](payload, event);
        } catch (err) {
          reportError('manejador de «' + event + '»', err);
        }
      }
      return called;
    }

    function count(event) {
      return handlers[event] ? handlers[event].length : 0;
    }

    function clear(event) {
      if (event === undefined) handlers = Object.create(null);
      else delete handlers[event];
    }

    return { on: on, off: off, once: once, emit: emit, count: count, clear: clear };
  }

  util.emitter = emitter;
  DSL.bus = DSL.bus || emitter();

  /* ------------------------------------------------------------------ números */

  function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Inversa de lerp: posición relativa de x entre a y b (0 si a === b). */
  function invLerp(a, b, x) {
    return a === b ? 0 : (x - a) / (b - a);
  }

  var SUPERSCRIPT = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
  var FROM_SUPERSCRIPT = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
  var MINUS = '−';

  function trimZeros(s) {
    return s.indexOf('.') < 0 ? s : s.replace(/0+$/, '').replace(/\.$/, '');
  }

  /**
   * Formatea un número para mostrarlo: punto decimal, sin ceros sobrantes, notación científica
   * para valores muy pequeños o grandes.
   *   formatNumber(x, digits = 4, opts)
   *   digits: cifras significativas.
   *   opts.decimals: decimales fijos (sin recortar ceros) dentro del rango no científico.
   *   opts.sci: 'unicode' (1.2×10⁻⁵, por defecto) | 'e' (1.2e-5).
   *   opts.sciMin = 1e-3, opts.sciMax = 1e6: umbrales de notación científica.
   *   opts.ascii: usa '-' en lugar del signo menos tipográfico '−'.
   *   opts.plus: antepone '+' a los positivos.
   * NaN → '—', ±Infinity → '∞' / '−∞', -0 → '0'.
   */
  function formatNumber(x, digits, opts) {
    opts = opts || {};
    if (digits === undefined || digits === null) digits = 4;
    digits = clamp(Math.round(digits), 1, 15);
    var minus = opts.ascii ? '-' : MINUS;
    x = Number(x);
    if (x !== x) return '—';
    if (x === Infinity) return (opts.plus ? '+' : '') + '∞';
    if (x === -Infinity) return minus + '∞';
    var sciMin = opts.sciMin === undefined ? 1e-3 : opts.sciMin;
    var sciMax = opts.sciMax === undefined ? 1e6 : opts.sciMax;
    var ax = Math.abs(x);
    var body;
    if (ax !== 0 && (ax >= sciMax || ax < sciMin)) {
      var parts = ax.toExponential(digits - 1).split('e');
      var mant = trimZeros(parts[0]);
      var exp = parseInt(parts[1], 10);
      if (opts.sci === 'e') {
        body = mant + 'e' + exp;
      } else {
        var e = String(exp).split('').map(function (c) { return SUPERSCRIPT[c]; }).join('');
        body = mant + '×10' + e;
      }
    } else if (opts.decimals !== undefined && opts.decimals !== null) {
      body = ax.toFixed(clamp(Math.round(opts.decimals), 0, 20));
    } else if (ax === 0) {
      body = '0';
    } else {
      var mag = Math.floor(Math.log10(ax));
      var dec = clamp(digits - 1 - mag, 0, 20);
      body = trimZeros(ax.toFixed(dec));
    }
    var isZero = /^0(\.0*)?$/.test(body); // el redondeo dejó un cero: nunca «−0»
    if (x < 0 && !isZero) return minus + body;
    if (x > 0 && opts.plus && !isZero) return '+' + body;
    return body;
  }

  var NUMBER_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

  /**
   * Convierte texto en número aceptando ',' o '.' como separador decimal (no separadores de miles).
   * Acepta '−' tipográfico, notación 'e' y las formas «1.5×10⁻³», «1,5x10^-3», «1.5*10^(-3)».
   * Devuelve NaN si el texto no es un número válido. Un número se devuelve tal cual.
   */
  function parseNumber(str) {
    if (typeof str === 'number') return str;
    if (str === null || str === undefined) return NaN;
    var s = String(str).replace(/^[\s  ]+|[\s  ]+$/g, '');
    if (!s) return NaN;
    s = s.replace(/[−‒–﹣－]/g, '-');
    // Potencias de diez escritas a mano.
    var pow = s.match(/^(.+?)\s*[×xX·*]\s*10\s*(?:\^\s*\(?\s*([+-]?\d+)\s*\)?|([⁺⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+))$/);
    if (pow) {
      var expo = pow[2] !== undefined ? pow[2] : pow[3].split('').map(function (c) { return FROM_SUPERSCRIPT[c]; }).join('');
      s = pow[1] + 'e' + expo;
    }
    var commas = (s.match(/,/g) || []).length;
    if (commas > 1 || (commas === 1 && s.indexOf('.') >= 0)) return NaN;
    s = s.replace(',', '.');
    if (!NUMBER_RE.test(s)) return NaN;
    return Number(s);
  }

  /* ------------------------------------------------------------------ tiempo */

  function now() {
    var p = global.performance;
    return p && typeof p.now === 'function' ? p.now() : Date.now();
  }

  /** Retrasa fn hasta que pasen `wait` ms sin llamadas. Devuelve f con f.cancel() y f.flush(). */
  function debounce(fn, wait) {
    var timer = null;
    var lastArgs = null;
    var lastThis = null;
    function invoke() {
      timer = null;
      var args = lastArgs;
      var self = lastThis;
      lastArgs = lastThis = null;
      return fn.apply(self, args);
    }
    function debounced() {
      lastArgs = arguments;
      lastThis = this;
      if (timer !== null) global.clearTimeout(timer);
      timer = global.setTimeout(invoke, wait);
    }
    debounced.cancel = function () {
      if (timer !== null) global.clearTimeout(timer);
      timer = null;
      lastArgs = lastThis = null;
    };
    debounced.flush = function () {
      if (timer === null) return undefined;
      global.clearTimeout(timer);
      return invoke();
    };
    debounced.pending = function () { return timer !== null; };
    return debounced;
  }

  /**
   * Como mucho una llamada cada `wait` ms: la primera se ejecuta en el acto (flanco inicial) y la
   * última llamada pendiente se ejecuta al final del intervalo (flanco final). f.cancel() descarta la pendiente.
   */
  function throttle(fn, wait) {
    var last = -Infinity;
    var timer = null;
    var lastArgs = null;
    var lastThis = null;
    function fire() {
      last = now();
      timer = null;
      var args = lastArgs;
      var self = lastThis;
      lastArgs = lastThis = null;
      fn.apply(self, args);
    }
    function throttled() {
      lastArgs = arguments;
      lastThis = this;
      var remaining = wait - (now() - last);
      if (remaining <= 0 && timer === null) {
        fire();
      } else if (timer === null) {
        timer = global.setTimeout(fire, Math.max(0, remaining));
      }
    }
    throttled.cancel = function () {
      if (timer !== null) global.clearTimeout(timer);
      timer = null;
      lastArgs = lastThis = null;
    };
    return throttled;
  }

  /* ------------------------------------------------------------------ azar determinista */

  /** Generador pseudoaleatorio mulberry32 con semilla: devuelve rng() en [0, 1). Usar en vez de Math.random. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function rng() {
      a = (a + 0x6D2B79F5) | 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Normal estándar N(0, 1) por Box-Muller a partir de un rng (consume dos valores por llamada). */
  function gaussian(rng) {
    var u1 = rng();
    var u2 = rng();
    if (u1 < 1e-300) u1 = 1e-300;
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /* ------------------------------------------------------------------ DOM */

  function cssVar(name, el) {
    if (!name) return '';
    var prop = name.indexOf('--') === 0 ? name : '--' + name;
    var target = el || (doc && doc.documentElement);
    if (!target || typeof global.getComputedStyle !== 'function') return '';
    return String(global.getComputedStyle(target).getPropertyValue(prop) || '').trim();
  }

  var uidCounter = 0;
  function uid(prefix) {
    uidCounter += 1;
    return (prefix || 'dsl') + '-' + uidCounter;
  }

  var HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return HTML_ESCAPES[c]; });
  }

  var PROP_KEYS = { value: 1, checked: 1, selected: 1, indeterminate: 1, muted: 1 };

  function applyProps(el, props, isSvg) {
    if (!props) return;
    Object.keys(props).forEach(function (key) {
      var v = props[key];
      if (v === null || v === undefined || v === false) return;
      if (key === 'class' || key === 'className') {
        var cls = Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v);
        if (cls) el.setAttribute('class', cls);
      } else if (key === 'style') {
        if (typeof v === 'string') {
          el.setAttribute('style', v);
        } else {
          Object.keys(v).forEach(function (k) {
            if (v[k] === null || v[k] === undefined) return;
            if (k.indexOf('--') === 0 || k.indexOf('-') > 0) el.style.setProperty(k, String(v[k]));
            else el.style[k] = v[k];
          });
        }
      } else if (key === 'dataset') {
        Object.keys(v).forEach(function (k) {
          if (v[k] === null || v[k] === undefined) return;
          el.setAttribute('data-' + k.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }), String(v[k]));
        });
      } else if (key === 'text') {
        el.textContent = String(v);
      } else if (key === 'html') {
        el.innerHTML = String(v); // solo con marcado propio, nunca con texto del usuario
      } else if (/^on[A-Z]/.test(key) && typeof v === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), v);
      } else if (!isSvg && PROP_KEYS[key]) {
        el[key] = v;
      } else if (v === true) {
        el.setAttribute(key, '');
      } else {
        el.setAttribute(key, String(v));
      }
    });
  }

  function appendChildren(el, children) {
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c === null || c === undefined || c === false || c === true) continue;
      if (Array.isArray(c)) {
        appendChildren(el, c);
      } else if (typeof c === 'object' && typeof c.nodeType === 'number') {
        el.appendChild(c);
      } else {
        el.appendChild(doc.createTextNode(String(c)));
      }
    }
  }

  /**
   * Crea un elemento HTML: h('button', { class: 'ds-btn', onClick: fn, 'aria-label': 'Reproducir' }, hijos…).
   * Props: class|className (texto o lista), style (texto u objeto; admite '--var'), dataset (objeto),
   * text, html (solo marcado propio), on<Evento> (función), value/checked/selected como propiedades,
   * true → atributo vacío, false/null/undefined → se omite; cualquier otra → setAttribute.
   * Hijos: nodos, textos, números o listas anidadas; null/false se ignoran.
   */
  function h(tag, props) {
    var el = doc.createElement(tag);
    applyProps(el, props, false);
    appendChildren(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  /** Igual que h() pero en el espacio de nombres SVG: svg('circle', { cx: 4, cy: 4, r: 2 }). */
  function svg(tag, props) {
    var el = doc.createElementNS(SVG_NS, tag);
    applyProps(el, props, true);
    appendChildren(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  /** Ejecuta fn cuando el DOM está listo (en el acto si ya lo está). */
  function ready(fn) {
    if (!doc || doc.readyState !== 'loading') {
      fn();
    } else {
      doc.addEventListener('DOMContentLoaded', function handler() {
        doc.removeEventListener('DOMContentLoaded', handler);
        fn();
      });
    }
  }

  /**
   * Observa la visibilidad de un elemento: cb(isVisible, entry) solo cuando cambia.
   * opts: { rootMargin = '0px', threshold = 0, once = false } (once: se desconecta tras el primer visible).
   * Sin IntersectionObserver llama cb(true, null) de inmediato. Devuelve la función para dejar de observar.
   */
  function onVisible(el, cb, opts) {
    opts = opts || {};
    if (!el || typeof global.IntersectionObserver !== 'function') {
      cb(true, null);
      return function () {};
    }
    var last = null;
    var io = new global.IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.target !== el) continue;
        var visible = !!entry.isIntersecting;
        if (visible === last) continue;
        last = visible;
        cb(visible, entry);
        if (visible && opts.once) {
          io.disconnect();
          return;
        }
      }
    }, { root: opts.root || null, rootMargin: opts.rootMargin || '0px', threshold: opts.threshold || 0 });
    io.observe(el);
    return function () { io.disconnect(); };
  }

  /**
   * Observa el tamaño de un elemento con ResizeObserver, agrupado en un frame:
   * cb({ width, height }) con el tamaño CSS del contenido. Devuelve la función para dejar de observar.
   */
  function observeSize(el, cb) {
    var pending = false;
    var size = null;
    function flush() {
      pending = false;
      if (size) cb(size);
    }
    function schedule(w, hgt) {
      size = { width: w, height: hgt };
      if (pending) return;
      pending = true;
      raf(flush);
    }
    if (typeof global.ResizeObserver === 'function') {
      var ro = new global.ResizeObserver(function (entries) {
        var r = entries[entries.length - 1].contentRect;
        schedule(r.width, r.height);
      });
      ro.observe(el);
      return function () { ro.disconnect(); };
    }
    var onResize = function () { schedule(el.clientWidth, el.clientHeight); };
    global.addEventListener('resize', onResize);
    onResize();
    return function () { global.removeEventListener('resize', onResize); };
  }

  /**
   * Ajusta el búfer de un canvas a su tamaño CSS × devicePixelRatio (máximo opts.maxDpr = 2)
   * y fija la transformación para dibujar en píxeles CSS. Leer el layout fuera del bucle de dibujo.
   * opts: { width, height, maxDpr }. Devuelve { ctx, width, height, dpr }.
   */
  function fitCanvas(canvas, opts) {
    opts = opts || {};
    var w = opts.width !== undefined ? opts.width : canvas.clientWidth;
    var hgt = opts.height !== undefined ? opts.height : canvas.clientHeight;
    var dpr = Math.min(global.devicePixelRatio || 1, opts.maxDpr || 2);
    var bw = Math.max(1, Math.round(w * dpr));
    var bh = Math.max(1, Math.round(hgt * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    var ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: w, height: hgt, dpr: dpr };
  }

  /* ------------------------------------------------------------------ bucle de animación compartido */

  function raf(fn) {
    if (typeof global.requestAnimationFrame === 'function') return global.requestAnimationFrame(fn);
    return global.setTimeout(function () { fn(now()); }, 16);
  }

  function cancelRaf(id) {
    if (typeof global.cancelAnimationFrame === 'function') global.cancelAnimationFrame(id);
    else global.clearTimeout(id);
  }

  var loops = [];
  var rafId = null;
  var pageHidden = !!(doc && doc.hidden);

  function loopsWanted() {
    for (var i = 0; i < loops.length; i++) if (loops[i]._isActive()) return true;
    return false;
  }

  function scheduleTicker() {
    if (rafId === null && !pageHidden && loopsWanted()) rafId = raf(tick);
  }

  function tick(ts) {
    rafId = null;
    var t = typeof ts === 'number' ? ts : now();
    var list = loops.slice();
    for (var i = 0; i < list.length; i++) {
      var lp = list[i];
      if (loops.indexOf(lp) < 0) continue;
      if (!lp._isActive()) {
        lp._last = null;
        continue;
      }
      var dt = lp._last === null ? 0 : (t - lp._last) / 1000;
      if (dt < 0) dt = 0;
      if (dt > lp._maxDt) dt = lp._maxDt;
      lp._last = t;
      try {
        lp._fn(dt, t);
      } catch (err) {
        reportError('bucle de animación', err);
        lp.stop();
      }
    }
    scheduleTicker();
  }

  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', function () {
      pageHidden = !!doc.hidden;
      if (pageHidden) {
        if (rafId !== null) cancelRaf(rafId);
        rafId = null;
        for (var i = 0; i < loops.length; i++) loops[i]._last = null;
      } else {
        scheduleTicker();
      }
    });
  }

  /**
   * Registra fn(dt, now) en el ticker requestAnimationFrame único de la app.
   * dt en segundos (0 en el primer frame tras arrancar o reanudar; recortado a opts.maxDt = 0.1).
   * Se pausa solo con la pestaña oculta y, si se pasa opts.element, cuando ese elemento sale de pantalla.
   * opts: { element, maxDt = 0.1, autostart = false, rootMargin = '64px' }.
   * Devuelve { start(), stop(), toggle(), isRunning(), isActive(), destroy() }.
   *   isRunning(): el usuario lo quiere en marcha. isActive(): además está visible y la pestaña activa.
   */
  function loop(fn, opts) {
    opts = opts || {};
    var running = false;
    var onScreen = true;
    var stopObserving = null;
    var lp = {
      _fn: fn,
      _last: null,
      _maxDt: opts.maxDt || 0.1,
      _isActive: function () { return running && onScreen; },
      start: function () {
        if (loops.indexOf(lp) < 0) return lp;
        if (!running) {
          running = true;
          lp._last = null;
          scheduleTicker();
        }
        return lp;
      },
      stop: function () {
        running = false;
        lp._last = null;
        return lp;
      },
      toggle: function () { return running ? lp.stop() : lp.start(); },
      isRunning: function () { return running; },
      isActive: function () { return running && onScreen && !pageHidden; },
      destroy: function () {
        running = false;
        var i = loops.indexOf(lp);
        if (i >= 0) loops.splice(i, 1);
        if (stopObserving) stopObserving();
        stopObserving = null;
      }
    };
    loops.push(lp);
    if (opts.element) {
      onScreen = false;
      stopObserving = onVisible(opts.element, function (visible) {
        onScreen = visible;
        lp._last = null;
        if (visible) scheduleTicker();
      }, { rootMargin: opts.rootMargin || '64px' });
    }
    if (opts.autostart) lp.start();
    return lp;
  }

  /* ------------------------------------------------------------------ almacenamiento */

  /** localStorage con prefijo 'dsl.v1.', JSON y try/catch. Solo para el tema (ver ARCHITECTURE). */
  var store = {
    get: function (key, fallback) {
      try {
        var raw = global.localStorage.getItem(STORE_PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        global.localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove: function (key) {
      try {
        global.localStorage.removeItem(STORE_PREFIX + key);
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  /* ------------------------------------------------------------------ inicialización diferida */

  var LAZY_START_MS = 800;        // la cola ociosa arranca 800 ms después de 'app:ready'
  var LAZY_IDLE_TIMEOUT = 2000;   // requestIdleCallback({ timeout })
  var lazyQueue = [];             // instancias con fases pendientes, en orden de llegada (FIFO)
  var lazyReadyAt = null;         // instante de 'app:ready' (null: todavía no)
  var lazyTimer = null;
  var lazyIdlePending = false;

  function lazyRequestIdle() {
    if (lazyIdlePending) return;
    lazyIdlePending = true;
    if (typeof global.requestIdleCallback === 'function') {
      global.requestIdleCallback(lazyIdleStep, { timeout: LAZY_IDLE_TIMEOUT });
    } else {
      global.setTimeout(function () { lazyIdleStep(null); }, 1);
    }
  }

  function lazyPrune() {
    while (lazyQueue.length && lazyQueue[0]._finished()) lazyQueue.shift();
  }

  /** Una fase por llamada ociosa: la siguiente de la instancia más antigua con fases pendientes. */
  function lazyIdleStep() {
    lazyIdlePending = false;
    lazyPrune();
    if (!lazyQueue.length) return;
    lazyQueue[0]._step();
    lazyPrune();
    if (lazyQueue.length) lazyRequestIdle();
  }

  function lazySchedule() {
    lazyPrune();
    if (!lazyQueue.length || lazyReadyAt === null || lazyTimer !== null || lazyIdlePending) return;
    var wait = lazyReadyAt + LAZY_START_MS - now();
    if (wait > 0) {
      lazyTimer = global.setTimeout(function () {
        lazyTimer = null;
        lazySchedule();
      }, wait);
      return;
    }
    lazyRequestIdle();
  }

  DSL.bus.on('app:ready', function () {
    if (lazyReadyAt === null) lazyReadyAt = now();
    lazySchedule();
  });

  /**
   * Inicialización por fases: lazyInit(el, phases, { rootMargin = '200px' }) → { ensure(), done, destroy() }.
   * Cada fase (función) se ejecuta una sola vez y en orden. Si el elemento llega a rootMargin del
   * viewport, todas las que falten se ejecutan en el acto (en el mismo callback). Si no, una cola
   * FIFO común las ejecuta en tiempo ocioso, una por llamada, empezando 800 ms después de 'app:ready'
   * (requestIdleCallback con timeout 2000 o, sin él, setTimeout). ensure() ejecuta ya las pendientes.
   * Al terminar fija el.dataset.lazy = 'done'. Una fase que lanza un error se registra con
   * console.error y detiene esa instancia (el.dataset.lazy = 'error'); las demás siguen.
   */
  function lazyInit(el, phases, opts) {
    opts = opts || {};
    var list = [];
    var src = typeof phases === 'function' ? [phases] : phases || [];
    for (var i = 0; i < src.length; i++) if (typeof src[i] === 'function') list.push(src[i]);
    var next = 0;
    var running = false;
    var wantAll = false;
    var stopped = false;
    var stopVisible = null;

    var inst = {
      _finished: function () { return stopped || next >= list.length; },
      _step: function () { runOne(); }
    };

    function release() {
      if (stopVisible) {
        var s = stopVisible;
        stopVisible = null;
        s();
      }
      var k = lazyQueue.indexOf(inst);
      if (k >= 0) lazyQueue.splice(k, 1);
    }

    function complete() {
      if (el && el.dataset) el.dataset.lazy = 'done';
      release();
    }

    function runOne() {
      if (inst._finished() || running) return false;
      var fn = list[next++];
      running = true;
      try {
        fn();
      } catch (err) {
        running = false;
        stopped = true;
        if (el && el.dataset) el.dataset.lazy = 'error';
        reportError('lazyInit: la fase ' + next + ' de ' + list.length + ' falló', err);
        release();
        return false;
      }
      running = false;
      if (next >= list.length) {
        complete();
        return false;
      }
      if (wantAll) {
        wantAll = false;
        runAll();
      }
      return true;
    }

    function runAll() {
      if (running) {
        wantAll = true;
        return;
      }
      while (runOne()) { /* siguiente fase */ }
    }

    var api = {
      /** Ejecuta ya, en orden, todas las fases pendientes. */
      ensure: function () {
        runAll();
        return api;
      },
      /** Deja de observar y descarta las fases pendientes (no se ejecutarán). */
      destroy: function () {
        if (!inst._finished()) stopped = true;
        release();
      }
    };
    Object.defineProperty(api, 'done', {
      enumerable: true,
      get: function () { return !stopped && next >= list.length; }
    });

    if (!list.length) {
      complete();
      return api;
    }
    lazyQueue.push(inst);
    if (lazyReadyAt === null && DSL.app && DSL.app.ready) lazyReadyAt = now();
    var stop = onVisible(el, function (visible) {
      if (visible) runAll();
    }, { rootMargin: opts.rootMargin || '200px' });
    if (inst._finished()) stop();
    else stopVisible = stop;
    lazySchedule();
    return api;
  }

  /** Cede el hilo principal: scheduler.yield() si existe; si no, una promesa con setTimeout(0). */
  function yieldTask() {
    var sch = global.scheduler;
    if (sch && typeof sch.yield === 'function') {
      try {
        return sch.yield();
      } catch (e) { /* respaldo */ }
    }
    return new Promise(function (resolve) { global.setTimeout(resolve, 0); });
  }

  /* ------------------------------------------------------------------ exportación de utilidades */

  util.clamp = clamp;
  util.lerp = lerp;
  util.invLerp = invLerp;
  util.formatNumber = formatNumber;
  util.parseNumber = parseNumber;
  util.now = now;
  util.debounce = debounce;
  util.throttle = throttle;
  util.mulberry32 = mulberry32;
  util.gaussian = gaussian;
  util.cssVar = cssVar;
  util.uid = uid;
  util.escapeHtml = escapeHtml;
  util.h = h;
  util.svg = svg;
  util.ready = ready;
  util.onVisible = onVisible;
  util.observeSize = observeSize;
  util.fitCanvas = fitCanvas;
  util.raf = raf;
  util.cancelRaf = cancelRaf;
  util.loop = loop;
  util.lazyInit = lazyInit;
  util.yieldTask = yieldTask;
  util.store = store;
  util.SVG_NS = SVG_NS;

  /* ------------------------------------------------------------------ preferencias */

  var prefs = DSL.prefs;
  var RM_QUERY = '(prefers-reduced-motion: reduce)';
  var rmList = typeof global.matchMedia === 'function' ? global.matchMedia(RM_QUERY) : null;
  var rmOverride = null;

  function setReducedMotionValue(v) {
    v = !!v;
    if (v === prefs.reducedMotion) return;
    prefs.reducedMotion = v;
    DSL.bus.emit('motion:change', { reducedMotion: v });
  }

  // Comprobación en local: ?movimiento=normal|reducido fuerza la preferencia solo durante esta carga (no se
  // guarda). Útil en equipos cuyo sistema declara «reducir movimiento» (p. ej. Windows Server con los efectos
  // visuales desactivados), donde toda animación se sustituye por cambios instantáneos.
  var motionParam = global.location && /[?&]movimiento=(normal|reducido)(?:&|$)/.exec(String(global.location.search || ''));
  if (motionParam) rmOverride = motionParam[1] === 'reducido';
  prefs.reducedMotion = rmOverride === null ? !!(rmList && rmList.matches) : rmOverride;

  function onRmChange(e) {
    if (rmOverride === null) setReducedMotionValue(e && e.matches);
  }

  if (rmList) {
    if (typeof rmList.addEventListener === 'function') rmList.addEventListener('change', onRmChange);
    else if (typeof rmList.addListener === 'function') rmList.addListener(onRmChange);
  }

  /** Fuerza (true/false) o devuelve al sistema (null) la preferencia de movimiento reducido. */
  prefs.setReducedMotion = function (value) {
    rmOverride = value === null || value === undefined ? null : !!value;
    setReducedMotionValue(rmOverride === null ? !!(rmList && rmList.matches) : rmOverride);
  };

  var THEMES = { dark: 1, light: 1 };
  var root = doc && doc.documentElement;
  var initialTheme = root && root.getAttribute('data-theme');
  prefs.theme = THEMES[initialTheme] ? initialTheme : 'dark';

  /**
   * Cambia el tema ('dark' | 'light'): atributo data-theme en <html>, meta theme-color,
   * localStorage (clave dsl.v1.theme) y evento 'theme:change' { theme } si cambió.
   * opts.persist = false evita guardarlo. Devuelve el tema aplicado.
   */
  prefs.setTheme = function (theme, opts) {
    opts = opts || {};
    if (!THEMES[theme]) throw new Error('Tema desconocido: «' + theme + '». Use "dark" o "light".');
    if (root) root.setAttribute('data-theme', theme);
    if (opts.persist !== false) store.set('theme', theme);
    if (doc && typeof doc.querySelector === 'function') {
      var meta = doc.querySelector('meta[name="theme-color"]');
      var bg = cssVar('--bg');
      if (meta && bg) meta.setAttribute('content', bg);
    }
    if (theme !== prefs.theme) {
      prefs.theme = theme;
      DSL.bus.emit('theme:change', { theme: theme });
    }
    return theme;
  };

  prefs.toggleTheme = function () {
    return prefs.setTheme(prefs.theme === 'dark' ? 'light' : 'dark');
  };
})(typeof window !== 'undefined' ? window : globalThis);
