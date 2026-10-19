/*
 * js/viz/charts.js — Propietario: charts.
 * Capa de gráficas sobre Chart.js 4 → DSL.viz.charts. API: docs/api/charts.md.
 * - El tema se lee de los tokens CSS en tiempo de ejecución y se reaplica con «theme:change».
 * - Chart.js solo dibuja (animation: false, update('none')). El morph, la curva fantasma, el
 *   revelado y el movimiento de polos son interpolaciones propias sobre el ticker DSL.util.loop.
 * - Interacción propia (puntero y teclado) con un tooltip HTML de vidrio; anotaciones y
 *   marcadores dibujados por un plugin interno; leyendas HTML con botones aria-pressed.
 */
(function (DSL) {
  'use strict';

  const util = DSL.util;
  const prefs = DSL.prefs;
  const bus = DSL.bus;

  /* ================================================================== constantes */

  const NBSP = ' ';
  const MINUS = '−';
  const FONT_PX = 13;                       // nada por debajo de 13 px (SKILLS_BRIEF)
  const PAD = Object.freeze({ top: 14, right: 18, bottom: 8, left: 8 });
  const Y_GUTTER = 60;                      // ancho fijo del eje y: el área no salta al cambiar las marcas
  const X_GUTTER = 46;                      // alto fijo del eje x (marcas + título)
  const HIT_PX = 14;                        // radio de captura: objetivo ≥ 24 px
  const STREAM_FPS = 30;
  const REVEAL_MS = 650;
  const FADE_MS = 300;
  const MORPH_FALLBACK = Object.freeze({ release: 300, drag: 120 });
  const SERIES_TOKENS = ['--c-series-1', '--c-series-2', '--c-series-3', '--c-series-4', '--c-series-5', '--c-series-6'];
  const DEFAULT_TITLES = Object.freeze({
    time: 'Serie temporal',
    step: 'Respuesta al escalón',
    pz: 'Mapa de polos y ceros',
    bode: 'Diagrama de Bode',
    xy: 'Gráfica',
  });
  const KEY_HINT = 'Con el teclado: flechas para recorrer los datos (Mayús: de uno en uno), Inicio y Fin para los extremos, Escape para ocultar el detalle. Con lector de pantalla, active el modo de foco o use «Ver datos».';
  // Fuera de pantalla: un único repintado diferido ≥ 400 ms tras el último cambio (y como mucho
  // uno por segundo mientras los cambios no paran). Chart.js no recibe update() mientras nadie mira.
  const OFF_DELAY = 400;
  const OFF_MAX_WAIT = 1000;
  // «Ver datos» abierto: la tabla sigue a los datos (150 ms tras el último cambio; series en vivo, ≤ 2 Hz).
  const TABLE_DELAY = 150;
  const TABLE_STREAM_MS = 500;
  const TABLE_SMALL_SERIES = 60;            // una serie con ≤ 60 filas se muestra entera
  const TABLE_MAX_GROUPS = 12;              // una columna de texto con más valores no es una «serie»
  const COMPACT_MIN = 1e5;                  // marcas |v| ≥ 1e5: «−5×10⁵» (≤ 6 caracteres)

  /* ================================================================== números */

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    const u = 1 - t;
    return 1 - u * u * u;
  }

  /** Redondea el ruido de coma flotante (0.30000000000000004 → 0.3). */
  function tidy(v) {
    return isNum(v) ? parseFloat(v.toPrecision(12)) : v;
  }

  /** Número «bonito» 1, 2, 5 × 10^k (round: el más cercano; si no, el inmediato superior). */
  function niceNum(x, round) {
    if (!(x > 0) || !isFinite(x)) return 1;
    const e = Math.floor(Math.log10(x));
    const p = Math.pow(10, e);
    const f = x / p;
    let nf;
    if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
    else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return tidy(nf * p);
  }

  /**
   * Límites de eje con marcas «bonitas». opts: { ticks = 5, pad = 0.05 }.
   * Si los datos no cruzan el cero, el relleno no lo cruza (la línea base 0 queda anclada).
   */
  function niceBounds(min, max, opts) {
    opts = opts || {};
    const ticks = opts.ticks || 5;
    const pad = opts.pad === undefined ? 0.05 : opts.pad;
    if (!isNum(min) || !isNum(max)) { min = 0; max = 1; }
    if (min > max) { const t = min; min = max; max = t; }
    let span = max - min;
    if (span <= Math.max(Math.abs(min), Math.abs(max)) * 1e-9) {
      const d = Math.abs(max) * 0.1 || 1;
      min -= d;
      max += d;
      span = max - min;
    } else if (pad > 0) {
      const lo = min - span * pad;
      const hi = max + span * pad;
      min = min >= 0 && lo < 0 ? 0 : lo;
      max = max <= 0 && hi > 0 ? 0 : hi;
      span = max - min;
    }
    const step = niceNum(niceNum(span, false) / ticks, true);
    const lo = tidy(Math.floor(min / step + 1e-9) * step);
    const hi = tidy(Math.ceil(max / step - 1e-9) * step);
    return { min: lo, max: hi > lo ? hi : tidy(lo + step), step };
  }

  /** Límites de fase en grados con paso de 15, 30, 45, 90 o 180°. */
  function phaseBounds(min, max) {
    if (!isNum(min) || !isNum(max)) { min = -90; max = 0; }
    const span = Math.max(0, max - min);
    const steps = [15, 30, 45, 90, 180];
    let step = 360;
    for (let i = 0; i < steps.length; i++) {
      if (span / steps[i] <= 6) { step = steps[i]; break; }
    }
    let lo = Math.floor(min / step + 1e-9) * step;
    let hi = Math.ceil(max / step - 1e-9) * step;
    if (hi - lo < step) { lo -= step; hi += step; }
    return { min: tidy(lo), max: tidy(hi), step };
  }

  /** Semirrango simétrico con paso común: { half, step } para el plano s. */
  function symmetricRange(maxAbs) {
    const m = isNum(maxAbs) && maxAbs > 0 ? maxAbs : 0.8;
    const r0 = m * 1.25;
    const step = niceNum(r0 / 3, true);
    return { half: tidy(Math.ceil(r0 / step - 1e-9) * step), step };
  }

  /** Marcas de décadas (major) y de 2…9 × 10^k (minor) dentro de [min, max]. */
  function logTicks(min, max) {
    const out = [];
    if (!(min > 0) || !(max > min)) return out;
    const e0 = Math.floor(Math.log10(min) + 1e-9);
    const e1 = Math.ceil(Math.log10(max) - 1e-9);
    const decades = e1 - e0;
    const every = decades > 8 ? 2 : 1;
    for (let e = e0; e <= e1; e++) {
      for (let m = 1; m <= 9; m++) {
        const v = tidy(m * Math.pow(10, e));
        if (v < min * (1 - 1e-9) || v > max * (1 + 1e-9)) continue;
        const major = m === 1 && (e - e0) % every === 0;
        out.push({ value: v, major, label: m === 1 && major });
      }
    }
    // Menos de una década visible: rotula 2 y 5 para que el eje no quede mudo.
    if (!out.some((t) => t.label)) {
      out.forEach((t) => {
        const m = Math.round(t.value / Math.pow(10, Math.floor(Math.log10(t.value) + 1e-9)));
        if (m === 1 || m === 2 || m === 5) { t.label = true; t.major = true; }
      });
    }
    return out;
  }

  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

  function fmtDecade(v) {
    const e = Math.round(Math.log10(v));
    if (Math.abs(v - Math.pow(10, e)) > Math.pow(10, e) * 1e-6) return util.formatNumber(v, 3);
    if (e >= -3 && e <= 4) return util.formatNumber(Math.pow(10, e), 4);
    return '10' + String(e).split('').map((c) => SUP[c]).join('');
  }

  function fmt(v, digits) {
    return util.formatNumber(v, digits === undefined ? 4 : digits);
  }

  function fmtU(v, unit, digits) {
    const s = fmt(v, digits);
    return unit ? s + NBSP + unit : s;
  }

  /**
   * Rótulo de marca. Si el eje llega a |v| ≥ 1e5, todas sus marcas usan la forma compacta
   * «m×10ⁿ» con las cifras justas para distinguir dos marcas vecinas (−5×10⁵, 1.5×10⁶).
   */
  function tickLabel(value, index, ticks) {
    const n = ticks ? ticks.length : 0;
    const span = n > 1 ? Math.abs(ticks[n - 1].value - ticks[0].value) : Math.abs(value) || 1;
    const v = Math.abs(value) < span * 1e-9 ? 0 : value;
    let big = Math.abs(v);
    if (n) big = Math.max(big, Math.abs(ticks[0].value), Math.abs(ticks[n - 1].value));
    if (big >= COMPACT_MIN) {
      const step = n > 1 ? Math.abs(ticks[1].value - ticks[0].value) : 0;
      return compactNumber(v, step);
    }
    return util.formatNumber(v, 4);
  }

  /** «−5×10⁵»: mantisa con las cifras que pide el paso de las marcas (2 a 4), sin ceros de relleno. */
  function compactNumber(v, step) {
    if (!isNum(v)) return util.formatNumber(v, 4);
    if (v === 0) return '0';
    const av = Math.abs(v);
    let digits = 2;
    if (step > 0 && isFinite(step)) digits = clamp(Math.ceil(Math.log10(av / step) - 1e-9) + 1, 1, 4);
    return util.formatNumber(v, Math.max(1, digits), { sciMax: Math.min(av, COMPACT_MIN), sciMin: 0 });
  }

  /** Marcas múltiplo de un paso, ancladas en 0, dentro de [min, max]. */
  function multiplesIn(min, max, step) {
    const out = [];
    const k0 = Math.ceil(min / step - 1e-9);
    const k1 = Math.floor(max / step + 1e-9);
    for (let k = k0; k <= k1; k++) {
      const v = tidy(k * step);
      out.push({ value: v === 0 ? 0 : v });
    }
    return out;
  }

  const PHASE_STEPS = [15, 30, 45, 90, 180, 360];

  /**
   * Marcas «bonitas» ancladas en 0 para un eje lineal: múltiplos de step dentro de [min, max].
   * Si con ese paso habría más de limit marcas (p. ej. a mitad de un morph entre rangos muy
   * distintos) o menos de 2, se elige otro paso 1-2-5 (o de fase: 15, 30, 45, 90°) que quepa.
   * Devuelve { step, ticks } o null si el rango no es válido.
   */
  function anchoredTicks(min, max, step, limit, phase) {
    if (!isNum(min) || !isNum(max) || !(max > min)) return null;
    const span = max - min;
    limit = Math.max(2, Math.round(limit) || 9);
    const count = (s) => Math.floor(max / s + 1e-9) - Math.ceil(min / s - 1e-9) + 1;
    const ok = (s) => s > 0 && isFinite(s) && count(s) >= 2 && count(s) <= limit;
    let s = step > 0 && isFinite(step) ? step : 0;
    if (!ok(s) && phase) s = PHASE_STEPS.find(ok) || 0;
    if (!ok(s)) s = Math.max(niceNum(span / 5, true), niceNum(span / (limit - 1), false));
    for (let i = 0; i < 24 && s > 0 && count(s) > limit; i++) s = niceNum(s * 1.01, false);
    if (!(s > 0) || !isFinite(s)) return null;
    return { step: s, ticks: multiplesIn(min, max, s) };
  }

  /**
   * afterBuildTicks de los ejes lineales: sustituye las marcas de Chart.js por múltiplos del paso
   * propio (chStep), anclados en 0. Sin ticks.stepSize, Chart.js nunca avisa «Limiting to 1000» ni
   * empieza las marcas en el mínimo de un rango fijo (−15000, −6667, 1667…).
   * La configuración se lee de chart.config (Chart.js copia la del eje a un objeto nuevo).
   */
  function anchorTicksHook(scale) {
    const chart = scale && scale.chart;
    const all = chart && chart.config && chart.config.options && chart.config.options.scales;
    const o = all && all[scale.id];
    if (!o || o.type === 'logarithmic') return;
    const limit = o.chMaxTicks || (o.ticks && o.ticks.maxTicksLimit) || 9;
    let res = anchoredTicks(scale.min, scale.max, o.chStep, limit, !!o.chPhase);
    // Eje de enteros (periodo k): nunca marcas fraccionarias.
    if (res && o.chInteger && res.step < 1) res = anchoredTicks(scale.min, scale.max, 1, limit, false);
    if (res) scale.ticks = res.ticks;
  }

  /** Ancho real del eje y de un gráfico (al menos Y_GUTTER). */
  function yGutterOf(chart) {
    const w = chart && chart.scales && chart.scales.y ? chart.scales.y.width : NaN;
    return isNum(w) && w > Y_GUTTER ? w : Y_GUTTER;
  }

  /** Fija el paso de marcas propio de un eje (y retira el de Chart.js). */
  function setStep(axisOpts, step) {
    if (!axisOpts) return;
    axisOpts.chStep = step > 0 && isFinite(step) ? step : undefined;
    if (axisOpts.ticks && 'stepSize' in axisOpts.ticks) delete axisOpts.ticks.stepSize;
  }

  /** «−1.00 + 2.00j» (decimales fijos, signo menos tipográfico, unidad imaginaria j). */
  function fmtComplex(z, decimals) {
    const d = decimals === undefined ? 2 : decimals;
    const scale = Math.max(1, Math.hypot(z.re, z.im));
    const re = Math.abs(z.re) < 1e-12 * scale ? 0 : z.re;
    const im = Math.abs(z.im) <= 1e-9 * scale ? 0 : z.im;
    const reS = util.formatNumber(re, 4, { decimals: d });
    if (im === 0) return reS;
    return reS + (im < 0 ? ' ' + MINUS + ' ' : ' + ') + util.formatNumber(Math.abs(im), 4, { decimals: d }) + 'j';
  }

  /** Primer índice con arr[i] ≥ x en un arreglo numérico ordenado. */
  function lowerBound(arr, x) {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Igual que lowerBound para arreglos de puntos { x }. */
  function lowerBoundX(points, x) {
    let lo = 0;
    let hi = points.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].x < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function nearestIndex(arr, x) {
    const n = arr.length;
    if (!n) return -1;
    const i = lowerBound(arr, x);
    if (i <= 0) return 0;
    if (i >= n) return n - 1;
    return x - arr[i - 1] <= arr[i] - x ? i - 1 : i;
  }

  function nearestIndexX(points, x) {
    const n = points.length;
    if (!n) return -1;
    const i = lowerBoundX(points, x);
    if (i <= 0) return 0;
    if (i >= n) return n - 1;
    return x - points[i - 1].x <= points[i].x - x ? i - 1 : i;
  }

  /**
   * Remuestrea (srcX, srcY) sobre dstX (ambos crecientes) por interpolación lineal (en log x si logX).
   * Fuera del rango de origen mantiene el valor del extremo. Escribe en out y lo devuelve.
   */
  function resample(srcX, srcY, dstX, out, logX) {
    const n = srcX.length;
    const m = dstX.length;
    if (!out) out = new Array(m);
    if (!n) {
      for (let j = 0; j < m; j++) out[j] = NaN;
      return out;
    }
    let k = 0;
    for (let j = 0; j < m; j++) {
      const x = dstX[j];
      if (!(x > srcX[0])) { out[j] = srcY[0]; continue; }
      if (!(x < srcX[n - 1])) { out[j] = srcY[n - 1]; continue; }
      while (k < n - 2 && srcX[k + 1] < x) k++;
      const x0 = srcX[k];
      const x1 = srcX[k + 1];
      let f = logX ? Math.log(x / x0) / Math.log(x1 / x0) : (x - x0) / (x1 - x0);
      if (!isFinite(f)) f = 0;
      const y0 = srcY[k];
      const y1 = srcY[k + 1];
      out[j] = isNum(y0) && isNum(y1) ? y0 + (y1 - y0) * f : (f < 0.5 ? y0 : y1);
    }
    return out;
  }

  /** Índices de muestreo uniforme (incluye el primero y el último). */
  function sampleIndices(n, max) {
    const out = [];
    if (n <= max) {
      for (let i = 0; i < n; i++) out.push(i);
      return out;
    }
    for (let i = 0; i < max; i++) {
      const k = Math.round((i * (n - 1)) / (max - 1));
      if (!out.length || out[out.length - 1] !== k) out.push(k);
    }
    return out;
  }

  /**
   * Primer cruce de ys con el nivel (interpolado; en log x si logX). null si no lo hay.
   * La búsqueda empieza donde ys se separa del nivel más de minDev: un arranque que ya toca el
   * nivel (p. ej. 0 dB de ganancia unitaria) no cuenta como cruce.
   */
  function findCrossing(xs, ys, level, logX, minDev) {
    const dev = minDev > 0 ? minDev : 0;
    let i0 = -1;
    for (let i = 0; i < ys.length; i++) {
      if (isNum(ys[i]) && Math.abs(ys[i] - level) > dev) { i0 = i; break; }
    }
    if (i0 < 0) return null;
    for (let i = i0 + 1; i < ys.length; i++) {
      const a = ys[i - 1] - level;
      const b = ys[i] - level;
      if (!isNum(a) || !isNum(b)) continue;
      if ((a > 0 && b <= 0) || (a < 0 && b >= 0)) {
        const f = a / (a - b);
        return logX ? xs[i - 1] * Math.pow(xs[i] / xs[i - 1], f) : xs[i - 1] + (xs[i] - xs[i - 1]) * f;
      }
    }
    return null;
  }

  /* ================================================================== polos y ceros */

  function toComplex(v) {
    if (isNum(v)) return { re: v, im: 0 };
    if (v && isNum(v.re)) return { re: v.re, im: isNum(v.im) ? v.im : 0 };
    return null;
  }

  /**
   * Orden determinista: parte real descendente (los dominantes primero), luego parte imaginaria
   * descendente, con tolerancia relativa. Así los pares conjugados quedan juntos y la
   * correspondencia por índice entre actualizaciones da trayectorias continuas.
   */
  function sortRoots(list) {
    const out = [];
    (list || []).forEach((v) => {
      const z = toComplex(v);
      if (z) out.push(z);
    });
    out.sort((a, b) => {
      const tol = 1e-9 * Math.max(1, Math.hypot(a.re, a.im), Math.hypot(b.re, b.im));
      if (Math.abs(a.re - b.re) > tol) return b.re - a.re;
      if (Math.abs(a.im - b.im) > tol) return b.im - a.im;
      return 0;
    });
    return out;
  }

  /** Agrupa raíces coincidentes (consecutivas tras sortRoots): [{ start, count }]. */
  function groupRoots(sorted) {
    const groups = [];
    for (let i = 0; i < sorted.length; i++) {
      const g = groups[groups.length - 1];
      if (g) {
        const a = sorted[g.start];
        const b = sorted[i];
        const tol = 1e-5 * Math.max(1, Math.hypot(a.re, a.im));
        if (Math.hypot(a.re - b.re, a.im - b.im) <= tol) { g.count++; continue; }
      }
      groups.push({ start: i, count: 1 });
    }
    return groups;
  }

  /** 'estable' | 'marginal' | 'inestable' según los polos (repetidos en jω → inestable). */
  function classifyPoles(poles) {
    const sorted = sortRoots(poles);
    if (!sorted.length) return 'estable';
    const scale = sorted.reduce((m, z) => Math.max(m, Math.hypot(z.re, z.im)), 1);
    const eps = 1e-9 * scale;
    if (sorted.some((z) => z.re > eps)) return 'inestable';
    const onAxis = sorted.filter((z) => Math.abs(z.re) <= eps);
    if (!onAxis.length) return 'estable';
    if (groupRoots(onAxis).some((g) => g.count > 1)) return 'inestable';
    return 'marginal';
  }

  /* ================================================================== colores y tema */

  const HEX_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const RGB_RE = /^rgba?\(\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

  /** '#RGB[A]', '#RRGGBB[AA]', 'rgb()/rgba()' (comas o espacios) → { r, g, b, a } o null. */
  function parseColor(str) {
    if (typeof str !== 'string') return null;
    const s = str.trim();
    let m = HEX_RE.exec(s);
    if (m) {
      let hx = m[1];
      if (hx.length <= 4) hx = hx.split('').map((c) => c + c).join('');
      const n = parseInt(hx.slice(0, 6), 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: hx.length === 8 ? parseInt(hx.slice(6), 16) / 255 : 1 };
    }
    m = RGB_RE.exec(s);
    if (m) {
      const ch = (v) => (v.slice(-1) === '%' ? parseFloat(v) * 2.55 : parseFloat(v));
      const a = m[4] === undefined ? 1 : m[4].slice(-1) === '%' ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return { r: ch(m[1]), g: ch(m[2]), b: ch(m[3]), a: clamp(a, 0, 1) };
    }
    return null;
  }

  /** El mismo color con su alfa multiplicado por alpha. Si no se puede leer, lo devuelve igual. */
  function withAlpha(colorStr, alpha) {
    const c = parseColor(colorStr);
    if (!c) return colorStr;
    const a = Math.round(clamp(c.a * alpha, 0, 1) * 1000) / 1000;
    return 'rgba(' + Math.round(c.r) + ', ' + Math.round(c.g) + ', ' + Math.round(c.b) + ', ' + a + ')';
  }

  /** Nombre de token ('--c-out') para '--c-out', 'c-out', 'var(--c-out)'; null si es un color literal. */
  function tokenName(token) {
    if (typeof token !== 'string') return null;
    const t = token.trim();
    if (t.indexOf('--') === 0) return t;
    const v = /^var\(\s*(--[\w-]+)/.exec(t);
    if (v) return v[1];
    if (/^[a-z][a-z0-9-]*$/i.test(t) && util.cssVar('--' + t)) return '--' + t;
    return null;
  }

  /** Color de lienzo para un token ('--c-out' o 'c-out') o un color literal. */
  function color(token) {
    const name = tokenName(token);
    if (!name) return typeof token === 'string' && token.trim() ? token.trim() : 'GrayText';
    return util.cssVar(name) || (name === '--ink' ? 'CanvasText' : 'GrayText');
  }

  /** Referencia CSS que sigue al tema por sí sola: 'var(--c-out)' o el literal. */
  function cssRef(token) {
    const name = tokenName(token);
    return name ? 'var(' + name + ')' : String(token || 'currentColor');
  }

  function parseDash(str) {
    const parts = String(str || '').trim().split(/[\s,]+/).map(Number).filter((n) => n > 0);
    return parts.length >= 2 ? parts : null;
  }

  function msToken(name, fallback) {
    const raw = util.cssVar(name);
    if (!raw) return fallback;
    const n = parseFloat(raw);
    if (!isFinite(n)) return fallback;
    return /ms\s*$/.test(raw) ? n : /s\s*$/.test(raw) ? n * 1000 : n;
  }

  /** Lee el tema actual de los tokens CSS (sin caché: barato y siempre al día). */
  function theme() {
    const v = util.cssVar;
    const num = (n, d) => {
      const x = parseFloat(v(n));
      return isFinite(x) ? x : d;
    };
    const ink = v('--ink') || 'CanvasText';
    const muted = v('--muted') || 'GrayText';
    const colors = {
      in: color('--c-in'),
      out: color('--c-out'),
      state: color('--c-state'),
      pole: color('--c-pole'),
      zero: color('--c-zero'),
      ghost: color('--c-ghost'),
    };
    SERIES_TOKENS.forEach((t, i) => { colors['s' + (i + 1)] = color(t); });
    return {
      theme: prefs.theme,
      ink,
      muted,
      subtle: v('--subtle') || muted,
      grid: v('--c-grid') || 'GrayText',
      axis: v('--c-axis') || muted,
      plotBg: v('--c-plot-bg') || v('--surface-1') || 'Canvas',
      line: v('--line') || v('--c-grid') || 'GrayText',
      accent: v('--accent') || ink,
      font: v('--font-body') || 'system-ui, sans-serif',
      fontSize: FONT_PX,
      colors,
      stableRegion: v('--c-stable-region') || 'transparent',
      unstableRegion: v('--c-unstable-region') || 'transparent',
      ghostOpacity: num('--ghost-opacity', 0.35),
      lineWidth: num('--chart-line-width', 2),
      refLineWidth: num('--chart-ref-line-width', 1.25),
      refDash: parseDash(v('--chart-ref-dash')) || [6, 4],
      markerSize: num('--chart-marker-size', 10),
      tooltip: { bg: v('--glass-a-bg'), border: v('--glass-a-border'), blur: v('--glass-blur-tip') },
      morph: { release: msToken('--dur-morph', MORPH_FALLBACK.release), drag: msToken('--dur-morph-drag', MORPH_FALLBACK.drag) },
    };
  }

  function chartLib() {
    const C = typeof window !== 'undefined' ? window.Chart : undefined;
    return typeof C === 'function' ? C : null;
  }

  /** Valores por defecto globales de Chart.js (tipografía y tinta). Idempotente. */
  function applyDefaults() {
    const Chart = chartLib();
    if (!Chart || !Chart.defaults) return false;
    const th = theme();
    const d = Chart.defaults;
    if (d.font) {
      d.font.family = th.font;
      d.font.size = th.fontSize;
    }
    d.color = th.muted;
    d.borderColor = th.grid;
    if (d.elements && d.elements.line) {
      d.elements.line.borderWidth = th.lineWidth;
      d.elements.line.borderCapStyle = 'round';
      d.elements.line.borderJoinStyle = 'round';
    }
    if (d.elements && d.elements.point) d.elements.point.radius = 0;
    return true;
  }

  function dashFor(dash, th) {
    if (Array.isArray(dash)) return dash.slice();
    return dash ? th.refDash.slice() : [];
  }

  /* ================================================================== registro y bus */

  const live = new Set();
  let busOffs = null;

  /** Dibuja ya el estado final de todas las gráficas vivas (antes de imprimir o de una captura). */
  function flushAll() {
    live.forEach((c) => c.flushPending());
  }

  function ensureBus() {
    if (busOffs) return;
    busOffs = [
      bus.on('theme:change', () => {
        applyDefaults();
        live.forEach((c) => c.retheme());
      }),
      bus.on('motion:change', (p) => {
        if (p && p.reducedMotion) live.forEach((c) => c.finishTweens());
      }),
    ];
    // Imprimir: ninguna gráfica fuera de pantalla queda sin su último repintado.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('beforeprint', flushAll);
      busOffs.push(() => window.removeEventListener('beforeprint', flushAll));
    }
  }

  function releaseBus() {
    if (live.size || !busOffs) return;
    busOffs.forEach((off) => off());
    busOffs = null;
  }

  /* ================================================================== DOM: claves, leyendas, iconos */

  /** Firma estable de un trazo (para no rehacer leyendas ni tooltips sin cambios). */
  function dashSig(dash) {
    return Array.isArray(dash) ? dash.join(',') : dash ? 'ref' : '';
  }

  /**
   * Discontinuo de la clave de 22 px. Un array es el patrón real de la serie (px del lienzo): se
   * conserva su proporción y se escala para que quepan al menos dos periodos en los 20 px de la
   * línea. true es el discontinuo de referencia «4 3».
   */
  function keyDash(dash) {
    if (Array.isArray(dash)) {
      let arr = dash.map(Number).filter((v) => isFinite(v) && v >= 0);
      if (!arr.length || !arr.some((v) => v > 0)) return null;
      if (arr.length % 2) arr = arr.concat(arr);
      const period = arr.reduce((a, v) => a + v, 0);
      const k = period > 10 ? 10 / period : 1;
      return arr.map((v) => tidy(Math.round(v * k * 100) / 100)).join(' ');
    }
    return dash ? '4 3' : null;
  }

  /** Clave gráfica de leyenda o tooltip (SVG 22×12) que sigue el tema vía var(--token). */
  function keySvg(kind, ref, dash) {
    const s = util.svg;
    const root = s('svg', { class: 'ch-key', width: 22, height: 12, viewBox: '0 0 22 12', 'aria-hidden': 'true', focusable: 'false' });
    const stroke = { stroke: ref };
    const dashed = keyDash(dash);
    switch (kind) {
      case 'ghost':
        root.appendChild(s('line', { x1: 1, y1: 6, x2: 21, y2: 6, 'stroke-width': 2, 'stroke-dasharray': '4 3', 'stroke-opacity': 0.45, style: stroke }));
        break;
      case 'ref':
        root.appendChild(s('line', { x1: 1, y1: 6, x2: 21, y2: 6, 'stroke-width': 1.5, 'stroke-dasharray': '4 3', style: stroke }));
        break;
      case 'band':
        root.appendChild(s('rect', { x: 1, y: 2, width: 20, height: 8, rx: 2, 'fill-opacity': 0.28, style: { fill: ref } }));
        break;
      case 'refband':
        root.appendChild(s('rect', { x: 1, y: 2, width: 20, height: 8, rx: 2, 'fill-opacity': 0.22, style: { fill: ref } }));
        root.appendChild(s('line', { x1: 1, y1: 6, x2: 21, y2: 6, 'stroke-width': 1.5, 'stroke-dasharray': '4 3', style: stroke }));
        break;
      case 'marks':
        root.appendChild(s('line', { x1: 8, y1: 11, x2: 8, y2: 3, 'stroke-width': 1.25, 'stroke-dasharray': '2 2', 'stroke-opacity': 0.8, style: stroke }));
        root.appendChild(s('line', { x1: 17, y1: 11, x2: 17, y2: 1, 'stroke-width': 1.25, 'stroke-dasharray': '2 2', 'stroke-opacity': 0.8, style: stroke }));
        root.appendChild(s('circle', { cx: 8, cy: 3, r: 2.5, style: { fill: ref } }));
        break;
      case 'dot':
        root.appendChild(s('circle', { cx: 11, cy: 6, r: 4, style: { fill: ref } }));
        break;
      case 'cross':
        root.appendChild(s('path', { d: 'M7 2L15 10M15 2L7 10', 'stroke-width': 2, 'stroke-linecap': 'round', fill: 'none', style: stroke }));
        break;
      case 'ring':
        root.appendChild(s('circle', { cx: 11, cy: 6, r: 4, 'stroke-width': 2, fill: 'none', style: stroke }));
        break;
      case 'vline':
        root.appendChild(s('line', { x1: 11, y1: 1, x2: 11, y2: 11, 'stroke-width': 1.5, 'stroke-dasharray': '3 2', style: stroke }));
        break;
      case 'bracket':
        root.appendChild(s('path', { d: 'M3 3V9M3 6H19M19 3V9', 'stroke-width': 1.5, fill: 'none', style: stroke }));
        break;
      case 'points':
        root.appendChild(s('circle', { cx: 11, cy: 6, r: 3.5, style: { fill: ref } }));
        break;
      case 'stems':
        root.appendChild(s('line', { x1: 11, y1: 11, x2: 11, y2: 5, 'stroke-width': 1.5, style: stroke }));
        root.appendChild(s('circle', { cx: 11, cy: 4, r: 3, style: { fill: ref } }));
        break;
      default:
        root.appendChild(s('line', { x1: 1, y1: 6, x2: 21, y2: 6, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-dasharray': dashed, style: stroke }));
    }
    return root;
  }

  function iconEl(name) {
    if (DSL.ui && typeof DSL.ui.icon === 'function') {
      try { return DSL.ui.icon(name, { size: 18 }); } catch (e) { /* se usa el respaldo */ }
    }
    const inner = DSL.iconsData && DSL.iconsData[name];
    const el = util.svg('svg', {
      class: 'ch-icon', width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
    });
    if (inner) el.innerHTML = inner; // marcado propio y constante (icons-data.js)
    return el;
  }

  /* ================================================================== dibujo en el lienzo */

  function setFont(ctx, th, weight) {
    ctx.font = (weight || 400) + ' ' + th.fontSize + 'px ' + th.font;
  }

  function strokeLine(ctx, x0, y0, x1, y1, stroke, width, dash) {
    ctx.beginPath();
    ctx.setLineDash(dash || []);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function dot(ctx, x, y, r, fill, ring, ringWidth) {
    ctx.beginPath();
    ctx.arc(x, y, r + (ringWidth || 2), 0, Math.PI * 2);
    ctx.fillStyle = ring;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  /**
   * Colocación voraz de rótulos: cada uno prueba sus candidatos (esquina superior izquierda) y se
   * queda con el primero dentro de bounds que no pisa a los ya colocados ni a las zonas `avoid`.
   * Si ninguno cabe, usa el primero ajustado a los límites. Devuelve los rótulos con .rect.
   */
  /**
   * Colocación voraz de etiquetas sin solapes. Cada etiqueta: { w, h, candidates: [{x, y}],
   * priority? (menor = antes), optional? }. Si ningún candidato cabe, se prueban desplazamientos
   * verticales; una etiqueta opcional que no cabe queda sin dibujar (rect = null).
   */
  /*
   * `soft` (opcional): zonas que conviene no tapar, como el trazo de las curvas (curveObstacles). Cada
   * etiqueta busca primero un sitio libre también de ellas; una opcional que no lo encuentra no se dibuja
   * (el fondo del rótulo taparía los datos) y una obligatoria repite la búsqueda sin ellas, como antes.
   */
  function placeLabels(labels, bounds, avoid, soft) {
    const placed = (avoid || []).slice();
    const softs = soft || [];
    const fits = (r, useSoft) => !(r.x < bounds.left || r.y < bounds.top || r.x + r.w > bounds.right || r.y + r.h > bounds.bottom) &&
      !placed.some((p) => rectsOverlap(p, r)) && !(useSoft && softs.some((p) => rectsOverlap(p, r)));
    const order = labels.map((lb, i) => ({ lb, i })).sort((a, b) => ((a.lb.priority || 0) - (b.lb.priority || 0)) || (a.i - b.i));
    order.forEach(({ lb }) => {
      const cands = lb.candidates || [];
      const search = (useSoft) => {
        for (let i = 0; i < cands.length; i++) {
          const r = { x: cands[i].x, y: cands[i].y, w: lb.w, h: lb.h };
          if (fits(r, useSoft)) return r;
        }
        for (let k = 1; k <= 6; k++) {
          for (let i = 0; i < cands.length; i++) {
            for (const sgn of [1, -1]) {
              const r = { x: cands[i].x, y: cands[i].y + sgn * k * (lb.h + 3), w: lb.w, h: lb.h };
              if (fits(r, useSoft)) return r;
            }
          }
        }
        return null;
      };
      let chosen = search(softs.length > 0);
      if (!chosen && softs.length && !lb.optional) chosen = search(false);
      if (!chosen && !lb.optional) {
        const c = cands[0] || { x: bounds.left, y: bounds.top };
        chosen = {
          x: clamp(c.x, bounds.left, Math.max(bounds.left, bounds.right - lb.w)),
          y: clamp(c.y, bounds.top, Math.max(bounds.top, bounds.bottom - lb.h)),
          w: lb.w,
          h: lb.h,
        };
      }
      lb.rect = chosen;
      if (chosen) placed.push(chosen);
    });
    return labels;
  }

  /**
   * Zonas ocupadas por el trazo de las series visibles de un gráfico Chart.js, en columnas de 4 px:
   * cada rectángulo cubre de la y mínima a la máxima del trazo en su columna (±3 px). Solo series cuyo
   * dataset cumple pick(ds) y están visibles; los tramos fuera del área no cuentan. Para placeLabels(soft).
   */
  function curveObstacles(chart, area, pick) {
    const BIN = 4;
    const PAD = 3;
    const out = [];
    const sx = chart && chart.scales && chart.scales.x;
    const sy = chart && chart.scales && chart.scales.y;
    if (!sx || !sy || !area) return out;
    const sets = (chart.data && chart.data.datasets) || [];
    sets.forEach((ds, i) => {
      if (!ds || !pick(ds) || (typeof chart.isDatasetVisible === 'function' ? !chart.isDatasetVisible(i) : ds.hidden)) return;
      const bins = new Map();
      const add = (b, y) => {
        const r = bins.get(b);
        if (r) {
          if (y < r[0]) r[0] = y;
          if (y > r[1]) r[1] = y;
        } else bins.set(b, [y, y]);
      };
      let prev = null;
      (ds.data || []).forEach((p) => {
        const px = p && isNum(p.x) ? sx.getPixelForValue(p.x) : NaN;
        const py = p && isNum(p.y) ? sy.getPixelForValue(p.y) : NaN;
        if (!isNum(px) || !isNum(py) || px < area.left - BIN || px > area.right + BIN || py < area.top - PAD || py > area.bottom + PAD) {
          prev = null;
          return;
        }
        const b = Math.floor((px - area.left) / BIN);
        add(b, py);
        if (prev && prev.b !== b) {
          // tramo que cruza columnas: cada columna intermedia recibe los dos extremos (caja del tramo)
          const lo = Math.min(prev.b, b);
          const hi = Math.max(prev.b, b);
          for (let k = lo; k <= hi; k++) {
            add(k, prev.py);
            add(k, py);
          }
        }
        prev = { b, py };
      });
      bins.forEach((r, b) => out.push({ x: area.left + b * BIN, y: r[0] - PAD, w: BIN, h: r[1] - r[0] + 2 * PAD }));
    });
    return out;
  }

  const LABEL_PAD_X = 5;
  const LABEL_H = 20;

  function measureLabel(ctx, th, text) {
    setFont(ctx, th, 400);
    return Math.ceil(ctx.measureText(text).width) + LABEL_PAD_X * 2;
  }

  function drawLabel(ctx, th, lb) {
    const r = lb.rect;
    if (!r) return;
    ctx.save();
    ctx.globalAlpha = lb.alpha === undefined ? 1 : lb.alpha;
    roundRect(ctx, r.x, r.y, r.w, r.h, 5);
    ctx.fillStyle = withAlpha(th.plotBg, 0.9);
    ctx.fill();
    setFont(ctx, th, 400);
    ctx.fillStyle = lb.color || th.ink;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(lb.text, r.x + LABEL_PAD_X, r.y + r.h / 2 + 0.5);
    ctx.restore();
  }

  /* ================================================================== opciones de ejes */

  function scaleColors(o, th) {
    o.grid = Object.assign(o.grid || {}, { color: o.grid && typeof o.grid.color === 'function' ? o.grid.color : th.grid });
    o.border = Object.assign(o.border || {}, { color: th.axis });
    o.ticks = Object.assign(o.ticks || {}, { color: th.muted });
    o.title = Object.assign(o.title || {}, { color: th.muted });
    return o;
  }

  function linearAxis(th, spec) {
    const horizontal = spec.axis === 'x';
    const o = {
      type: 'linear',
      position: horizontal ? 'bottom' : 'left',
      min: spec.min,
      max: spec.max,
      grid: { color: th.grid, lineWidth: 1, drawTicks: false, display: spec.grid !== false },
      border: { color: th.axis, width: 1, display: true },
      ticks: {
        color: th.muted,
        font: { size: th.fontSize },
        padding: 6,
        includeBounds: false,
        autoSkip: true,
        maxTicksLimit: spec.maxTicks || 9,
        maxRotation: 0,
        display: spec.ticks !== false,
        precision: spec.integer ? 0 : undefined,
        callback: spec.tickCallback || tickLabel,
      },
      title: {
        display: !!spec.title,
        text: spec.title || '',
        color: th.muted,
        font: { size: th.fontSize, weight: 500 },
        padding: horizontal ? { top: 4, bottom: 0 } : { top: 0, bottom: 4 },
      },
    };
    // Marcas propias ancladas en 0 (el paso va en o.chStep; ver anchorTicksHook).
    o.afterBuildTicks = anchorTicksHook;
    if (spec.integer) o.chInteger = true;
    const g = spec.gutter;
    if (g !== undefined && g !== null) {
      // Eje x: alto fijo. Eje y: ancho fijo (el área no salta al cambiar las marcas) salvo que los
      // rótulos medidos por Chart.js (marcas + título) pidan más: el título nunca pisa las cifras.
      o.afterFit = horizontal ? (scale) => { scale.height = g; } : (scale) => {
        const need = scale.width;
        scale.width = isNum(need) && need > g ? Math.ceil(need) : g;
      };
    }
    return o;
  }

  function baseOptions(ctl, si, extra) {
    const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      events: [],
      parsing: false,
      devicePixelRatio: Math.min(dpr, 2),
      layout: { padding: Object.assign({}, PAD), autoPadding: false },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        title: { display: false },
        decimation: { enabled: false },
      },
      onResize: (chart, size) => ctl.onResize(si, size),
    }, extra || {});
  }

  /* ================================================================== superficie (un canvas) */

  class Surface {
    constructor(ctl, canvas, index) {
      if (!canvas || !canvas.parentNode) throw new Error('charts: el canvas debe estar dentro de su marco .ch-frame.');
      const h = util.h;
      this.ctl = ctl;
      this.canvas = canvas;
      this.index = index;
      this.chart = null;
      this.frame = canvas.parentNode;
      this.addedFrameClass = !this.frame.classList.contains('ch-frame');
      if (this.addedFrameClass) this.frame.classList.add('ch-frame');
      this.plot = h('div', { class: 'ch-plot' });
      this.frame.insertBefore(this.plot, canvas);
      this.plot.appendChild(canvas);

      this.saved = {};
      ['role', 'tabindex', 'aria-label', 'aria-describedby'].forEach((a) => { this.saved[a] = canvas.getAttribute(a); });
      this.hadCanvasClass = canvas.classList.contains('ch-canvas');
      canvas.classList.add('ch-canvas');
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('tabindex', '0');
      const hintId = util.uid('ch-hint');
      this.hint = h('span', { class: 'ch-sr', id: hintId, text: KEY_HINT });
      canvas.setAttribute('aria-describedby', hintId);
      this.liveEl = h('div', { class: 'ch-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
      this.tipTitle = h('div', { class: 'ch-tooltip__title' });
      this.tipRows = h('div', { class: 'ch-tooltip__rows' });
      const tid = ctl.testid ? { testid: ctl.testid + (index ? '-' + index : '') + '-tooltip' } : null;
      this.tip = h('div', { class: 'ch-tooltip', 'aria-hidden': 'true', dataset: tid }, this.tipTitle, this.tipRows);
      this.plot.appendChild(this.tip);
      this.plot.appendChild(this.hint);
      this.plot.appendChild(this.liveEl);
      this.tipVisible = false;
      this.tipSig = '';

      this.onMove = (e) => ctl.queuePointer(index, e.offsetX, e.offsetY, e.pointerType);
      this.onLeave = (e) => { if (e.pointerType !== 'touch') ctl.pointerLeft(index); };
      this.onDown = (e) => {
        if (e.pointerType === 'mouse') return;
        ctl.queuePointer(index, e.offsetX, e.offsetY, e.pointerType);
        ctl.armOutsideDismiss();
      };
      this.onFocus = () => ctl.onFocus(index);
      this.onBlur = () => ctl.onBlur(index);
      this.onKey = (e) => ctl.onKey(index, e);
      canvas.addEventListener('pointermove', this.onMove);
      canvas.addEventListener('pointerleave', this.onLeave);
      canvas.addEventListener('pointercancel', this.onLeave);
      canvas.addEventListener('pointerdown', this.onDown);
      canvas.addEventListener('focus', this.onFocus);
      canvas.addEventListener('blur', this.onBlur);
      canvas.addEventListener('keydown', this.onKey);
    }

    create(config) {
      const Chart = chartLib();
      const ctl = this.ctl;
      const si = this.index;
      const layer = {
        id: 'chLayer',
        afterUpdate(chart) {
          if (typeof ctl.afterChartUpdate === 'function') ctl.afterChartUpdate(si, chart);
        },
        beforeDatasetsDraw(chart) {
          const ctx = chart.ctx;
          // El recorte del revelado va antes de drawUnder: tallos y bandas se descubren con la curva.
          if (ctl.reveal < 1) {
            const a = chart.chartArea;
            ctx.save();
            ctx.beginPath();
            ctx.rect(a.left - 4, a.top - 8, (a.right - a.left + 8) * clamp(ctl.reveal, 0, 1) + 4, a.bottom - a.top + 16);
            ctx.clip();
            ctl._clipped = true;
          }
          ctx.save();
          try { ctl.drawUnder(si, chart, ctx); } finally { ctx.restore(); }
        },
        afterDatasetsDraw(chart) {
          const ctx = chart.ctx;
          if (ctl._clipped) { ctx.restore(); ctl._clipped = false; }
          ctx.save();
          try {
            ctl.drawOver(si, chart, ctx);
            ctl.drawHover(si, chart, ctx);
          } finally { ctx.restore(); }
        },
      };
      config.plugins = (config.plugins || []).concat([layer]);
      this.chart = new Chart(this.canvas, config);
      // Fuera de pantalla, el redibujado por cambio de tamaño (responsive) se aplaza al repintado
      // diferido único del controlador; al volver a la vista se dibuja en el acto.
      const chart = this.chart;
      const doResize = chart && chart._doResize;
      if (typeof doResize === 'function') {
        chart._doResize = function () {
          if (ctl.alive && ctl.visible === false) {
            ctl.needsUpdate = true;
            ctl.settleOffscreen();
            return 0;
          }
          return doResize.apply(this, arguments);
        };
      }
      return this.chart;
    }

    showTip(model) {
      if (!model) { this.hideTip(); return; }
      const sig = model.title + '|' + model.rows.map((r) => r.value + '/' + r.label + '/' + r.ref + '/' + r.kind + '/' + dashSig(r.dash)).join('|');
      if (sig !== this.tipSig) {
        this.tipSig = sig;
        this.tipTitle.textContent = model.title;
        const rows = model.rows.map((r) => util.h('div', { class: 'ch-tooltip__row' },
          keySvg(r.kind || 'line', r.ref, r.dash),
          util.h('span', { class: 'ch-tooltip__value', text: r.value }),
          util.h('span', { class: 'ch-tooltip__label', text: r.label || '' })));
        this.tipRows.replaceChildren.apply(this.tipRows, rows);
      }
      // Posición: a la derecha del ancla y, si no cabe, a la izquierda; siempre dentro del trazado.
      const w = this.tip.offsetWidth || 160;
      const hgt = this.tip.offsetHeight || 60;
      const W = this.plot.clientWidth || 0;
      const H = this.plot.clientHeight || 0;
      let x = model.x + 16;
      if (x + w > W - 4) x = model.x - 16 - w;
      x = clamp(x, 4, Math.max(4, W - w - 4));
      const y = clamp(model.y - hgt / 2, 4, Math.max(4, H - hgt - 4));
      this.tip.style.transform = 'translate(' + Math.round(x) + 'px, ' + Math.round(y) + 'px)';
      if (!this.tipVisible) {
        this.tipVisible = true;
        this.tip.classList.add('is-visible');
      }
    }

    hideTip() {
      if (!this.tipVisible) return;
      this.tipVisible = false;
      this.tip.classList.remove('is-visible');
    }

    destroy() {
      const c = this.canvas;
      c.removeEventListener('pointermove', this.onMove);
      c.removeEventListener('pointerleave', this.onLeave);
      c.removeEventListener('pointercancel', this.onLeave);
      c.removeEventListener('pointerdown', this.onDown);
      c.removeEventListener('focus', this.onFocus);
      c.removeEventListener('blur', this.onBlur);
      c.removeEventListener('keydown', this.onKey);
      if (this.chart) {
        try { this.chart.destroy(); } catch (e) { /* ya destruido */ }
        this.chart = null;
      }
      if (this.plot.parentNode === this.frame) this.frame.insertBefore(c, this.plot);
      this.plot.remove();
      Object.keys(this.saved).forEach((a) => {
        if (this.saved[a] === null) c.removeAttribute(a);
        else c.setAttribute(a, this.saved[a]);
      });
      if (!this.hadCanvasClass) c.classList.remove('ch-canvas');
      if (this.addedFrameClass) this.frame.classList.remove('ch-frame');
    }
  }

  /* ================================================================== controlador base */

  class Ctl {
    constructor(kind, canvases, opts) {
      this.kind = kind;
      this.opts = opts || {};
      this.alive = true;
      this.th = theme();
      this.title = this.opts.ariaLabel || DEFAULT_TITLES[kind];
      this.testid = this.opts.testid || (canvases[0] && canvases[0].getAttribute && canvases[0].getAttribute('data-testid')) || '';
      this.explicitLabel = null;
      this.summaryEvery = 0;
      this.lastSummaryAt = -Infinity;
      this.summaryPending = false;
      this.hover = null;
      this.pointer = null;
      this.hoverRaf = 0;
      this.tweens = [];
      this.needsUpdate = false;
      this.reveal = 1;
      this._clipped = false;
      this.hidden = Object.create(null);
      this.legendEl = null;
      this.legendSig = '';
      this.legendButtons = Object.create(null);
      this.dataToggle = null;
      this.toggles = new Set();      // paneles «Ver datos» (propio y externos) que siguen a los datos
      this.tableTimer = null;
      this.tableAt = -Infinity;
      this.intro = null;             // revelado o aparición inicial en espera de la primera vista
      this.seen = false;             // ya estuvo en pantalla al menos una vez
      this.offSince = 0;
      this.stats = { updates: 0, pushes: 0 };
      this.surfaces = canvases.map((c, i) => new Surface(this, c, i));
      this.loop = util.loop((dt) => this.tick(dt), { element: this.surfaces[0].frame });
      this.announceTimer = null;
      this.outsideHandler = null;
      // Visibilidad propia: fuera de pantalla no se anima nada (se aplica el estado final), de modo
      // que una captura de página completa o una impresión nunca muestran una gráfica a medias.
      this.visible = null;
      this.offTimer = null;
      this.stopVisible = util.onVisible(this.surfaces[0].frame, (v) => this.onVisibility(v), { rootMargin: '64px' });
      live.add(this);
      ensureBus();
    }

    /* ---------- ciclo de dibujo */

    onVisibility(v) {
      if (!this.alive) return;
      this.visible = v;
      if (v) {
        this.seen = true;
        // Lo pendiente de fuera de pantalla se dibuja ya (sin esperar al temporizador).
        if (this.offTimer !== null) { clearTimeout(this.offTimer); this.offTimer = null; }
        this.flushNow();
        if (this.intro) this.startIntro();
        else if (this.needsUpdate) this.render();
        this.kick();
      } else {
        // Un revelado aún no visto se dibuja completo fuera de pantalla (capturas, impresión) y
        // espera a la primera vista para reproducirse.
        if (this.intro) { this.intro.apply(1, 1); this.needsUpdate = true; }
        this.settleOffscreen();
      }
    }

    kick() {
      if (!this.alive) return;
      if (this.visible === false) {
        this.settleOffscreen();
        return;
      }
      this.loop.start();
    }

    /**
     * Fuera de pantalla: completa interpolaciones y dibuja una sola vez, OFF_DELAY ms después del
     * último cambio (cada cambio aplaza el repintado, como mucho hasta OFF_MAX_WAIT desde el primero).
     */
    settleOffscreen() {
      if (!this.alive) return;
      const now = util.now();
      if (this.offTimer !== null) {
        if (now - this.offSince >= OFF_MAX_WAIT - OFF_DELAY) return;
        clearTimeout(this.offTimer);
      } else {
        this.offSince = now;
      }
      this.offTimer = setTimeout(() => {
        this.offTimer = null;
        if (!this.alive || this.visible !== false) return;
        this.completeTweens();
        this.flushNow();
        if (this.needsUpdate) this.render();
      }, OFF_DELAY);
    }

    /** Dibuja ya el estado final de todo lo pendiente (impresión, capturas, charts.flush()). */
    flushPending() {
      if (!this.alive) return;
      if (this.offTimer !== null) { clearTimeout(this.offTimer); this.offTimer = null; }
      this.completeTweens();
      // Un revelado en espera se muestra completo, pero se reproducirá igualmente en la primera vista.
      if (this.intro) { this.intro.apply(1, 1); this.needsUpdate = true; }
      this.flushNow();
      if (this.needsUpdate) this.render();
    }

    /**
     * Revelado o aparición inicial: espera a la primera vez que la gráfica entra en pantalla y se
     * reproduce una sola vez. Mientras espera, en pantalla se ve el estado inicial (0) y fuera de
     * ella el final (1). Con movimiento reducido no hay barrido: se aplica el final.
     */
    playIntro(ms, apply) {
      this.intro = null;
      this.cancelTweens(apply.tag);
      if (!(ms > 0) || prefs.reducedMotion) {
        apply(1, 1);
        this.invalidate();
        return;
      }
      this.intro = { ms, apply };
      if (this.seen && this.visible !== false) {
        this.startIntro();
        return;
      }
      apply(this.visible === false ? 1 : 0, this.visible === false ? 1 : 0);
      this.invalidate();
    }

    startIntro() {
      const it = this.intro;
      this.intro = null;
      if (!it) return;
      this.cancelTweens(it.apply.tag);
      if (prefs.reducedMotion) {
        it.apply(1, 1);
        this.invalidate();
        return;
      }
      this.tweens.push({ elapsed: 0, ms: it.ms, apply: it.apply });
      it.apply(0, 0);
      this.invalidate();
    }

    /** Revelado por barrido de izquierda a derecha (recorte en beforeDatasetsDraw). */
    playReveal() {
      const rev = (e) => { this.reveal = e; };
      rev.tag = 'reveal';
      this.playIntro(REVEAL_MS, rev);
    }

    cancelReveal() {
      this.cancelTweens('reveal');
      this.reveal = 1;
    }

    /* ---------- «Ver datos» que sigue a los datos */

    /** Tras un cambio de datos: refresca las tablas abiertas (150 ms; series en vivo, ≤ 2 Hz). */
    scheduleTables() {
      if (!this.alive || !this.toggles.size) return;
      let open = false;
      this.toggles.forEach((t) => { if (t.isOpen()) open = true; });
      if (!open) return;
      if (this.kind === 'time') {
        if (this.tableTimer !== null) return;
        const wait = Math.max(TABLE_DELAY, this.tableAt + TABLE_STREAM_MS - util.now());
        this.tableTimer = setTimeout(() => this.refreshTables(), wait);
        return;
      }
      if (this.tableTimer !== null) clearTimeout(this.tableTimer);
      this.tableTimer = setTimeout(() => this.refreshTables(), TABLE_DELAY);
    }

    refreshTables() {
      this.tableTimer = null;
      if (!this.alive) return;
      this.tableAt = util.now();
      this.toggles.forEach((t) => { if (t.isOpen()) t.refresh(); });
    }

    flushNow() {}

    invalidate() {
      this.needsUpdate = true;
      this.kick();
    }

    pending() {
      return false;
    }

    /** Interpolación de duración ms (0 o movimiento reducido: aplica el final en el acto). */
    tween(ms, apply, done) {
      if (!(ms > 0) || prefs.reducedMotion || this.visible === false) {
        apply(1, 1);
        if (done) done();
        this.invalidate();
        return;
      }
      this.tweens.push({ elapsed: 0, ms, apply, done });
      apply(0, 0);
      this.invalidate();
    }

    cancelTweens(tag) {
      this.tweens = this.tweens.filter((t) => t.apply.tag !== tag);
      if (this.intro && this.intro.apply.tag === tag) this.intro = null;
    }

    completeTweens() {
      const list = this.tweens;
      this.tweens = [];
      list.forEach((t) => {
        t.apply(1, 1);
        if (t.done) t.done();
      });
      if (list.length) this.needsUpdate = true;
      return list.length;
    }

    finishTweens() {
      let n = this.completeTweens();
      // Movimiento reducido: un revelado en espera ya no se reproducirá.
      if (this.intro && prefs.reducedMotion) {
        this.intro.apply(1, 1);
        this.intro = null;
        this.needsUpdate = true;
        n++;
      }
      if (n) this.kick();
    }

    tick(dt) {
      if (!this.alive) return;
      if (this.tweens.length) {
        const list = this.tweens.slice();
        this.tweens = [];
        list.forEach((t) => {
          t.elapsed += dt * 1000;
          const p = clamp(t.elapsed / t.ms, 0, 1);
          t.apply(easeOutCubic(p), p);
          if (p < 1) this.tweens.push(t);
          else if (t.done) t.done();
        });
        this.needsUpdate = true;
      }
      this.beforeRender();
      if (this.needsUpdate) this.render();
      if (!this.tweens.length && !this.pending() && !this.needsUpdate) this.loop.stop();
    }

    beforeRender() {}

    morphMs(mode) {
      if (prefs.reducedMotion) return 0;
      const m = this.th.morph || MORPH_FALLBACK;
      return mode === 'drag' ? m.drag : m.release;
    }

    render() {
      this.needsUpdate = false;
      if (!this.alive) return;
      this.applyAxes();
      this.surfaces.forEach((s) => { if (s.chart) s.chart.update('none'); });
      this.stats.updates++;
      if (this.hover) this.refreshHover();
      this.refreshSummary(false);
    }

    applyAxes() {}

    drawUnder() {}

    drawOver() {}

    onResize(si, size) {
      this.applyAxes(size, si);
    }

    /* ---------- tema */

    retheme() {
      if (!this.alive) return;
      this.th = theme();
      this.applyTheme();
      this.syncLegend();
      this.render();
    }

    /**
     * color(token) memorizado en el tema actual (this.th). Evita un getComputedStyle (y el recálculo
     * de estilo que fuerza tras cambios del DOM) en cada update(). La memoria vive dentro de this.th,
     * que retheme() rehace con «theme:change»: nunca dura más que el resto de colores del tema.
     */
    tokenColor(token) {
      const th = this.th;
      if (!th) return color(token);
      const memo = th.tokenMemo || (th.tokenMemo = new Map());
      let c = memo.get(token);
      if (c === undefined) {
        c = color(token);
        memo.set(token, c);
      }
      return c;
    }

    applyTheme() {}

    /* ---------- hover y teclado */

    queuePointer(si, x, y, type) {
      this.pointer = { si, x, y, type };
      if (this.hoverRaf) return;
      this.hoverRaf = util.raf(() => {
        this.hoverRaf = 0;
        const p = this.pointer;
        if (!p || !this.alive) return;
        this.setHover(this.pick(p.si, p.x, p.y), 'pointer');
      });
    }

    pointerLeft() {
      this.pointer = null;
      if (this.hover && this.hover.src === 'pointer') this.setHover(null);
    }

    armOutsideDismiss() {
      if (this.outsideHandler || typeof document === 'undefined') return;
      this.outsideHandler = (e) => {
        if (this.surfaces.some((s) => s.canvas === e.target)) return;
        this.disarmOutside();
        this.pointer = null;
        if (this.hover && this.hover.src === 'pointer') this.setHover(null);
      };
      document.addEventListener('pointerdown', this.outsideHandler, true);
    }

    disarmOutside() {
      if (!this.outsideHandler) return;
      document.removeEventListener('pointerdown', this.outsideHandler, true);
      this.outsideHandler = null;
    }

    setHover(hv, src) {
      if (hv) hv.src = src || hv.src || 'pointer';
      const before = this.hover ? this.hoverKey(this.hover) : '';
      this.hover = hv;
      const after = hv ? this.hoverKey(hv) : '';
      if (before !== after) this.surfaces.forEach((s) => { if (s.chart) s.chart.render(); });
      this.showTips();
    }

    hoverKey(hv) {
      return hv.si + ':' + hv.i + ':' + (hv.j === undefined ? '' : hv.j);
    }

    showTips() {
      const hv = this.hover;
      this.surfaces.forEach((s, i) => {
        if (hv && hv.si === i) s.showTip(this.tipModel(hv));
        else s.hideTip();
      });
    }

    refreshHover() {
      const hv = this.hover;
      let next = null;
      if (hv.src === 'pointer' && this.pointer) next = this.pick(this.pointer.si, this.pointer.x, this.pointer.y);
      else if (hv.src === 'key') next = this.rehover(hv);
      if (next) next.src = hv.src;
      const changed = !next || this.hoverKey(next) !== this.hoverKey(hv);
      this.hover = next;
      if (changed) this.surfaces.forEach((s) => { if (s.chart) s.chart.render(); });
      this.showTips();
    }

    rehover(hv) {
      return hv;
    }

    onFocus(si) {
      let keyboard = true;
      try { keyboard = this.surfaces[si].canvas.matches(':focus-visible'); } catch (e) { keyboard = true; }
      if (!keyboard) return;
      const hv = this.nav(si, 'focus', null);
      if (hv) {
        hv.si = si;
        this.setHover(hv, 'key');
      }
    }

    onBlur() {
      if (this.hover && this.hover.src === 'key') this.setHover(null);
    }

    onKey(si, e) {
      const k = e.key;
      let cmd = null;
      if (k === 'ArrowRight' || k === 'ArrowUp') cmd = e.shiftKey ? 'next' : 'fwd';
      else if (k === 'ArrowLeft' || k === 'ArrowDown') cmd = e.shiftKey ? 'prev' : 'back';
      else if (k === 'PageUp') cmd = 'pgfwd';
      else if (k === 'PageDown') cmd = 'pgback';
      else if (k === 'Home') cmd = 'home';
      else if (k === 'End') cmd = 'end';
      else if (k === 'Escape') {
        if (this.hover) {
          this.setHover(null);
          if (e.preventDefault) e.preventDefault();
        }
        return;
      }
      if (!cmd) return;
      if (e.preventDefault) e.preventDefault();
      const cur = this.hover && this.hover.si === si ? this.hover : null;
      const hv = this.nav(si, cmd, cur);
      if (!hv) return;
      hv.si = si;
      this.setHover(hv, 'key');
      this.announce(si);
    }

    /** Paso de navegación por índice: n puntos, cmd, índice actual. */
    stepIndex(n, cmd, i) {
      if (n <= 0) return -1;
      const big = Math.max(1, Math.round(n / 40));
      const page = Math.max(1, Math.round(n / 8));
      if (cmd === 'home') return 0;
      if (cmd === 'end') return n - 1;
      if (i < 0 || i === undefined) return cmd === 'back' || cmd === 'prev' || cmd === 'pgback' ? n - 1 : 0;
      const d = { fwd: big, back: -big, next: 1, prev: -1, pgfwd: page, pgback: -page }[cmd] || 0;
      return clamp(i + d, 0, n - 1);
    }

    announce(si) {
      if (this.announceTimer) clearTimeout(this.announceTimer);
      this.announceTimer = setTimeout(() => {
        this.announceTimer = null;
        if (!this.alive || !this.hover) return;
        const m = this.tipModel(this.hover);
        if (!m) return;
        this.surfaces[si].liveEl.textContent = m.title + ': ' + m.rows.map((r) => (r.label ? r.label + ' ' : '') + r.value).join('; ');
      }, 250);
    }

    /* ---------- dibujo común del hover */

    drawHover(si, chart, ctx) {
      if (!this.hover) return;
      const marks = this.hoverMarks(si, chart);
      if (!marks) return;
      const a = chart.chartArea;
      const th = this.th;
      if (isNum(marks.x) && marks.x >= a.left - 0.5 && marks.x <= a.right + 0.5) {
        strokeLine(ctx, Math.round(marks.x) + 0.5, a.top, Math.round(marks.x) + 0.5, a.bottom, th.axis, 1);
      }
      (marks.dots || []).forEach((d) => {
        if (isNum(d.x) && isNum(d.y) && d.y >= a.top - 1 && d.y <= a.bottom + 1) dot(ctx, d.x, d.y, 4, d.color, th.plotBg, 2);
      });
    }

    hoverMarks() {
      return null;
    }

    /* ---------- accesibilidad */

    refreshSummary(force) {
      if (this.explicitLabel !== null) return;
      const now = util.now();
      if (!force && now - this.lastSummaryAt < this.summaryEvery) return;
      this.lastSummaryAt = now;
      const texts = this.summaries();
      this.surfaces.forEach((s, i) => s.canvas.setAttribute('aria-label', texts[i] || texts[0] || this.title));
    }

    summaries() {
      return [this.title];
    }

    describe(text) {
      if (text === null || text === undefined) {
        this.explicitLabel = null;
        this.refreshSummary(true);
        return;
      }
      this.explicitLabel = String(text);
      this.surfaces.forEach((s, i) => s.canvas.setAttribute('aria-label', this.labelFor(i, this.explicitLabel)));
    }

    labelFor(i, text) {
      return text;
    }

    /* ---------- leyenda HTML */

    legendItems() {
      return [];
    }

    isOn(id) {
      return !this.hidden[id];
    }

    syncLegend() {
      const items = this.opts.legend === false ? [] : this.legendItems();
      const sig = items.map((it) => [it.id, it.label, it.kind, it.ref, dashSig(it.dash)].join('~')).join('|');
      if (sig !== this.legendSig) {
        this.legendSig = sig;
        this.buildLegend(items);
      }
      items.forEach((it) => {
        const b = this.legendButtons[it.id];
        if (!b) return;
        b.setAttribute('aria-pressed', this.isOn(it.id) ? 'true' : 'false');
        b.classList.toggle('is-unavailable', it.available === false);
        b.title = it.available === false ? 'Sin datos en esta respuesta' : '';
      });
    }

    buildLegend(items) {
      if (this.legendEl) this.legendEl.remove();
      this.legendEl = null;
      this.legendButtons = Object.create(null);
      if (!items.length) return;
      const h = util.h;
      const el = h('div', {
        class: 'ch-legend',
        role: 'group',
        'aria-label': 'Leyenda: ' + this.title,
        dataset: this.testid ? { testid: this.testid + '-legend' } : null,
      });
      items.forEach((it) => {
        const btn = h('button', {
          type: 'button',
          class: 'ch-legend__item',
          'aria-pressed': this.isOn(it.id) ? 'true' : 'false',
          dataset: { chItem: it.id, testid: this.testid ? this.testid + '-legend-' + it.id.replace(/[^\w-]+/g, '-') : null },
          onClick: () => this.toggleItem(it.id),
        }, keySvg(it.kind, it.ref, it.dash), h('span', { class: 'ch-legend__label', text: it.label }));
        this.legendButtons[it.id] = btn;
        el.appendChild(btn);
      });
      const host = this.opts.legend && this.opts.legend.nodeType === 1 ? this.opts.legend : null;
      const frame = this.surfaces[0].frame;
      if (host) host.appendChild(el);
      else if (this.legendOutside && frame.parentNode) {
        // Bode con dos marcos: la leyenda es común y no resta altura a uno solo de los trazados.
        el.classList.add('ch-legend--outside');
        frame.parentNode.insertBefore(el, frame);
      } else frame.insertBefore(el, this.surfaces[0].plot);
      this.legendEl = el;
    }

    toggleItem(id) {
      this.hidden[id] = !this.hidden[id];
      this.onToggle(id, !this.hidden[id]);
      this.syncLegend();
      this.invalidate();
    }

    onToggle() {}

    /* ---------- datos */

    tableSpec() {
      return { caption: this.title, columns: [], rows: [] };
    }

    /* ---------- destrucción */

    destroy() {
      if (!this.alive) return;
      this.alive = false;
      live.delete(this);
      releaseBus();
      this.tweens = [];
      if (this.hoverRaf) util.cancelRaf(this.hoverRaf);
      if (this.announceTimer) clearTimeout(this.announceTimer);
      if (this.offTimer !== null) clearTimeout(this.offTimer);
      this.offTimer = null;
      if (this.tableTimer !== null) clearTimeout(this.tableTimer);
      this.tableTimer = null;
      this.intro = null;
      if (this.stopVisible) this.stopVisible();
      this.disarmOutside();
      this.loop.destroy();
      if (this.dataToggle) this.dataToggle.destroy();
      this.dataToggle = null;
      this.toggles.clear();
      if (this.legendEl) this.legendEl.remove();
      this.legendEl = null;
      this.surfaces.forEach((s) => s.destroy());
    }
  }

  /* ================================================================== serie temporal en streaming */

  class TimeCtl extends Ctl {
    constructor(canvas, opts) {
      super('time', [canvas], opts);
      const o = this.opts;
      this.discrete = !!o.discrete;
      this.xLabel = o.xLabel || (this.discrete ? 'Periodo k' : 'Tiempo t (s)');
      this.xSymbol = o.xSymbol || (this.discrete ? 'k' : 't');
      this.xUnit = o.xUnit !== undefined ? o.xUnit : (this.discrete ? '' : 's');
      this.yLabel = o.yLabel || '';
      this.window = o.window === undefined ? 10 : o.window;
      if (this.window !== null && !(this.window > 0)) this.window = null;
      this.yRange = Array.isArray(o.yRange) ? o.yRange.slice(0, 2) : 'auto';
      this.maxPoints = Math.max(16, Math.round(o.maxPoints || 2000));
      this.fps = o.fps > 0 ? o.fps : STREAM_FPS;
      this.summaryEvery = 1000;
      this.pool = [];
      this.lastFlush = -Infinity;
      this.dirty = false;
      this.yMem = null;
      this.t0 = null;
      this.tLast = null;
      this.series = [];
      this.data = [];          // muestras propias (push/splice libres)
      this.views = [];         // arrays que ve Chart.js: se copian al repintar, sin push/splice
      this.surfaces[0].create(this.config(o.series || []));
      this.syncLegend();
      this.refreshSummary(true);
    }

    config(series) {
      this.setSeriesState(series);
      const th = this.th;
      // Chart.js dibuja al crearse: con un rango fijo (opts.yRange), ese primer dibujo ya usa el
      // definitivo, con las mismas marcas que applyAxes(); sin él, el provisional −1..1 de siempre.
      const fixed = this.fixedYBounds();
      const y = linearAxis(th, { axis: 'y', title: this.yLabel, min: fixed ? fixed.min : -1, max: fixed ? fixed.max : 1, gutter: Y_GUTTER, maxTicks: 7 });
      if (fixed) setStep(y, fixed.step);
      return {
        type: 'line',
        data: { datasets: this.series.map((s, i) => this.dataset(s, i)) },
        options: baseOptions(this, 0, {
          normalized: true,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
            title: { display: false },
            decimation: { enabled: true, algorithm: 'min-max' },
          },
          scales: {
            x: linearAxis(th, { axis: 'x', title: this.xLabel, min: 0, max: this.window || 1, integer: this.discrete, gutter: X_GUTTER }),
            y,
          },
        }),
      };
    }

    /** Rango fijo de y (opts.yRange / setYRange) con su paso de marcas, o null si es automático. */
    fixedYBounds() {
      if (!Array.isArray(this.yRange)) return null;
      const a = Number(this.yRange[0]);
      const b = Number(this.yRange[1]);
      if (!isNum(a) || !isNum(b) || a === b) return null;
      return { min: a, max: b, step: niceNum(Math.abs(b - a) / 5, true) };
    }

    setSeriesState(series) {
      if (series.length > SERIES_TOKENS.length && typeof console !== 'undefined') {
        console.warn('[charts] Más de ' + SERIES_TOKENS.length + ' series: agrupe o separe en varias gráficas.');
      }
      this.series = series.map((s, i) => ({
        key: String(s.key),
        label: s.label || String(s.key),
        token: s.color || SERIES_TOKENS[Math.min(i, SERIES_TOKENS.length - 1)],
        dash: s.dash || false,
        unit: s.unit || '',
      }));
      this.data = this.series.map(() => []);
      this.views = this.series.map(() => []);
      this.t0 = null;
      this.tLast = null;
      this.yMem = null;
    }

    dataset(s, i) {
      const th = this.th;
      const c = this.tokenColor(s.token);
      const ds = {
        label: s.label,
        data: this.views[i],
        borderColor: this.discrete ? withAlpha(c, 0.55) : c,
        backgroundColor: c,
        borderWidth: this.discrete ? 1.25 : th.lineWidth,
        borderDash: dashFor(s.dash, th),
        borderCapStyle: 'round',
        borderJoinStyle: 'round',
        pointRadius: this.discrete ? 3.5 : 0,
        pointBackgroundColor: c,
        pointBorderColor: th.plotBg,
        pointBorderWidth: this.discrete ? 1.5 : 0,
        pointHoverRadius: 0,
        pointHitRadius: 0,
        fill: false,
        spanGaps: false,
        tension: 0,
        hidden: !this.isOn('s:' + s.key),
      };
      return ds;
    }

    applyTheme() {
      const chart = this.surfaces[0].chart;
      if (!chart) return;
      chart.data.datasets.forEach((ds, i) => {
        const s = this.series[i];
        const c = this.tokenColor(s.token);
        ds.borderColor = this.discrete ? withAlpha(c, 0.55) : c;
        ds.backgroundColor = c;
        ds.pointBackgroundColor = c;
        ds.pointBorderColor = this.th.plotBg;
        ds.borderDash = dashFor(s.dash, this.th);
        ds.borderWidth = this.discrete ? 1.25 : this.th.lineWidth;
      });
      const sc = chart.config.options.scales;
      scaleColors(sc.x, this.th);
      scaleColors(sc.y, this.th);
    }

    /* ---------- datos */

    take(x, y) {
      const p = this.pool.pop() || { x: 0, y: 0 };
      p.x = x;
      p.y = y;
      return p;
    }

    recycle(points) {
      for (let i = 0; i < points.length && this.pool.length < this.maxPoints * 2; i++) this.pool.push(points[i]);
    }

    push(t, values) {
      t = Number(t);
      if (!isNum(t)) return;
      if (this.tLast !== null && t < this.tLast) this.clearData();
      values = values || {};
      for (let i = 0; i < this.series.length; i++) {
        const v = values[this.series[i].key];
        this.data[i].push(this.take(t, isNum(v) ? v : null));
      }
      if (this.t0 === null) this.t0 = t;
      this.tLast = t;
      this.stats.pushes++;
      if (this.data.length && this.data[0].length > this.maxPoints * 1.1) this.capPoints();
      this.dirty = true;
      this.kick();
    }

    pushMany(samples) {
      if (!samples) return;
      const list = Array.isArray(samples) ? samples : (typeof samples.toArray === 'function' ? samples.toArray() : []);
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!s) continue;
        this.push(s.t, s.values || s.outputs || s);
      }
    }

    setData(samples) {
      this.clearData();
      this.pushMany(samples);
      this.flush();
      this.playReveal();
      this.refreshSummary(true);
    }

    capPoints() {
      const n = this.data[0].length;
      if (this.window === null) {
        // Historia completa: se diezma a la mitad (se conserva el último punto).
        this.data.forEach((arr) => {
          const removed = [];
          let j = 0;
          for (let i = 0; i < n; i++) {
            if (i % 2 === 0 || i === n - 1) arr[j++] = arr[i];
            else removed.push(arr[i]);
          }
          arr.splice(j, arr.length - j);
          this.recycle(removed);
        });
      } else {
        const cut = n - this.maxPoints;
        this.data.forEach((arr) => this.recycle(arr.splice(0, cut)));
      }
    }

    clearData() {
      this.data.forEach((arr) => this.recycle(arr.splice(0, arr.length)));
      this.t0 = null;
      this.tLast = null;
      this.yMem = null;
    }

    clear() {
      this.clearData();
      this.cancelReveal();
      this.flush();
      this.invalidate();
      this.refreshSummary(true);
    }

    setSeries(series) {
      const chart = this.surfaces[0].chart;
      this.clearData();
      this.setSeriesState(series || []);
      chart.data.datasets = this.series.map((s, i) => this.dataset(s, i));
      this.syncLegend();
      this.invalidate();
      this.refreshSummary(true);
    }

    setWindow(s) {
      this.window = s === null || s === undefined ? null : s > 0 ? s : this.window;
      this.yMem = null;
      this.invalidate();
    }

    setYRange(r) {
      this.yRange = Array.isArray(r) ? r.slice(0, 2) : 'auto';
      this.yMem = null;
      this.invalidate();
    }

    resize() {
      const c = this.surfaces[0].chart;
      if (c) c.resize();
    }

    pending() {
      return this.dirty;
    }

    flushNow() {
      if (this.dirty) this.flush();
    }

    beforeRender() {
      if (!this.dirty) return;
      const now = util.now();
      if (now - this.lastFlush < 1000 / this.fps - 4) return;
      this.flush();
    }

    flush() {
      this.dirty = false;
      this.lastFlush = util.now();
      this.trimWindow();
      this.syncViews();
      this.needsUpdate = true;
    }

    /**
     * Copia las muestras a los arrays de Chart.js por índice. Chart.js intercepta push/splice de
     * sus arrays y, con parsing:false, reprocesa todos los elementos en cada llamada (O(n) por
     * muestra; además splice(0) sin cuenta lo desincroniza). Así cuesta O(n) por repintado.
     */
    syncViews() {
      for (let k = 0; k < this.data.length; k++) {
        const src = this.data[k];
        const dst = this.views[k];
        if (!dst) continue;
        const n = src.length;
        for (let j = 0; j < n; j++) dst[j] = src[j];
        dst.length = n;
      }
    }

    trimWindow() {
      if (this.window === null || !this.data.length || this.tLast === null) return;
      const arr = this.data[0];
      const xMin = Math.max(this.t0, this.tLast - this.window);
      const cut = Math.max(0, lowerBoundX(arr, xMin) - 1);
      if (cut >= 32 || cut > arr.length / 4) this.data.forEach((a) => this.recycle(a.splice(0, cut)));
    }

    xBounds() {
      if (this.tLast === null) return { min: 0, max: this.window || 1 };
      if (this.window !== null) {
        const min = Math.max(this.t0, this.tLast - this.window);
        return { min, max: min + this.window };
      }
      return { min: this.t0, max: Math.max(this.tLast, this.t0 + (this.discrete ? 1 : 1e-6)) };
    }

    applyAxes() {
      const chart = this.surfaces[0].chart;
      if (!chart) return;
      const sc = chart.config.options.scales;
      const xb = this.xBounds();
      sc.x.min = xb.min;
      sc.x.max = xb.max;
      // Rango fijo: se respeta tal cual y las marcas son múltiplos «bonitos» anclados en 0
      // ([−15000, 10000] → cada 5000). Si no, el rango sigue a los datos visibles.
      let yb = this.fixedYBounds();
      if (!yb) {
        let lo = Infinity;
        let hi = -Infinity;
        this.data.forEach((arr, k) => {
          if (!this.isOn('s:' + this.series[k].key)) return;
          for (let i = lowerBoundX(arr, xb.min); i < arr.length; i++) {
            const y = arr[i].y;
            if (y === null) continue;
            if (y < lo) lo = y;
            if (y > hi) hi = y;
          }
        });
        if (this.yMem) {
          lo = Math.min(lo, this.yMem.lo);
          hi = Math.max(hi, this.yMem.hi);
        }
        if (lo <= hi) {
          this.yMem = { lo, hi };
          yb = niceBounds(lo, hi, { pad: 0.06 });
        } else {
          yb = { min: -1, max: 1, step: 0.5 };
        }
      }
      sc.y.min = yb.min;
      sc.y.max = yb.max;
      setStep(sc.y, yb.step);
    }

    onToggle(id, on) {
      const chart = this.surfaces[0].chart;
      const k = this.series.findIndex((s) => 's:' + s.key === id);
      if (k >= 0 && chart) chart.data.datasets[k].hidden = !on;
      this.yMem = null;
    }

    legendItems() {
      if (this.series.length < 2) return [];
      return this.series.map((s) => ({
        id: 's:' + s.key,
        label: s.label,
        kind: this.discrete ? 'points' : 'line',
        ref: cssRef(s.token),
        dash: s.dash || false,
      }));
    }

    /* ---------- hover */

    pick(si, px) {
      const chart = this.surfaces[0].chart;
      if (!chart || !this.data.length || !this.data[0].length) return null;
      const a = chart.chartArea;
      if (px < a.left - 8 || px > a.right + 8) return null;
      const x = chart.scales.x.getValueForPixel(px);
      const i = nearestIndexX(this.data[0], x);
      return i < 0 ? null : { si: 0, i, x: this.data[0][i].x };
    }

    rehover(hv) {
      const arr = this.data[0];
      if (!arr || !arr.length) return null;
      const i = nearestIndexX(arr, hv.x);
      return { si: 0, i, x: arr[i].x };
    }

    nav(si, cmd, cur) {
      const arr = this.data[0];
      if (!arr || !arr.length) return null;
      const xb = this.xBounds();
      const lo = Math.min(arr.length - 1, lowerBoundX(arr, xb.min));
      const visible = arr.length - lo;
      let i = cur ? nearestIndexX(arr, cur.x) - lo : -1;
      if (cmd === 'focus') i = visible - 1;
      else i = this.stepIndex(visible, cmd, i);
      i = clamp(i + lo, 0, arr.length - 1);
      return { si: 0, i, x: arr[i].x };
    }

    hoverMarks(si, chart) {
      const hv = this.hover;
      const arr = this.data[0];
      if (!arr || hv.i >= arr.length) return null;
      const x = chart.scales.x.getPixelForValue(arr[hv.i].x);
      const dots = [];
      this.series.forEach((s, k) => {
        const p = this.data[k][hv.i];
        if (!p || p.y === null || !this.isOn('s:' + s.key)) return;
        dots.push({ x, y: chart.scales.y.getPixelForValue(p.y), color: this.tokenColor(s.token) });
      });
      return { x, dots };
    }

    tipModel(hv) {
      const chart = this.surfaces[0].chart;
      const arr = this.data[0];
      if (!chart || !arr || hv.i >= arr.length) return null;
      const t = arr[hv.i].x;
      const rows = [];
      let ySum = 0;
      let yN = 0;
      this.series.forEach((s, k) => {
        if (!this.isOn('s:' + s.key)) return;
        const p = this.data[k][hv.i];
        const y = p ? p.y : null;
        rows.push({ value: y === null ? '—' : fmtU(y, s.unit), label: s.label, ref: cssRef(s.token), dash: s.dash || false, kind: 'line' });
        if (y !== null) { ySum += chart.scales.y.getPixelForValue(y); yN++; }
      });
      return {
        title: this.xSymbol + ' = ' + fmtU(t, this.xUnit),
        rows,
        x: chart.scales.x.getPixelForValue(t),
        y: yN ? ySum / yN : (chart.chartArea.top + chart.chartArea.bottom) / 2,
      };
    }

    /* ---------- accesibilidad y datos */

    summaries() {
      const arr = this.data[0];
      const names = this.series.map((s) => s.label).join(', ');
      if (!arr || !arr.length) return [this.title + ': ' + (names ? names + '. ' : '') + 'sin datos todavía.'];
      const last = arr.length - 1;
      const vals = this.series.map((s, k) => {
        const p = this.data[k][last];
        return s.label + ' ' + (p && p.y !== null ? fmtU(p.y, s.unit, 3) : '—');
      }).join(', ');
      return [this.title + ': ' + names + '. Última muestra en ' + this.xSymbol + ' = ' + fmtU(arr[last].x, this.xUnit, 4) + ': ' + vals + '.'];
    }

    tableSpec() {
      const xName = this.xLabel.replace(/\s*\([^)]*\)\s*$/, '');
      const columns = [{ key: '__x', label: xName, unit: this.xUnit }].concat(this.series.map((s) => ({ key: s.key, label: s.label, unit: s.unit })));
      const arr = this.data[0] || [];
      const rows = arr.map((p, i) => {
        const row = { __x: p.x };
        this.series.forEach((s, k) => { row[s.key] = this.data[k][i] ? this.data[k][i].y : null; });
        return row;
      });
      return { caption: this.title, columns, rows };
    }
  }

  /* ================================================================== respuesta al escalón */

  /** Anotaciones en la forma del contrato o directamente un stepInfo() de DSL.core.tf. */
  function normalizeAnnotations(a, showBand) {
    if (!a) return null;
    const out = {
      finalValue: isNum(a.finalValue) ? a.finalValue : null,
      band: null,
      peak: null,
      overshootPct: isNum(a.overshootPct) ? a.overshootPct : null,
      settlingTime: isNum(a.settlingTime) ? a.settlingTime : null,
      riseTime: null,
    };
    const band = isNum(a.band) ? a.band : isNum(a.settleBand) ? a.settleBand : 0.02;
    out.band = showBand !== false && a.band !== false && band > 0 && out.finalValue !== null ? band : null;
    if (a.peak && typeof a.peak === 'object' && isNum(a.peak.t) && isNum(a.peak.y)) out.peak = { t: a.peak.t, y: a.peak.y };
    else if (isNum(a.peak) && isNum(a.peakTime)) out.peak = { t: a.peakTime, y: a.peak };
    if (out.peak && out.overshootPct !== null && out.overshootPct < 0.05) out.peak = null;
    const r = a.riseTime && typeof a.riseTime === 'object' ? a.riseTime : a.riseTimes;
    if (r && isNum(r.t10) && isNum(r.t90) && r.t90 > r.t10) out.riseTime = { t10: r.t10, t90: r.t90 };
    return out;
  }

  const ANN_KEYS = ['finalValue', 'band', 'overshootPct', 'settlingTime'];

  function lerpAnnotations(from, to, e) {
    if (!to) return null;
    const out = { finalValue: to.finalValue, band: to.band, overshootPct: to.overshootPct, settlingTime: to.settlingTime, peak: to.peak, riseTime: to.riseTime, alpha: {} };
    const groups = { final: 'finalValue', band: 'band', ts: 'settlingTime' };
    ANN_KEYS.forEach((k) => {
      if (from && isNum(from[k]) && isNum(to[k])) out[k] = lerp(from[k], to[k], e);
    });
    if (from && from.peak && to.peak) out.peak = { t: lerp(from.peak.t, to.peak.t, e), y: lerp(from.peak.y, to.peak.y, e) };
    if (from && from.riseTime && to.riseTime) {
      out.riseTime = { t10: lerp(from.riseTime.t10, to.riseTime.t10, e), t90: lerp(from.riseTime.t90, to.riseTime.t90, e) };
    }
    Object.keys(groups).forEach((g) => {
      const k = groups[g];
      out.alpha[g] = !from || from[k] === null || from[k] === undefined ? e : 1;
    });
    out.alpha.peak = !from || !from.peak ? e : 1;
    out.alpha.rise = !from || !from.riseTime ? e : 1;
    return out;
  }

  class StepCtl extends Ctl {
    constructor(canvas, opts) {
      super('step', [canvas], opts);
      const o = this.opts;
      this.xLabel = o.xLabel || 'Tiempo t (s)';
      this.yLabel = o.yLabel === undefined ? 'Amplitud' : o.yLabel;
      this.xUnit = o.xUnit !== undefined ? o.xUnit : 's';
      this.xSymbol = o.xSymbol || 't';
      this.showBand = o.showBand !== false;
      this.curves = [];        // destino: { key, label, token, dash, t: number[], y: number[] }
      this.disp = {};          // key → { points: {x,y}[], from: number[]|null }
      this.ghosts = {};        // key → { t, y }
      this.ann = null;
      this.annDisp = null;
      this.ax = null;
      this.axFrom = null;
      this.axDisp = null;
      this.lastMode = 'release';
      this.hasData = false;
      this.surfaces[0].create(this.config());
      this.syncLegend();
      this.refreshSummary(true);
    }

    config() {
      const th = this.th;
      return {
        type: 'line',
        data: { datasets: [] },
        options: baseOptions(this, 0, {
          normalized: true,
          scales: {
            x: linearAxis(th, { axis: 'x', title: this.xLabel, min: 0, max: 1, gutter: X_GUTTER }),
            y: linearAxis(th, { axis: 'y', title: this.yLabel, min: 0, max: 1, gutter: Y_GUTTER, maxTicks: 7 }),
          },
        }),
      };
    }

    curveColor(c) {
      return this.tokenColor(c.token);
    }

    buildDatasets() {
      const th = this.th;
      const sets = [];
      this.curves.forEach((c) => {
        const g = this.ghosts[c.key];
        const col = this.curveColor(c);
        sets.push({
          label: c.label + ' (anterior)',
          data: g ? g.t.map((t, i) => ({ x: t, y: isNum(g.y[i]) ? g.y[i] : null })) : [],
          borderColor: withAlpha(col, th.ghostOpacity),
          borderWidth: Math.max(1.5, th.lineWidth - 0.25),
          borderDash: th.refDash.slice(),
          pointRadius: 0,
          fill: false,
          tension: 0,
          hidden: !g || !this.isOn('ghost') || !this.isOn('c:' + c.key),
          _role: 'ghost',
          _key: c.key,
        });
      });
      this.curves.forEach((c) => {
        const col = this.curveColor(c);
        sets.push({
          label: c.label,
          data: this.disp[c.key].points,
          borderColor: col,
          backgroundColor: col,
          borderWidth: th.lineWidth,
          borderDash: dashFor(c.dash, th),
          borderCapStyle: 'round',
          borderJoinStyle: 'round',
          pointRadius: 0,
          fill: false,
          tension: 0,
          hidden: !this.isOn('c:' + c.key),
          _role: 'curve',
          _key: c.key,
        });
      });
      this.surfaces[0].chart.data.datasets = sets;
    }

    applyTheme() {
      const chart = this.surfaces[0].chart;
      if (!chart) return;
      if (this.curves.length) this.buildDatasets();
      const sc = chart.config.options.scales;
      scaleColors(sc.x, this.th);
      scaleColors(sc.y, this.th);
    }

    update(curves, uopts) {
      uopts = uopts || {};
      const mode = uopts.mode === 'drag' ? 'drag' : 'release';
      const list = (curves || []).map((c, i) => {
        const t = Array.from(c.t || []);
        const y = Array.from(c.y || []).map((v) => (isNum(v) ? v : null));
        return {
          key: String(c.key === undefined ? 'y' + i : c.key),
          label: c.label || (i === 0 ? 'Respuesta y(t)' : String(c.key)),
          token: c.color || (i === 0 ? '--c-out' : SERIES_TOKENS[Math.min(i, SERIES_TOKENS.length - 1)]),
          dash: c.dash || false,
          t: t.slice(0, Math.min(t.length, y.length)),
          y: y.slice(0, Math.min(t.length, y.length)),
        };
      }).filter((c) => c.t.length >= 2);

      const first = !this.hasData;
      // Fantasma: la curva anterior a la interacción en curso (un arrastre conserva el de su inicio).
      if (uopts.ghost === false) this.ghosts = {};
      else if (!first && this.lastMode !== 'drag') {
        const g = {};
        this.curves.forEach((c) => { g[c.key] = { t: c.t.slice(), y: c.y.slice() }; });
        this.ghosts = g;
      }
      this.lastMode = mode;

      // Desde lo que se ve ahora (aunque haya un morph a medias) hacia el destino nuevo.
      const disp = {};
      list.forEach((c) => {
        const prev = this.disp[c.key];
        let from = null;
        if (prev && prev.points.length >= 2 && !first) {
          const px = prev.points.map((p) => p.x);
          const py = prev.points.map((p) => p.y);
          from = resample(px, py, c.t, new Array(c.t.length), false);
        }
        const pts = prev && prev.points.length === c.t.length ? prev.points : c.t.map((t) => ({ x: t, y: 0 }));
        for (let j = 0; j < c.t.length; j++) pts[j].x = c.t[j];
        disp[c.key] = { points: pts, from, to: c.y };
      });
      this.curves = list;
      this.disp = disp;
      this.hasData = list.length > 0;

      const annTo = normalizeAnnotations(uopts.annotations, this.showBand);
      const annFrom = first ? null : this.annDisp;
      this.ann = annTo;
      this.axFrom = this.axDisp;
      this.ax = this.computeAxes(list, annTo);
      this.buildDatasets();
      this.syncLegend();

      const apply = (e) => {
        list.forEach((c) => {
          const d = disp[c.key];
          for (let j = 0; j < d.points.length; j++) {
            const to = d.to[j];
            const fr = d.from ? d.from[j] : null;
            d.points[j].y = to === null ? null : isNum(fr) ? fr + (to - fr) * e : to;
          }
        });
        const A = this.axFrom;
        const B = this.ax;
        this.axDisp = A && !first ? { xMax: lerp(A.xMax, B.xMax, e), yMin: lerp(A.yMin, B.yMin, e), yMax: lerp(A.yMax, B.yMax, e), yStep: B.yStep } : B;
        this.annDisp = lerpAnnotations(annFrom, annTo, first ? 1 : e);
      };
      apply.tag = 'morph';
      this.cancelTweens('morph');
      if (first) {
        apply(1);
        this.playReveal();
      } else {
        this.tween(this.morphMs(mode), apply);
      }
      this.refreshSummary(true);
    }

    computeAxes(list, ann) {
      let tMax = 0;
      let lo = Infinity;
      let hi = -Infinity;
      const scan = (ys) => ys.forEach((v) => {
        if (v === null || !isNum(v)) return;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      });
      list.forEach((c) => {
        tMax = Math.max(tMax, c.t[c.t.length - 1]);
        scan(c.y);
      });
      if (ann && isNum(ann.finalValue)) {
        const b = ann.band ? Math.abs(ann.finalValue) * ann.band : 0;
        scan([ann.finalValue - b, ann.finalValue + b]);
      }
      if (ann && ann.peak) scan([ann.peak.y]);
      const yb = niceBounds(Math.min(lo, 0), hi, { pad: 0.08, ticks: 5 });
      return { xMax: tMax > 0 ? tMax : 1, yMin: yb.min, yMax: yb.max, yStep: yb.step };
    }

    clearGhost() {
      this.ghosts = {};
      if (this.curves.length) this.buildDatasets();
      this.syncLegend();
      this.invalidate();
    }

    applyAxes() {
      const chart = this.surfaces[0].chart;
      const ax = this.axDisp || this.ax;
      if (!chart || !ax) return;
      const sc = chart.config.options.scales;
      sc.x.min = 0;
      sc.x.max = ax.xMax;
      sc.y.min = ax.yMin;
      sc.y.max = ax.yMax;
      setStep(sc.y, ax.yStep);
    }

    onToggle() {
      if (this.curves.length) this.buildDatasets();
    }

    legendItems() {
      const items = this.curves.map((c) => ({ id: 'c:' + c.key, label: c.label, kind: 'line', ref: cssRef(c.token), dash: c.dash || false }));
      if (!items.length) items.push({ id: 'c:y', label: 'Respuesta y(t)', kind: 'line', ref: cssRef('--c-out'), available: false });
      const a = this.ann || {};
      const first = this.curves[0] ? cssRef(this.curves[0].token) : cssRef('--c-out');
      const hasGhost = Object.keys(this.ghosts).length > 0;
      // Los rótulos directos ya nombran cada marca: la leyenda solo agrupa y permite ocultarlas.
      if (this.opts.ghost !== false) items.push({ id: 'ghost', label: 'Anterior', kind: 'ghost', ref: first, available: hasGhost });
      const finalLabel = this.showBand ? 'y∞ ±' + NBSP + fmt((a.band || 0.02) * 100, 3) + NBSP + '%' : 'Valor final y∞';
      items.push({ id: 'final', label: finalLabel, kind: this.showBand ? 'refband' : 'ref', ref: cssRef('--c-in'), available: isNum(a.finalValue) });
      items.push({ id: 'marks', label: 'Pico y tiempos', kind: 'marks', ref: first, available: !!(a.peak || isNum(a.settlingTime) || a.riseTime) });
      return items;
    }

    /* ---------- anotaciones */

    drawUnder(si, chart, ctx) {
      const a = this.annDisp;
      if (!a || !isNum(a.finalValue) || !a.band || !this.isOn('final')) return;
      const area = chart.chartArea;
      const sy = chart.scales.y;
      const d = Math.abs(a.finalValue) * a.band;
      const y0 = sy.getPixelForValue(a.finalValue + d);
      const y1 = sy.getPixelForValue(a.finalValue - d);
      const top = clamp(Math.min(y0, y1), area.top, area.bottom);
      const bot = clamp(Math.max(y0, y1), area.top, area.bottom);
      ctx.globalAlpha = a.alpha.band === undefined ? 1 : a.alpha.band;
      ctx.fillStyle = withAlpha(this.th.colors.in, 0.14);
      ctx.fillRect(area.left, top, area.right - area.left, Math.max(1, bot - top));
    }

    drawOver(si, chart, ctx) {
      const a = this.annDisp;
      if (!a) return;
      const th = this.th;
      const area = chart.chartArea;
      const sx = chart.scales.x;
      const sy = chart.scales.y;
      const ref = th.colors.in;
      const labels = [];
      const inX = (x) => x >= area.left - 0.5 && x <= area.right + 0.5;
      const inY = (y) => y >= area.top - 0.5 && y <= area.bottom + 0.5;
      const lab = (text, cands, alpha, priority, optional) => {
        const w = measureLabel(ctx, th, text);
        labels.push({ text, w, h: LABEL_H, alpha, candidates: cands(w, LABEL_H), priority: priority || 0, optional: !!optional });
      };
      const firstColor = this.curves[0] ? this.curveColor(this.curves[0]) : th.colors.out;

      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left, area.top - 2, area.right - area.left, area.bottom - area.top + 4);
      ctx.clip();

      if (isNum(a.finalValue) && this.isOn('final')) {
        const y = sy.getPixelForValue(a.finalValue);
        if (inY(y)) {
          ctx.globalAlpha = a.alpha.final;
          strokeLine(ctx, area.left, y, area.right, y, ref, th.refLineWidth, th.refDash);
          ctx.globalAlpha = 1;
          lab('y∞ = ' + fmt(a.finalValue, 3), (w, h) => [
            { x: area.right - w - 6, y: y - h - 5 },
            { x: area.right - w - 6, y: y + 5 },
            { x: area.right - 2 * w - 12, y: y - h - 5 },
          ], a.alpha.final, 1);
        }
      }
      if (isNum(a.settlingTime) && this.isOn('marks')) {
        const x = sx.getPixelForValue(a.settlingTime);
        if (inX(x)) {
          ctx.globalAlpha = a.alpha.ts;
          strokeLine(ctx, x, area.bottom, x, area.top, ref, th.refLineWidth, th.refDash);
          ctx.globalAlpha = 1;
          const pct = fmt((a.band || 0.02) * 100, 3) + NBSP + '%';
          lab('ts = ' + fmtU(a.settlingTime, this.xUnit, 3) + ' (' + pct + ')', (w, h) => [
            { x: x + 6, y: area.bottom - h - 6 },
            { x: x - w - 6, y: area.bottom - h - 6 },
            { x: x + 6, y: area.bottom - 2 * h - 12 },
            { x: x - w - 6, y: area.bottom - 2 * h - 12 },
            { x: x + 6, y: area.top + 6 },
          ], a.alpha.ts, 2, true);
        }
      }
      if (a.riseTime && isNum(a.finalValue) && this.isOn('marks')) {
        const x0 = sx.getPixelForValue(a.riseTime.t10);
        const x1 = sx.getPixelForValue(a.riseTime.t90);
        const y = sy.getPixelForValue(a.finalValue * 0.5);
        if (inY(y)) {
          ctx.globalAlpha = a.alpha.rise;
          strokeLine(ctx, x0, y - 4, x0, y + 4, ref, 1.5);
          strokeLine(ctx, x1, y - 4, x1, y + 4, ref, 1.5);
          strokeLine(ctx, x0, y, x1, y, ref, 1.5);
          ctx.globalAlpha = 1;
          lab('tr = ' + fmtU(a.riseTime.t90 - a.riseTime.t10, this.xUnit, 3), (w, h) => [
            { x: x1 + 6, y: y - h / 2 },
            { x: x0 - w - 6, y: y - h / 2 },
            { x: (x0 + x1) / 2 - w / 2, y: y + 6 },
          ], a.alpha.rise, 4, true);
        }
      }
      const peakDots = [];
      if (a.peak && this.isOn('marks')) {
        const x = sx.getPixelForValue(a.peak.t);
        const y = sy.getPixelForValue(a.peak.y);
        if (inX(x) && inY(y)) {
          ctx.globalAlpha = a.alpha.peak;
          strokeLine(ctx, x, area.bottom, x, y + 6, ref, th.refLineWidth, th.refDash);
          peakDots.push({ x, y });
          ctx.globalAlpha = 1;
          const txt = a.overshootPct !== null ? 'Mp = ' + fmt(a.overshootPct, 3) + NBSP + '%' : 'pico ' + fmt(a.peak.y, 3);
          lab(txt, (w, h) => [
            { x: x - w / 2, y: y - h - 9 },
            { x: x + 9, y: y - h - 4 },
            { x: x + 9, y: y + 4 },
            { x: x - w - 9, y: y - h - 4 },
          ], a.alpha.peak, 0);
          lab('tp = ' + fmtU(a.peak.t, this.xUnit, 3), (w, h) => [
            { x: x + 6, y: area.bottom - h - 6 },
            { x: x - w - 6, y: area.bottom - h - 6 },
            { x: x + 6, y: area.bottom - 2 * h - 12 },
            { x: x - w - 6, y: area.bottom - 2 * h - 12 },
          ], a.alpha.peak, 3, true);
        }
      }
      ctx.restore();

      peakDots.forEach((p) => {
        ctx.globalAlpha = a.alpha.peak;
        dot(ctx, p.x, p.y, 4.5, firstColor, th.plotBg, 2);
        ctx.globalAlpha = 1;
      });
      const bounds = { left: area.left + 2, right: area.right - 2, top: area.top + 2, bottom: area.bottom - 2 };
      const avoid = peakDots.map((p) => ({ x: p.x - 7, y: p.y - 7, w: 14, h: 14 }));
      // Los rótulos no tapan la curva actual: en un gráfico estrecho (tableta en vertical) «tr = …» se
      // dejaba encima del valle de la respuesta. El valor sigue en la franja de métricas.
      const curves = curveObstacles(chart, area, (ds) => ds._role === 'curve');
      placeLabels(labels, bounds, avoid, curves).forEach((lb) => drawLabel(ctx, th, lb));
      chart.$labels = labels.filter((lb) => lb.rect).map((lb) => ({ text: lb.text, rect: lb.rect }));   // rótulos dibujados (pruebas)
    }

    /* ---------- hover */

    primary() {
      return this.curves.find((c) => this.isOn('c:' + c.key)) || this.curves[0] || null;
    }

    pick(si, px) {
      const chart = this.surfaces[0].chart;
      const c = this.primary();
      if (!chart || !c) return null;
      const a = chart.chartArea;
      if (px < a.left - 8 || px > a.right + 8) return null;
      const t = chart.scales.x.getValueForPixel(px);
      const i = nearestIndex(c.t, t);
      return { si: 0, i, t: c.t[i] };
    }

    rehover(hv) {
      const c = this.primary();
      if (!c) return null;
      const i = nearestIndex(c.t, hv.t);
      return { si: 0, i, t: c.t[i] };
    }

    nav(si, cmd, cur) {
      const c = this.primary();
      if (!c) return null;
      let i = cur ? nearestIndex(c.t, cur.t) : -1;
      i = cmd === 'focus' ? 0 : this.stepIndex(c.t.length, cmd, i);
      return { si: 0, i, t: c.t[i] };
    }

    valuesAt(t) {
      const rows = [];
      this.curves.forEach((c) => {
        if (!this.isOn('c:' + c.key)) return;
        const d = this.disp[c.key];
        const i = nearestIndex(c.t, t);
        rows.push({ c, y: d.points[i] ? d.points[i].y : null, ghost: false });
      });
      if (this.isOn('ghost')) {
        this.curves.forEach((c) => {
          const g = this.ghosts[c.key];
          if (!g || !this.isOn('c:' + c.key)) return;
          const y = resample(g.t, g.y, [t], [0], false)[0];
          rows.push({ c, y, ghost: true });
        });
      }
      return rows;
    }

    hoverMarks(si, chart) {
      const t = this.hover.t;
      const x = chart.scales.x.getPixelForValue(t);
      const dots = this.valuesAt(t).filter((r) => isNum(r.y)).map((r) => ({
        x,
        y: chart.scales.y.getPixelForValue(r.y),
        color: r.ghost ? withAlpha(this.curveColor(r.c), Math.max(0.6, this.th.ghostOpacity)) : this.curveColor(r.c),
      }));
      return { x, dots };
    }

    tipModel(hv) {
      const chart = this.surfaces[0].chart;
      if (!chart) return null;
      const rows = this.valuesAt(hv.t);
      const ys = rows.filter((r) => isNum(r.y) && !r.ghost).map((r) => chart.scales.y.getPixelForValue(r.y));
      return {
        title: this.xSymbol + ' = ' + fmtU(hv.t, this.xUnit),
        rows: rows.map((r) => ({
          value: isNum(r.y) ? fmt(r.y) : '—',
          label: r.ghost ? 'anterior' : r.c.label,
          ref: cssRef(r.c.token),
          kind: r.ghost ? 'ghost' : 'line',
          dash: r.c.dash || false,
        })),
        x: chart.scales.x.getPixelForValue(hv.t),
        y: ys.length ? ys[0] : (chart.chartArea.top + chart.chartArea.bottom) / 2,
      };
    }

    /* ---------- accesibilidad y datos */

    summaries() {
      const a = this.ann;
      if (!this.curves.length) return [this.title + ': sin datos todavía.'];
      const parts = [];
      if (a && isNum(a.finalValue)) parts.push('valor final ' + fmt(a.finalValue, 3));
      else parts.push('sin valor final (respuesta inestable o marginal)');
      if (a && a.peak) {
        if (a.overshootPct !== null) parts.push('sobrepaso ' + fmt(a.overshootPct, 3) + NBSP + '%');
        parts.push('tiempo de pico ' + fmtU(a.peak.t, this.xUnit, 3));
      } else if (a && a.overshootPct !== null) {
        parts.push('sin sobrepaso');
      }
      if (a && a.riseTime) parts.push('tiempo de subida ' + fmtU(a.riseTime.t90 - a.riseTime.t10, this.xUnit, 3));
      if (a && isNum(a.settlingTime)) parts.push('establecimiento ' + fmtU(a.settlingTime, this.xUnit, 3) + ' (criterio ' + fmt((a.band || 0.02) * 100, 3) + NBSP + '%)');
      return [this.title + ': ' + parts.join(', ') + '.'];
    }

    tableSpec() {
      const c0 = this.curves[0];
      const xName = this.xLabel.replace(/\s*\([^)]*\)\s*$/, '');
      const columns = [{ key: '__x', label: xName, unit: this.xUnit }].concat(this.curves.map((c) => ({ key: c.key, label: c.label, unit: '' })));
      if (!c0) return { caption: this.title, columns, rows: [] };
      const cols = this.curves.map((c) => (c.t.length === c0.t.length ? c.y : resample(c.t, c.y, c0.t, null, false)));
      const rows = c0.t.map((t, i) => {
        const row = { __x: t };
        this.curves.forEach((c, k) => { row[c.key] = cols[k][i]; });
        return row;
      });
      return { caption: this.title, columns, rows };
    }
  }

  /* ================================================================== mapa de polos y ceros */

  class PZCtl extends Ctl {
    constructor(canvas, opts) {
      super('pz', [canvas], opts);
      this.poles = [];          // destino ordenado
      this.zeros = [];
      this.dispP = [];          // { re, im, alpha }
      this.dispZ = [];
      this.range = symmetricRange(1);
      this.halfDisp = this.range.half;
      this.hasData = false;
      this.surfaces[0].create(this.config());
      this.syncLegend();
      this.refreshSummary(true);
    }

    config() {
      const th = this.th;
      return {
        type: 'scatter',
        data: { datasets: [] },
        options: baseOptions(this, 0, {
          scales: {
            x: linearAxis(th, { axis: 'x', title: 'Re(s) = σ (1/s)', min: -1, max: 1, gutter: X_GUTTER }),
            y: linearAxis(th, { axis: 'y', title: 'Im(s) = ω (rad/s)', min: -1, max: 1, gutter: Y_GUTTER }),
          },
        }),
      };
    }

    applyTheme() {
      const chart = this.surfaces[0].chart;
      if (!chart) return;
      const sc = chart.config.options.scales;
      scaleColors(sc.x, this.th);
      scaleColors(sc.y, this.th);
    }

    update(pz, uopts) {
      pz = pz || {};
      uopts = uopts || {};
      const mode = uopts.mode === 'drag' ? 'drag' : 'release';
      const P = sortRoots(pz.poles);
      const Z = sortRoots(pz.zeros);
      const first = !this.hasData;
      const plan = (from, to) => to.map((z, i) => {
        const f = from[i];
        return f ? { fr: f.re, fi: f.im, fa: f.alpha, tr: z.re, ti: z.im, appear: false } : { fr: z.re, fi: z.im, fa: 0, tr: z.re, ti: z.im, appear: true };
      });
      const pp = plan(first ? [] : this.dispP, P);
      const pzz = plan(first ? [] : this.dispZ, Z);
      const maxAbs = P.concat(Z).reduce((m, z) => Math.max(m, Math.abs(z.re), Math.abs(z.im)), 0);
      const rangeTo = symmetricRange(maxAbs);
      const halfFrom = first ? rangeTo.half : this.halfDisp;
      this.poles = P;
      this.zeros = Z;
      this.range = rangeTo;
      this.hasData = true;
      this.dispP = pp.map((q) => ({ re: q.fr, im: q.fi, alpha: q.fa }));
      this.dispZ = pzz.map((q) => ({ re: q.fr, im: q.fi, alpha: q.fa }));
      const apply = (e) => {
        const step = (plans, disp) => plans.forEach((q, i) => {
          disp[i].re = lerp(q.fr, q.tr, e);
          disp[i].im = lerp(q.fi, q.ti, e);
          disp[i].alpha = q.appear ? e : lerp(q.fa, 1, e);
        });
        step(pp, this.dispP);
        step(pzz, this.dispZ);
        this.halfDisp = lerp(halfFrom, rangeTo.half, e);
      };
      apply.tag = 'morph';
      this.cancelTweens('morph');
      if (first) this.playIntro(FADE_MS, apply);
      else this.tween(this.morphMs(mode), apply);
      this.syncLegend();
      this.refreshSummary(true);
    }

    plotSize(size) {
      const chart = this.surfaces[0].chart;
      const w = size ? size.width : chart ? chart.width : 0;
      const hgt = size ? size.height : chart ? chart.height : 0;
      // Ancho real del eje y (crece si sus rótulos lo piden): la escala 1:1 se calcula con él.
      const yw = yGutterOf(chart);
      this.yGutterUsed = yw;
      return {
        W: Math.max(10, w - PAD.left - PAD.right - yw),
        H: Math.max(10, hgt - PAD.top - PAD.bottom - X_GUTTER),
      };
    }

    render() {
      super.render();
      const c = this.surfaces[0].chart;
      // Si el eje y cambió de ancho en este repintado, se rehace una vez para mantener 1:1.
      if (c && this.alive && Math.abs(yGutterOf(c) - this.yGutterUsed) > 0.5) {
        this.applyAxes();
        c.update('none');
      }
    }

    applyAxes(size) {
      const chart = this.surfaces[0].chart;
      if (!chart) return;
      const { W, H } = this.plotSize(size);
      const half = this.halfDisp;
      const hx = W >= H ? (half * W) / H : half;
      const hy = W >= H ? half : (half * H) / W;
      const sc = chart.config.options.scales;
      sc.x.min = -hx;
      sc.x.max = hx;
      sc.y.min = -hy;
      sc.y.max = hy;
      // Paso común en ambos ejes (escala 1:1, cuadrícula cuadrada). Celdas de al menos 24 px;
      // si las etiquetas no caben, se rotula una de cada k marcas sin tocar la cuadrícula.
      // El paso nunca baja de 24 px por celda, aunque el rango cambie mucho a mitad de un morph.
      const pxPerUnit = H / (2 * hy);
      const step = Math.max(this.range.step, niceNum(24 / pxPerUnit, false));
      const every = (minPx) => [1, 2, 5, 10, 20, 50, 100].find((k) => step * pxPerUnit * k >= minPx) || 100;
      // En x se rotula una de cada k marcas para que dos rótulos (medidos) nunca se pisen.
      const kx = every(Math.max(44, this.widestTick(chart, hx, step) + 12));
      const ky = every(24);
      const label = (k) => (v, i, ticks) => (Math.abs(Math.round(v / step)) % k === 0 ? tickLabel(v, i, ticks) : '');
      sc.x.ticks.stepSize = step;
      sc.y.ticks.stepSize = step;
      sc.x.chStep = step;
      sc.y.chStep = step;
      sc.x.ticks.autoSkip = false;
      sc.y.ticks.autoSkip = false;
      sc.x.ticks.maxTicksLimit = 81;
      sc.y.ticks.maxTicksLimit = 81;
      sc.x.ticks.callback = label(kx);
      sc.y.ticks.callback = label(ky);
    }

    /** Ancho (px) del rótulo más ancho del eje x entre −lim y lim con este paso. */
    widestTick(chart, lim, step) {
      const ctx = chart && chart.ctx;
      if (!ctx || typeof ctx.measureText !== 'function' || !(step > 0)) return 0;
      const n = Math.floor(lim / step + 1e-9);
      if (n < 1) return 0;
      const vals = [-n * step, tidy((1 - n) * step), n * step];
      const ticks = vals.map((value) => ({ value }));
      let w = 0;
      ctx.save();
      setFont(ctx, this.th, 400);
      vals.forEach((v, i) => { w = Math.max(w, ctx.measureText(tickLabel(v, i, ticks)).width || 0); });
      ctx.restore();
      return Math.ceil(w);
    }

    drawUnder(si, chart, ctx) {
      const th = this.th;
      const a = chart.chartArea;
      const x0 = clamp(chart.scales.x.getPixelForValue(0), a.left, a.right);
      const y0 = clamp(chart.scales.y.getPixelForValue(0), a.top, a.bottom);
      ctx.fillStyle = th.stableRegion;
      ctx.fillRect(a.left, a.top, x0 - a.left, a.bottom - a.top);
      ctx.fillStyle = th.unstableRegion;
      ctx.fillRect(x0, a.top, a.right - x0, a.bottom - a.top);
      // Ejes por el origen: σ fino y jω destacado (frontera de estabilidad).
      strokeLine(ctx, a.left, Math.round(y0) + 0.5, a.right, Math.round(y0) + 0.5, th.axis, 1);
      strokeLine(ctx, Math.round(x0) + 0.5, a.top, Math.round(x0) + 0.5, a.bottom, withAlpha(th.muted, 0.85), 1.5);
      setFont(ctx, th, 500);
      ctx.textBaseline = 'top';
      ctx.fillStyle = th.muted;
      ctx.textAlign = 'left';
      if (x0 - a.left > 110) ctx.fillText('Región estable', a.left + 10, a.top + 8);
      ctx.textAlign = 'right';
      setFont(ctx, th, 400);
      ctx.fillStyle = th.subtle;
      if (a.right - x0 > 120) ctx.fillText('Región inestable', a.right - 10, a.top + 8);
      ctx.textAlign = 'left';
    }

    drawOver(si, chart, ctx) {
      const th = this.th;
      const sx = chart.scales.x;
      const sy = chart.scales.y;
      const r = th.markerSize / 2;
      const a = chart.chartArea;
      ctx.save();
      ctx.beginPath();
      ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top);
      ctx.clip();
      if (this.isOn('zeros')) {
        this.dispZ.forEach((z) => {
          const x = sx.getPixelForValue(z.re);
          const y = sy.getPixelForValue(z.im);
          ctx.globalAlpha = z.alpha;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.strokeStyle = th.plotBg;
          ctx.lineWidth = 5.5;
          ctx.stroke();
          ctx.strokeStyle = th.colors.zero;
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      }
      if (this.isOn('poles')) {
        this.dispP.forEach((p) => {
          const x = sx.getPixelForValue(p.re);
          const y = sy.getPixelForValue(p.im);
          ctx.globalAlpha = p.alpha;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x - r, y - r);
          ctx.lineTo(x + r, y + r);
          ctx.moveTo(x + r, y - r);
          ctx.lineTo(x - r, y + r);
          ctx.strokeStyle = th.plotBg;
          ctx.lineWidth = 6;
          ctx.stroke();
          ctx.strokeStyle = th.colors.pole;
          ctx.lineWidth = 2.25;
          ctx.stroke();
        });
      }
      ctx.globalAlpha = 1;
      // Multiplicidad: «2» junto a raíces repetidas.
      setFont(ctx, th, 600);
      ctx.fillStyle = th.ink;
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left';
      [[this.poles, this.dispP, 'poles'], [this.zeros, this.dispZ, 'zeros']].forEach(([target, disp, id]) => {
        if (!this.isOn(id)) return;
        groupRoots(target).forEach((g) => {
          if (g.count < 2 || !disp[g.start]) return;
          const x = sx.getPixelForValue(disp[g.start].re);
          const y = sy.getPixelForValue(disp[g.start].im);
          ctx.fillText(String(g.count), x + r + 3, y - r + 2);
        });
      });
      ctx.restore();
    }

    markers() {
      const out = [];
      if (this.isOn('poles')) this.dispP.forEach((p, i) => out.push({ type: 'p', i, z: p }));
      if (this.isOn('zeros')) this.dispZ.forEach((z, i) => out.push({ type: 'z', i, z }));
      return out;
    }

    pick(si, px, py) {
      const chart = this.surfaces[0].chart;
      if (!chart) return null;
      let best = null;
      let bd = HIT_PX;
      this.markers().forEach((m, j) => {
        const d = Math.hypot(chart.scales.x.getPixelForValue(m.z.re) - px, chart.scales.y.getPixelForValue(m.z.im) - py);
        if (d <= bd) { bd = d; best = j; }
      });
      return best === null ? null : { si: 0, i: best };
    }

    rehover(hv) {
      return hv.i < this.markers().length ? { si: 0, i: hv.i } : null;
    }

    nav(si, cmd, cur) {
      const n = this.markers().length;
      if (!n) return null;
      let i = cur ? cur.i : -1;
      if (cmd === 'focus') i = 0;
      else if (cmd === 'fwd' || cmd === 'next' || cmd === 'pgfwd') i = i < 0 ? 0 : (i + 1) % n;
      else if (cmd === 'back' || cmd === 'prev' || cmd === 'pgback') i = i < 0 ? n - 1 : (i - 1 + n) % n;
      else i = this.stepIndex(n, cmd, i);
      return { si: 0, i };
    }

    hoverMarks(si, chart) {
      const m = this.markers()[this.hover.i];
      if (!m) return null;
      return { x: null, dots: [], ring: { x: chart.scales.x.getPixelForValue(m.z.re), y: chart.scales.y.getPixelForValue(m.z.im) } };
    }

    drawHover(si, chart, ctx) {
      if (!this.hover) return;
      const marks = this.hoverMarks(si, chart);
      if (!marks) return;
      ctx.beginPath();
      ctx.arc(marks.ring.x, marks.ring.y, this.th.markerSize / 2 + 6, 0, Math.PI * 2);
      ctx.strokeStyle = this.th.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    describeRoot(type, z) {
      const mag = Math.hypot(z.re, z.im);
      const eps = 1e-9 * Math.max(1, mag);
      if (type === 'z') return 'cero';
      if (mag <= eps) return 'polo en el origen (integrador)';
      if (Math.abs(z.im) > eps) {
        const zeta = -z.re / mag;
        return 'ωn = ' + fmtU(mag, 'rad/s', 3) + ', ζ = ' + fmt(zeta, 3);
      }
      if (z.re < 0) return 'τ = ' + fmtU(-1 / z.re, 's', 3);
      return 'semiplano derecho: modo inestable';
    }

    tipModel(hv) {
      const chart = this.surfaces[0].chart;
      const list = this.markers();
      const m = list[hv.i];
      if (!chart || !m) return null;
      // Todas las marcas que coinciden en ese punto (raíces repetidas o polo sobre cero).
      const same = list.filter((q) => Math.hypot(q.z.re - m.z.re, q.z.im - m.z.im) <= 1e-5 * Math.max(1, Math.hypot(m.z.re, m.z.im)));
      const target = (q) => (q.type === 'p' ? this.poles[q.i] : this.zeros[q.i]) || q.z;
      const nP = same.filter((q) => q.type === 'p').length;
      const nZ = same.length - nP;
      const kind = (n, one, many) => (n === 1 ? one : n === 2 ? many + ' (doble)' : n === 3 ? many + ' (triple)' : many + ' (×' + n + ')');
      const title = [nP ? kind(nP, 'Polo', 'Polos') : '', nZ ? kind(nZ, 'Cero', 'Ceros') : ''].filter(Boolean).join(' y ');
      return {
        title,
        rows: same.map((q) => ({
          value: (q.type === 'p' ? 'p' : 'z') + (q.i + 1) + ' = ' + fmtComplex(target(q)),
          label: this.describeRoot(q.type, target(q)),
          ref: cssRef(q.type === 'p' ? '--c-pole' : '--c-zero'),
          kind: q.type === 'p' ? 'cross' : 'ring',
        })),
        x: chart.scales.x.getPixelForValue(m.z.re),
        y: chart.scales.y.getPixelForValue(m.z.im),
      };
    }

    legendItems() {
      return [
        { id: 'poles', label: 'Polos', kind: 'cross', ref: cssRef('--c-pole'), available: this.poles.length > 0 },
        { id: 'zeros', label: 'Ceros', kind: 'ring', ref: cssRef('--c-zero'), available: this.zeros.length > 0 },
      ];
    }

    onToggle() {
      if (this.hover) this.hover = null;
      this.showTips();
    }

    summaries() {
      if (!this.hasData) return [this.title + ': sin datos todavía.'];
      const list = (arr, sym) => arr.map((z, i) => sym + (i + 1) + ' = ' + fmtComplex(z)).join('; ');
      const nP = this.poles.length;
      const nZ = this.zeros.length;
      const parts = [];
      parts.push(nP ? nP + (nP === 1 ? ' polo' : ' polos') + ' (' + list(this.poles, 'p') + ')' : 'sin polos');
      parts.push(nZ ? nZ + (nZ === 1 ? ' cero' : ' ceros') + ' (' + list(this.zeros, 'z') + ')' : 'sin ceros');
      const st = classifyPoles(this.poles);
      const verdict = st === 'estable'
        ? 'Todos los polos están en el semiplano izquierdo: sistema estable.'
        : st === 'marginal'
          ? 'Hay polos simples sobre el eje jω: sistema marginalmente estable.'
          : 'Hay polos en el semiplano derecho o repetidos sobre el eje jω: sistema inestable.';
      return [this.title + ': ' + parts.join('; ') + '. ' + verdict];
    }

    tableSpec() {
      const rows = [];
      this.poles.forEach((z, i) => rows.push({ tipo: 'Polo', nombre: 'p' + (i + 1), re: z.re, im: z.im }));
      this.zeros.forEach((z, i) => rows.push({ tipo: 'Cero', nombre: 'z' + (i + 1), re: z.re, im: z.im }));
      return {
        caption: this.title,
        columns: [
          { key: 'tipo', label: 'Tipo' },
          { key: 'nombre', label: 'Nombre' },
          { key: 're', label: 'Parte real σ', unit: '1/s' },
          { key: 'im', label: 'Parte imaginaria ω', unit: 'rad/s' },
        ],
        rows,
      };
    }
  }

  /* ================================================================== diagrama de Bode */

  class BodeCtl extends Ctl {
    constructor(magCanvas, phaseCanvas, opts) {
      super('bode', [magCanvas, phaseCanvas], opts);
      this.omega = [];
      this.magTo = [];
      this.phaseTo = [];
      this.magPts = [];
      this.phasePts = [];
      this.ghost = null;
      this.lastMode = 'release';
      this.hasData = false;
      this.markerOpts = Object.assign({ minus3dB: false, crossover: false }, this.opts.markers || {});
      this.marks = [];
      this.ax = null;
      this.axDisp = null;
      this.yNeed = [0, 0];
      this.inRender = false;
      this.surfaces[0].create(this.config(0));
      this.surfaces[1].create(this.config(1));
      this.legendOutside = this.surfaces[0].frame !== this.surfaces[1].frame;
      this.syncLegend();
      this.refreshSummary(true);
    }

    config(which) {
      const th = this.th;
      const isMag = which === 0;
      const ctl = this;
      const x = linearAxis(th, { axis: 'x', title: isMag ? '' : 'Frecuencia ω (rad/s)', ticks: !isMag, gutter: isMag ? 4 : X_GUTTER });
      x.type = 'logarithmic';
      x.min = 0.01;
      x.max = 100;
      x.ticks.autoSkip = false;
      x.ticks.callback = (v, i, ticks) => (ticks[i] && ticks[i].label ? fmtDecade(v) : '');
      x.afterBuildTicks = (scale) => {
        scale.ticks = logTicks(scale.min, scale.max).map((t) => ({ value: t.value, major: t.major, label: t.label }));
      };
      x.grid.color = (c) => (c.tick && c.tick.major ? ctl.th.grid : withAlpha(ctl.th.grid, 0.5));
      const y = linearAxis(th, {
        axis: 'y',
        title: isMag ? 'Magnitud (dB)' : 'Fase (°)',
        min: isMag ? -40 : -180,
        max: isMag ? 0 : 0,
        gutter: Y_GUTTER,
        maxTicks: 7,
        tickCallback: isMag ? tickLabel : (v, i, ticks) => tickLabel(v, i, ticks) + '°',
      });
      // Las dos gráficas comparten el ancho del eje y (el mayor de los medidos): ω queda alineada.
      y.afterFit = (scale) => {
        const need = isNum(scale.width) ? Math.ceil(scale.width) : 0;
        ctl.yNeed[which] = need;
        scale.width = Math.max(Y_GUTTER, ctl.yNeed[0] || 0, ctl.yNeed[1] || 0);
      };
      return {
        type: 'line',
        data: { datasets: [] },
        options: baseOptions(this, which, {
          normalized: true,
          layout: { padding: Object.assign({}, PAD, isMag ? {} : { top: 8 }), autoPadding: false },
          scales: { x, y },
        }),
      };
    }

    applyTheme() {
      this.surfaces.forEach((s) => {
        if (!s.chart) return;
        const sc = s.chart.config.options.scales;
        scaleColors(sc.x, this.th);
        scaleColors(sc.y, this.th);
      });
      if (this.hasData) this.buildDatasets();
    }

    buildDatasets() {
      const th = this.th;
      const col = this.tokenColor(this.opts.color || '--c-out');
      const ghostSet = (pts) => ({
        label: 'Anterior',
        data: pts,
        borderColor: withAlpha(col, th.ghostOpacity),
        borderWidth: Math.max(1.5, th.lineWidth - 0.25),
        borderDash: th.refDash.slice(),
        pointRadius: 0,
        fill: false,
        hidden: !this.ghost || !this.isOn('ghost'),
        _role: 'ghost',
      });
      const curSet = (pts, label) => ({
        label,
        data: pts,
        borderColor: col,
        borderWidth: th.lineWidth,
        borderCapStyle: 'round',
        borderJoinStyle: 'round',
        pointRadius: 0,
        fill: false,
        hidden: !this.isOn('current'),
        _role: 'curve',
      });
      const g = this.ghost;
      const gm = g ? g.omega.map((w, i) => ({ x: w, y: g.mag[i] })) : [];
      const gp = g ? g.omega.map((w, i) => ({ x: w, y: g.phase[i] })) : [];
      this.surfaces[0].chart.data.datasets = [ghostSet(gm), curSet(this.magPts, '|G(jω)|')];
      this.surfaces[1].chart.data.datasets = [ghostSet(gp), curSet(this.phasePts, '∠G(jω)')];
    }

    update(bode, uopts) {
      bode = bode || {};
      uopts = uopts || {};
      const mode = uopts.mode === 'drag' ? 'drag' : 'release';
      if (uopts.markers) this.markerOpts = Object.assign({}, this.markerOpts, uopts.markers);
      const w = Array.from(bode.omega || []);
      const n = Math.min(w.length, (bode.magDb || []).length, (bode.phaseDeg || []).length);
      const omega = [];
      const mag = [];
      const phase = [];
      for (let i = 0; i < n; i++) {
        if (!(w[i] > 0) || (omega.length && w[i] <= omega[omega.length - 1])) continue;
        omega.push(w[i]);
        mag.push(isNum(bode.magDb[i]) ? bode.magDb[i] : null);
        phase.push(isNum(bode.phaseDeg[i]) ? bode.phaseDeg[i] : null);
      }
      if (omega.length < 2) return;
      const first = !this.hasData;
      if (uopts.ghost === false) this.ghost = null;
      else if (!first && this.lastMode !== 'drag') this.ghost = { omega: this.omega.slice(), mag: this.magTo.slice(), phase: this.phaseTo.slice() };
      this.lastMode = mode;

      const prevW = this.magPts.map((p) => p.x);
      const fromM = !first ? resample(prevW, this.magPts.map((p) => p.y), omega, null, true) : null;
      const fromP = !first ? resample(prevW, this.phasePts.map((p) => p.y), omega, null, true) : null;
      const pts = (old) => (old.length === omega.length ? old : omega.map((x) => ({ x, y: 0 })));
      this.magPts = pts(this.magPts);
      this.phasePts = pts(this.phasePts);
      for (let i = 0; i < omega.length; i++) { this.magPts[i].x = omega[i]; this.phasePts[i].x = omega[i]; }
      this.omega = omega;
      this.magTo = mag;
      this.phaseTo = phase;
      this.hasData = true;

      const axFrom = first ? null : this.axDisp;
      this.ax = this.computeAxes();
      this.marks = this.computeMarkers();
      this.buildDatasets();
      this.syncLegend();
      const B = this.ax;
      const apply = (e) => {
        for (let i = 0; i < omega.length; i++) {
          const m = mag[i];
          const p = phase[i];
          this.magPts[i].y = m === null ? null : fromM && isNum(fromM[i]) ? fromM[i] + (m - fromM[i]) * e : m;
          this.phasePts[i].y = p === null ? null : fromP && isNum(fromP[i]) ? fromP[i] + (p - fromP[i]) * e : p;
        }
        if (axFrom) {
          const L = (a, b) => Math.exp(lerp(Math.log(a), Math.log(b), e));
          this.axDisp = {
            wMin: L(axFrom.wMin, B.wMin), wMax: L(axFrom.wMax, B.wMax),
            mMin: lerp(axFrom.mMin, B.mMin, e), mMax: lerp(axFrom.mMax, B.mMax, e), mStep: B.mStep,
            pMin: lerp(axFrom.pMin, B.pMin, e), pMax: lerp(axFrom.pMax, B.pMax, e), pStep: B.pStep,
          };
        } else {
          this.axDisp = B;
        }
      };
      apply.tag = 'morph';
      this.cancelTweens('morph');
      if (first) {
        apply(1);
        this.playReveal();
      } else {
        this.tween(this.morphMs(mode), apply);
      }
      this.refreshSummary(true);
    }

    render() {
      this.inRender = true;
      try {
        super.render();
        const [a, b] = this.surfaces.map((s) => s.chart);
        // La magnitud se ajustó antes de medir la fase: si sus ejes y difieren, se rehace.
        if (a && b && a.chartArea && b.chartArea && Math.abs(a.chartArea.left - b.chartArea.left) > 0.5) a.update('none');
      } finally {
        this.inRender = false;
      }
    }

    afterChartUpdate(si, chart) {
      if (this.inRender || !this.alive) return;
      const other = this.surfaces[1 - si] && this.surfaces[1 - si].chart;
      if (other && other.chartArea && chart.chartArea && Math.abs(other.chartArea.left - chart.chartArea.left) > 0.5) this.invalidate();
    }

    computeAxes() {
      const range = (arrs) => {
        let lo = Infinity;
        let hi = -Infinity;
        arrs.forEach((a) => a.forEach((v) => {
          if (!isNum(v)) return;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }));
        return [lo, hi];
      };
      const g = this.ghost;
      const [m0, m1] = range([this.magTo].concat(g ? [g.mag] : []));
      const [p0, p1] = range([this.phaseTo].concat(g ? [g.phase] : []));
      const mb = niceBounds(m0, m1, { pad: 0.04, ticks: 5 });
      const pb = phaseBounds(p0, p1);
      return { wMin: this.omega[0], wMax: this.omega[this.omega.length - 1], mMin: mb.min, mMax: mb.max, mStep: mb.step, pMin: pb.min, pMax: pb.max, pStep: pb.step };
    }

    computeMarkers() {
      const out = [];
      const w = this.omega;
      const m = this.magTo;
      if (this.markerOpts.minus3dB && isNum(m[0])) {
        const wc = findCrossing(w, m, m[0] - 3, true);
        if (wc !== null) out.push({ id: 'minus3dB', omega: wc, level: m[0] - 3, text: '−3' + NBSP + 'dB: ω = ' + fmtU(wc, 'rad/s', 3) });
      }
      if (this.markerOpts.crossover) {
        const wc = findCrossing(w, m, 0, true, 0.05);
        if (wc !== null) {
          const ph = resample(w, this.phaseTo, [wc], [0], true)[0];
          out.push({ id: 'crossover', omega: wc, level: 0, phase: ph, text: '0' + NBSP + 'dB: ω = ' + fmtU(wc, 'rad/s', 3) });
        }
      }
      return out;
    }

    applyAxes() {
      const ax = this.axDisp || this.ax;
      if (!ax) return;
      this.surfaces.forEach((s, i) => {
        if (!s.chart) return;
        const sc = s.chart.config.options.scales;
        sc.x.min = ax.wMin;
        sc.x.max = ax.wMax;
        sc.y.min = i === 0 ? ax.mMin : ax.pMin;
        sc.y.max = i === 0 ? ax.mMax : ax.pMax;
        setStep(sc.y, i === 0 ? ax.mStep : ax.pStep);
        sc.y.chPhase = i === 1;
      });
    }

    drawUnder() {}

    drawOver(si, chart, ctx) {
      if (!this.marks.length) return;
      const th = this.th;
      const a = chart.chartArea;
      const sx = chart.scales.x;
      const sy = chart.scales.y;
      const labels = [];
      const dots = [];
      this.marks.forEach((mk) => {
        if (!this.isOn(mk.id)) return;
        const x = sx.getPixelForValue(mk.omega);
        if (x < a.left || x > a.right) return;
        strokeLine(ctx, x, a.top, x, a.bottom, th.colors.in, th.refLineWidth, th.refDash);
        if (si === 0) {
          const y = sy.getPixelForValue(mk.level);
          if (y >= a.top && y <= a.bottom) dots.push({ x, y });
          const w = measureLabel(ctx, th, mk.text);
          labels.push({ text: mk.text, w, h: LABEL_H, optional: labels.length > 0, candidates: [
            { x: x + 6, y: a.top + 6 }, { x: x - w - 6, y: a.top + 6 }, { x: x + 6, y: a.top + LABEL_H + 12 }, { x: x - w - 6, y: a.top + LABEL_H + 12 },
          ] });
        } else if (isNum(mk.phase)) {
          const y = sy.getPixelForValue(mk.phase);
          if (y >= a.top && y <= a.bottom) dots.push({ x, y });
          const txt = '∠G = ' + fmt(mk.phase, 4) + '°';
          const w = measureLabel(ctx, th, txt);
          labels.push({ text: txt, w, h: LABEL_H, optional: labels.length > 0, candidates: [{ x: x + 6, y: y + 6 }, { x: x + 6, y: y - LABEL_H - 6 }, { x: x - w - 6, y: y + 6 }] });
        }
      });
      const col = this.tokenColor(this.opts.color || '--c-out');
      dots.forEach((d) => dot(ctx, d.x, d.y, 4, col, th.plotBg, 2));
      const avoid = dots.map((d) => ({ x: d.x - 7, y: d.y - 7, w: 14, h: 14 }));
      const curves = curveObstacles(chart, a, (ds) => ds._role === 'curve');
      placeLabels(labels, { left: a.left + 2, right: a.right - 2, top: a.top + 2, bottom: a.bottom - 2 }, avoid, curves).forEach((lb) => drawLabel(ctx, th, lb));
      chart.$labels = labels.filter((lb) => lb.rect).map((lb) => ({ text: lb.text, rect: lb.rect }));   // rótulos dibujados (pruebas)
    }

    pick(si, px) {
      const chart = this.surfaces[si].chart;
      if (!chart || !this.omega.length) return null;
      const a = chart.chartArea;
      if (px < a.left - 8 || px > a.right + 8) return null;
      const w = chart.scales.x.getValueForPixel(px);
      const i = nearestIndex(this.omega, w);
      return { si, i };
    }

    rehover(hv) {
      return hv.i < this.omega.length ? { si: hv.si, i: hv.i } : null;
    }

    nav(si, cmd, cur) {
      const n = this.omega.length;
      if (!n) return null;
      const i = cmd === 'focus' ? 0 : this.stepIndex(n, cmd, cur ? cur.i : -1);
      return { si, i };
    }

    ghostAt(which, w) {
      const g = this.ghost;
      if (!g || !this.isOn('ghost')) return null;
      return resample(g.omega, which === 0 ? g.mag : g.phase, [w], [0], true)[0];
    }

    hoverMarks(si, chart) {
      const i = this.hover.i;
      const w = this.omega[i];
      if (!isNum(w)) return null;
      const x = chart.scales.x.getPixelForValue(w);
      const col = this.tokenColor(this.opts.color || '--c-out');
      const dots = [];
      const cur = si === 0 ? this.magPts[i] : this.phasePts[i];
      if (cur && isNum(cur.y) && this.isOn('current')) dots.push({ x, y: chart.scales.y.getPixelForValue(cur.y), color: col });
      const gv = this.ghostAt(si, w);
      if (isNum(gv)) dots.push({ x, y: chart.scales.y.getPixelForValue(gv), color: withAlpha(col, 0.6) });
      return { x, dots };
    }

    tipModel(hv) {
      const chart = this.surfaces[hv.si].chart;
      const i = hv.i;
      const w = this.omega[i];
      if (!chart || !isNum(w)) return null;
      const ref = cssRef(this.opts.color || '--c-out');
      const m = this.magPts[i] ? this.magPts[i].y : null;
      const p = this.phasePts[i] ? this.phasePts[i].y : null;
      const rows = [
        { value: isNum(m) ? fmt(m, 4) + NBSP + 'dB' : '—', label: 'magnitud', ref, kind: 'line' },
        { value: isNum(p) ? fmt(p, 4) + '°' : '—', label: 'fase', ref, kind: 'line' },
      ];
      const gm = this.ghostAt(0, w);
      const gp = this.ghostAt(1, w);
      if (isNum(gm)) rows.push({ value: fmt(gm, 4) + NBSP + 'dB', label: 'magnitud anterior', ref, kind: 'ghost' });
      if (isNum(gp)) rows.push({ value: fmt(gp, 4) + '°', label: 'fase anterior', ref, kind: 'ghost' });
      const cur = hv.si === 0 ? m : p;
      return {
        title: 'ω = ' + fmtU(w, 'rad/s', 4),
        rows,
        x: chart.scales.x.getPixelForValue(w),
        y: isNum(cur) ? chart.scales.y.getPixelForValue(cur) : (chart.chartArea.top + chart.chartArea.bottom) / 2,
      };
    }

    legendItems() {
      const ref = cssRef(this.opts.color || '--c-out');
      const items = [{ id: 'current', label: 'Actual', kind: 'line', ref }];
      if (this.opts.ghost !== false) items.push({ id: 'ghost', label: 'Anterior', kind: 'ghost', ref, available: !!this.ghost });
      if (this.markerOpts.minus3dB) items.push({ id: 'minus3dB', label: 'Ancho de banda (−3' + NBSP + 'dB)', kind: 'vline', ref: cssRef('--c-in'), available: this.marks.some((m) => m.id === 'minus3dB') });
      if (this.markerOpts.crossover) items.push({ id: 'crossover', label: 'Cruce por 0' + NBSP + 'dB', kind: 'vline', ref: cssRef('--c-in'), available: this.marks.some((m) => m.id === 'crossover') });
      return items;
    }

    onToggle() {
      if (this.hasData) this.buildDatasets();
    }

    summaries() {
      if (!this.hasData) return [this.title + ', magnitud: sin datos todavía.', this.title + ', fase: sin datos todavía.'];
      const ax = this.ax;
      const range = (arr) => {
        let lo = Infinity;
        let hi = -Infinity;
        arr.forEach((v) => { if (isNum(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
        return [lo, hi];
      };
      const [m0, m1] = range(this.magTo);
      const [p0, p1] = range(this.phaseTo);
      const span = 'de ' + fmt(ax.wMin, 3) + ' a ' + fmtU(ax.wMax, 'rad/s', 3);
      const marks = this.marks.map((m) => m.text).join('; ');
      const tail = marks ? ' ' + marks + '.' : '';
      return [
        this.title + ', magnitud ' + span + ': entre ' + fmt(m0, 3) + ' y ' + fmt(m1, 3) + NBSP + 'dB; a baja frecuencia ' + fmt(this.magTo[0], 3) + NBSP + 'dB.' + tail,
        this.title + ', fase ' + span + ': entre ' + fmt(p0, 3) + '° y ' + fmt(p1, 3) + '°.',
      ];
    }

    labelFor(i, text) {
      return text + (i === 0 ? ' (magnitud)' : ' (fase)');
    }

    tableSpec() {
      return {
        caption: this.title,
        columns: [
          { key: 'w', label: 'Frecuencia ω', unit: 'rad/s' },
          { key: 'mag', label: 'Magnitud', unit: 'dB' },
          { key: 'phase', label: 'Fase', unit: '°' },
        ],
        rows: this.omega.map((w, i) => ({ w, mag: this.magTo[i], phase: this.phaseTo[i] })),
      };
    }
  }

  /* ================================================================== gráficas XY */

  const XY_KINDS = { line: 1, points: 1, stems: 1, steps: 1, segments: 1 };

  class XYCtl extends Ctl {
    constructor(canvas, opts) {
      super('xy', [canvas], opts);
      const o = this.opts;
      this.xLabel = o.xLabel || 'x';
      this.yLabel = o.yLabel || 'y';
      this.aspect = o.aspect === 'equal' ? 'equal' : 'auto';
      this.xRange = Array.isArray(o.xRange) ? o.xRange.slice(0, 2) : null;
      this.yRange = Array.isArray(o.yRange) ? o.yRange.slice(0, 2) : null;
      this.sets = [];
      this.disp = [];
      this.ax = null;
      this.axDisp = null;
      this.hasData = false;
      this.surfaces[0].create(this.config());
      this.syncLegend();
      this.refreshSummary(true);
    }

    config() {
      const th = this.th;
      return {
        type: 'scatter',
        data: { datasets: [] },
        options: baseOptions(this, 0, {
          scales: {
            x: linearAxis(th, { axis: 'x', title: this.xLabel, min: 0, max: 1, gutter: X_GUTTER }),
            y: linearAxis(th, { axis: 'y', title: this.yLabel, min: 0, max: 1, gutter: Y_GUTTER, maxTicks: 7 }),
          },
        }),
      };
    }

    applyTheme() {
      const chart = this.surfaces[0].chart;
      if (!chart) return;
      const sc = chart.config.options.scales;
      scaleColors(sc.x, this.th);
      scaleColors(sc.y, this.th);
      if (this.hasData) this.buildDatasets();
    }

    setColor(s) {
      const c = this.tokenColor(s.token);
      return s.alpha < 1 ? withAlpha(c, s.alpha) : c;
    }

    buildDatasets() {
      const th = this.th;
      this.surfaces[0].chart.data.datasets = this.sets.map((s, k) => {
        const c = this.setColor(s);
        const pts = this.disp[k];
        const isPts = s.kind === 'points' || s.kind === 'stems';
        let data = pts;
        if (s.kind === 'segments') {
          data = [];
          for (let i = 0; i + 1 < pts.length; i += 2) {
            data.push(pts[i], pts[i + 1]);
            if (i + 2 < pts.length) data.push({ x: pts[i + 1].x, y: null });
          }
        }
        return {
          label: s.label,
          data,
          showLine: !isPts,
          stepped: s.kind === 'steps' ? 'after' : false,
          borderColor: c,
          backgroundColor: s.fill ? withAlpha(c, 0.12) : c,
          fill: s.fill ? 'origin' : false,
          borderWidth: s.kind === 'segments' ? 1.5 : th.lineWidth,
          borderDash: dashFor(s.dash, th),
          borderCapStyle: 'round',
          borderJoinStyle: 'round',
          pointRadius: isPts ? 4 : 0,
          pointBackgroundColor: c,
          pointBorderColor: th.plotBg,
          pointBorderWidth: isPts ? 2 : 0,
          pointHoverRadius: 0,
          spanGaps: false,
          tension: 0,
          hidden: !this.isOn('d:' + s.key),
        };
      });
    }

    update(datasets, uopts) {
      uopts = uopts || {};
      const mode = uopts.mode === 'drag' ? 'drag' : 'release';
      const list = (datasets || []).map((d, k) => ({
        key: String(d.key === undefined ? 'd' + k : d.key),
        label: d.label || String(d.key === undefined ? 'Serie ' + (k + 1) : d.key),
        kind: XY_KINDS[d.kind] ? d.kind : 'line',
        token: d.color || SERIES_TOKENS[Math.min(k, SERIES_TOKENS.length - 1)],
        alpha: isNum(d.alpha) ? clamp(d.alpha, 0, 1) : 1,
        dash: d.dash || false,
        fill: !!d.fill,
        endMarker: !!d.endMarker,
        points: (d.points || []).map((p) => ({ x: Number(p.x), y: isNum(p.y) ? p.y : null })).filter((p) => isNum(p.x)),
      }));
      const first = !this.hasData;
      const sameShape = !first && list.length === this.sets.length && list.every((s, k) => s.key === this.sets[k].key && s.kind === this.sets[k].kind && s.points.length === this.disp[k].length);
      const from = sameShape ? this.disp.map((pts) => pts.map((p) => ({ x: p.x, y: p.y }))) : null;
      this.sets = list;
      this.disp = list.map((s, k) => (sameShape ? this.disp[k] : s.points.map((p) => ({ x: p.x, y: p.y }))));
      this.hasData = list.length > 0;
      const axFrom = sameShape ? this.axDisp : null;
      this.ax = this.computeAxes();
      this.buildDatasets();
      this.syncLegend();
      const B = this.ax;
      const apply = (e) => {
        if (from) {
          list.forEach((s, k) => {
            const d = this.disp[k];
            for (let i = 0; i < d.length; i++) {
              const a = from[k][i];
              const b = s.points[i];
              d[i].x = lerp(a.x, b.x, e);
              d[i].y = b.y === null || a.y === null ? b.y : lerp(a.y, b.y, e);
            }
          });
        }
        this.axDisp = axFrom ? {
          xMin: lerp(axFrom.xMin, B.xMin, e), xMax: lerp(axFrom.xMax, B.xMax, e), xStep: B.xStep,
          yMin: lerp(axFrom.yMin, B.yMin, e), yMax: lerp(axFrom.yMax, B.yMax, e), yStep: B.yStep,
        } : B;
      };
      apply.tag = 'morph';
      this.cancelTweens('morph');
      if (sameShape) {
        this.tween(this.morphMs(mode), apply);
      } else {
        apply(1);
        if (first) {
          this.playReveal();
        } else {
          this.invalidate();
        }
      }
      this.refreshSummary(true);
    }

    /**
     * Cambia el marco x fijo ([min, max]; null vuelve al automático) sin rehacer la gráfica, de modo
     * que un panel «Ver datos» abierto sigue abierto. Los ejes se interpolan como en update(); un
     * update() inmediato continúa desde el marco mostrado.
     */
    setXRange(r) {
      const a = Array.isArray(r) ? Number(r[0]) : NaN;
      const b = Array.isArray(r) ? Number(r[1]) : NaN;
      const next = isNum(a) && isNum(b) && b > a ? [a, b] : null;
      const cur = this.xRange;
      if ((next === null && cur === null) || (next && cur && next[0] === cur[0] && next[1] === cur[1])) return;
      this.xRange = next;
      if (!this.hasData) return;
      const axFrom = this.axDisp;
      this.ax = this.computeAxes();
      const B = this.ax;
      const apply = (e) => {
        this.axDisp = axFrom ? {
          xMin: lerp(axFrom.xMin, B.xMin, e), xMax: lerp(axFrom.xMax, B.xMax, e), xStep: B.xStep,
          yMin: lerp(axFrom.yMin, B.yMin, e), yMax: lerp(axFrom.yMax, B.yMax, e), yStep: B.yStep,
        } : B;
      };
      apply.tag = 'morph';
      this.cancelTweens('morph');
      if (axFrom) this.tween(this.morphMs('release'), apply);
      else { apply(1); this.invalidate(); }
    }

    plotSize(size) {
      const chart = this.surfaces[0].chart;
      const w = size ? size.width : chart ? chart.width : 0;
      const hgt = size ? size.height : chart ? chart.height : 0;
      const yw = yGutterOf(chart);
      this.yGutterUsed = yw;
      return { W: Math.max(10, w - PAD.left - PAD.right - yw), H: Math.max(10, hgt - PAD.top - PAD.bottom - X_GUTTER) };
    }

    render() {
      super.render();
      const c = this.surfaces[0].chart;
      // Aspecto 1:1: si el eje y cambió de ancho en este repintado, se rehace una vez.
      if (c && this.alive && this.aspect === 'equal' && this.hasData && isNum(this.yGutterUsed) && Math.abs(yGutterOf(c) - this.yGutterUsed) > 0.5) {
        this.ax = this.computeAxes();
        if (!this.tweens.length) this.axDisp = this.ax;
        this.applyAxes();
        c.update('none');
      }
    }

    computeAxes(size) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      this.sets.forEach((s) => {
        if (!this.isOn('d:' + s.key)) return;
        s.points.forEach((p) => {
          if (p.x < x0) x0 = p.x;
          if (p.x > x1) x1 = p.x;
          if (p.y === null) return;
          if (p.y < y0) y0 = p.y;
          if (p.y > y1) y1 = p.y;
        });
        if (s.kind === 'stems') { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
      });
      // Muestras discretas (tallos, puntos): margen propio para que la primera y la última no queden sobre el borde.
      let discrete = false;
      let integerX = true;
      this.sets.forEach((s) => {
        if (!this.isOn('d:' + s.key) || (s.kind !== 'stems' && s.kind !== 'points')) return;
        discrete = true;
        s.points.forEach((p) => { if (Math.abs(p.x - Math.round(p.x)) > 1e-9) integerX = false; });
      });
      let xb;
      if (this.xRange) {
        xb = { min: this.xRange[0], max: this.xRange[1], step: niceNum((this.xRange[1] - this.xRange[0]) / 5, true) };
      } else if (discrete && isFinite(x0) && isFinite(x1)) {
        const span = x1 - x0;
        const pad = span > 0 ? Math.max(span * 0.03, integerX ? 0.6 : 0) : 1;
        xb = { min: x0 - pad, max: x1 + pad, step: span > 0 ? Math.max(integerX ? 1 : 0, niceNum(span / 6, true)) : 1 };
      } else {
        xb = niceBounds(x0, x1, { pad: 0.04 });
      }
      let yb = this.yRange ? { min: this.yRange[0], max: this.yRange[1], step: niceNum((this.yRange[1] - this.yRange[0]) / 5, true) } : niceBounds(y0, y1, { pad: 0.06 });
      if (this.aspect === 'equal') {
        const { W, H } = this.plotSize(size);
        const ux = (xb.max - xb.min) / W;
        const uy = (yb.max - yb.min) / H;
        const step = Math.max(xb.step, yb.step);
        if (ux > uy) {
          const c = (yb.min + yb.max) / 2;
          const half = (ux * H) / 2;
          yb = { min: c - half, max: c + half, step };
          xb = Object.assign({}, xb, { step });
        } else {
          const c = (xb.min + xb.max) / 2;
          const half = (uy * W) / 2;
          xb = { min: c - half, max: c + half, step };
          yb = Object.assign({}, yb, { step });
        }
      }
      return { xMin: xb.min, xMax: xb.max, xStep: xb.step, yMin: yb.min, yMax: yb.max, yStep: yb.step };
    }

    applyAxes(size) {
      const chart = this.surfaces[0].chart;
      if (!chart) return;
      if (size && this.aspect === 'equal' && this.hasData) {
        this.ax = this.computeAxes(size);
        if (!this.tweens.length) this.axDisp = this.ax;
      }
      const ax = this.axDisp || this.ax;
      if (!ax) return;
      const sc = chart.config.options.scales;
      sc.x.min = ax.xMin;
      sc.x.max = ax.xMax;
      setStep(sc.x, ax.xStep);
      sc.y.min = ax.yMin;
      sc.y.max = ax.yMax;
      setStep(sc.y, ax.yStep);
    }

    drawUnder(si, chart, ctx) {
      const sx = chart.scales.x;
      const sy = chart.scales.y;
      const a = chart.chartArea;
      this.sets.forEach((s, k) => {
        if (s.kind !== 'stems' || !this.isOn('d:' + s.key)) return;
        const base = sy.getPixelForValue(clamp(0, sy.min, sy.max));
        const c = this.setColor(s);
        this.disp[k].forEach((p) => {
          if (p.y === null) return;
          const x = sx.getPixelForValue(p.x);
          if (x < a.left || x > a.right) return;
          strokeLine(ctx, x, base, x, clamp(sy.getPixelForValue(p.y), a.top, a.bottom), c, 1.5);
        });
      });
    }

    drawOver(si, chart, ctx) {
      const sx = chart.scales.x;
      const sy = chart.scales.y;
      this.sets.forEach((s, k) => {
        if (!s.endMarker || !this.isOn('d:' + s.key)) return;
        const pts = this.disp[k];
        const p = pts[pts.length - 1];
        if (!p || p.y === null) return;
        dot(ctx, sx.getPixelForValue(p.x), sy.getPixelForValue(p.y), 4.5, this.setColor(s), this.th.plotBg, 2);
      });
    }

    flat() {
      const out = [];
      this.sets.forEach((s, k) => {
        if (!this.isOn('d:' + s.key)) return;
        this.disp[k].forEach((p, i) => { if (p.y !== null) out.push({ k, i }); });
      });
      return out;
    }

    pick(si, px, py) {
      const chart = this.surfaces[0].chart;
      if (!chart) return null;
      let best = null;
      let bd = 24;
      this.sets.forEach((s, k) => {
        if (!this.isOn('d:' + s.key)) return;
        this.disp[k].forEach((p, i) => {
          if (p.y === null) return;
          const d = Math.hypot(chart.scales.x.getPixelForValue(p.x) - px, chart.scales.y.getPixelForValue(p.y) - py);
          if (d < bd) { bd = d; best = { si: 0, i: k, j: i }; }
        });
      });
      return best;
    }

    rehover(hv) {
      const pts = this.disp[hv.i];
      return pts && hv.j < pts.length ? hv : null;
    }

    nav(si, cmd, cur) {
      const list = this.flat();
      if (!list.length) return null;
      let idx = cur ? list.findIndex((q) => q.k === cur.i && q.i === cur.j) : -1;
      idx = cmd === 'focus' ? 0 : this.stepIndex(list.length, cmd, idx);
      return { si: 0, i: list[idx].k, j: list[idx].i };
    }

    hoverMarks(si, chart) {
      const s = this.sets[this.hover.i];
      const p = this.disp[this.hover.i] && this.disp[this.hover.i][this.hover.j];
      if (!s || !p || p.y === null) return null;
      return { x: null, dots: [{ x: chart.scales.x.getPixelForValue(p.x), y: chart.scales.y.getPixelForValue(p.y), color: this.setColor(s) }] };
    }

    tipModel(hv) {
      const chart = this.surfaces[0].chart;
      const s = this.sets[hv.i];
      const p = this.disp[hv.i] && this.disp[hv.i][hv.j];
      if (!chart || !s || !p) return null;
      const name = (lbl) => lbl.replace(/\s*\([^)]*\)\s*$/, '');
      const unit = (lbl) => { const m = /\(([^)]*)\)\s*$/.exec(lbl); return m ? m[1] : ''; };
      return {
        title: s.label,
        rows: [
          { value: fmtU(p.x, unit(this.xLabel)), label: name(this.xLabel), ref: cssRef(s.token), kind: s.kind === 'points' || s.kind === 'stems' ? 'points' : 'line' },
          { value: p.y === null ? '—' : fmtU(p.y, unit(this.yLabel)), label: name(this.yLabel), ref: cssRef(s.token), kind: s.kind === 'points' || s.kind === 'stems' ? 'points' : 'line' },
        ],
        x: chart.scales.x.getPixelForValue(p.x),
        y: p.y === null ? chart.chartArea.top : chart.scales.y.getPixelForValue(p.y),
      };
    }

    legendItems() {
      if (this.sets.length < 2) return [];
      return this.sets.map((s) => ({
        id: 'd:' + s.key,
        label: s.label,
        kind: s.kind === 'points' ? 'points' : s.kind === 'stems' ? 'stems' : 'line',
        ref: cssRef(s.token),
        dash: s.dash || false,
      }));
    }

    onToggle() {
      if (this.hasData) {
        this.ax = this.computeAxes();
        this.axDisp = this.ax;
        this.buildDatasets();
      }
    }

    summaries() {
      if (!this.hasData) return [this.title + ': sin datos todavía.'];
      const parts = this.sets.map((s) => s.label + ' (' + s.points.length + (s.points.length === 1 ? ' punto' : ' puntos') + ')');
      const ax = this.ax;
      return [this.title + ': ' + parts.join(', ') + '. Eje horizontal ' + this.xLabel + ' de ' + fmt(ax.xMin, 3) + ' a ' + fmt(ax.xMax, 3) + '; eje vertical ' + this.yLabel + ' de ' + fmt(ax.yMin, 3) + ' a ' + fmt(ax.yMax, 3) + '.'];
    }

    tableSpec() {
      const rows = [];
      this.sets.forEach((s) => s.points.forEach((p) => rows.push({ serie: s.label, x: p.x, y: p.y })));
      const unit = (lbl) => { const m = /\(([^)]*)\)\s*$/.exec(lbl); return m ? m[1] : ''; };
      const name = (lbl) => lbl.replace(/\s*\([^)]*\)\s*$/, '');
      return {
        caption: this.title,
        columns: [{ key: 'serie', label: 'Serie' }, { key: 'x', label: name(this.xLabel), unit: unit(this.xLabel) }, { key: 'y', label: name(this.yLabel), unit: unit(this.yLabel) }],
        rows,
      };
    }
  }

  /* ================================================================== tabla «Ver datos» */

  /**
   * Tabla accesible de datos. spec: { caption, columns: [{ key, label, unit, digits }], rows, maxRows = 200 }.
   * Con más filas que maxRows se muestrea de forma uniforme (y la leyenda lo dice). Si se da
   * container, reemplaza su contenido. Devuelve el HTMLTableElement.
   */
  /**
   * Filas que se muestran. Si las filas tienen una columna de serie (spec.groupKey o la primera
   * columna de texto, con 2 a 12 valores distintos), el muestreo es por serie: una serie con ≤ 60
   * filas se conserva entera y el resto del presupuesto se reparte entre las densas (de la más
   * corta a la más larga, cada una a lo sumo su tamaño). Si no, muestreo uniforme.
   * Devuelve { idx (índices crecientes), groups: [{ name, shown, total }] | null }.
   */
  function sampleRows(rows, cols, maxRows, groupKey) {
    const n = rows.length;
    let key = groupKey || null;
    if (!key) {
      for (let j = 0; j < cols.length && !key; j++) {
        if (rows.some((r) => r && typeof r[cols[j].key] === 'string')) key = cols[j].key;
      }
    }
    if (!key || n <= maxRows) {
      return { idx: sampleIndices(n, maxRows), groups: null };
    }
    const order = [];
    const byName = new Map();
    rows.forEach((r, i) => {
      const v = r ? r[key] : undefined;
      const name = v === null || v === undefined ? '' : String(v);
      let g = byName.get(name);
      if (!g) {
        g = { name, rows: [] };
        byName.set(name, g);
        order.push(g);
      }
      g.rows.push(i);
    });
    if (order.length < 2 || (!groupKey && order.length > TABLE_MAX_GROUPS)) {
      return { idx: sampleIndices(n, maxRows), groups: null };
    }
    const take = new Map();
    const small = order.filter((g) => g.rows.length <= TABLE_SMALL_SERIES);
    const smallSum = small.reduce((a, g) => a + g.rows.length, 0);
    // Reparto «por llenado»: de la serie más corta a la más larga, cada una recibe a lo sumo su parte.
    const fill = (list, budget) => {
      const sorted = list.slice().sort((a, b) => a.rows.length - b.rows.length || order.indexOf(a) - order.indexOf(b));
      let left = budget;
      sorted.forEach((g, i) => {
        const share = Math.floor(left / (sorted.length - i));
        const k = Math.min(g.rows.length, Math.max(share, Math.min(g.rows.length, 2)));
        take.set(g, k);
        left -= k;
      });
    };
    if (smallSum <= maxRows) {
      small.forEach((g) => take.set(g, g.rows.length));
      fill(order.filter((g) => g.rows.length > TABLE_SMALL_SERIES), maxRows - smallSum);
    } else {
      fill(order, maxRows);
    }
    const idx = [];
    order.forEach((g) => {
      const k = take.get(g) || 0;
      if (k <= 0) return;
      const local = k === 1 ? [0] : sampleIndices(g.rows.length, k);
      local.forEach((j) => idx.push(g.rows[j]));
    });
    idx.sort((a, b) => a - b);
    return { idx, groups: order.map((g) => ({ name: g.name, shown: Math.min(take.get(g) || 0, g.rows.length), total: g.rows.length })) };
  }

  function dataTable(container, spec) {
    spec = spec || {};
    const h = util.h;
    const cols = spec.columns || [];
    const rows = spec.rows || [];
    const maxRows = spec.maxRows > 0 ? spec.maxRows : 200;
    const pick = sampleRows(rows, cols, maxRows, spec.groupKey);
    const idx = pick.idx;
    let caption = spec.caption || 'Datos de la gráfica';
    if (idx.length < rows.length) {
      if (pick.groups) {
        caption += ' · se muestran ' + idx.length + ' de ' + rows.length + ' filas (muestreo por serie: ' +
          pick.groups.map((g) => (g.name || 'sin nombre') + ' ' + g.shown + ' de ' + g.total).join('; ') + ')';
      } else {
        caption += ' · se muestran ' + idx.length + ' de ' + rows.length + ' filas (muestreo uniforme)';
      }
    }
    const isText = cols.map((c) => rows.some((r) => typeof r[c.key] === 'string'));
    const head = h('tr', null, cols.map((c, j) => h('th', {
      scope: 'col',
      class: isText[j] ? 'is-text' : null,
      text: (c.label || c.key) + (c.unit ? ' (' + c.unit + ')' : ''),
    })));
    const body = idx.map((ri) => {
      const r = rows[ri] || {};
      return h('tr', null, cols.map((c, j) => {
        const v = r[c.key];
        const text = typeof v === 'number' ? util.formatNumber(v, c.digits || 4) : v === null || v === undefined ? '—' : String(v);
        return h(j === 0 ? 'th' : 'td', { scope: j === 0 ? 'row' : null, class: isText[j] ? 'is-text' : null, text });
      }));
    });
    const table = h('table', { class: 'ch-table' },
      h('caption', { text: caption }),
      h('thead', null, head),
      h('tbody', null, body));
    if (rows.length === 0) {
      table.appendChild(h('tfoot', null, h('tr', null, h('td', { colspan: String(Math.max(1, cols.length)), class: 'is-text', text: 'Todavía no hay datos: ejecute la simulación o cambie un parámetro.' }))));
    }
    if (container) container.replaceChildren(table);
    return table;
  }

  /**
   * Botón «Ver datos» / «Ocultar datos» con su panel de tabla para un handle de gráfica.
   * opts: { container, label = 'Ver datos', hideLabel = 'Ocultar datos', spec: () => tableSpec }.
   * Sin container, se inserta justo después del marco (el último, en Bode).
   */
  function dataToggle(handle, opts) {
    opts = opts || {};
    const h = util.h;
    const panelId = util.uid('ch-data');
    const labelOpen = opts.label || 'Ver datos';
    const labelClose = opts.hideLabel || 'Ocultar datos';
    const tid = opts.testid || (handle && handle.testid) || '';
    const text = h('span', { class: 'ch-data__label', text: labelOpen });
    const btn = h('button', {
      type: 'button',
      class: 'ch-data__toggle',
      'aria-expanded': 'false',
      'aria-controls': panelId,
      dataset: tid ? { testid: tid + '-data-toggle' } : null,
    }, iconEl('table'), text);
    const panel = h('div', {
      class: 'ch-data__panel',
      id: panelId,
      role: 'region',
      tabindex: '0',
      'aria-label': 'Datos de la gráfica',
      hidden: true,
      dataset: tid ? { testid: tid + '-data' } : null,
    });
    const root = h('div', { class: 'ch-data' }, btn, panel);
    let open = false;
    const spec = () => (typeof opts.spec === 'function' ? opts.spec() : handle && handle.tableSpec ? handle.tableSpec() : {});
    const owner = handle ? CTL_OF.get(handle) : null;
    const api = {
      el: root,
      button: btn,
      panel,
      /**
       * Rehace la tabla con los datos actuales (solo si está abierta). Conserva el desplazamiento
       * del panel y el foco; si el contenido no cambió, no toca el DOM.
       */
      refresh() {
        if (!open) return;
        const s = spec();
        const label = 'Datos: ' + (s.caption || 'gráfica');
        const table = dataTable(null, s);
        const old = panel.firstChild;
        if (old && old.textContent === table.textContent) {
          if (panel.getAttribute('aria-label') !== label) panel.setAttribute('aria-label', label);
          return;
        }
        const top = panel.scrollTop || 0;
        const left = panel.scrollLeft || 0;
        const doc = panel.ownerDocument || (typeof document !== 'undefined' ? document : null);
        const active = doc ? doc.activeElement : null;
        const hadFocus = !!active && active !== panel && typeof panel.contains === 'function' && panel.contains(active);
        panel.replaceChildren(table);
        panel.setAttribute('aria-label', label);
        if (top) panel.scrollTop = top;
        if (left) panel.scrollLeft = left;
        if (hadFocus && typeof panel.focus === 'function') {
          try { panel.focus({ preventScroll: true }); } catch (e) { panel.focus(); }
        }
      },
      open() {
        if (open) return;
        open = true;
        panel.hidden = false;
        panel.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
        text.textContent = labelClose;
        api.refresh();
      },
      close() {
        if (!open) return;
        open = false;
        panel.hidden = true;
        panel.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', 'false');
        text.textContent = labelOpen;
        panel.replaceChildren();
      },
      toggle() {
        if (open) api.close();
        else api.open();
      },
      isOpen: () => open,
      destroy() {
        btn.removeEventListener('click', api.toggle);
        if (owner) owner.toggles.delete(api);
        root.remove();
      },
    };
    btn.addEventListener('click', api.toggle);
    // La tabla abierta sigue a los datos de su gráfica (también con un spec propio).
    if (owner && owner.alive) owner.toggles.add(api);
    const anchor = handle && handle.frames ? handle.frames[handle.frames.length - 1] : handle && handle.frame;
    if (opts.container) opts.container.appendChild(root);
    else if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(root, anchor.nextSibling);
    return api;
  }

  /* ================================================================== handles y fábricas */

  const METHODS = {
    time: ['push', 'pushMany', 'setData', 'setSeries', 'setWindow', 'setYRange', 'clear', 'resize', 'describe', 'tableSpec', 'destroy'],
    step: ['update', 'clearGhost', 'resize', 'describe', 'tableSpec', 'destroy'],
    pz: ['update', 'resize', 'describe', 'tableSpec', 'destroy'],
    bode: ['update', 'resize', 'describe', 'tableSpec', 'destroy'],
    xy: ['update', 'setXRange', 'resize', 'describe', 'tableSpec', 'destroy'],
  };

  let warnedNoChart = false;

  function inertHandle(kind, canvases, opts) {
    if (!warnedNoChart && typeof console !== 'undefined') {
      warnedNoChart = true;
      console.warn('[charts] Chart.js no está cargado: las gráficas quedan inertes.');
    }
    const noop = function () {};
    const handle = { chart: null, inert: true, frame: canvases[0] && canvases[0].parentNode || null, testid: '' };
    METHODS[kind].forEach((m) => { handle[m] = noop; });
    handle.flush = noop;
    handle.tableSpec = () => ({ caption: (opts && opts.ariaLabel) || DEFAULT_TITLES[kind], columns: [], rows: [] });
    handle.stats = () => ({ updates: 0, pushes: 0, points: 0, tweening: false, reveal: 1, introPending: false });
    handle.frames = handle.frame ? [handle.frame] : [];
    if (kind === 'bode') handle.charts = [];
    canvases.forEach((c) => {
      if (c && opts && opts.ariaLabel) {
        c.setAttribute('role', 'img');
        c.setAttribute('aria-label', opts.ariaLabel);
      }
    });
    return handle;
  }

  /** Métodos que cambian los datos: tras ellos, las tablas «Ver datos» abiertas se refrescan. */
  const DATA_METHODS = { update: 1, setData: 1, setSeries: 1, push: 1, pushMany: 1, clear: 1, setWindow: 1, setYRange: 1 };
  const CTL_OF = new WeakMap();

  function makeHandle(ctl) {
    const handle = {};
    CTL_OF.set(handle, ctl);
    METHODS[ctl.kind].forEach((name) => {
      handle[name] = function () {
        if (!ctl.alive) return undefined;
        if (name === 'resize') {
          ctl.surfaces.forEach((s) => { if (s.chart) s.chart.resize(); });
          return undefined;
        }
        const out = ctl[name].apply(ctl, arguments);
        if (DATA_METHODS[name]) ctl.scheduleTables();
        return out;
      };
    });
    /** Dibuja ya el estado final pendiente de esta gráfica (también fuera de pantalla). */
    handle.flush = () => { if (ctl.alive) ctl.flushPending(); };
    handle.stats = () => ({
      updates: ctl.stats.updates,
      pushes: ctl.stats.pushes,
      points: ctl.kind === 'time' && ctl.data[0] ? ctl.data[0].length : 0,
      tweening: ctl.tweens.length > 0,
      reveal: ctl.reveal,
      introPending: !!ctl.intro,
    });
    Object.defineProperty(handle, 'chart', { enumerable: true, get: () => (ctl.alive ? ctl.surfaces[0].chart : null) });
    Object.defineProperty(handle, 'frame', { enumerable: true, get: () => ctl.surfaces[0].frame });
    Object.defineProperty(handle, 'frames', { enumerable: true, get: () => ctl.surfaces.map((s) => s.frame) });
    Object.defineProperty(handle, 'testid', { enumerable: true, get: () => ctl.testid });
    Object.defineProperty(handle, 'alive', { enumerable: true, get: () => ctl.alive });
    if (ctl.kind === 'bode') {
      Object.defineProperty(handle, 'charts', { enumerable: true, get: () => (ctl.alive ? ctl.surfaces.map((s) => s.chart) : []) });
    }
    if (ctl.opts.dataToggle) {
      ctl.dataToggle = dataToggle(handle, ctl.opts.dataToggle.nodeType === 1 ? { container: ctl.opts.dataToggle } : {});
    }
    // Repintado al terminar de cargar las fuentes (las medidas de texto cambian).
    if (typeof document !== 'undefined' && document.fonts && document.fonts.status === 'loading' && document.fonts.ready) {
      document.fonts.ready.then(() => { if (ctl.alive) ctl.invalidate(); }, () => {});
    }
    return handle;
  }

  function factory(kind, Klass, canvases, opts) {
    if (!chartLib()) return inertHandle(kind, canvases, opts || {});
    applyDefaults();
    const ctl = kind === 'bode' ? new Klass(canvases[0], canvases[1], opts || {}) : new Klass(canvases[0], opts || {});
    return makeHandle(ctl);
  }

  DSL.viz.charts = {
    theme,
    color,
    applyDefaults,
    /** Serie temporal en tiempo real (push eficiente, ventana deslizante, ~30 fps). */
    createTimeChart: (canvas, opts) => factory('time', TimeCtl, [canvas], opts),
    /** Respuesta al escalón con morph, fantasma y anotaciones (y∞, ±2 %, pico, tp, ts, tr). */
    createStepChart: (canvas, opts) => factory('step', StepCtl, [canvas], opts),
    /** Plano s 1:1: polos ×, ceros ○, semiplano estable sombreado, movimiento animado. */
    createPoleZeroChart: (canvas, opts) => factory('pz', PZCtl, [canvas], opts),
    /** Bode: magnitud (dB) y fase (°) apiladas sobre ω logarítmica compartida. */
    createBodeChart: (magCanvas, phaseCanvas, opts) => factory('bode', BodeCtl, [magCanvas, phaseCanvas], opts),
    /** Retratos de fase, telarañas (segments), tallos discretos (stems), escalones y puntos. */
    createXYChart: (canvas, opts) => factory('xy', XYCtl, [canvas], opts),
    dataTable,
    dataToggle,
    /** Dibuja ya el estado final de todas las gráficas (también las de fuera de pantalla). */
    flush: flushAll,
    /** Auxiliares puros, expuestos para las pruebas unitarias. */
    helpers: {
      parseColor, withAlpha, tokenName, niceNum, niceBounds, phaseBounds, symmetricRange, logTicks, fmtDecade,
      resample, sampleIndices, findCrossing, sortRoots, groupRoots, classifyPoles, fmtComplex, placeLabels, curveObstacles,
      normalizeAnnotations, lerpAnnotations, easeOutCubic, nearestIndex, liveCount: () => live.size,
      anchoredTicks, tickLabel, compactNumber, keyDash, sampleRows,
    },
  };
})(window.DSL);
