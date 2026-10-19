/*
 * js/sections/tfengine.js — Propietario: tfengine.
 * Sección #transferencia: motor de funciones de transferencia. Tres modos de entrada («Desde un sistema»,
 * «Forma estándar», «Personalizada»), G(s) grande, «Procedimiento paso a paso» (7 pasos plegables),
 * gráficas (escalón, polos y ceros, Bode, impulso opcional) y tarjetas de métricas.
 * Todo número calculado sale de DSL.core.tf; la derivación física (pasos 1–3) sale de DSL.systems.
 * API: docs/api/tfengine.md. DSL.sections.tfengine = { mount(el) → handle, helpers }.
 */
(function (DSL) {
  'use strict';

  var util = DSL.util;
  var h = util.h;

  // Dependencias cargadas después de este archivo o en la misma fase: acceso perezoso.
  function TFC() { return DSL.core.tf.TransferFunction; }
  function LX() { return DSL.core.latex; }
  function UI() { return DSL.ui; }
  function CH() { return DSL.viz && DSL.viz.charts; }

  /* ================================================================== constantes */

  var MODES = [
    { id: 'sistema', label: 'Desde un sistema' },
    { id: 'estandar', label: 'Forma estándar' },
    { id: 'personalizada', label: 'Personalizada' }
  ];

  // Etiquetas del selector «Sistema» (texto plano; la pareja salida/entrada se muestra en KaTeX debajo).
  var SYSTEM_LABELS = {
    'massSpring/base/x': 'Masa-resorte-amortiguador',
    'tanks/lineal/h': 'Depósito con salida lineal',
    'tanks/torricelli/h': 'Depósito de Torricelli (linealizado)',
    'tanks/cascada/h2': 'Dos depósitos en cascada',
    'rlc/serie/vC': 'Circuito RLC: tensión del capacitor',
    'rlc/serie/i': 'Circuito RLC: corriente',
    'sir/base': 'Epidemia SIR (sin G(s))',
    'market/telarana': 'Mercado: telaraña (sin G(s))',
    'market/walras/P': 'Mercado: ajuste continuo del precio'
  };

  // Sliders de la forma estándar. Los valores se pasan tal cual a fromFirstOrder / fromSecondOrder.
  var STD_PARAMS = {
    K: {
      label: 'Ganancia estática', symbol: 'K', unit: '', min: 0.1, max: 10, step: 0.1, value: 1,
      tooltip: 'Cuánto vale la salida en régimen permanente por cada unidad de entrada constante.'
    },
    tau: {
      label: 'Constante de tiempo', symbol: '\\tau', unit: 's', min: 0.05, max: 20, step: 0.01, value: 1, scale: 'log',
      tooltip: 'Fija la rapidez: en t = τ la respuesta al escalón ha recorrido 1 − 1/e del camino hasta su valor final.'
    },
    zeta: {
      label: 'Factor de amortiguamiento', symbol: '\\zeta', unit: '', min: -0.5, max: 2, step: 0.01, value: 0.5,
      tooltip: 'ζ < 0: inestable. ζ = 0: oscila sin fin. Entre 0 y 1: subamortiguado. ζ = 1: crítico. ζ > 1: sobreamortiguado.'
    },
    wn: {
      label: 'Frecuencia natural', symbol: '\\omega_n', unit: 'rad/s', min: 0.1, max: 20, step: 0.01, value: 2, scale: 'log',
      tooltip: 'Frecuencia de la oscilación libre sin amortiguamiento: escala el tiempo de toda la respuesta.'
    }
  };
  var STD_KEYS = { 1: ['K', 'tau'], 2: ['K', 'zeta', 'wn'] };

  // Ejemplos del modo «Personalizada» (coeficientes en potencias descendentes de s).
  var PRESETS = [
    { id: 'tercer-orden', label: 'Polo real y par complejo', num: '1 3', den: '1 4 6 4' },
    { id: 'polo-triple', label: 'Polo triple', num: '1', den: '1 3 3 1' },
    { id: 'fase-no-minima', label: 'Cero en el semiplano derecho', num: '-1 1', den: '1 3 2' },
    { id: 'integrador', label: 'Integrador', num: '1', den: '1 1 0' },
    { id: 'routh-fila-nula', label: 'Routh: fila nula', num: '1', den: '1 2 1 2' },
    { id: 'routh-epsilon', label: 'Routh: primer elemento nulo', num: '1', den: '1 1 2 2 3' },
    { id: 'inestable', label: 'Polos en el semiplano derecho', num: '1', den: '1 -1 2' }
  ];
  var CUSTOM_DEFAULT = { num: '1 3', den: '1 4 6 4' };

  var MULT = { 2: 'doble', 3: 'triple', 4: 'cuádruple' };
  var DAMPING_TEXT = {
    'subamortiguado': 'Como 0 < ζ < 1, el sistema es subamortiguado: los polos son complejos conjugados y la respuesta oscila con frecuencia ωd mientras la oscilación se apaga.',
    'críticamente amortiguado': 'Con ζ = 1 el amortiguamiento es crítico: hay un polo real doble y la respuesta llega al valor final en el menor tiempo posible sin sobrepasarlo.',
    'sobreamortiguado': 'Como ζ > 1, el sistema es sobreamortiguado: dos polos reales distintos y una respuesta sin oscilación, más lenta cuanto mayor es ζ.',
    'no amortiguado': 'Con ζ = 0 los polos están sobre el eje jω: la salida oscila indefinidamente con frecuencia ωn.',
    'inestable': 'Con ζ < 0 los polos pasan al semiplano derecho: la oscilación crece sin límite.'
  };
  // Desigualdad que DAMPING_TEXT afirma sobre ζ en cada régimen (la comprueba zetaDigits()).
  var DAMPING_HOLDS = {
    'subamortiguado': function (z) { return z > 0 && z < 1; },
    'sobreamortiguado': function (z) { return z > 1; },
    'inestable': function (z) { return z < 0; }
  };
  // Explicaciones de las fichas del panel G(s) (TFE-13): una frase cada una.
  var CHIP_TIPS = {
    estable: 'Todos los polos están en el semiplano izquierdo: la respuesta libre se apaga y, ante un escalón, la salida se asienta en un valor final.',
    marginal: 'Ningún polo está a la derecha del eje jω, pero alguno simple está sobre él: la respuesta libre ni se apaga ni crece.',
    inestable: 'Algún polo está a la derecha del eje jω, o se repite sobre él: la respuesta libre crece sin límite.',
    orden: 'El orden es el grado del denominador: cuántos polos tiene G(s) y cuántas condiciones iniciales necesita su ecuación diferencial.',
    estricta: 'El numerador tiene menor grado que el denominador: la entrada no pasa directamente a la salida y |G(jω)| tiende a 0 a alta frecuencia.',
    propia: 'Numerador y denominador tienen el mismo grado: una parte de la entrada pasa directamente a la salida (término directo).',
    ganancia: 'Ganancia estática: cuánto vale la salida en régimen permanente por cada unidad de un escalón de entrada, si el sistema es estable.',
    integrador: 'Hay un polo en s = 0: ante un escalón la salida no se asienta, sigue creciendo.',
    linealizado: 'Esta G(s) describe pequeñas variaciones alrededor del punto de operación de un modelo no lineal.',
    nolineal: 'La superposición no se cumple, así que el modelo no tiene una G(s) global; el procedimiento explica por qué.',
    discreto: 'El modelo avanza por periodos: se describe con ecuaciones en diferencias y G(z), no con G(s).'
  };
  var VERDICT = {
    estable: { label: 'Estable', tone: 'success', icon: 'circle-check' },
    marginal: { label: 'Marginalmente estable', tone: 'warning', icon: 'triangle-alert' },
    inestable: { label: 'Inestable', tone: 'danger', icon: 'circle-alert' }
  };

  /* ================================================================== utilidades puras */

  function fmt(x, d) { return util.formatNumber(x, d === undefined ? 4 : d); }
  function tnum(x, d) { return LX().num(x + 0, d === undefined ? 4 : d); }
  function tpoly(c, d) { return LX().poly(Array.prototype.slice.call(c), 's', { digits: d === undefined ? 4 : d }); }
  function clean(x) { return Number(Number(x).toPrecision(12)); }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  /**
   * Cifras con que el paso 4 escribe ωn y ζ: las de la G(s) (D) y, si con ellas ζ se leería en la
   * frontera de su régimen (ζ = 1.0000000012 se escribiría «1» junto a «Como ζ > 1»), las mínimas
   * para que el valor escrito cumpla la desigualdad de DAMPING_TEXT, hasta 15.
   */
  function zetaDigits(so, D) {
    var holds = DAMPING_HOLDS[so.damping];
    if (!holds || !isNum(so.zeta)) return D;
    for (var k = D; k < 15; k++) {
      if (holds(Number(util.formatNumber(so.zeta, k, { sci: 'e', ascii: true })))) return k;
    }
    return 15;
  }

  // Muestras de las curvas (TFE-05): al menos 20 por periodo de la oscilación más rápida, entre 400 y 20000.
  var SAMPLES_MIN = 400;
  var SAMPLES_MAX = 20000;
  var SAMPLES_PER_PERIOD = 20;

  /** Número de muestras para y(t) y g(t) en [0, T]: N = clamp(⌈20·T·máx|Im p|/(2π)⌉, 400, 20000). */
  function sampleCount(G, T) {
    var w = 0;
    G.poles().forEach(function (p) { w = Math.max(w, Math.abs(p.im)); });
    var n = Math.ceil(SAMPLES_PER_PERIOD * T * w / (2 * Math.PI));
    if (!isFinite(n)) n = SAMPLES_MIN;
    return Math.min(SAMPLES_MAX, Math.max(SAMPLES_MIN, n));
  }

  var COEF_SPLIT_RE = /[\s;]+/;
  /** Cifras significativas escritas en un campo de coeficientes (la mayor de sus números, hasta 10). */
  function typedDigits(str) {
    var max = 0;
    String(str === null || str === undefined ? '' : str).replace(/ /g, ' ').split(COEF_SPLIT_RE).forEach(function (tok) {
      if (!tok || tok === ',') return;
      var t = tok.replace(/,$/, '').replace(/^[+\-−]/, '');
      var mant = t.split(/[eE×xX·*]/)[0];
      var digits = mant.replace(/[^0-9]/g, '').replace(/^0+/, '');
      if (!/[.,]/.test(mant)) digits = digits.replace(/0+$/, '');
      max = Math.max(max, digits.length);
    });
    return Math.min(10, max);
  }
  /** Cifras con que se escriben los coeficientes de la G(s) personalizada: las tecleadas, entre 4 y 10. */
  function customDigits(num, den) {
    return Math.max(4, typedDigits(num), typedDigits(den));
  }
  /** Fichas de texto de un campo de coeficientes (las mismas que lee el motor, sin comas sueltas). */
  function coefTokens(str) {
    return String(str === null || str === undefined ? '' : str).replace(/ /g, ' ').trim()
      .replace(/^[[(]\s*/, '').replace(/\s*[\])]$/, '')
      .split(COEF_SPLIT_RE).filter(function (t) { return t && t !== ','; })
      .map(function (t) { return t.length > 1 ? t.replace(/,$/, '') : t; });
  }

  /** Texto de notas del motor (texto plano): «e^(σt)» o «e^{σt}» se muestran como superíndice
      (nodos de texto, nunca HTML). */
  var SUP_RE = /\^(?:\{([^}]*)\}|\(([^)]*)\))/g;
  function richText(t) {
    var str = String(t);
    var out = [];
    var last = 0;
    var m;
    SUP_RE.lastIndex = 0;
    while ((m = SUP_RE.exec(str)) !== null) {
      if (m.index > last) out.push(str.slice(last, m.index));
      out.push(h('sup', null, m[1] !== undefined ? m[1] : m[2]));
      last = SUP_RE.lastIndex;
    }
    if (!out.length) return str;
    if (last < str.length) out.push(str.slice(last));
    return out;
  }

  var SUP_DIGITS = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
  /** Nombre en texto de una fila de Routh: 's^{2}' → 's²'. */
  function routhRowName(tex) {
    return String(tex).replace(/\^\{(-?\d+)\}/g, function (m, d) {
      return d.split('').map(function (c) { return SUP_DIGITS[c] || c; }).join('');
    });
  }

  /** Derivada k-ésima en notación de Newton/Lagrange: y, ẏ, ÿ, y⁽³⁾… */
  function derivTex(base, k) {
    if (k === 0) return base;
    if (k === 1) return '\\dot{' + base + '}';
    if (k === 2) return '\\ddot{' + base + '}';
    return base + '^{(' + k + ')}';
  }

  /** Combinación lineal Σ c_k·base^(k) con coeficientes en potencias descendentes (d cifras, 4 por omisión). */
  function linCombTex(coeffs, base, d) {
    var n = coeffs.length - 1;
    var out = '';
    for (var i = 0; i <= n; i++) {
      var c = coeffs[i];
      if (c === 0) continue;
      var mag = tnum(Math.abs(c), d);
      var term = (mag === '1' ? '' : mag + '\\,') + derivTex(base, n - i);
      out += out ? (c < 0 ? ' - ' : ' + ') + term : (c < 0 ? '-' : '') + term;
    }
    return out || '0';
  }

  /** Ecuación diferencial de num/den: Σ a_k y^(k) = Σ b_k u^(k). */
  function odeTex(num, den, d) {
    return linCombTex(den, 'y', d) + ' = ' + linCombTex(num, 'u', d);
  }

  /** Ecuación transformada: (den) Y(s) = (num) U(s). */
  function laplaceTex(num, den, d) {
    var lhs = '\\left(' + tpoly(den, d) + '\\right) Y(s)';
    var rhs = num.length === 1 ? (tnum(num[0], d) === '1' ? '' : tnum(num[0], d) + '\\,') + 'U(s)' : '\\left(' + tpoly(num, d) + '\\right) U(s)';
    return lhs + ' = ' + rhs;
  }

  /** Lista de raíces agrupadas en TeX: ['p_{1,2} = -1 \pm 2j', 'p_{3} = -4'] (d cifras, 4 por omisión). */
  function rootsTex(groups, letter, cls, d) {
    var idx = 1;
    var out = [];
    groups.forEach(function (g) {
      var z = g.value;
      if (z.im < 0) return;
      var m = g.multiplicity;
      var count = z.im > 0 ? 2 * m : m;
      var ids = [];
      for (var i = 0; i < count; i++) ids.push(idx + i);
      idx += count;
      var val = z.im > 0 ? LX().complexPair({ re: z.re + 0, im: z.im }, d === undefined ? 4 : d) : tnum(z.re, d);
      if (cls) val = '\\htmlClass{' + cls + '}{' + val + '}';
      var mult = m > 1 ? '\\;\\text{(' + (MULT[m] || 'multiplicidad ' + m) + ')}' : '';
      out.push(letter + '_{' + ids.join(',') + '} = ' + val + mult);
    });
    return out;
  }

  /** (s − p) en TeX con signos limpios: s, s + 2, s + 1 - 2j. */
  function sMinusTex(p, d) {
    var re = p.re + 0;
    var im = p.im + 0;
    if (re === 0 && im === 0) return 's';
    var out = 's';
    if (re !== 0) out += (re < 0 ? ' + ' : ' - ') + tnum(Math.abs(re), d);
    if (im !== 0) {
      var m = tnum(Math.abs(im), d);
      out += (im < 0 ? ' + ' : ' - ') + (m === '1' ? '' : m) + 'j';
    }
    return out;
  }

  function complexTex(z, d) {
    if (z.im === 0) return tnum(z.re, d);
    return LX().complex({ re: z.re + 0, im: z.im + 0 }, d === undefined ? 4 : d);
  }

  /** Suma de fracciones parciales Σ r/(s − p)^k (polos y residuos a `digits` cifras, 4 por omisión). */
  function pfSumTex(entries, digits) {
    var out = '';
    entries.forEach(function (e) {
      var r = e.residue;
      if (r.re === 0 && r.im === 0) return;
      var d = sMinusTex(e.pole, digits);
      var den = e.power > 1 ? (d === 's' ? 's' : '\\left(' + d + '\\right)') + '^{' + e.power + '}' : d;
      var sign = '+';
      var numTex;
      if (r.im === 0) {
        sign = r.re < 0 ? '-' : '+';
        numTex = tnum(Math.abs(r.re), digits);
      } else {
        numTex = LX().complex({ re: r.re + 0, im: r.im + 0 }, digits === undefined ? 4 : digits);
      }
      var term = '\\frac{' + numTex + '}{' + den + '}';
      out += out ? ' ' + sign + ' ' + term : (sign === '-' ? '-' : '') + term;
    });
    return out || '0';
  }

  /** Quita del Bode los puntos no finitos (polos sobre el eje jω evaluados justo encima). */
  function cleanBode(b) {
    var o = { omega: [], magDb: [], phaseDeg: [] };
    for (var i = 0; i < b.omega.length; i++) {
      if (isFinite(b.magDb[i]) && isFinite(b.phaseDeg[i])) {
        o.omega.push(b.omega[i]);
        o.magDb.push(b.magDb[i]);
        o.phaseDeg.push(b.phaseDeg[i]);
      }
    }
    return o;
  }

  /* ================================================================== catálogo «Desde un sistema» */

  function buildCatalogue() {
    var S = DSL.systems;
    var out = [];
    if (!S || typeof S.list !== 'function') return out;
    S.list().forEach(function (model) {
      (model.variants || []).forEach(function (v) {
        var pairs = model.tfPairs(v.id) || [];
        if (pairs.length) {
          pairs.forEach(function (p) {
            var id = model.id + '/' + v.id + '/' + p.outputKey;
            out.push({
              id: id, kind: 'tf', modelId: model.id, variant: v.id, outputKey: p.outputKey,
              linearized: !!p.linearized, pairTex: p.label, category: model.category,
              label: SYSTEM_LABELS[id] || model.name + ': ' + v.label
            });
          });
        } else {
          var did = model.id + '/' + v.id;
          out.push({
            id: did, kind: 'diag', modelId: model.id, variant: v.id, outputKey: undefined,
            linearized: false, pairTex: null, category: model.category, discrete: v.timeDomain === 'discrete',
            label: SYSTEM_LABELS[did] || model.name + ' (sin G(s))'
          });
        }
      });
    });
    return out;
  }

  /* ================================================================== análisis (solo DSL.core.tf) */

  /**
   * Análisis de G para la vista. opts.coefDigits: cifras de los coeficientes en la derivación (4 por
   * omisión; en «Personalizada», las tecleadas). Polos y residuos de los pasos 5–6 usan
   * G.stepDisplayDigits() (6 si el motor no lo ofrece).
   */
  function analyze(G, opts) {
    var info = G.stepInfo();
    var T = G.timeHorizon();
    // Ventana del gráfico: el horizonte del motor, ampliada si el establecimiento cae cerca del borde.
    if (info.stable && isNum(info.settlingTime) && info.settlingTime * 1.15 > T) {
      T = Math.min(info.settlingTime * 1.15, Math.max(T, info.tEnd));
    }
    var n = sampleCount(G, T);
    var cd = opts && isNum(opts.coefDigits) ? opts.coefDigits : 4;
    var rd = typeof G.stepDisplayDigits === 'function' ? G.stepDisplayDigits() : 6;
    return {
      G: G,
      stab: G.stabilityInfo(),
      info: info,
      T: T,
      n: n,
      cd: cd,
      rd: isNum(rd) && rd >= 1 ? rd : 6,
      step: G.stepSamples(n, T),
      bode: cleanBode(G.bode()),
      so: G.secondOrderParams(),
      fo: G.firstOrderParams(),
      poleGroups: G.poleGroups(),
      zeroGroups: G.zeroGroups(),
      dc: G.dcGainInfo()
    };
  }

  /* ================================================================== procedimiento (descriptores) */
  // Bloques: { t: 'p'|'sub'|'eq'|'note'|'list'|'routh'|'pf'|'params'|'metrics', … }

  function P(text) { return { t: 'p', text: text }; }
  function SUB(text) { return { t: 'sub', text: text }; }
  function EQ(tex, testid) { return { t: 'eq', tex: tex, testid: testid || null }; }
  function NOTE(tone, text, testid) { return { t: 'note', tone: tone, text: text, testid: testid || null }; }
  function LIST(items) { return { t: 'list', items: items.slice() }; }

  function sysStepBlocks(s, withTitle) {
    var out = [];
    if (withTitle) out.push(SUB(s.title));
    if (s.text) out.push(P(s.text));
    (s.tex || []).forEach(function (t) { out.push(EQ(t)); });
    return out;
  }

  function step1(res, A) {
    var G = A.G;
    var o = G.original;
    var blocks = [];
    if (res.source === 'sistema') {
      var pre = [];
      for (var i = 0; i < res.derivation.length && res.derivation[i].id !== 'laplace'; i++) pre.push(res.derivation[i]);
      pre.forEach(function (s) { blocks = blocks.concat(sysStepBlocks(s, true)); });
    } else if (res.source === 'estandar' && res.order === 1) {
      blocks.push(P('Un sistema de primer orden tiene un solo almacén (de líquido, de carga, de calor): la salida y(t) se acerca a K·u con la rapidez que fija la constante de tiempo τ.'));
      blocks.push(EQ('\\tau\\,\\dot{y}(t) + y(t) = K\\,u(t)'));
      blocks.push(P('Con los valores elegidos:'));
      blocks.push(EQ(odeTex(o.num, o.den)));
    } else if (res.source === 'estandar') {
      blocks.push(P('Un sistema de segundo orden tiene dos almacenes de energía que se la intercambian (masa y resorte, inductor y capacitor). ωn fija la rapidez de la oscilación libre y ζ, cuánto la frena la disipación.'));
      blocks.push(EQ('\\ddot{y}(t) + 2\\zeta\\omega_n\\,\\dot{y}(t) + \\omega_n^{2}\\,y(t) = K\\,\\omega_n^{2}\\,u(t)'));
      blocks.push(P('Con los valores elegidos:'));
      blocks.push(EQ(odeTex(o.num, o.den)));
    } else {
      blocks.push(P('Una G(s) racional describe una ecuación diferencial lineal de coeficientes constantes: los coeficientes del denominador multiplican las derivadas de la salida y(t), y los del numerador, las de la entrada u(t).'));
      blocks.push(EQ('a_{n}\\,y^{(n)} + \\dots + a_{1}\\,\\dot{y} + a_{0}\\,y = b_{m}\\,u^{(m)} + \\dots + b_{1}\\,\\dot{u} + b_{0}\\,u'));
      blocks.push(P('Con los coeficientes escritos:'));
      blocks.push(EQ(odeTex(o.num, o.den, A.cd)));
    }
    return { id: 'ley', title: 'Ley física y ecuación diferencial', blocks: blocks };
  }

  function step2(res, A) {
    var o = A.G.original;
    var blocks = [];
    if (res.source === 'sistema') {
      var s = findStep(res.derivation, 'laplace');
      if (s) blocks = sysStepBlocks(s, false);
    } else {
      blocks.push(P('Se parte del reposo: la salida, la entrada y sus derivadas valen 0 en t = 0. Con esas condiciones iniciales nulas, cada derivada se convierte en un factor s, y por linealidad la ecuación diferencial pasa a ser algebraica en s.'));
      blocks.push(SUB('Propiedades usadas'));
      blocks.push(EQ('\\mathcal{L}\\{a\\,f_1(t) + b\\,f_2(t)\\} = a\\,F_1(s) + b\\,F_2(s)'));
      blocks.push(EQ('\\mathcal{L}\\left\\{y^{(k)}(t)\\right\\} = s^{k}\\,Y(s) - \\sum_{i=0}^{k-1} s^{k-1-i}\\,y^{(i)}(0) = s^{k}\\,Y(s)'));
      blocks.push(SUB('Ecuación transformada'));
      blocks.push(EQ(laplaceTex(o.num, o.den, A.cd)));
    }
    return { id: 'laplace', title: 'Transformada de Laplace con condiciones iniciales nulas', blocks: blocks };
  }

  function step3(res, A) {
    var G = A.G;
    var o = G.original;
    var blocks = [];
    var title = 'Despeje de G(s) = Y(s)/U(s)';
    if (res.source === 'sistema') {
      var s = findStep(res.derivation, 'despeje');
      if (s) {
        blocks = sysStepBlocks(s, false);
        if (s.title) title = s.title;
      }
    } else {
      blocks.push(P('Se divide la salida entre la entrada. El cociente depende solo del sistema, no de la entrada que se aplique.'));
      blocks.push(EQ('G(s) = \\frac{Y(s)}{U(s)} = ' + G.toTex({ normalized: false, digits: A.cd })));
    }
    if (G.toTex({ normalized: false, digits: A.cd }) !== G.toTex({ digits: A.cd })) {
      blocks.push(P('Al dividir numerador y denominador por el coeficiente principal, el denominador queda mónico; es la forma con la que trabaja el motor:'));
      blocks.push(EQ('G(s) = ' + G.toTex({ digits: A.cd }), 'tf-monic'));
    }
    return { id: 'despeje', title: title, blocks: blocks };
  }

  /**
   * Por qué un sistema sin ceros de orden 1 o 2 no tiene K, τ (o ωn y ζ): a₀ ≤ 0, es decir, un polo en
   * s = 0 (integrador) o un polo con parte real positiva. Devuelve el párrafo, o null si no es el caso.
   */
  function pureLowOrderWhy(A) {
    var G = A.G;
    var d = G.den;
    if (G.num.length !== 1 || G.order > 2) return null;
    var a0 = d[d.length - 1];
    if (a0 > 0) return null;
    var first = G.order === 1;
    var origin = a0 === 0;
    var rhp = G.poles().filter(function (p) { return p.re > 1e-9 * Math.max(1, Math.abs(p.re)); })
      .map(function (p) { return 's = ' + fmt(p.re, A.cd); });
    var causes = [];
    if (origin && !first && d[1] === 0) causes.push('un polo doble en s = 0 (doble integrador)');
    else if (origin) causes.push('un polo en s = 0 (integrador)');
    if (rhp.length) causes.push((origin ? 'otro' : 'un polo') + ' con parte real positiva (' + rhp.join(', ') + ')');
    var what = first ? 'τ no se define: τ = 1/a₀ exige a₀ > 0' : 'ωn y ζ no se definen: ωn = √a₀ exige a₀ > 0';
    var behaviour = rhp.length
      ? 'La salida crece sin límite en lugar de acercarse a un valor final'
      : 'Ante un escalón la salida no se acerca a un valor final: crece sin cesar';
    return 'Es un sistema de ' + (first ? 'primer' : 'segundo') + ' orden puro, pero tiene ' + causes.join(' y ') +
      ', así que ' + what + '. ' + behaviour + '; la caracterizan sus polos (paso 5).';
  }

  function step4(res, A) {
    var G = A.G;
    var n = G.num;
    var d = G.den;
    var D = A.cd;
    var blocks = [];
    var b0 = n[n.length - 1];
    var a0 = d[d.length - 1];
    if (A.fo) {
      var fo = A.fo;
      blocks.push(P('Es un sistema de primer orden puro. Con el denominador mónico s + a₀ se identifican la ganancia estática K y la constante de tiempo τ:'));
      blocks.push(EQ('G(s) = \\frac{K}{\\tau s + 1} = \\frac{' + tnum(fo.K, D) + '}{' + tpoly([fo.tau, 1], D) + '}'));
      blocks.push(EQ('\\tau = \\frac{1}{a_0} = \\frac{1}{' + tnum(a0, D) + '} = ' + tnum(fo.tau, D) + '\\;\\mathrm{s}'));
      blocks.push(EQ('K = \\frac{b_0}{a_0} = \\frac{' + tnum(b0, D) + '}{' + tnum(a0, D) + '} = ' + tnum(fo.K, D)));
      blocks.push(EQ('p = -\\frac{1}{\\tau} = ' + tnum(fo.pole, D) + '\\;\\mathrm{s^{-1}}'));
      blocks.push({ t: 'params', digits: D, items: [
        { id: 'K', label: 'Ganancia estática', tex: 'K', value: fo.K, unit: '' },
        { id: 'tau', label: 'Constante de tiempo', tex: '\\tau', value: fo.tau, unit: 's' },
        { id: 'pole', label: 'Polo', tex: 'p', value: fo.pole, unit: '1/s' }
      ] });
    } else if (A.so) {
      var so = A.so;
      // Junto a la frontera de un régimen, ωn y ζ llevan las cifras que hagan falta para que el valor
      // escrito de ζ cumpla la desigualdad de la nota (nunca «ζ = 1» al lado de «Como ζ > 1»).
      var Dz = zetaDigits(so, D);
      var zd = Dz > D ? Dz : undefined;
      blocks.push(P('Es un sistema de segundo orden puro. Con el denominador mónico s² + a₁s + a₀ se identifican la frecuencia natural ωn, el factor de amortiguamiento ζ y la ganancia estática K:'));
      blocks.push(EQ('G(s) = \\frac{K\\,\\omega_n^{2}}{s^{2} + 2\\zeta\\omega_n\\,s + \\omega_n^{2}}'));
      blocks.push(EQ('\\omega_n = \\sqrt{a_0} = \\sqrt{' + tnum(a0, D) + '} = ' + tnum(so.wn, Dz) + '\\;\\mathrm{rad/s}'));
      blocks.push(EQ('\\zeta = \\frac{a_1}{2\\,\\omega_n} = \\frac{' + tnum(d[1], D) + '}{2\\cdot ' + tnum(so.wn, Dz) + '} = ' + tnum(so.zeta, Dz)));
      blocks.push(EQ('K = \\frac{b_0}{a_0} = \\frac{' + tnum(b0, D) + '}{' + tnum(a0, D) + '} = ' + tnum(so.K, D)));
      if (isNum(so.wd)) blocks.push(EQ('\\omega_d = \\omega_n\\sqrt{1-\\zeta^{2}} = ' + tnum(so.wd, D) + '\\;\\mathrm{rad/s}'));
      blocks.push(EQ('\\sigma = \\zeta\\,\\omega_n = ' + tnum(so.sigma, D) + '\\;\\mathrm{s^{-1}}'));
      var items = [
        { id: 'wn', label: 'Frecuencia natural', tex: '\\omega_n', value: so.wn, unit: 'rad/s', digits: zd },
        { id: 'zeta', label: 'Amortiguamiento', tex: '\\zeta', value: so.zeta, unit: '', digits: zd },
        { id: 'K', label: 'Ganancia estática', tex: 'K', value: so.K, unit: '' }
      ];
      if (isNum(so.wd)) items.push({ id: 'wd', label: 'Frecuencia amortiguada', tex: '\\omega_d', value: so.wd, unit: 'rad/s' });
      blocks.push({ t: 'params', digits: D, items: items });
      if (DAMPING_TEXT[so.damping]) {
        blocks.push(NOTE('info', DAMPING_TEXT[so.damping] + (zd
          ? ' Con ' + D + ' cifras, ζ se escribiría ' + fmt(so.zeta, D) + ', justo la frontera entre regímenes; por eso aquí ωn y ζ llevan ' + Dz + ' cifras.'
          : '')));
      }
    } else {
      var why = pureLowOrderWhy(A);
      if (why) {
        blocks.push(P(why));
        blocks.push(P('Forma mónica y factorizada:'));
      } else {
        blocks.push(P('No es un primer ni un segundo orden puro, así que K, τ, ωn y ζ no describen por sí solos la respuesta: la caracterizan sus polos y ceros (paso 5). Forma mónica y factorizada:'));
      }
      blocks.push(EQ('G(s) = ' + G.toTex({ digits: D })));
      blocks.push(EQ('G(s) = ' + G.toTexFactored({ digits: Math.max(D, A.rd) })));
      // Parámetros del denominador cuando este sí tiene forma estándar (por ejemplo, un cero en el numerador).
      if (G.order === 2 && d[2] > 0) {
        var sd = new (TFC())([d[2]], d).secondOrderParams();
        if (sd) {
          blocks.push(P('El denominador sí tiene la forma estándar s² + 2ζωn·s + ωn², pero el numerador añade ceros que cambian la forma de la respuesta:'));
          blocks.push(EQ('\\omega_n = ' + tnum(sd.wn, D) + '\\;\\mathrm{rad/s}, \\qquad \\zeta = ' + tnum(sd.zeta, D)));
        }
      } else if (G.order === 1 && d[1] > 0) {
        var fd = new (TFC())([d[1]], d).firstOrderParams();
        if (fd) {
          blocks.push(P('El denominador es de primer orden; el numerador añade un término directo:'));
          blocks.push(EQ('\\tau = \\frac{1}{a_0} = ' + tnum(fd.tau, D) + '\\;\\mathrm{s}'));
        }
      }
      blocks.push(NOTE('info', A.dc.note));
    }
    if (res.source === 'sistema') {
      var c = findStep(res.derivation, 'canonica');
      if (c) {
        blocks.push(SUB('Lectura física'));
        blocks = blocks.concat(sysStepBlocks(c, false));
      }
    }
    return { id: 'canonica', title: 'Forma canónica y parámetros', blocks: blocks };
  }

  function step5(res, A) {
    var G = A.G;
    var r = G.routh();
    var blocks = [];
    blocks.push(P('Los polos son las raíces del denominador (la ecuación característica) y los ceros, las del numerador. La estabilidad depende solo de los polos: todos deben tener parte real negativa.'));
    blocks.push(EQ(tpoly(G.den, A.cd) + ' = 0'));
    blocks.push(EQ(rootsTex(A.poleGroups, 'p', 'ds-tex-pole', A.rd).join(', \\qquad '), 'tf-poles'));
    if (A.zeroGroups.length) blocks.push(EQ(rootsTex(A.zeroGroups, 'z', 'ds-tex-zero', A.rd).join(', \\qquad '), 'tf-zeros'));
    else blocks.push(P('G(s) no tiene ceros finitos: el numerador es una constante.'));
    blocks.push(SUB('Criterio de Routh-Hurwitz'));
    blocks.push(P('Sin calcular las raíces, la tabla dice cuántas hay en el semiplano derecho: tantas como cambios de signo en la primera columna.'));
    blocks.push({ t: 'routh', labels: r.labels.slice(), tex: r.tex.map(function (row) { return row.slice(); }), signs: r.limitSigns.slice() });
    blocks.push(LIST(r.notes));
    var v = VERDICT[A.stab.verdict];
    blocks.push(NOTE(v.tone, v.label + '. ' + A.stab.reason, 'tf-verdict'));
    return { id: 'polos', title: 'Polos, ceros y estabilidad', blocks: blocks };
  }

  function step6(res, A) {
    var G = A.G;
    var pf = G.partialFractionsStep();
    var sa = G.stepAnalytic();
    var blocks = [];
    blocks.push(P('Con una entrada escalón unitario, U(s) = 1/s y la salida es Y(s) = G(s)/s. Se descompone en fracciones parciales: cada residuo es el peso con que aparece cada modo en la respuesta.'));
    var dTex = tpoly(G.den, A.cd);
    blocks.push(EQ('Y(s) = \\frac{G(s)}{s} = \\frac{' + tpoly(G.num, A.cd) + '}{s\\left(' + dTex + '\\right)}'));
    blocks.push(EQ('Y(s) = ' + pfSumTex(pf, A.rd), 'tf-pf-sum'));
    blocks.push({ t: 'pf', rows: pf.map(function (e) {
      return { pole: complexTex(e.pole, A.rd), power: e.power, residue: complexTex(e.residue, A.rd) };
    }) });
    blocks.push(SUB('Transformada inversa'));
    blocks.push(EQ('\\mathcal{L}^{-1}\\left\\{\\frac{1}{s - p}\\right\\} = e^{p t}'));
    if (pf.some(function (e) { return e.power > 1; })) {
      blocks.push(EQ('\\mathcal{L}^{-1}\\left\\{\\frac{1}{(s - p)^{k}}\\right\\} = \\frac{t^{k-1}}{(k-1)!}\\,e^{p t}'));
    }
    if (sa.exact) {
      blocks.push(EQ(sa.tex, 'tf-yt'));
    } else {
      blocks.push(NOTE('warning', 'No se obtuvo una expresión analítica fiable: la curva se calcula por simulación numérica.', 'tf-yt'));
    }
    if (sa.notes.length) blocks.push(LIST(sa.notes));
    return { id: 'escalon', title: 'Respuesta al escalón: fracciones parciales y transformada inversa', blocks: blocks };
  }

  function metricRows(A) {
    var info = A.info;
    var so = A.so && A.so.canonical ? A.so : null;
    var fo = A.fo;
    var rows = [];
    rows.push({
      id: 'tr', label: 'Tiempo de subida (10–90 %)', tex: 't_r', value: info.riseTime, unit: 's',
      formula: fo ? 't_r = \\tau\\ln 9' : null, formulaValue: null, kind: fo ? 'exacta' : null
    });
    rows.push({
      id: 'tp', label: 'Tiempo de pico', tex: 't_p', value: info.peakTime, unit: 's',
      formula: so ? 't_p = \\frac{\\pi}{\\omega_d}' : null, formulaValue: so ? so.canonical.peakTime : null, kind: so ? 'exacta' : null
    });
    rows.push({
      id: 'mp', label: 'Sobrepaso', tex: 'M_p', value: info.overshootPct, unit: '%',
      formula: so ? 'M_p = 100\\,e^{-\\zeta\\pi/\\sqrt{1-\\zeta^{2}}}' : null, formulaValue: so ? so.canonical.overshootPct : null, kind: so ? 'exacta' : null
    });
    rows.push({
      id: 'ts', label: 'Tiempo de establecimiento (2 %)', tex: 't_s', value: info.settlingTime, unit: 's',
      formula: so ? 't_s \\approx \\frac{4}{\\zeta\\omega_n}' : fo ? 't_s = \\tau\\ln 50' : null,
      formulaValue: so ? so.canonical.settlingTime : null, kind: so ? 'aproximada' : fo ? 'exacta' : null
    });
    return rows;
  }

  /** Frase del paso 7 según el caso: primer orden, segundo orden subamortiguado o sin fórmula canónica. */
  function metricsSentence(A) {
    // El muestreo real (muestras, ventana, banda) lo da la nota de stepInfo(), que se lista debajo de la tabla.
    var lead = 'Las métricas se miden sobre la respuesta calculada. ';
    if (A.fo) return lead + 'Para un primer orden puro se comparan con τ·ln 9 y τ·ln 50, que son exactas; la tabla lo indica.';
    if (A.so && A.so.canonical) return lead + 'Para un segundo orden puro subamortiguado se comparan con las fórmulas canónicas; la tabla indica cuáles son exactas y cuáles aproximadas.';
    return lead + 'Sin fórmula canónica: los valores se miden sobre la curva.';
  }

  function step7(res, A) {
    var G = A.G;
    var info = A.info;
    var blocks = [];
    if (info.stable) {
      blocks.push(P('Como todos los polos de s·Y(s) están en el semiplano izquierdo, se aplica el teorema del valor final:'));
      blocks.push(EQ('y_\\infty = \\lim_{t\\to\\infty} y(t) = \\lim_{s\\to 0} s\\,Y(s) = G(0) = \\frac{' + tnum(G.num[G.num.length - 1], A.cd) + '}{' + tnum(G.den[G.den.length - 1], A.cd) + '} = ' + tnum(info.finalValue, A.cd), 'tf-final'));
      blocks.push(P(metricsSentence(A)));
      blocks.push({ t: 'metrics', rows: metricRows(A) });
    } else {
      blocks.push(NOTE(A.stab.verdict === 'marginal' ? 'warning' : 'danger',
        'El teorema del valor final no se aplica: exige que todos los polos de s·Y(s) estén en el semiplano izquierdo. ' + A.stab.reason, 'tf-final'));
    }
    if (info.notes.length) blocks.push(LIST(info.notes));
    return { id: 'metricas', title: 'Valor final y métricas', blocks: blocks };
  }

  function findStep(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function buildProcedure(res, A) {
    if (res.kind === 'diag') {
      return res.derivation.map(function (s) {
        return { id: s.id, title: s.title, blocks: sysStepBlocks(s, false) };
      });
    }
    return [step1(res, A), step2(res, A), step3(res, A), step4(res, A), step5(res, A), step6(res, A), step7(res, A)];
  }

  /* ================================================================== montaje */

  function mount(root) {
    var ui = UI();
    var alive = true;
    var inited = false;
    var pendingOpen = null;
    var cleanups = [];
    var timers = [];
    var catalogue = buildCatalogue();
    var activeCache = {};
    var charts = { step: null, pz: null, bode: null, impulse: null };
    var showImpulse = false;
    var frame = null;
    var frameMode = null;
    var current = null;      // { res, A, steps }
    var lastSteps = null;
    var stepViews = [];      // [{ coll, body, desc, sig, nodes, rendered, dirty, live, li }]
    var introDone = false;
    var lazy = null;         // DSL.util.lazyInit (FND-07) o null (respaldo con util.onVisible)
    var phasesDone = false;
    var procGen = 0;         // generación del procedimiento: descarta continuaciones viejas
    var pumpSoon = false;    // pintado de pasos cercanos pendiente (siguiente tarea)
    var pumpIdle = null;     // pintado en reposo de pasos lejanos pendiente
    var stepIO = null;       // IntersectionObserver de los pasos (pinta los sucios al acercarse)
    root.removeAttribute('data-lazy');

    var firstTf = null;
    for (var ci = 0; ci < catalogue.length; ci++) if (catalogue[ci].kind === 'tf') { firstTf = catalogue[ci]; break; }
    var state = {
      mode: firstTf ? 'sistema' : 'estandar',
      sys: { entryId: firstTf ? firstTf.id : null, params: firstTf ? DSL.systems.defaults(firstTf.modelId, firstTf.variant) : {} },
      std: { order: 2, K: STD_PARAMS.K.value, tau: STD_PARAMS.tau.value, zeta: STD_PARAMS.zeta.value, wn: STD_PARAMS.wn.value },
      custom: { num: CUSTOM_DEFAULT.num, den: CUSTOM_DEFAULT.den },
      customError: null
    };

    function later(fn, ms) {
      var id = setTimeout(function () {
        var i = timers.indexOf(id);
        if (i >= 0) timers.splice(i, 1);
        if (alive) fn();
      }, ms);
      timers.push(id);
      return id;
    }

    function entryById(id) {
      for (var i = 0; i < catalogue.length; i++) if (catalogue[i].id === id) return catalogue[i];
      return null;
    }

    /* ---------------------------------------------------------------- TeX */
    function trustHtmlClass(ctx) { return ctx.command === '\\htmlClass'; }
    function renderTex(el, tex, display, htmlOnly) {
      var k = window.katex;
      if (k && typeof k.render === 'function') {
        try {
          // Estilo de bloque (\displaystyle) sin el modo «display» de KaTeX: alineado a la izquierda y sin márgenes propios.
          k.render((display ? '\\displaystyle ' : '') + String(tex), el, {
            displayMode: false, throwOnError: false, strict: 'ignore',
            output: htmlOnly ? 'html' : 'htmlAndMathml', trust: trustHtmlClass
          });
          el.classList.remove('tex-fallback');
          return true;
        } catch (err) { /* cae al respaldo de texto */ }
      }
      return LX().render(el, String(tex).replace(/\\htmlClass\{[^}]*\}/g, ''), { display: !!display });
    }
    function texEl(tag, cls, tex, display, extra) {
      var props = Object.assign({ class: cls, translate: 'no' }, extra || {});
      var e = h(tag, props);
      renderTex(e, tex, display);
      e.setAttribute('data-tex-src', tex);
      return e;
    }
    function setTex(el, tex, display) {
      if (el.getAttribute('data-tex-src') === tex) return false;
      renderTex(el, tex, display);
      el.setAttribute('data-tex-src', tex);
      return true;
    }

    /* ---------------------------------------------------------------- encabezado */
    var head = h('header', { class: 'tf-head' },
      h('h2', { id: 'transferencia-title' }, 'Motor de funciones de transferencia'),
      h('p', { class: 'tf-lede' }, 'Elija un sistema, una forma estándar o escriba los coeficientes de G(s). El motor la obtiene con condiciones iniciales nulas, la resuelve paso a paso y dibuja cómo responde.'));

    /* ---------------------------------------------------------------- panel «Desde un sistema» */
    var sysPanel = h('div', { class: 'tf-mode-panel', 'data-testid': 'tf-panel-sistema' });
    var sysSelectId = util.uid('tf-sys');
    var sysSelect = h('select', { id: sysSelectId, 'data-testid': 'tf-system' });
    var cats = (DSL.systems && DSL.systems.CATEGORIES) || {};
    Object.keys(cats).forEach(function (cat) {
      var items = catalogue.filter(function (e) { return e.category === cat; });
      if (!items.length) return;
      var g = h('optgroup', { label: cats[cat] });
      items.forEach(function (e) { g.appendChild(h('option', { value: e.id }, e.label)); });
      sysSelect.appendChild(g);
    });
    var sysIo = h('div', { class: 'tf-io', 'data-testid': 'tf-io' });
    var sysSliders = h('div', { class: 'tf-sliders', 'data-testid': 'tf-sys-sliders' });
    var sysInactive = h('p', { class: 'ds-hint tf-inactive', 'data-testid': 'tf-inactive' });
    sysInactive.hidden = true;
    var sysReset = ui.button({ label: 'Restablecer parámetros', icon: 'rotate-ccw', variant: 'ghost', size: 'sm', testid: 'tf-reset-params', onClick: function () { resetSystemParams(); } });
    if (catalogue.length) {
      sysPanel.appendChild(h('div', { class: 'ds-field tf-field' },
        h('label', { class: 'ds-label', for: sysSelectId }, 'Sistema'),
        h('span', { class: 'ds-select tf-select' }, sysSelect)));
      sysPanel.appendChild(sysIo);
      sysPanel.appendChild(sysSliders);
      sysPanel.appendChild(sysInactive);
      sysPanel.appendChild(h('div', { class: 'tf-panel-foot' }, sysReset));
    } else {
      sysPanel.appendChild(h('p', { class: 'ds-hint' }, 'Los modelos de sistemas no están cargados: use la forma estándar o la personalizada.'));
    }
    var sysSliderHandles = [];

    function activeParams(entry) {
      if (activeCache[entry.id]) return activeCache[entry.id];
      var S = DSL.systems;
      var model = S.get(entry.modelId);
      var d = S.describe(model, entry.variant);
      var base = d.defaults;
      var sig = function (p) {
        var t = entry.kind === 'tf' ? model.tf(p, entry.variant, entry.outputKey) : null;
        return (t && t.tf ? t.tf.toTex({ digits: 8 }) : '') + '|' + JSON.stringify(model.derivation(p, entry.variant, entry.outputKey));
      };
      var s0 = sig(base);
      var active = [];
      var inactive = [];
      d.params.forEach(function (ps) {
        var alt = Object.assign({}, base);
        alt[ps.key] = ps.default !== ps.max ? ps.max : ps.min;
        var used = true;
        try { used = sig(alt) !== s0; } catch (err) { used = true; }
        (used ? active : inactive).push(ps);
      });
      activeCache[entry.id] = { active: active, inactive: inactive, defaults: base };
      return activeCache[entry.id];
    }

    function renderSysIo(entry) {
      sysIo.textContent = '';
      var model = DSL.systems.get(entry.modelId);
      if (entry.kind !== 'tf') {
        sysIo.appendChild(h('p', { class: 'tf-io__text' }, entry.discrete
          ? 'Modelo de tiempo discreto: se describe con ecuaciones en diferencias y G(z), no con G(s).'
          : 'Modelo no lineal: no tiene una G(s) global. El procedimiento explica por qué.'));
        return;
      }
      var t = model.tf(state.sys.params, entry.variant, entry.outputKey);
      sysIo.appendChild(texEl('div', 'tf-io__pair ds-math', 'G(s) = \\frac{' + t.outputSymbol + '}{' + t.inputSymbol + '}', true));
      sysIo.appendChild(h('p', { class: 'tf-io__text' },
        h('span', { class: 'tf-io__k' }, 'Entrada: '), t.inputLabel + '. ',
        h('span', { class: 'tf-io__k' }, 'Salida: '), t.outputLabel + '.'));
    }

    function buildSysSliders(entry) {
      sysSliderHandles.forEach(function (s) { s.destroy(); });
      sysSliderHandles = [];
      sysSliders.textContent = '';
      var ap = activeParams(entry);
      ap.active.forEach(function (ps) {
        var f = ps.display && isNum(ps.display.factor) ? ps.display.factor : 1;
        var unit = ps.display && ps.display.unit ? ps.display.unit : ps.unit;
        var s = ui.slider({
          label: ps.label, symbol: ps.symbol, unit: unit,
          min: clean(ps.min * f), max: clean(ps.max * f), step: clean(ps.step * f),
          value: clean(state.sys.params[ps.key] * f), defaultValue: clean(ps.default * f),
          scale: ps.scale === 'log' ? 'log' : 'linear', tooltip: ps.tooltip, testid: 'tf-param-' + ps.key,
          onInput: function (v) { state.sys.params[ps.key] = v / f; schedule('drag'); },
          onChange: function (v) { state.sys.params[ps.key] = v / f; schedule('release'); }
        });
        s.key = ps.key;
        s.factor = f;
        var sym = s.el.querySelector('.ds-slider__sym');
        if (sym) { sym.setAttribute('aria-hidden', 'true'); renderTex(sym, ps.symbol, false, true); }
        sysSliders.appendChild(s.el);
        sysSliderHandles.push(s);
      });
      if (ap.inactive.length) {
        sysInactive.textContent = 'No intervienen en G(s): ' + ap.inactive.map(function (p) { return p.label.toLowerCase(); }).join(', ') + '.';
        sysInactive.hidden = false;
      } else {
        sysInactive.hidden = true;
      }
    }

    function loadEntry(entry, params) {
      if (!entry) return;
      var S = DSL.systems;
      var d = S.describe(entry.modelId, entry.variant);
      var p = Object.assign({}, d.defaults);
      if (params && typeof params === 'object') {
        d.params.forEach(function (ps) {
          var v = Number(params[ps.key]);
          if (isFinite(v)) p[ps.key] = Math.min(ps.max, Math.max(ps.min, v));
        });
      }
      state.sys.entryId = entry.id;
      state.sys.params = p;
      sysSelect.value = entry.id;
      buildSysSliders(entry);
      renderSysIo(entry);
      sysReset.hidden = !activeParams(entry).active.length;
    }

    function resetSystemParams() {
      var entry = entryById(state.sys.entryId);
      if (!entry) return;
      var before = Object.assign({}, state.sys.params);
      var defs = activeParams(entry).defaults;
      setSysParams(defs);
      ui.toast('Parámetros restablecidos.', {
        tone: 'neutral', testid: 'tf-toast',
        action: { label: 'Deshacer', onClick: function () { setSysParams(before); } }
      });
    }

    function setSysParams(p) {
      state.sys.params = Object.assign({}, p);
      sysSliderHandles.forEach(function (s) { s.set(state.sys.params[s.key] * s.factor, { silent: true }); });
      schedule('release');
    }

    sysSelect.addEventListener('change', function () {
      var e = entryById(sysSelect.value);
      if (!e) return;
      loadEntry(e, null);
      schedule('release', { newSystem: true });
    });

    /* ---------------------------------------------------------------- panel «Forma estándar» */
    var stdPanel = h('div', { class: 'tf-mode-panel', 'data-testid': 'tf-panel-estandar' });
    var stdOrder = ui.segmented({
      options: [{ value: 1, label: '1.er orden' }, { value: 2, label: '2.º orden' }],
      value: state.std.order, label: 'Orden del sistema', testid: 'tf-std-order',
      onChange: function (v) { state.std.order = Number(v); syncStd(); schedule('release', { newSystem: true }); }
    });
    var stdForm = h('div', { class: 'tf-std-form ds-math', 'data-testid': 'tf-std-form', translate: 'no' });
    var stdSliders = {};
    var stdSliderWrap = h('div', { class: 'tf-sliders' });
    Object.keys(STD_PARAMS).forEach(function (key) {
      var o = STD_PARAMS[key];
      var s = ui.slider({
        label: o.label, symbol: o.symbol, unit: o.unit, min: o.min, max: o.max, step: o.step, value: o.value, defaultValue: o.value,
        scale: o.scale || 'linear', tooltip: o.tooltip, testid: 'tf-std-' + key,
        onInput: function (v) { state.std[key] = v; schedule('drag'); },
        onChange: function (v) { state.std[key] = v; schedule('release'); }
      });
      var sym = s.el.querySelector('.ds-slider__sym');
      if (sym) { sym.setAttribute('aria-hidden', 'true'); renderTex(sym, o.symbol, false, true); }
      stdSliders[key] = s;
      stdSliderWrap.appendChild(s.el);
    });
    var stdReset = ui.button({ label: 'Restablecer parámetros', icon: 'rotate-ccw', variant: 'ghost', size: 'sm', testid: 'tf-reset-std', onClick: function () { resetStd(); } });
    stdPanel.appendChild(h('div', { class: 'ds-field tf-field' }, h('span', { class: 'ds-label' }, 'Orden'), stdOrder.el));
    stdPanel.appendChild(stdForm);
    stdPanel.appendChild(stdSliderWrap);
    stdPanel.appendChild(h('div', { class: 'tf-panel-foot' }, stdReset));

    function syncStd() {
      var keys = STD_KEYS[state.std.order];
      Object.keys(stdSliders).forEach(function (k) { stdSliders[k].el.hidden = keys.indexOf(k) < 0; });
      setTex(stdForm, state.std.order === 1
        ? 'G(s) = \\frac{K}{\\tau s + 1}'
        : 'G(s) = \\frac{K\\,\\omega_n^{2}}{s^{2} + 2\\zeta\\omega_n\\,s + \\omega_n^{2}}', true);
    }

    function resetStd() {
      var before = { K: state.std.K, tau: state.std.tau, zeta: state.std.zeta, wn: state.std.wn };
      var apply = function (vals) {
        Object.keys(vals).forEach(function (k) { state.std[k] = vals[k]; stdSliders[k].set(vals[k], { silent: true }); });
        schedule('release');
      };
      apply({ K: STD_PARAMS.K.value, tau: STD_PARAMS.tau.value, zeta: STD_PARAMS.zeta.value, wn: STD_PARAMS.wn.value });
      ui.toast('Parámetros restablecidos.', { tone: 'neutral', testid: 'tf-toast', action: { label: 'Deshacer', onClick: function () { apply(before); } } });
    }

    /* ---------------------------------------------------------------- panel «Personalizada» */
    var customPanel = h('div', { class: 'tf-mode-panel', 'data-testid': 'tf-panel-personalizada' });
    function coefField(key, label, hint) {
      var id = util.uid('tf-' + key);
      var hintId = util.uid('tf-' + key + '-hint');
      var errId = util.uid('tf-' + key + '-err');
      var input = h('input', {
        id: id, type: 'text', class: 'ds-input tf-coef', autocomplete: 'off', spellcheck: 'false',
        'aria-describedby': hintId + ' ' + errId, 'data-testid': 'tf-' + key, value: state.custom[key]
      });
      var err = h('p', { class: 'ds-error tf-coef-error', id: errId, 'data-testid': 'tf-' + key + '-error', role: 'alert' });
      err.hidden = true;
      var field = h('div', { class: 'ds-field tf-field' },
        h('label', { class: 'ds-label', for: id }, label),
        input,
        h('p', { class: 'ds-hint', id: hintId }, hint),
        err);
      return { field: field, input: input, err: err };
    }
    var numField = coefField('num', 'Numerador', 'Coeficientes de b(s) en potencias descendentes de s, separados por espacios.');
    var denField = coefField('den', 'Denominador', 'Coeficientes de a(s), grado 1 a 4. Por ejemplo, 1 2 5 es s² + 2s + 5. Se acepta la coma decimal.');
    var customDegree = h('p', { class: 'tf-degree', 'data-testid': 'tf-custom-degree' });
    // Coeficiente principal despreciable que el motor recorta (TFE-08): se dice qué grado se tomó.
    var trimNote = h('p', { class: 'ds-hint tf-trim-note', role: 'status', 'data-testid': 'tf-trim-note' });
    var presetWrap = h('div', { class: 'tf-presets ds-cluster', role: 'group', 'aria-label': 'Ejemplos' });
    PRESETS.forEach(function (p) {
      presetWrap.appendChild(ui.button({
        label: p.label, variant: 'ghost', size: 'sm', testid: 'tf-preset-' + p.id, className: 'tf-preset',
        onClick: function () {
          numField.input.value = p.num;
          denField.input.value = p.den;
          readCustom('release');
        }
      }));
    });
    customPanel.appendChild(numField.field);
    customPanel.appendChild(denField.field);
    customPanel.appendChild(customDegree);
    customPanel.appendChild(trimNote);
    customPanel.appendChild(h('div', { class: 'tf-presets-wrap' }, h('p', { class: 'ds-label tf-presets-title' }, 'Ejemplos'), presetWrap));

    var customDebounce = util.debounce(function () { readCustom('release'); }, 320);
    function readCustom(mode) {
      var num = numField.input.value;
      var den = denField.input.value;
      // Enter seguido de «change» (o el mismo ejemplo dos veces) no repite el cálculo ni el aviso.
      if (num === state.custom.num && den === state.custom.den && (current || state.customError)) return;
      state.custom.num = num;
      state.custom.den = den;
      // Otra G(s): sin curva fantasma de la anterior (TFE-14).
      schedule(mode || 'release', { fresh: true });
    }
    [numField, denField].forEach(function (f) {
      f.input.addEventListener('input', function () { customDebounce(); });
      f.input.addEventListener('change', function () { customDebounce.cancel(); readCustom('release'); });
      f.input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); customDebounce.cancel(); readCustom('release'); }
      });
    });

    function showCustomError(err) {
      [numField, denField].forEach(function (f) {
        var mine = err && (err.field === (f === numField ? 'num' : 'den') || (!err.field && f === denField));
        if (mine) {
          f.input.setAttribute('aria-invalid', 'true');
          f.err.textContent = err.message;
          f.err.hidden = false;
        } else {
          f.input.removeAttribute('aria-invalid');
          f.err.textContent = '';
          f.err.hidden = true;
        }
      });
    }

    /* ---------------------------------------------------------------- pestañas de modo */
    var panels = { sistema: sysPanel, estandar: stdPanel, personalizada: customPanel };
    // La barra de modos abarca todo el ancho; los paneles viven en la columna de controles.
    var modeTabs = ui.tabs({
      tabs: MODES.map(function (m) { return { id: m.id, label: m.label, panel: panels[m.id] }; }),
      value: state.mode, label: 'Modo de entrada', testid: 'tf-mode', className: 'tf-modebar', placePanels: false,
      onChange: function (id) { state.mode = id; schedule('release', { newSystem: true }); }
    });
    var controls = h('div', { class: 'tf-controls ds-panel', 'data-testid': 'tf-controls' }, sysPanel, stdPanel, customPanel);

    /* ---------------------------------------------------------------- panel G(s) */
    var gTitleId = util.uid('tf-gt');
    var gTex = h('div', { class: 'tf-g', 'data-testid': 'tf-g', translate: 'no' });
    var gRoots = h('div', { class: 'tf-roots', 'data-testid': 'tf-roots' });
    var gChips = h('div', { class: 'tf-chips ds-cluster', 'data-testid': 'tf-chips' });
    var gNotes = h('div', { class: 'tf-gnotes' });
    // Entrada no válida: la última G(s) válida sigue a contraste pleno y este distintivo dice que está desactualizada.
    var gStale = h('p', { class: 'tf-stale-badge', 'data-testid': 'tf-stale-badge' },
      ui.icon('triangle-alert', { size: 16 }), h('span', null, 'Desactualizado: corrija la entrada'));
    gStale.hidden = true;
    var gPanel = h('section', { class: 'tf-gpanel ds-panel', 'aria-labelledby': gTitleId, 'data-testid': 'tf-gpanel' },
      h('h3', { id: gTitleId, class: 'sr-only' }, 'Función de transferencia'),
      gStale, gTex, h('div', { class: 'tf-gside' }, gRoots, gChips), gNotes);

    /* ---------------------------------------------------------------- procedimiento */
    var procTitleId = util.uid('tf-pt');
    var stepList = h('ol', { class: 'tf-steps', 'data-testid': 'tf-steps' });
    var nextBtn = ui.button({ label: 'Paso siguiente', icon: 'step-forward', variant: 'secondary', size: 'sm', testid: 'tf-next', onClick: function () { nextStep(); } });
    var allBtn = ui.button({ label: 'Mostrar todo', icon: 'chevrons-up-down', variant: 'ghost', size: 'sm', testid: 'tf-show-all', onClick: function () { toggleAll(); } });
    // Barra del procedimiento (título y acciones): queda fija bajo la cabecera mientras se recorren los
    // pasos, así «Paso siguiente» nunca se va de la pantalla (TFE-01). Superficie opaca, sin desenfoque.
    // En teléfono solo quedan fijas las acciones (la cabecera pasa a display: contents en el CSS).
    var procActions = h('div', { class: 'tf-proc__actions ds-cluster' }, nextBtn, allBtn);
    var procHead = h('div', { class: 'tf-proc__head', 'data-testid': 'tf-proc-bar' },
      h('h3', { id: procTitleId, class: 'tf-proc__title' }, 'Procedimiento paso a paso'),
      procActions);
    var procPanel = h('section', { class: 'tf-proc ds-panel', 'aria-labelledby': procTitleId, 'data-testid': 'tf-proc' },
      procHead,
      stepList);

    /* ---------------------------------------------------------------- gráficas y métricas */
    function fig(cls, title, frameCls, canvasId, extra) {
      var canvas = h('canvas', { 'data-testid': canvasId });
      var frameEl = h('div', { class: 'ch-frame ' + frameCls }, canvas);
      // h4: las figuras cuelgan del h3 «Gráficas y métricas» (TFE-12).
      var titleEl = h('h4', { class: 'tf-fig__title' }, title);
      var headEl = h('div', { class: 'tf-fig__head' }, titleEl, extra || null);
      var el = h('figure', { class: 'tf-fig ' + cls }, headEl, frameEl);
      return { el: el, canvas: canvas, frame: frameEl, head: headEl };
    }
    var impulseToggle = ui.toggle({ label: 'Respuesta al impulso', testid: 'tf-impulse-toggle', onChange: function (on) { setImpulse(on); } });
    var figStep = fig('tf-fig--step', 'Respuesta al escalón', 'tf-frame-step', 'tf-chart-step', impulseToggle.el);
    var figPz = fig('tf-fig--pz', 'Mapa de polos y ceros', 'tf-frame-pz', 'tf-chart-pz');
    var figImpulse = fig('tf-fig--impulse', 'Respuesta al impulso', 'tf-frame-impulse', 'tf-chart-impulse');
    var impulseNote = h('p', { class: 'ds-hint tf-fig__note', 'data-testid': 'tf-impulse-note' });
    figImpulse.el.appendChild(impulseNote);
    figImpulse.el.hidden = true;
    var bodePhaseCanvas = h('canvas', { 'data-testid': 'tf-chart-bode-phase' });
    var bodeMagCanvas = h('canvas', { 'data-testid': 'tf-chart-bode-mag' });
    var figBode = h('figure', { class: 'tf-fig tf-fig--bode' },
      h('div', { class: 'tf-fig__head' }, h('h4', { class: 'tf-fig__title' }, 'Diagrama de Bode')),
      h('div', { class: 'ch-frame tf-frame-bode' }, bodeMagCanvas),
      h('div', { class: 'ch-frame tf-frame-bode' }, bodePhaseCanvas));

    // Tarjetas de métricas.
    var METRICS = [
      { id: 'final', label: 'Valor final', tex: 'y_\\infty', unit: '' },
      { id: 'mp', label: 'Sobrepaso', tex: 'M_p', unit: '%' },
      { id: 'tp', label: 'Tiempo de pico', tex: 't_p', unit: 's' },
      { id: 'tr', label: 'Tiempo de subida', tex: 't_r', unit: 's' },
      { id: 'ts', label: 'Establecimiento', tex: 't_s', unit: 's' }
    ];
    var metricViews = {};
    var metricsGrid = h('div', { class: 'tf-metrics__grid' });
    METRICS.forEach(function (m) {
      var sym = h('span', { class: 'tf-metric__sym', 'aria-hidden': 'true', translate: 'no' });
      renderTex(sym, m.tex, false, true);
      var num = h('span', { class: 'tf-metric__num', 'data-testid': 'tf-metric-' + m.id + '-value' });
      var unit = h('span', { class: 'tf-metric__unit' });
      var sub = h('p', { class: 'tf-metric__sub', 'data-testid': 'tf-metric-' + m.id + '-sub' });
      var card = h('div', { class: 'tf-metric', 'data-testid': 'tf-metric-' + m.id },
        h('p', { class: 'tf-metric__label' }, sym, h('span', null, m.label)),
        h('p', { class: 'tf-metric__value' }, num, unit),
        sub);
      metricsGrid.appendChild(card);
      metricViews[m.id] = { card: card, num: num, unit: unit, sub: sub, def: m };
    });
    var metricsNote = h('p', { class: 'tf-metrics__note ds-hint', 'data-testid': 'tf-metrics-note' });
    var metricsEl = h('div', { class: 'tf-metrics', role: 'group', 'aria-label': 'Métricas de la respuesta al escalón', 'data-testid': 'tf-metrics' }, metricsGrid, metricsNote);

    var chartsTitleId = util.uid('tf-ct');
    var chartsEl = h('section', { class: 'tf-charts', 'aria-labelledby': chartsTitleId, 'data-testid': 'tf-charts' },
      h('h3', { id: chartsTitleId, class: 'sr-only' }, 'Gráficas y métricas'),
      h('div', { class: 'tf-charts__top' }, figStep.el, figPz.el),
      metricsEl,
      figImpulse.el,
      figBode);
    var galleryBtn = ui.button({ label: 'Ver en la galería', icon: 'arrow-up-right', variant: 'secondary', size: 'sm', testid: 'tf-diag-gallery', onClick: function () {
      var e = entryById(state.sys.entryId);
      if (e) DSL.bus.emit('gallery:open', { systemId: e.modelId, variant: e.variant });
    } });
    var chartsEmpty = h('div', { class: 'tf-charts-empty ds-panel', 'data-testid': 'tf-charts-empty' },
      h('p', null, 'Sin G(s) no hay respuesta al escalón, mapa de polos ni diagrama de Bode que dibujar. El comportamiento de este modelo se explora en la simulación de la galería.'),
      galleryBtn);
    chartsEmpty.hidden = true;

    var main = h('div', { class: 'tf-main' }, gPanel, procPanel, chartsEl, chartsEmpty);
    var layout = h('div', { class: 'tf-layout' }, h('div', { class: 'tf-grid' }, controls, main));
    var wrap = h('div', { class: 'tf-root', 'data-testid': 'tf-root' }, head, modeTabs.el, layout);
    root.appendChild(wrap);

    if (firstTf) loadEntry(firstTf, state.sys.params);
    syncStd();

    /* ---------------------------------------------------------------- cálculo */
    function computeCurrent() {
      var TF = TFC();
      if (state.mode === 'sistema') {
        var e = entryById(state.sys.entryId);
        if (!e) return { kind: 'none' };
        var model = DSL.systems.get(e.modelId);
        var p = Object.assign({}, state.sys.params);
        var der = model.derivation(p, e.variant, e.outputKey);
        if (e.kind !== 'tf') return { kind: 'diag', source: 'sistema', entry: e, model: model, derivation: der };
        var t = model.tf(p, e.variant, e.outputKey);
        if (!t || !t.tf) return { kind: 'diag', source: 'sistema', entry: e, model: model, derivation: der };
        return { kind: 'tf', source: 'sistema', entry: e, model: model, meta: t, G: t.tf, derivation: der };
      }
      if (state.mode === 'estandar') {
        var s = state.std;
        var G = s.order === 1 ? TF.fromFirstOrder(s.K, s.tau) : TF.fromSecondOrder(s.K, s.zeta, s.wn);
        return { kind: 'tf', source: 'estandar', order: s.order, G: G };
      }
      var cs = state.custom;
      try {
        var Gc = TF.fromCoeffStrings(cs.num, cs.den);
        return { kind: 'tf', source: 'personalizada', G: Gc, digits: customDigits(cs.num, cs.den), trim: trimNotes(TF, Gc) };
      } catch (err) {
        if (err && err.name === 'TFInputError') {
          return { kind: 'error', field: err.field, code: err.code, message: err.message + commaNote(TF, err.field || 'den') };
        }
        throw err;
      }
    }

    /** Coeficientes principales despreciables que el motor recortó (≤ 1e-14·máx): un aviso por campo. */
    function trimNotes(TF, G) {
      var out = [];
      ['num', 'den'].forEach(function (k) {
        var parsed;
        try { parsed = TF.parseCoeffs(state.custom[k], k); } catch (err) { return; }
        var cut = parsed.length - G.original[k].length;
        if (!(cut > 0)) return;
        var toks = coefTokens(state.custom[k]).slice(0, cut);
        var big = 0;
        parsed.forEach(function (c) { big = Math.max(big, Math.abs(c)); });
        var list = toks.length > 1 ? toks.slice(0, -1).join(', ') + ' y ' + toks[toks.length - 1] : toks[0];
        var deg = G.original[k].length - 1;
        var txt = (cut > 1 ? 'Los coeficientes principales ' + list + ' son despreciables' : 'El coeficiente principal ' + list + ' es despreciable') +
          ' frente a ' + fmt(big) + ': se tomó grado ' + deg + '.';
        out.push(k === 'num' ? 'En el numerador, ' + txt.charAt(0).toLowerCase() + txt.slice(1) : txt);
      });
      return out;
    }

    /** «1,2» leído como un solo coeficiente (coma decimal): se explica cómo separar coeficientes. */
    function commaNote(TF, field) {
      var raw = state.custom[field];
      if (!/,/.test(String(raw || ''))) return '';
      var parsed;
      try { parsed = TF.parseCoeffs(raw, field); } catch (err) { return ''; }
      if (parsed.length !== 1) return '';
      var tok = null;
      coefTokens(raw).forEach(function (t) { if (tok === null && /,/.test(t)) tok = t; });
      if (tok === null) return '';
      return ' La coma se interpretó como separador decimal (' + tok + ' = ' + tok.replace(',', '.') + '): separe los coeficientes con espacios.';
    }

    /**
     * Como mucho un recálculo por frame. opts: newSystem (otro sistema, modo u orden: el procedimiento se
     * rehace), fresh (otra G(s) sin cambiar de modo: ejemplo o coeficientes) y quiet (sin anuncio: carga
     * inicial). newSystem y fresh quitan la curva fantasma (TFE-14); solo los cambios del usuario y tf:open
     * se anuncian (TFE-11).
     */
    function schedule(mode, opts) {
      opts = opts || {};
      if (opts.newSystem) schedule.newSystem = true;
      if (opts.newSystem || opts.fresh) schedule.fresh = true;
      if (!opts.quiet) schedule.loud = true;
      frameMode = mode === 'release' || frameMode === 'release' ? 'release' : 'drag';
      if (!inited) return;
      if (frame !== null) return;
      frame = util.raf(function () {
        frame = null;
        var m = frameMode;
        var flags = { newSystem: !!schedule.newSystem, fresh: !!schedule.fresh, loud: !!schedule.loud };
        frameMode = null;
        schedule.newSystem = schedule.fresh = schedule.loud = false;
        if (!alive) return;
        // Un arrastre se recalcula en este frame. Un cambio discreto (soltar, Enter, ejemplo, sistema) deja
        // que este frame pinte solo la respuesta inmediata del control y calcula en la tarea siguiente
        // (TFE-15): el clic no espera al análisis, las gráficas ni el procedimiento.
        if (m === 'drag' && !flags.newSystem) recompute(m, flags);
        else afterYield(function () { recompute(m, flags); });
      });
    }

    /**
     * Cálculo y vista rápida (G, métricas); devuelve false si no hay nada que dibujar. withSteps: prepara
     * también los descriptores del procedimiento (al soltar; durante un arrastre van con su debounce).
     */
    function computeAndRenderHead(withSteps) {
      var res = computeCurrent();
      if (state.mode === 'personalizada') {
        showCustomError(res.kind === 'error' ? res : null);
        updateDegree(res);
      } else {
        showCustomError(null);
        updateDegree(null);
      }
      if (res.kind === 'error') {
        state.customError = res;
        renderStale(res);
        return false;
      }
      state.customError = null;
      if (res.kind === 'none') return false;
      var A = res.kind === 'tf' ? analyze(res.G, { coefDigits: res.digits }) : null;
      current = { res: res, A: A, steps: withSteps ? buildProcedure(res, A) : null };
      renderG(res, A);
      renderMetrics(res, A);
      return true;
    }

    /**
     * Recálculo (TFE-15): G(s), métricas y gráficas en este frame; el procedimiento, tras ceder el hilo
     * (util.yieldTask o rAF), y solo los pasos abiertos cerca de la vista: los lejanos quedan sucios y se
     * pintan al acercarse o en tiempo ocioso.
     */
    function recompute(mode, flags) {
      flags = flags || {};
      if (!computeAndRenderHead(false)) return;
      var res = current.res;
      var A = current.A;
      if (mode === 'drag' && !flags.newSystem) {
        renderCharts(res, A, mode, flags.fresh);
        procDebounce();
        return;
      }
      // Tareas de unos 50 ms o menos a 4× de CPU: G(s), métricas, escalón y polos → Bode e impulso →
      // procedimiento (descriptores y pasos cercanos). Un recálculo posterior descarta las que falten.
      renderCharts(res, A, mode, flags.fresh, ['step', 'pz']);
      procDebounce.cancel();
      var gen = ++procGen;
      afterYield(function () {
        if (gen !== procGen) return;
        renderCharts(res, A, mode, flags.fresh, ['bode', 'impulse']);
        afterYield(function () {
          if (gen === procGen) renderProcedure(!flags.newSystem, flags.newSystem);
        });
      });
      if (flags.loud) announceDebounce();
    }

    /** Siguiente tarea: util.yieldTask (scheduler.yield) si existe; si no, el siguiente frame. */
    function afterYield(fn) {
      if (typeof util.yieldTask === 'function') {
        var p = null;
        try { p = util.yieldTask(); } catch (err) { p = null; }
        if (p && typeof p.then === 'function') {
          p.then(function () { if (alive) fn(); });
          return;
        }
      }
      util.raf(function () { if (alive) fn(); });
    }

    var procDebounce = util.debounce(function () { procGen++; renderProcedure(true, false); }, 160);
    var announceDebounce = util.debounce(function () { announce(); }, 450);

    function updateDegree(res) {
      var trim = res && res.kind === 'tf' && res.trim ? res.trim.join(' ') : '';
      if (trimNote.textContent !== trim) trimNote.textContent = trim;
      if (!res || res.kind !== 'tf') { customDegree.textContent = ''; return; }
      var G = res.G;
      var m = G.order - (isFinite(G.relativeDegree) ? G.relativeDegree : G.order);
      customDegree.textContent = 'Numerador de grado ' + m + ' y denominador de grado ' + G.order + ': G(s) es ' +
        (G.isStrictlyProper ? 'estrictamente propia.' : 'propia (no estrictamente: tiene término directo).');
    }

    /* ---------------------------------------------------------------- render: G(s) */
    function lhsFor(res) {
      if (res.source === 'sistema' && res.meta) return 'G(s) = \\frac{' + res.meta.outputSymbol + '}{' + res.meta.inputSymbol + '} = ';
      return 'G(s) = ';
    }

    function renderG(res, A) {
      gNotes.textContent = '';
      gPanel.classList.toggle('is-diag', res.kind === 'diag');
      gPanel.classList.remove('is-stale');
      gStale.hidden = true;
      if (res.kind === 'diag') {
        setTex(gTex, 'G(s)\\;\\text{no existe}', true);
        gTex.setAttribute('data-kind', 'diag');
        gRoots.textContent = '';
        gChips.textContent = '';
        var e = res.entry;
        gChips.appendChild(ui.chip({ label: e.discrete ? 'Tiempo discreto' : 'No lineal', tone: 'warning', icon: 'triangle-alert', title: e.discrete ? CHIP_TIPS.discreto : CHIP_TIPS.nolineal }));
        var why = findStep(res.derivation, 'nolineal') || findStep(res.derivation, 'sings') || res.derivation[1] || res.derivation[0];
        var link = e.discrete
          ? { label: 'Ver «Ecuaciones de representación»', payload: { card: 'ecuaciones' } }
          : { label: 'Ver «Linealidad vs. no linealidad»', payload: { card: 'linealidad', tab: 'superposicion' } };
        var btn = ui.button({ label: link.label, icon: 'book-open', variant: 'secondary', size: 'sm', testid: 'tf-diag-concepts', onClick: function () { DSL.bus.emit('concepts:open', link.payload); } });
        gNotes.appendChild(h('div', { class: 'ds-callout ds-callout--warning tf-diag', 'data-testid': 'tf-diagnostic' },
          ui.icon('triangle-alert'),
          h('div', { class: 'tf-diag__body' },
            h('p', { class: 'tf-diag__title' }, why ? why.title : 'Este modelo no tiene una G(s) global'),
            h('p', null, why ? why.text : ''),
            btn)));
        return;
      }
      gTex.setAttribute('data-kind', 'tf');
      var G = A.G;
      var orig = G.toTex({ normalized: false, digits: A.cd });
      var mono = G.toTex({ digits: A.cd });
      setTex(gTex, lhsFor(res) + orig + (orig !== mono ? ' = ' + mono : ''), true);
      // Polos × y ceros ○ (mismos tonos que el mapa).
      gRoots.textContent = '';
      var poles = rootsTex(A.poleGroups, 'p', null, A.rd);
      var zeros = rootsTex(A.zeroGroups, 'z', null, A.rd);
      gRoots.appendChild(h('div', { class: 'tf-roots__row tf-roots__row--pole' },
        h('span', { class: 'tf-glyph tf-glyph--pole', 'aria-hidden': 'true' }, '×'),
        h('span', { class: 'tf-roots__k' }, A.G.poles().length === 1 ? 'Polo' : 'Polos'),
        texEl('span', 'tf-roots__v ds-math', poles.join(',\\quad '), false, { 'data-testid': 'tf-roots-poles' })));
      gRoots.appendChild(h('div', { class: 'tf-roots__row tf-roots__row--zero' },
        h('span', { class: 'tf-glyph tf-glyph--zero', 'aria-hidden': 'true' }, '○'),
        h('span', { class: 'tf-roots__k' }, A.G.zeros().length === 1 ? 'Cero' : 'Ceros'),
        zeros.length ? texEl('span', 'tf-roots__v ds-math', zeros.join(',\\quad '), false, { 'data-testid': 'tf-roots-zeros' })
          : h('span', { class: 'tf-roots__none', 'data-testid': 'tf-roots-zeros' }, 'ninguno finito')));
      gChips.textContent = '';
      var v = VERDICT[A.stab.verdict];
      // Cada ficha explica en una frase lo que afirma (tooltip accesible y texto para lectores de pantalla).
      gChips.appendChild(ui.chip({ label: v.label, tone: v.tone, icon: v.icon, title: CHIP_TIPS[A.stab.verdict], testid: 'tf-stability' }));
      gChips.appendChild(ui.chip({ label: 'Orden ' + G.order, title: CHIP_TIPS.orden, testid: 'tf-order' }));
      gChips.appendChild(ui.chip({ label: G.isStrictlyProper ? 'Estrictamente propia' : 'Propia', title: G.isStrictlyProper ? CHIP_TIPS.estricta : CHIP_TIPS.propia, testid: 'tf-proper' }));
      if (A.dc.kind === 'finito') gChips.appendChild(ui.chip({ label: 'G(0) = ' + fmt(A.dc.value), title: CHIP_TIPS.ganancia, testid: 'tf-dc' }));
      else if (A.dc.kind === 'infinito') gChips.appendChild(ui.chip({ label: 'Integrador: G(0) = ∞', tone: 'warning', title: CHIP_TIPS.integrador, testid: 'tf-dc' }));
      if (res.entry && res.entry.linearized) gChips.appendChild(ui.chip({ label: 'Linealizado', tone: 'info', icon: 'info', title: CHIP_TIPS.linealizado }));
      if (res.meta && res.meta.note) {
        gNotes.appendChild(h('p', { class: 'ds-callout tf-gnote', 'data-testid': 'tf-note' }, ui.icon('info'), h('span', null, res.meta.note)));
      }
    }

    function renderStale(err) {
      gPanel.classList.add('is-stale');
      gStale.hidden = false;
      var old = gNotes.querySelector('[data-testid="tf-stale"]');
      if (old) old.remove();
      gNotes.appendChild(h('p', { class: 'ds-callout ds-callout--warning tf-gnote', 'data-testid': 'tf-stale', role: 'status' },
        ui.icon('triangle-alert'),
        h('span', null, current ? 'Corrija los coeficientes: mientras tanto se muestra la última G(s) válida.' : 'Corrija los coeficientes para obtener G(s).')));
    }

    /* ---------------------------------------------------------------- render: gráficas */
    /** Crea (una vez) la gráfica `kind`: 'step', 'pz', 'bode' o 'impulse'. Las fases de inicio las reparten. */
    function ensureChart(kind) {
      var C = CH();
      if (!C || charts[kind]) return charts[kind];
      if (kind === 'step') charts.step = C.createStepChart(figStep.canvas, { ariaLabel: 'Respuesta al escalón', testid: 'tf-chart-step', dataToggle: true });
      else if (kind === 'pz') charts.pz = C.createPoleZeroChart(figPz.canvas, { ariaLabel: 'Mapa de polos y ceros', testid: 'tf-chart-pz', dataToggle: true });
      else if (kind === 'bode') charts.bode = C.createBodeChart(bodeMagCanvas, bodePhaseCanvas, { ariaLabel: 'Diagrama de Bode', testid: 'tf-chart-bode', dataToggle: true, markers: { minus3dB: true, crossover: true } });
      else if (kind === 'impulse') charts.impulse = C.createStepChart(figImpulse.canvas, { ariaLabel: 'Respuesta al impulso', testid: 'tf-chart-impulse', showBand: false, dataToggle: true });
      return charts[kind];
    }

    var drawnWith = { step: null, pz: null, bode: null, impulse: null };   // análisis dibujado en cada gráfica
    var needFresh = { step: false, pz: false, bode: false, impulse: false };  // próximo dibujo sin fantasma

    /**
     * Dibuja el análisis A en las gráficas `kinds` (todas por omisión; las que ya lo muestran se saltan).
     * fresh: es otra G(s) (sistema, modo, orden, ejemplo o coeficientes), así que no queda curva fantasma
     * de la anterior (TFE-14); tras un cambio de parámetros del mismo sistema, sí.
     */
    function drawCharts(A, mode, fresh, kinds) {
      var m = mode === 'drag' ? 'drag' : 'release';
      // Una G(s) nueva quita el fantasma de las cuatro gráficas, aunque alguna se dibuje más tarde; las que
      // ya muestran este análisis no cambian.
      if (fresh) Object.keys(needFresh).forEach(function (k) { if (drawnWith[k] !== A) needFresh[k] = true; });
      (kinds || ['step', 'pz', 'bode', 'impulse']).forEach(function (k) {
        if (k === 'impulse') {
          if (showImpulse && drawnWith.impulse !== A) renderImpulse(A, m, needFresh.impulse);
          return;
        }
        if (drawnWith[k] === A) return;
        var c = ensureChart(k);
        if (!c) return;
        drawnWith[k] = A;
        var o = { mode: m };
        if (needFresh[k]) o.ghost = false;
        needFresh[k] = false;
        if (k === 'step') {
          o.annotations = A.info.stable ? A.info : null;
          c.update([{ key: 'y', label: 'Respuesta y(t)', t: A.step.t, y: A.step.y, color: '--c-out' }], o);
        } else if (k === 'pz') {
          c.update({ poles: A.G.poles(), zeros: A.G.zeros() }, o);
        } else {
          c.update(A.bode, o);
        }
      });
    }

    function renderCharts(res, A, mode, fresh, kinds) {
      var diag = res.kind !== 'tf';
      chartsEl.hidden = diag;
      chartsEmpty.hidden = !diag;
      if (diag) {
        // Al volver a una G(s), las curvas de antes de un modelo sin G(s) no quedan como fantasma.
        Object.keys(needFresh).forEach(function (k) { needFresh[k] = true; });
        return;
      }
      drawCharts(A, mode, fresh, kinds);
    }

    function renderImpulse(A, mode, fresh) {
      var c = ensureChart('impulse');
      if (!c) return;
      drawnWith.impulse = A;
      var s = A.G.impulseSamples(A.n, A.T);
      // Estable: g(t) → 0, y el texto alternativo lo dice (TFE-09); si no, «sin valor final».
      var o = { annotations: A.info.stable ? { finalValue: 0 } : null, mode: mode || 'release' };
      if (fresh || needFresh.impulse) o.ghost = false;
      needFresh.impulse = false;
      c.update([{ key: 'g', label: 'Impulso g(t)', t: s.t, y: s.y, color: '--c-out' }], o);
      var notes = A.G.impulseAnalytic().notes.filter(function (n) { return /δ/.test(n); });
      impulseNote.textContent = notes.length ? notes.join(' ') : 'g(t) es la derivada de la respuesta al escalón: muestra cómo responde el sistema a un golpe breve de área 1.';
    }

    function setImpulse(on) {
      showImpulse = !!on;
      figImpulse.el.hidden = !showImpulse;
      // Al volver a mostrarla, su curva anterior puede ser de otro sistema: sin fantasma.
      if (showImpulse && current && current.A && drawnWith.impulse !== current.A) renderImpulse(current.A, 'release', true);
    }

    /* ---------------------------------------------------------------- render: métricas */
    function renderMetrics(res, A) {
      if (res.kind !== 'tf') return;
      var info = A.info;
      var so = A.so && A.so.canonical ? A.so : null;
      var fo = A.fo;
      var setCard = function (id, value, unit, sub, kind) {
        var v = metricViews[id];
        v.num.textContent = isNum(value) ? fmt(value) : '—';
        v.unit.textContent = isNum(value) && unit ? '\u00a0' + unit : '';
        v.sub.textContent = '';
        if (sub) {
          v.sub.appendChild(document.createTextNode(sub));
          if (kind) v.sub.appendChild(h('span', { class: 'tf-tag tf-tag--' + (kind === 'aproximada' ? 'approx' : 'exact') }, kind));
        }
        v.card.classList.toggle('is-empty', !isNum(value));
      };
      if (!info.stable) {
        var why = A.stab.verdict === 'marginal' ? 'No existe: marginalmente estable.' : 'No existe: sistema inestable.';
        METRICS.forEach(function (m) { setCard(m.id, null, '', m.id === 'final' ? why : '', null); });
        // Un cero en s = 0 cancela el polo del origen: y(t) converge aunque el veredicto siga siendo
        // «marginal» (TFE-16, stepInfo().limitValue de CORE-10). Es un límite medido, no el teorema.
        if (isNum(info.limitValue)) setCard('final', info.limitValue, '', 'límite de y(t): el cero cancela el polo en el origen', null);
        metricsNote.textContent = info.notes.join(' ');
        return;
      }
      setCard('final', info.finalValue, '', 'G(0), por el teorema del valor final', 'exacta');
      var mpSub = so ? 'Fórmula: ' + fmt(so.canonical.overshootPct) + '\u00a0%' : isNum(info.undershootPct) && info.undershootPct > 0 ? 'Subimpulso inicial: ' + fmt(info.undershootPct) + '\u00a0%' : info.overshootPct === 0 ? 'Sin sobrepaso' : '';
      setCard('mp', info.overshootPct, '%', mpSub, so ? 'exacta' : null);
      setCard('tp', info.peakTime, 's', so ? 'Fórmula π/ωd: ' + fmt(so.canonical.peakTime) + '\u00a0s' : isNum(info.peakTime) ? '' : 'Sin pico: no supera y∞', so ? 'exacta' : null);
      setCard('tr', info.riseTime, 's', fo ? 'Criterio 10–90\u00a0%; fórmula τ·ln 9' : 'Criterio 10–90\u00a0%', fo ? 'exacta' : null);
      setCard('ts', info.settlingTime, 's', so ? 'Banda ±2\u00a0%; fórmula 4/(ζωn): ' + fmt(so.canonical.settlingTime) + '\u00a0s' : fo ? 'Banda ±2\u00a0%; fórmula τ·ln 50' : 'Banda ±2\u00a0%', so ? 'aproximada' : fo ? 'exacta' : null);
      // Las notas de stepInfo() dicen sobre cuántas muestras y qué ventana se midió (el número depende del
      // sistema: CORE-11) y explican una tarjeta vacía o un valor extremo (polo muy lento, medición descartada).
      metricsNote.textContent = 'Valores medidos sobre la respuesta calculada; debajo de cada uno, la fórmula canónica cuando existe.'
        + (info.notes.length ? ' ' + info.notes.join(' ') : '');
    }

    /* ---------------------------------------------------------------- render: procedimiento */
    function blockSig(b) {
      if (b.t === 'routh') return 'routh' + b.tex.length;
      if (b.t === 'pf') return 'pf' + b.rows.length;
      if (b.t === 'metrics') return 'metrics';
      if (b.t === 'params') return 'params' + b.items.length;
      if (b.t === 'list') return 'list';
      return b.t;
    }

    var flashTimers = typeof WeakMap === 'function' ? new WeakMap() : null;

    /**
     * Resalta 400 ms un bloque cambiado. Sin leer la maqueta (TFE-15): con la clase puesta el fondo cambia
     * sin transición; si ya estaba resaltado, solo se alarga el plazo. Quitarla devuelve el color con la
     * transición de --dur-highlight.
     */
    function flash(el) {
      var prev = flashTimers ? flashTimers.get(el) : null;
      if (prev) clearTimeout(prev);
      el.classList.add('is-changed');
      var id = later(function () {
        if (flashTimers) flashTimers.delete(el);
        el.classList.remove('is-changed');
      }, 420);
      if (flashTimers) flashTimers.set(el, id);
    }

    function routhTable(b) {
      var cols = 0;
      b.tex.forEach(function (r) { cols = Math.max(cols, r.length); });
      var tbody = h('tbody');
      var prev = 0;
      b.tex.forEach(function (row, i) {
        var tr = h('tr');
        var lab = h('th', { scope: 'row', class: 'tf-routh__row', translate: 'no' });
        var labTex = h('span', { 'aria-hidden': 'true' });
        renderTex(labTex, b.labels[i], false, true);
        // Nombre de la fila para lectores de pantalla y axe (el KaTeX visible va oculto a la accesibilidad).
        lab.appendChild(labTex);
        lab.appendChild(h('span', { class: 'sr-only' }, 'fila ' + routhRowName(b.labels[i])));
        tr.appendChild(lab);
        for (var j = 0; j < cols; j++) {
          var td = h('td', { class: j === 0 ? 'tf-routh__first' : null, translate: 'no' });
          if (row[j] !== undefined) renderTex(td, row[j], false);
          tr.appendChild(td);
        }
        var s = b.signs[i];
        var change = s !== 0 && prev !== 0 && s !== prev;
        if (s !== 0) prev = s;
        tr.appendChild(h('td', { class: 'tf-routh__sign' + (change ? ' is-change' : '') },
          s > 0 ? '+' : s < 0 ? '−' : '0',
          change ? h('span', { class: 'tf-routh__flag' }, ' cambio') : null));
        tbody.appendChild(tr);
      });
      return h('div', { class: 'tf-table-wrap tf-line', 'data-testid': 'tf-routh' },
        h('table', { class: 'ds-table tf-routh' },
          h('caption', null, 'Tabla de Routh del denominador; la primera columna decide.'),
          h('thead', null, h('tr', null,
            h('th', { scope: 'col' }, 'Fila'),
            h('th', { scope: 'col', colspan: String(cols) }, 'Coeficientes'),
            h('th', { scope: 'col' }, 'Signo'))),
          tbody));
    }

    function pfTable(b) {
      var tbody = h('tbody');
      b.rows.forEach(function (r) {
        var cPole = h('td', { translate: 'no' });
        renderTex(cPole, r.pole, false);
        var cRes = h('td', { translate: 'no' });
        renderTex(cRes, r.residue, false);
        tbody.appendChild(h('tr', null, cPole, h('td', null, String(r.power)), cRes));
      });
      return h('div', { class: 'tf-table-wrap tf-line', 'data-testid': 'tf-pf' },
        h('table', { class: 'ds-table tf-pf' },
          h('caption', null, 'Residuos de Y(s): cada fila es un término r/(s − p)ᵏ.'),
          h('thead', null, h('tr', null,
            h('th', { scope: 'col' }, 'Polo p'),
            h('th', { scope: 'col' }, 'Potencia k'),
            h('th', { scope: 'col' }, 'Residuo r'))),
          tbody));
    }

    function metricsTable(b) {
      var tbody = h('tbody');
      b.rows.forEach(function (r) {
        var lab = h('th', { scope: 'row' });
        var sym = h('span', { class: 'tf-sym', translate: 'no' });
        renderTex(sym, r.tex, false);
        lab.appendChild(sym);
        lab.appendChild(document.createTextNode(' ' + r.label));
        var meas = h('td', { 'data-testid': 'tf-mt-' + r.id }, isNum(r.value) ? fmt(r.value) + (r.unit ? '\u00a0' + r.unit : '') : '—');
        var form = h('td', { class: 'tf-mt__formula', translate: 'no' });
        if (r.formula) {
          renderTex(form, r.formula + (isNum(r.formulaValue) ? ' = ' + tnum(r.formulaValue) + (r.unit === '%' ? '\\,\\%' : '\\;\\mathrm{' + r.unit + '}') : ''), false);
        } else {
          form.textContent = 'sin fórmula cerrada';
          form.classList.add('is-none');
        }
        var kind = h('td', null, r.kind ? h('span', { class: 'tf-tag tf-tag--' + (r.kind === 'aproximada' ? 'approx' : 'exact') }, r.kind) : '—');
        tbody.appendChild(h('tr', null, lab, meas, form, kind));
      });
      return h('div', { class: 'tf-table-wrap tf-line', 'data-testid': 'tf-metrics-table' },
        h('table', { class: 'ds-table tf-mt' },
          h('caption', null, 'Métricas de la respuesta al escalón: medida numérica frente a fórmula canónica.'),
          h('thead', null, h('tr', null,
            h('th', { scope: 'col' }, 'Métrica'),
            h('th', { scope: 'col' }, 'Medida'),
            h('th', { scope: 'col' }, 'Fórmula'),
            h('th', { scope: 'col' }, 'Tipo'))),
          tbody));
    }

    function paramsGrid(b) {
      // Con más de 6 cifras (coeficientes tecleados largos, o ωn y ζ junto a una frontera de régimen) las
      // lecturas necesitan columnas más anchas y la unidad puede bajar de línea (tf-params--wide).
      var wide = b.items.some(function (it) { return (it.digits || b.digits || 4) > 6; });
      var grid = h('div', { class: ['tf-params', wide && 'tf-params--wide', 'tf-line'], 'data-testid': 'tf-params' });
      b.items.forEach(function (it) {
        var r = ui.readout({ label: it.label, tex: it.tex, value: it.value, unit: it.unit, digits: it.digits || b.digits || 4, testid: 'tf-param-out-' + it.id });
        grid.appendChild(r.el);
      });
      return grid;
    }

    function blockEl(b) {
      switch (b.t) {
        case 'p': return h('p', { class: 'tf-p tf-line' }, b.text);
        case 'sub': return h('p', { class: 'tf-sub tf-line' }, b.text);
        case 'eq': return texEl('div', 'tf-eq ds-math-block tf-line', b.tex, true, b.testid ? { 'data-testid': b.testid } : null);
        case 'note':
          return h('p', { class: ['ds-callout', b.tone !== 'info' && 'ds-callout--' + b.tone, 'tf-note', 'tf-line'], 'data-testid': b.testid || null },
            ui.icon(b.tone === 'success' ? 'circle-check' : b.tone === 'info' ? 'info' : b.tone === 'danger' ? 'circle-alert' : 'triangle-alert'),
            h('span', null, b.text));
        case 'list': return h('ul', { class: 'tf-list tf-line' }, b.items.map(function (t) { return h('li', null, richText(t)); }));
        case 'routh': return routhTable(b);
        case 'pf': return pfTable(b);
        case 'metrics': return metricsTable(b);
        case 'params': return paramsGrid(b);
        default: return h('div');
      }
    }

    function sameBlock(a, b) {
      if (!a || a.t !== b.t) return false;
      return JSON.stringify(a) === JSON.stringify(b);
    }

    /** Pinta el contenido de un paso; si la estructura no cambió, actualiza en su sitio y resalta lo cambiado. */
    function paintStep(view, live) {
      var desc = view.desc;
      var sig = desc.blocks.map(blockSig).join('|');
      if (view.rendered && view.sig === sig) {
        desc.blocks.forEach(function (b, i) {
          var old = view.blocks[i];
          if (sameBlock(old, b)) return;
          var el = view.nodes[i];
          if (b.t === 'eq') {
            setTex(el, b.tex, true);
          } else {
            var fresh = blockEl(b);
            fresh.style.setProperty('--i', el.style.getPropertyValue('--i'));
            fresh.classList.add('is-static');
            el.replaceWith(fresh);
            view.nodes[i] = fresh;
            el = fresh;
          }
          if (live) flash(el);
        });
      } else {
        view.body.textContent = '';
        view.nodes = desc.blocks.map(function (b, i) {
          var el = blockEl(b);
          el.style.setProperty('--i', String(Math.min(i, 10)));
          view.body.appendChild(el);
          return el;
        });
        view.sig = sig;
      }
      view.blocks = desc.blocks;
      view.rendered = true;
      view.dirty = false;
    }

    var batchOpen = false;   // abriendo varios pasos a la vez: el pintado lo reparte pump()

    function stepViewFor(i, desc) {
      var body = h('div', { class: 'tf-step__body' });
      var view = { desc: desc, body: body, nodes: [], blocks: null, sig: null, rendered: false, dirty: true, live: false };
      view.coll = ui.collapsible({
        title: desc.title, content: body, number: i + 1, headingLevel: 4, testid: 'tf-step-' + (i + 1), className: 'tf-step',
        onToggle: function (open) {
          // Un paso que el usuario abre se pinta en el acto; los que se abren en bloque, por tareas.
          if (open && view.dirty && !batchOpen) paintStep(view, false);
          syncProcButtons();
        }
      });
      view.li = h('li', { class: 'tf-steps__item', style: { '--i': String(i) } }, view.coll.el);
      if (stepIO) stepIO.observe(view.li);
      return view;
    }

    /* -------- pintado repartido (TFE-15): un paso cercano por tarea; los lejanos, en reposo o al acercarse */
    function isNear(v) {
      var r = v.li.getBoundingClientRect();
      var vh = window.innerHeight || 800;
      return r.bottom > -0.5 * vh && r.top < 1.5 * vh;
    }

    function pendingSteps() {
      return stepViews.filter(function (v) { return v.dirty && v.coll.isOpen(); });
    }

    /** Pinta ya hasta `n` pasos abiertos pendientes cerca de la vista; los demás quedan programados. */
    function pump(n) {
      if (!alive) return;
      var left = n === undefined ? 1 : n;
      for (;;) {
        var pend = pendingSteps();
        if (!pend.length) return;
        var near = null;
        for (var i = 0; i < pend.length && !near; i++) if (isNear(pend[i])) near = pend[i];
        if (!near) { schedulePumpIdle(); return; }
        if (left <= 0) { schedulePumpSoon(); return; }
        paintStep(near, near.live);
        left--;
      }
    }

    function schedulePumpSoon() {
      if (pumpSoon) return;
      pumpSoon = true;
      afterYield(function () { pumpSoon = false; pump(1); });
    }

    function schedulePumpIdle() {
      if (pumpIdle !== null) return;
      var run = function () {
        pumpIdle = null;
        if (!alive) return;
        var pend = pendingSteps();
        if (!pend.length) return;
        paintStep(pend[0], false);
        pump(0);
      };
      if (typeof window.requestIdleCallback === 'function') pumpIdle = { idle: window.requestIdleCallback(run, { timeout: 1500 }) };
      else pumpIdle = { timer: later(run, 120) };
    }

    function cancelPump() {
      if (pumpIdle && pumpIdle.idle !== undefined && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(pumpIdle.idle);
      if (pumpIdle && pumpIdle.timer !== undefined) clearTimeout(pumpIdle.timer);
      pumpIdle = null;
    }

    /** Pinta ya todos los pasos abiertos pendientes (fase de inicio). */
    function paintOpenSteps() {
      pendingSteps().forEach(function (v) { paintStep(v, false); });
    }

    if (typeof window.IntersectionObserver === 'function') {
      stepIO = new window.IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) { if (pendingSteps().length) schedulePumpSoon(); return; }
        }
      }, { rootMargin: '50% 0px' });
    }

    function renderProcedure(live, reset) {
      if (!current) return;
      var steps = current.steps || (current.steps = buildProcedure(current.res, current.A));
      var structural = reset || !lastSteps || lastSteps.length !== steps.length ||
        lastSteps.some(function (s, i) { return s.id !== steps[i].id; });
      if (structural) {
        var wasOpen = stepViews.map(function (v) { return v.coll.isOpen(); });
        var keep = !reset && lastSteps && lastSteps.length === steps.length;
        stepViews.forEach(function (v) { if (stepIO) stepIO.unobserve(v.li); v.coll.destroy(); });
        stepViews = [];
        stepList.textContent = '';
        stepList.classList.toggle('is-intro', !introDone);
        batchOpen = true;
        steps.forEach(function (d, i) {
          var v = stepViewFor(i, d);
          stepViews.push(v);
          stepList.appendChild(v.li);
          if (keep ? wasOpen[i] : i === 0) v.coll.open();
        });
        batchOpen = false;
        if (!introDone) later(function () { stepList.classList.remove('is-intro'); }, 1200);
        introDone = true;
      } else {
        // En su sitio: los pasos quedan sucios y pump() repinta (con resaltado) los abiertos cercanos.
        steps.forEach(function (d, i) {
          var v = stepViews[i];
          v.desc = d;
          v.coll.button.querySelector('.ds-collapse__title').textContent = d.title;
          v.dirty = true;
          v.live = !!live && v.coll.isOpen();
        });
      }
      lastSteps = steps;
      procPanel.setAttribute('data-steps', String(steps.length));
      syncProcButtons();
      pump(1);
    }

    function syncProcButtons() {
      var open = stepViews.filter(function (v) { return v.coll.isOpen(); }).length;
      var all = stepViews.length > 0 && open === stepViews.length;
      nextBtn.disabled = all || !stepViews.length;
      var label = allBtn.querySelector('.ds-btn__label');
      var txt = all ? 'Plegar todo' : 'Mostrar todo';
      if (label) label.textContent = txt; else allBtn.textContent = txt;
      allBtn.setAttribute('aria-expanded', String(all));
      var ic = allBtn.querySelector('.ds-icon');
      if (ic) {
        var fresh = ui.icon(all ? 'chevrons-down-up' : 'chevrons-up-down', { size: 18, className: 'ds-btn__icon' });
        ic.replaceWith(fresh);
      }
    }

    /** La caja que queda fija: la barra entera o, en teléfono (display: contents), solo sus acciones. */
    function stickyBar() {
      return window.getComputedStyle(procHead).display === 'contents' ? procActions : procHead;
    }

    /** Alto de la barra fija del procedimiento, para el scroll-margin-top de los pasos. */
    function syncBarHeight() {
      var hgt = stickyBar().offsetHeight;
      if (hgt > 0) procPanel.style.setProperty('--tf-bar-h', hgt + 'px');
    }

    function nextStep() {
      for (var i = 0; i < stepViews.length; i++) {
        var v = stepViews[i];
        if (v.coll.isOpen()) continue;
        if (v.dirty) paintStep(v, false);
        var last = stepViews.every(function (w) { return w === v || w.coll.isOpen(); });
        // Al abrirse el último paso «Paso siguiente» se desactiva: antes, el foco pasa a ese paso (TFE-01).
        var ae = document.activeElement;
        if (last && (!ae || ae === nextBtn || ae === document.body)) v.coll.button.focus({ preventScroll: true });
        v.coll.open();
        // El paso nuevo entero bajo la barra fija; sin desplazamiento suave con movimiento reducido.
        syncBarHeight();
        var rm = DSL.prefs && DSL.prefs.reducedMotion;
        if (v.li.scrollIntoView) v.li.scrollIntoView({ block: 'start', behavior: rm ? 'instant' : 'smooth' });
        ui.announce('Paso ' + (i + 1) + ' de ' + stepViews.length + ': ' + v.desc.title + '.');
        return;
      }
    }

    function toggleAll() {
      var all = stepViews.every(function (v) { return v.coll.isOpen(); });
      batchOpen = true;
      stepViews.forEach(function (v) {
        if (all) v.coll.close();
        else v.coll.open();
      });
      batchOpen = false;
      syncProcButtons();
      if (!all) pump(1);
    }

    // El foco del teclado nunca queda bajo la barra fija del procedimiento (WCAG 2.4.11).
    function onProcFocus(e) {
      var t = e.target;
      if (!t || !stepList.contains(t) || typeof t.getBoundingClientRect !== 'function') return;
      var bar = stickyBar().getBoundingClientRect();
      var r = t.getBoundingClientRect();
      if (r.top < bar.bottom + 4 && r.bottom > bar.top) window.scrollBy(0, r.top - bar.bottom - 12);
    }
    procPanel.addEventListener('focusin', onProcFocus);
    cleanups.push(function () { procPanel.removeEventListener('focusin', onProcFocus); });

    /* ---------------------------------------------------------------- anuncio cortés */
    function announce() {
      if (!current) return;
      var res = current.res;
      var A = current.A;
      if (res.kind === 'diag') {
        ui.announce(res.entry.label + ': este modelo no tiene G(s); el procedimiento explica por qué.');
        return;
      }
      var parts = ['G(s) recalculada.', VERDICT[A.stab.verdict].label + '.'];
      if (A.so) {
        // Como en el paso 4: junto a la frontera de un régimen, ζ y ωn llevan las cifras que hagan falta
        // para que ζ anunciado cumpla su desigualdad (nunca «ζ = 1» para un sobreamortiguado; ronda 2).
        var Dz = zetaDigits(A.so, 3);
        parts.push('ζ = ' + fmt(A.so.zeta, Dz) + ', ωn = ' + fmt(A.so.wn, Dz) + ' rad/s.');
      }
      if (A.fo) parts.push('τ = ' + fmt(A.fo.tau, 3) + ' s.');
      if (A.info.stable) {
        parts.push('Valor final ' + fmt(A.info.finalValue, 3) + '.');
        if (isNum(A.info.overshootPct)) parts.push('Sobrepaso ' + fmt(A.info.overshootPct, 3) + ' %.');
        if (isNum(A.info.settlingTime)) parts.push('Establecimiento ' + fmt(A.info.settlingTime, 3) + ' s.');
      }
      ui.announce(parts.join(' '));
    }

    /* ---------------------------------------------------------------- tf:open (galería) */
    function flashPanels() {
      [controls, gPanel].forEach(function (p) {
        p.classList.remove('tf-flash');
        void p.offsetWidth;
        p.classList.add('tf-flash');
      });
      later(function () { controls.classList.remove('tf-flash'); gPanel.classList.remove('tf-flash'); }, 1800);
    }

    function findEntry(payload) {
      if (!payload || !payload.systemId) return null;
      var vid = payload.variant;
      try { vid = DSL.systems.variantOf(payload.systemId, payload.variant).id; } catch (err) { vid = null; }
      var cands = catalogue.filter(function (e) { return e.modelId === payload.systemId && (!vid || e.variant === vid); });
      if (!cands.length) return null;
      if (payload.outputKey) {
        for (var i = 0; i < cands.length; i++) if (cands[i].outputKey === payload.outputKey) return cands[i];
      }
      return cands[0];
    }

    function applyOpen(payload) {
      var e = findEntry(payload);
      if (!e) {
        ui.toast('Ese sistema no está en el motor de funciones de transferencia.', { tone: 'warning', testid: 'tf-toast' });
        return;
      }
      state.mode = 'sistema';
      modeTabs.select('sistema', { silent: true });
      loadEntry(e, payload.params || null);
      // Entrega desde la galería o el asistente: se anuncia (TFE-11).
      schedule('release', { newSystem: true });
      flashPanels();
      ui.announce('Sistema cargado en el motor: ' + e.label + '.');
    }

    var offOpen = DSL.bus.on('tf:open', function (payload) {
      if (!phasesDone) {
        if (!inited) {
          pendingOpen = payload;
          init();
          return;
        }
        init();
      }
      applyOpen(payload);
    });
    cleanups.push(offOpen);

    /* ---------------------------------------------------------------- inicio perezoso por fases (TFE-15) */
    // Fases de unos 50 ms o menos a 1×: cálculo y DOM (G, métricas, lista de pasos) → escalón y polos y
    // ceros → Bode e impulso → pasos abiertos. Con DSL.util.lazyInit (FND-07) corren en tiempo ocioso tras
    // la carga, o todas seguidas cuando la sección se acerca a 300 px; sin él, todas seguidas al acercarse
    // (util.onVisible). La carga inicial no se anuncia (TFE-11); una entrega tf:open, sí.
    var PHASES = [
      function phaseCompute() {
        inited = true;
        var p = pendingOpen;
        pendingOpen = null;
        frameMode = null;
        schedule.newSystem = schedule.fresh = schedule.loud = false;
        if (p) applyOpen(p);            // estado del sistema pedido, resaltado y anuncio; el cálculo va aquí
        if (frame !== null) { util.cancelRaf(frame); frame = null; }
        var loud = !!schedule.loud;
        frameMode = null;
        schedule.newSystem = schedule.fresh = schedule.loud = false;
        if (!computeAndRenderHead(true)) return;
        if (current.res.kind !== 'tf') renderCharts(current.res, current.A, 'release', true);
        else { chartsEl.hidden = false; chartsEmpty.hidden = true; }
        procGen++;
        renderProcedure(false, true);
        if (loud) announceDebounce();
      },
      function phaseStepCharts() {
        if (current && current.A) drawCharts(current.A, 'release', true, ['step', 'pz']);
      },
      function phaseBode() {
        if (current && current.A) drawCharts(current.A, 'release', true, ['bode', 'impulse']);
      },
      function phaseSteps() {
        paintOpenSteps();
        phasesDone = true;
        if (!lazy) root.setAttribute('data-lazy', 'done');
      }
    ];

    /** Inicialización inmediata (tf:open, handle.init(), sección cerca): completa las fases que falten. */
    function init() {
      if (!alive || phasesDone) return;
      if (lazy) { lazy.ensure(); return; }
      for (var i = 0; i < PHASES.length && alive && !phasesDone; i++) PHASES[i]();
    }

    if (typeof util.lazyInit === 'function') {
      var phaseRun = 0;
      lazy = util.lazyInit(root, PHASES.map(function (fn, i) {
        return function () {
          if (!alive || i < phaseRun) return;
          phaseRun = i + 1;
          fn();
        };
      }), { rootMargin: '300px' });
      cleanups.push(function () { if (lazy) lazy.destroy(); });
    } else {
      cleanups.push(util.onVisible(wrap, function (visible) { if (visible) init(); }, { once: true, rootMargin: '300px' }));
    }

    /* ---------------------------------------------------------------- handle */
    return {
      destroy: function () {
        if (!alive) return;
        alive = false;
        if (frame !== null) util.cancelRaf(frame);
        procDebounce.cancel();
        announceDebounce.cancel();
        customDebounce.cancel();
        cancelPump();
        if (stepIO) stepIO.disconnect();
        timers.forEach(function (id) { clearTimeout(id); });
        cleanups.forEach(function (fn) { try { fn(); } catch (err) { /* ya liberado */ } });
        Object.keys(charts).forEach(function (k) { if (charts[k]) charts[k].destroy(); charts[k] = null; });
        sysSliderHandles.forEach(function (s) { s.destroy(); });
        Object.keys(stdSliders).forEach(function (k) { stdSliders[k].destroy(); });
        stepViews.forEach(function (v) { v.coll.destroy(); });
        stdOrder.destroy();
        impulseToggle.destroy();
        modeTabs.destroy();
        root.textContent = '';
        root.removeAttribute('data-lazy');
      },
      /** Fuerza la inicialización (pruebas o navegación directa). */
      init: function () { init(); },
      /** Copia del estado de entrada (datos planos). */
      getState: function () {
        return JSON.parse(JSON.stringify({ mode: state.mode, sys: state.sys, std: state.std, custom: state.custom, customError: state.customError }));
      },
      /** Resumen del último resultado válido: números tal como salen de DSL.core.tf. */
      getResult: function () {
        if (!current) return null;
        var res = current.res;
        var A = current.A;
        // Los descriptores se preparan en una tarea aparte (TFE-15); aquí, si aún faltan, al momento.
        if (!current.steps) current.steps = buildProcedure(res, A);
        var ids = current.steps.map(function (s) { return s.id; });
        if (res.kind === 'diag') return { kind: 'diag', entryId: res.entry.id, steps: ids };
        var i = A.info;
        return JSON.parse(JSON.stringify({
          kind: 'tf', source: res.source, entryId: res.entry ? res.entry.id : null,
          num: Array.prototype.slice.call(A.G.num), den: Array.prototype.slice.call(A.G.den),
          tex: A.G.toTex(), stability: A.stab.verdict,
          poles: A.G.poles(), zeros: A.G.zeros(),
          info: { stable: i.stable, finalValue: i.finalValue, limitValue: isNum(i.limitValue) ? i.limitValue : null, peak: i.peak, peakTime: i.peakTime, overshootPct: i.overshootPct, riseTime: i.riseTime, settlingTime: i.settlingTime },
          secondOrder: A.so, firstOrder: A.fo, samples: A.n, horizon: A.T,
          steps: ids
        }));
      }
    };
  }

  DSL.sections.tfengine = {
    mount: mount,
    helpers: {
      derivTex: derivTex,
      linCombTex: linCombTex,
      odeTex: odeTex,
      laplaceTex: laplaceTex,
      rootsTex: rootsTex,
      sMinusTex: sMinusTex,
      pfSumTex: pfSumTex,
      buildCatalogue: buildCatalogue,
      analyze: analyze,
      buildProcedure: buildProcedure,
      PRESETS: PRESETS,
      STD_PARAMS: STD_PARAMS
    }
  };
})(window.DSL);
