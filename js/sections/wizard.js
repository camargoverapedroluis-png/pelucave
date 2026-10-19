/*
 * js/sections/wizard.js — Propietario: wizard.
 * Sección #modelado: asistente animado de 4 pasos para modelar un sistema (Delimitar → Aplicar leyes →
 * Formular → Simular y validar) sobre un ejemplo en curso: masa-resorte, circuito RLC, tanque o SIR.
 * Los contenidos salen de model.wizard (DSL.systems); los diagramas SVG son propios de esta sección.
 * API: docs/api/wizard.md. DSL.sections.wizard = { mount(el) → handle, helpers }.
 */
(function (DSL) {
  'use strict';

  var util = DSL.util;
  var h = util.h;
  var S = util.svg;
  var NB = ' ';
  var MINUS = '−';
  var THIN = ' ';

  // Dependencias que se cargan después de este archivo o que pueden faltar: acceso perezoso.
  function UI() { return DSL.ui || {}; }
  function SYS() { return DSL.systems; }
  function CH() { return DSL.viz && DSL.viz.charts; }
  function LX() { return DSL.core && DSL.core.latex; }

  /* ================================================================== textos fijos */

  var STEPS = [
    {
      id: 'delimitar', title: 'Delimitar el sistema', short: 'Delimitar el sistema',
      intro: 'Antes de escribir una ecuación hay que decidir qué se modela. La frontera separa el sistema de su entorno: las entradas la cruzan hacia dentro (fuerzas, voltajes, flujos), las salidas son lo que se observa (velocidad, nivel, temperatura…) y el entorno actúa sin que se modele.'
    },
    {
      id: 'leyes', title: 'Aplicar leyes físicas o principios de conservación', short: 'Aplicar leyes',
      intro: 'Cada parte del sistema obedece una ley conocida: la segunda ley de Newton en mecánica, las leyes de Kirchhoff en circuitos, los balances de masa y energía cuando algo se acumula, o un balance de población en una epidemia. Se escribe cada ley por separado y se señala dónde actúa.'
    },
    {
      id: 'formular', title: 'Formular el modelo matemático', short: 'Formular el modelo',
      intro: 'Al sustituir unas leyes en otras solo quedan las variables de estado, sus derivadas y la entrada. La ecuación se ensambla término a término y cada término conserva su origen físico.'
    },
    {
      id: 'simular', title: 'Simular y validar', short: 'Simular y validar',
      intro: 'El modelo se integra con un método numérico y se compara con mediciones. Ajuste el parámetro hasta que la simulación pase por los datos: el error no puede bajar del ruido de las propias medidas.'
    }
  ];

  var EXAMPLES = [
    { id: 'massSpring', label: 'Masa-resorte', icon: 'activity' },
    { id: 'rlc', label: 'Circuito RLC', icon: 'zap' },
    { id: 'tanks', label: 'Tanque', icon: 'droplets' },
    { id: 'sir', label: 'Epidemia SIR', icon: 'virus' }
  ];

  var GROUPS = [
    { key: 'input', field: 'inputs', title: 'Entradas', hint: 'Cruzan la frontera hacia dentro.' },
    { key: 'output', field: 'outputs', title: 'Salidas', hint: 'Lo que se observa o se mide.' },
    { key: 'element', field: 'elements', title: 'Elementos del sistema', hint: 'Lo que se modela por dentro.' },
    { key: 'env', field: 'environment', title: 'Entorno', hint: 'Actúa sobre el sistema, pero no se modela.' }
  ];

  var COPY = {
    massSpring: {
      name: 'sistema masa-resorte-amortiguador',
      boundary: 'Dentro de la frontera quedan la masa, el resorte y el amortiguador. Fuera quedan la pared que los sujeta, el suelo y el agente que empuja. La fuerza F(t) cruza la frontera hacia dentro; la posición y la velocidad son lo que se mide.',
      lawsTitle: 'Diagrama de cuerpo libre de la masa',
      lawsCaption: 'Se aísla la masa y se dibujan las fuerzas que actúan sobre ella, con x > 0 y ẋ > 0: el resorte y el amortiguador empujan hacia la izquierda. El peso y la normal se anulan entre sí y no intervienen en el movimiento horizontal.',
      linear: 'Cada término es un coeficiente constante por x, ẋ, ẍ o F(t). Vale la superposición, y la transformada de Laplace da la función de transferencia X(s)/F(s).',
      state: 'El sistema recuerda dónde está la masa y a qué velocidad se mueve: x y v = ẋ son las variables de estado. La EDO de segundo orden se convierte en dos ecuaciones de primer orden.'
    },
    rlc: {
      name: 'circuito RLC serie',
      boundary: 'Dentro de la frontera quedan la resistencia, el inductor y el capacitor de la malla. Fuera quedan la fuente ideal, que impone v(t), los conductores y la temperatura ambiente. Se observan la tensión del capacitor y la corriente.',
      lawsTitle: 'Recorrido de la malla con la ley de Kirchhoff',
      lawsCaption: 'Se recorre la malla en el sentido de la corriente: la tensión de la fuente se reparte entre la resistencia, el inductor y el capacitor. Los signos + y − marcan la polaridad de cada caída.',
      linear: 'R, L y C son constantes, así que cada componente es proporcional a i, a di/dt o a dv_C/dt. La ecuación es lineal y tiene función de transferencia V_C(s)/V(s).',
      state: 'El inductor recuerda su corriente y el capacitor su carga: i y v_C son las variables de estado. Cada elemento que almacena energía aporta una.'
    },
    tanks: {
      name: 'depósito con salida lineal',
      boundary: 'Dentro de la frontera quedan el depósito, el líquido que contiene y la válvula de salida. Fuera quedan la red que impone el caudal de entrada, la atmósfera y el desagüe. Se observan el nivel y el caudal que sale.',
      lawsTitle: 'Balance de masa en el depósito',
      lawsCaption: 'El volumen de control es el líquido del depósito: lo que se acumula por unidad de tiempo es lo que entra menos lo que sale.',
      linear: 'Con una válvula lineal, q_out = h/R, todos los términos son proporcionales a h, a ḣ o a q_in. Con una descarga de Torricelli, q_out crece con √h y el modelo dejaría de ser lineal.',
      state: 'El depósito recuerda cuánto líquido guarda: el nivel h es la única variable de estado. Un solo almacenamiento da una EDO de primer orden.'
    },
    sir: {
      name: 'modelo epidémico SIR',
      boundary: 'Dentro de la frontera quedan los tres grupos de la población y los flujos que los conectan. Fuera quedan las medidas de distanciamiento y los casos con que empieza el brote, que actúan como entradas, y las hipótesis sobre la población. Se observan los tres grupos.',
      lawsTitle: 'Stocks, flujos y lazos de realimentación',
      lawsCaption: 'Arriba, los stocks (rectángulos) y los flujos (válvulas) entre ellos; las flechas discontinuas indican de qué depende cada flujo. Abajo, el diagrama causal: cada flecha lleva su polaridad y cada lazo su tipo, R de refuerzo o B de equilibrio.',
      linear: 'El flujo de contagio βSI/N multiplica dos estados. No vale la superposición: con el doble de casos iniciales la epidemia no es el doble de grande. No existe una G(s) global; el modelo se estudia simulando o linealizando cerca de un equilibrio.',
      state: 'El estado son los tres stocks S, I y R. La forma de espacio de estados sigue existiendo, pero como una función no lineal f(x, u) y no como matrices constantes.'
    }
  };

  /* ================================================================== utilidades puras */

  function r2(x) { return Math.round(x * 100) / 100; }
  function clampInt(i, lo, hi) { i = Math.round(Number(i) || 0); return i < lo ? lo : i > hi ? hi : i; }
  function stepLabel(i, n) { return 'Paso ' + (i + 1) + ' de ' + n; }

  var GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', zeta: 'ζ', theta: 'θ', tau: 'τ',
    omega: 'ω', sigma: 'σ', mu: 'μ', infty: '∞', cdot: '·', times: '×', pm: '±', le: '≤', ge: '≥', Sigma: 'Σ'
  };
  var UPRIGHT_CMD = { infty: 1, cdot: 1, times: 1, pm: 1, le: 1, ge: 1, Delta: 1, Sigma: 1 };
  var DOT1 = { x: 'ẋ', h: 'ḣ', y: 'ẏ' };
  var DOT2 = { x: 'ẍ' };

  function readGroup(src, j) {
    if (src.charAt(j) === '{') {
      var depth = 1;
      var k = j + 1;
      while (k < src.length && depth) {
        if (src.charAt(k) === '{') depth++;
        else if (src.charAt(k) === '}') depth--;
        k++;
      }
      return { body: src.slice(j + 1, depth ? k : k - 1), end: k };
    }
    if (src.charAt(j) === '\\') {
      var m = /^\\([A-Za-z]+|.)/.exec(src.slice(j));
      if (m) return { body: m[0], end: j + m[0].length };
    }
    return { body: src.charAt(j), end: j + 1 };
  }

  /**
   * Convierte un subconjunto de TeX (letras, griegas, sub/superíndices, \dot, \frac, \text, espacios)
   * en tramos para <text>/<tspan> de SVG: [{ text, italic, script: null|'sub'|'sup' }].
   * Las letras van en cursiva como en KaTeX; el signo menos es tipográfico.
   */
  function texRuns(src) {
    var out = [];
    function lastChar() {
      for (var i = out.length - 1; i >= 0; i--) {
        var t = out[i].text.replace(/\s+$/, '');
        if (t) return t.charAt(t.length - 1);
      }
      return '';
    }
    function push(text, italic, script) {
      if (!text) return;
      var last = out[out.length - 1];
      if (last && last.italic === italic && last.script === script) last.text += text;
      else out.push({ text: text, italic: italic, script: script });
    }
    function walk(s, script) {
      var j = 0;
      while (j < s.length) {
        var c = s.charAt(j);
        if (c === '\\') {
          var m = /^\\([A-Za-z]+|.)/.exec(s.slice(j)) || ['\\', ''];
          var name = m[1];
          j += m[0].length;
          if (name === 'dot' || name === 'ddot') {
            var g = readGroup(s, j);
            j = g.end;
            var base = plainText(g.body);
            var map = name === 'dot' ? DOT1 : DOT2;
            push(map[base] || base + (name === 'dot' ? '̇' : '̈'), true, script);
          } else if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
            var a = readGroup(s, j);
            var b = readGroup(s, a.end);
            j = b.end;
            walk(a.body, script);
            push('/', false, script);
            walk(b.body, script);
          } else if (name === 'text' || name === 'mathrm' || name === 'mathbf') {
            var t = readGroup(s, j);
            j = t.end;
            push(t.body, name === 'mathbf', script);
          } else if (name === ',' || name === ';' || name === ' ' || name === 'quad' || name === ':') {
            push(THIN, false, script);
          } else if (name === '!' || name === 'left' || name === 'right' || name === 'displaystyle') {
            // sin efecto en texto plano
          } else if (Object.prototype.hasOwnProperty.call(GREEK, name)) {
            push(GREEK[name], !UPRIGHT_CMD[name], script);
          } else {
            push(name, false, script);
          }
        } else if (c === '_' || c === '^') {
          var gg = readGroup(s, j + 1);
          j = gg.end;
          walk(gg.body, c === '_' ? 'sub' : 'sup');
        } else if (c === '{' || c === '}' || c === ' ') {
          j++;
        } else if (/[A-Za-z]/.test(c)) {
          push(c, true, script);
          j++;
        } else if (c === '=') {
          push(THIN + '=' + THIN, false, script);
          j++;
        } else if (c === '+') {
          push(THIN + '+' + THIN, false, script);
          j++;
        } else if (c === '-') {
          var prev = lastChar();
          var unary = !prev || prev === '(' || prev === '=' || prev === ',';
          push(unary ? MINUS : THIN + MINUS + THIN, false, script);
          j++;
        } else {
          push(c, false, script);
          j++;
        }
      }
    }
    walk(String(src === null || src === undefined ? '' : src), null);
    return out;
  }

  /** Texto plano (Unicode) de un símbolo TeX sencillo: '\\beta' → 'β', 'v_C' → 'vC'. */
  function plainText(src) {
    return texRuns(src).map(function (r) { return r.text; }).join('');
  }

  /**
   * Lectura en texto plano de una expresión para un nombre accesible: el espacio fino entre factores
   * pasa a «·» y los operadores quedan entre espacios normales ('m\\,\\ddot{x}' → 'm·ẍ').
   */
  function texReading(src) {
    return plainText(src)
      .replace(/ *([=+−]) +/g, ' $1 ')
      .replace(/ +/g, '·')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Envuelve cada aparición de los flujos dentro de una fila TeX con \htmlClass (resaltado de SIR). */
  function wrapFlows(rowTex, flows) {
    var out = String(rowTex);
    (flows || []).forEach(function (f) {
      if (!f || !f.tex) return;
      out = out.split(f.tex).join('\\htmlClass{wz-flow wz-flow--' + f.id + '}{' + f.tex + '}');
    });
    return out;
  }

  /** Interpolación lineal en una malla creciente (admite tiempos repetidos en saltos de la entrada). */
  function interpAt(xs, ys, x) {
    var n = xs.length;
    if (!n) return NaN;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    var lo = 0;
    var hi = n - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid; else hi = mid;
    }
    var x0 = xs[lo];
    var x1 = xs[hi];
    if (x1 === x0) return ys[hi];
    return ys[lo] + (ys[hi] - ys[lo]) * (x - x0) / (x1 - x0);
  }

  /** n puntos {x, y} equiespaciados en [t0, t1] (forma fija: la gráfica puede transformarse sin saltos). */
  function resample(xs, ys, n, t0, t1) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var x = n === 1 ? t0 : t0 + (t1 - t0) * i / (n - 1);
      out.push({ x: x, y: interpAt(xs, ys, x) });
    }
    return out;
  }

  function rmseOf(a, b) {
    var n = Math.min(a.length, b.length);
    if (!n) return NaN;
    var s = 0;
    for (var i = 0; i < n; i++) {
      var d = a[i] - b[i];
      s += d * d;
    }
    return Math.sqrt(s / n);
  }

  /** Clasifica el ajuste por el cociente RMSE/σ: 'ruido' (≤ 1.25), 'cerca' (≤ 3), 'lejos', 'fallo' (no finito). */
  function verdict(rmse, sigma) {
    if (!(isFinite(rmse)) || !(sigma > 0)) return { level: 'fallo', tone: 'danger', ratio: NaN };
    var r = rmse / sigma;
    if (r <= 1.25) return { level: 'ruido', tone: 'success', ratio: r };
    if (r <= 3) return { level: 'cerca', tone: 'warning', ratio: r };
    return { level: 'lejos', tone: 'info', ratio: r };
  }

  /** Paso de integración legible: en milisegundos si es menor que 10 ms. */
  function dtText(dt, unit) {
    if (unit === 's' && dt < 0.01) return util.formatNumber(dt * 1000, 3) + NB + 'ms';
    return util.formatNumber(dt, 3) + NB + unit;
  }

  function msFromToken(name, fallback) {
    var v = util.cssVar(name);
    var m = /^(-?[\d.]+)(ms|s)$/.exec(v);
    if (!m) return fallback;
    return m[2] === 's' ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
  }

  /* ================================================================== KaTeX */

  function trustHtmlClass(ctx) { return ctx.command === '\\htmlClass'; }

  function renderTex(el, src, display) {
    var k = window.katex;
    if (k && typeof k.render === 'function') {
      try {
        k.render(String(src), el, {
          displayMode: !!display, throwOnError: false, strict: 'ignore',
          output: 'htmlAndMathml', trust: trustHtmlClass
        });
        el.classList.remove('tex-fallback');
        return true;
      } catch (err) { /* cae al texto plano */ }
    }
    var clean = String(src).replace(/\\htmlClass\{[^}]*\}/g, '');
    var lx = LX();
    if (lx && typeof lx.render === 'function') return lx.render(el, clean, { display: !!display });
    el.textContent = clean;
    return false;
  }

  function texEl(tag, cls, src, display, props) {
    var e = h(tag, Object.assign({ class: cls, translate: 'no' }, props || {}));
    renderTex(e, src, display);
    return e;
  }

  /* ================================================================== kit SVG */

  function add(parent) {
    for (var i = 1; i < arguments.length; i++) {
      var c = arguments[i];
      if (Array.isArray(c)) {
        for (var j = 0; j < c.length; j++) add(parent, c[j]);
      } else if (c) {
        parent.appendChild(c);
      }
    }
    return parent;
  }

  function svgRoot(w, hh, label) {
    return S('svg', {
      viewBox: '0 0 ' + w + ' ' + hh, class: 'wz-dg', role: 'img', 'aria-label': label,
      focusable: 'false', preserveAspectRatio: 'xMidYMid meet'
    });
  }

  /** Parte resaltable: g.wz-part[data-refs="tipo:id …"]. La primera referencia es la principal. */
  function P(refs, cls) {
    var g = S('g', { class: ['wz-part', cls], 'data-refs': refs });
    return add.apply(null, [g].concat(Array.prototype.slice.call(arguments, 2)));
  }
  function G(cls) {
    var g = S('g', { class: cls });
    return add.apply(null, [g].concat(Array.prototype.slice.call(arguments, 1)));
  }
  function ln(x1, y1, x2, y2, cls) {
    return S('line', { x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), class: cls || 'wz-ln' });
  }
  function pth(d, cls) { return S('path', { d: d, class: cls || 'wz-ln' }); }
  function box(x, y, w, hh, cls, rx) {
    return S('rect', { x: r2(x), y: r2(y), width: r2(w), height: r2(hh), rx: rx || 0, class: cls });
  }
  function dot(cx, cy, r, cls) { return S('circle', { cx: r2(cx), cy: r2(cy), r: r, class: cls }); }
  function txt(x, y, s, cls, anchor) {
    return S('text', { x: r2(x), y: r2(y), class: cls || 'wz-tx', 'text-anchor': anchor || 'middle' }, s);
  }
  function mth(x, y, src, cls, anchor) {
    var t = S('text', { x: r2(x), y: r2(y), class: ['wz-math', cls], 'text-anchor': anchor || 'middle' });
    texRuns(src).forEach(function (run) {
      t.appendChild(S('tspan', {
        class: run.italic ? 'wz-it' : null,
        'baseline-shift': run.script === 'sub' ? 'sub' : run.script === 'sup' ? 'super' : null,
        'font-size': run.script ? '72%' : null
      }, run.text));
    });
    return t;
  }

  /**
   * Rótulo «Frontera del sistema» sobre una placa opaca del color del área de trazado: el contraste
   * no depende de lo que haya debajo (líquido, rayados, trazos). La placa no se atenúa con el resaltado.
   */
  var BD_LABEL = 'Frontera del sistema';
  var BD_LABEL_W = 162;   // ancho del rótulo a 15 px seminegrita (146 unidades medidas) más 8 de margen por lado
  function bdLabel(x, y, anchor) {
    var x0 = anchor === 'start' ? x - 8 : anchor === 'end' ? x - BD_LABEL_W + 8 : x - BD_LABEL_W / 2;
    return [box(x0, y - 17, BD_LABEL_W, 23, 'wz-tag', 5), txt(x, y, BD_LABEL, 'wz-tx wz-tx--bd', anchor)];
  }

  function headPath(x2, y2, ux, uy, hl, hw) {
    var bx = x2 - ux * hl;
    var by = y2 - uy * hl;
    return 'M' + r2(x2) + ' ' + r2(y2) + 'L' + r2(bx - uy * hw) + ' ' + r2(by + ux * hw) +
      'L' + r2(bx + uy * hw) + ' ' + r2(by - ux * hw) + 'Z';
  }

  /** Flecha recta (línea + punta rellena). opts: { head, half, both }. */
  function arrow(x1, y1, x2, y2, cls, opts) {
    opts = opts || {};
    var hl = opts.head || 10;
    var hw = opts.half || 5;
    var dx = x2 - x1;
    var dy = y2 - y1;
    var L = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / L;
    var uy = dy / L;
    var g = S('g', { class: ['wz-a', cls] });
    var sx = opts.both ? x1 + ux * (hl - 1) : x1;
    var sy = opts.both ? y1 + uy * (hl - 1) : y1;
    add(g, ln(sx, sy, x2 - ux * (hl - 1), y2 - uy * (hl - 1), 'wz-a__ln'), pth(headPath(x2, y2, ux, uy, hl, hw), 'wz-a__hd'));
    if (opts.both) add(g, pth(headPath(x1, y1, -ux, -uy, hl, hw), 'wz-a__hd'));
    return g;
  }

  /** Flecha curva (Bézier cuadrática) con punta en el extremo final. */
  function curve(x1, y1, cx, cy, x2, y2, cls, opts) {
    opts = opts || {};
    var hl = opts.head || 9;
    var hw = opts.half || 4.5;
    var dx = x2 - cx;
    var dy = y2 - cy;
    var L = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / L;
    var uy = dy / L;
    var bx = x2 - ux * (hl - 1);
    var by = y2 - uy * (hl - 1);
    return G(['wz-a', cls].join(' '),
      pth('M' + r2(x1) + ' ' + r2(y1) + 'Q' + r2(cx) + ' ' + r2(cy) + ' ' + r2(bx) + ' ' + r2(by), 'wz-a__ln'),
      pth(headPath(x2, y2, ux, uy, hl, hw), 'wz-a__hd'));
  }

  /** Resorte o resistencia en zigzag: tramos rectos de `lead` en cada extremo. */
  function zigPath(x1, x2, y, half, amp, lead) {
    var a = x1 + lead;
    var b = x2 - lead;
    var seg = (b - a) / half;
    var d = 'M' + r2(x1) + ' ' + r2(y) + 'H' + r2(a);
    for (var i = 0; i < half; i++) d += 'L' + r2(a + seg * (i + 0.5)) + ' ' + r2(y + (i % 2 ? amp : -amp));
    return d + 'L' + r2(b) + ' ' + r2(y) + 'H' + r2(x2);
  }

  /** Bobina: n semicircunferencias por encima del conductor. */
  function coilPath(x1, x2, y, n) {
    var r = (x2 - x1) / (2 * n);
    var d = 'M' + r2(x1) + ' ' + r2(y);
    for (var i = 0; i < n; i++) d += 'a' + r2(r) + ' ' + r2(r) + ' 0 0 1 ' + r2(2 * r) + ' 0';
    return d;
  }

  function hatchBelow(x1, x2, y, step, len) {
    var d = '';
    for (var x = x1 + len; x <= x2; x += step) d += 'M' + r2(x) + ' ' + r2(y) + 'l' + r2(-len * 0.8) + ' ' + r2(len);
    return pth(d, 'wz-hatch');
  }

  /** Rayado a 45° dentro de un rectángulo (pared fija). */
  function hatchRect(x, y, w, hh, step) {
    var d = '';
    for (var k = step; k < hh + w; k += step) {
      var y0 = y + k;
      var t0 = Math.max(0, y0 - (y + hh));
      var t1 = Math.min(w, y0 - y);
      if (t1 <= t0) continue;
      d += 'M' + r2(x + t0) + ' ' + r2(y0 - t0) + 'L' + r2(x + t1) + ' ' + r2(y0 - t1);
    }
    return G('wz-wall', box(x, y, w, hh, 'wz-wall__bg'), pth(d, 'wz-hatch'));
  }

  function damper(x1, x2, y) {
    var c0 = x1 + 64;
    var c1 = c0 + 82;
    var pis = c1 - 26;
    return G('wz-damper',
      ln(x1, y, c0, y, 'wz-ln wz-ln--el'),
      box(c0, y - 17, c1 - c0, 34, 'wz-fluid'),
      pth('M' + c1 + ' ' + (y - 17) + 'H' + c0 + 'V' + (y + 17) + 'H' + c1, 'wz-ln wz-ln--el'),
      ln(pis, y - 12, pis, y + 12, 'wz-ln wz-ln--el wz-ln--thick'),
      ln(pis, y, x2, y, 'wz-ln wz-ln--el'));
  }

  function pipe(d) {
    return G('wz-pipe', pth(d, 'wz-pipe__o'), pth(d, 'wz-pipe__i'));
  }

  function valve(cx, cy, s) {
    return pth('M' + (cx - s) + ' ' + (cy - s * 0.8) + 'L' + (cx + s) + ' ' + (cy + s * 0.8) + 'V' + (cy - s * 0.8) +
      'L' + (cx - s) + ' ' + (cy + s * 0.8) + 'Z', 'wz-valve');
  }

  /** Tubería horizontal de flujo (stocks y flujos) con punta en el destino. */
  function flowPipe(x1, x2, y) {
    return G('wz-flowpipe', pipe('M' + x1 + ' ' + y + 'H' + (x2 - 9)), pth(headPath(x2, y, 1, 0, 11, 8), 'wz-flowpipe__hd'));
  }

  function stock(x, y, sym, name, w, hh) {
    w = w || 100;
    hh = hh || 70;
    return G('wz-stock', box(x, y, w, hh, 'wz-shape wz-stock__box', 6),
      mth(x + w / 2, y + hh / 2 - 1, sym, 'wz-sym wz-sym--lg'),
      txt(x + w / 2, y + hh - 12, name, 'wz-tx wz-tx--sm'));
  }

  function plates(x, y1, y2) {
    return G('wz-cap', ln(x - 20, y1, x + 20, y1, 'wz-ln wz-ln--plate'), ln(x - 20, y2, x + 20, y2, 'wz-ln wz-ln--plate'));
  }

  function source(cx, cy, r) {
    return G('wz-source', dot(cx, cy, r, 'wz-shape wz-shape--src'),
      txt(cx, cy - 6, '+', 'wz-sign'), txt(cx, cy + 16, MINUS, 'wz-sign'));
  }

  /** Lazo circular en sentido horario (recorrido de la malla). */
  function loopArrow(cx, cy, r) {
    var a0 = -150 * Math.PI / 180;
    var a1 = 120 * Math.PI / 180;
    var sx = cx + r * Math.cos(a0);
    var sy = cy + r * Math.sin(a0);
    var ex = cx + r * Math.cos(a1);
    var ey = cy + r * Math.sin(a1);
    var tx = -Math.sin(a1);
    var ty = Math.cos(a1);
    return G('wz-a wz-a--loop',
      pth('M' + r2(sx) + ' ' + r2(sy) + 'A' + r + ' ' + r + ' 0 1 1 ' + r2(ex) + ' ' + r2(ey), 'wz-a__ln'),
      pth(headPath(ex + tx * 6, ey + ty * 6, tx, ty, 11, 5.5), 'wz-a__hd'));
  }

  /* ================================================================== diagramas por ejemplo */

  // ---------------------------------------------------------------- masa-resorte-amortiguador
  function msBoundary() {
    var root = svgRoot(640, 380, 'Frontera del sistema masa-resorte-amortiguador: entradas, salidas, elementos y entorno');
    return add(root,
      P('boundary', 'wz-bdp', box(80, 62, 362, 254, 'wz-bd', 16), bdLabel(84, 340, 'start')),
      P('env:suelo', 'wz-env', ln(24, 298, 616, 298, 'wz-ln wz-ln--env'), hatchBelow(24, 616, 298, 16, 10),
        txt(616, 336, 'Suelo', 'wz-tx wz-tx--env', 'end')),
      P('env:pared', 'wz-env', hatchRect(34, 108, 26, 190, 13), ln(60, 108, 60, 298, 'wz-ln wz-ln--env'),
        txt(46, 96, 'Pared', 'wz-tx wz-tx--env')),
      P('element:resorte', 'wz-elm', pth(zigPath(60, 300, 162, 16, 13, 18), 'wz-ln wz-ln--el'), mth(180, 136, 'k', 'wz-sym')),
      P('element:amortiguador', 'wz-elm', damper(60, 300, 240), mth(166, 282, 'b', 'wz-sym')),
      P('element:masa', 'wz-elm', box(300, 126, 120, 146, 'wz-shape', 8), dot(332, 285, 12, 'wz-wheel'),
        dot(388, 285, 12, 'wz-wheel'), mth(360, 210, 'm', 'wz-sym wz-sym--lg')),
      P('env:agente', 'wz-env', box(522, 170, 96, 60, 'wz-shape wz-shape--env', 10),
        txt(570, 196, 'Agente', 'wz-tx wz-tx--env'), txt(570, 214, 'externo', 'wz-tx wz-tx--env')),
      P('input:F', 'wz-in', arrow(520, 200, 422, 200, 'wz-a--in'), mth(476, 186, 'F(t)', 'wz-sym wz-sym--in')),
      P('output:x', 'wz-out', dot(336, 126, 4, 'wz-tap'), arrow(336, 122, 336, 40, 'wz-a--out'), mth(336, 28, 'x(t)', 'wz-sym wz-sym--out')),
      P('output:v', 'wz-out', dot(392, 126, 4, 'wz-tap'), arrow(392, 122, 392, 40, 'wz-a--out'), mth(392, 28, 'v(t)', 'wz-sym wz-sym--out')));
  }

  function msLaws() {
    var root = svgRoot(640, 380, 'Diagrama de cuerpo libre de la masa: fuerza aplicada, fuerza del resorte y fuerza del amortiguador');
    return [{
      svg: add(root,
        G('wz-base',
          arrow(40, 52, 108, 52, 'wz-a--axis', { head: 8, half: 4 }), mth(116, 57, '+x', 'wz-sym wz-sym--sm', 'start'),
          arrow(340, 262, 340, 338, 'wz-a--muted'), mth(350, 332, 'm\\,g', 'wz-sym wz-sym--muted', 'start'),
          arrow(300, 340, 300, 264, 'wz-a--muted'), mth(290, 332, 'N', 'wz-sym wz-sym--muted', 'end')),
        P('law:newton', 'wz-elm', box(250, 130, 140, 130, 'wz-shape', 8), mth(320, 206, 'm', 'wz-sym wz-sym--lg')),
        P('law:newton', 'wz-acc', arrow(276, 110, 364, 110, 'wz-a--dash'), mth(372, 116, '\\ddot{x}', 'wz-sym', 'start')),
        P('law:newton input:F', 'wz-in', arrow(392, 176, 548, 176, 'wz-a--in wz-a--force'), mth(470, 160, 'F(t)', 'wz-sym wz-sym--in')),
        P('law:hooke law:newton', 'wz-force', arrow(248, 170, 102, 170, 'wz-a--force'), mth(176, 154, 'F_k = -k\\,x', 'wz-sym')),
        P('law:viscoso law:newton', 'wz-force', arrow(248, 222, 118, 222, 'wz-a--force'), mth(184, 250, 'F_b = -b\\,\\dot{x}', 'wz-sym')))
    }];
  }

  // ---------------------------------------------------------------- circuito RLC
  var RLC_WIRES = 'M70 164V90H214M290 90H342M442 90H520V170M520 186V290H70V216';

  function rlcBoundary() {
    var root = svgRoot(640, 380, 'Frontera del circuito RLC serie: entradas, salidas, elementos y entorno');
    return add(root,
      P('boundary', 'wz-bdp', box(140, 50, 420, 272, 'wz-bd', 16), bdLabel(144, 344, 'start')),
      P('env:cables', 'wz-env', pth(RLC_WIRES, 'wz-ln wz-ln--wire')),
      P('env:fuente', 'wz-env', source(70, 190, 26), txt(70, 244, 'Fuente', 'wz-tx wz-tx--env'), txt(70, 262, 'ideal', 'wz-tx wz-tx--env')),
      P('element:resistencia', 'wz-elm', pth(zigPath(214, 290, 90, 6, 10, 4), 'wz-ln wz-ln--el'), mth(252, 66, 'R', 'wz-sym')),
      P('element:inductor', 'wz-elm', pth(coilPath(342, 442, 90, 4), 'wz-ln wz-ln--el'), mth(392, 60, 'L', 'wz-sym')),
      P('element:capacitor', 'wz-elm', plates(520, 170, 186), mth(490, 184, 'C', 'wz-sym', 'end')),
      P('env:temperatura', 'wz-env', txt(560, 32, 'Temperatura constante', 'wz-tx wz-tx--env', 'end')),
      P('input:v', 'wz-in', arrow(102, 190, 176, 190, 'wz-a--in'), mth(122, 176, 'v(t)', 'wz-sym wz-sym--in')),
      P('output:vC', 'wz-out', dot(540, 178, 4, 'wz-tap'), arrow(544, 178, 614, 178, 'wz-a--out'), mth(592, 164, 'v_C(t)', 'wz-sym wz-sym--out')),
      P('output:i', 'wz-out', dot(320, 290, 4, 'wz-tap'), arrow(320, 294, 320, 358, 'wz-a--out'), mth(332, 354, 'i(t)', 'wz-sym wz-sym--out', 'start')));
  }

  function rlcLaws() {
    var root = svgRoot(640, 380, 'Malla del circuito RLC con las caídas de tensión de cada elemento y el sentido de recorrido');
    return [{
      svg: add(root,
        G('wz-base', pth(RLC_WIRES, 'wz-ln wz-ln--wire')),
        P('law:kvl input:v', 'wz-elm', source(70, 190, 26), mth(36, 196, 'v(t)', 'wz-sym wz-sym--in', 'end')),
        P('law:ohm law:kvl', 'wz-elm', pth(zigPath(214, 290, 90, 6, 10, 4), 'wz-ln wz-ln--el'), mth(252, 66, 'R', 'wz-sym'),
          txt(214, 122, '+', 'wz-sign'), txt(290, 122, MINUS, 'wz-sign'), mth(252, 126, 'v_R', 'wz-sym wz-sym--drop')),
        P('law:inductor law:kvl', 'wz-elm', pth(coilPath(342, 442, 90, 4), 'wz-ln wz-ln--el'), mth(392, 60, 'L', 'wz-sym'),
          txt(342, 122, '+', 'wz-sign'), txt(442, 122, MINUS, 'wz-sign'), mth(392, 126, 'v_L', 'wz-sym wz-sym--drop')),
        P('law:capacitor law:kvl', 'wz-elm', plates(520, 170, 186), mth(490, 184, 'C', 'wz-sym', 'end'),
          txt(556, 162, '+', 'wz-sign'), txt(556, 206, MINUS, 'wz-sign'), mth(566, 186, 'v_C', 'wz-sym wz-sym--drop', 'start')),
        P('law:kvl', 'wz-loopp', loopArrow(330, 190, 54), txt(330, 196, 'KVL', 'wz-tx wz-tx--loop')),
        P('law:kvl law:ohm law:inductor law:capacitor', 'wz-cur', arrow(118, 90, 190, 90, 'wz-a--cur'), mth(152, 74, 'i(t)', 'wz-sym wz-sym--out')))
    }];
  }

  // ---------------------------------------------------------------- depósito lineal
  function tankBase(inRefs) {
    return [
      P(inRefs[0], 'wz-env', pipe('M20 44H246V64')),
      P(inRefs[1], 'wz-env', pth('M556 330V356H626V330', 'wz-ln wz-ln--env'), txt(591, 374, 'Desagüe', 'wz-tx wz-tx--env'))
    ];
  }

  function tankBoundary() {
    var root = svgRoot(640, 380, 'Frontera del depósito con salida lineal: entradas, salidas, elementos y entorno');
    return add(root,
      P('boundary', 'wz-bdp', box(180, 92, 340, 230, 'wz-bd', 16), bdLabel(184, 344, 'start')),
      tankBase(['env:suministro', 'env:desague']),
      P('env:suministro', 'wz-env', txt(20, 26, 'Red de suministro', 'wz-tx wz-tx--env', 'start')),
      P('env:atmosfera', 'wz-env', txt(624, 34, 'Atmósfera a presión constante', 'wz-tx wz-tx--env', 'end'),
        arrow(560, 46, 560, 76, 'wz-a--env', { head: 7, half: 3.5 }), arrow(588, 46, 588, 76, 'wz-a--env', { head: 7, half: 3.5 }),
        arrow(616, 46, 616, 76, 'wz-a--env', { head: 7, half: 3.5 })),
      P('element:liquido', 'wz-elm', box(212, 196, 216, 102, 'wz-liq'), ln(212, 196, 428, 196, 'wz-surf'), mth(336, 262, 'V = A\\,h', 'wz-sym')),
      P('element:deposito', 'wz-elm', pth('M210 116V300H430V116', 'wz-ln wz-ln--el wz-ln--wall'), mth(418, 142, 'A', 'wz-sym', 'end')),
      P('element:valvula', 'wz-elm', pipe('M430 290H520'), valve(474, 290, 10), ln(474, 282, 474, 266, 'wz-ln wz-ln--el'),
        ln(464, 266, 484, 266, 'wz-ln wz-ln--el'), mth(474, 254, 'R', 'wz-sym')),
      P('input:qin', 'wz-in', box(240, 66, 12, 130, 'wz-liq wz-liq--stream'), arrow(272, 64, 272, 150, 'wz-a--in'),
        mth(282, 106, 'q_{in}(t)', 'wz-sym wz-sym--in', 'start')),
      // «h» va sobre el líquido: la placa de los rótulos sobre el fluido de las escenas (SCN-02), opaca
      // del color del área de trazado y con filete del color del rótulo, mantiene su contraste ≥ 4.5:1
      // con o sin resaltado y en ambos temas (auditoría, ronda 2).
      P('output:h', 'wz-out', arrow(226, 298, 226, 198, 'wz-a--dim', { both: true, head: 7, half: 3.5 }), box(231, 233, 22, 25, 'wz-tag wz-tag--fluid', 4),
        mth(236, 252, 'h', 'wz-sym wz-sym--out', 'start'),
        dot(428, 196, 4, 'wz-tap'), arrow(432, 196, 604, 196, 'wz-a--out'), mth(588, 182, 'h(t)', 'wz-sym wz-sym--out')),
      P('output:qout', 'wz-out', pipe('M520 290H548'), pth('M549 290Q578 292 586 344', 'wz-jet'), arrow(494, 290, 556, 290, 'wz-a--out'),
        mth(560, 272, 'q_{out}(t)', 'wz-sym wz-sym--out')));
  }

  function tankLaws() {
    var root = svgRoot(640, 380, 'Balance de masa en el depósito: caudal que entra, caudal que sale y acumulación');
    return [{
      svg: add(root,
        G('wz-base', pth('M210 116V300H430V116', 'wz-ln wz-ln--el wz-ln--wall'), box(212, 196, 216, 102, 'wz-liq'), ln(212, 196, 428, 196, 'wz-surf')),
        tankBase(['law:masa', 'law:masa']),
        P('law:masa', 'wz-cvp', box(202, 186, 236, 122, 'wz-cv', 8), txt(320, 330, 'Volumen de control', 'wz-tx wz-tx--bd')),
        P('law:masa input:qin', 'wz-in', box(240, 66, 12, 130, 'wz-liq wz-liq--stream'), arrow(272, 64, 272, 150, 'wz-a--in'),
          mth(282, 106, 'q_{in}', 'wz-sym wz-sym--in', 'start')),
        P('law:masa', 'wz-acc', arrow(404, 238, 404, 164, 'wz-a--dash'), mth(394, 158, '\\frac{dV}{dt} = A\\,\\dot{h}', 'wz-sym', 'end')),
        P('law:geometria', 'wz-geo', arrow(226, 298, 226, 198, 'wz-a--dim', { both: true, head: 7, half: 3.5 }), mth(236, 252, 'h', 'wz-sym', 'start'),
          mth(198, 132, 'A', 'wz-sym', 'end'), mth(330, 270, 'V = A\\,h', 'wz-sym')),
        P('law:valvula law:masa', 'wz-out', pipe('M430 290H548'), valve(474, 290, 10), ln(474, 282, 474, 266, 'wz-ln wz-ln--el'),
          ln(464, 266, 484, 266, 'wz-ln wz-ln--el'), mth(474, 254, 'R', 'wz-sym'), pth('M549 290Q578 292 586 344', 'wz-jet'),
          arrow(494, 290, 556, 290, 'wz-a--out'), mth(632, 262, 'q_{out} = h/R', 'wz-sym wz-sym--out', 'end')))
    }];
  }

  // ---------------------------------------------------------------- epidemia SIR
  // Stocks de 116 × 76: S, I y R alineados; las válvulas quedan en el centro de cada tubería.
  var SIR_W = 116;
  var SIR_H = 76;

  function sirBoundary() {
    var root = svgRoot(640, 380, 'Frontera del modelo SIR: entradas, salidas, stocks, flujos e hipótesis del entorno');
    var y = 146;
    var cy = y + SIR_H / 2;
    return add(root,
      P('boundary', 'wz-bdp', box(56, 104, 528, 160, 'wz-bd', 16), bdLabel(60, 94, 'start')),
      P('env:cerrada', 'wz-env', txt(56, 360, 'Población cerrada', 'wz-tx wz-tx--env', 'start')),
      P('env:mezcla', 'wz-env', txt(320, 360, 'Mezcla homogénea', 'wz-tx wz-tx--env')),
      P('env:inmunidad', 'wz-env', txt(584, 360, 'Inmunidad permanente', 'wz-tx wz-tx--env', 'end')),
      P('element:contagio', 'wz-elm', flowPipe(200, 262, cy), valve(231, cy, 10), mth(231, cy + 46, '\\beta S I/N', 'wz-sym wz-sym--sm')),
      P('element:recuperacion', 'wz-elm', flowPipe(378, 440, cy), valve(409, cy, 10), mth(409, cy + 46, '\\gamma I', 'wz-sym wz-sym--sm')),
      P('element:S', 'wz-elm', stock(84, y, 'S', 'Susceptibles', SIR_W, SIR_H)),
      P('element:I', 'wz-elm', stock(262, y, 'I', 'Infectados', SIR_W, SIR_H)),
      P('element:R', 'wz-elm', stock(440, y, 'R', 'Recuperados', SIR_W, SIR_H)),
      P('input:u', 'wz-in', arrow(231, 28, 231, cy - 13, 'wz-a--in'), mth(241, 44, 'u(t)', 'wz-sym wz-sym--in', 'start')),
      P('input:I0', 'wz-in', arrow(320, 28, 320, y - 2, 'wz-a--in'), mth(330, 44, 'I_0', 'wz-sym wz-sym--in', 'start')),
      P('output:S', 'wz-out', arrow(142, y + SIR_H, 142, 320, 'wz-a--out'), mth(152, 314, 'S(t)', 'wz-sym wz-sym--out', 'start')),
      P('output:I', 'wz-out', arrow(320, y + SIR_H, 320, 320, 'wz-a--out'), mth(330, 314, 'I(t)', 'wz-sym wz-sym--out', 'start')),
      P('output:R', 'wz-out', arrow(498, y + SIR_H, 498, 320, 'wz-a--out'), mth(508, 314, 'R(t)', 'wz-sym wz-sym--out', 'start')));
  }

  function sirStockFlow() {
    var root = svgRoot(640, 200, 'Stocks y flujos del modelo SIR');
    var y = 64;
    var cy = y + SIR_H / 2;
    return add(root,
      P('law:conservacion', 'wz-elm', stock(40, y, 'S', 'Susceptibles', SIR_W, SIR_H), stock(262, y, 'I', 'Infectados', SIR_W, SIR_H),
        stock(484, y, 'R', 'Recuperados', SIR_W, SIR_H)),
      P('law:accion loop:R1 loop:B1', 'wz-flowp', flowPipe(156, 262, cy), valve(209, cy, 10),
        txt(209, 24, 'Contagio', 'wz-tx wz-tx--sm'), mth(209, 48, '\\beta S I/N', 'wz-sym wz-sym--sm'),
        curve(110, y + SIR_H + 2, 150, 190, 204, cy + 13, 'wz-a--info'), curve(300, y + SIR_H + 2, 262, 190, 214, cy + 13, 'wz-a--info')),
      P('law:recuperacion loop:B2', 'wz-flowp', flowPipe(378, 484, cy), valve(431, cy, 10),
        txt(431, 24, 'Recuperación', 'wz-tx wz-tx--sm'), mth(431, 48, '\\gamma I', 'wz-sym wz-sym--sm'),
        curve(340, y + SIR_H + 2, 384, 190, 426, cy + 13, 'wz-a--info')));
  }

  // Diagrama causal: nodos con semianchura w y semialtura 13; cada par con enlaces en ambos sentidos
  // se dibuja como dos arcos a cada lado de la recta que une los nodos, con el distintivo del lazo en medio.
  var CLD_NODES = {
    S: { x: 92, y: 150, w: 54, label: 'Susceptibles' },
    contagio: { x: 320, y: 52, w: 46, label: 'Contagios' },
    I: { x: 548, y: 150, w: 48, label: 'Infectados' },
    recuperacion: { x: 548, y: 270, w: 62, label: 'Recuperaciones' },
    R: { x: 270, y: 270, w: 54, label: 'Recuperados' }
  };
  var CLD_HH = 13;
  var LAW_OF_LINK = {
    'S>contagio': 'law:accion', 'I>contagio': 'law:accion', 'I>recuperacion': 'law:recuperacion',
    'contagio>S': 'law:conservacion', 'contagio>I': 'law:conservacion', 'recuperacion>I': 'law:conservacion', 'recuperacion>R': 'law:conservacion'
  };

  /** Punto del borde del rectángulo de un nodo en la dirección (dx, dy), con un margen. */
  function nodeEdge(n, dx, dy, gap) {
    var tx = Math.abs(dx) > 1e-9 ? n.w / Math.abs(dx) : Infinity;
    var ty = Math.abs(dy) > 1e-9 ? CLD_HH / Math.abs(dy) : Infinity;
    var t = Math.min(tx, ty) + gap;
    return { x: n.x + dx * t, y: n.y + dy * t };
  }
  function qPoint(a, c, b, t) {
    var u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  }

  function sirCausal(causal) {
    var root = svgRoot(640, 300, 'Diagrama causal del modelo SIR con sus lazos de refuerzo y de equilibrio');
    var links = (causal && causal.links) || [];
    var loops = (causal && causal.loops) || [];
    function loopsOf(a, b) {
      return loops.filter(function (lp) { return lp.variables.indexOf(a) >= 0 && lp.variables.indexOf(b) >= 0; })
        .map(function (lp) { return 'loop:' + lp.id; });
    }
    function paired(lk) {
      return links.some(function (o) { return o.from === lk.to && o.to === lk.from; });
    }
    var partsOut = [];
    links.forEach(function (lk) {
      var A = CLD_NODES[lk.from];
      var B = CLD_NODES[lk.to];
      if (!A || !B) return;
      var refs = loopsOf(lk.from, lk.to).concat([LAW_OF_LINK[lk.from + '>' + lk.to] || 'law:conservacion']).join(' ');
      var pol = lk.polarity === '-' ? MINUS : '+';
      var dx = B.x - A.x;
      var dy = B.y - A.y;
      var L = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= L;
      dy /= L;
      var px = -dy;
      var py = dx;
      var off = paired(lk) ? 7 : 0;
      var s = nodeEdge(A, dx, dy, 6);
      var e = nodeEdge(B, -dx, -dy, 6);
      s = { x: s.x + px * off, y: s.y + py * off };
      e = { x: e.x + px * off, y: e.y + py * off };
      var g;
      if (off) {
        var bend = Math.min(48, L * 0.22);
        var c = { x: (s.x + e.x) / 2 + px * bend, y: (s.y + e.y) / 2 + py * bend };
        var q = qPoint(s, c, e, 0.8);
        g = P(refs, 'wz-link', curve(s.x, s.y, c.x, c.y, e.x, e.y, 'wz-a--link'),
          txt(q.x + px * 16, q.y + py * 16 + 6, pol, 'wz-pol'));
      } else {
        g = P(refs, 'wz-link', arrow(s.x, s.y, e.x, e.y, 'wz-a--link', { head: 9, half: 4.5 }),
          txt((s.x + e.x) / 2 + px * 14, (s.y + e.y) / 2 + py * 14 + 6, pol, 'wz-pol'));
      }
      partsOut.push(g);
    });
    Object.keys(CLD_NODES).forEach(function (id) {
      var n = CLD_NODES[id];
      var refs = loops.filter(function (lp) { return lp.variables.indexOf(id) >= 0; }).map(function (lp) { return 'loop:' + lp.id; });
      if (id === 'S' || id === 'I' || id === 'R') refs.push('law:conservacion');
      if (id === 'contagio') refs.push('law:accion');
      if (id === 'recuperacion') refs.push('law:recuperacion');
      partsOut.push(P(refs.join(' ') || 'node:' + id, 'wz-node', txt(n.x, n.y + 5, n.label, 'wz-tx wz-tx--node')));
    });
    loops.forEach(function (lp) {
      var a = CLD_NODES[lp.variables[0]];
      var b = CLD_NODES[lp.variables[1]];
      if (!a || !b) return;
      var letter = lp.type === 'refuerzo' ? 'R' : 'B';
      var mx = (a.x + b.x) / 2;
      var my = (a.y + b.y) / 2;
      partsOut.push(P('loop:' + lp.id, 'wz-badgep wz-badgep--' + letter,
        dot(mx, my, 16, 'wz-badge'), txt(mx, my + 5, lp.id, 'wz-badge__tx')));
    });
    return add(root, partsOut);
  }

  function sirLaws(wiz) {
    return [
      { title: 'Stocks y flujos', svg: sirStockFlow(), testid: 'wz-stockflow' },
      { title: 'Diagrama causal', svg: sirCausal(wiz.causal), testid: 'wz-cld' }
    ];
  }

  var DIAGRAMS = {
    massSpring: { boundary: msBoundary, laws: msLaws },
    rlc: { boundary: rlcBoundary, laws: rlcLaws },
    tanks: { boundary: tankBoundary, laws: tankLaws },
    sir: { boundary: sirBoundary, laws: sirLaws }
  };

  /* ================================================================== enlace diagrama ↔ lista */

  /**
   * Resalta en uno o varios SVG las partes cuyo data-refs contiene la referencia activa, y en la lista
   * el botón con ese data-ref. Vista previa con puntero/foco; clic para fijar (aria-pressed).
   */
  function makeLinker(svgs, opts) {
    opts = opts || {};
    var buttons = [];
    var preview = null;
    var pinned = null;
    var cleanups = [];

    function has(refs, ref) { return (' ' + refs + ' ').indexOf(' ' + ref + ' ') >= 0; }

    function apply() {
      var ref = preview || pinned;
      svgs.forEach(function (root) {
        root.classList.toggle('has-hl', !!ref);
        var parts = root.querySelectorAll('[data-refs]');
        for (var i = 0; i < parts.length; i++) {
          parts[i].classList.toggle('is-hl', !!ref && has(parts[i].getAttribute('data-refs'), ref));
        }
      });
      buttons.forEach(function (b) {
        var r = b.getAttribute('data-ref');
        b.classList.toggle('is-hl', r === ref);
        b.setAttribute('aria-pressed', String(r === pinned));
        var row = b.closest('.wz-hlrow');
        if (row) row.classList.toggle('is-hl', r === ref);
      });
      if (opts.onChange) opts.onChange(ref, pinned);
    }

    function setPreview(ref) {
      if (ref === preview) return;
      preview = ref;
      apply();
    }

    function bindButton(b) {
      buttons.push(b);
      var ref = b.getAttribute('data-ref');
      var row = b.closest('.wz-hlrow') || b;
      function enter() { setPreview(ref); }
      function leave() { setPreview(null); }
      function click() {
        pinned = opts.toggle === false ? ref : (pinned === ref ? null : ref);
        if (opts.onPick) opts.onPick(ref, pinned);
        apply();
      }
      row.addEventListener('pointerenter', enter);
      row.addEventListener('pointerleave', leave);
      b.addEventListener('focus', enter);
      b.addEventListener('blur', leave);
      b.addEventListener('click', click);
      cleanups.push(function () {
        row.removeEventListener('pointerenter', enter);
        row.removeEventListener('pointerleave', leave);
        b.removeEventListener('focus', enter);
        b.removeEventListener('blur', leave);
        b.removeEventListener('click', click);
      });
    }

    svgs.forEach(function (root) {
      function over(e) {
        var p = e.target && e.target.closest ? e.target.closest('[data-refs]') : null;
        setPreview(p && root.contains(p) ? p.getAttribute('data-refs').split(' ')[0] : null);
      }
      function out() { setPreview(null); }
      root.addEventListener('pointerover', over);
      root.addEventListener('pointerleave', out);
      cleanups.push(function () {
        root.removeEventListener('pointerover', over);
        root.removeEventListener('pointerleave', out);
      });
    });

    return {
      bind: bindButton,
      pin: function (ref) { pinned = ref; apply(); },
      get pinned() { return pinned; },
      get active() { return preview || pinned; },
      refresh: apply,
      destroy: function () { cleanups.forEach(function (f) { f(); }); cleanups = []; buttons = []; }
    };
  }

  /* ================================================================== montaje */

  function mount(el) {
    var ui = UI();
    var cleanups = [];
    var timers = [];
    var alive = true;
    var inited = false;
    var dataCache = {};
    var state = {
      step: 0,
      example: EXAMPLES[0].id,
      fit: {},          // por ejemplo: { value, method, dtMul }
      asm: {},          // términos ensamblados por ejemplo (paso 3)
      played: {},       // recorridos automáticos ya mostrados ('leyes:<id>')
      ssMode: 'sym'
    };
    var steps = [];
    var trans = null;

    function later(fn, ms) {
      var id = window.setTimeout(function () {
        timers.splice(timers.indexOf(id), 1);
        if (alive) fn();
      }, ms);
      timers.push(id);
      return id;
    }
    function cancel(id) {
      if (id === null || id === undefined) return;
      window.clearTimeout(id);
      var i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
    }
    function reduced() { return !!(DSL.prefs && DSL.prefs.reducedMotion); }
    function announce(text) { if (ui.announce) ui.announce(text); }
    function exDef(id) { for (var i = 0; i < EXAMPLES.length; i++) if (EXAMPLES[i].id === id) return EXAMPLES[i]; return null; }

    function setBtnLabel(btn, label, iconName) {
      var lab = btn.querySelector('.ds-btn__label');
      if (lab) lab.textContent = label;
      if (iconName && ui.icon) {
        var old = btn.querySelector('.ds-btn__icon');
        var nu = ui.icon(iconName, { size: 18, className: 'ds-btn__icon' });
        if (old) old.replaceWith(nu); else btn.insertBefore(nu, btn.firstChild);
      }
    }

    /* ---------------------------------------------------------------- encabezado y selector */
    var titleEl = h('h2', { id: 'modelado-title' }, 'Pasos para modelar un sistema');
    var lede = h('p', { class: 'wz-lede' }, 'Cuatro pasos llevan de un sistema real a un modelo que se puede simular. Elija un ejemplo y recórralos en orden: el mismo sistema le acompaña desde la frontera hasta la validación.');
    var exSeg = ui.segmented({
      options: EXAMPLES.map(function (e) { return { value: e.id, label: e.label, icon: e.icon }; }),
      value: state.example, label: 'Ejemplo en curso', testid: 'wz-example', equal: false,
      className: 'wz-example__seg',
      onChange: function (v) { setExample(v); }
    });
    var exField = h('div', { class: 'wz-example' }, h('p', { class: 'wz-example__label', 'aria-hidden': 'true' }, 'Ejemplo en curso'), exSeg.el);
    var head = h('header', { class: 'wz-head' }, h('div', { class: 'wz-head__text' }, titleEl, lede), exField);

    /* ---------------------------------------------------------------- carril de pasos */
    var railFill = h('span', { class: 'wz-rail__fill', 'data-testid': 'wz-progress' });
    var railTrack = h('span', { class: 'wz-rail__track', 'aria-hidden': 'true' }, railFill);
    var markers = STEPS.map(function (st, i) {
      var b = h('button', { type: 'button', class: 'wz-mark', 'data-testid': 'wz-step-' + (i + 1), 'data-step': String(i) },
        h('span', { class: 'wz-mark__dot', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { class: 'wz-mark__label' }, h('span', { class: 'sr-only' }, 'Paso ' + (i + 1) + ': '), st.short));
      b.addEventListener('click', function () { goTo(i, { source: 'rail' }); });
      return b;
    });
    var rail = h('nav', { class: 'wz-rail', 'aria-label': 'Pasos del modelado', 'data-testid': 'wz-rail' },
      railTrack,
      h('ol', { class: 'wz-rail__list', role: 'list' }, markers.map(function (b) { return h('li', { class: 'wz-rail__item' }, b); })));

    /* ---------------------------------------------------------------- paneles */
    var stage = h('div', { class: 'wz-stage', 'data-testid': 'wz-stage' });
    STEPS.forEach(function (st, i) {
      var hid = util.uid('wz-step-title');
      var heading = h('h3', { id: hid, class: 'wz-step__title', tabindex: '-1' },
        h('span', { class: 'sr-only' }, stepLabel(i, STEPS.length) + ': '), st.title);
      var body = h('div', { class: 'wz-step__body' });
      var root = h('div', { class: 'wz-step', role: 'group', 'aria-labelledby': hid, 'data-testid': 'wz-panel-' + (i + 1), 'data-step-id': st.id },
        h('div', { class: 'wz-step__head' },
          h('span', { class: 'wz-step__num', 'aria-hidden': 'true', 'data-testid': 'wz-count-' + (i + 1) }, String(i + 1)),
          heading,
          h('p', { class: 'wz-step__intro' }, st.intro)),
        body);
      root.hidden = i !== state.step;
      stage.appendChild(root);
      steps.push({ root: root, body: body, heading: heading, built: null, ctl: null });
    });

    var prevBtn = ui.button({ label: 'Anterior', icon: 'arrow-left', variant: 'ghost', testid: 'wz-prev', className: 'wz-nav__prev', onClick: function () { goTo(state.step - 1, { source: 'nav' }); } });
    var nextBtn = ui.button({ label: 'Siguiente', iconEnd: 'arrow-right', variant: 'primary', testid: 'wz-next', className: 'wz-nav__next', onClick: function () { goTo(state.step + 1, { source: 'nav' }); } });
    var nav = h('div', { class: 'wz-nav', 'data-testid': 'wz-nav' }, prevBtn, nextBtn);
    var panel = h('div', { class: 'wz-panel ds-panel' }, stage, nav);

    var wrap = h('div', { class: 'wz', 'data-testid': 'wz-root', 'data-example': state.example, 'data-step': '1' }, head, rail, panel);
    el.appendChild(wrap);

    /* ---------------------------------------------------------------- navegación */
    function paintRail() {
      markers.forEach(function (b, i) {
        if (i === state.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        b.classList.toggle('is-done', i < state.step);
      });
      rail.style.setProperty('--wz-progress', String(state.step / (STEPS.length - 1)));
      wrap.setAttribute('data-step', String(state.step + 1));
    }

    function paintNav() {
      var i = state.step;
      var hadFocus = document.activeElement;
      prevBtn.hidden = i === 0;
      nextBtn.hidden = i === STEPS.length - 1;
      if (i > 0) {
        setBtnLabel(prevBtn, 'Ir a: ' + STEPS[i - 1].short);
        prevBtn.setAttribute('aria-label', 'Ir a: ' + STEPS[i - 1].short);
      }
      if (i < STEPS.length - 1) {
        setBtnLabel(nextBtn, 'Ir a: ' + STEPS[i + 1].short);
        nextBtn.setAttribute('aria-label', 'Ir a: ' + STEPS[i + 1].short);
      }
      if ((hadFocus === prevBtn && prevBtn.hidden) || (hadFocus === nextBtn && nextBtn.hidden)) {
        steps[i].heading.focus({ preventScroll: true });
      }
    }

    function finishTransition() {
      if (!trans) return;
      cancel(trans.tOut);
      cancel(trans.tIn);
      trans.from.root.classList.remove('is-leaving');
      trans.from.root.inert = false;
      if (trans.from !== steps[state.step]) trans.from.root.hidden = true;
      trans.to.root.classList.remove('is-entering');
      trans = null;
    }

    /*
     * Altura del escenario: al cambiar de paso pasa de la altura anterior a la nueva en --dur-morph
     * (la excepción de animación de disposición que el brief admite para plegar y desplegar). Se fija
     * una altura en línea, se anima y se quita al terminar (transitionend o un temporizador de respaldo).
     */
    var tween = { timer: null, ro: null, target: 0, endAt: 0 };
    function clearTween() {
      cancel(tween.timer);
      tween.timer = null;
      if (tween.ro) tween.ro.disconnect();
      tween.ro = null;
      stage.classList.remove('is-morphing');
      stage.style.height = '';
      stage.style.transitionDuration = '';
    }
    /**
     * Anima la altura del escenario desde h0 hasta la del paso `el`.
     *
     * El destino lo da el primer aviso de un ResizeObserver, que llega tras la disposición del propio
     * frame: el clic no fuerza ninguna disposición síncrona del paso que entra, y la animación empieza
     * en el primer frame aunque el hilo principal vaya cargado. Si el paso cambia de alto mientras tanto
     * (el ensamblado del paso 3 revela su primer término), el destino se corrige sin alargar la
     * animación: la transición nueva dura lo que quedaba de la original. Sin ResizeObserver, el destino
     * se lee en el acto.
     */
    function tweenHeight(h0, el, morph) {
      clearTween();
      if (!(h0 > 0) || !(morph > 0)) return;
      stage.style.height = h0 + 'px';
      stage.classList.add('is-morphing');
      tween.target = 0;
      function start(h1) {
        if (!(h1 > 0) || Math.abs(h1 - h0) < 1) { clearTween(); return; }
        stage.style.height = h1 + 'px';
        tween.target = h1;
        tween.endAt = performance.now() + morph;
        cancel(tween.timer);
        tween.timer = later(clearTween, morph + 80);
      }
      if (typeof window.ResizeObserver !== 'function') {
        void stage.offsetHeight;          // fija la altura de partida antes de cambiarla
        start(el.getBoundingClientRect().height);
        return;
      }
      tween.timer = later(clearTween, morph + 250);   // respaldo si el primer aviso no llegara
      tween.ro = new window.ResizeObserver(function () {
        if (!tween.ro) return;
        var hn = el.getBoundingClientRect().height;
        if (!tween.target) { start(hn); return; }
        if (Math.abs(hn - tween.target) < 0.5) return;
        var left = tween.endAt - performance.now();
        if (left < 40) { clearTween(); return; }
        tween.target = hn;
        stage.style.transitionDuration = Math.round(left) + 'ms';
        stage.style.height = hn + 'px';
      });
      tween.ro.observe(el);
    }
    function onStageTransitionEnd(e) {
      if (e.target === stage && e.propertyName === 'height') clearTween();
    }
    stage.addEventListener('transitionend', onStageTransitionEnd);
    cleanups.push(function () { stage.removeEventListener('transitionend', onStageTransitionEnd); clearTween(); });

    /*
     * Cambio de paso en secuencia: primero sale el paso anterior (--dur-step-out) y después entra el
     * nuevo (--dur-step-in, con un retraso igual a la salida: mientras espera, el relleno «both» de la
     * animación lo mantiene en opacidad 0). Nunca hay dos pasos legibles a la vez. Con movimiento
     * reducido el cambio es instantáneo, sin animación ni transición de altura.
     */
    function transition(from, to, m) {
      finishTransition();
      steps.forEach(function (s, k) { if (k !== from && k !== to) s.root.hidden = true; });
      var a = steps[from];
      var b = steps[to];
      stage.style.setProperty('--wz-dir', to > from ? '1' : '-1');
      b.root.hidden = false;
      b.root.inert = false;
      if (from === to) return;
      if (m.reduced) {
        clearTween();
        a.root.hidden = true;
        return;
      }
      var outMs = m.outMs;
      var inMs = m.inMs;
      a.root.inert = true;
      a.root.classList.add('is-leaving');
      b.root.classList.add('is-entering');
      trans = { from: a, to: b, tOut: null, tIn: null };
      trans.tOut = later(function () {
        if (!trans) return;
        a.root.classList.remove('is-leaving');
        a.root.inert = false;
        a.root.hidden = true;
      }, outMs);
      trans.tIn = later(function () {
        b.root.classList.remove('is-entering');
        trans = null;
      }, outMs + inMs + 20);
      tweenHeight(m.h0, b.root, m.morph);
    }

    /**
     * Medidas del cambio de paso, leídas antes de tocar el DOM: la disposición y los estilos aún están
     * limpios, así que no fuerzan ningún cálculo. Leídas después (con el paso nuevo ya visible) costaban
     * decenas de ms de estilo y disposición síncronos, que retrasaban el arranque de la animación.
     */
    function measureChange() {
      var r = stage.getBoundingClientRect();
      return {
        h0: r.height,
        top: r.top,
        headerH: parseFloat(util.cssVar('--header-h')) || 64,
        reduced: reduced(),
        outMs: msFromToken('--dur-step-out', 150),
        inMs: msFromToken('--dur-step-in', 250),
        morph: msFromToken('--dur-morph', 300)
      };
    }

    function goTo(i, opts) {
      opts = opts || {};
      i = clampInt(i, 0, STEPS.length - 1);
      if (i === state.step) {
        if (opts.source === 'rail') markers[i].focus();
        return;
      }
      var from = state.step;
      var m = measureChange();
      leaveStep(from);
      state.step = i;
      if (inited) ensureBuilt(i);
      transition(from, i, m);
      paintRail();
      paintNav();
      if (opts.source === 'key') markers[i].focus();
      announce(stepLabel(i, STEPS.length) + ': ' + STEPS[i].title + '.');
      if (opts.source !== 'api') keepStageInView(m);
      if (inited) { pendingEnter = false; enterStep(i); prebuildSoon(); }
    }

    /** Si el comienzo del paso nuevo queda bajo la barra fija, el escenario sube hasta su scroll-margin-top. */
    function keepStageInView(m) {
      if (m.top < m.headerH) stage.scrollIntoView({ block: 'start', behavior: m.reduced ? 'auto' : 'smooth' });
    }

    /*
     * Construcción anticipada: tras entrar en un paso, sus vecinos (el siguiente y luego el anterior) se
     * construyen ocultos en tiempo ocioso, uno por turno, y nunca mientras dura un cambio de paso (una
     * construcción a mitad de la animación le quitaría frames). Así el clic de «Siguiente» no construye
     * nada y la animación empieza en el primer frame. Los demás pasos siguen construyéndose al entrar.
     */
    var prebuildJob = null;
    function idle(fn) {
      if (typeof window.requestIdleCallback === 'function') {
        var rid = window.requestIdleCallback(function () { if (alive) fn(); }, { timeout: 1500 });
        return { cancel: function () { window.cancelIdleCallback(rid); } };
      }
      var tid = later(fn, 200);
      return { cancel: function () { cancel(tid); } };
    }
    function prebuildSoon() {
      if (prebuildJob) prebuildJob.cancel();
      prebuildJob = null;
      if (!inited || !alive) return;
      var i = state.step;
      var want = [i + 1, i - 1].filter(function (k) { return k >= 0 && k < STEPS.length && steps[k].built !== state.example; });
      if (!want.length) return;
      if (trans) {
        // Aún hay un cambio de paso en curso: se vuelve a intentar cuando termine.
        var wait = later(function () { prebuildJob = null; prebuildSoon(); }, 120);
        prebuildJob = { cancel: function () { cancel(wait); } };
        return;
      }
      prebuildJob = idle(function () {
        prebuildJob = null;
        if (trans) { prebuildSoon(); return; }
        var k = want[0];
        if (k !== state.step && steps[k].built !== state.example) ensureBuilt(k);
        prebuildSoon();
      });
    }
    cleanups.push(function () { if (prebuildJob) prebuildJob.cancel(); prebuildJob = null; });

    function onRailKey(e) {
      var key = e.key;
      var i = state.step;
      var next = null;
      if (key === 'ArrowRight' || key === 'ArrowDown') next = i + 1;
      else if (key === 'ArrowLeft' || key === 'ArrowUp') next = i - 1;
      else if (key === 'Home') next = 0;
      else if (key === 'End') next = STEPS.length - 1;
      if (next === null) return;
      e.preventDefault();
      next = clampInt(next, 0, STEPS.length - 1);
      if (next === i) { markers[i].focus(); return; }
      goTo(next, { source: 'key' });
    }
    function onNavKey(e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var t = e.target;
      if (!(t === prevBtn || t === nextBtn || (t && t.classList && t.classList.contains('wz-step__title')))) return;
      e.preventDefault();
      goTo(state.step + (e.key === 'ArrowRight' ? 1 : -1), { source: 'nav-key' });
      if (document.activeElement === document.body) steps[state.step].heading.focus({ preventScroll: true });
    }
    rail.addEventListener('keydown', onRailKey);
    panel.addEventListener('keydown', onNavKey);
    cleanups.push(function () {
      rail.removeEventListener('keydown', onRailKey);
      panel.removeEventListener('keydown', onNavKey);
    });

    /* ---------------------------------------------------------------- construcción de pasos */
    function context() {
      var id = state.example;
      var S_ = SYS();
      var model = S_ && S_.get(id);
      if (!model || !model.wizard) return null;
      var wiz = model.wizard;
      var desc = S_.describe(model, wiz.variant);
      return {
        id: id, ex: exDef(id), model: model, wiz: wiz, desc: desc, copy: COPY[id] || {},
        params: function () {
          var p = Object.assign({}, desc.defaults);
          var f = state.fit[id];
          if (f && isFinite(f.value)) p[wiz.measured.param] = f.value;
          return p;
        }
      };
    }

    var BUILDERS = [buildBoundary, buildLaws, buildFormulate, buildSimulate];

    function ensureBuilt(i) {
      var s = steps[i];
      if (s.built === state.example) return;
      if (s.ctl && s.ctl.destroy) s.ctl.destroy();
      s.ctl = null;
      s.body.textContent = '';
      var ctx = context();
      if (!ctx) {
        s.body.appendChild(h('p', { class: 'ds-callout ds-callout--warning' }, 'Los modelos de sistemas no están cargados: este paso no puede mostrarse.'));
        s.built = state.example;
        return;
      }
      try {
        s.ctl = BUILDERS[i](ctx, s.body) || null;
      } catch (err) {
        console.error('[wizard] No se pudo construir el paso ' + (i + 1) + ':', err);
        s.body.appendChild(h('p', { class: 'ds-callout ds-callout--danger' }, 'Este paso no se pudo construir. Cambie de ejemplo o recargue la página.'));
      }
      s.built = state.example;
    }
    function enterStep(i) { var c = steps[i].ctl; if (c && c.enter) c.enter(); }
    function leaveStep(i) { var c = steps[i].ctl; if (c && c.leave) c.leave(); }

    function setExample(id) {
      if (!exDef(id) || id === state.example) {
        if (exSeg.value !== state.example) exSeg.set(state.example, { silent: true });
        return;
      }
      leaveStep(state.step);
      state.example = id;
      wrap.setAttribute('data-example', id);
      if (exSeg.value !== id) exSeg.set(id, { silent: true });
      if (!inited) return;
      var s = steps[state.step];
      var body = s.body;
      body.classList.add('is-swapping');
      // Mientras se desvanece, el contenido del ejemplo anterior no responde: un clic en ese intervalo
      // emitiría la carga útil del ejemplo anterior (p. ej. tf:open de masa-resorte tras elegir RLC).
      body.inert = true;
      var swapMs = msFromToken('--dur-fast', 150);
      later(function () {
        ensureBuilt(state.step);
        body.inert = false;
        body.classList.remove('is-swapping');
        pendingEnter = false;
        enterStep(state.step);
        prebuildSoon();
      }, swapMs);
      announce('Ejemplo en curso: ' + exDef(id).label + '.');
    }

    /* ================================================================ paso 1: delimitar */
    function legendKey(kind) {
      var k = S('svg', { class: 'wz-key wz-key--' + kind, viewBox: '0 0 24 12', width: 24, height: 12, 'aria-hidden': 'true', focusable: 'false' });
      if (kind === 'input' || kind === 'output') add(k, arrow(2, 6, 22, 6, kind === 'input' ? 'wz-a--in' : 'wz-a--out', { head: 7, half: 3.5 }));
      else if (kind === 'element') add(k, box(5, 1, 14, 10, 'wz-shape', 2));
      else add(k, ln(2, 9, 22, 9, 'wz-ln wz-ln--env'), pth('M7 9l-3 3M13 9l-3 3M19 9l-3 3', 'wz-hatch'));
      return k;
    }

    function itemButton(kind, it) {
      var ref = kind + ':' + it.id;
      var b = h('button', {
        type: 'button', class: 'wz-item wz-item--' + kind, 'data-ref': ref, 'aria-pressed': 'false',
        'data-testid': 'wz-item-' + kind + '-' + it.id.toLowerCase()
      });
      if (it.symbol) b.appendChild(texEl('span', 'wz-item__sym', it.symbol, false));
      b.appendChild(h('span', { class: 'wz-item__label' }, it.label));
      if (it.unit) b.appendChild(h('span', { class: 'wz-item__unit' }, it.unit));
      return b;
    }

    /**
     * Figura con su diagrama. En pantallas estrechas el diagrama conserva un ancho mínimo legible y
     * su marco se desplaza en horizontal: solo entonces el marco entra en el orden de tabulación.
     */
    function figure(svgEl, caption, extraCls, stops) {
      var capId = util.uid('wz-cap');
      svgEl.setAttribute('aria-describedby', capId);
      var plot = h('div', { class: 'wz-figure__plot' }, svgEl);
      if (stops && util.observeSize) {
        stops.push(util.observeSize(plot, function () {
          var scrolls = plot.scrollWidth > plot.clientWidth + 1;
          if (scrolls) {
            plot.setAttribute('tabindex', '0');
            plot.setAttribute('role', 'group');
            plot.setAttribute('aria-label', 'Diagrama desplazable en horizontal');
          } else {
            plot.removeAttribute('tabindex');
            plot.removeAttribute('role');
            plot.removeAttribute('aria-label');
          }
        }));
      }
      return h('figure', { class: ['wz-figure', extraCls] },
        plot,
        h('p', { class: 'wz-figure__hint', 'aria-hidden': 'true' }, 'Deslice el diagrama en horizontal para verlo entero.'),
        h('figcaption', { class: 'wz-figure__cap', id: capId }, caption));
    }
    function stopAll(list) {
      list.splice(0).forEach(function (f) { if (typeof f === 'function') f(); });
    }

    function buildBoundary(ctx, body) {
      var dg = DIAGRAMS[ctx.id].boundary();
      dg.setAttribute('data-testid', 'wz-boundary');
      var linker = makeLinker([dg]);
      var groups = GROUPS.map(function (gr) {
        var gid = util.uid('wz-group');
        var items = ctx.wiz.boundary[gr.field] || [];
        var list = h('ul', { class: 'wz-legend__list', role: 'list' });
        items.forEach(function (it) {
          var b = itemButton(gr.key, it);
          list.appendChild(h('li', { class: 'wz-legend__li' }, b));
          linker.bind(b);
        });
        return h('div', { class: 'wz-legend__group', role: 'group', 'aria-labelledby': gid, 'data-group': gr.key },
          h('h4', { class: 'wz-legend__title', id: gid }, legendKey(gr.key), h('span', null, gr.title)),
          h('p', { class: 'wz-legend__hint' }, gr.hint),
          list);
      });
      var boundaryBtn = h('button', { type: 'button', class: 'wz-item wz-item--boundary', 'data-ref': 'boundary', 'aria-pressed': 'false', 'data-testid': 'wz-item-boundary' },
        h('span', { class: 'wz-item__dash', 'aria-hidden': 'true' }), h('span', { class: 'wz-item__label' }, 'Frontera del sistema'));
      linker.bind(boundaryBtn);
      var side = h('div', { class: 'wz-side wz-legend', 'data-testid': 'wz-legend' },
        h('p', { class: 'wz-side__lead' }, 'Pase el puntero o el foco por cada elemento para verlo en el diagrama; púlselo para dejarlo marcado.'),
        groups, h('div', { class: 'wz-legend__group wz-legend__group--bd' }, boundaryBtn));
      var stops = [];
      add(body, h('div', { class: 'wz-grid' }, figure(dg, ctx.copy.boundary, null, stops), side));
      return { destroy: function () { stopAll(stops); linker.destroy(); } };
    }

    /* ================================================================ paso 2: leyes */
    function buildLaws(ctx, body) {
      var figs = DIAGRAMS[ctx.id].laws(ctx.wiz);
      var svgs = figs.map(function (f) {
        f.svg.setAttribute('data-testid', f.testid || 'wz-laws');
        return f.svg;
      });
      var seq = [];
      var linker = makeLinker(svgs, {
        toggle: false,
        onPick: function () { stop(); }
      });

      var lawList = h('ol', { class: 'wz-laws', role: 'list', 'data-testid': 'wz-law-list' });
      ctx.wiz.laws.forEach(function (law, k) {
        var ref = 'law:' + law.id;
        var textId = util.uid('wz-law-text');
        var b = h('button', { type: 'button', class: 'wz-law__btn', 'data-ref': ref, 'aria-pressed': 'false', 'aria-describedby': textId, 'data-testid': 'wz-law-' + law.id.toLowerCase() },
          h('span', { class: 'wz-law__n', 'aria-hidden': 'true' }, String(k + 1)),
          h('span', { class: 'wz-law__title' }, law.title),
          texEl('span', 'wz-law__tex', law.tex, false));
        lawList.appendChild(h('li', { class: 'wz-law wz-hlrow' }, b, h('p', { class: 'wz-law__text', id: textId }, law.text)));
        linker.bind(b);
        seq.push(ref);
      });

      var loopBlock = null;
      if (ctx.wiz.causal && ctx.wiz.causal.loops && ctx.wiz.causal.loops.length) {
        var loopList = h('ul', { class: 'wz-loops', role: 'list', 'data-testid': 'wz-loop-list' });
        ctx.wiz.causal.loops.forEach(function (lp) {
          var ref = 'loop:' + lp.id;
          var letter = lp.type === 'refuerzo' ? 'R' : 'B';
          var textId = util.uid('wz-loop-text');
          var b = h('button', { type: 'button', class: 'wz-law__btn wz-loop__btn', 'data-ref': ref, 'aria-pressed': 'false', 'aria-describedby': textId, 'data-testid': 'wz-loop-' + lp.id.toLowerCase() },
            h('span', { class: 'wz-loop__badge wz-loop__badge--' + letter, 'aria-hidden': 'true' }, lp.id),
            h('span', { class: 'wz-law__title' }, lp.label),
            h('span', { class: 'wz-loop__type' }, lp.type === 'refuerzo' ? 'Lazo de refuerzo' : 'Lazo de equilibrio'));
          loopList.appendChild(h('li', { class: 'wz-law wz-hlrow' }, b, h('p', { class: 'wz-law__text', id: textId }, lp.text)));
          linker.bind(b);
          seq.push(ref);
        });
        loopBlock = h('div', { class: 'wz-side__block' }, h('h4', { class: 'wz-side__title' }, 'Lazos de realimentación'), loopList);
      }

      var playing = false;
      var tId = null;
      var idx = 0;
      var playLabel = loopBlock ? 'Recorrer leyes y lazos' : 'Recorrer las leyes una a una';
      var playBtn = ui.button({ label: playLabel, icon: 'play', variant: 'secondary', size: 'sm', testid: 'wz-laws-play', onClick: function () { if (playing) stop(); else play(true); } });

      function tick() {
        if (!playing) return;
        if (idx >= seq.length) { stop(); return; }
        linker.pin(seq[idx]);
        idx += 1;
        tId = later(tick, 2300);
      }
      function play(fromStart) {
        stop();
        playing = true;
        if (fromStart) idx = 0;
        setBtnLabel(playBtn, 'Detener el recorrido', 'pause');
        playBtn.setAttribute('data-state', 'playing');
        tick();
      }
      function stop() {
        cancel(tId);
        tId = null;
        if (!playing) return;
        playing = false;
        setBtnLabel(playBtn, playLabel, 'play');
        playBtn.setAttribute('data-state', 'paused');
      }

      var figStops = [];
      var figBlock = h('div', { class: 'wz-figs' }, figs.map(function (f, k) {
        var fig = figure(f.svg, k === figs.length - 1 ? ctx.copy.lawsCaption : '', figs.length > 1 ? 'wz-figure--stack' : null, figStops);
        fig.insertBefore(h('p', { class: 'wz-figure__title' }, f.title || ctx.copy.lawsTitle), fig.firstChild);
        if (!fig.querySelector('figcaption').textContent) fig.querySelector('figcaption').remove();
        return fig;
      }));
      var side = h('div', { class: 'wz-side' },
        h('div', { class: 'wz-side__block' }, h('h4', { class: 'wz-side__title' }, 'Leyes que se aplican'), lawList),
        loopBlock,
        h('div', { class: 'wz-side__actions' }, playBtn));
      add(body, h('div', { class: 'wz-grid' }, figBlock, side));

      return {
        enter: function () {
          var key = 'leyes:' + ctx.id;
          if (!state.played[key] && !reduced()) {
            state.played[key] = true;
            play(true);
          } else if (!linker.pinned) {
            linker.pin(seq[0]);
          }
        },
        leave: stop,
        destroy: function () { stop(); stopAll(figStops); linker.destroy(); }
      };
    }

    /* ================================================================ paso 3: formular */
    function buildFormulate(ctx, body) {
      var wiz = ctx.wiz;
      var terms = wiz.equationTerms || [];
      var n = terms.length;
      var isSystem = terms.some(function (t) { return t.side === 'eq'; });
      var flows = terms.filter(function (t) { return t.side === 'flow'; });
      var count = Math.min(n, state.asm[ctx.id] || 0);
      var current = count - 1;
      var slots = [];
      var tId = null;
      var playing = false;
      var eq;
      var flowList = null;

      /*
       * Cada término es un botón con nombre propio en texto plano («Término 1 de 4: inercia, m·ẍ»): su
       * contenido visible es solo KaTeX y el rótulo de debajo es aria-hidden. La descripción es la
       * explicación de ese mismo término, en un nodo oculto propio (no el panel de detalle compartido).
       */
      function termButton(t, k, display, cls, texSrc) {
        var label = t.label ? t.label.charAt(0).toLowerCase() + t.label.slice(1) : t.id;
        var reading = texReading(t.tex);
        var descId = util.uid('wz-term-text');
        var b = h('button', {
          type: 'button', class: ['wz-term', cls], 'data-testid': 'wz-term-' + t.id.toLowerCase(), 'data-term': t.id,
          'aria-label': 'Término ' + (k + 1) + ' de ' + n + ': ' + label + (reading ? ', ' + reading : ''),
          'aria-describedby': t.text ? descId : null
        });
        b.appendChild(texEl('span', 'wz-term__math', texSrc || t.tex, display));
        b.addEventListener('click', function () { stopPlay(); select(k); });
        return t.text ? [b, h('span', { id: descId, hidden: true }, t.text)] : [b];
      }

      if (!isSystem) {
        eq = h('ol', { class: 'wz-eq', role: 'list', 'data-testid': 'wz-eq', 'aria-label': 'Ecuación del modelo, término a término' });
        terms.forEach(function (t, k) {
          var op = k === 0 ? '' : (t.side === 'rhs' && terms[k - 1].side !== 'rhs' ? '=' : '+');
          var slot = h('li', { class: 'wz-eq__slot is-pending', 'data-term': t.id },
            op ? texEl('span', 'wz-eq__op' + (op === '=' ? ' wz-eq__op--rel' : ''), op, false) : null,
            h('span', { class: 'wz-eq__term' },
              termButton(t, k, false, t.side === 'rhs' ? 'wz-term--in' : null, '\\displaystyle ' + t.tex),
              h('span', { class: 'wz-eq__cap', 'aria-hidden': 'true' }, t.label)));
          slots.push(slot);
          eq.appendChild(slot);
        });
      } else {
        eq = h('ol', { class: 'wz-sys', role: 'list', 'data-testid': 'wz-eq', 'aria-label': 'Sistema de ecuaciones del modelo, balance a balance' });
        flowList = h('ul', { class: 'wz-flows', role: 'list', 'data-testid': 'wz-flow-list' });
        terms.forEach(function (t, k) {
          var slot;
          if (t.side === 'eq') {
            slot = h('li', { class: 'wz-sys__row is-pending', 'data-term': t.id },
              termButton(t, k, false, 'wz-term--row', '\\displaystyle ' + wrapFlows(t.tex, flows)),
              h('span', { class: 'wz-sys__cap', 'aria-hidden': 'true' }, t.label));
            eq.appendChild(slot);
          } else {
            slot = h('li', { class: 'wz-flows__item is-pending', 'data-term': t.id },
              termButton(t, k, false, 'wz-term--flow', t.tex),
              h('span', { class: 'wz-flows__cap' }, t.label));
            flowList.appendChild(slot);
          }
          slots.push(slot);
        });
      }

      /*
       * Detalle del término actual. Todas las fichas (la de espera y una por término) se apilan en la
       * misma celda y solo la actual es visible: el panel mide lo que la ficha más alta, así revelar o
       * elegir otro término no cambia la altura del paso (ni la de su animación de entrada).
       */
      var detailCards = [h('div', { class: 'wz-detail__card' },
        h('p', { class: 'wz-detail__empty' }, 'Pulse «Término siguiente» para ensamblar la ecuación pieza a pieza.'))]
        .concat(terms.map(function (t, k) {
          return h('div', { class: 'wz-detail__card', 'data-term': t.id },
            h('p', { class: 'wz-detail__count' }, 'Término ' + (k + 1) + ' de ' + n),
            h('h4', { class: 'wz-detail__title' }, t.label),
            texEl('div', 'wz-detail__math ds-math-block', t.tex, true),
            h('p', { class: 'wz-detail__text' }, t.text));
        }));
      var detail = h('div', { class: 'wz-detail', 'data-testid': 'wz-term-detail' }, detailCards);
      function paintDetail() {
        detailCards.forEach(function (c, i) { c.classList.toggle('is-shown', i === current + 1); });
      }

      var progress = h('p', { class: 'wz-asm__progress', 'data-testid': 'wz-asm-count', 'aria-live': 'off' });
      var nextBtn2 = ui.button({ label: 'Término siguiente', icon: 'step-forward', variant: 'primary', size: 'sm', testid: 'wz-term-next', onClick: function () { stopPlay(); reveal(count); } });
      var allBtn = ui.button({ label: 'Mostrar todo', icon: 'list-ordered', variant: 'secondary', size: 'sm', testid: 'wz-term-all', onClick: function () { stopPlay(); showAll(); } });
      var replayBtn = ui.button({ label: 'Repetir', icon: 'rotate-ccw', variant: 'ghost', size: 'sm', testid: 'wz-term-replay', onClick: function () { replay(); } });

      function termBtn(k) { return k >= 0 && k < n ? slots[k].querySelector('.wz-term') : null; }

      /*
       * Un botón que se desactiva con el foco dentro dejaría el foco en <body>. Antes de desactivarlo,
       * el foco pasa a un destino ya habilitado: «Término siguiente» en el último término y «Mostrar
       * todo» → el último término revelado; «Repetir» → «Término siguiente» (o el primer término).
       */
      function focusTargetFor(active) {
        if ((active === nextBtn2 || active === allBtn) && count >= n) return termBtn(count - 1);
        if (active === replayBtn && count === 0) return count < n ? nextBtn2 : termBtn(0);
        return null;
      }

      function paint() {
        var active = document.activeElement;
        slots.forEach(function (s, k) {
          s.classList.toggle('is-pending', k >= count);
          s.classList.toggle('is-current', k === current);
          var btn = s.querySelector('.wz-term');
          if (btn) {
            btn.disabled = k >= count;
            btn.setAttribute('aria-pressed', String(k === current));
          }
        });
        if (isSystem) {
          var cur = terms[current];
          eq.setAttribute('data-flow', cur && cur.side === 'flow' ? cur.id : '');
          eq.classList.toggle('has-flow', !!(cur && cur.side === 'flow'));
        }
        progress.textContent = count + ' de ' + n + (isSystem ? ' piezas' : ' términos');
        nextBtn2.disabled = false;
        allBtn.disabled = false;
        replayBtn.disabled = false;
        var target = focusTargetFor(active);
        if (target && !target.disabled) target.focus();
        nextBtn2.disabled = count >= n;
        allBtn.disabled = count >= n;
        replayBtn.disabled = count === 0;
        state.asm[ctx.id] = count;
        paintDetail();
      }

      function reveal(k) {
        if (k >= n) return;
        var s = slots[k];
        s.classList.remove('is-pending');
        if (!reduced()) {
          s.classList.remove('is-in');
          void s.offsetWidth;
          s.classList.add('is-in');
        }
        count = Math.max(count, k + 1);
        current = k;
        paint();
      }
      function select(k) {
        if (k >= count) return;
        current = k;
        paint();
      }
      function showAll() {
        for (var k = count; k < n; k++) slots[k].classList.remove('is-pending');
        count = n;
        current = n - 1;
        paint();
      }
      function stopPlay() {
        cancel(tId);
        tId = null;
        playing = false;
      }
      function play() {
        stopPlay();
        if (reduced()) { showAll(); return; }
        playing = true;
        (function step() {
          if (!playing) return;
          if (count >= n) { playing = false; return; }
          reveal(count);
          tId = later(step, 780);
        })();
      }
      function replay() {
        stopPlay();
        count = 0;
        current = -1;
        slots.forEach(function (s) { s.classList.remove('is-in'); });
        paint();
        tId = later(play, 120);
      }

      // Lineal / no lineal
      var linear = !!(ctx.desc.variant && ctx.desc.variant.linear);
      var action;
      if (linear) {
        var pair = (ctx.model.tfPairs(wiz.variant) || [])[0];
        action = ui.button({
          label: 'Ver G(s) paso a paso', icon: 'square-function', variant: 'secondary', size: 'sm', testid: 'wz-open-tf',
          onClick: function () {
            DSL.bus.emit('tf:open', { systemId: ctx.id, variant: wiz.variant, params: ctx.params(), outputKey: pair ? pair.outputKey : undefined });
          }
        });
      } else {
        action = ui.button({
          label: 'Ver «Linealidad vs. no linealidad»', icon: 'book-open', variant: 'secondary', size: 'sm', testid: 'wz-open-concepts',
          onClick: function () { DSL.bus.emit('concepts:open', { card: 'linealidad', tab: 'superposicion' }); }
        });
      }
      var linBox = h('div', { class: 'wz-linear', 'data-testid': 'wz-linear-box', 'data-linear': String(linear) },
        h('div', { class: 'wz-linear__head' },
          h('h4', { class: 'wz-side__title' }, '¿Lineal o no lineal?'),
          ui.chip({ label: linear ? 'Lineal' : 'No lineal', tone: linear ? 'info' : 'warning', icon: linear ? 'chart-line' : 'chart-spline', testid: 'wz-linear' })),
        h('p', { class: 'wz-linear__text' }, ctx.copy.linear),
        h('div', { class: 'wz-side__actions' }, action));

      // Espacio de estados
      var ssMath = h('div', { class: 'wz-ss__math ds-math-block', translate: 'no', 'data-testid': 'wz-statespace' });
      var ssValues = h('p', { class: 'wz-ss__values', 'data-testid': 'wz-ss-values' });
      function paramsText() {
        var p = ctx.params();
        return ctx.desc.params.map(function (ps) {
          return plainText(ps.symbol) + ' = ' + util.formatNumber(p[ps.key], 4) + (ps.unit ? NB + ps.unit : '');
        }).join(', ');
      }
      function paintSS() {
        var num = state.ssMode === 'num';
        renderTex(ssMath, num ? wiz.stateSpace.texWith(ctx.params()) : wiz.stateSpace.tex, true);
        ssValues.textContent = num ? 'Con ' + paramsText() + '.' : (linear
          ? 'Los coeficientes de las matrices dependen solo de los parámetros físicos.'
          : 'La función f(x, u) combina estados y parámetros: no se reduce a matrices constantes.');
      }
      var ssSeg = ui.segmented({
        options: [{ value: 'sym', label: 'Con símbolos' }, { value: 'num', label: 'Con valores' }],
        value: state.ssMode, label: 'Forma de la ecuación de estado', testid: 'wz-ss-mode', equal: false,
        onChange: function (v) { state.ssMode = v; paintSS(); }
      });
      var stateDefs = h('ul', { class: 'wz-ss__vars', role: 'list' },
        ctx.desc.state.map(function (sv) {
          return h('li', { class: 'wz-ss__var' }, texEl('span', 'wz-ss__sym', sv.symbol, false),
            h('span', null, sv.label + (sv.unit ? ' (' + sv.unit + ')' : '')));
        }));
      var ss = h('section', { class: 'wz-ss', 'aria-label': 'Forma de espacio de estados' },
        h('div', { class: 'wz-ss__head' }, h('h4', { class: 'wz-side__title' }, 'De la EDO a la forma de espacio de estados'), ssSeg.el),
        h('p', { class: 'wz-ss__text' }, ctx.copy.state),
        h('div', { class: 'wz-ss__row' }, h('div', { class: 'wz-ss__label' }, h('p', { class: 'wz-ss__k' }, 'Variables de estado'), stateDefs), h('div', { class: 'wz-ss__eq' }, ssMath, ssValues)));

      var stageEl = h('div', { class: 'wz-asm' },
        h('div', { class: 'wz-asm__board', 'data-testid': 'wz-asm' }, eq, flowList ? h('div', { class: 'wz-flows__wrap' }, h('p', { class: 'wz-flows__title' }, 'Flujos que conectan los balances'), flowList) : null),
        h('div', { class: 'wz-asm__bar' }, progress, h('div', { class: 'wz-asm__btns' }, nextBtn2, allBtn, replayBtn)));
      var side = h('div', { class: 'wz-side' }, h('div', { class: 'wz-side__block' }, detail), linBox);
      add(body, h('div', { class: 'wz-grid wz-grid--asm' }, stageEl, side), ss);
      paint();
      paintSS();
      slots.forEach(function (s, k) { if (k < count) s.classList.remove('is-pending'); });

      return {
        enter: function () {
          paintSS();
          if (count === 0) {
            if (reduced()) showAll();
            else tId = later(play, 260);
          }
        },
        leave: stopPlay,
        destroy: function () { stopPlay(); ssSeg.destroy(); }
      };
    }

    /* ================================================================ paso 4: simular y validar */
    function getData(id) {
      if (!dataCache[id]) dataCache[id] = SYS().syntheticData(id);
      return dataCache[id];
    }

    function buildSimulate(ctx, body) {
      var S_ = SYS();
      var model = ctx.model;
      var wiz = ctx.wiz;
      var meas = wiz.measured;
      var data = getData(ctx.id);
      var desc = ctx.desc;
      var unitT = desc.variant.timeUnit;
      var ps = null;
      desc.params.forEach(function (p) { if (p.key === meas.param) ps = p; });
      var outSpec = null;
      desc.outputs.forEach(function (o) { if (o.key === meas.outputKey) outSpec = o; });
      var outColor = (outSpec && outSpec.color) || '--c-out';
      var outUnit = (outSpec && outSpec.unit) || '';
      var outSym = outSpec ? plainText(outSpec.symbol).replace(/\(t\)$/, '') : meas.outputKey;
      var fit = state.fit[ctx.id] || (state.fit[ctx.id] = { value: ps.default, method: 'rk4', dtMul: 1 });
      var baseDt = model.hints(desc.defaults, wiz.variant).dt;
      var symPlain = plainText(ps.symbol);
      var dataPts = data.t.map(function (t, i) { return { x: t, y: data.y[i] }; });
      var charts = CH();
      var fitChart = null;
      var resChart = null;
      var resToggle = null;
      var rafId = null;
      var pendingMode = null;
      var last = null;

      function compute() {
        var params = Object.assign(ctx.params(), meas.params || {});
        params[meas.param] = fit.value;
        var traj = S_.simulate(model, {
          variant: wiz.variant, params: params, input: data.input, duration: data.duration,
          method: fit.method, dt: baseDt * fit.dtMul
        });
        var ys = traj.outputs[meas.outputKey];
        var ok = !!(traj.stats && traj.stats.success) && ys.every(function (v) { return isFinite(v); });
        var simAt = data.t.map(function (t) { return interpAt(traj.t, ys, t); });
        var res = data.y.map(function (y, i) { return y - simAt[i]; });
        var inv = [];
        try { inv = model.invariants(traj) || []; } catch (err) { inv = []; }
        return {
          ok: ok,
          rmse: ok ? rmseOf(simAt, data.y) : NaN,
          line: resample(traj.t, ys, 240, 0, data.duration),
          res: data.t.map(function (t, i) { return { x: t, y: ok ? res[i] : null }; }),
          inv: inv,
          steps: traj.stats ? traj.stats.steps : 0
        };
      }

      // ---- controles
      var slider = ui.slider({
        label: ps.label, symbol: symPlain, unit: ps.unit, min: ps.min, max: ps.max, step: ps.step,
        value: fit.value, defaultValue: ps.default, tooltip: ps.tooltip, scale: ps.scale === 'log' ? 'log' : 'linear',
        testid: 'wz-calib',
        onInput: function (v) { fit.value = v; schedule('drag'); },
        onChange: function (v) { fit.value = v; schedule('release', true); }
      });
      var rmseRO = ui.readout({ label: 'del ajuste', tex: '\\mathrm{RMSE}', value: null, unit: outUnit, digits: 3, testid: 'wz-rmse' });
      var noiseRO = ui.readout({ label: 'del ruido de medida', tex: '\\sigma', value: meas.noise, unit: outUnit, digits: 3, testid: 'wz-noise' });
      var verdictEl = h('div', { class: 'ds-callout wz-verdict', 'data-testid': 'wz-verdict' });

      var methodSeg = ui.segmented({
        options: [{ value: 'euler', label: 'Euler' }, { value: 'heun', label: 'Heun' }, { value: 'rk4', label: 'RK4' }],
        value: fit.method, label: 'Método numérico', testid: 'wz-method',
        onChange: function (v) { fit.method = v; schedule('release', true); }
      });
      var dtSeg = ui.segmented({
        options: [1, 5, 20].map(function (k) { return { value: k, label: dtText(baseDt * k, unitT) }; }),
        value: fit.dtMul, label: 'Paso de integración', testid: 'wz-dt',
        onChange: function (v) { fit.dtMul = Number(v); schedule('release', true); }
      });
      var invList = h('ul', { class: 'wz-inv', role: 'list', 'data-testid': 'wz-invariants' });

      var info = ui.collapsible({
        title: 'Cómo se generaron los datos', headingLevel: 4, testid: 'wz-data-info', className: 'wz-info',
        content: h('p', { class: 'wz-info__text' },
          'Los datos son sintéticos y deterministas: se simuló el modelo con ' + symPlain + ' = ' +
          util.formatNumber(meas.trueValue, 4) + (ps.unit ? NB + ps.unit : '') + ', se tomaron ' + meas.samples +
          ' muestras y se sumó ruido gaussiano de desviación σ = ' + util.formatNumber(meas.noise, 3) + (outUnit ? NB + outUnit : '') +
          ' con un generador de semilla ' + meas.seed + '. Cada recarga produce exactamente los mismos puntos.')
      });
      var galleryBtn = ui.button({
        label: 'Abrir en la galería', icon: 'arrow-right', variant: 'ghost', size: 'sm', testid: 'wz-open-gallery',
        onClick: function () { DSL.bus.emit('gallery:open', { systemId: ctx.id, variant: wiz.variant }); }
      });

      // ---- gráficas
      var xLabel = 'Tiempo t (' + unitT + ')';
      var yLabel = (outSpec ? outSpec.label : meas.outputKey) + ' ' + outSym + (outUnit ? ' (' + outUnit + ')' : '');
      var fitCanvas = h('canvas', { 'data-testid': 'wz-fit' });
      var resCanvas = h('canvas', { 'data-testid': 'wz-residuals' });
      var fitFrame = h('div', { class: 'ch-frame wz-fit__frame' }, fitCanvas);
      var resFrame = h('div', { class: 'ch-frame ch-frame--wide wz-res__frame' }, resCanvas);
      var dataSlot = h('div', { class: 'wz-fit__data' });
      var resDataSlot = h('div', { class: 'wz-fit__data' });

      var plots = h('div', { class: 'wz-plots' },
        h('div', { class: 'wz-plot' }, h('p', { class: 'wz-plot__title' }, 'Simulación frente a datos medidos'), fitFrame, dataSlot),
        h('div', { class: 'wz-plot wz-plot--res' }, h('p', { class: 'wz-plot__title' }, 'Residuos: dato menos simulación'), resFrame, resDataSlot));
      var side = h('div', { class: 'wz-side wz-side--sim' },
        h('div', { class: 'wz-side__block' }, h('h4', { class: 'wz-side__title' }, 'Calibración'),
          h('p', { class: 'wz-side__hint' }, 'Mueva «' + ps.label + '» hasta que la curva pase por los puntos.'),
          slider.el,
          h('div', { class: 'wz-readouts' }, rmseRO.el, noiseRO.el),
          verdictEl),
        h('div', { class: 'wz-side__block' }, h('h4', { class: 'wz-side__title' }, 'Integración numérica'),
          h('div', { class: 'wz-ctl' }, h('p', { class: 'wz-ctl__label', 'aria-hidden': 'true' }, 'Método'), methodSeg.el),
          h('div', { class: 'wz-ctl' }, h('p', { class: 'wz-ctl__label', 'aria-hidden': 'true' }, 'Paso Δt'), dtSeg.el),
          h('p', { class: 'wz-side__hint' }, 'Con RK4 las comprobaciones se cumplen casi exactamente. Pruebe Euler con un paso grueso: el error numérico aparece como un fallo.')),
        h('div', { class: 'wz-side__block' }, h('h4', { class: 'wz-side__title' }, 'Comprobaciones del modelo'), invList),
        info.el,
        h('div', { class: 'wz-side__actions' }, galleryBtn));
      add(body, h('div', { class: 'wz-grid wz-grid--sim' }, plots, side));

      if (charts) {
        fitChart = charts.createXYChart(fitCanvas, {
          xLabel: xLabel, yLabel: yLabel, ariaLabel: 'Simulación frente a datos medidos', testid: 'wz-fit', dataToggle: dataSlot
        });
        resChart = charts.createXYChart(resCanvas, {
          xLabel: xLabel, yLabel: 'Residuo' + (outUnit ? ' (' + outUnit + ')' : ''), ariaLabel: 'Residuos de la calibración', testid: 'wz-residuals'
        });
        // «Ver datos» de los residuos: una fila por punto medido (t y dato menos simulación), sin la banda ±2σ.
        if (typeof charts.dataToggle === 'function') {
          resToggle = charts.dataToggle(resChart, { container: resDataSlot, testid: 'wz-residuals', spec: residualSpec });
        }
      }

      function residualSpec() {
        var rows = last ? last.res.map(function (p) { return { t: p.x, r: p.y }; }) : [];
        return {
          caption: 'Residuos de la calibración: dato menos simulación en cada instante medido',
          columns: [
            { key: 't', label: 'Tiempo t', unit: unitT, digits: 4 },
            { key: 'r', label: 'Residuo', unit: outUnit, digits: 3 }
          ],
          rows: rows,
          maxRows: Math.max(200, rows.length)
        };
      }

      function paintVerdict(r) {
        var v = verdict(r.rmse, meas.noise);
        var msg;
        if (v.level === 'fallo') msg = 'La integración no dio valores finitos con este método y este paso. Reduzca Δt o use RK4.';
        else if (v.level === 'ruido') msg = 'La simulación pasa por los datos: el error queda al nivel del ruido de medida y los residuos no muestran forma.';
        else if (v.level === 'cerca') msg = 'Se acerca, pero los residuos todavía muestran una tendencia. Ajuste «' + ps.label + '» un poco más.';
        else msg = 'La simulación no reproduce los datos: los residuos tienen forma, no son ruido. Mueva «' + ps.label + '».';
        var icon = v.level === 'ruido' ? 'circle-check' : v.level === 'fallo' ? 'circle-alert' : 'info';
        verdictEl.className = 'ds-callout wz-verdict' + (v.tone === 'info' ? '' : ' ds-callout--' + v.tone);
        verdictEl.setAttribute('data-level', v.level);
        verdictEl.textContent = '';
        if (ui.icon) verdictEl.appendChild(ui.icon(icon, { size: 18 }));
        verdictEl.appendChild(h('span', null, msg));
        return v;
      }

      function paintInvariants(inv) {
        var sig = inv.map(function (x) { return x.id + (x.ok ? '1' : '0') + x.detail; }).join('|');
        if (invList.getAttribute('data-sig') === sig) return;
        invList.setAttribute('data-sig', sig);
        invList.textContent = '';
        inv.forEach(function (x) {
          invList.appendChild(h('li', { class: 'wz-inv__item', 'data-ok': String(!!x.ok) },
            h('div', { class: 'wz-inv__head' },
              h('span', { class: 'wz-inv__label' }, x.label),
              ui.chip({ label: x.ok ? 'Se cumple' : 'No se cumple', tone: x.ok ? 'success' : 'danger', icon: x.ok ? 'circle-check' : 'circle-alert', testid: 'wz-inv-' + x.id })),
            x.detail ? h('p', { class: 'wz-inv__detail' }, x.detail) : null));
        });
      }

      function recompute(mode, announceIt) {
        var r = compute();
        last = r;
        if (fitChart) {
          fitChart.update([
            { key: 'sim', label: 'Simulación', kind: 'line', color: outColor, points: r.line },
            { key: 'med', label: 'Datos medidos', kind: 'points', color: '--c-in', points: dataPts }
          ], { mode: mode });
        }
        if (resChart) {
          var band = 2 * meas.noise;
          resChart.update([
            { key: 'res', label: 'Residuo', kind: 'stems', color: '--c-state', points: r.res },
            { key: 'band', label: '±2σ del ruido', kind: 'segments', color: '--c-in', dash: true,
              points: [{ x: 0, y: band }, { x: data.duration, y: band }, { x: 0, y: -band }, { x: data.duration, y: -band }] }
          ], { mode: mode });
        }
        rmseRO.set(isFinite(r.rmse) ? r.rmse : null);
        var v = paintVerdict(r);
        paintInvariants(r.inv);
        wrap.setAttribute('data-fit-level', v.level);
        if (fitChart && mode === 'release') {
          fitChart.describe('Simulación frente a datos medidos: RMSE ' + (isFinite(r.rmse) ? util.formatNumber(r.rmse, 3) + (outUnit ? NB + outUnit : '') : 'no disponible') +
            ' con ' + symPlain + ' = ' + util.formatNumber(fit.value, 4) + (ps.unit ? NB + ps.unit : '') + '.');
        }
        if (resToggle && mode === 'release') resToggle.refresh();
        if (announceIt) announceFit();
      }

      /*
       * El resultado se anuncia una sola vez, ~450 ms después del último cambio (como en tfengine):
       * con las flechas del deslizador cada pulsación es un «change», y anunciar cada una competiría
       * con el aria-valuetext del propio deslizador. Se lee el valor ya asentado.
       */
      var announceTimer = null;
      function announceFit() {
        cancel(announceTimer);
        announceTimer = later(function () {
          announceTimer = null;
          var r = last;
          if (!r) return;
          var v = verdict(r.rmse, meas.noise);
          announce('RMSE ' + (isFinite(r.rmse) ? util.formatNumber(r.rmse, 3) + (outUnit ? NB + outUnit : '') : 'no disponible') +
            ' con ' + symPlain + ' = ' + util.formatNumber(fit.value, 4) + (ps.unit ? NB + ps.unit : '') + '. ' +
            (v.level === 'ruido' ? 'Dentro del ruido de medida.' : v.level === 'cerca' ? 'Cerca del ajuste.' : v.level === 'fallo' ? 'La integración falló.' : 'Lejos del ajuste.'));
        }, 450);
      }

      function schedule(mode, announceIt) {
        if (mode === 'release') {
          if (rafId !== null) { util.cancelRaf(rafId); rafId = null; }
          recompute('release', announceIt);
          return;
        }
        pendingMode = mode;
        if (rafId !== null) return;
        rafId = util.raf(function () {
          rafId = null;
          if (!alive) return;
          recompute(pendingMode || 'drag', false);
          pendingMode = null;
        });
      }

      recompute('release', false);

      return {
        destroy: function () {
          if (rafId !== null) util.cancelRaf(rafId);
          cancel(announceTimer);
          announceTimer = null;
          if (resToggle) resToggle.destroy();
          if (fitChart) fitChart.destroy();
          if (resChart) resChart.destroy();
          slider.destroy();
          methodSeg.destroy();
          dtSeg.destroy();
          info.destroy();
        },
        get result() { return last; }
      };
    }

    /* ---------------------------------------------------------------- arranque perezoso */
    /*
     * Dos fases: construir el paso actual y entrar en él. Con util.lazyInit (FND-07) se ejecutan en
     * tiempo ocioso tras app:ready, una por turno, o todas a la vez si la sección se acerca a 400 px
     * del viewport; sin él, al hacerse visible (util.onVisible). Mientras el paso 1 no está construido,
     * su cuerpo vacío reserva la altura medida (wizard.css, .wz-step__body:empty), así que la sección
     * apenas cambia de alto al construirse.
     */
    var pendingEnter = false;
    var lazy = null;
    function phaseBuild() {
      if (inited || !alive) return;
      inited = true;
      pendingEnter = true;
      ensureBuilt(state.step);
    }
    function phaseEnter() {
      if (!alive || !pendingEnter) return;
      pendingEnter = false;
      enterStep(state.step);
      prebuildSoon();
    }
    function init() {
      if (!alive) return;
      if (lazy) { lazy.ensure(); return; }
      phaseBuild();
      phaseEnter();
    }

    paintRail();
    paintNav();
    if (typeof util.lazyInit === 'function') {
      lazy = util.lazyInit(wrap, [phaseBuild, phaseEnter], { rootMargin: '400px' });
      cleanups.push(function () { if (lazy && lazy.destroy) lazy.destroy(); });
    } else {
      cleanups.push(util.onVisible(wrap, function (visible) { if (visible) init(); }, { once: true, rootMargin: '400px' }));
    }

    var handle = {
      goTo: function (i) { goTo(i, { source: 'api' }); },
      setExample: function (id) { setExample(id); },
      get state() { return { step: state.step, example: state.example, fit: JSON.parse(JSON.stringify(state.fit)) }; },
      get ready() { return inited; },
      init: init,
      destroy: function () {
        if (!alive) return;
        alive = false;
        timers.slice().forEach(function (id) { window.clearTimeout(id); });
        timers = [];
        steps.forEach(function (s) { if (s.ctl && s.ctl.destroy) s.ctl.destroy(); s.ctl = null; });
        cleanups.forEach(function (f) { try { f(); } catch (err) { /* sin efecto */ } });
        cleanups = [];
        exSeg.destroy();
        el.textContent = '';
      }
    };
    return handle;
  }

  DSL.sections.wizard = {
    mount: mount,
    STEPS: STEPS,
    EXAMPLES: EXAMPLES,
    helpers: {
      texRuns: texRuns,
      plainText: plainText,
      texReading: texReading,
      wrapFlows: wrapFlows,
      interpAt: interpAt,
      resample: resample,
      rmseOf: rmseOf,
      verdict: verdict,
      dtText: dtText,
      stepLabel: stepLabel,
      clampInt: clampInt
    }
  };
})(window.DSL);
