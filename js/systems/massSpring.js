/*
 * js/systems/massSpring.js — Propietario: systems.
 * Modelo «massSpring»: masa-resorte-amortiguador (mecánico), m·ẍ + b·ẋ + k·x = F(t).
 * API: docs/api/systems.md.
 */
(function (DSL) {
  'use strict';

  var S = DSL.systems;
  var H = S.helpers;
  var n = H.num, lin = H.lin;

  function TF() { return DSL.core.tf.TransferFunction; }
  function LX() { return DSL.core.latex; }

  var VARIANTS = [{
    id: 'base', label: 'Masa-resorte-amortiguador', timeDomain: 'continuous', linear: true, timeUnit: 's',
    summary: 'Una masa unida a una pared por un resorte y un amortiguador, empujada por una fuerza externa.'
  }];

  var PARAMS = [
    H.param({
      key: 'm', label: 'Masa', symbol: 'm', unit: 'kg', min: 0.2, max: 5, step: 0.05, default: 1,
      tooltip: 'Inercia del cuerpo. Más masa hace la respuesta más lenta y baja la frecuencia natural ωn = √(k/m).'
    }),
    H.param({
      key: 'b', label: 'Amortiguamiento', symbol: 'b', unit: 'N·s/m', min: 0, max: 5, step: 0.05, default: 0.8,
      tooltip: 'Coeficiente del amortiguador viscoso: frena con una fuerza b·v y disipa energía en calor. Con b = 0 la masa oscila sin fin.'
    }),
    H.param({
      key: 'k', label: 'Rigidez del resorte', symbol: 'k', unit: 'N/m', min: 0.5, max: 50, step: 0.5, default: 4,
      tooltip: 'Constante del resorte (ley de Hooke, F = k·x). Un resorte más rígido oscila más deprisa y se deforma menos con la misma fuerza.'
    })
  ];

  var IP = H.inputParams;
  var INPUTS = [
    H.inputSpec('escalon', {
      symbol: 'F(t)', unit: 'N', description: 'Fuerza constante aplicada a partir de t₀.',
      params: [IP.amplitude({ symbol: 'F_0', unit: 'N', min: -5, max: 5, step: 0.1, default: 1 }), IP.t0({ unit: 's', max: 10 })]
    }),
    H.inputSpec('pulso', {
      symbol: 'F(t)', unit: 'N', description: 'Empujón breve: la fuerza actúa solo durante T_p.',
      params: [IP.amplitude({ symbol: 'F_0', unit: 'N', min: -10, max: 10, step: 0.1, default: 4 }), IP.t0({ unit: 's', max: 10 }),
        IP.width({ unit: 's', min: 0.05, max: 5, step: 0.05, default: 0.5 })]
    }),
    H.inputSpec('senoidal', {
      symbol: 'F(t)', unit: 'N', description: 'Fuerza periódica F₀·sen(ωt). Si ω se acerca a ωn, la amplitud crece (resonancia).',
      params: [IP.amplitude({ symbol: 'F_0', unit: 'N', min: 0, max: 5, step: 0.1, default: 1 }),
        IP.omega({ min: 0.1, max: 20, step: 0.1, default: 2 }), IP.t0({ unit: 's', max: 10 })]
    })
  ];

  var STATE = [
    { key: 'x', label: 'Posición', symbol: 'x', unit: 'm' },
    { key: 'v', label: 'Velocidad', symbol: 'v', unit: 'm/s' }
  ];
  var OUTPUTS = [
    { key: 'x', label: 'Posición', symbol: 'x(t)', unit: 'm', color: '--c-out' },
    { key: 'v', label: 'Velocidad', symbol: 'v(t)', unit: 'm/s', color: '--c-zero' }
  ];

  function copyAll(a) { return a.map(function (o) { return Object.assign({}, o); }); }

  var ENERGY = {
    unit: 'J',
    stored: function (x, p) { return 0.5 * p.k * x[0] * x[0] + 0.5 * p.m * x[1] * x[1]; },
    dissipated: function (x, u, p) { return p.b * x[1] * x[1]; },
    input: function (x, u) { return u * x[1]; }
  };

  function canon(p) {
    var wn = Math.sqrt(p.k / p.m);
    var zeta = p.b / (2 * Math.sqrt(p.k * p.m));
    var wd = zeta < 1 ? wn * Math.sqrt(1 - zeta * zeta) : null;
    return { wn: wn, zeta: zeta, wd: wd, K: 1 / p.k };
  }

  function regime(zeta) {
    if (zeta <= 1e-12) return 'no amortiguado';
    if (Math.abs(zeta - 1) < 1e-6) return 'críticamente amortiguado';
    return zeta < 1 ? 'subamortiguado' : 'sobreamortiguado';
  }

  function regimeText(zeta) {
    var r = regime(zeta);
    if (r === 'no amortiguado') return 'Con ζ = 0 no hay disipación: la masa oscila indefinidamente con frecuencia ωn.';
    if (r === 'subamortiguado') return 'Como 0 < ζ < 1, el sistema es subamortiguado: la masa oscila con frecuencia ωd mientras la oscilación se apaga.';
    if (r === 'críticamente amortiguado') return 'Con ζ = 1 el amortiguamiento es crítico: es la respuesta más rápida que no sobrepasa el valor final.';
    return 'Como ζ > 1, el sistema es sobreamortiguado: llega al valor final sin oscilar, más despacio cuanto mayor es ζ.';
  }

  function tfFor(p, outputKey) {
    var C = TF();
    if (outputKey === 'v') return new C([1, 0], [p.m, p.b, p.k]);
    return new C([1], [p.m, p.b, p.k]);
  }

  var model = {
    id: 'massSpring',
    name: 'Masa-resorte-amortiguador',
    category: 'mecanico',
    icon: 'activity',
    summary: 'Una masa sujeta por un resorte y frenada por un amortiguador: el ejemplo clásico de sistema de segundo orden.',
    listed: true,
    sceneId: 'massSpring',
    variants: VARIANTS,

    params: function () { return copyAll(PARAMS); },
    inputs: function () {
      return INPUTS.map(function (s) { return Object.assign({}, s, { params: copyAll(s.params) }); });
    },
    state: function () { return copyAll(STATE); },
    outputs: function () { return copyAll(OUTPUTS); },

    x0: function () { return [0, 0]; },

    deriv: function (t, x, u, p) {
      return [x[1], (u - p.b * x[1] - p.k * x[0]) / p.m];
    },

    output: function (t, x) { return { x: x[0], v: x[1] }; },

    hints: function (p) {
      var G = tfFor(p, 'x');
      var h = H.hintsFromTF(G);
      // Rangos para la entrada por omisión (escalón de 1 N).
      var tt = DSL.core.numeric.linspace(0, h.duration, 300);
      var xs = G.step(tt), vs = tfFor(p, 'v').step(tt);
      var rx = H.range(xs), rv = H.range(vs);
      h.yRange = { x: H.padRange(rx[0], rx[1], 0), v: H.padRange(rv[0], rv[1], 0) };
      return h;
    },

    tfPairs: function () {
      return [{ outputKey: 'x', label: 'X(s)/F(s)', linearized: false }];
    },

    tf: function (p, variant, outputKey) {
      var key = outputKey === 'v' ? 'v' : 'x';
      return {
        tf: tfFor(p, key),
        inputSymbol: 'F(s)',
        outputSymbol: key === 'v' ? 'V(s)' : 'X(s)',
        inputLabel: 'Fuerza aplicada',
        outputLabel: key === 'v' ? 'Velocidad de la masa' : 'Posición de la masa',
        note: ''
      };
    },

    linearization: function () { return null; },

    derivation: function (p, variant, outputKey) {
      var c = canon(p);
      var isV = outputKey === 'v';
      var poly = LX().poly([p.m, p.b, p.k]);
      var steps = [];
      steps.push({
        id: 'ley', title: 'Ley física: segunda ley de Newton',
        text: 'Se toma la masa como sistema. Sobre ella actúan la fuerza aplicada F(t), la del resorte, que se opone al desplazamiento (−k·x), y la del amortiguador, que se opone a la velocidad (−b·ẋ). La suma de fuerzas es igual a la masa por la aceleración.',
        tex: [
          'm\\,\\ddot{x}(t) = F(t) - b\\,\\dot{x}(t) - k\\,x(t)',
          'm\\,\\ddot{x} + b\\,\\dot{x} + k\\,x = F(t)',
          lin([[p.m, '\\ddot{x}'], [p.b, '\\dot{x}'], [p.k, 'x']]) + ' = F(t)'
        ]
      });
      steps.push({
        id: 'laplace', title: 'Transformada de Laplace con condiciones iniciales nulas',
        text: 'Se parte del reposo: x(0) = 0 y ẋ(0) = 0. Por la propiedad de la derivada, derivar en el tiempo equivale a multiplicar por s, y la ecuación diferencial se convierte en una ecuación algebraica en s.',
        tex: [
          '\\mathcal{L}\\{\\dot{x}\\} = s\\,X(s) - x(0) = s\\,X(s)',
          '\\mathcal{L}\\{\\ddot{x}\\} = s^{2}X(s) - s\\,x(0) - \\dot{x}(0) = s^{2}X(s)',
          'm\\,s^{2}X(s) + b\\,s\\,X(s) + k\\,X(s) = F(s)'
        ].concat(isV ? ['V(s) = \\mathcal{L}\\{\\dot{x}\\} = s\\,X(s)'] : [])
      });
      steps.push(isV ? {
        id: 'despeje', title: 'Despeje de G(s) = V(s)/F(s)',
        text: 'Se saca X(s) como factor común, se divide por F(s) y se multiplica por s para pasar de posición a velocidad. La función de transferencia depende solo del sistema, no de la entrada.',
        tex: [
          '\\left(m\\,s^{2} + b\\,s + k\\right) X(s) = F(s)',
          'G(s) = \\frac{V(s)}{F(s)} = \\frac{s}{m\\,s^{2} + b\\,s + k}',
          'G(s) = \\frac{s}{' + poly + '}'
        ]
      } : {
        id: 'despeje', title: 'Despeje de G(s) = X(s)/F(s)',
        text: 'Se saca X(s) como factor común y se divide por F(s). La función de transferencia depende solo del sistema, no de la entrada.',
        tex: [
          '\\left(m\\,s^{2} + b\\,s + k\\right) X(s) = F(s)',
          'G(s) = \\frac{X(s)}{F(s)} = \\frac{1}{m\\,s^{2} + b\\,s + k}',
          'G(s) = \\frac{1}{' + poly + '}'
        ]
      });
      var ctex = [
        isV ? 'G(s) = \\frac{1}{m}\\cdot\\frac{s}{s^{2} + 2\\zeta\\omega_n\\,s + \\omega_n^{2}}'
            : 'G(s) = \\frac{1}{k}\\cdot\\frac{\\omega_n^{2}}{s^{2} + 2\\zeta\\omega_n\\,s + \\omega_n^{2}}',
        '\\omega_n = \\sqrt{\\frac{k}{m}} = \\sqrt{\\frac{' + n(p.k) + '}{' + n(p.m) + '}} = ' + n(c.wn) + '\\;\\mathrm{rad/s}',
        '\\zeta = \\frac{b}{2\\sqrt{k\\,m}} = \\frac{' + n(p.b) + '}{2\\sqrt{' + n(p.k) + '\\cdot ' + n(p.m) + '}} = ' + n(c.zeta)
      ];
      if (!isV) ctex.push('K = \\frac{1}{k} = ' + n(c.K) + '\\;\\mathrm{m/N}');
      if (c.wd !== null && c.zeta > 0) ctex.push('\\omega_d = \\omega_n\\sqrt{1-\\zeta^{2}} = ' + n(c.wd) + '\\;\\mathrm{rad/s}');
      steps.push({
        id: 'canonica', title: 'Forma canónica y parámetros',
        text: (isV
          ? 'Al dividir por m aparece el denominador estándar de segundo orden. El cero en s = 0 indica que, ante una fuerza constante, la velocidad vuelve a cero cuando la masa se detiene. '
          : 'Al dividir numerador y denominador por m aparece la forma estándar de segundo orden. ωn mide la rapidez de la oscilación libre; ζ, cuánto la frena el amortiguador; K, cuánto se desplaza la masa por cada newton. ') +
          regimeText(c.zeta),
        tex: ctex
      });
      return steps;
    },

    /** Energías: almacenada ½kx² + ½mv², potencia disipada b·v², potencia de la fuerza F·v. */
    energy: function () { return ENERGY; },

    invariants: function (traj) {
      return [H.energyBalance(traj, ENERGY)];
    },

    readouts: function (p) {
      var c = canon(p);
      var reg = regime(c.zeta);
      var out = [
        { id: 'wn', label: 'Frecuencia natural', tex: '\\omega_n', value: c.wn, unit: 'rad/s', digits: 3,
          tip: 'Rapidez de la oscilación libre si no hubiera amortiguador: ωn = √(k/m).' },
        { id: 'zeta', label: 'Factor de amortiguamiento', tex: '\\zeta', value: c.zeta, unit: '', digits: 3,
          tip: 'Cuánto frena el amortiguador: ζ = b/(2√(km)). Con ζ < 1 la masa oscila; con ζ ≥ 1 vuelve sin oscilar.' },
        {
          id: 'wd', label: 'Frecuencia amortiguada', tex: '\\omega_d', value: c.wd !== null ? c.wd : NaN, unit: 'rad/s', digits: 3,
          text: c.wd !== null ? undefined : 'no oscila',
          tip: 'Frecuencia con la que oscila de verdad la masa: ωd = ωn·√(1 − ζ²). Solo existe si ζ < 1.'
        },
        { id: 'K', label: 'Ganancia estática', tex: 'K', value: c.K, unit: 'm/N', digits: 3,
          tip: 'Desplazamiento final por cada newton de fuerza constante: K = 1/k.' }
      ];
      if (c.zeta > 0 && c.zeta < 1) {
        out.push({ id: 'Mp', label: 'Sobrepaso', tex: 'M_p', value: 100 * Math.exp(-c.zeta * Math.PI / Math.sqrt(1 - c.zeta * c.zeta)), unit: '%', digits: 3,
          tip: 'Cuánto supera la posición a su valor final en el primer pico ante un escalón de fuerza, en % del valor final.' });
      }
      if (reg === 'subamortiguado') {
        out.push({ id: 'ts', label: 'Tiempo de establecimiento (≈, 2 %)', tex: 't_s \\approx 4/(\\zeta\\omega_n)', value: 4 / (c.zeta * c.wn), unit: 's', digits: 3, approx: true,
          tip: 'Desde cuándo x(t) queda en ±2 % del valor final. 4/(ζωn) es la regla de la envolvente e^(−ζωn·t), aproximada.' });
      } else if (c.zeta > 0) {
        // Sin oscilación 4/(ζωn) no vale (sobreamortiguado: lo fija el polo lento): se mide sobre la respuesta exacta.
        var ts = new (TF())([1], [p.m, p.b, p.k]).stepInfo().settlingTime;
        out.push({ id: 'ts', label: 'Tiempo de establecimiento (2 %)', tex: 't_s', value: ts !== null ? ts : NaN, unit: 's', digits: 4, approx: false,
          text: ts !== null ? undefined : 'fuera de la ventana calculada',
          tip: 'Desde cuándo x(t) queda en ±2 % del valor final, medido sobre la respuesta exacta al escalón (sin oscilación no vale 4/(ζωn)).' });
      }
      out.push({ id: 'regimen', label: 'Régimen', tex: '', value: null, text: regime(c.zeta),
        tip: 'Tipo de respuesta según ζ: sin amortiguar (ζ = 0), subamortiguada (oscila), crítica o sobreamortiguada (no oscila).' });
      return out;
    },

    wizard: {
      variant: 'base',
      boundary: {
        inputs: [{ id: 'F', label: 'Fuerza aplicada', symbol: 'F(t)', unit: 'N' }],
        outputs: [
          { id: 'x', label: 'Posición de la masa', symbol: 'x(t)', unit: 'm' },
          { id: 'v', label: 'Velocidad de la masa', symbol: 'v(t)', unit: 'm/s' }
        ],
        elements: [
          { id: 'masa', label: 'Masa', symbol: 'm', unit: 'kg' },
          { id: 'resorte', label: 'Resorte', symbol: 'k', unit: 'N/m' },
          { id: 'amortiguador', label: 'Amortiguador', symbol: 'b', unit: 'N·s/m' }
        ],
        environment: [
          { id: 'pared', label: 'Pared fija que sujeta el resorte y el amortiguador' },
          { id: 'agente', label: 'Agente externo que aplica la fuerza F(t)' },
          { id: 'suelo', label: 'Suelo sin rozamiento seco (solo cuenta el amortiguador)' }
        ]
      },
      laws: [
        { id: 'newton', title: 'Segunda ley de Newton', text: 'La suma de las fuerzas sobre la masa es igual a la masa por su aceleración.', tex: '\\sum F = m\\,\\ddot{x}' },
        { id: 'hooke', title: 'Ley de Hooke', text: 'El resorte empuja hacia la posición de reposo con una fuerza proporcional al estiramiento.', tex: 'F_k = -k\\,x' },
        { id: 'viscoso', title: 'Rozamiento viscoso', text: 'El amortiguador se opone a la velocidad y convierte energía mecánica en calor.', tex: 'F_b = -b\\,\\dot{x}' }
      ],
      equationTerms: [
        { id: 'inercia', tex: 'm\\,\\ddot{x}', label: 'Inercia', text: 'Fuerza neta necesaria para acelerar la masa.', side: 'lhs' },
        { id: 'amortiguamiento', tex: 'b\\,\\dot{x}', label: 'Amortiguamiento', text: 'Fuerza del amortiguador, proporcional a la velocidad.', side: 'lhs' },
        { id: 'rigidez', tex: 'k\\,x', label: 'Rigidez', text: 'Fuerza del resorte, proporcional al desplazamiento.', side: 'lhs' },
        { id: 'entrada', tex: 'F(t)', label: 'Entrada', text: 'Fuerza externa que impone el entorno.', side: 'rhs' }
      ],
      equation: { tex: 'm\\,\\ddot{x} + b\\,\\dot{x} + k\\,x = F(t)' },
      stateSpace: {
        tex: '\\begin{bmatrix}\\dot{x}\\\\ \\dot{v}\\end{bmatrix} = \\begin{bmatrix}0 & 1\\\\ -\\dfrac{k}{m} & -\\dfrac{b}{m}\\end{bmatrix}\\begin{bmatrix}x\\\\ v\\end{bmatrix} + \\begin{bmatrix}0\\\\ \\dfrac{1}{m}\\end{bmatrix} F(t)',
        texWith: function (p) {
          return '\\begin{bmatrix}\\dot{x}\\\\ \\dot{v}\\end{bmatrix} = \\begin{bmatrix}0 & 1\\\\ ' + n(-p.k / p.m) + ' & ' + n(-p.b / p.m) +
            '\\end{bmatrix}\\begin{bmatrix}x\\\\ v\\end{bmatrix} + \\begin{bmatrix}0\\\\ ' + n(1 / p.m) + '\\end{bmatrix} F(t)';
        }
      },
      measured: {
        param: 'b', trueValue: 1.1, noise: 0.004, seed: 20261017, samples: 60, outputKey: 'x', duration: 15,
        input: { type: 'escalon', amplitude: 1, t0: 0 }
      }
    }
  };

  S.register(model);
})(window.DSL);
