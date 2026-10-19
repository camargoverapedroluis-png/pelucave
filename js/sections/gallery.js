/*
 * js/sections/gallery.js — Propietario: gallery.
 * Sección #galeria → DSL.sections.gallery = { mount(el) → handle, helpers }.
 * Riel de sistemas (pestañas con indicador deslizante), escena física + gráficas en streaming
 * movidas por DSL.systems.Simulator en un único bucle rAF (DSL.util.loop: paso fijo, velocidad,
 * en pausa cuando el visor sale de pantalla y con la pestaña oculta), transporte, entrada,
 * parámetros en vivo, lecturas con KaTeX y «Ver G(s) paso a paso» (tf:open). El escenario se
 * construye por fases cortas (inicio perezoso y cambios de sistema). API: docs/api/gallery.md.
 */
(function (DSL) {
  'use strict';

  var util = DSL.util;
  var h = util.h;

  /* ------------------------------------------------------------------ textos y tablas fijas */

  var LEAD = 'Cada ejemplo ejecuta una simulación numérica en tiempo real. Cambie la entrada y los parámetros mientras corre y compare la escena física con sus gráficas.';

  // Resumen de una línea para el riel (el resumen largo del modelo va en la cabecera del sistema).
  var CARD_SUMMARY = {
    massSpring: 'Una masa, un resorte y un amortiguador: el segundo orden clásico.',
    tanks: 'El nivel sube con el caudal que entra y baja con el que sale.',
    rlc: 'Resistencia, inductor y capacitor en serie: el análogo eléctrico.',
    sir: 'Contagio y recuperación en una población cerrada.',
    market: 'El precio busca el cruce de oferta y demanda, o se aleja de él.'
  };

  // Etiquetas cortas del selector de variante (el nombre completo va en el tooltip y en la cabecera).
  var VARIANT_SHORT = {
    'tanks/lineal': 'Salida lineal',
    'tanks/torricelli': 'Torricelli',
    'tanks/cascada': 'Dos en cascada',
    'market/telarana': 'Telaraña (discreto)',
    'market/walras': 'Ajuste continuo'
  };

  // Magnitud que nombra el eje y de un grupo de series con la misma unidad.
  var UNIT_NOUN = {
    V: 'Tensión', A: 'Corriente', 'm³/s': 'Caudal', 'm/s': 'Velocidad', N: 'Fuerza', m: 'Longitud',
    personas: 'Personas', 'unid.': 'Cantidad', 'u.m.': 'Precio', '%': 'Porcentaje', rad: 'Ángulo',
    'rad/s': 'Velocidad angular'
  };

  // Cómo se dibuja la entrada en las gráficas cuando la serie necesita otro nombre o valor.
  var INPUT_VIEW = {
    'tanks/torricelli': {
      label: 'Caudal de entrada qᵢₙ',
      map: function (u, p) { return Math.max(0, (p.qin0 || 0) + u); }
    },
    'sir/base': { label: 'Reducción de contactos u' },
    'market/telarana': { label: 'Desplazamiento de la demanda Dₜ' },
    'market/walras': { label: 'Desplazamiento de la demanda D' }
  };

  var CONCEPT_LINK = {
    discrete: { label: 'Ver «Ecuaciones de representación»', payload: { card: 'ecuaciones' } },
    nonlinear: { label: 'Ver «Linealidad vs. no linealidad»', payload: { card: 'linealidad', tab: 'superposicion' } }
  };

  var INPUT_KEY = 'entrada';          // clave de la serie de entrada en las gráficas
  var SCENE_PARAMS_MS = 150;          // la escena se reconstruye al cambiar parámetros: como mucho ~7 veces/s
  var SWITCH_OUT_MS = 150;            // fundido de salida (--dur-fast) si no se puede leer del CSS
  var FADE_MARGIN_MS = 20;            // sin transición que esperar: el cambio empieza tras este margen
  var FADE_FALLBACK_MS = 250;         // respaldo si 'transitionend' no llega (pestaña oculta, sin cambio)
  var KEY_SWITCH_MS = 180;            // con flechas, se construye solo el sistema en el que se detiene el foco
  var TABLE_REFRESH_MS = 2000;        // «Ver datos» abierto durante la reproducción
  var ANNOUNCE_MS = 450;              // las lecturas se anuncian una vez, al dejar de mover el control
  var VIEWER_MARGIN = '64px';         // el bucle corre mientras el visor (escena + gráficas) está a la vista

  // Acción que acompaña a una salida del dominio económico en la telaraña (CORE-12).
  var DOMAIN_HINT_COBWEB = 'Acerque P₀ a P* y pulse «Reiniciar».';
  var DOMAIN_HINT_COBWEB_DIV = 'Baje d por debajo de b (o acerque P₀ a P*) y pulse «Reiniciar».';

  /* ------------------------------------------------------------------ utilidades puras */

  var SUB = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ',
    s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ', '+': '₊', '-': '₋', '(': '₍', ')': '₎'
  };
  var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺', '*': '*' };
  var GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
    lambda: 'λ', mu: 'μ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω', Omega: 'Ω',
    infty: '∞', cdot: '·', times: '×', max: 'max', min: 'min', ln: 'ln'
  };
  var RE_BAR = /\\bar\{([^{}])\}/g;
  var RE_CMD = /\\([A-Za-z]+)(?: (?=[A-Za-z]))?/g;
  var RE_SPACE_CMD = /\\[,;:! ]/g;
  var RE_SUB = /_\{([^{}]*)\}|_(.)/g;
  var RE_SUP = /\^\{([^{}]*)\}|\^(.)/g;

  function mapChars(s, table) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (!Object.prototype.hasOwnProperty.call(table, c)) return null;
      out += table[c];
    }
    return out;
  }

  /** TeX sencillo (símbolos de los modelos) → texto Unicode para leyendas y respaldos. */
  function texPlain(tex) {
    var s = String(tex === null || tex === undefined ? '' : tex);
    s = s.replace(RE_BAR, '$1̄');
    s = s.replace(RE_SPACE_CMD, ' ');
    s = s.replace(RE_CMD, function (m, name) { return Object.prototype.hasOwnProperty.call(GREEK, name) ? GREEK[name] : ''; });
    s = s.replace(RE_SUB, function (m, a, b) {
      var t = a !== undefined ? a : b;
      var r = mapChars(t, SUB);
      return r === null ? t : r;
    });
    s = s.replace(RE_SUP, function (m, a, b) {
      var t = a !== undefined ? a : b;
      var r = mapChars(t, SUP);
      return r === null ? '^' + t : r;
    });
    return s.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  }

  /** Decimales de la lectura del tiempo según el horizonte (15 s → 1, 0.12 s → 3, 150 s → 0). */
  function timeDecimals(duration, discrete) {
    if (discrete) return 0;
    if (!(duration > 0)) return 2;
    return Math.max(0, Math.min(4, 3 - Math.ceil(Math.log10(duration) - 1e-9)));
  }

  /** Unidad y factor con que se muestra un parámetro (ParamSpec.display, p. ej. mH ×1000). */
  function displayOf(spec) {
    var d = spec && spec.display;
    if (d && d.factor > 0 && isFinite(d.factor)) return { unit: d.unit || '', factor: d.factor };
    return { unit: (spec && spec.unit) || '', factor: 1 };
  }

  /** Producto sin restos binarios visibles (0.0005 × 1e4 = 5, no 5.000000000000001). */
  function scaleNum(x, f) {
    return Number((Number(x) * f).toPrecision(12));
  }

  var EDGE = 0.02;                    // si la curva queda a menos del 2 % del borde, el eje gana una marca

  function niceBoundsLocal(lo, hi) {
    var span = hi - lo;
    if (!(span > Math.max(Math.abs(lo), Math.abs(hi)) * 1e-9)) {
      var d = Math.abs(hi) * 0.1 || 1;
      lo -= d;
      hi += d;
      span = hi - lo;
    }
    var raw = span / 5;
    var e = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / e;
    var step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e;
    var a = Math.floor(lo / step + 1e-9) * step;
    var b = Math.ceil(hi / step - 1e-9) * step;
    return { min: Number(a.toPrecision(12)), max: Number((b > a ? b : a + step).toPrecision(12)), step: step };
  }

  /** Límites «bonitos» del eje y que contienen [lo, hi]; null si no hay datos. */
  function niceRange(lo, hi) {
    if (!(isFinite(lo) && isFinite(hi))) return null;
    if (lo > hi) { var t = lo; lo = hi; hi = t; }
    var H = DSL.viz && DSL.viz.charts && DSL.viz.charts.helpers;
    var nb = H && typeof H.niceBounds === 'function' ? H.niceBounds(lo, hi, { pad: 0 }) : niceBoundsLocal(lo, hi);
    var min = nb.min;
    var max = nb.max;
    var step = nb.step > 0 ? nb.step : (max - min) / 5;
    // La curva no toca el borde del marco: una marca más arriba (o abajo), salvo en el cero.
    var tol = (max - min) * EDGE;
    if (hi !== 0 && max - hi < tol) max = Number((max + step).toPrecision(12));
    if (lo !== 0 && lo - min < tol) min = Number((min - step).toPrecision(12));
    return { min: min, max: max };
  }

  /**
   * Cierra una frase con un punto, salvo que ya termine en signo de cierre: las unidades «unid.» y
   * «u.m.» ya llevan el suyo («70 unid.», no «70 unid..»).
   */
  function sentence(s) {
    var t = String(s === null || s === undefined ? '' : s).replace(/\s+$/, '');
    if (!t) return '';
    return /[.!?…]$/.test(t) ? t : t + '.';
  }

  /** ¿La detención es una salida del dominio del modelo (hook domain() del simulador)? */
  function isDomainHalt(p) {
    if (!p) return false;
    if (p.kind === 'domain' || p.kind === 'dominio') return true;
    return /dominio/i.test(String(p.reason || ''));
  }

  /** Duración del fundido de un elemento según su CSS (ms): la transición más larga, con su retardo. */
  function parseTimes(list) {
    return String(list || '').split(',').map(function (x) {
      var v = parseFloat(x);
      if (!isFinite(v)) return 0;
      return /ms\s*$/.test(x) ? v : v * 1000;
    });
  }

  function firstWord(s) {
    var m = /^[^\s:]+/.exec(String(s || ''));
    return m ? m[0] : '';
  }

  function nounOf(group) {
    var labels = group.series.map(function (s) { return s.label; });
    if (labels.length === 1) return labels[0];
    var w = firstWord(labels[0]);
    if (w && labels.every(function (l) { return firstWord(l) === w; })) return w;
    return UNIT_NOUN[group.unit] || w || 'Valor';
  }

  /**
   * Plan de gráficas de una variante con un tipo de entrada: salidas agrupadas por unidad (como mucho
   * dos gráficas). Una salida con `dash: true` (p. ej. la predicción lineal hLin de Torricelli) se
   * dibuja discontinua en la gráfica de su unidad. La entrada (discontinua, --c-in) se suma al grupo
   * de su misma unidad; si no hay ninguno y queda sitio, forma su propia gráfica. Con «ninguna» no
   * se dibuja.
   * → [{ id, unit, noun, yLabel, series: [{ key, label, color, dash, unit, kind, factor }] }]
   */
  function chartPlan(desc, inputType, modelId) {
    var groups = [];
    function groupFor(unit) {
      for (var i = 0; i < groups.length; i++) if (groups[i].unit === unit) return groups[i];
      return null;
    }
    (desc.outputs || []).forEach(function (o) {
      var g = groupFor(o.unit || '');
      if (!g) groups.push(g = { unit: o.unit || '', series: [] });
      g.series.push({ key: o.key, label: o.label || o.key, color: o.color || null, dash: !!o.dash, unit: o.unit || '', kind: 'output', factor: 1 });
    });
    var spec = null;
    (desc.inputs || []).forEach(function (i) { if (i.id === inputType) spec = i; });
    if (spec && spec.id !== 'ninguna') {
      var view = INPUT_VIEW[(modelId || (desc.model && desc.model.id)) + '/' + desc.variant.id] || {};
      var s = {
        key: INPUT_KEY,
        label: view.label || ('Entrada ' + texPlain(spec.symbol)),
        color: '--c-in',
        dash: true,
        unit: spec.unit || '',
        kind: 'input',
        factor: 1
      };
      var same = groupFor(s.unit);
      if (same) {
        same.series.push(s);
      } else if (groups.length < 2) {
        var amp = null;
        (spec.params || []).forEach(function (p) { if (!amp && (p.key === 'amplitude' || p.key === 'offset')) amp = p; });
        if (amp && amp.display && amp.display.factor > 0) {
          s.factor = amp.display.factor;
          s.unit = amp.display.unit || '';
        }
        groups.push({ unit: s.unit, series: [s] });
      }
    }
    groups = groups.slice(0, 2);
    groups.forEach(function (g, i) {
      g.id = 'g' + (i + 1);
      g.noun = nounOf(g);
      var unit = g.unit;
      g.yLabel = unit && unit.toLowerCase() !== g.noun.toLowerCase() ? g.noun + ' (' + unit + ')' : g.noun;
    });
    return groups;
  }

  /** Firma de un plan: si cambia, las gráficas se reconstruyen. */
  function planSignature(plan) {
    return plan.map(function (g) {
      return g.series.map(function (s) { return s.key + ':' + s.unit + ':' + s.factor; }).join(',');
    }).join('|');
  }

  function horizonOf(hints) {
    var d = hints && hints.duration;
    return d > 0 && isFinite(d) ? d : 10;
  }

  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  function readoutValue(r) {
    if (r.text && !isNum(r.value)) return r.text;
    return isNum(r.value) ? r.value : null;
  }

  function findStep(steps, id) {
    for (var i = 0; i < steps.length; i++) if (steps[i].id === id) return steps[i];
    return null;
  }

  /* ------------------------------------------------------------------ montaje */

  function mount(el) {
    var ui = DSL.ui;
    var S = DSL.systems;
    var charts = DSL.viz && DSL.viz.charts;
    var scenes = DSL.viz && DSL.viz.scenes;
    var latex = DSL.core && DSL.core.latex;
    var models = S.list();
    var alive = true;
    var loop = null;
    var cur = null;                    // vista del sistema actual (solo cuando está completa)
    var cleanups = [];
    var timers = [];
    var paintFrame = null;
    var plateReady = false;
    var viewerOn = false;              // el visor del cuerpo actual está a la vista: el bucle puede correr

    var app = {
      systemId: models.length ? models[0].id : null,
      variant: null,
      playing: false,
      speed: 1,
      inputMemo: {}                    // valores de entrada por sistema/variante/tipo (solo en memoria)
    };

    function reduced() { return !!(DSL.prefs && DSL.prefs.reducedMotion); }

    function later(fn, ms) {
      var id = setTimeout(function () {
        var i = timers.indexOf(id);
        if (i >= 0) timers.splice(i, 1);
        if (alive) fn();
      }, ms);
      timers.push(id);
      return id;
    }

    function cancel(id) {
      if (id === null || id === undefined) return null;
      clearTimeout(id);
      var i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
      return null;
    }

    /** Siguiente tarea: util.yieldTask (scheduler.yield) si existe; si no, setTimeout(0). */
    function nextTask(fn) {
      if (typeof util.yieldTask === 'function') {
        var p = null;
        try { p = util.yieldTask(); } catch (err) { p = null; }
        if (p && typeof p.then === 'function') {
          p.then(function () { if (alive) fn(); });
          return;
        }
      }
      later(fn, 0);
    }

    function renderTex(target, tex, display) {
      if (latex && typeof latex.render === 'function') latex.render(target, tex, { display: !!display });
      else target.textContent = tex;
      return target;
    }

    function texSpan(tex, cls) {
      return renderTex(h('span', { class: cls || 'ds-math', translate: 'no' }), tex, false);
    }

    /* ---------------------------------------------------------------- cabecera de la sección */

    var head = h('div', { class: 'gl-head' },
      h('h2', { id: 'galeria-title' }, 'Galería de ejemplos interactivos'),
      h('p', { class: 'gl-lead' }, LEAD));

    /* ---------------------------------------------------------------- riel de sistemas (tablist) */

    var stageId = util.uid('gl-stage');
    var plate = h('span', { class: 'gl-rail__plate', 'aria-hidden': 'true', 'data-testid': 'gl-rail-plate' });
    var rail = h('div', {
      class: 'gl-rail',
      role: 'tablist',
      'aria-label': 'Sistemas de la galería',
      'data-testid': 'gl-rail'
    }, plate);

    var nameIds = [];
    var tabs = models.map(function (m) {
      var nameId = util.uid('gl-sys-name');
      var sumId = util.uid('gl-sys-sum');
      var cat = ui.chip({ label: S.CATEGORIES[m.category] || m.category, className: 'gl-sys__cat' });
      cat.id = util.uid('gl-sys-cat');
      nameIds.push(nameId);
      var b = h('button', {
        type: 'button',
        role: 'tab',
        id: util.uid('gl-tab'),
        class: 'gl-sys',
        'aria-selected': 'false',
        'aria-controls': stageId,
        // El nombre es el texto visible, en su orden (categoría, nombre, resumen): WCAG 2.5.3. Los
        // espacios entre las partes (invisibles en la rejilla) separan las palabras del texto visible.
        'aria-labelledby': cat.id + ' ' + nameId + ' ' + sumId,
        tabindex: '-1',
        'data-system': m.id,
        'data-testid': 'gl-system-' + m.id
      },
      h('span', { class: 'gl-sys__top' },
        h('span', { class: 'gl-sys__icon' }, ui.icon(m.icon, { size: 20 })),
        cat),
      ' ',
      h('span', { class: 'gl-sys__name', id: nameId }, m.name),
      ' ',
      h('span', { class: 'gl-sys__sum', id: sumId }, CARD_SUMMARY[m.id] || m.summary || ''));
      b.addEventListener('click', function () { selectSystem(m.id, null); });
      rail.appendChild(b);
      return b;
    });

    function indexOfSystem(id) {
      for (var i = 0; i < models.length; i++) if (models[i].id === id) return i;
      return -1;
    }

    function placePlate() {
      var b = tabs[indexOfSystem(app.systemId)];
      if (!b) return;
      var w = b.offsetWidth;
      var hh = b.offsetHeight;
      if (!(w > 0)) return;
      plate.style.setProperty('--plate-x', b.offsetLeft + 'px');
      plate.style.setProperty('--plate-y', b.offsetTop + 'px');
      plate.style.setProperty('--plate-w', w + 'px');
      plate.style.setProperty('--plate-h', hh + 'px');
      if (!plateReady) {
        plateReady = true;
        util.raf(function () { if (alive) rail.classList.add('is-ready'); });
      }
    }

    function paintRail() {
      var idx = indexOfSystem(app.systemId);
      tabs.forEach(function (b, i) {
        var on = i === idx;
        b.setAttribute('aria-selected', String(on));
        b.setAttribute('tabindex', on ? '0' : '-1');
        b.classList.toggle('is-selected', on);
      });
      // El panel se nombra solo con el nombre del sistema (no con la tarjeta entera).
      if (nameIds[idx]) stage.setAttribute('aria-labelledby', nameIds[idx]);
      placePlate();
    }

    function onRailKey(e) {
      var t = e.target && e.target.closest ? e.target.closest('[role="tab"]') : null;
      var i = tabs.indexOf(t);
      if (i < 0) return;
      var n = tabs.length;
      var next;
      switch (e.key) {
        case 'ArrowRight': next = (i + 1) % n; break;
        case 'ArrowLeft': next = (i - 1 + n) % n; break;
        case 'Home': next = 0; break;
        case 'End': next = n - 1; break;
        default: return;
      }
      e.preventDefault();
      tabs[next].focus();
      if (typeof tabs[next].scrollIntoView === 'function' && rail.scrollWidth > rail.clientWidth) {
        tabs[next].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      }
      selectSystem(models[next].id, null, { delay: KEY_SWITCH_MS });
    }
    rail.addEventListener('keydown', onRailKey);
    cleanups.push(function () { rail.removeEventListener('keydown', onRailKey); });

    /* ---------------------------------------------------------------- escenario (tabpanel) */

    var stage = h('div', {
      class: 'gl-stage is-pending',
      id: stageId,
      role: 'tabpanel',
      'aria-busy': 'true',
      'data-testid': 'gl-stage'
    });

    /**
     * Esqueleto con la geometría final (cabecera, escena, dos gráficas y dock) mientras el escenario
     * no está construido: un salto a la galería nunca muestra una franja vacía.
     */
    var skeleton = h('div', { class: 'gl-skel', 'aria-hidden': 'true', 'data-testid': 'gl-skeleton' },
      h('div', { class: 'gl-skel__head' },
        h('span', { class: 'gl-skel__icon' }),
        h('span', { class: 'gl-skel__lines' },
          h('span', { class: 'gl-skel__line gl-skel__line--title' }),
          h('span', { class: 'gl-skel__line' }))),
      h('div', { class: 'gl-main' },
        h('div', { class: 'sc-stage gl-scene gl-skel__scene' }),
        h('div', { class: 'gl-charts gl-skel__charts', 'data-count': '2' },
          h('div', { class: 'ch-frame gl-chart gl-skel__chart' }),
          h('div', { class: 'ch-frame gl-chart gl-skel__chart' }))),
      h('div', { class: 'gl-skel__dock' }));
    stage.appendChild(skeleton);

    function removeSkeleton() {
      if (skeleton && skeleton.parentNode) skeleton.parentNode.removeChild(skeleton);
      skeleton = null;
    }

    var root = h('div', { class: 'gl' }, head, rail, stage);
    el.appendChild(root);
    paintRail();
    cleanups.push(util.observeSize(rail, placePlate));

    /* ---------------------------------------------------------------- transiciones */

    // Un cambio en curso (sistema o variante): fundido de salida completo, construcción en tareas
    // cortas (DOM, escena, gráficas, primer fotograma) y fundido de entrada.
    var swap = { timer: null, unlisten: null, op: null, faded: null, lastSteps: [] };
    var fadeCache = {};

    /** Duración del fundido de salida según el CSS (se lee una vez por modo de movimiento). */
    function fadeMs(target) {
      var key = reduced() ? 'reduced' : 'full';
      if (fadeCache[key] !== undefined) return fadeCache[key];
      var cs = null;
      try { cs = window.getComputedStyle(target); } catch (err) { cs = null; }
      if (!cs) return SWITCH_OUT_MS;
      var d = parseTimes(cs.transitionDuration);
      var dl = parseTimes(cs.transitionDelay);
      var max = 0;
      for (var i = 0; i < d.length; i++) max = Math.max(max, d[i] + (dl.length ? dl[i % dl.length] : 0));
      fadeCache[key] = max;
      return max;
    }

    function stopFade() {
      swap.timer = cancel(swap.timer);
      if (swap.unlisten) swap.unlisten();
      swap.unlisten = null;
    }

    /**
     * Fundido de salida hasta el final; después (y no antes de `delay` ms) llama a then(), en otra tarea.
     * Se espera a 'transitionend': el reloj de las animaciones solo avanza con cada fotograma, así que un
     * temporizador fijo podía empezar la construcción (sin fotogramas) con la salida a medias y la
     * entrada quedaba invertida y acortada, o sin fundido. El temporizador queda como respaldo.
     */
    function fadeOut(target, then, delay) {
      stopFade();
      var already = swap.faded === target && target.classList.contains('is-leaving');
      target.classList.add('is-leaving');
      var ms = already ? 0 : fadeMs(target);
      var t0 = util.now();
      function fire() {
        stopFade();
        swap.faded = target;
        then();
      }
      if (ms > 0) {
        var onEnd = function (e) {
          if (e.target !== target || e.propertyName !== 'opacity') return;
          stopFade();
          swap.timer = later(fire, Math.max(0, (delay || 0) - (util.now() - t0)));
        };
        target.addEventListener('transitionend', onEnd);
        swap.unlisten = function () { target.removeEventListener('transitionend', onEnd); };
      }
      var wait = ms > 0 ? ms + FADE_FALLBACK_MS : already ? 0 : FADE_MARGIN_MS;
      swap.timer = later(fire, Math.max(wait, delay || 0));
    }

    /**
     * Fundido de entrada: el elemento ya se pintó con opacidad 0 (el de salida terminó), así que basta
     * con quitar la clase; la transición de entrada arranca desde 0 sin forzar estilos ni maquetación.
     */
    function fadeIn(target) {
      if (swap.faded === target) swap.faded = null;
      target.classList.remove('is-leaving');
    }

    function cancelSwap() {
      var op = swap.op;
      swap.op = null;
      stopFade();
      if (op && !op.cancelled) {
        op.cancelled = true;
        if (op.cleanup) op.cleanup();
      }
    }

    /** Ejecuta los pasos de `op` en tareas separadas; se detiene si la operación se cancela. */
    function runSteps(op, steps, done) {
      var i = 0;
      var ms = [];
      function next() {
        if (op.cancelled || !alive) return;
        var t0 = util.now();
        try {
          steps[i++]();
          ms.push(Math.round(util.now() - t0));
        } catch (err) {
          if (swap.op === op) swap.op = null;
          op.cancelled = true;
          if (op.cleanup) op.cleanup();
          if (op.target) fadeIn(op.target);
          throw err;
        }
        if (op.cancelled) return;
        if (i < steps.length) nextTask(next);
        else {
          if (swap.op === op) swap.op = null;
          swap.lastSteps = ms;          // duración de cada paso del último cambio (state().switchSteps)
          done();
        }
      }
      next();
    }

    /* ---------------------------------------------------------------- selección */

    function selectSystem(id, variant, opts) {
      if (!S.get(id) || indexOfSystem(id) < 0) return;
      var changed = id !== app.systemId;
      app.systemId = id;
      if (changed) app.variant = variant || null;
      else if (variant) app.variant = variant;
      paintRail();
      if (!phase.done) {
        if (phase.next <= 1) return;       // el escenario aún no existe: las fases construyen el elegido
        ensureInit();
        if (!phase.done) return;
      }
      var op = swap.op;
      if (!changed) {
        if (op && op.kind === 'system' && op.systemId === id) return;   // la variante se aplica al terminar
        if (cur && cur.model.id === id && !(op && op.kind === 'system')) {
          if (variant) selectVariant(variant);
          return;
        }
      }
      switchSystem(opts && opts.delay);
    }

    /** gallery:open y handle.select(): también antes del arranque perezoso (lo completa en el acto). */
    function openSystem(id, variant) {
      if (!S.get(id) || indexOfSystem(id) < 0) return;
      if (!phase.done && phase.next <= 1) {
        app.systemId = id;
        app.variant = variant || null;
        paintRail();
        ensureInit();
        return;
      }
      ensureInit();
      selectSystem(id, variant || null);
    }

    function switchSystem(delay) {
      cancelSwap();
      var op = { kind: 'system', systemId: app.systemId, cancelled: false, cleanup: null, target: stage };
      var ctx = { view: null };
      op.cleanup = function () {
        if (ctx.view && ctx.view !== cur) destroySystem(ctx.view);
        ctx.view = null;
      };
      swap.op = op;
      fadeOut(stage, function () {
        if (op.cancelled) return;
        runSteps(op, [
          function () {
            destroySystem(cur);
            cur = null;
            removeSkeleton();
            stage.setAttribute('aria-busy', 'true');
            ctx.view = createView(op.systemId, app.variant);
            bodyDom(ctx.view);
          },
          function () { bodyScene(ctx.view); },
          function () { bodyPlan(ctx.view); },
          function () { bodyChart(ctx.view, 0); },
          function () { bodyChart(ctx.view, 1); },
          function () { bodyPanels(ctx.view, 0); },
          function () { bodyPanels(ctx.view, 1); },
          function () { bodyPanels(ctx.view, 2); },
          function () {
            var v = ctx.view;
            ctx.view = null;
            bodyFirst(v);
            cur = v;
          }
        ], function () {
          stage.removeAttribute('aria-busy');
          fadeIn(stage);
          if (cur && app.systemId !== cur.model.id) selectSystem(app.systemId, app.variant);
          else if (cur && app.variant && app.variant !== cur.sim.variant) selectVariant(app.variant);
        });
      }, delay);
    }

    function selectVariant(v) {
      if (!cur) return;
      var vid;
      try { vid = S.variantOf(cur.model, v).id; } catch (err) { return; }
      app.variant = vid;
      if (cur.variantSeg && cur.variantSeg.value !== vid) cur.variantSeg.set(vid, { silent: true });
      var op = swap.op;
      if (op && op.kind === 'variant' && op.view === cur) {
        if (op.variant === vid) return;            // ya se está construyendo esa variante
      } else if (vid === cur.sim.variant && cur.body) {
        return;
      }
      var view = cur;
      cancelSwap();
      var nop = { kind: 'variant', systemId: view.model.id, variant: vid, view: view, cancelled: false, cleanup: null, target: view.bodyHost };
      swap.op = nop;
      fadeOut(view.bodyHost, function () {
        if (nop.cancelled || view !== cur) return;
        nop.cleanup = function () { if (view.pending) destroyBody(view); };
        runSteps(nop, [
          function () {
            destroyBody(view);
            view.sim.setVariant(vid);
            bodyDom(view);
          },
          function () { bodyScene(view); },
          function () { bodyPlan(view); },
          function () { bodyChart(view, 0); },
          function () { bodyChart(view, 1); },
          function () { bodyPanels(view, 0); },
          function () { bodyPanels(view, 1); },
          function () { bodyPanels(view, 2); },
          function () { bodyFirst(view); }
        ], function () { fadeIn(view.bodyHost); });
      });
    }

    /* ---------------------------------------------------------------- vista de un sistema */

    /** Simulador y cabecera del sistema (el cuerpo de la variante se construye por pasos). */
    function createView(systemId, variantId) {
      var model = S.get(systemId);
      var variant;
      try { variant = S.variantOf(model, variantId || undefined).id; } catch (err) { variant = S.variantOf(model).id; }
      app.variant = variant;
      var sim = new S.Simulator(model, { variant: variant, speed: app.speed });

      var view = { model: model, sim: sim, body: null, pending: null, variantSeg: null, unsubs: [] };

      var title = h('h3', { class: 'gl-shead__title', 'data-testid': 'gl-title' }, model.name);
      view.chipsEl = h('div', { class: 'gl-shead__chips' });
      view.summaryEl = h('p', { class: 'gl-shead__summary', 'data-testid': 'gl-summary' });
      if (model.variants.length > 1) {
        view.variantSeg = ui.segmented({
          label: 'Variante del modelo',
          options: model.variants.map(function (v) {
            return { value: v.id, label: VARIANT_SHORT[model.id + '/' + v.id] || v.label, title: v.label };
          }),
          value: variant,
          equal: false,
          testid: 'gl-variant',
          className: 'gl-variant',
          onChange: function (v) { selectVariant(v); }
        });
      }
      var header = h('div', { class: 'gl-shead' },
        h('span', { class: 'gl-shead__icon', 'aria-hidden': 'true' }, ui.icon(model.icon, { size: 22 })),
        h('div', { class: 'gl-shead__main' },
          title,
          view.variantSeg ? h('div', { class: 'gl-seg-wrap' }, view.variantSeg.el) : null,
          view.summaryEl),
        view.chipsEl);
      view.bodyHost = h('div', { class: 'gl-bodyhost' });
      view.root = h('div', { class: 'gl-system', 'data-system': model.id }, header, view.bodyHost);
      stage.appendChild(view.root);

      // Eventos del simulador: actúan sobre el cuerpo vigente (se reconstruye al cambiar de variante).
      view.unsubs.push(sim.on('step', function (p) { if (view.body) onStep(view, view.body, p); }));
      view.unsubs.push(sim.on('reset', function (p) { if (view.body) onReset(view, view.body, p); }));
      view.unsubs.push(sim.on('halt', function (p) { if (view.body) onHalt(view, view.body, p); }));
      view.unsubs.push(sim.on('params', function () { if (view.body) onParams(view, view.body); }));
      return view;
    }

    function destroySystem(view) {
      if (!view) return;
      destroyBody(view);
      view.unsubs.forEach(function (off) { off(); });
      view.unsubs = [];
      if (view.variantSeg) view.variantSeg.destroy();
      view.sim.destroy();
      if (view.root.parentNode) view.root.parentNode.removeChild(view.root);
    }

    /* ---------------------------------------------------------------- cuerpo de una variante */

    /**
     * Paso 1: DOM del cuerpo (visor con su dock, contenedores de los paneles y de G(s)), sin escena,
     * gráficas ni contenido de los paneles (cada parte se construye y se maqueta en su propia tarea).
     */
    function bodyDom(view) {
      var model = view.model;
      var sim = view.sim;
      var variant = sim.variant;
      var desc = S.describe(model, variant);
      var discrete = desc.variant.timeDomain === 'discrete';
      // Cada sistema o variante nuevo arranca solo; con movimiento reducido empieza en pausa (trayectoria completa).
      app.playing = !reduced();
      var b = {
        desc: desc,
        variant: variant,
        discrete: discrete,
        horizon: horizonOf(sim.hints),
        inputType: sim.input.type,
        charts: [],
        plan: [],
        sliders: [],
        inputSliders: [],
        readouts: [],
        last: { t: sim.t, state: sim.state, outputs: sim.outputs, u: sim.u },
        frame: { t: 0, dt: 0, state: null, outputs: null, params: null, input: { type: 'ninguna', value: 0 }, variant: variant },
        params: sim.params,
        sceneParams: sim.params,
        sceneParamsAt: 0,
        sceneTimer: null,
        announceTimer: null,
        stopVis: null,
        lastPushT: null,
        suppressPush: false,
        atEnd: false,
        halted: false,
        tableClock: 0,
        alive: true
      };
      view.pending = b;
      remember(view, b, sim.input);

      // Cabecera dependiente de la variante: chips y resumen.
      view.chipsEl.textContent = '';
      view.chipsEl.appendChild(ui.chip({ label: S.CATEGORIES[model.category] || model.category, testid: 'gl-chip-category' }));
      view.chipsEl.appendChild(ui.chip({ label: desc.variant.linear ? 'Lineal' : 'No lineal', testid: 'gl-chip-linear' }));
      view.chipsEl.appendChild(ui.chip({ label: discrete ? 'Tiempo discreto' : 'Tiempo continuo', testid: 'gl-chip-time' }));
      view.summaryEl.textContent = (desc.variant.summary || model.summary || '');

      /* ---------- visor: escena + gráficas + avisos + dock */
      b.sceneBox = h('div', { class: 'sc-stage gl-scene', 'data-testid': 'gl-scene-box' });
      b.chartsBox = h('div', { class: 'gl-charts', 'data-testid': 'gl-charts' });
      b.haltText = h('p', { class: 'gl-halt__text' });
      b.haltEl = h('div', { class: 'ds-callout ds-callout--warning gl-halt', role: 'status', 'data-testid': 'gl-halt' },
        ui.icon('triangle-alert'), b.haltText);
      b.haltEl.hidden = true;
      b.noteText = h('p', { class: 'gl-note__text' });
      b.noteEl = h('div', { class: 'ds-callout gl-note', role: 'status', 'data-testid': 'gl-note' },
        ui.icon('info'), b.noteText);
      b.noteEl.hidden = true;
      b.dock = h('div', { class: 'gl-dock ds-glass', 'data-testid': 'gl-dock' });
      b.viewer = h('div', { class: 'gl-viewer', 'data-testid': 'gl-viewer' },
        h('div', { class: 'gl-main' }, b.sceneBox, b.chartsBox),
        b.haltEl,
        b.noteEl,
        b.dock);
      b.dataRow = h('div', { class: 'gl-data', 'data-testid': 'gl-data' });

      /* ---------- paneles */
      var paramsTitleId = util.uid('gl-pt');
      var inputTitleId = util.uid('gl-it');
      var readTitleId = util.uid('gl-rt');
      b.paramsList = h('div', { class: 'gl-sliders', 'data-testid': 'gl-params' });
      b.restoreBtn = ui.button({
        label: 'Restablecer parámetros',
        icon: 'sliders-horizontal',
        variant: 'ghost',
        size: 'sm',
        testid: 'gl-params-restore',
        onClick: function () { restoreParams(view, b); }
      });
      var paramsPanel = h('section', { class: 'ds-panel gl-panel gl-panel--params', 'aria-labelledby': paramsTitleId },
        h('div', { class: 'gl-panel__head' },
          h('h4', { class: 'gl-panel__title', id: paramsTitleId }, 'Parámetros'),
          b.restoreBtn),
        b.paramsList);

      b.inputDesc = h('p', { class: 'gl-input__desc', 'data-testid': 'gl-input-desc' });
      b.inputList = h('div', { class: 'gl-sliders', 'data-testid': 'gl-input-params' });
      b.inputSeg = ui.segmented({
        label: 'Tipo de entrada',
        options: desc.inputs.map(function (i) { return { value: i.id, label: i.label, title: i.description || null }; }),
        value: b.inputType,
        equal: false,
        testid: 'gl-input',
        className: 'gl-input__seg',
        onChange: function (v) { setInputType(view, b, v); }
      });
      var inputPanel = h('section', { class: 'ds-panel gl-panel gl-panel--input', 'aria-labelledby': inputTitleId },
        h('div', { class: 'gl-panel__head' },
          h('h4', { class: 'gl-panel__title', id: inputTitleId }, 'Entrada'),
          texSpan(desc.inputs.length ? (inputSpecOf(b, b.inputType) || desc.inputs[0]).symbol : 'u(t)', 'ds-math gl-panel__sym')),
        h('div', { class: 'gl-seg-wrap' }, b.inputSeg.el),
        b.inputDesc,
        b.inputList);
      b.inputSymEl = inputPanel.querySelector('.gl-panel__sym');

      b.readList = h('div', { class: 'gl-readouts', 'data-testid': 'gl-readouts' });
      var readPanel = h('section', { class: 'ds-panel gl-panel gl-panel--read', 'aria-labelledby': readTitleId },
        h('div', { class: 'gl-panel__head' }, h('h4', { class: 'gl-panel__title', id: readTitleId }, 'Lecturas en vivo')),
        b.readList);

      var panels = h('div', { class: 'gl-panels' }, paramsPanel, inputPanel, readPanel);

      b.tfRow = h('div', { class: 'gl-tf', 'data-testid': 'gl-tf' });

      b.root = h('div', { class: 'gl-body', 'data-variant': variant }, b.viewer, b.dataRow, panels, b.tfRow);
      view.bodyHost.appendChild(b.root);
      buildTransport(view, b);
      return b;
    }

    /**
     * Pasos 4a, 4b y 4c: contenido de los paneles (parámetros y entrada; lecturas con KaTeX; fila de G(s)
     * o explicación). Cada paso maqueta lo que añade (lectura de offsetHeight), así el coste no se acumula
     * en un único fotograma posterior.
     */
    function bodyPanels(view, part) {
      var b = view.pending;
      if (!b) return;
      if (part === 0) {
        buildParamSliders(view, b);
        buildInputSliders(view, b);
      } else if (part === 1) {
        buildReadouts(view, b);
      } else {
        buildTfRow(view, b);
      }
      void b.root.offsetHeight;
    }

    /** Paso 2: escena física (mide su contenedor). */
    function bodyScene(view) {
      var b = view.pending;
      if (b) buildScene(view, b);
    }

    /** Paso 3: plan de gráficas y rango previsto de cada una (simulación por lotes del horizonte). */
    function bodyPlan(view) {
      var b = view.pending;
      if (!b) return;
      b.plan = chartPlan(b.desc, b.inputType, view.model.id);
      startCharts(view, b);
    }

    /**
     * Pasos 3a y 3b: cada gráfica en su propia tarea, creada ya con el rango previsto del eje y (sin
     * salto en el primer dibujo).
     */
    function bodyChart(view, i) {
      var b = view.pending;
      if (!b || !b.plan) return;
      if (i < b.plan.length) addChart(view, b, i);
    }

    /** Último paso: primera muestra, primer fotograma, visor observado y reproducción. */
    function bodyFirst(view) {
      var b = view.pending;
      if (!b) return;
      view.pending = null;
      view.body = b;
      pushSample(view, b, b.last, true);
      if (reduced()) showEnd(view, b);
      else paint(view, b, 0);
      b.stopVis = util.onVisible(b.viewer, function (visible) {
        if (!b.alive || view.body !== b) return;
        viewerOn = !!visible;
        syncLoop();
        if (visible) requestPaint();
        else flushCharts(b);   // lo último que llegó se dibuja ya: sin repintados diferidos con el bucle parado
      }, { rootMargin: VIEWER_MARGIN });
      setPlaying(app.playing, b);
    }

    function destroyBody(view) {
      var b = view && (view.body || view.pending);
      if (!b) return;
      var wasCurrent = view.body === b;
      view.body = null;
      view.pending = null;
      b.alive = false;
      if (wasCurrent) {
        viewerOn = false;
        syncLoop();
      }
      if (b.stopVis) b.stopVis();
      b.stopVis = null;
      b.sceneTimer = cancel(b.sceneTimer);
      b.announceTimer = cancel(b.announceTimer);
      if (b.scene) b.scene.destroy();
      destroyCharts(b);
      b.sliders.forEach(function (s) { s.slider.destroy(); });
      b.inputSliders.forEach(function (s) { s.slider.destroy(); });
      b.readouts.forEach(function (r) { r.ro.destroy(); });
      if (b.inputSeg) b.inputSeg.destroy();
      if (b.tfSeg) b.tfSeg.destroy();
      if (b.transport) b.transport.destroy();
      if (b.root && b.root.parentNode) b.root.parentNode.removeChild(b.root);
    }

    /* ---------------------------------------------------------------- transporte */

    function buildTransport(view, b) {
      var unit = b.desc.variant.timeUnit || 's';
      b.transport = ui.transport({
        playing: app.playing,
        speed: app.speed,
        timeLabel: b.discrete ? 'k' : 't',
        timeUnit: unit,
        timeDecimals: timeDecimals(b.horizon, b.discrete),
        label: 'Controles de la simulación',
        testidPrefix: 'gl',
        onPlay: function () { play(view, b); },
        onPause: function () { pause(view, b); },
        onReset: function () { restart(view, b); },
        onSpeed: function (x) {
          app.speed = x;
          view.sim.setSpeed(x);
        }
      });
      b.dock.appendChild(b.transport.el);
      b.transport.setTime(view.sim.t);
    }

    function ensureLoop() {
      if (!loop) loop = util.loop(tick, {});
    }

    /** El bucle corre si se reproduce y el visor está a la vista (la pestaña oculta lo para util.loop). */
    function syncLoop() {
      if (!loop) return;
      if (app.playing && viewerOn) loop.start();
      else loop.stop();
    }

    function setPlaying(on, body) {
      app.playing = !!on;
      var b = body || (cur && cur.body);
      if (b && b.transport) b.transport.setPlaying(app.playing);
      if (b && app.playing) hideNote(b);
      syncLoop();
    }

    function play(view, b) {
      if (view.sim.halted || b.atEnd) {
        b.atEnd = false;
        view.sim.reset();
      }
      setPlaying(true, b);
    }

    function pause(view, b) {
      setPlaying(false, b);
      refreshTables(b);
      requestPaint();
    }

    function restart(view, b) {
      b.atEnd = false;
      view.sim.reset();
      requestPaint();
    }

    /* ---------------------------------------------------------------- bucle */

    function tick(dt) {
      var view = cur;
      var b = view && view.body;
      if (!b || !app.playing) return;
      var sim = view.sim;
      if (dt > 0 && !sim.halted) {
        // Varios trozos por fotograma a velocidades altas: más muestras para las gráficas.
        var chunks = Math.max(1, Math.min(8, Math.ceil(sim.speed * 2)));
        var part = dt / chunks;
        for (var i = 0; i < chunks && !sim.halted; i++) sim.step(part);
      }
      flushRanges(b);
      paint(view, b, dt);
      b.transport.setTime(sim.t);
      b.tableClock += dt;
      if (b.tableClock * 1000 >= TABLE_REFRESH_MS) {
        b.tableClock = 0;
        refreshTables(b);
      }
    }

    /** Pinta la escena con el último estado (dt = segundos reales; 0 = mismo instante). */
    function paint(view, b, dt) {
      if (!b.scene) return;
      var f = b.frame;
      var last = b.last;
      f.t = last.t;
      f.dt = dt;
      f.state = last.state;
      f.outputs = last.outputs;
      f.params = b.sceneParams;
      f.input.type = b.inputType;
      f.input.value = last.u;
      f.variant = b.variant;
      b.scene.render(f);
    }

    /** Un repintado con dt = 0 en el próximo fotograma (cuando el bucle está parado). */
    function requestPaint() {
      if (paintFrame !== null || (app.playing && loop && loop.isActive())) return;
      paintFrame = util.raf(function () {
        paintFrame = null;
        var b = cur && cur.body;
        if (!alive || !b) return;
        flushRanges(b);
        paint(cur, b, 0);
        b.transport.setTime(cur.sim.t);
      });
    }

    /* ---------------------------------------------------------------- avisos del visor */

    function showNote(b, text) {
      b.noteText.textContent = text;
      b.noteEl.hidden = false;
    }

    function hideNote(b) {
      if (b.noteEl && !b.noteEl.hidden) b.noteEl.hidden = true;
    }

    /* ---------------------------------------------------------------- eventos del simulador */

    function onStep(view, b, p) {
      b.last = p;
      if (!b.suppressPush) pushSample(view, b, p, false);
    }

    function onReset(view, b, p) {
      var wasHalted = b.halted;
      b.halted = false;
      b.last = p;
      b.lastPushT = null;
      b.haltEl.hidden = true;
      // Tras una detención, «Reiniciar» deja la simulación en pausa al principio: se dice.
      if (wasHalted && !app.playing) {
        showNote(b, 'La simulación volvió a ' + (b.discrete ? 'k' : 't') + ' = 0 y está en pausa. Pulse «Reproducir» para simularla de nuevo.');
      } else {
        hideNote(b);
      }
      b.horizon = horizonOf(view.sim.hints);
      b.charts.forEach(function (c) {
        c.handle.setWindow(b.horizon);
        c.handle.clear();
        c.obsLo = Infinity;
        c.obsHi = -Infinity;
      });
      predictRanges(view, b);
      pushSample(view, b, p, true);
      b.transport.setTime(p.t);
      b.params = view.sim.params;
      b.sceneParams = b.params;
      refreshTables(b);
      requestPaint();
    }

    function onHalt(view, b, p) {
      var msg = sentence(p.reason || 'La simulación se detuvo.');
      var prm = view.sim.params;
      var cobweb = view.model.id === 'market' && b.variant === 'telarana';
      var hint;
      if (isDomainHalt(p)) {
        // Salida del dominio del modelo (p. ej. precio negativo): el motivo y qué cambiar.
        hint = !cobweb ? 'Cambie los parámetros y pulse «Reiniciar».'
          : prm.d >= prm.b ? DOMAIN_HINT_COBWEB_DIV : DOMAIN_HINT_COBWEB;
        if (cobweb && prm.d >= prm.b && msg.indexOf('d/b') < 0) hint = 'Con d/b ≥ 1 la telaraña no converge. ' + hint;
      } else if (cobweb && prm.d >= prm.b) {
        hint = 'Con d/b ≥ 1 cada vuelta de la telaraña es igual o mayor que la anterior. Baje d por debajo de b y pulse «Reiniciar».';
      } else {
        hint = 'Pulse «Reiniciar» para empezar de nuevo.';
      }
      b.halted = true;
      hideNote(b);
      b.haltText.textContent = msg + ' ' + hint;
      b.haltEl.hidden = false;
      setPlaying(false, b);
      refreshTables(b);
      // El aviso de detención no puede perderse: un anuncio de lecturas aún pendiente (cambio de
      // parámetro de hace < 450 ms) lo sustituiría en la región viva, así que se cancela.
      b.announceTimer = cancel(b.announceTimer);
      ui.announce(msg);
      requestPaint();
    }

    function onParams(view, b) {
      var sim = view.sim;
      b.params = sim.params;
      b.last = { t: sim.t, state: sim.state, outputs: sim.outputs, u: sim.u };
      updateReadouts(view, b);
      syncSceneParams(view, b, false);
      requestPaint();
    }

    /* ---------------------------------------------------------------- escena */

    function buildScene(view, b) {
      if (!scenes || typeof scenes.create !== 'function' || !view.model.sceneId || !scenes.has(view.model.sceneId)) {
        b.sceneBox.appendChild(h('p', { class: 'gl-scene__empty' }, 'Este sistema no tiene escena física.'));
        return;
      }
      b.scene = scenes.create(view.model.sceneId, b.sceneBox, {
        model: view.model,
        variant: b.variant,
        params: view.sim.params,
        testid: 'gl-scene'
      });
    }

    /** La escena se reconstruye al cambiar parámetros: durante un arrastre se le pasan ~7 veces/s. */
    function syncSceneParams(view, b, now) {
      var t = util.now();
      if (now || t - b.sceneParamsAt >= SCENE_PARAMS_MS) {
        b.sceneTimer = cancel(b.sceneTimer);
        b.sceneParamsAt = t;
        b.sceneParams = view.sim.params;
        return;
      }
      if (b.sceneTimer !== null) return;
      b.sceneTimer = later(function () {
        b.sceneTimer = null;
        if (!b.alive) return;
        b.sceneParamsAt = util.now();
        b.sceneParams = view.sim.params;
        requestPaint();
      }, SCENE_PARAMS_MS - (t - b.sceneParamsAt));
    }

    /* ---------------------------------------------------------------- gráficas */

    /** El primer dibujo de la gráfica (Chart.js dibuja al crearse) usa ya el rango previsto. */
    function seedAxis(handle, nb) {
      var ch = handle && handle.chart;
      var sc = ch && ch.config && ch.config.options && ch.config.options.scales;
      var y = sc && sc.y;
      if (!y || (y.min === nb.min && y.max === nb.max)) return;
      var H = charts && charts.helpers;
      var step = H && typeof H.niceBounds === 'function' ? H.niceBounds(nb.min, nb.max, { pad: 0 }).step : 0;
      y.min = nb.min;
      y.max = nb.max;
      if (y.ticks && step > 0) y.ticks.stepSize = step;
      try { ch.update('none'); } catch (err) { /* se aplicará en el próximo repintado */ }
    }

    /** Gráficas del plan vigente de una vez (cambio de plan durante la interacción). */
    function buildCharts(view, b) {
      startCharts(view, b);
      for (var i = 0; i < b.plan.length; i++) addChart(view, b, i);
    }

    /** Prepara el contenedor para b.plan y calcula el rango previsto de cada gráfica. */
    function startCharts(view, b) {
      destroyCharts(b);
      b.planSig = planSignature(b.plan);
      b.chartsBox.style.setProperty('--gl-rows', String(Math.max(1, b.plan.length)));
      b.chartsBox.setAttribute('data-count', String(b.plan.length));
      b.pred = predictGroups(view, b, b.plan);
    }

    function addChart(view, b, i) {
      if (!charts || typeof charts.createTimeChart !== 'function') return;
      var unit = b.desc.variant.timeUnit || 's';
      var g = b.plan[i];
      var testid = 'gl-chart-' + (i + 1);
      var canvas = h('canvas', { 'data-testid': testid });
      var frame = h('div', { class: 'ch-frame gl-chart' }, canvas);
      b.chartsBox.appendChild(frame);
      var p = b.pred[i];
      var nb = niceRange(p.lo, p.hi);
      var handle = charts.createTimeChart(canvas, {
        series: g.series.map(function (s) {
          return { key: s.key, label: s.label, color: s.color || undefined, dash: s.dash, unit: s.unit };
        }),
        xLabel: b.discrete ? 'Periodo k' : 'Tiempo t (' + unit + ')',
        xSymbol: b.discrete ? 'k' : 't',
        xUnit: b.discrete ? '' : unit,
        yLabel: g.yLabel,
        window: b.horizon,
        yRange: nb ? [nb.min, nb.max] : 'auto',
        maxPoints: 2400,
        discrete: b.discrete,
        ariaLabel: 'Serie temporal: ' + g.noun.toLowerCase(),
        testid: testid
      });
      if (nb) seedAxis(handle, nb);
      var noun = g.noun.toLowerCase();
      var toggle = typeof charts.dataToggle === 'function' ? charts.dataToggle(handle, {
        container: b.dataRow,
        label: b.plan.length > 1 ? 'Ver datos: ' + noun : 'Ver datos',
        hideLabel: b.plan.length > 1 ? 'Ocultar datos: ' + noun : 'Ocultar datos',
        testid: testid
      }) : null;
      b.charts.push({
        testid: testid,
        group: g,
        handle: handle,
        toggle: toggle,
        frame: frame,
        values: {},
        lo: nb ? nb.min : -Infinity,
        hi: nb ? nb.max : Infinity,
        predLo: p.lo,
        predHi: p.hi,
        obsLo: Infinity,
        obsHi: -Infinity,
        dirty: false
      });
    }

    /** Dibuja ya el estado pendiente de las gráficas del cuerpo (el visor acaba de salir de la vista). */
    function flushCharts(b) {
      b.charts.forEach(function (c) {
        if (c.handle && typeof c.handle.flush === 'function') c.handle.flush();
      });
    }

    function destroyCharts(b) {
      b.charts.forEach(function (c) {
        if (c.toggle) c.toggle.destroy();
        if (c.handle) c.handle.destroy();
        if (c.frame.parentNode) c.frame.parentNode.removeChild(c.frame);
      });
      b.charts = [];
      if (b.dataRow) b.dataRow.textContent = '';
    }

    function seriesValue(view, b, s, outputs, u) {
      if (s.kind === 'input') {
        var iv = INPUT_VIEW[view.model.id + '/' + b.variant];
        var v = iv && iv.map ? iv.map(u, b.params) : u;
        return v * s.factor;
      }
      return outputs ? outputs[s.key] : undefined;
    }

    /** Lleva una muestra a las gráficas (diezmada a ~1200 por ventana) y registra el rango visto. */
    function pushSample(view, b, p, force) {
      if (!b.charts.length) return;
      var t = p.t;
      if (!force && !b.discrete && b.lastPushT !== null && t - b.lastPushT < b.horizon / 1200) return;
      b.lastPushT = t;
      for (var k = 0; k < b.charts.length; k++) {
        var c = b.charts[k];
        var series = c.group.series;
        for (var j = 0; j < series.length; j++) {
          var v = seriesValue(view, b, series[j], p.outputs, p.u);
          c.values[series[j].key] = v;
          if (isNum(v)) {
            if (v < c.obsLo) c.obsLo = v;
            if (v > c.obsHi) c.obsHi = v;
            if (v < c.lo || v > c.hi) c.dirty = true;
          }
        }
        c.handle.push(t, c.values);
      }
    }

    function applyRange(c) {
      c.dirty = false;
      var lo = Math.min(c.predLo, c.obsLo);
      var hi = Math.max(c.predHi, c.obsHi);
      var nb = niceRange(lo, hi);
      if (!nb) return;
      if (nb.min === c.lo && nb.max === c.hi) return;
      c.lo = nb.min;
      c.hi = nb.max;
      c.handle.setYRange([nb.min, nb.max]);
    }

    function flushRanges(b) {
      for (var i = 0; i < b.charts.length; i++) if (b.charts[i].dirty) applyRange(b.charts[i]);
    }

    /**
     * Rango previsto de cada grupo del plan: una simulación por lotes desde t = 0 con los ajustes
     * actuales (horizonte completo), cortada en la primera salida del dominio del modelo (hook
     * domain(), p. ej. un precio negativo en la telaraña). Así el eje y no salta mientras la curva
     * crece. → [{ lo, hi }] (lo > hi si no hay datos).
     */
    function predictGroups(view, b, groups) {
      var traj = null;
      try {
        traj = S.simulate(view.model, { variant: b.variant, params: view.sim.params, input: view.sim.input, duration: b.horizon });
      } catch (err) {
        traj = null;
      }
      var n = traj ? traj.t.length : 0;
      if (traj && typeof view.model.domain === 'function') {
        var prm = view.sim.params;
        for (var i = 0; i < n; i++) {
          var outs = {};
          for (var key in traj.outputs) outs[key] = traj.outputs[key][i];
          var why = null;
          try { why = view.model.domain(traj.x[i], outs, prm, b.variant); } catch (err) { why = null; }
          if (why) {
            n = i + 1;
            break;
          }
        }
      }
      return groups.map(function (g) {
        var lo = Infinity;
        var hi = -Infinity;
        g.series.forEach(function (s) {
          for (var j = 0; j < n; j++) {
            var v = s.kind === 'input' ? seriesValue(view, b, s, null, traj.u[j]) : (traj.outputs[s.key] || [])[j];
            if (!isNum(v)) continue;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        });
        // Una gráfica solo de entrada incluye el cero: un escalón constante no llena el eje.
        if (lo <= hi && g.series.every(function (s) { return s.kind === 'input'; })) {
          lo = Math.min(lo, 0);
          hi = Math.max(hi, 0);
        }
        return { lo: lo, hi: hi };
      });
    }

    function predictRanges(view, b) {
      if (!b.charts.length) return;
      var pred = predictGroups(view, b, b.charts.map(function (c) { return c.group; }));
      b.charts.forEach(function (c, i) {
        c.predLo = pred[i].lo;
        c.predHi = pred[i].hi;
        applyRange(c);
      });
    }

    function valuesFor(view, b, c, outputs, u) {
      var o = {};
      c.group.series.forEach(function (s) { o[s.key] = seriesValue(view, b, s, outputs, u); });
      return o;
    }

    /** Recarga las gráficas desde el historial del simulador (cambio de plan o estado final). */
    function refill(view, b) {
      var hist = view.sim.history.toArray();
      b.charts.forEach(function (c) {
        c.obsLo = Infinity;
        c.obsHi = -Infinity;
        var samples = hist.map(function (item) {
          var vals = valuesFor(view, b, c, item.outputs, item.u);
          for (var k in vals) {
            var v = vals[k];
            if (isNum(v)) {
              if (v < c.obsLo) c.obsLo = v;
              if (v > c.obsHi) c.obsHi = v;
            }
          }
          return { t: item.t, values: vals };
        });
        c.handle.setData(samples);
        applyRange(c);
      });
      var lastItem = hist.length ? hist[hist.length - 1] : null;
      b.lastPushT = lastItem ? lastItem.t : null;
    }

    function refreshTables(b) {
      b.charts.forEach(function (c) { if (c.toggle && c.toggle.isOpen()) c.toggle.refresh(); });
    }

    /* ---------------------------------------------------------------- movimiento reducido: estado final */

    function showEnd(view, b) {
      var sim = view.sim;
      b.suppressPush = true;
      sim.reset();
      sim.advance(b.horizon, { record: 'auto' });
      b.suppressPush = false;
      b.last = { t: sim.t, state: sim.state, outputs: sim.outputs, u: sim.u };
      refill(view, b);
      b.atEnd = true;
      b.transport.setTime(sim.t);
      paint(view, b, 0);
      requestPaint();
    }

    /* ---------------------------------------------------------------- sliders */

    function makeSlider(spec, value, testid, tipExtra, onLive, onCommit) {
      var d = displayOf(spec);
      var f = d.factor;
      var plainSym = texPlain(spec.symbol);
      var s = ui.slider({
        label: spec.label,
        symbol: plainSym || null,
        unit: d.unit,
        min: scaleNum(spec.min, f),
        max: scaleNum(spec.max, f),
        step: spec.step > 0 ? scaleNum(spec.step, f) : 0,
        value: scaleNum(value, f),
        defaultValue: scaleNum(spec.default, f),
        scale: spec.scale === 'log' ? 'log' : 'linear',
        tooltip: ((spec.tooltip || '') + (tipExtra || '')).trim() || null,
        testid: testid,
        onInput: function (v) { onLive(scaleNum(v, 1 / f)); },
        onChange: function (v) { onCommit(scaleNum(v, 1 / f)); }
      });
      var sym = s.el.querySelector('.ds-slider__sym');
      if (sym && spec.symbol && latex && latex.available && latex.available()) latex.render(sym, spec.symbol);
      return { slider: s, spec: spec, factor: f, key: spec.key };
    }

    function buildParamSliders(view, b) {
      var sim = view.sim;
      var p = sim.params;
      b.desc.params.forEach(function (spec) {
        var isLive = spec.live !== false;
        var s = makeSlider(spec, p[spec.key], 'gl-param-' + spec.key,
          isLive ? '' : ' Cambiarlo reinicia la simulación.',
          function (v) {
            if (!isLive) return;
            var o = {};
            o[spec.key] = v;
            sim.setParams(o);
          },
          function (v) {
            var o = {};
            o[spec.key] = v;
            sim.setParams(o);
            afterCommit(view, b, true);
          });
        if (!isLive) s.slider.el.classList.add('gl-slider--restart');
        b.sliders.push(s);
        b.paramsList.appendChild(s.slider.el);
      });
      paintRestore(view, b);
    }

    /** Control de rango del primer parámetro (destino del foco cuando «Restablecer» se desactiva). */
    function firstParamInput(b) {
      var s = b.sliders[0];
      return s ? s.slider.el.querySelector('input[type="range"]') : null;
    }

    function paintRestore(view, b) {
      var p = view.sim.params;
      var dirty = b.desc.params.some(function (spec) { return p[spec.key] !== spec.default; });
      var btn = b.restoreBtn;
      // Un botón con el foco que se desactiva lo dejaría en <body>: antes, el foco pasa al primer parámetro.
      if (!dirty && !btn.disabled && btn.ownerDocument && btn.ownerDocument.activeElement === btn) {
        var target = firstParamInput(b);
        if (target) target.focus({ preventScroll: true });
      }
      btn.disabled = !dirty;
    }

    function syncSliders(view, b) {
      var p = view.sim.params;
      b.sliders.forEach(function (s) { s.slider.set(scaleNum(p[s.key], s.factor), { silent: true }); });
    }

    /** «Restablecer parámetros»: valores por omisión y aviso con «Deshacer» durante 5 s. */
    function restoreParams(view, b) {
      var before = view.sim.params;
      var defs = {};
      b.desc.params.forEach(function (spec) { defs[spec.key] = spec.default; });
      view.sim.setParams(defs);
      if (!b.alive) return;
      syncSliders(view, b);
      afterCommit(view, b, false);
      ui.toast('Parámetros restablecidos a sus valores por omisión.', {
        tone: 'neutral',
        testid: 'gl-toast',
        // Al cerrarse el aviso con el foco dentro, el foco vuelve al primer parámetro (FND-15).
        returnFocus: firstParamInput(b),
        action: {
          label: 'Deshacer',
          onClick: function () {
            if (!b.alive || view !== cur) return;
            view.sim.setParams(before);
            if (!b.alive) return;
            syncSliders(view, b);
            afterCommit(view, b, false);
          }
        }
      });
    }

    /** Tras confirmar un cambio: rango previsto, escena, anuncio y (movimiento reducido) estado final. */
    function afterCommit(view, b, announce) {
      if (!b.alive) return;
      paintRestore(view, b);
      syncSceneParams(view, b, true);
      if (view.sim.t === 0 && !view.sim.halted) {
        view.sim.reset();       // aún sin recorrer: horizonte y escala de tiempo nuevos
      } else {
        predictRanges(view, b);
      }
      if (b.tfUpdate) b.tfUpdate();
      if (reduced() && b.atEnd && !app.playing) showEnd(view, b);
      requestPaint();
      if (announce) announceReadouts(view, b);
    }

    /* ---------------------------------------------------------------- entrada */

    function memoKey(view, b, type) { return view.model.id + '/' + b.variant + '/' + type; }

    function remember(view, b, input) {
      app.inputMemo[memoKey(view, b, input.type)] = Object.assign({}, input);
    }

    function inputSpecOf(b, type) {
      for (var i = 0; i < b.desc.inputs.length; i++) if (b.desc.inputs[i].id === type) return b.desc.inputs[i];
      return null;
    }

    function inputValues(view, b, type) {
      var spec = inputSpecOf(b, type);
      var memo = app.inputMemo[memoKey(view, b, type)];
      var out = { type: type };
      (spec ? spec.params : []).forEach(function (p) {
        out[p.key] = memo && isNum(memo[p.key]) ? memo[p.key] : p.default;
      });
      return out;
    }

    function buildInputSliders(view, b) {
      b.inputSliders.forEach(function (s) { s.slider.destroy(); });
      b.inputSliders = [];
      b.inputList.textContent = '';
      var spec = inputSpecOf(b, b.inputType);
      b.inputDesc.textContent = spec && spec.description ? spec.description : '';
      if (b.inputSymEl && spec) renderTex(b.inputSymEl, spec.symbol, false);
      if (!spec) return;
      var values = inputValues(view, b, b.inputType);
      spec.params.forEach(function (p) {
        var s = makeSlider(p, values[p.key], 'gl-inparam-' + p.key, '',
          function (v) { applyInput(view, b, p.key, v, false); },
          function (v) { applyInput(view, b, p.key, v, true); });
        b.inputSliders.push(s);
        b.inputList.appendChild(s.slider.el);
      });
      b.inputList.hidden = !spec.params.length;
    }

    function applyInput(view, b, key, value, commit) {
      var spec = inputValues(view, b, b.inputType);
      if (key) spec[key] = value;
      view.sim.setInput(spec);
      remember(view, b, spec);
      var sim = view.sim;
      b.last = { t: sim.t, state: sim.state, outputs: sim.outputs, u: sim.u };
      if (commit) {
        var plan = chartPlan(b.desc, b.inputType, view.model.id);
        if (planSignature(plan) !== b.planSig) {
          b.plan = plan;
          buildCharts(view, b);
          refill(view, b);
        }
        if (sim.t === 0 && !sim.halted) sim.reset();
        else predictRanges(view, b);
        if (reduced() && b.atEnd && !app.playing) showEnd(view, b);
      }
      requestPaint();
    }

    function setInputType(view, b, type) {
      if (!b.alive || type === b.inputType) return;
      b.inputType = type;
      buildInputSliders(view, b);
      applyInput(view, b, null, null, true);
    }

    /* ---------------------------------------------------------------- lecturas */

    function buildReadouts(view, b) {
      var list = view.model.readouts(view.sim.params, b.variant) || [];
      b.readouts = list.map(function (r) {
        var val = readoutValue(r);
        var ro = ui.readout({
          label: r.label,
          tex: r.tex || null,
          value: val,
          unit: isNum(val) ? (r.unit || '') : '',
          digits: r.digits || 3,
          tone: r.tone || null,
          tip: r.tip || null,              // explicación del modelo (CORE-13), si existe
          testid: 'gl-readout-' + r.id,
          className: isNum(val) ? 'gl-readout' : 'gl-readout gl-readout--text'
        });
        b.readList.appendChild(ro.el);
        return { id: r.id, ro: ro, tone: r.tone || null, tip: r.tip || null };
      });
    }

    function updateReadouts(view, b) {
      var list = view.model.readouts(view.sim.params, b.variant) || [];
      var sameShape = list.length === b.readouts.length && list.every(function (r, i) {
        return (r.tip || null) === b.readouts[i].tip;
      });
      if (!sameShape) {
        b.readouts.forEach(function (r) { r.ro.destroy(); });
        b.readList.textContent = '';
        buildReadouts(view, b);
        return;
      }
      list.forEach(function (r, i) {
        var slot = b.readouts[i];
        var val = readoutValue(r);
        slot.ro.set(val, { unit: isNum(val) ? (r.unit || '') : '' });
        slot.ro.el.classList.toggle('gl-readout--text', !isNum(val));
        var tone = r.tone || null;
        if (tone !== slot.tone) {
          if (slot.tone) slot.ro.el.classList.remove('ds-readout--' + slot.tone);
          if (tone) slot.ro.el.classList.add('ds-readout--' + tone);
          slot.tone = tone;
        }
      });
    }

    /** Anuncia las dos primeras lecturas una sola vez, cuando el control deja de moverse (~450 ms). */
    function announceReadouts(view, b) {
      b.announceTimer = cancel(b.announceTimer);
      b.announceTimer = later(function () {
        b.announceTimer = null;
        if (!b.alive || view.body !== b) return;
        var list = view.model.readouts(view.sim.params, b.variant) || [];
        var parts = [];
        for (var i = 0; i < list.length && parts.length < 2; i++) {
          var r = list[i];
          var val = readoutValue(r);
          if (val === null) continue;
          var text = isNum(val) ? util.formatNumber(val, r.digits || 3) + (r.unit ? ' ' + r.unit : '') : String(val);
          parts.push(sentence(r.label + ': ' + text));
        }
        if (parts.length) ui.announce(parts.join(' '));
      }, ANNOUNCE_MS);
    }

    /* ---------------------------------------------------------------- G(s) o explicación */

    function outputLabel(desc, key) {
      for (var i = 0; i < desc.outputs.length; i++) if (desc.outputs[i].key === key) return desc.outputs[i].label;
      return key;
    }

    function buildTfRow(view, b) {
      var desc = b.desc;
      var pairs = desc.tfPairs || [];
      var row = b.tfRow;
      row.textContent = '';
      if (pairs.length) {
        b.tfKey = pairs[0].outputKey;
        var note = h('p', { class: 'gl-tf__note', 'data-testid': 'gl-tf-note' });
        var paintNote = function () {
          var pair = pairs.filter(function (pp) { return pp.outputKey === b.tfKey; })[0] || pairs[0];
          note.textContent = '';
          note.appendChild(h('span', null, 'Abre el motor de funciones de transferencia con '));
          note.appendChild(texSpan(pair.label));
          note.appendChild(h('span', null, ' y los parámetros actuales.'));
          if (pair.linearized) {
            note.appendChild(h('span', null, ' Es el modelo linealizado alrededor del punto de operación: vale para cambios pequeños.'));
          }
        };
        if (pairs.length > 1) {
          b.tfSeg = ui.segmented({
            label: 'Salida de G(s)',
            options: pairs.map(function (pp) { return { value: pp.outputKey, label: outputLabel(desc, pp.outputKey) }; }),
            value: b.tfKey,
            equal: false,
            testid: 'gl-tf-output',
            onChange: function (v) { b.tfKey = v; paintNote(); }
          });
        }
        var btn = ui.button({
          label: 'Ver G(s) paso a paso',
          icon: 'square-function',
          variant: 'secondary',
          testid: 'gl-tf-open',
          onClick: function () {
            DSL.bus.emit('tf:open', {
              systemId: view.model.id,
              variant: view.sim.variant,
              params: view.sim.params,
              outputKey: b.tfKey
            });
          }
        });
        paintNote();
        row.classList.remove('gl-tf--none');
        row.appendChild(h('div', { class: 'gl-tf__actions' }, btn, b.tfSeg ? h('div', { class: 'gl-seg-wrap' }, b.tfSeg.el) : null));
        row.appendChild(note);
        b.tfUpdate = null;
        return;
      }

      // Sin G(s): explicación del modelo y, si existe, su vista linealizada.
      b.tfKey = null;
      row.classList.add('gl-tf--none');
      var titleEl = h('h4', { class: 'gl-notf__title' });
      var textEl = h('p', { class: 'gl-notf__text' });
      var texEl = h('div', { class: 'gl-notf__tex' });
      var linBox = h('div', { class: 'gl-notf__lin' });
      var actions = h('div', { class: 'gl-notf__actions' });
      var body = h('div', { class: 'gl-notf__body' }, titleEl, textEl, texEl, linBox, actions);
      row.appendChild(h('div', { class: 'ds-callout gl-notf', 'data-testid': 'gl-notf' }, ui.icon('info'), body));

      var link = b.discrete ? CONCEPT_LINK.discrete : CONCEPT_LINK.nonlinear;
      actions.appendChild(ui.button({
        label: link.label,
        icon: 'book-open',
        variant: 'ghost',
        size: 'sm',
        testid: 'gl-notf-concepts',
        onClick: function () { DSL.bus.emit('concepts:open', link.payload); }
      }));

      var lin = null;
      var linTex = h('div', { class: 'gl-notf__lintex' });
      var linNote = h('p', { class: 'gl-notf__linnote' });
      var collapse = null;

      function fill() {
        var p = view.sim.params;
        var steps = view.model.derivation(p, b.variant) || [];
        var why = findStep(steps, 'nolineal') || findStep(steps, 'sings') || steps[1] || steps[0] || null;
        titleEl.textContent = why ? why.title : 'Este modelo no tiene una G(s) global';
        textEl.textContent = why ? why.text : '';
        texEl.textContent = '';
        (why && why.tex ? why.tex : []).forEach(function (t) {
          texEl.appendChild(renderTex(h('div', { class: 'ds-math-block', translate: 'no' }), t, true));
        });
        lin = typeof view.model.linearization === 'function' ? view.model.linearization(p, b.variant) : null;
        if (lin) {
          linTex.textContent = '';
          (lin.tex || []).forEach(function (t) {
            linTex.appendChild(renderTex(h('div', { class: 'ds-math-block', translate: 'no' }), t, true));
          });
          linNote.textContent = lin.note || '';
        }
      }
      fill();
      if (lin) {
        collapse = ui.collapsible({
          title: 'Ver la vista linealizada',
          content: [linTex, linNote],
          open: false,
          headingLevel: 5,
          testid: 'gl-notf-linear'
        });
        linBox.appendChild(collapse.el);
      }
      b.tfUpdate = fill;
    }

    /* ---------------------------------------------------------------- inicio perezoso por fases */

    // Fases (cada una ≲ 50 ms): riel → DOM del escenario → escena → plan y rangos previstos → gráfica 1 →
    // gráfica 2 → parámetros y entrada → lecturas → G(s) → primer fotograma.
    // Con DSL.util.lazyInit (FND-07) corren en tiempo ocioso tras la carga, o todas de golpe cuando la
    // galería se acerca a la vista; sin él, todas de golpe al acercarse (util.onVisible).
    var phase = { list: null, next: 0, lazy: null, done: false, ms: [] };
    var initCtx = { view: null };

    phase.list = [
      function () { placePlate(); },
      function () {
        ensureLoop();
        removeSkeleton();
        initCtx.view = createView(app.systemId, app.variant);
        bodyDom(initCtx.view);
      },
      function () { bodyScene(initCtx.view); },
      function () { bodyPlan(initCtx.view); },
      function () { bodyChart(initCtx.view, 0); },
      function () { bodyChart(initCtx.view, 1); },
      function () { bodyPanels(initCtx.view, 0); },
      function () { bodyPanels(initCtx.view, 1); },
      function () { bodyPanels(initCtx.view, 2); },
      function () {
        var v = initCtx.view;
        initCtx.view = null;
        bodyFirst(v);
        cur = v;
        phase.done = true;
        stage.classList.remove('is-pending');
        stage.removeAttribute('aria-busy');
        if (!phase.lazy) root.setAttribute('data-lazy', 'done');
      }
    ];

    function runPhase(i) {
      if (!alive || i < phase.next || i >= phase.list.length) return;
      phase.next = i + 1;
      var t0 = util.now();
      phase.list[i]();
      phase.ms[i] = Math.round(util.now() - t0);   // duración de cada fase (state().initPhases)
    }

    /** Completa en el acto las fases que falten (deep link, gallery:open, handle.select()). */
    function ensureInit() {
      if (phase.done || !alive) return;
      if (phase.lazy && typeof phase.lazy.ensure === 'function') phase.lazy.ensure();
      while (!phase.done && alive && phase.next < phase.list.length) runPhase(phase.next);
    }

    if (typeof util.lazyInit === 'function') {
      phase.lazy = util.lazyInit(root, phase.list.map(function (fn, i) {
        return function () { runPhase(i); };
      }), { rootMargin: '200px' });
      cleanups.push(function () {
        if (phase.lazy && typeof phase.lazy.destroy === 'function') phase.lazy.destroy();
      });
    } else {
      cleanups.push(util.onVisible(root, function (visible) { if (visible) ensureInit(); }, { once: true, rootMargin: '200px' }));
    }

    cleanups.push(DSL.bus.on('gallery:open', function (payload) {
      if (!payload) return;
      openSystem(payload.systemId, payload.variant || null);
    }));

    /* ---------------------------------------------------------------- handle */

    return {
      /** Selecciona un sistema (y variante) como gallery:open, sin desplazar la página. */
      select: function (systemId, variant) {
        openSystem(systemId, variant || null);
      },
      /** Instantánea de solo lectura para pruebas e integración. */
      state: function () {
        var view = cur;
        var b = view && view.body;
        var sim = view && view.sim;
        return {
          ready: !!b,
          switching: swap.op !== null || swap.timer !== null,
          systemId: app.systemId,
          variant: sim ? sim.variant : app.variant,
          playing: app.playing,
          running: !!(loop && loop.isActive()),
          viewerVisible: viewerOn,
          initPhases: phase.ms.slice(),
          switchSteps: swap.lastSteps.slice(),
          t: sim ? sim.t : 0,
          speed: sim ? sim.speed : app.speed,
          params: sim ? sim.params : null,
          input: sim ? sim.input : null,
          halted: sim ? sim.halted : null,
          horizon: b ? b.horizon : null,
          atEnd: b ? b.atEnd : false,
          tfKey: b ? b.tfKey : null,
          readouts: b ? b.readouts.map(function (r) { return r.id; }) : [],
          charts: b ? b.charts.map(function (c) {
            var st = c.handle && typeof c.handle.stats === 'function' ? c.handle.stats() : null;
            return {
              testid: c.testid,
              series: c.group.series.map(function (s) { return s.key; }),
              dashed: c.group.series.filter(function (s) { return s.dash; }).map(function (s) { return s.key; }),
              yLabel: c.group.yLabel,
              yRange: [c.lo, c.hi],
              points: st ? st.points : 0,
              pushes: st ? st.pushes : 0,
              updates: st ? st.updates : 0
            };
          }) : []
        };
      },
      destroy: function () {
        if (!alive) return;
        cancelSwap();
        alive = false;
        if (paintFrame !== null) util.cancelRaf(paintFrame);
        paintFrame = null;
        if (loop) loop.destroy();
        loop = null;
        destroySystem(cur);
        cur = null;
        if (initCtx.view) destroySystem(initCtx.view);
        initCtx.view = null;
        cleanups.forEach(function (fn) { try { fn(); } catch (err) { /* ya liberado */ } });
        cleanups = [];
        timers.slice().forEach(function (id) { clearTimeout(id); });
        timers = [];
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  DSL.sections.gallery = {
    mount: mount,
    helpers: {
      texPlain: texPlain,
      timeDecimals: timeDecimals,
      displayOf: displayOf,
      scaleNum: scaleNum,
      niceRange: niceRange,
      chartPlan: chartPlan,
      planSignature: planSignature,
      horizonOf: horizonOf,
      readoutValue: readoutValue,
      sentence: sentence,
      isDomainHalt: isDomainHalt,
      INPUT_KEY: INPUT_KEY
    }
  };
})(window.DSL);
