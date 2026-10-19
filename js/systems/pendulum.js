/*
 * js/systems/pendulum.js — Propietario: systems.
 * Modelo «pendulum» (no aparece en la galería): θ̈ + c·θ̇ + (g/L)·sen θ = u, frente al linealizado
 * θ̈ + c·θ̇ + (g/L)·θ = u. u = τ/(m·L²) es un par aplicado por unidad de inercia (rad/s²).
 * Lo usan las tarjetas de conceptos (linealidad y métodos numéricos). API: docs/api/systems.md.
 */
(function (DSL) {
  'use strict';

  var S = DSL.systems;
  var H = S.helpers;
  var n = H.num, lin = H.lin;
  var G = H.G;

  function TF() { return DSL.core.tf.TransferFunction; }
  function LX() { return DSL.core.latex; }

  var VARIANTS = [
    { id: 'nolineal', label: 'Péndulo no lineal', timeDomain: 'continuous', linear: false, timeUnit: 's',
      summary: 'Modelo completo con sen θ: válido para cualquier amplitud.' },
    { id: 'lineal', label: 'Péndulo linealizado', timeDomain: 'continuous', linear: true, timeUnit: 's',
      summary: 'Aproximación de ángulos pequeños, sen θ ≈ θ.' }
  ];

  var DEG = { unit: '°', factor: 180 / Math.PI };

  var PARAMS = [
    H.param({
      key: 'L', label: 'Longitud', symbol: 'L', unit: 'm', min: 0.2, max: 5, step: 0.05, default: 1,
      tooltip: 'Distancia del eje al centro de la masa. Un péndulo más largo oscila más despacio: T₀ = 2π√(L/g).'
    }),
    H.param({
      key: 'c', label: 'Amortiguamiento', symbol: 'c', unit: '1/s', min: 0, max: 2, step: 0.01, default: 0.2,
      tooltip: 'Rozamiento del aire y del eje por unidad de inercia. Con c = 0 la energía se conserva y la oscilación no se apaga.'
    }),
    H.param({
      key: 'theta0', label: 'Ángulo inicial', symbol: '\\theta_0', unit: 'rad', min: 0, max: 3, step: 0.01, default: 1, display: DEG, live: false,
      tooltip: 'Ángulo desde el que se suelta el péndulo, en reposo. Con ángulos grandes, sen θ deja de parecerse a θ y los dos modelos se separan.'
    })
  ];

  var IP = H.inputParams;
  var INPUTS = [
    H.inputSpec('ninguna', { label: 'Oscilación libre', symbol: 'u(t)', unit: 'rad/s²', description: 'Se suelta desde θ₀ sin ninguna acción externa.', params: [] }),
    H.inputSpec('escalon', {
      symbol: 'u(t)', unit: 'rad/s²', description: 'Un par constante aplicado en el eje desde t₀ (dividido por la inercia m·L²).',
      params: [IP.amplitude({ label: 'Par por unidad de inercia', symbol: 'u_0', unit: 'rad/s²', min: -10, max: 10, step: 0.1, default: 2 }), IP.t0({ unit: 's', max: 10 })]
    }),
    H.inputSpec('pulso', {
      symbol: 'u(t)', unit: 'rad/s²', description: 'Un golpe breve en el eje.',
      params: [IP.amplitude({ label: 'Par por unidad de inercia', symbol: 'u_0', unit: 'rad/s²', min: -20, max: 20, step: 0.1, default: 5 }), IP.t0({ unit: 's', max: 10 }),
        IP.width({ unit: 's', min: 0.05, max: 2, step: 0.05, default: 0.2 })]
    })
  ];

  var STATE = [
    { key: 'theta', label: 'Ángulo', symbol: '\\theta', unit: 'rad' },
    { key: 'omega', label: 'Velocidad angular', symbol: '\\omega', unit: 'rad/s' }
  ];
  var OUTPUTS = [
    { key: 'theta', label: 'Ángulo', symbol: '\\theta(t)', unit: 'rad', color: '--c-out' },
    { key: 'omega', label: 'Velocidad angular', symbol: '\\omega(t)', unit: 'rad/s', color: '--c-zero' }
  ];

  function copyAll(a) { return a.map(function (o) { return Object.assign({}, o); }); }
  function V(variant) { return variant === 'lineal' ? 'lineal' : 'nolineal'; }

  /** Media aritmético-geométrica (para el periodo exacto del péndulo sin amortiguar). */
  function agm(a, b) {
    for (var i = 0; i < 60 && Math.abs(a - b) > 1e-15 * a; i++) {
      var an = 0.5 * (a + b);
      b = Math.sqrt(a * b);
      a = an;
    }
    return a;
  }

  function energyCfg(isLin) {
    return {
      unit: 'J/kg',
      stored: function (x, p) {
        var pot = isLin ? 0.5 * G * p.L * x[0] * x[0] : G * p.L * (1 - Math.cos(x[0]));
        return 0.5 * p.L * p.L * x[1] * x[1] + pot;
      },
      dissipated: function (x, u, p) { return p.c * p.L * p.L * x[1] * x[1]; },
      input: function (x, u, p) { return u * p.L * p.L * x[1]; }
    };
  }
  var ENERGY_NL = energyCfg(false), ENERGY_LIN = energyCfg(true);

  function canon(p) {
    var wn = Math.sqrt(G / p.L);
    var T0 = 2 * Math.PI / wn;
    var th = Math.min(Math.abs(p.theta0), Math.PI - 1e-9);
    var Tbig = T0 / agm(1, Math.cos(th / 2));
    return { wn: wn, zeta: p.c / (2 * wn), T0: T0, T: Tbig };
  }

  var model = {
    id: 'pendulum',
    name: 'Péndulo simple',
    category: 'mecanico',
    icon: 'metronome',
    summary: 'Una masa que cuelga de una varilla: lineal para ángulos pequeños, no lineal para oscilaciones amplias.',
    listed: false,
    sceneId: null,
    variants: VARIANTS,

    params: function () { return copyAll(PARAMS); },
    inputs: function () {
      return INPUTS.map(function (s) { return Object.assign({}, s, { params: copyAll(s.params) }); });
    },
    state: function () { return copyAll(STATE); },
    outputs: function () { return copyAll(OUTPUTS); },

    x0: function (p) { return [p.theta0, 0]; },

    deriv: function (t, x, u, p, variant) {
      var restoring = V(variant) === 'lineal' ? x[0] : Math.sin(x[0]);
      return [x[1], -p.c * x[1] - (G / p.L) * restoring + u];
    },

    output: function (t, x) { return { theta: x[0], omega: x[1] }; },

    hints: function (p, variant) {
      var c = canon(p);
      var period = V(variant) === 'lineal' ? c.T0 : c.T;
      var dur = 8 * period;
      if (p.c > 0) dur = Math.min(dur, 12 / p.c);
      dur = H.niceCeil(Math.max(dur, 2 * c.T0));
      var dt = c.T0 / 200;
      dt = dur / Math.ceil(dur / dt - 1e-9);
      var th = Math.max(Math.abs(p.theta0), 0.1);
      var wmax = V(variant) === 'lineal' ? th * c.wn : Math.sqrt(2 * (G / p.L) * (1 - Math.cos(Math.min(th, Math.PI))));
      return {
        duration: dur, dt: dt, timeScale: 1,
        yRange: { theta: [-1.1 * th, 1.1 * th], omega: [-1.1 * wmax, 1.1 * wmax] }
      };
    },

    tfPairs: function () { return []; },

    tf: function (p, variant) {
      if (V(variant) !== 'lineal') return null;
      return {
        tf: new (TF())([1], [1, p.c, G / p.L]),
        inputSymbol: 'U(s)', outputSymbol: '\\Theta(s)',
        inputLabel: 'Par aplicado por unidad de inercia', outputLabel: 'Ángulo',
        note: 'Solo vale para ángulos pequeños (sen θ ≈ θ).'
      };
    },

    linearization: function (p, variant) {
      if (V(variant) !== 'nolineal') return null;
      var err = p.theta0 > 0 ? 100 * (p.theta0 - Math.sin(p.theta0)) / Math.sin(p.theta0) : 0;
      return {
        operatingPoint: { theta: 0, omega: 0 },
        tf: new (TF())([1], [1, p.c, G / p.L]),
        tex: [
          '\\sin\\theta = \\theta - \\frac{\\theta^{3}}{6} + \\ldots \\approx \\theta',
          '\\ddot{\\theta} + c\\,\\dot{\\theta} + \\frac{g}{L}\\,\\theta = u(t)',
          '\\frac{\\Theta(s)}{U(s)} = \\frac{1}{' + LX().poly([1, p.c, G / p.L]) + '}'
        ],
        note: 'Alrededor de θ = 0. Con θ₀ = ' + DSL.util.formatNumber(p.theta0 * 180 / Math.PI, 3) + '° la aproximación sen θ ≈ θ comete un error del ' +
          DSL.util.formatNumber(err, 2) + ' %.'
      };
    },

    derivation: function (p, variant) {
      var c = canon(p);
      var isLin = V(variant) === 'lineal';
      var err = p.theta0 > 0 ? 100 * (p.theta0 - Math.sin(p.theta0)) / Math.sin(p.theta0) : 0;
      return [{
        id: 'ley', title: 'Ley física: segunda ley de Newton para la rotación',
        text: 'El momento de inercia de la masa respecto del eje es m·L². La gravedad tira hacia abajo con un momento −m·g·L·sen θ, el rozamiento frena con un momento proporcional a la velocidad angular y u representa un par externo. Dividiendo por m·L² la masa desaparece: el movimiento no depende de ella.',
        tex: [
          'm L^{2}\\,\\ddot{\\theta} = -m g L\\,\\sin\\theta - c\\,m L^{2}\\,\\dot{\\theta} + \\tau',
          '\\ddot{\\theta} + c\\,\\dot{\\theta} + \\frac{g}{L}\\,\\sin\\theta = u(t), \\qquad u = \\frac{\\tau}{m L^{2}}',
          lin([[1, '\\ddot{\\theta}'], [p.c, '\\dot{\\theta}'], [G / p.L, '\\sin\\theta']]) + ' = u(t)'
        ]
      }, {
        id: 'linealizacion', title: 'Aproximación de ángulos pequeños',
        text: 'sen θ no es proporcional a θ, así que la ecuación completa es no lineal y no tiene G(s). Para ángulos pequeños sen θ ≈ θ (primer término de su serie de Taylor) y la ecuación se vuelve lineal. ' +
          (p.theta0 > 0 ? 'Con θ₀ = ' + DSL.util.formatNumber(p.theta0 * 180 / Math.PI, 3) + '° el error de la aproximación es del ' + DSL.util.formatNumber(err, 2) + ' %.' : ''),
        tex: [
          '\\sin\\theta = \\theta - \\frac{\\theta^{3}}{6} + \\frac{\\theta^{5}}{120} - \\ldots \\approx \\theta',
          '\\ddot{\\theta} + c\\,\\dot{\\theta} + \\frac{g}{L}\\,\\theta = u(t)'
        ]
      }, {
        id: 'laplace', title: 'Transformada de Laplace con condiciones iniciales nulas',
        text: 'Para la función de transferencia se parte del reposo en la vertical: θ(0) = 0 y θ̇(0) = 0. Soltarlo desde θ₀ es una respuesta a condiciones iniciales, que G(s) no recoge.',
        tex: ['s^{2}\\Theta(s) + c\\,s\\,\\Theta(s) + \\frac{g}{L}\\,\\Theta(s) = U(s)']
      }, {
        id: 'despeje', title: 'Despeje de G(s) = Θ(s)/U(s)',
        text: 'Solo existe para el modelo linealizado.',
        tex: ['G(s) = \\frac{\\Theta(s)}{U(s)} = \\frac{1}{s^{2} + c\\,s + g/L}', 'G(s) = \\frac{1}{' + LX().poly([1, p.c, G / p.L]) + '}']
      }, {
        id: 'canonica', title: 'Parámetros y periodo',
        text: isLin
          ? 'En el modelo lineal el periodo no depende de la amplitud: es T₀ = 2π√(L/g) para cualquier θ₀.'
          : 'En el modelo no lineal el periodo crece con la amplitud. Sin amortiguamiento vale exactamente T = T₀/M(1, cos(θ₀/2)), con M la media aritmético-geométrica; para θ₀ = ' +
            DSL.util.formatNumber(p.theta0 * 180 / Math.PI, 3) + '° es un ' + DSL.util.formatNumber(100 * (c.T / c.T0 - 1), 3) + ' % mayor que T₀.',
        tex: [
          '\\omega_n = \\sqrt{\\frac{g}{L}} = ' + n(c.wn) + '\\;\\mathrm{rad/s}, \\qquad \\zeta = \\frac{c}{2\\omega_n} = ' + n(c.zeta),
          'T_0 = 2\\pi\\sqrt{\\frac{L}{g}} = ' + n(c.T0) + '\\;\\mathrm{s}'
        ].concat(isLin ? [] : ['T(\\theta_0) = \\frac{T_0}{M\\left(1, \\cos\\frac{\\theta_0}{2}\\right)} = ' + n(c.T) + '\\;\\mathrm{s}'])
      }];
    },

    /** Energías por unidad de masa (cinética + potencial exacta o cuadrática según la variante). */
    energy: function (variant) { return V(variant) === 'lineal' ? ENERGY_LIN : ENERGY_NL; },

    invariants: function (traj) {
      return [H.energyBalance(traj, model.energy(traj.variant))];
    },

    readouts: function (p, variant) {
      var c = canon(p);
      var out = [
        { id: 'wn', label: 'Frecuencia natural (ángulos pequeños)', tex: '\\omega_n = \\sqrt{g/L}', value: c.wn, unit: 'rad/s', digits: 3,
          tip: 'Rapidez de la oscilación para ángulos pequeños y sin rozamiento: ωn = √(g/L). No depende de la masa.' },
        { id: 'zeta', label: 'Factor de amortiguamiento', tex: '\\zeta = c/(2\\omega_n)', value: c.zeta, unit: '', digits: 3,
          tip: 'Cuánto frena el rozamiento: con ζ < 1 el péndulo oscila apagándose; con ζ ≥ 1 vuelve sin oscilar.' },
        { id: 'T0', label: 'Periodo de pequeñas oscilaciones', tex: 'T_0', value: c.T0, unit: 's', digits: 4,
          tip: 'T₀ = 2π/ωn: periodo sin rozamiento y con ángulos pequeños. Con rozamiento la oscilación es algo más lenta (2π/ωd).' }
      ];
      if (V(variant) === 'nolineal') {
        out.push({ id: 'T', label: 'Periodo con amplitud θ₀ (sin rozamiento)', tex: 'T(\\theta_0)', value: c.T, unit: 's', digits: 4,
          tip: 'Periodo exacto del péndulo no lineal sin rozamiento soltado desde θ₀: crece con la amplitud y supera a T₀.' });
        out.push({ id: 'errorSen', label: 'Error de sen θ ≈ θ en θ₀', tex: '(\\theta_0 - \\sin\\theta_0)/\\sin\\theta_0', value: p.theta0 > 0 ? 100 * (p.theta0 - Math.sin(p.theta0)) / Math.sin(p.theta0) : 0, unit: '%', digits: 3,
          tip: 'Cuánto se equivoca la aproximación sen θ ≈ θ en el ángulo inicial; por debajo de un 1 % el modelo lineal es fiable.' });
      }
      return out;
    },

    wizard: null
  };

  S.register(model);
})(window.DSL);
