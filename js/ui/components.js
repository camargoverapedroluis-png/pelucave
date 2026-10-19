/*
 * js/ui/components.js — Propietario: design-system.
 * Componentes de interfaz → DSL.ui: icon, button, help, slider, segmented, tabs, tooltips, tooltip,
 * transport, toggle, collapsible, card, chip, readout, toast, reveal, announce, init y helpers.
 * Estilos en css/components.css (prefijo ds-). API real: docs/api/ui.md.
 * Script clásico: en tiempo de carga solo define funciones; el DOM se toca dentro de ellas.
 */
(function (DSL) {
  'use strict';

  var util = DSL.util;
  var h = util.h;
  var S = util.svg;
  var clamp = util.clamp;
  var ui = DSL.ui;
  var global = typeof window !== 'undefined' ? window : globalThis;

  /* ================================================================== utilidades internas */

  function getDoc() {
    return global.document;
  }

  function isNode(x) {
    return x !== null && typeof x === 'object' && typeof x.nodeType === 'number';
  }

  /** Normaliza contenido (texto, nodo, número o lista) a una lista de hijos para h(). */
  function kids(x) {
    if (x === null || x === undefined || x === false) return [];
    return Array.isArray(x) ? x : [x];
  }

  var warned = Object.create(null);
  function warnOnce(key, msg) {
    if (warned[key]) return;
    warned[key] = true;
    if (global.console && typeof global.console.warn === 'function') global.console.warn(msg);
  }

  /** Identificador kebab-case a partir de un valor: 0.25 → '0-25', 'Escalón' → 'escalon'. */
  function slug(v) {
    var s = String(v).normalize ? String(v).normalize('NFD').replace(/[̀-ͯ]/g, '') : String(v);
    s = s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'x';
  }

  function tid(prefix, name) {
    return prefix ? prefix + '-' + name : null;
  }

  function reducedMotion() {
    return !!(DSL.prefs && DSL.prefs.reducedMotion);
  }

  function clearTimer(id) {
    if (id !== null && id !== undefined) global.clearTimeout(id);
    return null;
  }

  /** Redondea a `sig` cifras significativas. */
  function sigRound(v, sig) {
    if (v === 0 || !isFinite(v)) return v;
    var p = Math.pow(10, sig - 1 - Math.floor(Math.log10(Math.abs(v))));
    return Math.round(v * p) / p;
  }

  function decimalsOf(x) {
    if (!isFinite(x)) return 0;
    var s = String(x);
    var e = s.indexOf('e-');
    if (e >= 0) return parseInt(s.slice(e + 2), 10) + Math.max(0, (s.slice(0, e).split('.')[1] || '').length);
    var i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  }

  /** Ajusta v a la rejilla min + k·step (como un input range nativo), sin ruido de coma flotante. */
  function snapTo(v, step, base) {
    if (!(step > 0)) return v;
    base = base || 0;
    var r = base + Math.round((v - base) / step) * step;
    return Number(r.toFixed(Math.min(12, Math.max(decimalsOf(step), decimalsOf(base)))));
  }

  function sameValue(a, b) {
    return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
  }

  /* ================================================================== icon */

  /**
   * Icono Lucide en línea: icon(name, { size = 20, label?, className?, strokeWidth = 1.75 }) → <svg>.
   * Decorativo (aria-hidden) salvo que se dé `label`. Un nombre desconocido da un <svg> vacío y avisa una vez.
   */
  function icon(name, opts) {
    opts = opts || {};
    var size = opts.size || 20;
    var data = DSL.iconsData || {};
    var markup = Object.prototype.hasOwnProperty.call(data, name) ? data[name] : null;
    if (markup === null) {
      warnOnce('icon:' + name, '[ui] Icono desconocido: «' + name + '». Añádalo a tools/icons/<clave>.list y ejecute node tools/icons.mjs.');
    }
    var el = S('svg', {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': opts.strokeWidth || 1.75,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      focusable: 'false',
      class: ['ds-icon', opts.className],
      'data-icon': name
    });
    if (markup) el.innerHTML = markup;
    if (opts.label) {
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', opts.label);
    } else {
      el.setAttribute('aria-hidden', 'true');
    }
    return el;
  }

  /* ================================================================== button */

  var VARIANTS = { primary: 1, secondary: 1, ghost: 1 };

  /**
   * button({ label?, icon?, iconEnd?, variant = 'secondary'|'primary'|'ghost', iconOnly = false, ariaLabel?,
   *          title?, onClick(e, pressed?), testid?, pressed?, size = 'md'|'sm', disabled, className, type })
   * → HTMLButtonElement. `pressed` (true/false) lo convierte en conmutador con aria-pressed.
   * `title` se muestra como tooltip accesible (data-tip), no como title nativo.
   */
  function button(opts) {
    opts = opts || {};
    var variant = VARIANTS[opts.variant] ? opts.variant : 'secondary';
    var iconOnly = !!opts.iconOnly;
    var name = opts.ariaLabel || (iconOnly ? (opts.label || opts.title) : null);
    if (iconOnly && !name) warnOnce('btn-name', '[ui] button({ iconOnly: true }) necesita ariaLabel o label.');
    var b = h('button', {
      type: opts.type || 'button',
      class: ['ds-btn', 'ds-btn--' + variant, iconOnly && 'ds-btn--icon', opts.size === 'sm' && 'ds-btn--sm', opts.className],
      'aria-label': name || null,
      'data-testid': opts.testid || null,
      'data-tip': opts.title || null,
      disabled: opts.disabled ? true : null
    });
    if (opts.icon) b.appendChild(icon(opts.icon, { size: iconOnly ? 20 : 18, className: 'ds-btn__icon' }));
    if (opts.label && !iconOnly) b.appendChild(h('span', { class: 'ds-btn__label' }, opts.label));
    if (opts.iconEnd && !iconOnly) b.appendChild(icon(opts.iconEnd, { size: 18, className: 'ds-btn__icon ds-btn__icon--end' }));
    var isToggle = opts.pressed !== undefined && opts.pressed !== null;
    if (isToggle) b.setAttribute('aria-pressed', String(!!opts.pressed));
    b.addEventListener('click', function (e) {
      var next;
      if (isToggle) {
        next = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(next));
      }
      if (typeof opts.onClick === 'function') opts.onClick(e, next);
    });
    return b;
  }

  /**
   * help(text, { label?, testid?, side? }) → botón «?» pequeño con tooltip accesible (también al tocarlo).
   * `label` nombra el concepto: aria-label «Explicación de «label»».
   */
  function help(text, opts) {
    opts = opts || {};
    return h('button', {
      type: 'button',
      class: 'ds-help',
      'data-tip': text,
      'data-tip-side': opts.side || null,
      'aria-label': opts.label ? 'Explicación de «' + opts.label + '»' : 'Explicación',
      'data-testid': opts.testid || null
    }, icon('circle-help', { size: 16 }));
  }

  /* ================================================================== slider */

  /**
   * Escala entre el valor y la posición del input range. Lineal: posición = valor (rejilla de `step`).
   * Logarítmica: posiciones enteras 0…n (60 por década, al menos 100); valores a 3 cifras significativas.
   */
  function makeScale(min, max, step, kind) {
    if (kind === 'log') {
      if (!(min > 0 && max > min)) throw new Error('slider: la escala logarítmica necesita 0 < min < max.');
      var lmin = Math.log10(min);
      var lmax = Math.log10(max);
      var n = Math.max(100, Math.round((lmax - lmin) * 60));
      var quant = function (v) {
        v = sigRound(v, 3);
        if (step > 0) v = snapTo(v, step, 0);
        return clamp(v, min, max);
      };
      return {
        kind: 'log',
        posMin: 0,
        posMax: n,
        posStep: 1,
        toPos: function (v) { return Math.round(n * (Math.log10(clamp(v, min, max)) - lmin) / (lmax - lmin)); },
        fromPos: function (p) { return quant(Math.pow(10, lmin + (clamp(p, 0, n) / n) * (lmax - lmin))); },
        snap: function (v) { return quant(v); },
        nudge: function (v, dir) { return quant(Math.pow(10, lmin + (clamp(this.toPos(v) + dir, 0, n) / n) * (lmax - lmin))); }
      };
    }
    var snap = function (v) { return clamp(snapTo(clamp(v, min, max), step, min), min, max); };
    return {
      kind: 'linear',
      posMin: min,
      posMax: max,
      posStep: step > 0 ? step : 'any',
      toPos: function (v) { return clamp(v, min, max); },
      fromPos: function (p) { return snap(p); },
      snap: snap,
      nudge: function (v, dir) { return snap(v + dir * (step > 0 ? step : (max - min) / 100)); }
    };
  }

  /**
   * slider({ label, symbol?, unit = '', min, max, step, value, defaultValue = value, tooltip?, format?,
   *          scale = 'linear'|'log', onInput(v, { final }), onChange(v), onEditStart(), testid?, numberField = true,
   *          disabled = false })
   * → { el, value, set(v, { silent }), setRange({ min, max, step }), setDisabled(b), reset(), destroy() }
   * onInput: mientras se arrastra, como mucho una vez por frame, con { final: false }.
   * onChange: al soltar o confirmar (teclado, campo numérico, reset, set no silencioso).
   * Sin onChange, la confirmación llama a onInput(v, { final: true }).
   * onEditStart: la primera pulsación de una edición del campo numérico (p. ej. para pausar lo que lo
   * actualiza). Mientras se edita, set(v, { silent: true }) cambia el valor pero no el texto escrito.
   * Error del campo: role="alert"; un valor fuera de rango se ajusta al límite y lo dice una nota
   * role="status" durante ~4 s («Se ajustó a 50 N/m (máximo).»).
   */
  function slider(opts) {
    opts = opts || {};
    var min = Number(opts.min);
    var max = Number(opts.max);
    if (!(isFinite(min) && isFinite(max) && max > min)) throw new Error('slider: «max» debe ser mayor que «min».');
    var step = Number(opts.step) > 0 ? Number(opts.step) : 0;
    var kind = opts.scale === 'log' ? 'log' : 'linear';
    var sc = makeScale(min, max, step, kind);
    var unit = opts.unit || '';
    var label = String(opts.label || '');
    var linDecimals = kind === 'linear' && step > 0 ? decimalsOf(step) : null;
    var format = typeof opts.format === 'function' ? opts.format : function (v) {
      return util.formatNumber(v, 4, linDecimals === null ? undefined : { decimals: linDecimals });
    };
    var onInput = typeof opts.onInput === 'function' ? opts.onInput : null;
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : null;
    var withNumber = opts.numberField !== false;
    var testid = opts.testid || null;
    var disabled = !!opts.disabled;
    var startValue = isFinite(Number(opts.value)) ? Number(opts.value) : min;
    var value = sc.snap(startValue);
    var def = opts.defaultValue !== undefined && isFinite(Number(opts.defaultValue)) ? sc.snap(Number(opts.defaultValue)) : value;
    var frame = null;
    var editing = false;
    var invalid = false;
    var alive = true;

    var id = util.uid('ds-slider');
    var descId = opts.tooltip ? util.uid('ds-slider-desc') : null;
    var errId = withNumber ? util.uid('ds-slider-err') : null;

    function text(v) {
      var s = format(v);
      return unit ? s + ' ' + unit : s;
    }
    function editText(v) {
      return util.formatNumber(v, 6, { ascii: true, sci: 'e', sciMin: 1e-4, sciMax: 1e7, decimals: linDecimals === null ? undefined : linDecimals });
    }

    var input = h('input', {
      type: 'range',
      id: id,
      class: 'ds-slider__input',
      min: sc.posMin,
      max: sc.posMax,
      step: sc.posStep,
      'aria-describedby': descId,
      'data-testid': tid(testid, 'input')
    });
    var fill = h('span', { class: 'ds-slider__fill' });
    var rail = h('span', { class: 'ds-slider__rail', 'aria-hidden': 'true' }, fill);
    var bubble = h('output', { class: 'ds-slider__bubble', for: id, 'aria-hidden': 'true', 'aria-live': 'off', 'data-testid': tid(testid, 'value') });
    var labelEl = h('label', { class: 'ds-slider__label', for: id },
      h('span', { class: 'ds-slider__name' }, label),
      opts.symbol ? h('span', { class: 'ds-sym ds-slider__sym', translate: 'no' }, opts.symbol) : null);
    var helpBtn = opts.tooltip ? help(opts.tooltip, { label: label, testid: tid(testid, 'help') }) : null;

    var numberEl = null;
    var staticEl = null;
    if (withNumber) {
      numberEl = h('input', {
        type: 'text',
        inputmode: 'decimal',
        class: 'ds-slider__number',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-label': label + (unit ? ' en ' + unit : ''),
        'aria-describedby': errId,
        'data-testid': tid(testid, 'number')
      });
    } else {
      staticEl = h('span', { class: 'ds-slider__static', 'aria-hidden': 'true', 'data-testid': tid(testid, 'readout') });
    }
    var unitEl = unit && withNumber ? h('span', { class: 'ds-slider__unit', 'aria-hidden': 'true' }, unit) : null;
    var resetBtn = h('button', {
      type: 'button',
      class: 'ds-slider__reset',
      'aria-label': 'Restablecer «' + label + '» a ' + text(def),
      'data-tip': 'Volver a ' + text(def),
      'data-testid': tid(testid, 'reset')
    }, icon('rotate-ccw', { size: 16 }));
    // Regiones vivas siempre presentes (vacías no ocupan sitio): el lector anuncia el texto al llegar.
    var errEl = withNumber ? h('p', { class: 'ds-slider__error', id: errId, role: 'alert', 'data-testid': tid(testid, 'error') }) : null;
    var noteEl = withNumber ? h('p', { class: 'ds-slider__note', role: 'status', 'data-testid': tid(testid, 'note') }) : null;
    var noteTimer = null;
    var onEditStart = typeof opts.onEditStart === 'function' ? opts.onEditStart : null;

    var el = h('div', {
      class: ['ds-slider', withNumber && 'ds-slider--number', disabled && 'is-disabled', opts.className],
      'data-testid': testid
    },
    h('div', { class: 'ds-slider__head' },
      labelEl,
      helpBtn,
      resetBtn,
      h('span', { class: 'ds-slider__value' }, numberEl || staticEl, unitEl)),
    h('div', { class: 'ds-slider__control' }, rail, input, bubble),
    descId ? h('span', { id: descId, class: 'sr-only' }, opts.tooltip) : null,
    errEl,
    noteEl);

    function isFocused(node) {
      var d = getDoc();
      return !!node && !!d && d.activeElement === node;
    }

    function render(fromRange) {
      var pos = sc.toPos(value);
      if (!fromRange) input.value = String(pos);
      var frac = (pos - sc.posMin) / (sc.posMax - sc.posMin);
      el.style.setProperty('--pos', String(Math.round(clamp(frac, 0, 1) * 10000) / 10000));
      var t = text(value);
      input.setAttribute('aria-valuetext', t);
      bubble.textContent = t;
      if (staticEl) staticEl.textContent = t;
      if (numberEl && !editing) numberEl.value = editText(value);
      var dirty = !sameValue(value, def);
      var off = !dirty || disabled;
      // Un botón deshabilitado pierde el foco y el teclado volvería a <body>: el foco pasa antes al deslizador.
      if (off && !resetBtn.disabled && isFocused(resetBtn) && !input.disabled) {
        try { input.focus({ preventScroll: true }); } catch (err) { input.focus(); }
      }
      resetBtn.disabled = off;
      el.classList.toggle('is-dirty', dirty);
    }

    function commit() {
      if (onChange) onChange(value);
      else if (onInput) onInput(value, { final: true });
    }

    function cancelFrame() {
      if (frame !== null) util.cancelRaf(frame);
      frame = null;
    }

    function onRangeInput() {
      value = sc.fromPos(Number(input.value));
      render(true);
      if (!onInput || frame !== null) return;
      frame = util.raf(function () {
        frame = null;
        if (alive) onInput(value, { final: false });
      });
    }

    function onRangeChange() {
      cancelFrame();
      value = sc.fromPos(Number(input.value));
      render(true);
      el.classList.remove('is-dragging');
      commit();
    }

    function endDrag() {
      el.classList.remove('is-dragging');
      global.removeEventListener('pointerup', endDrag);
      global.removeEventListener('pointercancel', endDrag);
    }

    function onPointerDown() {
      if (disabled) return;
      el.classList.add('is-dragging');
      global.addEventListener('pointerup', endDrag);
      global.addEventListener('pointercancel', endDrag);
    }

    function showError(msg) {
      invalid = true;
      if (!numberEl) return;
      clearNote();
      numberEl.setAttribute('aria-invalid', 'true');
      if (errEl.textContent !== msg) errEl.textContent = msg;
      el.classList.add('is-invalid');
    }

    function clearError() {
      invalid = false;
      if (!numberEl) return;
      numberEl.removeAttribute('aria-invalid');
      errEl.textContent = '';
      el.classList.remove('is-invalid');
    }

    function clearNote() {
      if (noteTimer !== null) global.clearTimeout(noteTimer);
      noteTimer = null;
      if (noteEl) noteEl.textContent = '';
    }

    /** Nota de cortesía durante ~4 s (role="status"). */
    function showNote(msg) {
      if (!noteEl) return;
      clearNote();
      noteEl.textContent = msg;
      noteTimer = global.setTimeout(function () {
        noteTimer = null;
        if (alive) noteEl.textContent = '';
      }, NOTE_MS);
    }

    /** Cierra una frase con punto sin duplicarlo si la unidad ya termina en «.» (u.a.). */
    function sentence(s) {
      return /\.$/.test(s) ? s : s + '.';
    }

    function commitNumber() {
      var v = util.parseNumber(numberEl.value);
      if (!isFinite(v)) {
        showError(sentence('Escriba un número entre ' + util.formatNumber(min, 4) + ' y ' + util.formatNumber(max, 4) + (unit ? ' ' + unit : '')) + ' Se acepta la coma decimal.');
        return;
      }
      clearError();
      editing = false;
      var bound = v > max ? 'máximo' : v < min ? 'mínimo' : null;
      var next = sc.snap(clamp(v, min, max));
      var changed = !sameValue(next, value);
      value = next;
      render(false);
      if (bound) showNote('Se ajustó a ' + text(next) + ' (' + bound + ').');
      else clearNote();
      if (changed) commit();
    }

    function revertNumber() {
      clearError();
      editing = false;
      render(false);
    }

    function onNumberKey(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitNumber();
      } else if (e.key === 'Escape') {
        if (editing || invalid) {
          e.preventDefault();
          revertNumber();
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        var dir = e.key === 'ArrowUp' ? 1 : -1;
        var times = e.shiftKey ? 10 : 1;
        var v = value;
        for (var i = 0; i < times; i++) v = sc.nudge(v, dir);
        clearError();
        editing = false;
        if (!sameValue(v, value)) {
          value = v;
          render(false);
          commit();
        }
      }
    }

    function onNumberInput() {
      var first = !editing;
      editing = true;
      if (first && onEditStart) onEditStart();
    }
    function onNumberBlur() {
      if (invalid) revertNumber();
      editing = false;
    }
    function onReset() { api.reset(); }

    input.addEventListener('input', onRangeInput);
    input.addEventListener('change', onRangeChange);
    input.addEventListener('pointerdown', onPointerDown);
    resetBtn.addEventListener('click', onReset);
    if (numberEl) {
      numberEl.addEventListener('input', onNumberInput);
      numberEl.addEventListener('keydown', onNumberKey);
      numberEl.addEventListener('change', commitNumber);
      numberEl.addEventListener('blur', onNumberBlur);
    }

    function applyDisabled() {
      input.disabled = disabled;
      if (numberEl) numberEl.disabled = disabled;
      el.classList.toggle('is-disabled', disabled);
    }

    var api = {
      el: el,
      input: input,
      get value() { return value; },
      set: function (v, o) {
        var n = Number(v);
        if (!isFinite(n)) return value;
        cancelFrame();
        // Un set silencioso (p. ej. la simulación que avanza) no pisa lo que se está escribiendo.
        var keepField = !!(o && o.silent) && editing && isFocused(numberEl);
        if (!keepField) {
          clearError();
          editing = false;
        }
        var next = sc.snap(n);
        var changed = !sameValue(next, value);
        value = next;
        render(false);
        if (!(o && o.silent) && changed) commit();
        return value;
      },
      setRange: function (r) {
        r = r || {};
        if (r.min !== undefined) min = Number(r.min);
        if (r.max !== undefined) max = Number(r.max);
        if (r.step !== undefined) step = Number(r.step) > 0 ? Number(r.step) : 0;
        if (!(max > min)) throw new Error('slider.setRange: «max» debe ser mayor que «min».');
        sc = makeScale(min, max, step, kind);
        linDecimals = kind === 'linear' && step > 0 ? decimalsOf(step) : null;
        input.setAttribute('min', String(sc.posMin));
        input.setAttribute('max', String(sc.posMax));
        input.setAttribute('step', String(sc.posStep));
        def = sc.snap(def);
        value = sc.snap(value);
        render(false);
        return value;
      },
      setDisabled: function (b) {
        disabled = !!b;
        applyDisabled();
        render(false);
      },
      reset: function () { return api.set(def); },
      destroy: function () {
        alive = false;
        cancelFrame();
        clearNote();
        endDrag();
        input.removeEventListener('input', onRangeInput);
        input.removeEventListener('change', onRangeChange);
        input.removeEventListener('pointerdown', onPointerDown);
        resetBtn.removeEventListener('click', onReset);
        if (numberEl) {
          numberEl.removeEventListener('input', onNumberInput);
          numberEl.removeEventListener('keydown', onNumberKey);
          numberEl.removeEventListener('change', commitNumber);
          numberEl.removeEventListener('blur', onNumberBlur);
        }
        el.remove();
      }
    };

    applyDisabled();
    render(false);
    return api;
  }

  /* ================================================================== segmented */

  function indexOfValue(options, v) {
    for (var i = 0; i < options.length; i++) if (String(options[i].value) === String(v)) return i;
    return -1;
  }

  /**
   * segmented({ options: [{ value, label, icon?, title?, ariaLabel? }], value, onChange(value), label, testid?, equal = true })
   * → { el, value, set(v, { silent }), destroy() }
   * role="radiogroup" con tabindex itinerante: flechas (con vuelta), Home y End seleccionan y enfocan.
   * La pastilla de selección se desliza con transform (columnas iguales por defecto).
   */
  function segmented(opts) {
    opts = opts || {};
    var options = (opts.options || []).slice();
    if (!options.length) throw new Error('segmented: se necesita al menos una opción.');
    var testid = opts.testid || null;
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : null;
    var idx = Math.max(0, indexOfValue(options, opts.value));
    var ready = false;
    var thumb = h('span', { class: 'ds-seg__thumb', 'aria-hidden': 'true' });
    var el = h('div', {
      class: ['ds-seg', opts.equal === false && 'ds-seg--auto', opts.className],
      role: 'radiogroup',
      'aria-label': opts.label || null,
      'data-testid': testid
    }, thumb);
    var buttons = options.map(function (o, i) {
      var b = h('button', {
        type: 'button',
        role: 'radio',
        class: 'ds-seg__opt',
        'aria-checked': 'false',
        tabindex: '-1',
        'aria-label': o.ariaLabel || null,
        'data-value': String(o.value),
        'data-tip': o.title || null,
        'data-testid': tid(testid, slug(o.value))
      },
      o.icon ? icon(o.icon, { size: 18 }) : null,
      o.label !== undefined && o.label !== null ? h('span', { class: 'ds-seg__label', 'data-text': String(o.label) }, String(o.label)) : null);
      b.addEventListener('click', function () { choose(i, true); });
      el.appendChild(b);
      return b;
    });

    function placeThumb() {
      var b = buttons[idx];
      var w = b.offsetWidth;
      var x = b.offsetLeft;
      if (!(w > 0) || typeof x !== 'number') return;
      thumb.style.setProperty('--seg-x', x + 'px');
      thumb.style.setProperty('--seg-w', w + 'px');
      if (!ready) {
        ready = true;
        util.raf(function () { el.classList.add('is-ready'); });
      }
    }

    function paint() {
      for (var i = 0; i < buttons.length; i++) {
        var on = i === idx;
        buttons[i].setAttribute('aria-checked', String(on));
        buttons[i].setAttribute('tabindex', on ? '0' : '-1');
        buttons[i].classList.toggle('is-checked', on);
      }
      placeThumb();
    }

    function choose(i, fire) {
      var changed = i !== idx;
      idx = i;
      paint();
      if (changed && fire && onChange) onChange(options[i].value);
    }

    function onKey(e) {
      var n = buttons.length;
      var next;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': next = (idx + 1) % n; break;
        case 'ArrowLeft': case 'ArrowUp': next = (idx - 1 + n) % n; break;
        case 'Home': next = 0; break;
        case 'End': next = n - 1; break;
        default: return;
      }
      e.preventDefault();
      choose(next, true);
      buttons[next].focus();
    }

    el.addEventListener('keydown', onKey);
    var stopSize = util.observeSize(el, placeThumb);
    paint();

    return {
      el: el,
      get value() { return options[idx].value; },
      set: function (v, o) {
        var i = indexOfValue(options, v);
        if (i < 0) return;
        choose(i, !(o && o.silent));
      },
      destroy: function () {
        stopSize();
        el.removeEventListener('keydown', onKey);
        el.remove();
      }
    };
  }

  /* ================================================================== tabs */

  /**
   * tabs({ tabs: [{ id, label, icon?, panel: HTMLElement }], value, onChange(id), label, testid?, placePanels = true })
   * → { el, tablist, value, select(id, { silent }), destroy() }
   * Patrón ARIA de pestañas con activación automática: flechas (con vuelta), Home, End. Fundido de 150 ms.
   */
  function tabs(opts) {
    opts = opts || {};
    var items = (opts.tabs || []).slice();
    if (!items.length) throw new Error('tabs: se necesita al menos una pestaña.');
    var testid = opts.testid || null;
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : null;
    var tablist = h('div', { class: 'ds-tabs__list', role: 'tablist', 'aria-label': opts.label || null });
    var indicator = h('span', { class: 'ds-tabs__indicator', 'aria-hidden': 'true' });
    var panelsWrap = h('div', { class: 'ds-tabs__panels' });
    var el = h('div', { class: ['ds-tabs', opts.className], 'data-testid': testid }, tablist, panelsWrap);
    var btns = [];
    var panels = [];
    var idx = -1;
    var ready = false;

    items.forEach(function (t, i) {
      var tabId = util.uid('ds-tab');
      var panel = t.panel || h('div');
      var panelId = panel.id || util.uid('ds-tabpanel');
      panel.id = panelId;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabId);
      panel.setAttribute('tabindex', '0');
      panel.classList.add('ds-tabs__panel');
      panel.hidden = true;
      var b = h('button', {
        type: 'button',
        role: 'tab',
        id: tabId,
        class: 'ds-tabs__tab',
        'aria-selected': 'false',
        'aria-controls': panelId,
        tabindex: '-1',
        'data-tab': String(t.id),
        'data-testid': tid(testid, slug(t.id))
      }, t.icon ? icon(t.icon, { size: 18 }) : null, h('span', { class: 'ds-tabs__label' }, t.label));
      b.addEventListener('click', function () { choose(i, true, false); });
      tablist.appendChild(b);
      if (opts.placePanels !== false) panelsWrap.appendChild(panel);
      btns.push(b);
      panels.push(panel);
    });
    tablist.appendChild(indicator);

    function placeIndicator() {
      var b = btns[idx];
      if (!b) return;
      var w = b.offsetWidth;
      var x = b.offsetLeft;
      if (!(w > 0) || typeof x !== 'number') return;
      indicator.style.setProperty('--tab-x', x + 'px');
      indicator.style.setProperty('--tab-s', String(Math.round(w) / 100));
      if (!ready) {
        ready = true;
        util.raf(function () { el.classList.add('is-ready'); });
      }
    }

    function choose(i, fire, focus) {
      var changed = i !== idx;
      idx = i;
      for (var j = 0; j < btns.length; j++) {
        var on = j === i;
        btns[j].setAttribute('aria-selected', String(on));
        btns[j].setAttribute('tabindex', on ? '0' : '-1');
        panels[j].hidden = !on;
      }
      if (focus) btns[i].focus();
      placeIndicator();
      if (changed && fire && onChange) onChange(items[i].id);
    }

    function onKey(e) {
      var n = btns.length;
      var next;
      switch (e.key) {
        case 'ArrowRight': next = (idx + 1) % n; break;
        case 'ArrowLeft': next = (idx - 1 + n) % n; break;
        case 'Home': next = 0; break;
        case 'End': next = n - 1; break;
        default: return;
      }
      e.preventDefault();
      choose(next, true, true);
    }

    function indexById(id) {
      for (var i = 0; i < items.length; i++) if (String(items[i].id) === String(id)) return i;
      return -1;
    }

    tablist.addEventListener('keydown', onKey);
    var stopSize = util.observeSize(tablist, placeIndicator);
    choose(Math.max(0, indexById(opts.value)), false, false);

    return {
      el: el,
      tablist: tablist,
      get value() { return items[idx].id; },
      select: function (id, o) {
        var i = indexById(id);
        if (i < 0) return;
        choose(i, !(o && o.silent), false);
      },
      destroy: function () {
        stopSize();
        tablist.removeEventListener('keydown', onKey);
        el.remove();
      }
    };
  }

  /* ================================================================== tooltips */

  var TIP_DELAY = 280;     // ms de reposo antes de mostrar al pasar el puntero
  var TIP_WARM = 400;      // tras cerrar uno, el siguiente aparece sin espera
  var TIP_GRACE = 120;     // margen para mover el puntero hasta el tooltip (WCAG 1.4.13)
  var tip = { el: null, inner: null, anchor: null, showT: null, hideT: null, lastHide: -1e9 };
  var tipRoots = [];
  var tipGlobalBound = false;

  /**
   * Posición de un tooltip con detección de colisiones (función pura).
   * place({ anchor: rect, tip: { width, height }, viewport: { width, height }, side = 'top', offset = 8, margin = 8 })
   * → { top, left, side }. Cambia al lado opuesto si no cabe y se ajusta dentro de la ventana.
   */
  function place(o) {
    var a = o.anchor;
    var t = o.tip;
    var vp = o.viewport;
    var off = o.offset === undefined || o.offset === null ? 8 : o.offset;
    var m = o.margin === undefined || o.margin === null ? 8 : o.margin;
    var side = o.side === 'bottom' || o.side === 'left' || o.side === 'right' ? o.side : 'top';
    var ab = a.bottom === undefined ? a.top + a.height : a.bottom;
    var ar = a.right === undefined ? a.left + a.width : a.right;
    var space = { top: a.top - m, bottom: vp.height - ab - m, left: a.left - m, right: vp.width - ar - m };
    var need = { top: t.height + off, bottom: t.height + off, left: t.width + off, right: t.width + off };
    var opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    if (space[side] < need[side]) {
      var alt = opposite[side];
      if (space[alt] >= need[alt]) side = alt;
      else if (side === 'left' || side === 'right') side = space.top >= space.bottom ? 'top' : 'bottom';
      else side = space[side] >= space[alt] ? side : alt;
    }
    var top;
    var left;
    if (side === 'top' || side === 'bottom') {
      top = side === 'top' ? a.top - off - t.height : ab + off;
      left = a.left + a.width / 2 - t.width / 2;
    } else {
      left = side === 'left' ? a.left - off - t.width : ar + off;
      top = a.top + a.height / 2 - t.height / 2;
    }
    left = clamp(left, m, Math.max(m, vp.width - m - t.width));
    top = clamp(top, m, Math.max(m, vp.height - m - t.height));
    return { top: top, left: left, side: side };
  }

  function closestTip(target) {
    if (!target || typeof target.closest !== 'function') return null;
    var a = target.closest('[data-tip]');
    return a && a.getAttribute('data-tip') ? a : null;
  }

  function addToken(el, attr, token) {
    var list = (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean);
    if (list.indexOf(token) < 0) list.push(token);
    el.setAttribute(attr, list.join(' '));
  }

  function removeToken(el, attr, token) {
    var list = (el.getAttribute(attr) || '').split(/\s+/).filter(function (x) { return x && x !== token; });
    if (list.length) el.setAttribute(attr, list.join(' '));
    else el.removeAttribute(attr);
  }

  function tipEnsure() {
    if (tip.el && tip.el.isConnected) return tip.el;
    var d = getDoc();
    tip.inner = h('div', { class: 'ds-tooltip__inner' });
    tip.el = h('div', { class: 'ds-tooltip', role: 'tooltip', id: util.uid('ds-tip'), 'data-state': 'closed', 'data-testid': 'ds-tooltip' }, tip.inner);
    tip.el.addEventListener('pointerenter', function () { tip.hideT = clearTimer(tip.hideT); });
    tip.el.addEventListener('pointerleave', function () { scheduleHide(); });
    d.body.appendChild(tip.el);
    return tip.el;
  }

  function positionTip(anchor) {
    var el = tip.el;
    var open = el.getAttribute('data-state') === 'open';
    if (!open) el.setAttribute('data-state', 'measure');
    var a = anchor.getBoundingClientRect();
    var w = el.offsetWidth || 0;
    var hh = el.offsetHeight || 0;
    var d = getDoc();
    var vw = global.innerWidth || (d.documentElement && d.documentElement.clientWidth) || 0;
    var vh = global.innerHeight || (d.documentElement && d.documentElement.clientHeight) || 0;
    var side = anchor.getAttribute('data-tip-side') || 'top';
    var offset = 8;
    var header = anchor.closest('.app-header');
    if (header) {
      // En la barra fija: debajo de ella, sin vidrio sobre vidrio.
      side = 'bottom';
      offset = Math.max(8, header.getBoundingClientRect().bottom - (a.bottom === undefined ? a.top + a.height : a.bottom) + 6);
    }
    var p = place({ anchor: a, tip: { width: w, height: hh }, viewport: { width: vw, height: vh }, side: side, offset: offset, margin: 8 });
    el.style.setProperty('--tip-x', Math.round(p.left) + 'px');
    el.style.setProperty('--tip-y', Math.round(p.top) + 'px');
    el.setAttribute('data-side', p.side);
  }

  function showTip(anchor) {
    var text = anchor && anchor.getAttribute('data-tip');
    if (!text) return;
    tip.showT = clearTimer(tip.showT);
    tip.hideT = clearTimer(tip.hideT);
    tipEnsure();
    if (tip.anchor && tip.anchor !== anchor) removeToken(tip.anchor, 'aria-describedby', tip.el.id);
    tip.anchor = anchor;
    tip.inner.textContent = text;
    var name = (anchor.getAttribute('aria-label') || anchor.textContent || '').trim();
    if (name !== text.trim()) addToken(anchor, 'aria-describedby', tip.el.id);
    positionTip(anchor);
    tip.el.setAttribute('data-state', 'open');
  }

  function hideTip() {
    tip.showT = clearTimer(tip.showT);
    tip.hideT = clearTimer(tip.hideT);
    if (!tip.el || !tip.anchor) return;
    removeToken(tip.anchor, 'aria-describedby', tip.el.id);
    tip.anchor = null;
    tip.el.setAttribute('data-state', 'closed');
    tip.lastHide = util.now();
  }

  function scheduleHide() {
    tip.hideT = clearTimer(tip.hideT);
    tip.hideT = global.setTimeout(hideTip, TIP_GRACE);
  }

  function isHoverPointer(e) {
    return !e.pointerType || e.pointerType === 'mouse' || e.pointerType === 'pen';
  }

  function onTipOver(e) {
    if (!isHoverPointer(e)) return;
    if (tip.anchor && !tip.anchor.isConnected) hideTip();
    var a = closestTip(e.target);
    if (!a) return;
    if (a === tip.anchor) {
      tip.hideT = clearTimer(tip.hideT);
      return;
    }
    tip.showT = clearTimer(tip.showT);
    var warm = !!tip.anchor || util.now() - tip.lastHide < TIP_WARM;
    if (warm) showTip(a);
    else tip.showT = global.setTimeout(function () { tip.showT = null; showTip(a); }, TIP_DELAY);
  }

  function onTipOut(e) {
    if (!isHoverPointer(e)) return;
    var a = closestTip(e.target);
    if (!a) return;
    var to = e.relatedTarget;
    if (to && (a.contains(to) || (tip.el && tip.el.contains(to)))) return;
    tip.showT = clearTimer(tip.showT);
    if (a === tip.anchor) scheduleHide();
  }

  function onTipFocusIn(e) {
    var a = closestTip(e.target);
    if (!a) return;
    var visible = true;
    try { visible = e.target.matches(':focus-visible'); } catch (err) { visible = true; }
    if (visible) showTip(a);
  }

  function onTipFocusOut(e) {
    var a = closestTip(e.target);
    if (!a || a !== tip.anchor) return;
    var to = e.relatedTarget;
    if (to && a.contains(to)) return;
    hideTip();
  }

  function onTipPointerDown(e) {
    if (e.pointerType !== 'touch') return;
    var a = closestTip(e.target);
    if (a && a.classList.contains('ds-help')) {
      if (tip.anchor === a) hideTip();
      else showTip(a);
    } else if (tip.anchor && !(tip.el && tip.el.contains(e.target))) {
      hideTip();
    }
  }

  function onTipKey(e) {
    if (e.key === 'Escape' && tip.anchor) {
      hideTip();
      e.stopPropagation();
    }
  }

  /** Enter o Espacio sobre un botón «?» (clic sin puntero, detail 0): abre o cierra su explicación. */
  function onTipClick(e) {
    if (e.detail !== 0) return;
    var a = closestTip(e.target);
    if (!a || !a.classList.contains('ds-help')) return;
    if (tip.anchor === a) hideTip();
    else showTip(a);
  }

  function onTipViewport() {
    if (tip.anchor) hideTip();
  }

  var tooltips = {
    /** Delegación: cualquier [data-tip] dentro de root muestra el tooltip al pasar el puntero o enfocar. Idempotente. */
    init: function (root) {
      root = root || getDoc();
      if (!root || tipRoots.indexOf(root) >= 0) return;
      tipRoots.push(root);
      root.addEventListener('pointerover', onTipOver);
      root.addEventListener('pointerout', onTipOut);
      root.addEventListener('focusin', onTipFocusIn);
      root.addEventListener('focusout', onTipFocusOut);
      root.addEventListener('pointerdown', onTipPointerDown, { passive: true });
      root.addEventListener('click', onTipClick);
      if (!tipGlobalBound) {
        tipGlobalBound = true;
        getDoc().addEventListener('keydown', onTipKey, true);
        global.addEventListener('scroll', onTipViewport, { passive: true, capture: true });
        global.addEventListener('resize', onTipViewport);
      }
    },
    /** Muestra ya el tooltip de `el` (que debe tener data-tip). */
    show: function (el) { showTip(el); },
    hide: function () { hideTip(); },
    /** Si el tooltip abierto pertenece a `el` (o a cualquiera sin argumento), actualiza texto y posición. */
    refresh: function (el) {
      if (tip.anchor && (!el || el === tip.anchor)) showTip(tip.anchor);
    },
    isOpen: function () { return !!tip.anchor; },
    place: place
  };

  /** tooltip(el, text) → el: fija el texto del tooltip accesible (data-tip). */
  function tooltip(el, text) {
    if (text === null || text === undefined || text === '') el.removeAttribute('data-tip');
    else el.setAttribute('data-tip', String(text));
    tooltips.refresh(el);
    return el;
  }

  /* ================================================================== transport */

  /**
   * transport({ onPlay, onPause, onReset, onSpeed(x), speeds = [0.25, 0.5, 1, 2, 4], speed = 1, playing = false,
   *             timeLabel = 't', timeUnit = 's', timeDecimals = 2, label = 'Controles de la simulación', testidPrefix })
   * → { el, setPlaying(b), setTime(t), setSpeed(x), playing, speed, destroy() }
   * Reproducir/Pausar es un solo botón (cambia aria-label; el glifo se transforma en 120 ms).
   */
  function transport(opts) {
    opts = opts || {};
    var prefix = opts.testidPrefix || null;
    var speeds = (opts.speeds || [0.25, 0.5, 1, 2, 4]).slice();
    var state = { playing: !!opts.playing, speed: Number(opts.speed) || 1 };
    var timeDecimals = opts.timeDecimals === undefined ? 2 : opts.timeDecimals;
    var lastTime = null;

    var glyph = h('span', { class: 'ds-playglyph', 'aria-hidden': 'true' },
      h('span', { class: 'ds-playglyph__a' }),
      h('span', { class: 'ds-playglyph__b' }));
    var playBtn = h('button', {
      type: 'button',
      class: 'ds-btn ds-btn--primary ds-btn--icon ds-transport__play',
      'data-testid': tid(prefix, 'play')
    }, glyph);
    var resetBtn = button({
      icon: 'rotate-ccw',
      iconOnly: true,
      variant: 'ghost',
      ariaLabel: 'Reiniciar',
      title: 'Reiniciar',
      className: 'ds-transport__reset',
      testid: tid(prefix, 'reset')
    });
    var speedSeg = segmented({
      label: 'Velocidad',
      options: speeds.map(function (s) { return { value: s, label: util.formatNumber(s, 3) + '×' }; }),
      value: state.speed,
      testid: tid(prefix, 'speed'),
      className: 'ds-transport__speed',
      onChange: function (v) {
        state.speed = Number(v);
        if (typeof opts.onSpeed === 'function') opts.onSpeed(state.speed);
      }
    });
    speedSeg.el.setAttribute('data-tip', 'Velocidad');
    var tVal = h('span', { class: 'ds-transport__tv' });
    var time = h('span', { class: 'ds-transport__time', role: 'timer', 'data-testid': tid(prefix, 'time') },
      h('span', { class: 'ds-sym', translate: 'no' }, opts.timeLabel || 't'),
      h('span', { class: 'ds-transport__eq', 'aria-hidden': 'true' }, '='),
      tVal,
      (opts.timeUnit === undefined ? 's' : opts.timeUnit) ? h('span', { class: 'ds-transport__tu' }, opts.timeUnit === undefined ? 's' : opts.timeUnit) : null);

    var el = h('div', {
      class: ['ds-transport', opts.className],
      role: 'group',
      'aria-label': opts.label || 'Controles de la simulación',
      'data-testid': tid(prefix, 'transport')
    },
    h('div', { class: 'ds-transport__main' }, playBtn, resetBtn),
    h('span', { class: 'ds-transport__sep', 'aria-hidden': 'true' }),
    speedSeg.el,
    time);

    function paintPlay() {
      var label = state.playing ? 'Pausar' : 'Reproducir';
      playBtn.setAttribute('aria-label', label);
      playBtn.setAttribute('data-tip', label);
      playBtn.setAttribute('data-state', state.playing ? 'playing' : 'paused');
      tooltips.refresh(playBtn);
    }

    function onPlayClick() {
      state.playing = !state.playing;
      paintPlay();
      if (state.playing) { if (typeof opts.onPlay === 'function') opts.onPlay(); }
      else if (typeof opts.onPause === 'function') opts.onPause();
    }

    function onResetClick() {
      if (!reducedMotion()) {
        resetBtn.classList.remove('is-spinning');
        void resetBtn.offsetWidth; // reinicia la animación
        resetBtn.classList.add('is-spinning');
      }
      if (typeof opts.onReset === 'function') opts.onReset();
    }

    function onSpinEnd() { resetBtn.classList.remove('is-spinning'); }

    playBtn.addEventListener('click', onPlayClick);
    resetBtn.addEventListener('click', onResetClick);
    resetBtn.addEventListener('animationend', onSpinEnd);

    var api = {
      el: el,
      get playing() { return state.playing; },
      get speed() { return state.speed; },
      setPlaying: function (b) {
        b = !!b;
        if (b === state.playing) return;
        state.playing = b;
        paintPlay();
      },
      setTime: function (t) {
        var s = util.formatNumber(Number(t), 6, { decimals: timeDecimals });
        if (s === lastTime) return;
        lastTime = s;
        tVal.textContent = s;
      },
      setSpeed: function (x) {
        state.speed = Number(x);
        speedSeg.set(x, { silent: true });
      },
      destroy: function () {
        playBtn.removeEventListener('click', onPlayClick);
        resetBtn.removeEventListener('click', onResetClick);
        resetBtn.removeEventListener('animationend', onSpinEnd);
        speedSeg.destroy();
        el.remove();
      }
    };
    paintPlay();
    api.setTime(0);
    return api;
  }

  /* ================================================================== toggle */

  /**
   * toggle({ label, checked = false, onChange(checked), testid?, description? })
   * → { el, checked, set(b, { silent }), destroy() }. El interruptor es un <button role="switch">.
   */
  function toggle(opts) {
    opts = opts || {};
    var checked = !!opts.checked;
    var descId = opts.description ? util.uid('ds-toggle-desc') : null;
    var btn = h('button', {
      type: 'button',
      role: 'switch',
      class: 'ds-toggle',
      'aria-checked': String(checked),
      'aria-describedby': descId,
      'data-testid': opts.testid || null
    },
    h('span', { class: 'ds-toggle__track', 'aria-hidden': 'true' }, h('span', { class: 'ds-toggle__thumb' })),
    h('span', { class: 'ds-toggle__label' }, opts.label));
    var el = h('div', { class: ['ds-toggle-field', opts.className] }, btn,
      descId ? h('p', { id: descId, class: 'ds-toggle__desc' }, opts.description) : null);

    function apply(next, fire) {
      next = !!next;
      var changed = next !== checked;
      checked = next;
      btn.setAttribute('aria-checked', String(checked));
      if (changed && fire && typeof opts.onChange === 'function') opts.onChange(checked);
    }
    function onClick() { apply(!checked, true); }
    btn.addEventListener('click', onClick);

    return {
      el: el,
      button: btn,
      get checked() { return checked; },
      set: function (b, o) { apply(b, !(o && o.silent)); },
      destroy: function () {
        btn.removeEventListener('click', onClick);
        el.remove();
      }
    };
  }

  /* ================================================================== collapsible */

  /**
   * collapsible({ title, content, open = false, number?, headingLevel = 3, onToggle(isOpen), testid? })
   * → { el, open(), close(), toggle(), isOpen(), setContent(node), destroy() }
   * Botón con aria-expanded; la región se despliega con grid-template-rows 0fr → 1fr.
   */
  function collapsible(opts) {
    opts = opts || {};
    var isOpen = !!opts.open;
    var level = clamp(Math.round(opts.headingLevel || 3), 2, 6);
    var regionId = util.uid('ds-collapse');
    var testid = opts.testid || null;
    var btn = h('button', {
      type: 'button',
      class: 'ds-collapse__btn',
      'aria-expanded': String(isOpen),
      'aria-controls': regionId,
      'data-testid': tid(testid, 'toggle')
    },
    opts.number !== undefined && opts.number !== null ? h('span', { class: 'ds-collapse__num' }, String(opts.number)) : null,
    h('span', { class: 'ds-collapse__title' }, kids(opts.title)),
    icon('chevron-down', { size: 20, className: 'ds-collapse__chev' }));
    var content = h('div', { class: 'ds-collapse__content' }, kids(opts.content));
    var inner = h('div', { class: 'ds-collapse__inner' }, content);
    var region = h('div', { class: 'ds-collapse__region', id: regionId, 'data-testid': tid(testid, 'region') }, inner);
    var el = h('div', {
      class: ['ds-collapse', opts.number !== undefined && opts.number !== null && 'ds-collapse--numbered', isOpen && 'is-open', opts.className],
      'data-testid': testid
    }, h('h' + level, { class: 'ds-collapse__heading' }, btn), region);

    function apply(next, fire) {
      next = !!next;
      if (next === isOpen) return;
      isOpen = next;
      btn.setAttribute('aria-expanded', String(isOpen));
      el.classList.toggle('is-open', isOpen);
      if (fire && typeof opts.onToggle === 'function') opts.onToggle(isOpen);
    }
    function onClick() { apply(!isOpen, true); }
    btn.addEventListener('click', onClick);

    return {
      el: el,
      button: btn,
      open: function () { apply(true, true); },
      close: function () { apply(false, true); },
      toggle: function () { apply(!isOpen, true); },
      isOpen: function () { return isOpen; },
      setContent: function (node) {
        content.textContent = '';
        kids(node).forEach(function (n) { content.appendChild(isNode(n) ? n : getDoc().createTextNode(String(n))); });
      },
      destroy: function () {
        btn.removeEventListener('click', onClick);
        el.remove();
      }
    };
  }

  /* ================================================================== card, chip */

  /**
   * card({ title?, icon?, body, footer?, as = 'article', headingLevel = 3, className?, testid?,
   *        interactive = false, spotlight = false }) → HTMLElement (superficie de nivel B).
   * spotlight: reflejo que sigue al puntero (solo con ratón; DSL.ui.init activa la delegación).
   */
  function card(opts) {
    opts = opts || {};
    var level = clamp(Math.round(opts.headingLevel || 3), 2, 6);
    var el = h(opts.as || 'article', {
      class: ['ds-card', opts.interactive && 'ds-card--interactive', opts.className],
      'data-spotlight': opts.spotlight ? '' : null,
      'data-testid': opts.testid || null
    });
    if (opts.title || opts.icon) {
      el.appendChild(h('div', { class: 'ds-card__head' },
        opts.icon ? h('span', { class: 'ds-card__icon' }, icon(opts.icon, { size: 20 })) : null,
        opts.title ? h('h' + level, { class: 'ds-card__title' }, kids(opts.title)) : null));
    }
    el.appendChild(h('div', { class: 'ds-card__body' }, kids(opts.body)));
    if (opts.footer) el.appendChild(h('div', { class: 'ds-card__foot' }, kids(opts.footer)));
    return el;
  }

  var TONES = { neutral: 1, accent: 1, success: 1, warning: 1, danger: 1, info: 1 };

  /**
   * chip({ label, tone = 'neutral'|'accent'|'success'|'warning'|'danger'|'info', icon?, title?, testid? }) → <span>.
   * El tono va siempre con texto (y opcionalmente icono). `title` se lee también con lector de pantalla.
   */
  function chip(opts) {
    opts = opts || {};
    var tone = TONES[opts.tone] ? opts.tone : 'neutral';
    var el = h('span', {
      class: ['ds-chip', 'ds-chip--' + tone, opts.className],
      'data-tip': opts.title || null,
      'data-testid': opts.testid || null
    },
    opts.icon ? icon(opts.icon, { size: 16 }) : null,
    h('span', { class: 'ds-chip__label' }, kids(opts.label)),
    opts.title ? h('span', { class: 'sr-only' }, ' (' + opts.title + ')') : null);
    return el;
  }

  /* ================================================================== readout */

  function renderTex(target, tex) {
    var katex = global.katex;
    if (katex && typeof katex.render === 'function') {
      try {
        katex.render(String(tex), target, { throwOnError: false, strict: 'ignore', output: 'html' });
        return true;
      } catch (err) { /* cae al texto plano */ }
    }
    target.textContent = String(tex);
    return false;
  }

  /**
   * readout({ label, tex?, value, unit = '', digits = 3, live = false, layout = 'stack'|'inline', tone?, tip?, testid? })
   * → { el, set(value, { unit? }), destroy() }. Números con formatNumber y cifras tabulares.
   * live: aria-live="polite" (solo para resultados clave; nunca en lecturas que cambian cada frame).
   * tip: explicación del resultado; añade junto a la etiqueta un botón «?» («Explicación de «label»»,
   * data-tip) y el mismo texto como sr-only. Sin tip, el marcado no cambia.
   */
  /* Cifra y «%» no se separan al partir la línea («2 %» con espacio duro, como en tfengine y charts):
     solo el texto mostrado; el nombre accesible del «?» y los datos del modelo no cambian. */
  function keepPercent(label) {
    return typeof label === 'string' ? label.replace(/(\d) %/g, '$1' + String.fromCharCode(0xa0) + '%') : label;
  }

  function readout(opts) {
    opts = opts || {};
    var digits = opts.digits === undefined ? 3 : opts.digits;
    var testid = opts.testid || null;
    var unit = opts.unit || '';
    var last = null;
    var lastUnit = null;
    var sym = null;
    if (opts.tex) {
      sym = h('span', { class: 'ds-readout__sym', translate: 'no', 'aria-hidden': 'true' });
      renderTex(sym, opts.tex);
    }
    var num = h('span', { class: 'ds-readout__num', 'data-testid': tid(testid, 'value') });
    var unitEl = h('span', { class: 'ds-readout__unit' });
    // Separador cifra–unidad (auditoría, ronda 2): un espacio normal entre los dos elementos flex, que el
    // flex no pinta pero sí leen textContent y los lectores. La separación visible es el column-gap de
    // .ds-readout__value, que no sangra la unidad cuando baja de línea (un U+00A0 dentro de ella sí).
    var sep = getDoc().createTextNode('');
    var el = h('div', {
      class: ['ds-readout', opts.layout === 'inline' && 'ds-readout--inline', opts.tone && 'ds-readout--' + opts.tone, opts.className],
      role: opts.live ? 'status' : null,
      'aria-live': opts.live ? 'polite' : null,
      'aria-atomic': opts.live ? 'true' : null,
      'data-testid': testid
    },
    h('span', { class: 'ds-readout__label' }, sym, h('span', { class: 'ds-readout__text' }, keepPercent(opts.label)),
      opts.tip ? help(String(opts.tip), { label: String(opts.label || ''), testid: tid(testid, 'help') }) : null,
      opts.tip ? h('span', { class: 'sr-only' }, ' ' + String(opts.tip)) : null),
    h('span', { class: 'ds-readout__value' }, num, sep, unitEl));

    function fmt(v) {
      if (typeof v === 'number') return util.formatNumber(v, digits);
      if (v === null || v === undefined) return '—';
      return String(v);
    }

    var api = {
      el: el,
      set: function (v, o) {
        var s = fmt(v);
        if (o && o.unit !== undefined) unit = o.unit || '';
        if (s === last && unit === lastUnit) return;
        last = s;
        lastUnit = unit;
        num.textContent = s;
        sep.textContent = unit ? ' ' : '';
        unitEl.textContent = unit;
      },
      destroy: function () { el.remove(); }
    };
    api.set(opts.value);
    return api;
  }

  /* ================================================================== announce (región viva compartida) */

  var live = { el: null, timer: null };

  function ensureLive() {
    if (live.el && live.el.isConnected) return false;
    var d = getDoc();
    if (!d || !d.body) return false;
    live.el = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', 'data-testid': 'ds-live' });
    d.body.appendChild(live.el);
    return true;
  }

  /** announce(text): lo lee la región viva cortés compartida. Repetir el mismo texto vuelve a anunciarlo. */
  function announce(text) {
    var fresh = ensureLive();
    if (!live.el) return;
    live.timer = clearTimer(live.timer);
    live.el.textContent = '';
    live.timer = global.setTimeout(function () {
      live.timer = null;
      live.el.textContent = String(text === null || text === undefined ? '' : text);
    }, fresh ? 120 : 60);
  }

  /* ================================================================== toast */

  var toastHost = null;
  var TOAST_ICONS = { neutral: 'info', accent: 'info', info: 'info', success: 'circle-check', warning: 'triangle-alert', danger: 'circle-alert' };
  var MAX_TOASTS = 3;
  var NOTE_MS = 4000;             // nota de ajuste del deslizador («Se ajustó a…»)

  function ensureToastHost() {
    if (toastHost && toastHost.isConnected) return toastHost;
    toastHost = h('section', { class: 'ds-toasts', 'aria-label': 'Avisos', 'data-testid': 'ds-toasts' });
    getDoc().body.appendChild(toastHost);
    return toastHost;
  }

  /* Última modalidad de entrada (ui.init): un aviso con acción creado justo después de una tecla
     lleva el foco a su acción; con puntero no se mueve el foco. */
  var modality = { kind: null, at: -1e9, bound: false };
  var KEY_RECENT_MS = 1000;
  function onModalityKey(e) {
    if (e && (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta')) return;
    modality.kind = 'keyboard';
    modality.at = util.now();
  }
  function onModalityPointer() {
    modality.kind = 'pointer';
    modality.at = util.now();
  }
  function trackModality() {
    if (modality.bound) return;
    var d = getDoc();
    if (!d || typeof d.addEventListener !== 'function') return;
    modality.bound = true;
    d.addEventListener('keydown', onModalityKey, true);
    d.addEventListener('pointerdown', onModalityPointer, true);
  }
  /** 'keyboard' | 'pointer' | null: la última forma de interactuar (null antes de ui.init o de la primera). */
  function inputModality() {
    return modality.kind;
  }
  function keyboardJustNow() {
    return modality.kind === 'keyboard' && util.now() - modality.at <= KEY_RECENT_MS;
  }

  /**
   * toast(message, { tone = 'neutral', action?: { label, onClick }, duration = 5000, testid = 'ds-toast',
   *                  returnFocus? }) → { el, dismiss() }
   * Aviso flotante (vidrio nivel A). El temporizador se pausa con el puntero encima o con el foco dentro.
   * El texto se anuncia por la región viva. duration 0 o Infinity: no se cierra solo.
   * Con teclado (la acción que lo creó fue una tecla, según ui.init): el foco va a la acción del aviso,
   * Escape lo cierra y, al cerrarse, el foco vuelve a opts.returnFocus (elemento o función que lo
   * devuelve) o, si no, al elemento que lo tenía antes. Con puntero, nada cambia (5 s).
   */
  function toast(message, opts) {
    opts = opts || {};
    var d0 = getDoc();
    var prevFocus = d0 ? d0.activeElement : null;
    var byKeyboard = keyboardJustNow();
    var tone = TONES[opts.tone] ? opts.tone : 'neutral';
    var duration = opts.duration === undefined ? 5000 : Number(opts.duration);
    var host = ensureToastHost();
    var timer = null;
    var remaining = duration;
    var startedAt = 0;
    var gone = false;

    var actionBtn = null;
    if (opts.action && opts.action.label) {
      actionBtn = button({ label: opts.action.label, variant: 'ghost', size: 'sm', className: 'ds-toast__action', testid: (opts.testid || 'ds-toast') + '-action' });
      actionBtn.addEventListener('click', function () {
        if (typeof opts.action.onClick === 'function') opts.action.onClick();
        dismiss();
      });
    }
    var closeBtn = button({ icon: 'x', iconOnly: true, variant: 'ghost', size: 'sm', ariaLabel: 'Cerrar aviso', className: 'ds-toast__close', testid: (opts.testid || 'ds-toast') + '-close' });
    closeBtn.addEventListener('click', function () { dismiss(); });

    var el = h('div', { class: ['ds-toast', 'ds-toast--' + tone], 'data-state': 'open', 'data-testid': opts.testid || 'ds-toast' },
      icon(TOAST_ICONS[tone], { size: 20, className: 'ds-toast__icon' }),
      h('p', { class: 'ds-toast__msg' }, String(message)),
      actionBtn,
      closeBtn);

    function start() {
      if (!(duration > 0) || !isFinite(duration) || gone) return;
      startedAt = util.now();
      timer = global.setTimeout(dismiss, remaining);
    }
    function pause() {
      if (timer === null) return;
      timer = clearTimer(timer);
      remaining = Math.max(800, remaining - (util.now() - startedAt));
    }
    function focusBack() {
      var d = getDoc();
      var t = typeof opts.returnFocus === 'function' ? opts.returnFocus() : opts.returnFocus;
      if (!t || !t.isConnected) t = prevFocus;
      if (!t || !t.isConnected || typeof t.focus !== 'function' || (d && t === d.body)) return;
      try { t.focus({ preventScroll: true }); } catch (err) { t.focus(); }
    }
    function dismiss() {
      if (gone) return;
      gone = true;
      timer = clearTimer(timer);
      var d = getDoc();
      var hadFocus = !!d && !!d.activeElement && el.contains(d.activeElement);
      el.setAttribute('data-state', 'exit');
      el.removeEventListener('keydown', onKey);
      if (hadFocus) focusBack();
      global.setTimeout(function () { el.remove(); }, 180);
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (e.preventDefault) e.preventDefault();
      e.stopPropagation();
      dismiss();
    }

    el.addEventListener('pointerenter', pause);
    el.addEventListener('pointerleave', function () { if (timer === null) start(); });
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', function (e) {
      if (e.relatedTarget && el.contains(e.relatedTarget)) return;
      if (timer === null) start();
    });

    host.appendChild(el);
    var open = host.querySelectorAll('.ds-toast');
    var active = [];
    for (var i = 0; i < open.length; i++) if (open[i].getAttribute('data-state') !== 'exit') active.push(open[i]);
    for (var j = 0; j < active.length - MAX_TOASTS; j++) {
      if (active[j]._dsDismiss) active[j]._dsDismiss();
    }
    el._dsDismiss = dismiss;
    el.addEventListener('keydown', onKey);
    announce(String(message));
    start();
    if (actionBtn && byKeyboard) {
      try { actionBtn.focus({ preventScroll: true }); } catch (err) { actionBtn.focus(); }
    }
    return { el: el, dismiss: dismiss };
  }

  /* ================================================================== reveal */

  /**
   * reveal(el, { delay = 0, stagger = 0, items? }) → stop()
   * Aparición única (opacidad + 20px de subida) al entrar en pantalla. Con `items` (selector simple)
   * se escalonan esos descendientes. Con movimiento reducido o sin IntersectionObserver no oculta nada.
   * Úsese con moderación (SKILLS_BRIEF §1: nada de fundidos en cada sección).
   */
  function reveal(el, opts) {
    opts = opts || {};
    if (!el || reducedMotion() || typeof global.IntersectionObserver !== 'function') return function () {};
    var delay = Number(opts.delay) || 0;
    var stagger = Number(opts.stagger) || 0;
    var targets = opts.items ? Array.prototype.slice.call(el.querySelectorAll(opts.items)) : [el];
    targets.forEach(function (t, i) {
      t.classList.add('ds-reveal');
      t.style.setProperty('--reveal-delay', (delay + i * stagger) + 'ms');
    });
    var stop = util.onVisible(el, function (visible) {
      if (!visible) return;
      targets.forEach(function (t) { t.classList.add('is-revealed'); });
    }, { once: true, rootMargin: '0px 0px -8% 0px' });
    return function () {
      stop();
      targets.forEach(function (t) {
        t.classList.remove('ds-reveal', 'is-revealed');
        t.style.removeProperty('--reveal-delay');
      });
    };
  }

  /* ================================================================== init (arranque de la capa de UI) */

  var motionBound = false;
  function syncMotionAttr() {
    var root = getDoc().documentElement;
    function apply() {
      if (DSL.prefs.reducedMotion) root.setAttribute('data-motion', 'reduce');
      else root.removeAttribute('data-motion');
    }
    apply();
    if (!motionBound) {
      motionBound = true;
      DSL.bus.on('motion:change', apply);
    }
  }

  var spot = { roots: [], card: null, x: 0, y: 0, frame: null };
  function spotFrame() {
    spot.frame = null;
    var c = spot.card;
    if (!c || !c.isConnected) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty('--mx', Math.round(spot.x - r.left) + 'px');
    c.style.setProperty('--my', Math.round(spot.y - r.top) + 'px');
  }
  function onSpotMove(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (reducedMotion()) return;
    var c = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-spotlight]') : null;
    if (!c) return;
    spot.card = c;
    spot.x = e.clientX;
    spot.y = e.clientY;
    if (spot.frame === null) spot.frame = util.raf(spotFrame);
  }

  /**
   * init(root = document): tooltips delegados, región viva, atributo data-motion en <html> (sigue a
   * DSL.prefs.reducedMotion) y reflejo de tarjetas [data-spotlight]. Idempotente. Lo llama app.js.
   */
  function init(root) {
    var d = getDoc();
    root = root || d;
    tooltips.init(root);
    trackModality();
    ensureLive();
    syncMotionAttr();
    if (spot.roots.indexOf(root) < 0) {
      spot.roots.push(root);
      root.addEventListener('pointermove', onSpotMove, { passive: true });
    }
  }

  /* ================================================================== exportación */

  ui.icon = icon;
  ui.button = button;
  ui.help = help;
  ui.slider = slider;
  ui.segmented = segmented;
  ui.tabs = tabs;
  ui.tooltips = tooltips;
  ui.tooltip = tooltip;
  ui.transport = transport;
  ui.toggle = toggle;
  ui.collapsible = collapsible;
  ui.card = card;
  ui.chip = chip;
  ui.readout = readout;
  ui.toast = toast;
  ui.reveal = reveal;
  ui.announce = announce;
  ui.inputModality = inputModality;
  ui.init = init;
  /** Funciones puras expuestas para las pruebas unitarias. */
  ui.helpers = {
    place: place,
    makeScale: makeScale,
    sigRound: sigRound,
    snapTo: snapTo,
    decimalsOf: decimalsOf,
    slug: slug,
    renderTex: renderTex
  };
})(window.DSL);
