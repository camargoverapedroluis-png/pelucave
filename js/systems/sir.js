/*
 * js/systems/sir.js — Propietario: systems.
 * Modelo «sir»: epidemia SIR (biológico). Ṡ = −βSI/N, İ = βSI/N − γI, Ṙ = γI.
 * La entrada u ∈ [0, 1] es la fracción de contactos evitada (distanciamiento): β_ef = β(1 − u).
 * API: docs/api/systems.md.
 */
(function (DSL) {
  'use strict';

  var S = DSL.systems;
  var H = S.helpers;
  var n = H.num;

  var VARIANTS = [{
    id: 'base', label: 'Modelo SIR', timeDomain: 'continuous', linear: false, timeUnit: 'días',
    summary: 'Una población cerrada se reparte entre susceptibles, infectados y recuperados.'
  }];

  var PCT = { unit: '%', factor: 100 };

  var PARAMS = [
    H.param({
      key: 'beta', label: 'Tasa de contagio', symbol: '\\beta', unit: '1/día', min: 0.05, max: 1, step: 0.01, default: 0.3,
      tooltip: 'Contagios que produce al día un infectado si todos a su alrededor fueran susceptibles. Recoge la frecuencia de contactos y la probabilidad de transmitir en cada uno.'
    }),
    H.param({
      key: 'gamma', label: 'Tasa de recuperación', symbol: '\\gamma', unit: '1/día', min: 0.02, max: 0.5, step: 0.01, default: 0.1,
      tooltip: 'Fracción de los infectados que se recupera cada día. Su inverso, 1/γ, es la duración media de la infección (con γ = 0.1, diez días).'
    }),
    H.param({
      key: 'N', label: 'Población total', symbol: 'N', unit: 'personas', min: 1000, max: 1000000, step: 1000, default: 10000, scale: 'log', live: false,
      tooltip: 'Número de personas de la población, que se supone cerrada: sin nacimientos, muertes ni migración. S + I + R vale siempre N.'
    }),
    H.param({
      key: 'I0', label: 'Infectados iniciales', symbol: 'I_0', unit: 'personas', min: 1, max: 100, step: 1, default: 10, live: false,
      tooltip: 'Casos con los que empieza el brote. El resto de la población parte susceptible.'
    })
  ];

  var IP = H.inputParams;
  var INPUTS = [
    H.inputSpec('ninguna', { label: 'Sin intervención', symbol: 'u(t)', unit: '', description: 'La epidemia sigue su curso sin medidas.', params: [] }),
    H.inputSpec('escalon', {
      label: 'Escalón', symbol: 'u(t)', unit: '', description: 'Desde el día t₀ se evita una fracción u de los contactos: la tasa de contagio efectiva pasa a ser β·(1 − u).',
      params: [IP.amplitude({ label: 'Reducción de contactos', symbol: 'u_0', unit: '', min: 0, max: 0.9, step: 0.05, default: 0.5, display: PCT,
        tooltip: 'Fracción de los contactos que se evita con las medidas (0 = ninguna, 0.9 = el 90 %).' }),
      IP.t0({ unit: 'días', max: 120, step: 1, default: 20, tooltip: 'Día en que empiezan las medidas.' })]
    }),
    H.inputSpec('pulso', {
      label: 'Pulso', symbol: 'u(t)', unit: '', description: 'Medidas temporales: se reducen los contactos durante T_p días y después se levantan.',
      params: [IP.amplitude({ label: 'Reducción de contactos', symbol: 'u_0', unit: '', min: 0, max: 0.9, step: 0.05, default: 0.6, display: PCT,
        tooltip: 'Fracción de los contactos que se evita mientras duran las medidas.' }),
      IP.t0({ unit: 'días', max: 120, step: 1, default: 20, tooltip: 'Día en que empiezan las medidas.' }),
      IP.width({ unit: 'días', min: 1, max: 120, step: 1, default: 30, tooltip: 'Días que duran las medidas.' })]
    })
  ];

  var STATE = [
    { key: 'S', label: 'Susceptibles', symbol: 'S', unit: 'personas' },
    { key: 'I', label: 'Infectados', symbol: 'I', unit: 'personas' },
    { key: 'R', label: 'Recuperados', symbol: 'R', unit: 'personas' }
  ];
  var OUTPUTS = [
    { key: 'S', label: 'Susceptibles', symbol: 'S(t)', unit: 'personas', color: '--c-out' },
    { key: 'I', label: 'Infectados', symbol: 'I(t)', unit: 'personas', color: '--c-pole' },
    { key: 'R', label: 'Recuperados', symbol: 'R(t)', unit: 'personas', color: '--c-zero' }
  ];

  function copyAll(a) { return a.map(function (o) { return Object.assign({}, o); }); }

  function I0of(p) { return Math.min(p.I0, p.N); }

  function deriv(t, x, u, p) {
    var ue = u < 0 ? 0 : u > 1 ? 1 : u;
    var inf = p.beta * (1 - ue) * x[0] * x[1] / p.N;
    var rec = p.gamma * x[1];
    return [-inf, inf - rec, rec];
  }

  /** Tamaño final r∞ (fracción) de 1 − r = s0·e^{−R0 r}, por Newton (sin intervención). */
  function finalSize(R0, s0) {
    if (!(R0 > 0)) return 0;
    var r = R0 > 1 ? 1 - 1 / (R0 * R0) : 1e-6;
    for (var i = 0; i < 100; i++) {
      var f = 1 - r - s0 * Math.exp(-R0 * r);
      var df = -1 + s0 * R0 * Math.exp(-R0 * r);
      var step = f / df;
      r -= step;
      if (r < 0) r = 0;
      if (r > 1) r = 1;
      if (Math.abs(step) < 1e-14) break;
    }
    return r;
  }

  function analysis(p) {
    var N = p.N, I0 = I0of(p), S0 = N - I0;
    var R0 = p.beta / p.gamma;
    var Imax = R0 * S0 / N > 1 ? I0 + S0 - (N / R0) * (1 + Math.log(R0 * S0 / N)) : I0;
    var rInf = finalSize(R0, S0 / N);
    var rate = p.beta - p.gamma;
    return {
      R0: R0, threshold: R0 > 1 ? 1 - 1 / R0 : 0, Imax: Imax, finalFraction: rInf, growth: rate,
      doubling: rate > 0 ? Math.log(2) / rate : Infinity, infectiousDays: 1 / p.gamma
    };
  }

  /** Día del máximo de I (sin intervención), integrando con RK4. */
  function peakTime(p, duration, dt) {
    var N = DSL.core.numeric;
    var x = [p.N - I0of(p), I0of(p), 0];
    var f = function (t, xx) { return deriv(t, xx, 0, p); };
    var best = x[1], tBest = 0, t = 0;
    var steps = Math.ceil(duration / dt);
    for (var i = 0; i < steps; i++) {
      x = N.rk4Step(f, t, x, dt, x);
      t += dt;
      if (x[1] > best) { best = x[1]; tBest = t; }
      else if (x[1] < best * 0.5) break;
    }
    return tBest;
  }

  var model = {
    id: 'sir',
    name: 'Epidemia SIR',
    category: 'biologico',
    icon: 'virus',
    summary: 'Susceptibles, infectados y recuperados: un modelo no lineal de stocks y flujos donde el contagio se refuerza a sí mismo hasta agotar a los susceptibles.',
    listed: true,
    sceneId: 'sir',
    variants: VARIANTS,

    params: function () { return copyAll(PARAMS); },
    inputs: function () {
      return INPUTS.map(function (s) { return Object.assign({}, s, { params: copyAll(s.params) }); });
    },
    state: function () { return copyAll(STATE); },
    outputs: function () { return copyAll(OUTPUTS); },

    x0: function (p) { var I0 = I0of(p); return [p.N - I0, I0, 0]; },
    deriv: deriv,
    output: function (t, x) { return { S: x[0], I: x[1], R: x[2] }; },

    hints: function (p) {
      var rate = Math.max(Math.abs(p.beta - p.gamma), 0.01);
      var d;
      if (p.beta > p.gamma) d = 2 * Math.log(p.N / I0of(p)) / rate + 4 / p.gamma;
      else d = 5 / rate;
      var duration = H.niceCeil(Math.min(400, Math.max(30, d)));
      var dt = Math.min(0.1, duration / 2000);
      dt = duration / Math.ceil(duration / dt - 1e-9);
      return {
        duration: duration, dt: dt, timeScale: H.niceNumber(duration / 15),
        yRange: { S: [0, p.N], I: [0, p.N], R: [0, p.N] }
      };
    },

    tfPairs: function () { return []; },
    tf: function () { return null; },

    linearization: function (p) {
      var a = analysis(p);
      return {
        operatingPoint: { S: p.N, I: 0, R: 0 },
        tf: null,
        eigenvalue: p.beta - p.gamma,
        tex: [
          'S \\approx N \\;\\Rightarrow\\; \\frac{\\beta S I}{N} \\approx \\beta I',
          '\\dot{I} \\approx \\left(\\beta - \\gamma\\right) I = ' + n(p.beta - p.gamma) + '\\,I',
          'I(t) \\approx I_0\\,e^{(\\beta - \\gamma)t} = ' + n(I0of(p)) + '\\,e^{' + n(p.beta - p.gamma) + '\\,t}'
        ],
        note: (a.growth > 0
          ? 'Al principio los casos crecen exponencialmente y se duplican cada ' + DSL.util.formatNumber(a.doubling, 3) + ' días. '
          : 'Como β ≤ γ, cada caso se recupera antes de contagiar a otro: el brote se extingue. ') +
          'Es solo una aproximación del arranque: no tiene entrada (la intervención multiplica a I, que vale 0 en el equilibrio), así que no hay G(s).'
      };
    },

    derivation: function (p) {
      var a = analysis(p);
      var f = function (x, d) { return DSL.util.formatNumber(x, d || 3); };
      return [{
        id: 'ley', title: 'Ley de conservación: balances de población',
        text: 'Cada grupo es un stock que cambia por los flujos que entran y salen. El contagio pasa personas de S a I a un ritmo proporcional a los encuentros entre susceptibles e infectados (ley de acción de masas, βSI/N); la recuperación pasa personas de I a R a ritmo γI. Nadie entra ni sale de la población.',
        tex: [
          '\\frac{dS}{dt} = -\\frac{\\beta S I}{N}, \\qquad \\frac{dI}{dt} = \\frac{\\beta S I}{N} - \\gamma I, \\qquad \\frac{dR}{dt} = \\gamma I',
          '\\frac{dS}{dt} + \\frac{dI}{dt} + \\frac{dR}{dt} = 0 \\;\\Rightarrow\\; S + I + R = N = ' + n(p.N, 6)
        ]
      }, {
        id: 'nolineal', title: 'Por qué no hay una G(s) global',
        text: 'El término βSI/N multiplica dos estados entre sí. Un modelo así no cumple la superposición: con el doble de casos iniciales la epidemia no es el doble de grande, solo llega antes. La transformada de Laplace de un producto no es el producto de transformadas, de modo que no se puede despejar una razón Y(s)/U(s) válida para todas las entradas.',
        tex: [
          '\\mathcal{L}\\{S(t)\\,I(t)\\} \\neq S(s)\\,I(s)',
          'G(s) = \\frac{Y(s)}{U(s)} \\text{ solo existe para sistemas lineales e invariantes en el tiempo}'
        ]
      }, {
        id: 'linealizacion', title: 'Linealización en el equilibrio libre de enfermedad',
        text: 'Al inicio casi todos son susceptibles (S ≈ N) y el producto se vuelve lineal en I. Esa aproximación describe el arranque del brote: crece si β > γ y se extingue si β < γ. La intervención u actúa multiplicada por I, que vale 0 en el equilibrio, así que el sistema linealizado no tiene entrada y tampoco ofrece una G(s).',
        tex: [
          'S \\approx N \\;\\Rightarrow\\; \\dot{I} \\approx \\left(\\beta - \\gamma\\right) I',
          '\\beta - \\gamma = ' + n(p.beta) + ' - ' + n(p.gamma) + ' = ' + n(p.beta - p.gamma) + '\\;\\text{día}^{-1}',
          a.growth > 0
            ? 'I(t) \\approx ' + n(I0of(p)) + '\\,e^{' + n(a.growth) + '\\,t}, \\qquad t_{2} = \\frac{\\ln 2}{\\beta - \\gamma} = ' + n(a.doubling) + '\\;\\text{días}'
            : 'I(t) \\approx ' + n(I0of(p)) + '\\,e^{' + n(a.growth) + '\\,t} \\;\\to\\; 0'
        ]
      }, {
        id: 'umbral', title: 'Número reproductivo básico y umbral',
        text: 'R₀ = β/γ es el número de contagios que produce un caso durante su infección en una población susceptible. Si R₀ > 1 hay epidemia; para frenarla basta con que la fracción inmune supere 1 − 1/R₀ (inmunidad de grupo). ' +
          (a.R0 > 1
            ? 'Con R₀ = ' + f(a.R0) + ', el umbral es ' + f(100 * a.threshold) + ' % y, sin intervención, se acabaría infectando el ' + f(100 * a.finalFraction) + ' % de la población.'
            : 'Con R₀ = ' + f(a.R0) + ' ≤ 1 el brote no prospera.'),
        tex: [
          'R_0 = \\frac{\\beta}{\\gamma} = \\frac{' + n(p.beta) + '}{' + n(p.gamma) + '} = ' + n(a.R0),
          '1 - \\frac{1}{R_0} = ' + n(a.threshold),
          'r_\\infty = 1 - \\frac{S_0}{N}\\,e^{-R_0 r_\\infty} \\;\\Rightarrow\\; r_\\infty = ' + n(a.finalFraction)
        ]
      }, {
        id: 'pico', title: 'Máximo de infectados',
        text: 'Los infectados dejan de crecer cuando la fracción de susceptibles baja de 1/R₀: en ese momento el lazo de equilibrio (agotamiento de susceptibles y recuperación) domina al de refuerzo (contagio). Combinando las ecuaciones de S e I se obtiene el pico sin resolver el sistema.',
        tex: [
          '\\dot{I} = 0 \\iff S = \\frac{N}{R_0}',
          'I_{\\mathrm{max}} = I_0 + S_0 - \\frac{N}{R_0}\\left(1 + \\ln\\frac{R_0 S_0}{N}\\right) = ' + n(a.Imax) + '\\;\\text{personas}'
        ]
      }];
    },

    invariants: function (traj) {
      var p = traj.params, X = traj.x;
      var maxDev = 0, minVal = Infinity, maxRise = 0;
      for (var i = 0; i < X.length; i++) {
        var x = X[i];
        maxDev = Math.max(maxDev, Math.abs(x[0] + x[1] + x[2] - p.N));
        minVal = Math.min(minVal, x[0], x[1], x[2]);
        if (i) maxRise = Math.max(maxRise, x[0] - X[i - 1][0]);
      }
      var tolN = 1e-9 * p.N;
      var f = function (x) { return DSL.util.formatNumber(x, 3); };
      return [{
        id: 'conservacion', label: 'S + I + R = N', tex: 'S + I + R = N',
        value: maxDev, tolerance: tolN, unit: 'personas', ok: maxDev <= tolN,
        detail: 'Máxima desviación de la población total: ' + f(maxDev) + ' personas de ' + f(p.N) + '.'
      }, {
        id: 'positividad', label: 'Ningún grupo negativo', tex: 'S,\\,I,\\,R \\ge 0',
        value: minVal, tolerance: tolN, unit: 'personas', ok: minVal >= -tolN,
        detail: 'Valor mínimo alcanzado por S, I o R: ' + f(minVal) + '.'
      }, {
        id: 'monotonia', label: 'Los susceptibles nunca aumentan', tex: '\\dot{S} \\le 0',
        value: maxRise, tolerance: tolN, unit: 'personas', ok: maxRise <= tolN,
        detail: 'Mayor aumento de S entre dos muestras: ' + f(maxRise) + '.'
      }];
    },

    readouts: function (p) {
      var a = analysis(p);
      var h = model.hints(p);
      return [
        { id: 'R0', label: 'Número reproductivo básico', tex: 'R_0 = \\beta/\\gamma', value: a.R0, unit: '', digits: 3, tip: 'Contagios que causa un infectado en una población toda susceptible: R₀ = β/γ. Si R₀ > 1 hay epidemia.' },
        { id: 'umbral', label: 'Umbral de inmunidad de grupo', tex: '1 - 1/R_0', value: 100 * a.threshold, unit: '%', digits: 3, tip: 'Fracción inmune a partir de la cual cada infectado contagia a menos de uno y el brote retrocede: 1 − 1/R₀.' },
        { id: 'Imax', label: 'Máximo de infectados', tex: 'I_{\\mathrm{max}}', value: a.Imax, unit: 'personas', digits: 4, tip: 'Mayor número de infectados a la vez, sin intervención; se alcanza cuando S/N baja a 1/R₀.' },
        { id: 'tPico', label: 'Día del máximo (sin intervención)', tex: 't_{\\mathrm{max}}', value: a.R0 * (p.N - I0of(p)) / p.N > 1 ? peakTime(p, h.duration, h.dt) : 0, unit: 'días', digits: 3, tip: 'Día en que los infectados activos llegan a su máximo, sin intervención (medido en la simulación).' },
        { id: 'final', label: 'Fracción que llega a infectarse', tex: 'r_\\infty', value: 100 * a.finalFraction, unit: '%', digits: 3, tip: 'Porcentaje de la población que se infecta en algún momento al terminar el brote, sin intervención.' },
        { id: 'crecimiento', label: 'Tasa inicial de crecimiento', tex: '\\beta - \\gamma', value: a.growth, unit: '1/día', digits: 3, tip: 'Ritmo del arranque exponencial I ≈ I₀·e^((β − γ)t) mientras casi todos son susceptibles.' },
        { id: 'duracion', label: 'Duración media de la infección', tex: '1/\\gamma', value: a.infectiousDays, unit: 'días', digits: 3, tip: 'Días que dura en promedio una infección: 1/γ.' },
        { id: 'regimen', label: 'Comportamiento', tex: '', value: null, text: a.R0 > 1 ? 'hay epidemia (R₀ > 1)' : 'el brote se extingue (R₀ ≤ 1)', tip: 'Con R₀ > 1 los casos crecen hasta agotar susceptibles; con R₀ ≤ 1 el brote se apaga desde el inicio.' }
      ];
    },

    wizard: {
      variant: 'base',
      boundary: {
        inputs: [
          { id: 'u', label: 'Medidas de distanciamiento (fracción de contactos evitada)', symbol: 'u(t)', unit: '' },
          { id: 'I0', label: 'Casos con los que empieza el brote', symbol: 'I_0', unit: 'personas' }
        ],
        outputs: [
          { id: 'I', label: 'Infectados activos', symbol: 'I(t)', unit: 'personas' },
          { id: 'S', label: 'Susceptibles', symbol: 'S(t)', unit: 'personas' },
          { id: 'R', label: 'Recuperados', symbol: 'R(t)', unit: 'personas' }
        ],
        elements: [
          { id: 'S', label: 'Stock de susceptibles', symbol: 'S', unit: 'personas' },
          { id: 'I', label: 'Stock de infectados', symbol: 'I', unit: 'personas' },
          { id: 'R', label: 'Stock de recuperados', symbol: 'R', unit: 'personas' },
          { id: 'contagio', label: 'Flujo de contagio', symbol: '\\beta S I/N', unit: 'personas/día' },
          { id: 'recuperacion', label: 'Flujo de recuperación', symbol: '\\gamma I', unit: 'personas/día' }
        ],
        environment: [
          { id: 'cerrada', label: 'Población cerrada: sin nacimientos, muertes ni migración' },
          { id: 'mezcla', label: 'Mezcla homogénea: cualquiera puede encontrarse con cualquiera' },
          { id: 'inmunidad', label: 'La recuperación da inmunidad permanente' }
        ]
      },
      laws: [
        { id: 'conservacion', title: 'Conservación de la población', text: 'Las personas solo pasan de un grupo a otro; el total no cambia.', tex: 'S + I + R = N' },
        { id: 'accion', title: 'Ley de acción de masas', text: 'Los contagios por día son proporcionales a los encuentros entre susceptibles e infectados.', tex: '\\text{contagios} = \\frac{\\beta S I}{N}' },
        { id: 'recuperacion', title: 'Recuperación a tasa constante', text: 'Cada día se recupera una fracción γ de los infectados; la infección dura en promedio 1/γ días.', tex: '\\text{recuperaciones} = \\gamma I' }
      ],
      stocksFlows: {
        stocks: [
          { id: 'S', label: 'Susceptibles', symbol: 'S' },
          { id: 'I', label: 'Infectados', symbol: 'I' },
          { id: 'R', label: 'Recuperados', symbol: 'R' }
        ],
        flows: [
          { id: 'contagio', label: 'Contagio', from: 'S', to: 'I', tex: '\\frac{\\beta S I}{N}' },
          { id: 'recuperacion', label: 'Recuperación', from: 'I', to: 'R', tex: '\\gamma I' }
        ]
      },
      causal: {
        links: [
          { from: 'I', to: 'contagio', polarity: '+' },
          { from: 'contagio', to: 'I', polarity: '+' },
          { from: 'S', to: 'contagio', polarity: '+' },
          { from: 'contagio', to: 'S', polarity: '-' },
          { from: 'I', to: 'recuperacion', polarity: '+' },
          { from: 'recuperacion', to: 'I', polarity: '-' },
          { from: 'recuperacion', to: 'R', polarity: '+' }
        ],
        loops: [
          { id: 'R1', type: 'refuerzo', label: 'Contagio', variables: ['I', 'contagio'],
            text: 'Más infectados producen más contagios, que a su vez suman infectados: el brote crece de forma exponencial.' },
          { id: 'B1', type: 'equilibrio', label: 'Agotamiento de susceptibles', variables: ['S', 'contagio'],
            text: 'Cada contagio resta un susceptible; con menos susceptibles, hay menos contagios. Este lazo termina frenando la epidemia.' },
          { id: 'B2', type: 'equilibrio', label: 'Recuperación', variables: ['I', 'recuperacion'],
            text: 'Cuantos más infectados, más recuperaciones por día, que vacían el stock de infectados.' }
        ]
      },
      equationTerms: [
        { id: 'dS', tex: '\\dot{S} = -\\frac{\\beta S I}{N}', label: 'Balance de susceptibles', text: 'Solo salen, por contagio.', side: 'eq' },
        { id: 'contagio', tex: '\\frac{\\beta S I}{N}', label: 'Flujo de contagio', text: 'Término no lineal: producto de dos estados.', side: 'flow' },
        { id: 'dI', tex: '\\dot{I} = \\frac{\\beta S I}{N} - \\gamma I', label: 'Balance de infectados', text: 'Entran por contagio y salen por recuperación.', side: 'eq' },
        { id: 'recuperacion', tex: '\\gamma I', label: 'Flujo de recuperación', text: 'Término lineal en I.', side: 'flow' },
        { id: 'dR', tex: '\\dot{R} = \\gamma I', label: 'Balance de recuperados', text: 'Solo entran, por recuperación.', side: 'eq' }
      ],
      equation: { tex: '\\begin{aligned}\\dot{S} &= -\\frac{\\beta S I}{N}\\\\ \\dot{I} &= \\frac{\\beta S I}{N} - \\gamma I\\\\ \\dot{R} &= \\gamma I\\end{aligned}' },
      stateSpace: {
        tex: '\\dot{\\mathbf{x}} = \\mathbf{f}(\\mathbf{x}, u) = \\begin{bmatrix} -\\beta(1-u)\\,S I/N\\\\ \\beta(1-u)\\,S I/N - \\gamma I\\\\ \\gamma I\\end{bmatrix}, \\qquad \\mathbf{x} = \\begin{bmatrix}S\\\\ I\\\\ R\\end{bmatrix}',
        texWith: function (p) {
          return '\\dot{\\mathbf{x}} = \\begin{bmatrix} -' + n(p.beta / p.N) + '\\,S I\\\\ ' + n(p.beta / p.N) + '\\,S I - ' + n(p.gamma) +
            '\\,I\\\\ ' + n(p.gamma) + '\\,I\\end{bmatrix}';
        }
      },
      measured: {
        param: 'beta', trueValue: 0.33, noise: 25, seed: 1918, samples: 40, outputKey: 'I', duration: 120,
        input: { type: 'ninguna' }
      }
    }
  };

  S.register(model);
})(window.DSL);
