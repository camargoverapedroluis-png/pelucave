/*
 * js/systems/simulator.js — Propietario: systems.
 * Clase Simulator: paso fijo RK4 con acumulador de tiempo real, iteración por periodos en los
 * modelos discretos, velocidad, historial en anillo y eventos. Determinista. → DSL.systems.Simulator.
 * API: docs/api/systems.md.
 */
(function (DSL) {
  'use strict';

  var util = DSL.util;
  var S = DSL.systems;

  var MAX_SUBSTEPS = 2000;
  var SPEED_MIN = 0.25, SPEED_MAX = 4;
  var DEFAULT_BOUND = 1e12;
  var ACC_EPS = 1e-9;

  /* ------------------------------------------------------------------ historial en anillo */

  function RingBuffer(capacity) {
    this.capacity = Math.max(1, Math.floor(capacity) || 1);
    this._buf = new Array(this.capacity);
    this._start = 0;
    this.length = 0;
  }
  RingBuffer.prototype.push = function (item) {
    if (this.length < this.capacity) {
      this._buf[(this._start + this.length) % this.capacity] = item;
      this.length++;
    } else {
      this._buf[this._start] = item;
      this._start = (this._start + 1) % this.capacity;
    }
  };
  /** i = 0 es la muestra más antigua; acepta índices negativos desde el final. */
  RingBuffer.prototype.get = function (i) {
    if (i < 0) i += this.length;
    if (!(i >= 0 && i < this.length)) return undefined;
    return this._buf[(this._start + i) % this.capacity];
  };
  RingBuffer.prototype.last = function () { return this.length ? this.get(this.length - 1) : undefined; };
  RingBuffer.prototype.toArray = function () {
    var out = new Array(this.length);
    for (var i = 0; i < this.length; i++) out[i] = this.get(i);
    return out;
  };
  RingBuffer.prototype.forEach = function (fn) {
    for (var i = 0; i < this.length; i++) fn(this.get(i), i);
  };
  RingBuffer.prototype.clear = function () {
    this._buf = new Array(this.capacity);
    this._start = 0;
    this.length = 0;
  };

  /* ------------------------------------------------------------------ simulador */

  function clampSpeed(x) {
    x = Number(x);
    if (!isFinite(x)) return 1;
    return Math.min(SPEED_MAX, Math.max(SPEED_MIN, x));
  }

  function copyObj(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }

  class Simulator {
    constructor(modelOrId, opts) {
      opts = opts || {};
      var m = S.helpers.resolve(modelOrId);
      this._model = m;
      this._variant = S.variantOf(m, opts.variant);
      this._params = S.helpers.mergeParams(m, this._variant.id, opts.params);
      this._dtOverride = opts.dt > 0 ? opts.dt : null;
      this._speed = clampSpeed(opts.speed === undefined ? 1 : opts.speed);
      this._history = new RingBuffer(opts.historySize || 2400);
      this._em = util.emitter();
      this._destroyed = false;
      this._setInputInternal(opts.input || S.defaultInput(m, this._variant.id));
      this._buildDeriv();
      this._resetState();
    }

    /* ------------------------------------------------------------ internos */

    _setInputInternal(spec) {
      this._input = S.normalizeInput(spec);
      this._uf = S.inputSignal(this._input);
      this._bps = S.inputBreakpoints(this._input).slice().sort(function (a, b) { return a - b; });
    }

    _buildDeriv() {
      var self = this;
      // f(t, x) con la entrada evaluada en el tramo actual (límites laterales en los saltos).
      this._segUf = this._uf;
      this._f = function (t, x) {
        return self._model.deriv(t, x, self._segUf(t), self._params, self._variant.id);
      };
    }

    _computeHints() {
      var h = this._model.hints(this._params, this._variant.id) || {};
      this._hints = h;
      this._isDiscrete = this._variant.timeDomain === 'discrete';
      this._dt = this._isDiscrete ? 1 : (this._dtOverride || h.dt);
      this._bound = h.stateBound > 0 ? h.stateBound : DEFAULT_BOUND;
    }

    _resetState() {
      this._computeHints();
      this._timeScale = this._hints.timeScale > 0 ? this._hints.timeScale : 1;
      this._t = 0;
      this._k = 0;
      this._acc = 0;
      this._halted = null;
      this._x = this._model.x0(this._params, this._variant.id).slice();
      this._history.clear();
      this._record();
    }

    _uNow() { return this._uf(this._isDiscrete ? this._k : this._t); }

    _outputsNow() {
      return this._model.output(this._t, this._x, this._uNow(), this._params, this._variant.id);
    }

    _record() {
      this._history.push({ t: this._t, outputs: this._outputsNow(), state: this._x.slice(), u: this._uNow() });
    }

    _payload(substeps) {
      return { t: this._t, state: this._x.slice(), outputs: this._outputsNow(), u: this._uNow(), substeps: substeps };
    }

    /** Carga del evento 'halt': { t, reason } y, si la detención tiene clase (salida del dominio), kind. */
    _haltPayload() {
      var p = { t: this._t, reason: this._halted.reason };
      if (this._halted.kind) p.kind = this._halted.kind;
      return p;
    }

    _checkState(x, t) {
      for (var i = 0; i < x.length; i++) {
        var v = x[i];
        if (!isFinite(v) || Math.abs(v) > this._bound) {
          this._halted = {
            t: t,
            reason: !isFinite(v)
              ? 'La simulación se detuvo: el estado dejó de ser un número finito.'
              : 'La simulación se detuvo: el estado creció sin límite (sistema divergente).'
          };
          return false;
        }
      }
      return true;
    }

    /**
     * Hook opcional model.domain(x, outputs, params, variant) → null o motivo (texto): tras aceptar un
     * paso, si el estado salió del dominio en que el modelo tiene sentido, la simulación se detiene
     * (el paso ya forma parte de la trayectoria y se registra).
     */
    _checkDomain() {
      var dom = this._model.domain;
      if (typeof dom !== 'function') return;
      var why = dom.call(this._model, this._x.slice(), this._outputsNow(), this._params, this._variant.id);
      if (!why) return;
      var when = this._isDiscrete ? 'k = ' + this._k : 't = ' + util.formatNumber(this._t, 4) + ' ' + (this._variant.timeUnit || 's');
      this._halted = { t: this._t, reason: 'La simulación se detuvo en ' + when + ': ' + why, kind: 'dominio' };
    }

    /** Un paso RK4 de tamaño h desde t, partido en los saltos de la entrada. */
    _rkStep(h) {
      var N = DSL.core.numeric;
      var t = this._t, tEnd = t + h;
      var x = this._x.slice();
      var bps = this._bps;
      var split = false;
      for (var j = 0; j < bps.length; j++) if (bps[j] > t && bps[j] <= tEnd) { split = true; break; }
      if (!split) {
        x = N.rk4Step(this._f, t, x, h, x);
      } else {
        // Hay un salto de la entrada dentro del paso: se integra por tramos con límites laterales.
        var a = t;
        for (var i = 0; i <= bps.length; i++) {
          var b = i < bps.length ? bps[i] : tEnd;
          if (b <= a) continue;
          if (b > tEnd) b = tEnd;
          this._segUf = S.helpers.segmentInput(this._uf, a, b);
          x = N.rk4Step(this._f, a, x, b - a, x);
          a = b;
          if (a >= tEnd) break;
        }
        this._segUf = this._uf;
      }
      if (!this._checkState(x, tEnd)) return false;
      this._x = x;
      this._t = tEnd;
      this._checkDomain();
      return true;
    }

    _iterate() {
      var u = this._uf(this._k);
      var x = this._model.next(this._k, this._x, u, this._params, this._variant.id).slice();
      if (!this._checkState(x, this._k + 1)) return false;
      this._x = x;
      this._k += 1;
      this._t = this._k;
      this._checkDomain();
      return true;
    }

    /* ------------------------------------------------------------ API pública */

    /** Avanza según el tiempo real transcurrido (s). Devuelve los subpasos o iteraciones dados. */
    step(realDt) {
      if (this._destroyed || this._halted || !(realDt > 0)) return 0;
      this._acc += realDt * this._speed * this._timeScale;
      var n = 0;
      if (this._isDiscrete) {
        // Tolerancia relativa 1e-9: la suma de dt reales en coma flotante no pierde un periodo.
        while (this._acc >= 1 - ACC_EPS && n < MAX_SUBSTEPS) {
          if (!this._iterate()) break;
          this._acc -= 1;
          n++;
          if (this._halted) break;          // salió del dominio: este periodo cuenta y es el último
        }
        if (this._acc >= 1) this._acc -= Math.floor(this._acc);
      } else {
        var dt = this._dt;
        while (this._acc >= dt * (1 - ACC_EPS) && n < MAX_SUBSTEPS) {
          if (!this._rkStep(dt)) break;
          this._acc -= dt;
          n++;
          if (this._halted) break;
        }
        if (this._acc >= dt) this._acc -= Math.floor(this._acc / dt) * dt;
      }
      // El último paso aceptado (también el que salió del dominio) se registra antes de avisar.
      if (n > 0) this._record();
      if (this._halted) {
        this._acc = 0;
        this._em.emit('halt', this._haltPayload());
      }
      if (n > 0) this._em.emit('step', this._payload(n));
      return n;
    }

    /**
     * Avanza exactamente `simAmount` unidades de tiempo simulado (o iteraciones), sin velocidad.
     * opts.record: 'auto' (una muestra cada hints.duration/720 o cada iteración), 'all' o 'end'.
     */
    advance(simAmount, opts) {
      if (this._destroyed || this._halted || !(simAmount > 0)) return 0;
      var mode = (opts && opts.record) || 'auto';
      var n = 0;
      if (this._isDiscrete) {
        var iters = Math.round(simAmount);
        for (var i = 0; i < iters; i++) {
          if (!this._iterate()) break;
          n++;
          if (mode !== 'end') this._record();
          if (this._halted) break;
        }
        if (mode === 'end' && n > 0) this._record();
      } else {
        var dt = this._dt;
        var full = Math.floor(simAmount / dt + 1e-9);
        var rem = simAmount - full * dt;
        var every = mode === 'auto' ? Math.max(dt, (this._hints.duration || simAmount) / 720) : 0;
        // 'auto': una muestra cada vez que t cruza un múltiplo de every.
        var slot = every > 0 ? Math.floor(this._t / every + 1e-9) : 0;
        var ok = true;
        for (var j = 0; j < full; j++) {
          if (!this._rkStep(dt)) { ok = false; break; }
          n++;
          if (mode === 'all') this._record();
          else if (mode === 'auto') {
            var sl = Math.floor(this._t / every + 1e-9);
            if (sl > slot) { slot = sl; this._record(); }
          }
          if (this._halted) { ok = false; break; }
        }
        if (ok && rem > 1e-9 * dt) {
          if (this._rkStep(rem)) n++;
        }
        var last = this._history.last();
        if (n > 0 && (!last || last.t !== this._t)) this._record();
      }
      if (this._halted) this._em.emit('halt', this._haltPayload());
      if (n > 0) this._em.emit('step', this._payload(n));
      return n;
    }

    reset() {
      if (this._destroyed) return;
      this._resetState();
      this._em.emit('reset', this._payload(0));
    }

    setParams(partial) {
      if (this._destroyed || !partial) return;
      var specs = this._model.params(this._variant.id);
      var needReset = false, changed = false;
      for (var i = 0; i < specs.length; i++) {
        var key = specs[i].key;
        if (!(key in partial)) continue;
        var v = Number(partial[key]);
        if (!isFinite(v) || v === this._params[key]) continue;
        this._params[key] = v;
        changed = true;
        if (specs[i].live === false) needReset = true;
      }
      if (!changed) return;
      if (needReset) this._resetState();
      else this._computeHints();
      this._em.emit('params', { params: copyObj(this._params) });
      if (needReset) this._em.emit('reset', this._payload(0));
    }

    setInput(spec) {
      if (this._destroyed) return;
      this._setInputInternal(spec);
      this._buildDeriv();
      this._em.emit('input', { input: copyObj(this._input) });
    }

    setSpeed(x) { this._speed = clampSpeed(x); }

    setVariant(id) {
      if (this._destroyed) return;
      var v = S.variantOf(this._model, id);
      var old = this._params;
      this._variant = v;
      var p = S.helpers.mergeParams(this._model, v.id, null);
      for (var k in p) if (k in old) p[k] = old[k];
      this._params = p;
      // Las entradas tienen rangos propios de cada variante: se toma la entrada por omisión de la nueva.
      this._setInputInternal(S.defaultInput(this._model, v.id));
      this._buildDeriv();
      this._resetState();
      this._em.emit('params', { params: copyObj(this._params) });
      this._em.emit('input', { input: copyObj(this._input) });
      this._em.emit('reset', this._payload(0));
    }

    on(event, fn) { return this._em.on(event, fn); }

    destroy() {
      this._destroyed = true;
      this._em.clear();
    }

    /* ------------------------------------------------------------ lectura */

    get t() { return this._t; }
    get k() { return this._k; }
    get u() { return this._uNow(); }
    get speed() { return this._speed; }
    get variant() { return this._variant.id; }
    get timeDomain() { return this._variant.timeDomain; }
    get timeUnit() { return this._variant.timeUnit; }
    get model() { return this._model; }
    get state() { return this._x.slice(); }
    get outputs() { return this._outputsNow(); }
    get params() { return copyObj(this._params); }
    get input() { return copyObj(this._input); }
    get history() { return this._history; }
    get hints() { return copyObj(this._hints); }
    get dt() { return this._dt; }
    get timeScale() { return this._timeScale; }
    get halted() { return this._halted ? copyObj(this._halted) : null; }
    get destroyed() { return this._destroyed; }
  }

  S.Simulator = Simulator;
  S.RingBuffer = RingBuffer;
})(window.DSL);
