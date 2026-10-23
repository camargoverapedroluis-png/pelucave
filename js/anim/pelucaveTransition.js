/*
 * js/anim/pelucaveTransition.js — Propietario: anim.
 * Transición «Pelucave»: la cabeza del logo anticipa (se echa atrás), abre la boca (mandíbula bivalva con
 * contención en la silueta del cráneo), expulsa un objeto en el clímax y recupera con rebote elástico.
 * Port 1:1 del arnés de calibración («la mejor page», tag v2-calibrated-export) sin GSAP: sus easings
 * (GSAP 3.12.5) están reimplementados y el timeline es una función pura stateAt(t) → estado numérico.
 * El rig convierte ese estado en transform="matrix(…)" (una escritura por nodo y cuadro, solo si cambia)
 * sobre un SVG construido con DSL.util.svg a partir de DSL.anim.pelucaveAsset. El único reloj es
 * DSL.util.loop. API: docs/api/pelucave.md.
 */
(function (DSL) {
  'use strict';

  var util = DSL.util;
  DSL.anim = DSL.anim || {};

  var PHASES = ['anticipacion', 'apertura', 'climax', 'recuperacion'];
  var PRECISION = 4; // decimales al serializar; nunca se redondean valores intermedios (produce temblor)

  /* ================================================================ easings (fórmulas de GSAP 3.12.5) */

  function powerIn(n) {
    return function (p) { return Math.pow(p, n + 1); };
  }

  function powerOut(n) {
    return function (p) { return 1 - Math.pow(1 - p, n + 1); };
  }

  function inOutFromOut(out) {
    return function (p) { return p < 0.5 ? (1 - out(1 - p * 2)) / 2 : 0.5 + out((p - 0.5) * 2) / 2; };
  }

  /** elastic.out(amplitude, period): la amplitud (≥ 1) escala el sobrepaso y el periodo fija la frecuencia. */
  function elasticOut(amplitude, period) {
    var p1 = amplitude >= 1 ? amplitude : 1;
    var p2 = (period || 0.3) / (amplitude < 1 ? amplitude : 1);
    var p3 = p2 / (2 * Math.PI) * (Math.asin(1 / p1) || 0);
    var k = 2 * Math.PI / p2;
    return function (p) { return p === 1 ? 1 : p1 * Math.pow(2, -10 * p) * Math.sin((p - p3) * k) + 1; };
  }

  var EASES = {
    'power1.in': powerIn(1),
    'power1.out': powerOut(1),
    'power2.in': powerIn(2),
    'power2.out': powerOut(2),
    'power2.inOut': inOutFromOut(powerOut(2)),
    'power3.in': powerIn(3)
  };

  /* ================================================================ matrices afines (convención SVG) */
  // | a c e |   x' = a·x + c·y + e        El eje Y crece hacia abajo: un ángulo positivo gira
  // | b d f |   y' = b·x + d·y + f        en sentido HORARIO en pantalla.

  var IDENTITY = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

  function translate(tx, ty) {
    return { a: 1, b: 0, c: 0, d: 1, e: tx || 0, f: ty || 0 };
  }

  function scale(sx, sy) {
    return { a: sx, b: 0, c: 0, d: sy === undefined ? sx : sy, e: 0, f: 0 };
  }

  function rotate(deg) {
    var r = deg * Math.PI / 180;
    var c = Math.cos(r);
    var s = Math.sin(r);
    return { a: c, b: s, c: -s, d: c, e: 0, f: 0 };
  }

  /** A·B: aplica B primero y después A (igual que transform="A B"). */
  function multiply(A, B) {
    return {
      a: A.a * B.a + A.c * B.b,
      b: A.b * B.a + A.d * B.b,
      c: A.a * B.c + A.c * B.d,
      d: A.b * B.c + A.d * B.d,
      e: A.a * B.e + A.c * B.f + A.e,
      f: A.b * B.e + A.d * B.f + A.f
    };
  }

  /** compose(A, B, C) = A·B·C: C se aplica primero. */
  function compose() {
    var m = IDENTITY;
    for (var i = 0; i < arguments.length; i++) m = multiply(m, arguments[i]);
    return m;
  }

  function apply(m, p) {
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  }

  /** T(p)·m·T(−p): aplica m manteniendo fijo el pivote. Nunca se «corrige» un pivote desplazando a ojo. */
  function aboutPivot(pivot, m) {
    return compose(translate(pivot.x, pivot.y), m, translate(-pivot.x, -pivot.y));
  }

  function rotateAbout(pivot, deg) {
    return aboutPivot(pivot, rotate(deg));
  }

  function scaleAbout(pivot, sx, sy) {
    return aboutPivot(pivot, scale(sx, sy));
  }

  /** Cabeza: squash/stretch y rotación sobre el cuello, más retracción (dx, dy). */
  function headMatrix(o) {
    return compose(translate(o.dx, o.dy), rotateAbout(o.pivot, o.angle), scaleAbout(o.pivot, o.sx, o.sy));
  }

  function round4(v) {
    var n = Number(v.toFixed(PRECISION));
    return n === 0 ? 0 : n; // evita «-0»
  }

  function toSvgString(m) {
    return 'matrix(' + [m.a, m.b, m.c, m.d, m.e, m.f].map(round4).join(',') + ')';
  }

  function midpoint(p, q) {
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  }

  function bboxCenter(b) {
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  /** Normal unitaria de la línea dental a→b, orientada hacia abajo-izquierda (lado de la arcada inferior). */
  function mouthNormal(a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len, y: dx / len };
  }

  /* ================================================================ timeline puro */

  var REST = Object.freeze({
    cabezaRot: 0, cabezaX: 0, cabezaY: 0, cabezaSx: 1, cabezaSy: 1,
    mandAngle: 0, mandX: 0, mandY: 0, supAngle: 0, separacion: 0,
    ojoX: 0, ojoY: 0, peloX: 0, peloY: 0, peloRot: 0,
    dummyX: 0, dummyY: 0, dummyS: 0, dummyO: 0
  });
  var CHANNELS = Object.keys(REST);

  /** Instante de inicio de cada fase y «fin» (suma de fases, sin la cola de inercia). */
  function phaseStarts(fases) {
    var starts = {};
    var t = 0;
    for (var i = 0; i < PHASES.length; i++) {
      starts[PHASES[i]] = t;
      t += fases[PHASES[i]];
    }
    starts.fin = t;
    return starts;
  }

  /** Reposo real: la separación dental en reposo es separacionInicial, no 0. */
  function restState(params) {
    var st = {};
    for (var i = 0; i < CHANNELS.length; i++) st[CHANNELS[i]] = REST[CHANNELS[i]];
    st.separacion = params.mandibula.separacionInicial;
    return st;
  }

  /**
   * Segmentos del timeline: uno por cada tl.to()/tl.set() del arnés, en el mismo orden.
   * { at: inicio (s), dur: duración (s; 0 = set), ease: función, props: { canal: valor final } }.
   */
  function segments(params) {
    var m = params.mandibula;
    var c = params.cabeza;
    var i = params.inercia;
    var f = params.fases;
    var d = params.dummy;
    var s = phaseStarts(f);
    var elastic = elasticOut(params.elastico.amplitud, params.elastico.periodo);
    var out = [];
    function to(at, dur, ease, props) { out.push({ at: at, dur: dur, ease: ease, props: props }); }

    // 1. Anticipación (carga): la cabeza se echa atrás y se aprieta; los dientes se cierran un poco más.
    to(s.anticipacion, f.anticipacion, EASES['power2.inOut'], {
      cabezaRot: c.anguloAnticipacion, cabezaX: -c.retraccion, cabezaSx: 1 + c.squash, cabezaSy: 1 - c.squash
    });
    to(s.anticipacion, f.anticipacion, EASES['power2.inOut'], {
      mandAngle: m.contraccion, supAngle: -m.contraccion * 0.3, separacion: m.separacionInicial * 0.5
    });
    to(s.anticipacion + i.retrasoOjo, f.anticipacion, EASES['power2.inOut'], {
      ojoX: i.amplitudOjo * 0.35, ojoY: i.amplitudOjo * 0.15
    });
    to(s.anticipacion + i.retrasoPelo, f.anticipacion, EASES['power2.inOut'], {
      peloX: i.amplitudPelo * 0.4, peloRot: -i.rotacionPelo * 0.5
    });

    // 2. Apertura máxima (power3.in): la inferior baja y se separa; la superior se levanta levemente.
    to(s.apertura, f.apertura, EASES['power3.in'], {
      mandAngle: m.anguloApertura + m.anguloInferior, mandX: m.dx, mandY: m.dy,
      supAngle: m.anguloSuperior, separacion: m.separacionMaxima
    });
    to(s.apertura, f.apertura, EASES['power3.in'], {
      cabezaRot: c.anguloApertura, cabezaX: -c.retraccion * 0.3, cabezaSx: 1 - c.squash, cabezaSy: 1 + c.squash
    });
    to(s.apertura + i.retrasoOjo, f.apertura + f.climax * 0.3, EASES['power2.in'], {
      ojoX: -i.amplitudOjo, ojoY: i.amplitudOjo * 0.5
    });
    to(s.apertura + i.retrasoPelo, f.apertura + f.climax * 0.4, EASES['power2.in'], {
      peloX: -i.amplitudPelo, peloY: i.amplitudPelo * 0.25, peloRot: i.rotacionPelo
    });

    // 3. Clímax / eyección (power2.out): el objeto nace en el centro de la cavidad y sale hacia +X.
    to(s.climax, 0, null, { dummyS: 0.15, dummyO: 1, dummyX: 0, dummyY: 0 });
    to(s.climax, f.climax, EASES['power2.out'], { dummyS: 1, dummyX: d.distancia, dummyY: d.elevacion });
    to(s.climax, f.climax * 0.5, EASES['power2.out'], { cabezaX: -c.retraccion * 0.6, cabezaRot: c.anguloApertura * 0.6 });

    // 4. Recuperación (elastic.out): todo vuelve al reposo con sobrepaso; ojo y pelo terminan después.
    to(s.recuperacion, f.recuperacion, elastic, { mandAngle: 0, mandX: 0, mandY: 0, supAngle: 0, separacion: m.separacionInicial });
    to(s.recuperacion, f.recuperacion, elastic, { cabezaRot: 0, cabezaX: 0, cabezaY: 0, cabezaSx: 1, cabezaSy: 1 });
    to(s.recuperacion + i.retrasoOjo, f.recuperacion, elastic, { ojoX: 0, ojoY: 0 });
    to(s.recuperacion + i.retrasoPelo, f.recuperacion, elastic, { peloX: 0, peloY: 0, peloRot: 0 });
    to(s.recuperacion, f.recuperacion * 0.5, EASES['power1.out'], { dummyX: d.distancia * 1.5 });
    to(s.recuperacion + Math.min(0.15, f.recuperacion * 0.2), Math.min(0.3, f.recuperacion * 0.4), EASES['power1.in'], { dummyO: 0 });
    return out;
  }

  /**
   * Compila los segmentos en una pista por canal con el valor de partida resuelto: el final del segmento
   * anterior de ese canal (o el reposo). Es el equivalente de «progress(1).progress(0)» del arnés, que fija
   * los valores iniciales en orden cronológico. Orden estable por instante de inicio, como la lista de
   * hijos de un timeline de GSAP.
   */
  function compileTracks(params) {
    var rest = restState(params);
    var ordered = segments(params)
      .map(function (s, i) { return { s: s, i: i }; })
      .sort(function (a, b) { return a.s.at - b.s.at || a.i - b.i; });
    var tracks = {};
    var duration = 0;
    for (var k = 0; k < CHANNELS.length; k++) tracks[CHANNELS[k]] = [];
    ordered.forEach(function (o) {
      var seg = o.s;
      Object.keys(seg.props).forEach(function (prop) {
        var list = tracks[prop];
        if (!list) throw new Error('Canal desconocido en el timeline: «' + prop + '».');
        var from = list.length ? list[list.length - 1].to : rest[prop];
        list.push({ at: seg.at, dur: seg.dur, ease: seg.ease, from: from, to: seg.props[prop] });
      });
      if (seg.at + seg.dur > duration) duration = seg.at + seg.dur;
    });
    return { tracks: tracks, duration: duration, rest: rest };
  }

  /** Valor de un canal en t: el último segmento iniciado manda; entre segmentos se conserva el valor final. */
  function channelAt(list, restValue, t) {
    var v = restValue;
    for (var i = 0; i < list.length; i++) {
      var seg = list[i];
      if (t < seg.at) break;
      if (seg.dur === 0 || t >= seg.at + seg.dur) v = seg.to;
      else v = seg.from + (seg.to - seg.from) * seg.ease((t - seg.at) / seg.dur);
    }
    return v;
  }

  /**
   * createTimeline(params = DSL.anim.pelucaveParams) → { params, duration, starts, stateAt(t, into?), phaseAt(t), restState() }.
   * stateAt es pura y determinista: el mismo t devuelve siempre el mismo estado (scrub en cualquier sentido).
   * t se acota a [0, duration]; `into` permite reutilizar el objeto de estado (sin reservas por cuadro).
   */
  function createTimeline(params) {
    params = params || DSL.anim.pelucaveParams;
    if (!params) throw new Error('Faltan los parámetros (DSL.anim.pelucaveParams).');
    var missing = ['mandibula', 'cabeza', 'inercia', 'elastico', 'fases', 'dummy'].filter(function (k) {
      return !params[k] || typeof params[k] !== 'object';
    });
    if (missing.length) throw new Error('Faltan secciones en los parámetros: ' + missing.join(', ') + '.');
    var c = compileTracks(params);
    var starts = phaseStarts(params.fases);

    function stateAt(t, into) {
      var st = into || {};
      if (!(t > 0)) t = 0;
      if (t > c.duration) t = c.duration;
      for (var i = 0; i < CHANNELS.length; i++) {
        var k = CHANNELS[i];
        st[k] = channelAt(c.tracks[k], c.rest[k], t);
      }
      return st;
    }

    function phaseAt(t) {
      var current = PHASES[0];
      for (var i = 0; i < PHASES.length; i++) if (t >= starts[PHASES[i]]) current = PHASES[i];
      return t >= starts.fin ? 'fin' : current;
    }

    return {
      params: params,
      duration: c.duration,
      starts: starts,
      stateAt: stateAt,
      phaseAt: phaseAt,
      restState: function () { return restState(params); }
    };
  }

  /* ================================================================ SVG por capas */

  /**
   * buildSvg() → { svg, nodes: { cabeza, craneo, cuencas, pelo, ojo, mandibula, mandSup, mandInf, dummy }, ids }.
   * Jerarquía (igual que el arnés):
   *   svg.pv-root
   *   ├── defs: forma sólida del cráneo, formas de ojo y arcadas, clipPath
   *   ├── g.pv-cabeza                 ◄ headMatrix (cuello)
   *   │   ├── g.pv-silueta.pv-craneo  silueta con agujeros
   *   │   ├── g.pv-relleno.pv-cuencas <use> de ojo y arcadas en tinta: tapa los agujeros → cavidad bucal
   *   │   ├── g.pv-silueta.pv-pelo    ◄ translate · rotateAbout(centro del pelo)
   *   │   ├── g.pv-pieza.pv-ojo       ◄ translate
   *   │   └── g.pv-mandibula [clip-path: silueta sólida]
   *   │       ├── g.pv-pieza.pv-mandibula-superior  ◄ rotateAbout(cóndilo superior)
   *   │       └── g.pv-pieza.pv-mandibula-inferior  ◄ translate(dx + n·sep, dy + n·sep) · rotateAbout(cóndilo)
   *   └── g.pv-dummy                  objeto expulsado (espacio de mundo)
   * Los ids son únicos por instancia (DSL.util.uid): varias transiciones pueden convivir en la página.
   */
  function buildSvg() {
    var asset = DSL.anim.pelucaveAsset;
    var geom = DSL.anim.pelucaveGeometria;
    if (!asset) throw new Error('Falta DSL.anim.pelucaveAsset: ejecute «node tools/pelucave.mjs».');
    var svg = util.svg;
    var base = util.uid('pv');
    var ids = {
      solido: base + '-craneo-solido',
      ojo: base + '-forma-ojo',
      sup: base + '-forma-mandibula-superior',
      inf: base + '-forma-mandibula-inferior',
      clip: base + '-clip-craneo'
    };

    function pathGroup(list, props) {
      return svg('g', props, list.map(function (d) { return svg('path', { d: d }); }));
    }
    function use(ref) { return svg('use', { href: '#' + ref }); }

    var vb = geom.viewBox;
    var n = {};
    n.craneo = pathGroup(asset.paths.craneo, { class: 'pv-silueta pv-craneo' });
    n.cuencas = svg('g', { class: 'pv-relleno pv-cuencas' }, use(ids.ojo), use(ids.sup), use(ids.inf));
    n.pelo = pathGroup(asset.paths.pelo, { class: 'pv-silueta pv-pelo' });
    n.ojo = svg('g', { class: 'pv-pieza pv-ojo' }, use(ids.ojo));
    n.mandSup = svg('g', { class: 'pv-pieza pv-mandibula-superior' }, use(ids.sup));
    n.mandInf = svg('g', { class: 'pv-pieza pv-mandibula-inferior' }, use(ids.inf));
    n.mandibula = svg('g', { class: 'pv-mandibula', 'clip-path': 'url(#' + ids.clip + ')' }, n.mandSup, n.mandInf);
    n.cabeza = svg('g', { class: 'pv-cabeza' }, n.craneo, n.cuencas, n.pelo, n.ojo, n.mandibula);
    n.dummy = svg('g', { class: 'pv-dummy', opacity: '0' });

    var defs = svg('defs', null,
      svg('path', { id: ids.solido, d: asset.craneoSolido }),
      pathGroup(asset.paths.ojo, { id: ids.ojo }),
      pathGroup(asset.paths.mandibulaSuperior, { id: ids.sup }),
      pathGroup(asset.paths.mandibulaInferior, { id: ids.inf }),
      svg('clipPath', { id: ids.clip, clipPathUnits: 'userSpaceOnUse' }, use(ids.solido)));

    var root = svg('svg', {
      class: 'pv-root',
      viewBox: vb.x + ' ' + vb.y + ' ' + vb.width + ' ' + vb.height,
      'aria-hidden': 'true',
      focusable: 'false'
    }, defs, n.cabeza, n.dummy);

    return { svg: root, nodes: n, ids: ids };
  }

  /* ================================================================ rig */

  /**
   * createRig(container, opts) → rig. Construye el SVG dentro de `container` y lo deja en reposo.
   * opts: { params = DSL.anim.pelucaveParams, label (role="img" + aria-label; sin él, decorativo),
   *         dummyContent (nodo SVG dibujado en la caja [0, tamano]²; por defecto, la caja del arnés),
   *         maxDt = 0.1 (recorte del paso de tiempo, en s),
   *         onUpdate(rig, state) (tras cada setTime, también en scrub; no en el setTime inicial) }.
   * rig: { el, nodes, params, duration, timeline, setTime(t) → state, time(), state(), apply(state),
   *        play({ onComplete?, from = 0 } | onComplete), stop(), reset(), isPlaying(), phaseAt(t?),
   *        ejectionPoint(), destroy() }.
   * Con DSL.prefs.reducedMotion, play() salta al estado final y llama a onComplete en el acto (sin recorrido).
   */
  function createRig(container, opts) {
    opts = opts || {};
    if (!container || typeof container.appendChild !== 'function') throw new Error('createRig: falta el contenedor.');
    var params = opts.params || DSL.anim.pelucaveParams;
    var geom = DSL.anim.pelucaveGeometria;
    var tl = createTimeline(params);
    var built = buildSvg();
    var n = built.nodes;
    var size = params.dummy.tamano;

    if (opts.label) {
      built.svg.removeAttribute('aria-hidden');
      built.svg.setAttribute('role', 'img');
      built.svg.setAttribute('aria-label', String(opts.label));
    }
    n.dummy.appendChild(opts.dummyContent || util.svg('rect', { class: 'pv-dummy-caja', x: 0, y: 0, width: size, height: size, rx: 6 }));
    container.appendChild(built.svg);

    // Pivotes y geometría en unidades de usuario (nunca px): todo viene de los parámetros y del asset.
    var pivotInf = { x: params.mandibula.pivoteX, y: params.mandibula.pivoteY };
    var pivotSup = { x: params.mandibula.pivoteSupX, y: params.mandibula.pivoteSupY };
    var pivotHead = { x: params.cabeza.pivoteX, y: params.cabeza.pivoteY };
    var normal = mouthNormal(geom.lineaDental.arriba, geom.lineaDental.abajo);
    var centerSup = bboxCenter(geom.bboxReposo.superior);
    var centerInf = bboxCenter(geom.bboxReposo.inferior);
    var peloCenter = bboxCenter(geom.bboxReposo.pelo);

    // Caché de lo escrito: una escritura por nodo y atributo por cuadro, y solo si el valor cambia.
    var written = new Map();
    function setAttr(node, name, value) {
      var cache = written.get(node);
      if (!cache) {
        cache = {};
        written.set(node, cache);
      }
      if (cache[name] === value) return;
      cache[name] = value;
      node.setAttribute(name, value);
    }

    var state = tl.restState();
    var time = 0;
    var boca = null;

    function applyState(st) {
      var headM = headMatrix({ pivot: pivotHead, angle: st.cabezaRot, dx: st.cabezaX, dy: st.cabezaY, sx: st.cabezaSx, sy: st.cabezaSy });
      var supM = rotateAbout(pivotSup, st.supAngle);
      // La separación se acota en 0: el rebote elástico no debe hundir la arcada inferior en la superior.
      var sep = st.separacion > 0 ? st.separacion : 0;
      var infM = multiply(translate(st.mandX + normal.x * sep, st.mandY + normal.y * sep), rotateAbout(pivotInf, st.mandAngle));
      var ojoM = translate(st.ojoX, st.ojoY);
      var peloM = multiply(translate(st.peloX, st.peloY), rotateAbout(peloCenter, st.peloRot));

      setAttr(n.cabeza, 'transform', toSvgString(headM));
      setAttr(n.mandSup, 'transform', toSvgString(supM));
      setAttr(n.mandInf, 'transform', toSvgString(infM));
      setAttr(n.ojo, 'transform', toSvgString(ojoM));
      setAttr(n.pelo, 'transform', toSvgString(peloM));

      // Punto de eyección: centro de la cavidad = punto medio entre los centros de ambas arcadas (mundo).
      boca = midpoint(apply(compose(headM, supM), centerSup), apply(compose(headM, infM), centerInf));
      var dummyM = compose(translate(boca.x + st.dummyX, boca.y + st.dummyY), scale(st.dummyS), translate(-size / 2, -size / 2));
      setAttr(n.dummy, 'transform', toSvgString(dummyM));
      setAttr(n.dummy, 'opacity', st.dummyO.toFixed(3));
      return st;
    }

    function setTime(t) {
      time = !(t > 0) ? 0 : t > tl.duration ? tl.duration : t;
      applyState(tl.stateAt(time, state));
      if (typeof opts.onUpdate === 'function' && rig) opts.onUpdate(rig, state);
      return state;
    }

    var onComplete = null;
    function finish() {
      lp.stop();
      var cb = onComplete;
      onComplete = null;
      if (cb) cb(rig);
    }
    var lp = util.loop(function (dt) {
      setTime(time + dt);
      if (time >= tl.duration) finish();
    }, { maxDt: opts.maxDt || 0.1 });

    function play(o) {
      if (typeof o === 'function') o = { onComplete: o };
      o = o || {};
      lp.stop();
      onComplete = typeof o.onComplete === 'function' ? o.onComplete : null;
      setTime(o.from || 0);
      if (DSL.prefs.reducedMotion) {
        setTime(tl.duration);
        finish();
        return rig;
      }
      lp.start();
      return rig;
    }

    function stop() {
      lp.stop();
      onComplete = null;
      return rig;
    }

    setTime(0);

    var alive = true;
    var rig = {
      el: built.svg,
      nodes: n,
      params: params,
      duration: tl.duration,
      timeline: tl,
      setTime: setTime,
      time: function () { return time; },
      state: function () { var copy = {}; for (var k in state) copy[k] = state[k]; return copy; },
      apply: applyState,
      play: play,
      stop: stop,
      reset: function () { stop(); setTime(0); return rig; },
      isPlaying: function () { return lp.isRunning(); },
      phaseAt: function (t) { return tl.phaseAt(t === undefined ? time : t); },
      ejectionPoint: function () { return boca ? { x: boca.x, y: boca.y } : null; },
      destroy: function () {
        if (!alive) return;
        alive = false;
        onComplete = null;
        lp.destroy();
        written.clear();
        built.svg.remove();
      }
    };
    return rig;
  }

  DSL.anim.pelucave = {
    PHASES: PHASES,
    REST: REST,
    easings: { powerIn: powerIn, powerOut: powerOut, inOutFromOut: inOutFromOut, elasticOut: elasticOut, byName: EASES },
    matrix: {
      IDENTITY: IDENTITY, translate: translate, scale: scale, rotate: rotate, multiply: multiply, compose: compose,
      apply: apply, aboutPivot: aboutPivot, rotateAbout: rotateAbout, scaleAbout: scaleAbout, headMatrix: headMatrix,
      toSvgString: toSvgString
    },
    geometry: { mouthNormal: mouthNormal, bboxCenter: bboxCenter, midpoint: midpoint },
    phaseStarts: phaseStarts,
    restState: restState,
    segments: segments,
    createTimeline: createTimeline,
    buildSvg: buildSvg,
    createRig: createRig
  };
})(window.DSL);
