/*
 * js/systems/tanks.js — Propietario: systems.
 * Modelo «tanks»: depósitos de líquido (hidráulico). Variantes: lineal (A·ḣ = q_in − h/R),
 * torricelli (A·ḣ = q_in − a·√(2gh), no lineal) y cascada (dos depósitos no interactuantes).
 * API: docs/api/systems.md.
 */
(function (DSL) {
  'use strict';

  var S = DSL.systems;
  var H = S.helpers;
  var n = H.num, lin = H.lin;
  var G = H.G;
  var SQ2G = Math.sqrt(2 * G);

  function TF() { return DSL.core.tf.TransferFunction; }
  function LX() { return DSL.core.latex; }

  var VARIANTS = [
    { id: 'lineal', label: 'Depósito con salida lineal', timeDomain: 'continuous', linear: true, timeUnit: 's',
      summary: 'Un depósito cuya válvula de salida deja pasar un caudal proporcional al nivel.' },
    { id: 'torricelli', label: 'Depósito con descarga de Torricelli', timeDomain: 'continuous', linear: false, timeUnit: 's',
      summary: 'El líquido sale por un orificio del fondo con caudal proporcional a √h: el modelo es no lineal.' },
    { id: 'cascada', label: 'Dos depósitos en cascada', timeDomain: 'continuous', linear: true, timeUnit: 's',
      summary: 'El primer depósito descarga en el segundo sin que este influya en aquel (no interactuantes).' }
  ];

  var Q_DISPLAY = { unit: 'L/s', factor: 1e3 };

  function pA(key, label, def, extra) {
    return H.param(Object.assign({
      key: key, label: label, symbol: key === 'A' ? 'A' : 'A_' + key.slice(1), unit: 'm²', min: 0.2, max: 4, step: 0.05, default: def,
      tooltip: 'Área de la sección del depósito. Con más área hace falta más volumen para subir el nivel: la respuesta es más lenta.'
    }, extra || {}));
  }
  function pR(key, label, def) {
    return H.param({
      key: key, label: label, symbol: key === 'R' ? 'R' : 'R_' + key.slice(1), unit: 's/m²', min: 1, max: 50, step: 0.5, default: def,
      tooltip: 'Resistencia hidráulica de la válvula de salida: q_out = h/R. Cerrar la válvula aumenta R, eleva el nivel final y alarga la respuesta.'
    });
  }

  var PARAMS = {
    lineal: [pA('A', 'Área del depósito', 1), pR('R', 'Resistencia de la válvula', 10)],
    torricelli: [
      pA('A', 'Área del depósito', 0.5),
      H.param({
        key: 'a', label: 'Área del orificio', symbol: 'a', unit: 'm²', min: 0.005, max: 0.02, step: 0.0005, default: 0.01,
        display: { unit: 'cm²', factor: 1e4 },
        tooltip: 'Sección del orificio de salida. El caudal que sale es a·√(2gh): un orificio mayor vacía el depósito más deprisa y baja el nivel de equilibrio.'
      }),
      H.param({
        key: 'qin0', label: 'Caudal de operación', symbol: 'q_{in,0}', unit: 'm³/s', min: 0.01, max: 0.04, step: 0.001, default: 0.03,
        display: Q_DISPLAY, live: false,
        tooltip: 'Caudal de entrada constante que fija el punto de operación h₀. La linealización solo es válida cerca de ese nivel.'
      })
    ],
    cascada: [
      pA('A1', 'Área del depósito 1', 1), pR('R1', 'Resistencia de la válvula 1', 8),
      pA('A2', 'Área del depósito 2', 1.5), pR('R2', 'Resistencia de la válvula 2', 8)
    ]
  };

  var IP = H.inputParams;
  function flowInputs() {
    return [
      H.inputSpec('escalon', {
        symbol: 'q_{in}(t)', unit: 'm³/s', description: 'Se abre la alimentación con un caudal constante a partir de t₀.',
        params: [IP.amplitude({ symbol: 'q_0', unit: 'm³/s', min: 0, max: 0.2, step: 0.005, default: 0.05, display: Q_DISPLAY }), IP.t0({ unit: 's', max: 60, step: 1 })]
      }),
      H.inputSpec('pulso', {
        symbol: 'q_{in}(t)', unit: 'm³/s', description: 'Se vierte un caudal durante T_p y luego se corta la alimentación.',
        params: [IP.amplitude({ symbol: 'q_0', unit: 'm³/s', min: 0, max: 0.2, step: 0.005, default: 0.1, display: Q_DISPLAY }), IP.t0({ unit: 's', max: 60, step: 1 }),
          IP.width({ unit: 's', min: 1, max: 60, step: 1, default: 20 })]
      }),
      H.inputSpec('senoidal', {
        symbol: 'q_{in}(t)', unit: 'm³/s', description: 'Caudal que oscila alrededor de un valor medio: el depósito suaviza las variaciones rápidas.',
        params: [IP.offset({ symbol: '\\bar{q}', unit: 'm³/s', min: 0, max: 0.2, step: 0.005, default: 0.05, display: Q_DISPLAY }),
          IP.amplitude({ symbol: 'q_0', unit: 'm³/s', min: 0, max: 0.1, step: 0.005, default: 0.03, display: Q_DISPLAY }),
          IP.omega({ min: 0.01, max: 2, step: 0.01, default: 0.2 }), IP.t0({ unit: 's', max: 60, step: 1 })]
      })
    ];
  }
  function deviationInputs() {
    return [
      H.inputSpec('escalon', {
        label: 'Escalón', symbol: '\\Delta q_{in}(t)', unit: 'm³/s', description: 'Cambio brusco del caudal de entrada respecto del caudal de operación.',
        params: [IP.amplitude({ symbol: '\\Delta q', unit: 'm³/s', min: -0.008, max: 0.02, step: 0.001, default: 0.01, display: Q_DISPLAY,
          tooltip: 'Variación del caudal respecto de q_in,0. Cuanto mayor es, más se separa el nivel real de la curva discontinua (predicción lineal) de la Galería.' }),
          IP.t0({ unit: 's', max: 60, step: 1, default: 5 })]
      }),
      H.inputSpec('pulso', {
        symbol: '\\Delta q_{in}(t)', unit: 'm³/s', description: 'Aumento temporal del caudal de entrada.',
        params: [IP.amplitude({ symbol: '\\Delta q', unit: 'm³/s', min: -0.008, max: 0.02, step: 0.001, default: 0.015, display: Q_DISPLAY }),
          IP.t0({ unit: 's', max: 60, step: 1, default: 5 }), IP.width({ unit: 's', min: 1, max: 60, step: 1, default: 20 })]
      }),
      H.inputSpec('senoidal', {
        symbol: '\\Delta q_{in}(t)', unit: 'm³/s', description: 'Oscilación del caudal alrededor del punto de operación.',
        params: [IP.amplitude({ symbol: '\\Delta q', unit: 'm³/s', min: 0, max: 0.008, step: 0.0005, default: 0.005, display: Q_DISPLAY }),
          IP.omega({ min: 0.01, max: 2, step: 0.01, default: 0.1 }), IP.t0({ unit: 's', max: 60, step: 1 })]
      })
    ];
  }

  var STATE = {
    lineal: [{ key: 'h', label: 'Nivel', symbol: 'h', unit: 'm' }],
    // Δh_lin: desviación del modelo linealizado, integrada junto al nivel real (solo para la curva h_lin).
    torricelli: [{ key: 'h', label: 'Nivel', symbol: 'h', unit: 'm' }, { key: 'dhLin', label: 'Desviación del nivel lineal', symbol: '\\Delta h_{lin}', unit: 'm' }],
    cascada: [{ key: 'h1', label: 'Nivel del depósito 1', symbol: 'h_1', unit: 'm' }, { key: 'h2', label: 'Nivel del depósito 2', symbol: 'h_2', unit: 'm' }]
  };
  var OUTPUTS = {
    single: [
      { key: 'h', label: 'Nivel', symbol: 'h(t)', unit: 'm', color: '--c-out' },
      { key: 'qout', label: 'Caudal de salida', symbol: 'q_{out}(t)', unit: 'm³/s', color: '--c-zero' }
    ],
    // Torricelli: además, la predicción del modelo linealizado (curva discontinua; no entra en la escena
    // ni en el balance de masa).
    torricelli: [
      { key: 'h', label: 'Nivel', symbol: 'h(t)', unit: 'm', color: '--c-out' },
      { key: 'qout', label: 'Caudal de salida', symbol: 'q_{out}(t)', unit: 'm³/s', color: '--c-zero' },
      { key: 'hLin', label: 'Nivel lineal (aprox.)', symbol: 'h_{lin}(t)', unit: 'm', color: '--c-out', dash: true }
    ],
    cascada: [
      { key: 'h1', label: 'Nivel del depósito 1', symbol: 'h_1(t)', unit: 'm', color: '--c-out' },
      { key: 'h2', label: 'Nivel del depósito 2', symbol: 'h_2(t)', unit: 'm', color: '--c-zero' }
    ]
  };

  function copyAll(a) { return a.map(function (o) { return Object.assign({}, o); }); }
  function V(variant) { return variant === 'torricelli' || variant === 'cascada' ? variant : 'lineal'; }

  /* ---------------------------------------------------- Torricelli: punto de operación */

  function operating(p) {
    var h0 = Math.pow(p.qin0 / (p.a * SQ2G), 2);
    var R = 2 * h0 / p.qin0;
    return { h0: h0, R: R, tau: p.A * R, qout0: p.qin0 };
  }
  function qTorricelli(h, p) { return p.a * SQ2G * Math.sqrt(h > 0 ? h : 0); }

  /* ---------------------------------------------------- funciones de transferencia */

  function tfFor(p, variant, outputKey) {
    var C = TF();
    var v = V(variant);
    if (v === 'lineal') {
      if (outputKey === 'qout') return new C([1], [p.A * p.R, 1]);
      return new C([p.R], [p.A * p.R, 1]);
    }
    if (v === 'torricelli') {
      var op = operating(p);
      if (outputKey === 'qout') return new C([1], [op.tau, 1]);
      return new C([op.R], [op.tau, 1]);
    }
    var t1 = p.A1 * p.R1, t2 = p.A2 * p.R2;
    if (outputKey === 'h1') return new C([p.R1], [t1, 1]);
    return new C([p.R2], [t1 * t2, t1 + t2, 1]);
  }

  /* ---------------------------------------------------- balance de masa */

  function massBalance(traj, volume, qin, qout) {
    var p = traj.params, t = traj.t, X = traj.x, U = traj.u;
    var nS = t.length, Qi = new Array(nS), Qo = new Array(nS), Vmax = 0;
    for (var i = 0; i < nS; i++) {
      Qi[i] = qin(U[i], p);
      Qo[i] = qout(X[i], p);
      Vmax = Math.max(Vmax, Math.abs(volume(X[i], p)));
    }
    var V0 = volume(X[0], p), V1 = volume(X[nS - 1], p);
    var Win = H.quad(t, Qi), Wout = H.quad(t, Qo);
    var res = (V1 - V0) - (Win - Wout);
    var scale = Math.max(Vmax, Math.abs(Win), Math.abs(Wout), 1e-300);
    var tol = 1e-3 * scale;
    var f = function (x) { return DSL.util.formatNumber(x, 4); };
    return {
      id: 'masa', label: 'Balance de masa',
      tex: '\\Delta V = \\int_0^{t} \\left(q_{in} - q_{out}\\right) d\\tau',
      value: res, tolerance: tol, relative: Math.abs(res) / scale, unit: 'm³', ok: Math.abs(res) <= tol,
      detail: 'Volumen almacenado: ' + f(V0) + ' → ' + f(V1) + ' m³; entró ' + f(Win) + ' m³ y salió ' + f(Wout) + ' m³. Residuo: ' + f(res) + ' m³.',
      parts: { V0: V0, V1: V1, inflow: Win, outflow: Wout }
    };
  }

  /* ---------------------------------------------------- derivaciones */

  function firstOrderCanon(K, tau, kTex, kUnit, tauTex) {
    return {
      id: 'canonica', title: 'Forma canónica y parámetros',
      text: 'Es un sistema de primer orden K/(τs + 1). K es el cambio final de nivel por cada m³/s de caudal; τ, el tiempo en que el nivel recorre el 63.2 % de su cambio. El único polo, s = −1/τ, es real y negativo: el nivel sube sin oscilar y se estabiliza en unas 4τ.',
      tex: [
        'G(s) = \\frac{K}{\\tau s + 1}',
        'K = ' + kTex + ' = ' + n(K) + '\\;\\mathrm{' + kUnit + '}',
        '\\tau = ' + tauTex + ' = ' + n(tau) + '\\;\\mathrm{s}',
        'p = -\\frac{1}{\\tau} = ' + n(-1 / tau) + '\\;\\mathrm{s^{-1}}'
      ]
    };
  }

  function derivLineal(p, outputKey) {
    var isQ = outputKey === 'qout';
    var tau = p.A * p.R;
    var steps = [{
      id: 'ley', title: 'Ley física: conservación de la masa',
      text: 'El líquido es incompresible, así que conservar la masa equivale a conservar el volumen: lo que se acumula en el depósito es lo que entra menos lo que sale. Con sección constante, V = A·h, y la válvula lineal deja salir q_out = h/R.',
      tex: [
        '\\frac{dV}{dt} = q_{in}(t) - q_{out}(t)',
        'A\\,\\frac{dh}{dt} = q_{in}(t) - \\frac{h}{R}',
        lin([[p.A, '\\dot{h}'], [1 / p.R, 'h']]) + ' = q_{in}(t)'
      ]
    }, {
      id: 'laplace', title: 'Transformada de Laplace con condiciones iniciales nulas',
      text: 'Se toma h(0) = 0: el depósito parte vacío o, en general, h se mide desde el nivel de equilibrio inicial. La derivada se convierte en un factor s.',
      tex: [
        '\\mathcal{L}\\{\\dot{h}\\} = s\\,H(s) - h(0) = s\\,H(s)',
        'A\\,s\\,H(s) = Q_{in}(s) - \\frac{H(s)}{R}'
      ].concat(isQ ? ['Q_{out}(s) = \\frac{H(s)}{R}'] : [])
    }];
    if (isQ) {
      steps.push({
        id: 'despeje', title: 'Despeje de G(s) = Q_out(s)/Q_in(s)',
        text: 'Se multiplica por R, se agrupa H(s) y se usa Q_out = H/R.',
        tex: ['\\left(A R\\,s + 1\\right) H(s) = R\\,Q_{in}(s)', 'G(s) = \\frac{Q_{out}(s)}{Q_{in}(s)} = \\frac{1}{A R\\,s + 1}',
          'G(s) = \\frac{1}{' + LX().poly([tau, 1]) + '}']
      });
      steps.push(firstOrderCanon(1, tau, '1', '', 'A R'));
      steps[3].text = 'En régimen permanente sale todo lo que entra (K = 1). La constante de tiempo τ = A·R fija el retraso con que el caudal de salida sigue al de entrada.';
      steps[3].tex[1] = 'K = 1';
    } else {
      steps.push({
        id: 'despeje', title: 'Despeje de G(s) = H(s)/Q_in(s)',
        text: 'Se multiplica por R, se saca H(s) como factor común y se divide por Q_in(s).',
        tex: ['\\left(A R\\,s + 1\\right) H(s) = R\\,Q_{in}(s)', 'G(s) = \\frac{H(s)}{Q_{in}(s)} = \\frac{R}{A R\\,s + 1}',
          'G(s) = \\frac{' + n(p.R) + '}{' + LX().poly([tau, 1]) + '}']
      });
      steps.push(firstOrderCanon(p.R, tau, 'R', 's/m^{2}', 'A R = ' + n(p.A) + '\\cdot ' + n(p.R)));
    }
    return steps;
  }

  function derivTorricelli(p) {
    var op = operating(p);
    var k = p.a * SQ2G;
    return [{
      id: 'ley', title: 'Ley física: balance de masa con descarga de Torricelli',
      text: 'Por un orificio de área a en el fondo, el líquido sale con la velocidad de caída libre desde la altura h (ley de Torricelli, v = √(2gh)). El caudal de salida crece con la raíz del nivel, así que la ecuación diferencial es no lineal y no admite directamente una G(s).',
      tex: [
        'A\\,\\frac{dh}{dt} = q_{in}(t) - a\\sqrt{2 g\\,h}',
        n(p.A) + '\\,\\dot{h} = q_{in}(t) - ' + n(k) + '\\sqrt{h}'
      ]
    }, {
      id: 'equilibrio', title: 'Punto de operación',
      text: 'En equilibrio el nivel no cambia (ḣ = 0): sale exactamente lo que entra. Ese nivel h₀ es el punto alrededor del cual se linealiza.',
      tex: [
        'q_{in,0} = a\\sqrt{2 g\\,h_0} \\;\\Rightarrow\\; h_0 = \\left(\\frac{q_{in,0}}{a\\sqrt{2g}}\\right)^{2}',
        'h_0 = \\left(\\frac{' + n(p.qin0) + '}{' + n(p.a) + '\\sqrt{2\\cdot 9.81}}\\right)^{2} = ' + n(op.h0) + '\\;\\mathrm{m}'
      ]
    }, {
      id: 'linealizacion', title: 'Linealización alrededor de h₀',
      text: 'Para variaciones pequeñas, la raíz se sustituye por su recta tangente (Taylor de primer orden). La pendiente de esa recta define una resistencia hidráulica equivalente R, y las variables pasan a medirse como desviaciones del punto de operación.',
      tex: [
        'q_{out}(h) \\approx q_{out}(h_0) + \\left.\\frac{dq_{out}}{dh}\\right|_{h_0}\\left(h - h_0\\right)',
        '\\left.\\frac{dq_{out}}{dh}\\right|_{h_0} = \\frac{a\\sqrt{2g}}{2\\sqrt{h_0}} = \\frac{1}{R}',
        'R = \\frac{2\\sqrt{h_0}}{a\\sqrt{2g}} = \\frac{2 h_0}{q_{in,0}} = ' + n(op.R) + '\\;\\mathrm{s/m^{2}}',
        'A\\,\\Delta\\dot{h} = \\Delta q_{in} - \\frac{\\Delta h}{R}, \\qquad \\Delta h = h - h_0,\\; \\Delta q_{in} = q_{in} - q_{in,0}'
      ]
    }, {
      id: 'laplace', title: 'Transformada de Laplace con condiciones iniciales nulas',
      text: 'Como se parte del equilibrio, la desviación inicial es nula: Δh(0) = 0. La derivada se convierte en un factor s.',
      tex: ['\\mathcal{L}\\{\\Delta\\dot{h}\\} = s\\,\\Delta H(s)', 'A\\,s\\,\\Delta H(s) = \\Delta Q_{in}(s) - \\frac{\\Delta H(s)}{R}']
    }, {
      id: 'despeje', title: 'Despeje de G(s) = ΔH(s)/ΔQ_in(s)',
      text: 'Se agrupa ΔH(s) y se divide por ΔQ_in(s).',
      tex: ['G(s) = \\frac{\\Delta H(s)}{\\Delta Q_{in}(s)} = \\frac{R}{A R\\,s + 1}',
        'G(s) = \\frac{' + n(op.R) + '}{' + LX().poly([op.tau, 1]) + '}']
    }, Object.assign(firstOrderCanon(op.R, op.tau, 'R = 2h_0/q_{in,0}', 's/m^{2}', 'A R'), {
      text: 'Cerca de h₀ el depósito se comporta como un sistema de primer orden con K = R y τ = A·R. Lejos de h₀ deja de valer: al subir el nivel la descarga crece y el depósito responde más despacio de lo que predice el modelo lineal. En la Galería, la curva discontinua «Nivel lineal (aprox.)» muestra esa predicción junto al nivel real: con escalones grandes se separan.'
    })];
  }

  function derivCascada(p, outputKey) {
    var t1 = p.A1 * p.R1, t2 = p.A2 * p.R2;
    var isH1 = outputKey === 'h1';
    var steps = [{
      id: 'ley', title: 'Ley física: un balance de masa por depósito',
      text: 'El caudal que sale del depósito 1, h₁/R₁, cae libremente al depósito 2. El nivel del segundo no frena la salida del primero: por eso son «no interactuantes» y cada ecuación se resuelve por separado.',
      tex: [
        'A_1\\,\\dot{h}_1 = q_{in}(t) - \\frac{h_1}{R_1}',
        'A_2\\,\\dot{h}_2 = \\frac{h_1}{R_1} - \\frac{h_2}{R_2}',
        lin([[p.A1, '\\dot{h}_1'], [1 / p.R1, 'h_1']]) + ' = q_{in}(t), \\qquad ' + lin([[p.A2, '\\dot{h}_2'], [1 / p.R2, 'h_2']]) + ' = ' + lin([[1 / p.R1, 'h_1']])
      ]
    }, {
      id: 'laplace', title: 'Transformada de Laplace con condiciones iniciales nulas',
      text: 'Ambos depósitos parten vacíos: h₁(0) = h₂(0) = 0. Cada ecuación da una función de transferencia de primer orden.',
      tex: [
        '\\left(A_1 R_1\\,s + 1\\right) H_1(s) = R_1\\,Q_{in}(s)',
        '\\left(A_2 R_2\\,s + 1\\right) H_2(s) = \\frac{R_2}{R_1}\\,H_1(s)'
      ]
    }];
    if (isH1) {
      steps.push({
        id: 'despeje', title: 'Despeje de G(s) = H₁(s)/Q_in(s)',
        text: 'El primer depósito no depende del segundo: es un primer orden aislado.',
        tex: ['G(s) = \\frac{H_1(s)}{Q_{in}(s)} = \\frac{R_1}{A_1 R_1\\,s + 1}', 'G(s) = \\frac{' + n(p.R1) + '}{' + LX().poly([t1, 1]) + '}']
      });
      steps.push(firstOrderCanon(p.R1, t1, 'R_1', 's/m^{2}', 'A_1 R_1'));
      return steps;
    }
    var wn = 1 / Math.sqrt(t1 * t2), zeta = (t1 + t2) / (2 * Math.sqrt(t1 * t2));
    steps.push({
      id: 'despeje', title: 'Despeje de G(s) = H₂(s)/Q_in(s)',
      text: 'Las dos funciones de primer orden se multiplican (bloques en serie): H₂/Q_in = (H₁/Q_in)·(H₂/H₁).',
      tex: [
        'G(s) = \\frac{R_1}{\\tau_1 s + 1}\\cdot\\frac{R_2/R_1}{\\tau_2 s + 1} = \\frac{R_2}{\\left(\\tau_1 s + 1\\right)\\left(\\tau_2 s + 1\\right)}',
        'G(s) = \\frac{' + n(p.R2) + '}{\\left(' + LX().poly([t1, 1]) + '\\right)\\left(' + LX().poly([t2, 1]) + '\\right)} = \\frac{' + n(p.R2) + '}{' + LX().poly([t1 * t2, t1 + t2, 1]) + '}'
      ]
    });
    steps.push({
      id: 'canonica', title: 'Forma canónica y parámetros',
      text: 'Es un segundo orden con dos polos reales, s = −1/τ₁ y s = −1/τ₂. Su factor de amortiguamiento equivalente nunca es menor que 1, así que el nivel del segundo depósito no oscila: arranca con pendiente nula (forma de S) y se estabiliza en K·q_in.',
      tex: [
        '\\tau_1 = A_1 R_1 = ' + n(t1) + '\\;\\mathrm{s}, \\qquad \\tau_2 = A_2 R_2 = ' + n(t2) + '\\;\\mathrm{s}',
        'K = R_2 = ' + n(p.R2) + '\\;\\mathrm{s/m^{2}}',
        '\\omega_n = \\frac{1}{\\sqrt{\\tau_1\\tau_2}} = ' + n(wn) + '\\;\\mathrm{rad/s}, \\qquad \\zeta = \\frac{\\tau_1 + \\tau_2}{2\\sqrt{\\tau_1\\tau_2}} = ' + n(zeta) + ' \\ge 1'
      ]
    });
    return steps;
  }

  /* ---------------------------------------------------- modelo */

  var model = {
    id: 'tanks',
    name: 'Depósitos de líquido',
    category: 'hidraulico',
    icon: 'droplets',
    summary: 'El nivel de un depósito sube con el caudal que entra y baja con el que sale: un balance de masa convertido en ecuación diferencial.',
    listed: true,
    sceneId: 'tanks',
    variants: VARIANTS,

    params: function (variant) { return copyAll(PARAMS[V(variant)]); },
    inputs: function (variant) { return V(variant) === 'torricelli' ? deviationInputs() : flowInputs(); },
    state: function (variant) { return copyAll(STATE[V(variant)]); },
    outputs: function (variant) { var v = V(variant); return copyAll(v === 'cascada' ? OUTPUTS.cascada : v === 'torricelli' ? OUTPUTS.torricelli : OUTPUTS.single); },

    x0: function (p, variant) {
      var v = V(variant);
      if (v === 'torricelli') return [operating(p).h0, 0];
      if (v === 'cascada') return [0, 0];
      return [0];
    },

    deriv: function (t, x, u, p, variant) {
      var v = V(variant);
      if (v === 'lineal') return [(u - x[0] / p.R) / p.A];
      if (v === 'torricelli') {
        var qin = p.qin0 + u;
        if (qin < 0) qin = 0;
        // Segundo estado: el modelo linealizado A·Δḣ = Δq − Δh/R con la misma entrada Δq = u.
        return [(qin - qTorricelli(x[0], p)) / p.A, (u - x[1] / operating(p).R) / p.A];
      }
      var q1 = x[0] / p.R1;
      return [(u - q1) / p.A1, (q1 - x[1] / p.R2) / p.A2];
    },

    output: function (t, x, u, p, variant) {
      var v = V(variant);
      if (v === 'lineal') return { h: x[0], qout: x[0] / p.R };
      if (v === 'torricelli') return { h: x[0], qout: qTorricelli(x[0], p), hLin: operating(p).h0 + x[1] };
      return { h1: x[0], h2: x[1] };
    },

    hints: function (p, variant) {
      var v = V(variant);
      var h;
      if (v === 'torricelli') {
        var op = operating(p);
        h = H.hintsFromTF(tfFor(p, v, 'h'), { factor: 1.5 });
        var amp = deviationInputs()[0].params[0].default;
        var hNew = Math.pow((p.qin0 + amp) / (p.a * SQ2G), 2);
        // La predicción lineal queda por debajo del nivel real (√h es cóncava): comparte el rango de h.
        var hRange = [0, H.niceCeil(Math.max(op.h0, hNew) * 1.15)];
        h.yRange = { h: hRange, qout: [0, H.niceCeil((p.qin0 + amp) * 1.15)], hLin: hRange.slice() };
        h.operatingPoint = { h0: op.h0, qin0: p.qin0 };
      } else {
        h = H.hintsFromTF(tfFor(p, v, v === 'cascada' ? 'h2' : 'h'));
        var q = flowInputs()[0].params[0].default;
        if (v === 'lineal') h.yRange = { h: [0, H.niceCeil(q * p.R * 1.1)], qout: [0, H.niceCeil(q * 1.1)] };
        else h.yRange = { h1: [0, H.niceCeil(q * p.R1 * 1.1)], h2: [0, H.niceCeil(q * p.R2 * 1.1)] };
      }
      return h;
    },

    tfPairs: function (variant) {
      var v = V(variant);
      if (v === 'torricelli') return [{ outputKey: 'h', label: '\\Delta H(s)/\\Delta Q_{in}(s)', linearized: true }];
      if (v === 'cascada') return [{ outputKey: 'h2', label: 'H_2(s)/Q_{in}(s)', linearized: false }];
      return [{ outputKey: 'h', label: 'H(s)/Q_{in}(s)', linearized: false }];
    },

    tf: function (p, variant, outputKey) {
      var v = V(variant);
      if (v === 'lineal') {
        var isQ = outputKey === 'qout';
        return {
          tf: tfFor(p, v, isQ ? 'qout' : 'h'), inputSymbol: 'Q_{in}(s)', outputSymbol: isQ ? 'Q_{out}(s)' : 'H(s)',
          inputLabel: 'Caudal de entrada', outputLabel: isQ ? 'Caudal de salida' : 'Nivel del líquido', note: ''
        };
      }
      if (v === 'torricelli') {
        var op = operating(p);
        var isQo = outputKey === 'qout';
        return {
          tf: tfFor(p, v, isQo ? 'qout' : 'h'), inputSymbol: '\\Delta Q_{in}(s)', outputSymbol: isQo ? '\\Delta Q_{out}(s)' : '\\Delta H(s)',
          inputLabel: 'Variación del caudal de entrada', outputLabel: isQo ? 'Variación del caudal de salida' : 'Variación del nivel',
          note: 'Modelo linealizado alrededor de h₀ = ' + DSL.util.formatNumber(op.h0, 4) + ' m (q_in,0 = ' +
            DSL.util.formatNumber(p.qin0, 4) + ' m³/s). Solo es válido para variaciones pequeñas alrededor de ese punto.'
        };
      }
      var isH1 = outputKey === 'h1';
      return {
        tf: tfFor(p, v, isH1 ? 'h1' : 'h2'), inputSymbol: 'Q_{in}(s)', outputSymbol: isH1 ? 'H_1(s)' : 'H_2(s)',
        inputLabel: 'Caudal de entrada al depósito 1', outputLabel: isH1 ? 'Nivel del depósito 1' : 'Nivel del depósito 2', note: ''
      };
    },

    linearization: function (p, variant) {
      if (V(variant) !== 'torricelli') return null;
      var op = operating(p);
      return {
        operatingPoint: { h0: op.h0, qin0: p.qin0, qout0: op.qout0 },
        tf: tfFor(p, 'torricelli', 'h'),
        R: op.R, tau: op.tau,
        tex: [
          'h_0 = \\left(\\frac{q_{in,0}}{a\\sqrt{2g}}\\right)^{2} = ' + n(op.h0) + '\\;\\mathrm{m}',
          'R = \\left(\\left.\\frac{dq_{out}}{dh}\\right|_{h_0}\\right)^{-1} = \\frac{2 h_0}{q_{in,0}} = ' + n(op.R) + '\\;\\mathrm{s/m^{2}}',
          '\\frac{\\Delta H(s)}{\\Delta Q_{in}(s)} = \\frac{R}{A R\\,s + 1} = \\frac{' + n(op.R) + '}{' + LX().poly([op.tau, 1]) + '}'
        ],
        note: 'La raíz √h se sustituye por su tangente en h₀; el modelo resultante solo vale para cambios pequeños de caudal.'
      };
    },

    derivation: function (p, variant, outputKey) {
      var v = V(variant);
      if (v === 'torricelli') return derivTorricelli(p);
      if (v === 'cascada') return derivCascada(p, outputKey);
      return derivLineal(p, outputKey);
    },

    invariants: function (traj) {
      var v = V(traj.variant);
      if (v === 'cascada') {
        return [massBalance(traj,
          function (x, p) { return p.A1 * x[0] + p.A2 * x[1]; },
          function (u) { return u; },
          function (x, p) { return x[1] / p.R2; })];
      }
      if (v === 'torricelli') {
        return [massBalance(traj,
          function (x, p) { return p.A * x[0]; },
          function (u, p) { return Math.max(0, p.qin0 + u); },
          function (x, p) { return qTorricelli(x[0], p); })];
      }
      return [massBalance(traj,
        function (x, p) { return p.A * x[0]; },
        function (u) { return u; },
        function (x, p) { return x[0] / p.R; })];
    },

    readouts: function (p, variant) {
      var v = V(variant);
      if (v === 'torricelli') {
        var op = operating(p);
        return [
          { id: 'h0', label: 'Nivel de equilibrio', tex: 'h_0', value: op.h0, unit: 'm', digits: 3, tip: 'Nivel al que sale por el orificio justo lo que entra (q_in,0): el punto de operación de la linealización.' },
          { id: 'R', label: 'Resistencia linealizada', tex: 'R = 2h_0/q_{in,0}', value: op.R, unit: 's/m²', digits: 3, tip: 'Inversa de la pendiente de q_out(h) en h₀: cuánto sube el nivel por cada m³/s extra, solo para cambios pequeños.' },
          { id: 'tau', label: 'Constante de tiempo linealizada', tex: '\\tau = A R', value: op.tau, unit: 's', digits: 3, tip: 'Tiempo en que el modelo lineal recorre el 63.2 % del cambio de nivel. Vale cerca de h₀.' },
          { id: 'ts', label: 'Tiempo de establecimiento lineal (2 %)', tex: 't_s = \\tau\\ln 50', value: op.tau * Math.log(50), unit: 's', digits: 3, tip: 'Desde cuándo el modelo lineal queda en ±2 % de su valor final; el depósito real se aleja si Δq es grande.' }
        ];
      }
      if (v === 'cascada') {
        var t1 = p.A1 * p.R1, t2 = p.A2 * p.R2;
        return [
          { id: 'tau1', label: 'Constante de tiempo del depósito 1', tex: '\\tau_1 = A_1 R_1', value: t1, unit: 's', digits: 3, tip: 'Rapidez del primer depósito por sí solo: su nivel recorre el 63.2 % del cambio en τ₁ = A₁R₁.' },
          { id: 'tau2', label: 'Constante de tiempo del depósito 2', tex: '\\tau_2 = A_2 R_2', value: t2, unit: 's', digits: 3, tip: 'Rapidez del segundo depósito, alimentado por el primero: τ₂ = A₂R₂.' },
          { id: 'K', label: 'Ganancia estática', tex: 'K = R_2', value: p.R2, unit: 's/m²', digits: 3, tip: 'Cambio final del nivel h₂ por cada m³/s de caudal de entrada: K = R₂.' },
          { id: 'zeta', label: 'Amortiguamiento equivalente', tex: '\\zeta', value: (t1 + t2) / (2 * Math.sqrt(t1 * t2)), unit: '', digits: 3, tip: 'ζ = (τ₁ + τ₂)/(2√(τ₁τ₂)) ≥ 1: dos depósitos en cascada nunca oscilan; ζ = 1 solo si τ₁ = τ₂.' },
          { id: 'regimen', label: 'Régimen', tex: '', value: null, text: Math.abs(t1 - t2) < 1e-9 * Math.max(t1, t2) ? 'críticamente amortiguado (polo doble)' : 'sobreamortiguado', tip: 'Dos polos reales negativos: h₂ arranca con pendiente nula y sube sin sobrepasar su valor final.' }
        ];
      }
      var tau = p.A * p.R;
      return [
        { id: 'tau', label: 'Constante de tiempo', tex: '\\tau = A R', value: tau, unit: 's', digits: 3, tip: 'Tiempo en que el nivel recorre el 63.2 % de su cambio: τ = A·R (más área o más resistencia, más lento).' },
        { id: 'K', label: 'Ganancia estática', tex: 'K = R', value: p.R, unit: 's/m²', digits: 3, tip: 'Cambio final de nivel por cada m³/s de caudal constante: en equilibrio h = R·q_in.' },
        { id: 'pole', label: 'Polo', tex: 'p = -1/\\tau', value: -1 / tau, unit: '1/s', digits: 3, tip: 'Raíz del denominador τs + 1: real y negativa, así que el nivel se estabiliza sin oscilar.' },
        { id: 'ts', label: 'Tiempo de establecimiento (2 %)', tex: 't_s = \\tau\\ln 50', value: tau * Math.log(50), unit: 's', digits: 3, tip: 'Desde cuándo el nivel queda en ±2 % de su valor final: t_s = τ·ln 50 ≈ 3.9τ (exacto en primer orden).' }
      ];
    },

    wizard: {
      variant: 'lineal',
      boundary: {
        inputs: [{ id: 'qin', label: 'Caudal de entrada', symbol: 'q_{in}(t)', unit: 'm³/s' }],
        outputs: [
          { id: 'h', label: 'Nivel del líquido', symbol: 'h(t)', unit: 'm' },
          { id: 'qout', label: 'Caudal de salida', symbol: 'q_{out}(t)', unit: 'm³/s' }
        ],
        elements: [
          { id: 'deposito', label: 'Depósito de sección constante', symbol: 'A', unit: 'm²' },
          { id: 'valvula', label: 'Válvula de salida', symbol: 'R', unit: 's/m²' },
          { id: 'liquido', label: 'Líquido incompresible', symbol: 'V = A h', unit: 'm³' }
        ],
        environment: [
          { id: 'suministro', label: 'Red de suministro que impone q_in(t)' },
          { id: 'atmosfera', label: 'Atmósfera a presión constante sobre la superficie' },
          { id: 'desague', label: 'Desagüe que recibe q_out' }
        ]
      },
      laws: [
        { id: 'masa', title: 'Conservación de la masa', text: 'El volumen acumulado cambia según lo que entra menos lo que sale.', tex: '\\frac{dV}{dt} = q_{in} - q_{out}' },
        { id: 'geometria', title: 'Geometría del depósito', text: 'Con sección constante, el volumen es el área por el nivel.', tex: 'V = A\\,h' },
        { id: 'valvula', title: 'Válvula lineal', text: 'El caudal de salida es proporcional al nivel (a mayor nivel, mayor presión en el fondo).', tex: 'q_{out} = \\frac{h}{R}' }
      ],
      equationTerms: [
        { id: 'acumulacion', tex: 'A\\,\\dot{h}', label: 'Acumulación', text: 'Ritmo al que cambia el volumen almacenado.', side: 'lhs' },
        { id: 'salida', tex: '\\frac{h}{R}', label: 'Salida', text: 'Caudal que deja pasar la válvula.', side: 'lhs' },
        { id: 'entrada', tex: 'q_{in}(t)', label: 'Entrada', text: 'Caudal que aporta la red de suministro.', side: 'rhs' }
      ],
      equation: { tex: 'A\\,\\dot{h} + \\frac{h}{R} = q_{in}(t)' },
      stateSpace: {
        tex: '\\dot{h} = -\\frac{1}{A R}\\,h + \\frac{1}{A}\\,q_{in}(t)',
        texWith: function (p) { return '\\dot{h} = ' + lin([[-1 / (p.A * p.R), 'h'], [1 / p.A, 'q_{in}(t)']]); }
      },
      measured: {
        param: 'R', trueValue: 12, noise: 0.006, seed: 31415, samples: 60, outputKey: 'h', duration: 60,
        input: { type: 'escalon', amplitude: 0.05, t0: 0 }
      }
    }
  };

  S.register(model);
})(window.DSL);
