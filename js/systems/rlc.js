/*
 * js/systems/rlc.js — Propietario: systems.
 * Modelo «rlc»: circuito RLC serie (eléctrico), L·di/dt + R·i + v_C = v(t), C·dv_C/dt = i.
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
    id: 'serie', label: 'RLC serie', timeDomain: 'continuous', linear: true, timeUnit: 's',
    summary: 'Una fuente de tensión alimenta en serie una resistencia, un inductor y un capacitor.'
  }];

  var PARAMS = [
    H.param({
      key: 'R', label: 'Resistencia', symbol: 'R', unit: 'Ω', min: 2, max: 100, step: 1, default: 20,
      tooltip: 'Disipa energía en forma de calor (ley de Ohm, v = R·i). Es el «amortiguador» del circuito: más R, menos oscilación.'
    }),
    H.param({
      key: 'L', label: 'Inductancia', symbol: 'L', unit: 'H', min: 0.05, max: 1, step: 0.01, default: 0.2, scale: 'log',
      display: { unit: 'mH', factor: 1e3 },
      tooltip: 'El inductor guarda energía en su campo magnético y se opone a los cambios bruscos de corriente (v = L·di/dt). Es la «inercia» del circuito.'
    }),
    H.param({
      key: 'C', label: 'Capacitancia', symbol: 'C', unit: 'F', min: 1e-5, max: 1e-3, step: 1e-6, default: 1e-4, scale: 'log',
      display: { unit: 'µF', factor: 1e6 },
      tooltip: 'El capacitor guarda energía en su campo eléctrico y se opone a los cambios bruscos de tensión (i = C·dv/dt). Es el «resorte» del circuito.'
    })
  ];

  var IP = H.inputParams;
  var INPUTS = [
    H.inputSpec('escalon', {
      symbol: 'v(t)', unit: 'V', description: 'Se conecta una fuente de tensión continua en t₀.',
      params: [IP.amplitude({ symbol: 'V_0', unit: 'V', min: -24, max: 24, step: 0.5, default: 5 }), IP.t0({ unit: 's', max: 0.1, step: 0.001 })]
    }),
    H.inputSpec('pulso', {
      symbol: 'v(t)', unit: 'V', description: 'La fuente se conecta durante T_p y luego se cortocircuita (v = 0).',
      params: [IP.amplitude({ symbol: 'V_0', unit: 'V', min: -24, max: 24, step: 0.5, default: 5 }), IP.t0({ unit: 's', max: 0.1, step: 0.001 }),
        IP.width({ unit: 's', min: 0.001, max: 0.1, step: 0.001, default: 0.02 })]
    }),
    H.inputSpec('senoidal', {
      symbol: 'v(t)', unit: 'V', description: 'Fuente alterna V₀·sen(ωt). Cerca de ωn la tensión del capacitor supera a la de la fuente (resonancia).',
      params: [IP.amplitude({ symbol: 'V_0', unit: 'V', min: 0, max: 24, step: 0.5, default: 5 }),
        IP.omega({ min: 10, max: 1000, step: 5, default: 220 }), IP.t0({ unit: 's', max: 0.1, step: 0.001 })]
    })
  ];

  var STATE = [
    { key: 'i', label: 'Corriente', symbol: 'i', unit: 'A' },
    { key: 'vC', label: 'Tensión del capacitor', symbol: 'v_C', unit: 'V' }
  ];
  var OUTPUTS = [
    { key: 'vC', label: 'Tensión del capacitor', symbol: 'v_C(t)', unit: 'V', color: '--c-out' },
    { key: 'i', label: 'Corriente', symbol: 'i(t)', unit: 'A', color: '--c-zero' }
  ];

  function copyAll(a) { return a.map(function (o) { return Object.assign({}, o); }); }

  function canon(p) {
    var wn = 1 / Math.sqrt(p.L * p.C);
    var zeta = (p.R / 2) * Math.sqrt(p.C / p.L);
    var wd = zeta < 1 ? wn * Math.sqrt(1 - zeta * zeta) : null;
    return { wn: wn, zeta: zeta, wd: wd, Q: 1 / (2 * zeta), sigma: p.R / (2 * p.L) };
  }

  function regime(zeta) {
    if (Math.abs(zeta - 1) < 1e-6) return 'críticamente amortiguado';
    return zeta < 1 ? 'subamortiguado' : 'sobreamortiguado';
  }

  /** Texto del régimen para la salida mostrada: v_C (por omisión) o la corriente i. */
  function regimeText(zeta, isI) {
    var r = regime(zeta);
    if (r === 'subamortiguado') {
      return 'Como ζ < 1, la energía pasa del inductor al capacitor y vuelve: ' +
        (isI ? 'la corriente oscila con frecuencia ωd' : 'la tensión oscila con frecuencia ωd') + ' mientras la resistencia la va apagando.';
    }
    if (r === 'críticamente amortiguado') {
      return isI ? 'Con ζ = 1 la corriente sube y vuelve a cero lo antes posible sin cambiar de signo.'
        : 'Con ζ = 1 el circuito alcanza el valor final lo antes posible sin sobrepasarlo.';
    }
    return isI ? 'Como ζ > 1, la resistencia domina: la corriente sube y se apaga sin oscilar mientras el capacitor se carga.'
      : 'Como ζ > 1, la resistencia domina: el capacitor se carga sin oscilar.';
  }

  var ENERGY = {
    unit: 'J',
    stored: function (x, p) { return 0.5 * p.L * x[0] * x[0] + 0.5 * p.C * x[1] * x[1]; },
    dissipated: function (x, u, p) { return p.R * x[0] * x[0]; },
    input: function (x, u) { return u * x[0]; }
  };

  /**
   * Constante de tiempo que se lee en la respuesta: 2L/R (envolvente) si ζ < 1; con ζ > 1 la del polo
   * lento, τ = −1/p_lenta con p_lenta = −σ + √(σ² − ωn²) (escrita sin cancelación); con ζ = 1, 1/σ (polo doble).
   */
  function decayReadout(p, c) {
    var r = regime(c.zeta);
    if (r === 'subamortiguado') {
      return { id: 'tau', label: 'Constante de decaimiento', tex: '2L/R', value: 1 / c.sigma, unit: 's', digits: 3,
        tip: 'Tiempo en que la envolvente de la oscilación cae a 1/e (≈ 37 %): τ = 1/σ = 2L/R.' };
    }
    if (r === 'críticamente amortiguado') {
      return { id: 'tau', label: 'Constante de tiempo (polo doble)', tex: '\\tau = 2L/R', value: 1 / c.sigma, unit: 's', digits: 3,
        tip: 'Con ζ = 1 hay un polo doble en s = −R/(2L): la respuesta lleva el factor e^(−t/τ) con τ = 2L/R.' };
    }
    var root = Math.sqrt(c.sigma * c.sigma - c.wn * c.wn);
    return { id: 'tau', label: 'Constante de tiempo dominante', tex: '\\tau = -1/p_{\\mathrm{lenta}}', value: (c.sigma + root) / (c.wn * c.wn), unit: 's', digits: 3,
      tip: 'Con ζ > 1 hay dos polos reales; el lento, p = −σ + √(σ² − ωn²), fija la duración: τ = −1/p (no 2L/R).' };
  }

  function tfFor(p, outputKey) {
    var C = TF();
    var den = [p.L * p.C, p.R * p.C, 1];
    if (outputKey === 'i') return new C([p.C, 0], den);
    return new C([1], den);
  }

  var model = {
    id: 'rlc',
    name: 'Circuito RLC serie',
    category: 'electrico',
    icon: 'zap',
    summary: 'Resistencia, inductor y capacitor en serie: el análogo eléctrico de la masa-resorte-amortiguador.',
    listed: true,
    sceneId: 'rlc',
    variants: VARIANTS,

    params: function () { return copyAll(PARAMS); },
    inputs: function () {
      return INPUTS.map(function (s) { return Object.assign({}, s, { params: copyAll(s.params) }); });
    },
    state: function () { return copyAll(STATE); },
    outputs: function () { return copyAll(OUTPUTS); },

    x0: function () { return [0, 0]; },

    deriv: function (t, x, u, p) {
      return [(u - p.R * x[0] - x[1]) / p.L, x[0] / p.C];
    },

    output: function (t, x) { return { vC: x[1], i: x[0] }; },

    hints: function (p) {
      var G = tfFor(p, 'vC');
      var h = H.hintsFromTF(G);
      var amp = INPUTS[0].params[0].default;
      var tt = DSL.core.numeric.linspace(0, h.duration, 300);
      var rv = H.range(G.step(tt)), ri = H.range(tfFor(p, 'i').step(tt));
      h.yRange = {
        vC: H.padRange(amp * Math.min(0, rv[0]), amp * rv[1], 0),
        i: H.padRange(amp * ri[0], amp * ri[1], 0)
      };
      return h;
    },

    tfPairs: function () {
      return [
        { outputKey: 'vC', label: 'V_C(s)/V(s)', linearized: false },
        { outputKey: 'i', label: 'I(s)/V(s)', linearized: false }
      ];
    },

    tf: function (p, variant, outputKey) {
      var key = outputKey === 'i' ? 'i' : 'vC';
      return {
        tf: tfFor(p, key),
        inputSymbol: 'V(s)',
        outputSymbol: key === 'i' ? 'I(s)' : 'V_C(s)',
        inputLabel: 'Tensión de la fuente',
        outputLabel: key === 'i' ? 'Corriente del circuito' : 'Tensión del capacitor',
        note: key === 'i' ? 'El cero en s = 0 refleja que el capacitor bloquea la corriente continua: en régimen permanente i = 0.' : ''
      };
    },

    linearization: function () { return null; },

    derivation: function (p, variant, outputKey) {
      var c = canon(p);
      var isI = outputKey === 'i';
      var LC = p.L * p.C, RC = p.R * p.C;
      var den = LX().poly([LC, RC, 1]);
      var steps = [];
      if (isI) {
        steps.push({
          id: 'ley', title: 'Ley física: ley de tensiones de Kirchhoff',
          text: 'Al recorrer la malla, la tensión de la fuente se reparte entre la resistencia (R·i), el inductor (L·di/dt) y el capacitor, cuya tensión es la carga acumulada dividida por C.',
          tex: [
            'v(t) = v_R + v_L + v_C',
            'L\\,\\frac{di}{dt} + R\\,i + \\frac{1}{C}\\int_0^{t} i\\,d\\tau = v(t)',
            lin([[p.L, '\\frac{di}{dt}'], [p.R, 'i'], [1 / p.C, '\\int_0^{t} i\\,d\\tau']]) + ' = v(t)'
          ]
        });
        steps.push({
          id: 'laplace', title: 'Transformada de Laplace con condiciones iniciales nulas',
          text: 'El circuito parte descargado: i(0) = 0 y v_C(0) = 0. Derivar equivale a multiplicar por s, e integrar desde 0, a dividir por s.',
          tex: [
            '\\mathcal{L}\\left\\{\\frac{di}{dt}\\right\\} = s\\,I(s) - i(0) = s\\,I(s)',
            '\\mathcal{L}\\left\\{\\int_0^{t} i\\,d\\tau\\right\\} = \\frac{I(s)}{s}',
            'L\\,s\\,I(s) + R\\,I(s) + \\frac{I(s)}{C\\,s} = V(s)'
          ]
        });
        steps.push({
          id: 'despeje', title: 'Despeje de G(s) = I(s)/V(s)',
          text: 'Se multiplica la ecuación por C·s para eliminar la fracción y se divide por V(s).',
          tex: [
            '\\left(L C\\,s^{2} + R C\\,s + 1\\right) I(s) = C\\,s\\,V(s)',
            'G(s) = \\frac{I(s)}{V(s)} = \\frac{C\\,s}{L C\\,s^{2} + R C\\,s + 1}',
            'G(s) = \\frac{' + LX().poly([p.C, 0]) + '}{' + den + '}'
          ]
        });
      } else {
        steps.push({
          id: 'ley', title: 'Ley física: ley de tensiones de Kirchhoff',
          text: 'Al recorrer la malla, la tensión de la fuente se reparte entre la resistencia (R·i), el inductor (L·di/dt) y el capacitor (v_C). Como la corriente que carga el capacitor es i = C·dv_C/dt, todo se escribe en función de v_C.',
          tex: [
            'v(t) = R\\,i + L\\,\\frac{di}{dt} + v_C, \\qquad i = C\\,\\frac{dv_C}{dt}',
            'L C\\,\\ddot{v}_C + R C\\,\\dot{v}_C + v_C = v(t)',
            lin([[LC, '\\ddot{v}_C'], [RC, '\\dot{v}_C'], [1, 'v_C']]) + ' = v(t)'
          ]
        });
        steps.push({
          id: 'laplace', title: 'Transformada de Laplace con condiciones iniciales nulas',
          text: 'El circuito parte descargado: v_C(0) = 0 e i(0) = 0, así que también v̇_C(0) = 0. Cada derivada se convierte en un factor s.',
          tex: [
            '\\mathcal{L}\\{\\dot{v}_C\\} = s\\,V_C(s) - v_C(0) = s\\,V_C(s)',
            '\\mathcal{L}\\{\\ddot{v}_C\\} = s^{2}V_C(s) - s\\,v_C(0) - \\dot{v}_C(0) = s^{2}V_C(s)',
            'L C\\,s^{2}V_C(s) + R C\\,s\\,V_C(s) + V_C(s) = V(s)'
          ]
        });
        steps.push({
          id: 'despeje', title: 'Despeje de G(s) = V_C(s)/V(s)',
          text: 'Se saca V_C(s) como factor común y se divide por V(s).',
          tex: [
            '\\left(L C\\,s^{2} + R C\\,s + 1\\right) V_C(s) = V(s)',
            'G(s) = \\frac{V_C(s)}{V(s)} = \\frac{1}{L C\\,s^{2} + R C\\,s + 1}',
            'G(s) = \\frac{1}{' + den + '}'
          ]
        });
      }
      var ctex = [
        isI ? 'G(s) = \\frac{1}{L}\\cdot\\frac{s}{s^{2} + 2\\zeta\\omega_n\\,s + \\omega_n^{2}}'
            : 'G(s) = \\frac{\\omega_n^{2}}{s^{2} + 2\\zeta\\omega_n\\,s + \\omega_n^{2}}',
        '\\omega_n = \\frac{1}{\\sqrt{L C}} = \\frac{1}{\\sqrt{' + n(p.L) + '\\cdot ' + n(p.C) + '}} = ' + n(c.wn) + '\\;\\mathrm{rad/s}',
        '\\zeta = \\frac{R}{2}\\sqrt{\\frac{C}{L}} = \\frac{' + n(p.R) + '}{2}\\sqrt{\\frac{' + n(p.C) + '}{' + n(p.L) + '}} = ' + n(c.zeta)
      ];
      if (!isI) ctex.push('K = 1 \\quad\\text{(en régimen permanente } v_C = v\\text{)}');
      if (c.wd !== null) ctex.push('\\omega_d = \\omega_n\\sqrt{1-\\zeta^{2}} = ' + n(c.wd) + '\\;\\mathrm{rad/s}');
      steps.push({
        id: 'canonica', title: 'Forma canónica y parámetros',
        text: (isI
          ? 'El denominador es el mismo que para v_C, así que ωn y ζ no cambian. El factor s del numerador hace que la corriente vuelva a cero cuando el capacitor termina de cargarse. '
          : 'Al dividir por LC aparece la forma estándar de segundo orden con ganancia 1: en régimen permanente el capacitor alcanza la tensión de la fuente. ') +
          regimeText(c.zeta, isI),
        tex: ctex
      });
      return steps;
    },

    /** Energías: almacenada ½Li² + ½Cv_C², potencia disipada R·i², potencia de la fuente v·i. */
    energy: function () { return ENERGY; },

    invariants: function (traj) {
      return [H.energyBalance(traj, ENERGY)];
    },

    readouts: function (p) {
      var c = canon(p);
      var out = [
        { id: 'wn', label: 'Frecuencia natural', tex: '\\omega_n', value: c.wn, unit: 'rad/s', digits: 4,
          tip: 'Frecuencia a la que la energía iría y vendría entre L y C sin resistencia: ωn = 1/√(LC).' },
        { id: 'zeta', label: 'Factor de amortiguamiento', tex: '\\zeta', value: c.zeta, unit: '', digits: 3,
          tip: 'Peso de la resistencia frente a L y C: ζ = (R/2)·√(C/L). Con ζ < 1 el circuito oscila; con ζ ≥ 1, no.' },
        {
          id: 'wd', label: 'Frecuencia amortiguada', tex: '\\omega_d', value: c.wd !== null ? c.wd : NaN, unit: 'rad/s', digits: 4,
          text: c.wd !== null ? undefined : 'no oscila',
          tip: 'Frecuencia con la que oscilan de verdad i y v_C: ωd = ωn·√(1 − ζ²). Solo existe si ζ < 1.'
        },
        { id: 'Q', label: 'Factor de calidad', tex: 'Q = 1/(2\\zeta)', value: c.Q, unit: '', digits: 3,
          tip: 'Lo selectivo que es el circuito: Q alto significa poca pérdida y una resonancia aguda alrededor de ωn.' },
        decayReadout(p, c)
      ];
      if (c.zeta < 1) {
        out.push({ id: 'Mp', label: 'Sobrepaso de v_C', tex: 'M_p', value: 100 * Math.exp(-c.zeta * Math.PI / Math.sqrt(1 - c.zeta * c.zeta)), unit: '%', digits: 3,
          tip: 'Cuánto supera v_C a la tensión de la fuente en el primer pico tras conectar un escalón, en % de ese valor.' });
      }
      out.push({ id: 'regimen', label: 'Régimen', tex: '', value: null, text: regime(c.zeta),
        tip: 'Tipo de respuesta según ζ: subamortiguada (oscila), crítica o sobreamortiguada (no oscila).' });
      return out;
    },

    wizard: {
      variant: 'serie',
      boundary: {
        inputs: [{ id: 'v', label: 'Tensión de la fuente', symbol: 'v(t)', unit: 'V' }],
        outputs: [
          { id: 'vC', label: 'Tensión en el capacitor', symbol: 'v_C(t)', unit: 'V' },
          { id: 'i', label: 'Corriente de la malla', symbol: 'i(t)', unit: 'A' }
        ],
        elements: [
          { id: 'resistencia', label: 'Resistencia', symbol: 'R', unit: 'Ω' },
          { id: 'inductor', label: 'Inductor', symbol: 'L', unit: 'H' },
          { id: 'capacitor', label: 'Capacitor', symbol: 'C', unit: 'F' }
        ],
        environment: [
          { id: 'fuente', label: 'Fuente de tensión ideal (impone v(t) sin resistencia interna)' },
          { id: 'cables', label: 'Conductores ideales sin resistencia' },
          { id: 'temperatura', label: 'Temperatura constante: R, L y C no cambian' }
        ]
      },
      laws: [
        { id: 'kvl', title: 'Ley de tensiones de Kirchhoff', text: 'En una malla cerrada, la suma de las caídas de tensión es igual a la tensión aplicada.', tex: 'v = v_R + v_L + v_C' },
        { id: 'ohm', title: 'Ley de Ohm', text: 'La tensión en la resistencia es proporcional a la corriente.', tex: 'v_R = R\\,i' },
        { id: 'inductor', title: 'Inductor', text: 'La tensión en el inductor es proporcional a la rapidez con que cambia la corriente.', tex: 'v_L = L\\,\\frac{di}{dt}' },
        { id: 'capacitor', title: 'Capacitor', text: 'La corriente que entra al capacitor es proporcional a la rapidez con que cambia su tensión.', tex: 'i = C\\,\\frac{dv_C}{dt}' }
      ],
      equationTerms: [
        { id: 'inductivo', tex: 'L C\\,\\ddot{v}_C', label: 'Término inductivo', text: 'Tensión en el inductor, escrita con v_C.', side: 'lhs' },
        { id: 'resistivo', tex: 'R C\\,\\dot{v}_C', label: 'Término resistivo', text: 'Caída en la resistencia, R·i con i = C·dv_C/dt.', side: 'lhs' },
        { id: 'capacitivo', tex: 'v_C', label: 'Término capacitivo', text: 'Tensión en el capacitor.', side: 'lhs' },
        { id: 'entrada', tex: 'v(t)', label: 'Entrada', text: 'Tensión que impone la fuente.', side: 'rhs' }
      ],
      equation: { tex: 'L C\\,\\ddot{v}_C + R C\\,\\dot{v}_C + v_C = v(t)' },
      stateSpace: {
        tex: '\\begin{bmatrix}\\dot{i}\\\\ \\dot{v}_C\\end{bmatrix} = \\begin{bmatrix}-\\dfrac{R}{L} & -\\dfrac{1}{L}\\\\ \\dfrac{1}{C} & 0\\end{bmatrix}\\begin{bmatrix}i\\\\ v_C\\end{bmatrix} + \\begin{bmatrix}\\dfrac{1}{L}\\\\ 0\\end{bmatrix} v(t)',
        texWith: function (p) {
          return '\\begin{bmatrix}\\dot{i}\\\\ \\dot{v}_C\\end{bmatrix} = \\begin{bmatrix}' + n(-p.R / p.L) + ' & ' + n(-1 / p.L) + '\\\\ ' + n(1 / p.C) +
            ' & 0\\end{bmatrix}\\begin{bmatrix}i\\\\ v_C\\end{bmatrix} + \\begin{bmatrix}' + n(1 / p.L) + '\\\\ 0\\end{bmatrix} v(t)';
        }
      },
      measured: {
        param: 'R', trueValue: 30, noise: 0.05, seed: 7041, samples: 80, outputKey: 'vC', duration: 0.12,
        input: { type: 'escalon', amplitude: 5, t0: 0 }
      }
    }
  };

  S.register(model);
})(window.DSL);
