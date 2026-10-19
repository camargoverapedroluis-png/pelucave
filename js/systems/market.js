/*
 * js/systems/market.js — Propietario: systems.
 * Modelo «market»: mercado de un bien (económico). Variantes:
 *   telarana — discreta: Q_d = a − b·P_t (+ D), Q_s = c + d·P_{t−1}, el mercado se vacía cada periodo;
 *   walras   — continua (alias «ajuste»): dP/dt = α·(Q_d − Q_s).
 * La entrada u = D es un desplazamiento de la demanda (unidades).
 * API: docs/api/systems.md.
 */
(function (DSL) {
  'use strict';

  var S = DSL.systems;
  var H = S.helpers;
  var n = H.num, lin = H.lin;

  function TF() { return DSL.core.tf.TransferFunction; }
  function LX() { return DSL.core.latex; }
  function fmt(x, d) { return DSL.util.formatNumber(x, d || 4); }

  var Q_UNIT = 'unid.';
  var P_UNIT = 'u.m.';
  var SLOPE_UNIT = 'unid./u.m.';

  var VARIANTS = [
    { id: 'telarana', label: 'Telaraña (tiempo discreto)', timeDomain: 'discrete', linear: true, timeUnit: 'periodos',
      summary: 'La oferta responde al precio del periodo anterior; el precio se ajusta cada periodo para vaciar el mercado.' },
    { id: 'walras', label: 'Ajuste continuo del precio', timeDomain: 'continuous', linear: true, timeUnit: 's',
      summary: 'El precio sube o baja de forma continua en proporción al exceso de demanda (Walras/Evans).' }
  ];

  function baseParams(timeWord) {
    return [
      H.param({
        key: 'a', label: 'Demanda a precio nulo', symbol: 'a', unit: Q_UNIT, min: 60, max: 150, step: 1, default: 100,
        tooltip: 'Cantidad que se compraría si el bien fuera gratis: la ordenada de la recta de demanda Q_d = a − b·P.'
      }),
      H.param({
        key: 'b', label: 'Sensibilidad de la demanda', symbol: 'b', unit: SLOPE_UNIT, min: 0.5, max: 4, step: 0.05, default: 2,
        tooltip: 'Cuántas unidades menos se compran por cada u.m. (unidad monetaria) que sube el precio.'
      }),
      H.param({
        key: 'c', label: 'Oferta a precio nulo', symbol: 'c', unit: Q_UNIT, min: 0, max: 40, step: 1, default: 10,
        tooltip: 'Producción que se ofrecería con precio cero: la ordenada de la recta de oferta Q_s = c + d·P.'
      }),
      H.param({
        key: 'd', label: 'Sensibilidad de la oferta', symbol: 'd', unit: SLOPE_UNIT, min: 0.5, max: 4, step: 0.05, default: 1.5,
        tooltip: timeWord === 'periodo'
          ? 'Cuántas unidades más se producen por cada u.m. que subió el precio en el periodo anterior. Si d supera a b, la telaraña diverge.'
          : 'Cuántas unidades más se ofrecen por cada u.m. que sube el precio.'
      }),
      H.param({
        key: 'P0', label: 'Precio inicial', symbol: 'P_0', unit: P_UNIT, min: 1, max: 60, step: 0.5, default: 40, live: false,
        tooltip: 'Precio de partida, fuera del equilibrio. Al cambiarlo, la simulación vuelve a empezar.'
      })
    ];
  }

  var PARAMS = {
    telarana: baseParams('periodo'),
    walras: baseParams('s').concat([H.param({
      key: 'alpha', label: 'Velocidad de ajuste', symbol: '\\alpha', unit: 'u.m./(unid.·s)', min: 0.02, max: 1, step: 0.01, default: 0.2,
      tooltip: 'Cuánto cambia el precio por segundo por cada unidad de exceso de demanda. No mueve el equilibrio, solo la rapidez con que se alcanza.'
    })])
  };

  var IP = H.inputParams;
  var INPUTS = {
    telarana: [
      H.inputSpec('ninguna', { label: 'Sin perturbación', symbol: 'D_t', unit: Q_UNIT, description: 'Las curvas no cambian: el precio parte de P₀ y evoluciona hacia (o lejos de) el equilibrio.', params: [] }),
      H.inputSpec('escalon', {
        symbol: 'D_t', unit: Q_UNIT, description: 'La demanda se desplaza D unidades de forma permanente desde el periodo t₀ (afecta al precio del periodo siguiente).',
        params: [IP.amplitude({ label: 'Desplazamiento de la demanda', symbol: 'D', unit: Q_UNIT, min: -30, max: 30, step: 1, default: 10 }),
          IP.t0({ unit: 'periodos', max: 30, step: 1, default: 5 })]
      }),
      H.inputSpec('pulso', {
        symbol: 'D_t', unit: Q_UNIT, description: 'Un choque de demanda transitorio que dura T_p periodos.',
        params: [IP.amplitude({ label: 'Desplazamiento de la demanda', symbol: 'D', unit: Q_UNIT, min: -30, max: 30, step: 1, default: 20 }),
          IP.t0({ unit: 'periodos', max: 30, step: 1, default: 5 }), IP.width({ unit: 'periodos', min: 1, max: 20, step: 1, default: 1 })]
      })
    ],
    walras: [
      H.inputSpec('escalon', {
        symbol: 'D(t)', unit: Q_UNIT, description: 'La demanda se desplaza D unidades de forma permanente desde t₀.',
        params: [IP.amplitude({ label: 'Desplazamiento de la demanda', symbol: 'D', unit: Q_UNIT, min: -30, max: 30, step: 1, default: 10 }),
          IP.t0({ unit: 's', max: 20, step: 0.5, default: 0 })]
      }),
      H.inputSpec('pulso', {
        symbol: 'D(t)', unit: Q_UNIT, description: 'Un aumento transitorio de la demanda durante T_p.',
        params: [IP.amplitude({ label: 'Desplazamiento de la demanda', symbol: 'D', unit: Q_UNIT, min: -30, max: 30, step: 1, default: 20 }),
          IP.t0({ unit: 's', max: 20, step: 0.5, default: 2 }), IP.width({ unit: 's', min: 0.5, max: 20, step: 0.5, default: 3 })]
      }),
      H.inputSpec('senoidal', {
        symbol: 'D(t)', unit: Q_UNIT, description: 'Demanda estacional que oscila: el precio la sigue con retraso y amplitud reducida.',
        params: [IP.amplitude({ label: 'Amplitud de la demanda', symbol: 'D', unit: Q_UNIT, min: 0, max: 30, step: 1, default: 10 }),
          IP.omega({ min: 0.05, max: 5, step: 0.05, default: 1 }), IP.t0({ unit: 's', max: 20, step: 0.5, default: 0 })]
      }),
      H.inputSpec('ninguna', { label: 'Sin perturbación', symbol: 'D(t)', unit: Q_UNIT, description: 'El precio parte de P₀ y converge al equilibrio.', params: [] })
    ]
  };

  var STATE = [{ key: 'P', label: 'Precio', symbol: 'P', unit: P_UNIT }];
  function outputs(v) {
    return [
      { key: 'P', label: 'Precio', symbol: v === 'telarana' ? 'P_t' : 'P(t)', unit: P_UNIT, color: '--c-state' },
      { key: 'Qd', label: 'Demanda al precio actual', symbol: 'Q_d', unit: Q_UNIT, color: '--c-out' },
      { key: 'Qs', label: v === 'telarana' ? 'Oferta decidida con el precio actual' : 'Oferta al precio actual', symbol: 'Q_s', unit: Q_UNIT, color: '--c-zero' }
    ];
  }

  function copyAll(a) { return a.map(function (o) { return Object.assign({}, o); }); }
  function V(variant) { return variant === 'walras' || variant === 'ajuste' ? 'walras' : 'telarana'; }

  function equilibrium(p, D) {
    var Ps = (p.a + (D || 0) - p.c) / (p.b + p.d);
    return { P: Ps, Q: p.a + (D || 0) - p.b * Ps };
  }

  /** ¿Salen precio y cantidades del dominio económico (todos ≥ 0)? → { what, value, unit } o null. */
  function outOfDomain(P, Qd, Qs) {
    if (P < 0) return { what: 'el precio se hizo negativo', value: P, unit: P_UNIT };
    if (Qd < 0) return { what: 'la cantidad demandada se hizo negativa', value: Qd, unit: Q_UNIT };
    if (Qs < 0) return { what: 'la cantidad ofrecida se hizo negativa', value: Qs, unit: Q_UNIT };
    return null;
  }

  function behaviour(r) {
    if (Math.abs(r - 1) < 1e-9) return { key: 'ciclo', text: 'oscilación permanente (d/b = 1)' };
    return r < 1 ? { key: 'converge', text: 'converge oscilando (d/b < 1)' } : { key: 'diverge', text: 'diverge oscilando (d/b > 1)' };
  }

  /* ---------------------------------------------------- telaraña: forma cerrada */

  function cobwebClosed(p, k, uArr) {
    var r = -p.d / p.b;
    var constant = true;
    for (var i = 1; i < uArr.length; i++) if (uArr[i] !== uArr[0]) { constant = false; break; }
    if (constant) {
      var Ps = equilibrium(p, uArr.length ? uArr[0] : 0).P;
      return Ps + Math.pow(r, k) * (p.P0 - Ps);
    }
    // Suma de convolución explícita: P_k = r^k P_0 + Σ r^{k−1−j} (a − c + D_j)/b.
    var s = Math.pow(r, k) * p.P0;
    for (var j = 0; j < k; j++) s += Math.pow(r, k - 1 - j) * (p.a - p.c + uArr[j]) / p.b;
    return s;
  }

  /* ---------------------------------------------------- ajuste continuo: solución exacta */

  function walrasExact(p, spec, t) {
    var lam = p.alpha * (p.b + p.d), al = p.alpha;
    var Pe = function (u) { return (p.a - p.c + u) / (p.b + p.d); };
    var relax = function (P, u, tau) { return Pe(u) + (P - Pe(u)) * Math.exp(-lam * tau); };
    var s = S.normalizeInput(spec);
    var off = s.offset, A = s.amplitude, t0 = Math.max(0, s.t0);
    var P0 = p.P0;
    switch (s.type) {
      case 'escalon':
        if (t < t0) return relax(P0, off, t);
        return relax(relax(P0, off, t0), off + A, t - t0);
      case 'pulso': {
        var t1 = t0 + s.width;
        if (t < t0) return relax(P0, off, t);
        var Pa = relax(P0, off, t0);
        if (t < t1) return relax(Pa, off + A, t - t0);
        return relax(relax(Pa, off + A, s.width), off, t - t1);
      }
      case 'senoidal': {
        if (t < t0) return relax(P0, off, t);
        var P1 = relax(P0, off, t0), tau = t - t0, w = s.omega;
        return relax(P1, off, tau) + al * A * (lam * Math.sin(w * tau) - w * Math.cos(w * tau) + w * Math.exp(-lam * tau)) / (lam * lam + w * w);
      }
      case 'rampa': {
        if (t < t0) return relax(P0, off, t);
        var P2 = relax(P0, off, t0), tr = t - t0;
        return relax(P2, off, tr) + al * A * (tr / lam - 1 / (lam * lam) + Math.exp(-lam * tr) / (lam * lam));
      }
      default:
        return relax(P0, off, t);
    }
  }

  /* ---------------------------------------------------- derivaciones */

  function derivTelarana(p) {
    var eq = equilibrium(p, 0);
    var r = p.d / p.b;
    var beh = behaviour(r);
    return [{
      id: 'ley', title: 'Ley económica: oferta con retardo y mercado que se vacía',
      text: 'Los productores deciden cuánto producir con el precio del periodo anterior (lo que se siembra hoy se cosecha el año próximo), mientras que los compradores reaccionan al precio actual. En cada periodo el precio se ajusta hasta que se vende todo lo producido. La entrada D desplaza la recta de demanda; el desplazamiento del periodo t − 1 es el que fija el precio P_t.',
      tex: [
        'Q_d(t) = a - b\\,P_t + D_{t-1}, \\qquad Q_s(t) = c + d\\,P_{t-1}',
        'Q_d(t) = Q_s(t)',
        'Q_d = ' + lin([[p.a, ''], [-p.b, 'P_t'], [1, 'D_{t-1}']]) + ', \\qquad Q_s = ' + lin([[p.c, ''], [p.d, 'P_{t-1}']])
      ]
    }, {
      id: 'diferencias', title: 'Ecuación en diferencias',
      text: 'Igualando oferta y demanda se despeja el precio de cada periodo a partir del anterior y del desplazamiento de la demanda. Es una ecuación en diferencias de primer orden: el tiempo avanza a saltos de un periodo, no de forma continua.',
      tex: [
        'P_t = \\frac{a - c}{b} - \\frac{d}{b}\\,P_{t-1} + \\frac{D_{t-1}}{b}',
        'P_t = ' + n((p.a - p.c) / p.b) + ' ' + (p.d / p.b >= 0 ? '-' : '+') + ' ' + n(Math.abs(p.d / p.b)) + '\\,P_{t-1} + ' + n(1 / p.b) + '\\,D_{t-1}'
      ]
    }, {
      id: 'equilibrio', title: 'Equilibrio',
      text: 'El equilibrio es el precio que, una vez alcanzado, se repite: P_t = P_{t−1} = P*. Es el cruce de las rectas de oferta y demanda.',
      tex: [
        'P^{*} = \\frac{a - c}{b + d} = \\frac{' + n(p.a) + ' - ' + n(p.c) + '}{' + n(p.b) + ' + ' + n(p.d) + '} = ' + n(eq.P) + '\\;\\text{u.m.}',
        'Q^{*} = a - b\\,P^{*} = ' + n(eq.Q) + '\\;\\text{unid.}'
      ]
    }, {
      id: 'solucion', title: 'Solución en forma cerrada',
      text: 'Midiendo el precio como desviación del equilibrio, cada periodo la desviación se multiplica por −d/b. Por eso la solución es una potencia: no hace falta iterar para conocer el precio de cualquier periodo.',
      tex: [
        'P_t - P^{*} = -\\frac{d}{b}\\left(P_{t-1} - P^{*}\\right)',
        'P_t = P^{*} + \\left(-\\frac{d}{b}\\right)^{t}\\left(P_0 - P^{*}\\right)',
        'P_t = ' + n(eq.P) + ' + \\left(' + n(-p.d / p.b) + '\\right)^{t}\\left(' + n(p.P0 - eq.P) + '\\right)'
      ]
    }, {
      id: 'estabilidad', title: 'Estabilidad',
      text: 'La desviación se apaga si |−d/b| < 1, es decir, si los compradores reaccionan al precio con más fuerza que los productores (d < b). El signo negativo hace que el precio salte por encima y por debajo del equilibrio en periodos alternos: es la telaraña. Aquí d/b = ' + fmt(r, 3) + ': ' + beh.text + '.',
      tex: [
        '\\left|-\\frac{d}{b}\\right| < 1 \\iff d < b',
        '\\frac{d}{b} = \\frac{' + n(p.d) + '}{' + n(p.b) + '} = ' + n(r) + (r < 1 ? ' < 1' : r > 1 ? ' > 1' : ' = 1')
      ]
    }, {
      id: 'sings', title: 'Por qué no hay una G(s)',
      text: 'G(s) describe sistemas de tiempo continuo, cuyas derivadas se convierten en factores s. Aquí no hay derivadas sino retardos de un periodo. La herramienta equivalente es la transformada Z, donde el retardo se escribe z⁻¹: el polo z = −d/b cumple el papel de los polos de G(s), y el sistema es estable si está dentro del círculo unidad. Tomando el desplazamiento de la demanda D como entrada:',
      tex: [
        '\\mathcal{Z}\\{P_{t-1}\\} = z^{-1}P(z)',
        'G(z) = \\frac{P(z)}{D(z)} = \\frac{1/b}{z + d/b} = \\frac{' + n(1 / p.b) + '}{z + ' + n(p.d / p.b) + '}',
        'z_p = -\\frac{d}{b} = ' + n(-p.d / p.b) + ', \\qquad |z_p| ' + (r < 1 ? '<' : r > 1 ? '>' : '=') + ' 1'
      ]
    }];
  }

  function derivWalras(p) {
    var lam = p.alpha * (p.b + p.d);
    var eq = equilibrium(p, 0);
    return [{
      id: 'ley', title: 'Ley económica: ajuste del precio por exceso de demanda',
      text: 'Cuando se pide más de lo que se ofrece, los vendedores suben el precio; cuando sobra producto, lo bajan. La rapidez del cambio es proporcional al exceso de demanda (hipótesis de Walras y Evans). D(t) desplaza la curva de demanda.',
      tex: [
        '\\frac{dP}{dt} = \\alpha\\left(Q_d - Q_s\\right), \\qquad Q_d = a - b\\,P + D(t), \\qquad Q_s = c + d\\,P',
        '\\frac{dP}{dt} + \\alpha\\left(b + d\\right) P = \\alpha\\left(a - c\\right) + \\alpha\\,D(t)',
        '\\dot{P} + ' + n(lam) + '\\,P = ' + n(p.alpha * (p.a - p.c)) + ' + ' + n(p.alpha) + '\\,D(t)'
      ]
    }, {
      id: 'equilibrio', title: 'Equilibrio y variables de desviación',
      text: 'Sin perturbación, el precio deja de cambiar cuando la oferta iguala a la demanda. Para obtener G(s) se mide el precio como desviación de ese equilibrio, p = P − P*, y así desaparece el término constante.',
      tex: [
        'P^{*} = \\frac{a - c}{b + d} = ' + n(eq.P) + '\\;\\text{u.m.}',
        '\\dot{p} + \\alpha\\left(b + d\\right) p = \\alpha\\,D(t), \\qquad p = P - P^{*}'
      ]
    }, {
      id: 'laplace', title: 'Transformada de Laplace con condiciones iniciales nulas',
      text: 'Se parte del equilibrio, p(0) = 0, y la derivada se convierte en un factor s.',
      tex: ['\\mathcal{L}\\{\\dot{p}\\} = s\\,P(s) - p(0) = s\\,P(s)', 's\\,P(s) + \\alpha\\left(b + d\\right) P(s) = \\alpha\\,D(s)']
    }, {
      id: 'despeje', title: 'Despeje de G(s) = P(s)/D(s)',
      text: 'Se saca P(s) como factor común y se divide por D(s).',
      tex: ['G(s) = \\frac{P(s)}{D(s)} = \\frac{\\alpha}{s + \\alpha\\left(b + d\\right)}', 'G(s) = \\frac{' + n(p.alpha) + '}{' + LX().poly([1, lam]) + '}']
    }, {
      id: 'canonica', title: 'Forma canónica y parámetros',
      text: 'Es un primer orden K/(τs + 1). La ganancia K = 1/(b + d) dice cuánto sube finalmente el precio por cada unidad de demanda adicional y no depende de α; α solo fija la rapidez del ajuste a través de τ. El polo −α(b + d) es real y negativo: el precio converge sin oscilar.',
      tex: [
        'G(s) = \\frac{K}{\\tau s + 1}, \\qquad K = \\frac{1}{b + d} = ' + n(1 / (p.b + p.d)) + '\\;\\frac{\\text{u.m.}}{\\text{unid.}}',
        '\\tau = \\frac{1}{\\alpha\\left(b + d\\right)} = ' + n(1 / lam) + '\\;\\mathrm{s}',
        'p = -\\alpha\\left(b + d\\right) = ' + n(-lam) + '\\;\\mathrm{s^{-1}}'
      ]
    }];
  }

  /* ---------------------------------------------------- modelo */

  var model = {
    id: 'market',
    name: 'Mercado: oferta y demanda',
    category: 'economico',
    icon: 'trending-up-down',
    summary: 'El precio de un bien busca el cruce entre oferta y demanda; según cómo reaccionan productores y compradores, converge, oscila o se desboca.',
    listed: true,
    sceneId: 'market',
    variants: VARIANTS,
    variantAliases: { ajuste: 'walras' },

    params: function (variant) { return copyAll(PARAMS[V(variant)]); },
    inputs: function (variant) {
      return INPUTS[V(variant)].map(function (s) { return Object.assign({}, s, { params: copyAll(s.params) }); });
    },
    state: function () { return copyAll(STATE); },
    outputs: function (variant) { return outputs(V(variant)); },

    x0: function (p) { return [p.P0]; },

    next: function (k, x, u, p) {
      return [(p.a + u - p.c - p.d * x[0]) / p.b];
    },

    deriv: function (t, x, u, p) {
      return [p.alpha * (p.a + u - p.b * x[0] - (p.c + p.d * x[0]))];
    },

    output: function (t, x, u, p) {
      return { P: x[0], Qd: p.a + u - p.b * x[0], Qs: p.c + p.d * x[0] };
    },

    /**
     * Dominio económico de la telaraña (hook del Simulator): con P, Q_d o Q_s negativos el modelo
     * lineal deja de describir un mercado y la simulación se detiene. Devuelve el motivo o null.
     */
    domain: function (x, o, p, variant) {
      if (V(variant) !== 'telarana') return null;
      var bad = outOfDomain(o.P, o.Qd, o.Qs);
      if (!bad) return null;
      var r = p.d / p.b;
      var why = Math.abs(r - 1) < 1e-9 ? 'Con d/b = 1 la oscilación no se amortigua: mantiene su amplitud.'
        : r > 1 ? 'Con d/b = ' + fmt(r, 3) + ' la oscilación crece un ' + fmt(100 * (r - 1), 3) + ' % por periodo.'
          : 'Con d/b = ' + fmt(r, 3) + ' la oscilación se amortigua, pero su primera excursión ya sale del dominio.';
      return bad.what + ' (' + fmt(bad.value, 4) + ' ' + bad.unit + '), fuera del dominio económico del modelo lineal. ' + why;
    },

    hints: function (p, variant) {
      var v = V(variant);
      var eq = equilibrium(p, 0);
      if (v === 'telarana') {
        var r = p.d / p.b, dur;
        if (Math.abs(r - 1) < 1e-9) dur = 30;
        else if (r < 1) dur = Math.ceil(1.3 * Math.log(0.02) / Math.log(r)) + 4;
        else dur = Math.ceil(Math.log(30) / Math.log(r)) + 4;
        dur = Math.min(60, Math.max(r > 1 ? 8 : 12, dur));
        // Sin perturbación, el primer periodo que sale del dominio económico (P, Q_d o Q_s < 0) cierra
        // la ventana: el Simulator se detiene ahí (domain()), así que no se reserva sitio para lo que sigue.
        var kExit = null;
        for (var k0 = 1; k0 <= dur; k0++) {
          var Pe = eq.P + Math.pow(-r, k0) * (p.P0 - eq.P);
          if (outOfDomain(Pe, p.a - p.b * Pe, p.c + p.d * Pe)) { kExit = k0; break; }
        }
        if (kExit !== null) dur = kExit;
        // El rango de P se recorta a [0, máx(P0, a/b)]: fuera de él el modelo lineal ya no describe un mercado.
        var pTop = Math.max(p.P0, p.a / p.b);
        var lo = Infinity, hi = -Infinity;
        for (var k = 0; k <= dur; k++) {
          var Pk = Math.min(pTop, Math.max(0, eq.P + Math.pow(-r, k) * (p.P0 - eq.P)));
          if (Pk < lo) lo = Pk;
          if (Pk > hi) hi = Pk;
        }
        var pr = H.padRange(lo, hi, 0);
        return {
          duration: dur, dt: 1, timeScale: 2, stateBound: 1e6,
          yRange: { P: pr, Qd: H.padRange(p.a - p.b * hi, p.a - p.b * lo, 0), Qs: H.padRange(p.c + p.d * lo, p.c + p.d * hi, 0) },
          equilibrium: { P: eq.P, Q: eq.Q }
        };
      }
      var h = H.hintsFromTF(new (TF())([p.alpha], [1, p.alpha * (p.b + p.d)]));
      var D = INPUTS.walras[0].params[0].default;
      var eqD = equilibrium(p, D);
      var lo2 = Math.min(p.P0, eq.P, eqD.P), hi2 = Math.max(p.P0, eq.P, eqD.P);
      h.yRange = {
        P: H.padRange(lo2, hi2, 0),
        Qd: H.padRange(p.a - p.b * hi2, p.a + D - p.b * lo2, 0),
        Qs: H.padRange(p.c + p.d * lo2, p.c + p.d * hi2, 0)
      };
      h.equilibrium = { P: eq.P, Q: eq.Q };
      return h;
    },

    tfPairs: function (variant) {
      return V(variant) === 'walras' ? [{ outputKey: 'P', label: 'P(s)/D(s)', linearized: false }] : [];
    },

    tf: function (p, variant) {
      if (V(variant) !== 'walras') return null;
      return {
        tf: new (TF())([p.alpha], [1, p.alpha * (p.b + p.d)]),
        inputSymbol: 'D(s)', outputSymbol: 'P(s)',
        inputLabel: 'Desplazamiento de la demanda', outputLabel: 'Precio (desviación del equilibrio)',
        note: 'El precio se mide como desviación del equilibrio P* = ' + fmt(equilibrium(p, 0).P) + ' u.m.'
      };
    },

    /** Equivalente discreto de la telaraña: G(z) = (1/b)/(z + d/b). Null para walras. */
    zTransfer: function (p, variant) {
      if (V(variant) !== 'telarana') return null;
      return {
        num: [1 / p.b], den: [1, p.d / p.b], pole: -p.d / p.b, stable: p.d < p.b,
        tex: 'G(z) = \\frac{P(z)}{D(z)} = \\frac{' + n(1 / p.b) + '}{z + ' + n(p.d / p.b) + '}'
      };
    },

    linearization: function () { return null; },

    derivation: function (p, variant) {
      return V(variant) === 'walras' ? derivWalras(p) : derivTelarana(p);
    },

    invariants: function (traj) {
      var p = traj.params, v = V(traj.variant);
      var P = traj.outputs.P;
      var maxAbs = 1, err = 0;
      if (v === 'telarana') {
        var constant = traj.u.every(function (u) { return u === traj.u[0]; });
        for (var k = 0; k < P.length; k++) {
          maxAbs = Math.max(maxAbs, Math.abs(P[k]));
          err = Math.max(err, Math.abs(P[k] - cobwebClosed(p, k, traj.u.slice(0, Math.max(1, k)))));
        }
        var tolT = 1e-9 * maxAbs;
        return [{
          id: 'formaCerrada', label: constant ? 'Forma cerrada = iteración' : 'Suma explícita = iteración',
          tex: constant ? 'P_t = P^{*} + \\left(-\\tfrac{d}{b}\\right)^{t}\\left(P_0 - P^{*}\\right)' : 'P_t = r^{t}P_0 + \\sum_{j<t} r^{t-1-j}\\,\\frac{a - c + D_j}{b}',
          value: err, tolerance: tolT, unit: P_UNIT, ok: err <= tolT,
          detail: 'Diferencia máxima entre la fórmula y la iteración periodo a periodo: ' + fmt(err, 3) + ' u.m.'
        }];
      }
      for (var i = 0; i < P.length; i++) {
        maxAbs = Math.max(maxAbs, Math.abs(P[i]));
        err = Math.max(err, Math.abs(P[i] - walrasExact(p, traj.input, traj.t[i])));
      }
      var tolW = 1e-6 * maxAbs;
      return [{
        id: 'solucionExacta', label: 'Simulación = solución exacta',
        tex: 'P(t) = P^{*} + \\left(P_0 - P^{*}\\right)e^{-\\alpha(b+d)t} + \\ldots',
        value: err, tolerance: tolW, unit: P_UNIT, ok: err <= tolW,
        detail: 'Diferencia máxima entre RK4 y la solución analítica de la ecuación lineal: ' + fmt(err, 3) + ' u.m.'
      }];
    },

    readouts: function (p, variant) {
      var eq = equilibrium(p, 0);
      var out = [
        { id: 'Pstar', label: 'Precio de equilibrio', tex: 'P^{*}', value: eq.P, unit: P_UNIT, digits: 4, tip: 'Precio con el que la cantidad demandada iguala a la ofrecida: P* = (a − c)/(b + d).' },
        { id: 'Qstar', label: 'Cantidad de equilibrio', tex: 'Q^{*}', value: eq.Q, unit: Q_UNIT, digits: 4, tip: 'Cantidad que se compra y se vende en el equilibrio, Q* = a − b·P*.' }
      ];
      if (V(variant) === 'telarana') {
        var r = p.d / p.b, beh = behaviour(r);
        out.push({ id: 'ratio', label: 'Cociente de pendientes', tex: 'd/b', value: r, unit: '', digits: 3, tip: 'Cociente d/b de las pendientes de oferta y demanda: la desviación del precio se multiplica por −d/b cada periodo.' });
        if (r < 1) out.push({ id: 'periodos', label: 'Periodos hasta el 2 % de la desviación inicial', tex: 'k_{2\\%}', value: Math.ceil(Math.log(0.02) / Math.log(r)), unit: 'periodos', digits: 3, tip: 'Periodos hasta que la desviación del precio cae al 2 % de la inicial: crece al acercarse d/b a 1.' });
        out.push({ id: 'estabilidad', label: 'Estabilidad', tex: '|z_p| = d/b', value: null, text: beh.text, tone: beh.key === 'converge' ? 'success' : beh.key === 'ciclo' ? 'warning' : 'danger', tip: 'd/b < 1: el precio converge oscilando; d/b = 1: ciclo de amplitud constante; d/b > 1: la oscilación crece.' });
      } else {
        var lam = p.alpha * (p.b + p.d);
        out.push({ id: 'tau', label: 'Constante de tiempo', tex: '\\tau = 1/(\\alpha(b+d))', value: 1 / lam, unit: 's', digits: 3, tip: 'Tiempo en que el precio recorre el 63.2 % del camino al equilibrio: τ = 1/(α(b + d)).' });
        out.push({ id: 'K', label: 'Ganancia estática', tex: 'K = 1/(b+d)', value: 1 / (p.b + p.d), unit: 'u.m./unid.', digits: 3, tip: 'Cambio final del precio por cada unidad que se desplaza la demanda: K = 1/(b + d).' });
        out.push({ id: 'estabilidad', label: 'Estabilidad', tex: 'p = -\\alpha(b+d)', value: null, text: 'estable: converge sin oscilar', tone: 'success', tip: 'Con el ajuste continuo el polo p = −α(b + d) es real y negativo: el precio llega al equilibrio sin oscilar.' });
      }
      return out;
    },

    wizard: null
  };

  S.register(model);
})(window.DSL);
