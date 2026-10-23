/*
 * js/anim/pelucaveOverlay.js — Propietario: anim.
 * Cableado de la transición Pelucave a la navegación. navigate(sectionId) monta una capa fija sobre la vista
 * (velo del color del fondo + cabeza del logo, sin eventos de puntero), reproduce anticipación y apertura, en
 * el clímax salta a la sección (DSL.ui.shell.scrollTo instantáneo) y la hace emerger de la boca siguiendo la
 * trayectoria calibrada del objeto expulsado (escala 0.15 → 1, recorrido distancia/elevación en unidades del
 * logo escaladas a px), deja que la recuperación elástica cierre la boca y desmonta la capa sin dejar ningún
 * estilo ni nodo que bloquee la sección. Un candado ignora los clics mientras corre. Con movimiento reducido
 * no interviene (navegación normal). API: docs/api/pelucave.md.
 */
(function (DSL) {
  'use strict';

  var util = DSL.util;
  var h = util.h;
  DSL.anim = DSL.anim || {};

  var MOUTH = { x: 0.32, y: 0.52 };   // dónde cae la boca en la ventana (fracción del ancho y del alto)
  var HEAD_VH = 0.62;                  // alto de la cabeza respecto al alto de la ventana…
  var HEAD_MAX_VW = 0.9;               // …sin superar el 90 % del ancho (teléfonos)
  var FADE_OUT = 0.3;                  // s: fundido final de la cabeza, dentro de la recuperación
  var current = null;                  // transición en curso (candado anti-repetición)

  function px(v) {
    return Math.round(v * 100) / 100 + 'px';
  }

  /** Salto instantáneo a la sección: por el shell (hash, alineación bajo la barra) o, sin él, scrollIntoView. */
  function jumpTo(target, id) {
    var shell = DSL.ui && DSL.ui.shell;
    if (shell && typeof shell.scrollTo === 'function') {
      shell.scrollTo(id, { instant: true });
      return;
    }
    try { target.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (err) { target.scrollIntoView(true); }
    try {
      if (window.history && typeof window.history.replaceState === 'function') window.history.replaceState(null, '', '#' + id);
    } catch (err) { /* algunos contextos file:// lo prohíben */ }
  }

  /** Escritura de estilo con caché: una por propiedad y cuadro, solo si cambia. */
  function setStyle(run, el, prop, value) {
    var cache = run.written.get(el);
    if (!cache) {
      cache = {};
      run.written.set(el, cache);
    }
    if (cache[prop] === value) return;
    cache[prop] = value;
    el.style[prop] = value;
  }

  /** Clímax: salto a la sección y preparación del vuelo (una sola lectura de layout, fuera del bucle). */
  function eject(run) {
    run.ejected = true;
    jumpTo(run.target, run.id);
    var r = run.target.getBoundingClientRect();
    run.target.classList.add('pv-vuelo');
    // El punto de la sección que aterriza donde termina la trayectoria del objeto es el origen de la escala.
    run.target.style.transformOrigin = px(run.landing.x - r.left) + ' ' + px(run.landing.y - r.top);
  }

  /** Recuperación: la sección se asienta en su sitio sin ningún estilo en línea. */
  function settle(run) {
    run.settled = true;
    var st = run.target.style;
    st.removeProperty('transform');
    st.removeProperty('transform-origin');
    run.target.classList.remove('pv-vuelo');
    var attr = run.target.getAttribute('style');
    if (attr !== null && !String(attr).trim()) run.target.removeAttribute('style');
  }

  function frame(run, rig, s) {
    var t = rig.time();
    var starts = rig.timeline.starts;
    var f = rig.params.fases;
    var E = DSL.anim.pelucave.easings.byName;

    // Velo: cubre la vista durante la anticipación, se mantiene en la apertura y se retira en el clímax
    // (así el cambio de la vista actual a la sección queda detrás de la cabeza y nunca se ve el salto).
    var veil;
    if (t < starts.apertura) veil = E['power2.inOut'](Math.min(1, t / f.anticipacion));
    else if (t < starts.climax) veil = 1;
    else if (t < starts.recuperacion) veil = 1 - E['power2.out']((t - starts.climax) / f.climax);
    else veil = 0;
    setStyle(run, run.scrim, 'opacity', veil.toFixed(3));

    // Cabeza: visible hasta el final de la recuperación, con un fundido corto al terminar.
    var fade = t > rig.duration - FADE_OUT ? Math.max(0, (rig.duration - t) / FADE_OUT) : 1;
    setStyle(run, run.headBox, 'opacity', fade.toFixed(3));

    // Sección: nace en la cavidad en el clímax, vuela con el objeto y se asienta al empezar la recuperación.
    if (t >= starts.climax && !run.ejected) eject(run);
    if (run.ejected && !run.settled) {
      if (t >= starts.recuperacion) {
        settle(run);
      } else {
        var b = rig.ejectionPoint();
        var dx = run.origin.x + (b.x + s.dummyX) * run.k - run.landing.x;
        var dy = run.origin.y + (b.y + s.dummyY) * run.k - run.landing.y;
        setStyle(run, run.target, 'transform', 'translate(' + px(dx) + ', ' + px(dy) + ') scale(' + s.dummyS.toFixed(4) + ')');
      }
    }
  }

  /** Desmontaje limpio: sin capa, sin estilos en la sección, candado liberado y foco en la sección. */
  function finish(run) {
    if (run.finished) return;
    run.finished = true;
    if (!run.ejected) eject(run);
    if (!run.settled) settle(run);
    run.overlay.style.visibility = 'hidden';
    run.rig.destroy();
    run.overlay.remove();
    if (current === run) current = null;
    var target = run.target;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    try { target.focus({ preventScroll: true }); } catch (err) { /* sin foco programático */ }
  }

  /**
   * navigate(sectionId) → boolean. true: la transición se encarga de llegar a la sección (el llamador evita la
   * navegación por defecto); también true mientras otra transición corre (el clic repetido se ignora).
   * false: no interviene (sección inexistente, módulo incompleto o movimiento reducido): navegación normal.
   */
  function navigate(sectionId) {
    if (current) return true;
    var A = DSL.anim.pelucave;
    var geom = DSL.anim.pelucaveGeometria;
    var target = document.getElementById(sectionId);
    if (!target || !A || !DSL.anim.pelucaveAsset || !geom || DSL.prefs.reducedMotion) return false;

    var scrim = h('div', { class: 'pv-overlay-scrim' });
    var headBox = h('div', { class: 'pv-overlay-head' });
    var overlay = h('div', { class: 'pv-overlay', 'aria-hidden': 'true', 'data-testid': 'pv-overlay' }, scrim, headBox);
    var run = {
      id: sectionId, target: target, overlay: overlay, scrim: scrim, headBox: headBox,
      ready: false, ejected: false, settled: false, finished: false,
      origin: null, landing: null, k: 1, rig: null, written: new Map()
    };
    current = run;
    document.body.appendChild(overlay);

    // El objeto expulsado del rig no se dibuja: aquí el objeto es la propia sección.
    run.rig = A.createRig(headBox, {
      dummyContent: util.svg('g', { class: 'pv-dummy-seccion' }),
      onUpdate: function (rig, state) { if (run.ready) frame(run, rig, state); }
    });
    var rig = run.rig;

    // Geometría de la cabeza en px: su punto de eyección en reposo cae en MOUTH de la ventana.
    var vw = window.innerWidth || 0;
    var vh = window.innerHeight || 0;
    var vb = geom.viewBox;
    var headH = Math.min(HEAD_VH * vh, HEAD_MAX_VW * vw * vb.height / vb.width);
    var k = headH / vb.height;
    var mouth = rig.ejectionPoint();
    run.k = k;
    run.origin = { x: MOUTH.x * vw - mouth.x * k, y: MOUTH.y * vh - mouth.y * k };
    headBox.style.left = px(run.origin.x);
    headBox.style.top = px(run.origin.y);
    headBox.style.width = px(vb.width * k);
    headBox.style.height = px(headH);

    // Punto de aterrizaje: donde termina la trayectoria del objeto al empezar la recuperación.
    rig.setTime(rig.timeline.starts.recuperacion);
    var st = rig.state();
    var b = rig.ejectionPoint();
    run.landing = { x: run.origin.x + (b.x + st.dummyX) * k, y: run.origin.y + (b.y + st.dummyY) * k };
    rig.setTime(0);

    run.ready = true;
    frame(run, rig, rig.state());
    rig.play({ onComplete: function () { finish(run); } });
    return true;
  }

  DSL.anim.pelucaveOverlay = {
    navigate: navigate,
    isRunning: function () { return current !== null; },
    /** Termina en el acto la transición en curso (sección asentada, capa desmontada). */
    cancel: function () {
      if (!current) return false;
      var run = current;
      run.rig.stop();
      finish(run);
      return true;
    }
  };
})(window.DSL);
