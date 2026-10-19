/*
 * js/ui/shell.js — Propietario: design-system.
 * Cabecera fija de vidrio (marca, navegación con scrollspy e indicador deslizante, conmutador de tema,
 * hoja «Menú» en teléfono) y pie con créditos → DSL.ui.shell. API real: docs/api/shell.md.
 * Estilos en css/shell.css (prefijo sh-). Script clásico: nada toca el DOM en tiempo de carga.
 */
(function (DSL) {
  'use strict';

  var util = DSL.util;
  var h = util.h;
  var S = util.svg;
  var ui = DSL.ui;
  var global = typeof window !== 'undefined' ? window : globalThis;

  /** Secciones en orden de navegación (PRODUCT_SPEC §2). «inicio» se alcanza con la marca. */
  var SECTIONS = [
    { id: 'inicio', label: 'Inicio', nav: false },
    { id: 'conceptos', label: 'Conceptos' },
    { id: 'modelado', label: 'Modelado' },
    { id: 'galeria', label: 'Galería' },
    { id: 'transferencia', label: 'Función de transferencia' }
  ];
  var NAV = SECTIONS.filter(function (s) { return s.nav !== false; });
  var IDS = SECTIONS.map(function (s) { return s.id; });
  var PHONE_QUERY = '(max-width: 767.98px)';

  var state = {
    header: null,
    active: null,
    menuOpen: false,
    links: [],
    sheetLinks: [],
    indicator: null,
    bar: null,
    sheet: null,
    scrim: null,
    menuBtn: null,
    themeBtn: null,
    closeTimer: null,
    inerted: [],
    cleanups: []
  };

  function getDoc() {
    return global.document;
  }

  function icon(name, opts) {
    return typeof ui.icon === 'function' ? ui.icon(name, opts) : h('span', { 'aria-hidden': 'true' });
  }

  /** Marca: un trozo del plano s con un par de polos conjugados × y un cero ○ (estables, a la izquierda). */
  function brandMark(className) {
    return S('svg', { class: ['sh-mark', className], viewBox: '0 0 32 32', width: 28, height: 28, 'aria-hidden': 'true', focusable: 'false' },
      S('path', { class: 'sh-mark__axis', d: 'M2.5 16H29.5M21 3.5V28.5' }),
      S('path', { class: 'sh-mark__pole', d: 'M9.6 6.1l6.8 6.8M16.4 6.1l-6.8 6.8M9.6 19.1l6.8 6.8M16.4 19.1l-6.8 6.8' }),
      S('circle', { class: 'sh-mark__zero', cx: 5.6, cy: 16, r: 2.6 }));
  }

  /* ================================================================== desplazamiento */

  function isPhone() {
    return typeof global.matchMedia === 'function' && global.matchMedia(PHONE_QUERY).matches;
  }

  /**
   * scrollTo(sectionId, { focus = false, instant = false }) → boolean
   * Desplazamiento suave (instantáneo con movimiento reducido o con instant) respetando la barra fija
   * (scroll-margin-top = --header-h), actualiza location.hash con history.replaceState y, con focus, lleva el
   * foco a la sección. Después vigila el destino mientras las secciones perezosas cambian de altura (settle).
   */
  function scrollTo(id, opts) {
    var d = getDoc();
    var target = d && d.getElementById(id);
    if (!target) return false;
    var behavior = DSL.prefs.reducedMotion || (opts && opts.instant) ? 'auto' : 'smooth';
    // La barra deja de ser transparente en el acto si el destino no es el inicio (el observador del
    // centinela llegaría uno o dos frames tarde, con la página ya desplazada).
    if (state.header && targetY(target) > AT_TOP_PX) state.header.classList.remove('is-at-top');
    try {
      target.scrollIntoView({ behavior: behavior, block: 'start' });
    } catch (err) {
      target.scrollIntoView(true);
    }
    try {
      if (global.history && typeof global.history.replaceState === 'function') global.history.replaceState(null, '', '#' + id);
    } catch (err) { /* algunos contextos file:// lo prohíben: el desplazamiento ya se hizo */ }
    if (opts && opts.focus) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); }
    }
    settle(target, behavior);
    return true;
  }

  /*
   * Corrección del destino (integrador). Las secciones se inician de forma perezosa al acercarse a la vista
   * y cambian de altura mientras se pasa por ellas o justo después de llegar: un desplazamiento hacia
   * #galeria podía terminar cientos de píxeles por encima de su destino. Al acabar el desplazamiento
   * (scrollend o, sin él, un plazo) se comprueba el borde de la sección y se vuelve a alinear; después, durante
   * HOLD_MS, cada cambio de tamaño del documento vuelve a alinear (al instante) si la sección se movió.
   * Cualquier gesto del usuario (rueda, toque, tecla, puntero) cancela la corrección. Si el foco pasó a un
   * elemento dentro de la sección (p. ej. concepts:open enfoca una tarjeta y se desplaza a ella), no se
   * corrige hacia arriba.
   */
  var HOLD_MS = 1500;
  var AT_TOP_PX = 8;              // por encima de 8 px de desplazamiento la barra es de vidrio
  var settleState = { token: 0, cancel: null };

  /** scrollY en el que quedará el destino (scroll-margin-top incluido), dentro del recorrido posible. */
  function targetY(target) {
    var d = getDoc();
    if (!target || typeof target.getBoundingClientRect !== 'function' || !d || !d.documentElement) return 0;
    var margin = NaN;
    try { margin = parseFloat(global.getComputedStyle(target).scrollMarginTop); } catch (err) { /* sin estilos */ }
    if (!isFinite(margin)) margin = 0;
    var y = (global.scrollY || 0) + target.getBoundingClientRect().top - margin;
    var maxY = Math.max(0, (d.documentElement.scrollHeight || 0) - (global.innerHeight || 0));
    return Math.max(0, Math.min(isFinite(y) ? y : 0, maxY || Infinity));
  }

  /**
   * Salto en curso: <html data-jumping> mientras dura el desplazamiento y su corrección. components.css
   * muestra entonces los .ds-reveal en su estado final y sin animar (no aparecen a medias al llegar).
   * Al terminar, los que quedaron a la vista se marcan como revelados (no vuelven a ocultarse).
   */
  function setJumping(on) {
    var d = getDoc();
    var root = d && d.documentElement;
    if (!root) return;
    if (on) {
      root.setAttribute('data-jumping', '');
      return;
    }
    if (!root.hasAttribute('data-jumping')) return;
    var vh = global.innerHeight || 0;
    var pending = typeof d.querySelectorAll === 'function' ? d.querySelectorAll('.ds-reveal') : [];
    for (var i = 0; i < pending.length; i++) {
      if (pending[i].classList.contains('is-revealed')) continue;
      var r = typeof pending[i].getBoundingClientRect === 'function' ? pending[i].getBoundingClientRect() : null;
      if (r && r.top < vh && r.bottom > 0) pending[i].classList.add('is-revealed');
    }
    root.removeAttribute('data-jumping');
  }

  function settle(target, behavior) {
    if (settleState.cancel) settleState.cancel();
    if (typeof global.addEventListener !== 'function') return;
    var token = ++settleState.token;
    setJumping(true);
    var tries = 0;
    var timer = null;
    var stopSize = null;
    var holding = false;
    var doc = getDoc();
    var USER = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
    var hasScrollEnd = 'onscrollend' in global;

    function stop() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (stopSize) stopSize();
      stopSize = null;
      if (hasScrollEnd) global.removeEventListener('scrollend', onEnd);
      USER.forEach(function (t) { global.removeEventListener(t, stop, true); });
      if (settleState.token === token) {
        settleState.cancel = null;
        setJumping(false);
      }
      token = -1;
    }
    function wait(ms) {
      if (timer !== null) clearTimeout(timer);
      // Sin scrollend (o si no hubo desplazamiento y nunca llega) se comprueba tras un plazo.
      timer = setTimeout(onEnd, ms || (behavior === 'smooth' ? 1600 : 250));
    }
    /** true si la sección no está donde debe y se puede corregir. */
    function misplaced() {
      if (typeof target.getBoundingClientRect !== 'function' || !doc || !doc.documentElement) return false;
      var margin = NaN;
      try { margin = parseFloat(global.getComputedStyle(target).scrollMarginTop); } catch (err) { /* sin estilos */ }
      if (!isFinite(margin)) margin = parseFloat(util.cssVar('--header-h')) || 64;
      var top = target.getBoundingClientRect().top;
      var maxY = (doc.documentElement.scrollHeight || 0) - (global.innerHeight || 0);
      var atBottom = (global.scrollY || 0) >= maxY - 1;
      var active = doc.activeElement;
      var focusInside = active && active !== target && typeof target.contains === 'function' && target.contains(active);
      return (top > margin + 2 && !atBottom) || (top < margin - 2 && !focusInside);
    }
    function align(how) {
      try { target.scrollIntoView({ behavior: how, block: 'start' }); } catch (err) { target.scrollIntoView(true); }
    }
    var holdEnd = 0;
    var holdY = 0;
    /** Vigilancia: realinea al instante; si otro (código o usuario) desplazó la página, se retira. */
    function hold() {
      if (token !== settleState.token) return false;
      if (Math.abs((global.scrollY || 0) - holdY) > 1) { stop(); return false; }
      if (misplaced() && tries < 8) {
        tries += 1;
        align('auto');
        holdY = global.scrollY || 0;
      }
      return true;
    }
    function onEnd() {
      if (token !== settleState.token) return;
      if (holding) {
        // Comprobación periódica (además del observador de tamaño) hasta HOLD_MS.
        if (!hold()) return;
        if (util.now() >= holdEnd) { stop(); return; }
        wait(200);
        return;
      }
      if (misplaced() && tries < 4) {
        tries += 1;
        align(behavior);
        if (behavior === 'smooth') { wait(); return; }
      }
      // Llegó: vigilar los cambios de altura que lleguen por los inicios perezosos.
      holding = true;
      holdY = global.scrollY || 0;
      if (hasScrollEnd) global.removeEventListener('scrollend', onEnd);
      var body = doc && doc.body;
      if (body && typeof util.observeSize === 'function') stopSize = util.observeSize(body, hold);
      holdEnd = util.now() + HOLD_MS;
      wait(200);
    }
    USER.forEach(function (t) { global.addEventListener(t, stop, true); });
    settleState.cancel = stop;
    if (behavior !== 'smooth') { onEnd(); return; }   // salto instantáneo: ya llegó, se vigila
    if (hasScrollEnd) global.addEventListener('scrollend', onEnd);
    wait();
  }

  /*
   * Posición de lectura al cambiar el ancho (girar el teléfono, redimensionar la ventana). Se anota la
   * sección más alta a la vista y qué fracción de ella queda ya por encima de la barra; tras un cambio de
   * ancho se restaura (doble rAF y una vez más antes de 500 ms). No actúa con cambios solo de alto
   * (barra de direcciones del móvil), con una corrección de salto en curso (settle), con la hoja «Menú»
   * abierta ni si el usuario toca, rueda o pulsa una tecla mientras tanto.
   */
  var READ_LATE_MS = 450;
  function keepReadingPosition() {
    var d = getDoc();
    if (typeof global.addEventListener !== 'function' || !d) return function () {};
    var anchor = null;
    var lastW = global.innerWidth || 0;
    var burst = null;
    var recordRaf = 0;
    var USER = ['wheel', 'touchstart', 'keydown', 'pointerdown'];

    function lineY() {
      if (!state.header || typeof state.header.getBoundingClientRect !== 'function') return 0;
      return Math.max(0, state.header.getBoundingClientRect().bottom || 0);
    }
    function record() {
      recordRaf = 0;
      if (burst) return;
      if ((global.scrollY || 0) < 1) { anchor = null; return; }
      var y0 = lineY();
      for (var i = 0; i < IDS.length; i++) {
        var el = d.getElementById(IDS[i]);
        if (!el || typeof el.getBoundingClientRect !== 'function') continue;
        var r = el.getBoundingClientRect();
        if (!(r.height > 0) || r.bottom <= y0) continue;
        anchor = { id: IDS[i], frac: (y0 - r.top) / r.height };
        return;
      }
      anchor = null;
    }
    function restore() {
      if (!anchor || settleState.cancel || state.menuOpen) return;
      var el = d.getElementById(anchor.id);
      if (!el) return;
      var r = el.getBoundingClientRect();
      var delta = (lineY() - r.top) - anchor.frac * r.height;
      if (Math.abs(delta) < 1) return;
      global.scrollTo(0, Math.max(0, (global.scrollY || 0) - delta));
    }
    function endBurst() {
      if (!burst) return;
      if (burst.raf) util.cancelRaf(burst.raf);
      if (burst.timer !== null) clearTimeout(burst.timer);
      burst = null;
    }
    function onResize() {
      var w = global.innerWidth || 0;
      if (w === lastW) return;            // solo cambió el alto
      lastW = w;
      if (settleState.cancel || !anchor) return;
      if (!burst) burst = { raf: 0, timer: null };
      if (burst.raf) util.cancelRaf(burst.raf);
      burst.raf = util.raf(function () {
        if (!burst) return;
        burst.raf = util.raf(function () {
          if (!burst) return;
          burst.raf = 0;
          restore();
        });
      });
      if (burst.timer !== null) clearTimeout(burst.timer);
      burst.timer = setTimeout(function () {
        if (!burst) return;
        burst.timer = null;
        restore();
        endBurst();
        record();
      }, READ_LATE_MS);
    }
    function onUser() {
      if (!burst) return;
      endBurst();
      anchor = null;
    }
    function onScroll() {
      if (!burst && !recordRaf) recordRaf = util.raf(record);
    }
    global.addEventListener('resize', onResize);
    global.addEventListener('scroll', onScroll, { passive: true });
    USER.forEach(function (t) { global.addEventListener(t, onUser, true); });
    record();
    return function () {
      endBurst();
      if (recordRaf) util.cancelRaf(recordRaf);
      recordRaf = 0;
      global.removeEventListener('resize', onResize);
      global.removeEventListener('scroll', onScroll);
      USER.forEach(function (t) { global.removeEventListener(t, onUser, true); });
    };
  }

  /** Clic en un ancla a una de las cinco secciones (barra, hoja, pie o llamadas a la acción de las secciones). */
  function onDocClick(e) {
    if (e.defaultPrevented || (e.button || 0) !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && typeof e.target.closest === 'function' ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = (a.getAttribute('href') || '').slice(1);
    if (IDS.indexOf(id) < 0 || !getDoc().getElementById(id)) return;
    e.preventDefault();
    if (state.menuOpen) closeMenu({ restoreFocus: false });
    scrollTo(id, { focus: true });
  }

  /* ================================================================== scrollspy */

  function setActive(id) {
    if (id === state.active) return;
    state.active = id;
    var all = state.links.concat(state.sheetLinks);
    for (var i = 0; i < all.length; i++) {
      if (all[i].getAttribute('data-section') === id) all[i].setAttribute('aria-current', 'true');
      else all[i].removeAttribute('aria-current');
    }
    placeIndicator();
    DSL.bus.emit('section:change', { id: id });
  }

  function placeIndicator() {
    var ind = state.indicator;
    var bar = state.bar;
    if (!ind || !bar) return;
    var link = null;
    for (var i = 0; i < state.links.length; i++) {
      if (state.links[i].getAttribute('data-section') === state.active) link = state.links[i];
    }
    var lr = link ? link.getBoundingClientRect() : null;
    if (!lr || !(lr.width > 0)) {
      ind.classList.remove('is-visible');
      return;
    }
    var br = bar.getBoundingClientRect();
    // El cursor cubre el texto del enlace, no su relleno.
    var cs = typeof global.getComputedStyle === 'function' ? global.getComputedStyle(link) : null;
    var pl = cs ? parseFloat(cs.paddingLeft) || 0 : 0;
    var pr = cs ? parseFloat(cs.paddingRight) || 0 : 0;
    var w = Math.max(8, lr.width - pl - pr);
    ind.style.setProperty('--ind-x', Math.round(lr.left - br.left + pl) + 'px');
    ind.style.setProperty('--ind-s', String(Math.round(w) / 100));
    if (!ind.classList.contains('is-ready')) {
      // Primera colocación sin transición; después se desliza.
      util.raf(function () { ind.classList.add('is-ready'); });
    }
    ind.classList.add('is-visible');
  }

  /**
   * Elige la sección activa: la última, en orden de documento, que corta la franja superior
   * (desde la barra hasta el 45 % del alto de la ventana). Pura; la usan el observador y las pruebas.
   */
  function pickActive(ids, visibleMap) {
    var current = null;
    for (var i = 0; i < ids.length; i++) if (visibleMap[ids[i]]) current = ids[i];
    return current;
  }

  function setupSpy(headerEl) {
    var d = getDoc();
    var targets = IDS.map(function (id) { return d.getElementById(id); }).filter(Boolean);
    if (!targets.length || typeof global.IntersectionObserver !== 'function') return function () {};
    var visible = {};
    var hh = Math.round(headerEl.getBoundingClientRect().height) || 64;
    var io = new global.IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) visible[entries[i].target.id] = !!entries[i].isIntersecting;
      var id = pickActive(IDS, visible);
      if (id) setActive(id);
    }, { rootMargin: '-' + (hh + 1) + 'px 0px -55% 0px', threshold: 0 });
    targets.forEach(function (t) { io.observe(t); });
    return function () { io.disconnect(); };
  }

  /* ================================================================== hoja «Menú» (teléfono) */

  function focusables() {
    return [state.menuBtn].concat(state.sheetLinks);
  }

  function setInert(on) {
    var d = getDoc();
    if (on) {
      state.inerted = [];
      var nodes = d.querySelectorAll('.app-main, .app-footer');
      for (var i = 0; i < nodes.length; i++) {
        if (!nodes[i].hasAttribute('inert')) {
          nodes[i].setAttribute('inert', '');
          state.inerted.push(nodes[i]);
        }
      }
    } else {
      state.inerted.forEach(function (n) { n.removeAttribute('inert'); });
      state.inerted = [];
    }
  }

  function onSheetKey(e) {
    if (!state.menuOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      return;
    }
    if (e.key !== 'Tab') return;
    var list = focusables();
    var d = getDoc();
    var i = list.indexOf(d.activeElement);
    if (i < 0) return;
    if (e.shiftKey && i === 0) {
      e.preventDefault();
      list[list.length - 1].focus();
    } else if (!e.shiftKey && i === list.length - 1) {
      e.preventDefault();
      list[0].focus();
    }
  }

  function openMenu() {
    if (state.menuOpen || !state.sheet) return;
    var d = getDoc();
    state.menuOpen = true;
    state.closeTimer = state.closeTimer !== null ? (global.clearTimeout(state.closeTimer), null) : null;
    state.sheet.hidden = false;
    state.scrim.hidden = false;
    void state.sheet.offsetWidth; // estado inicial pintado antes de la transición
    state.sheet.setAttribute('data-state', 'open');
    state.scrim.setAttribute('data-state', 'open');
    state.menuBtn.setAttribute('aria-expanded', 'true');
    state.menuBtn.setAttribute('aria-label', 'Cerrar menú');
    d.documentElement.classList.add('sh-lock');
    if (state.header) state.header.classList.add('is-menu-open');
    setInert(true);
    d.addEventListener('keydown', onSheetKey, true);
    var current = null;
    for (var i = 0; i < state.sheetLinks.length; i++) {
      if (state.sheetLinks[i].getAttribute('data-section') === state.active) current = state.sheetLinks[i];
    }
    (current || state.sheetLinks[0]).focus();
  }

  function closeMenu(opts) {
    if (!state.menuOpen) return;
    var d = getDoc();
    state.menuOpen = false;
    state.sheet.setAttribute('data-state', 'closed');
    state.scrim.setAttribute('data-state', 'closed');
    state.menuBtn.setAttribute('aria-expanded', 'false');
    state.menuBtn.removeAttribute('aria-label');
    d.documentElement.classList.remove('sh-lock');
    if (state.header) state.header.classList.remove('is-menu-open');
    setInert(false);
    d.removeEventListener('keydown', onSheetKey, true);
    var sheet = state.sheet;
    var scrim = state.scrim;
    state.closeTimer = global.setTimeout(function () {
      state.closeTimer = null;
      if (!state.menuOpen) {
        sheet.hidden = true;
        scrim.hidden = true;
      }
    }, 240);
    if (!opts || opts.restoreFocus !== false) state.menuBtn.focus();
  }

  /* ================================================================== tema */

  function paintTheme() {
    var btn = state.themeBtn;
    if (!btn) return;
    var light = DSL.prefs.theme === 'light';
    var label = light ? 'Tema oscuro' : 'Tema claro';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('data-tip', label);
    btn.setAttribute('data-mode', light ? 'light' : 'dark');
    if (ui.tooltips && typeof ui.tooltips.refresh === 'function') ui.tooltips.refresh(btn);
  }

  /** Cambia el tema; con View Transitions hace un fundido de 260 ms (nunca con movimiento reducido). */
  function toggleTheme() {
    var d = getDoc();
    var run = function () { DSL.prefs.toggleTheme(); };
    if (d && typeof d.startViewTransition === 'function' && !DSL.prefs.reducedMotion) {
      try {
        var vt = d.startViewTransition(run);
        [vt.ready, vt.finished, vt.updateCallbackDone].forEach(function (p) {
          if (p && typeof p.catch === 'function') p.catch(function () { /* transición omitida: el tema ya cambió */ });
        });
        return;
      } catch (err) { /* sin transición */ }
    }
    run();
  }

  /* ================================================================== cabecera */

  /**
   * mountHeader(el) → { destroy }
   * el es <header class="app-header" data-mount="shell-header">. La hoja «Menú» y su velo se añaden a
   * <body> (fuera del vidrio de la barra, para no apilar vidrio sobre vidrio).
   */
  function mountHeader(el) {
    var d = getDoc();
    if (state.header) throw new Error('shell: la cabecera ya está montada.');
    state.header = el;
    state.active = null;

    var brand = h('a', { class: 'sh-brand', href: '#inicio', 'data-testid': 'sh-brand' },
      brandMark(),
      h('span', { class: 'sh-wordmark' },
        h('span', { class: 'sh-wordmark__a' }, 'Laboratorio de'),
        ' ',
        h('span', { class: 'sh-wordmark__b' }, 'Sistemas Dinámicos')));

    state.links = NAV.map(function (s) {
      return h('a', { class: 'sh-link', href: '#' + s.id, 'data-section': s.id, 'data-testid': 'sh-nav-' + s.id }, s.label);
    });
    state.indicator = h('span', { class: 'sh-indicator', 'aria-hidden': 'true' });
    var nav = h('nav', { class: 'sh-nav', 'aria-label': 'Secciones' },
      h('ul', { class: 'sh-links', role: 'list' }, state.links.map(function (a) { return h('li', null, a); })));

    state.themeBtn = h('button', { type: 'button', class: 'ds-btn ds-btn--ghost ds-btn--icon sh-theme', 'data-testid': 'sh-theme-toggle' },
      h('span', { class: 'sh-swap', 'aria-hidden': 'true' },
        icon('sun', { className: 'sh-theme__sun' }),
        icon('moon', { className: 'sh-theme__moon' })));
    state.themeBtn.addEventListener('click', toggleTheme);

    var sheetId = util.uid('sh-sheet');
    state.menuBtn = h('button', {
      type: 'button',
      class: 'ds-btn ds-btn--ghost sh-menu-btn',
      'aria-expanded': 'false',
      'aria-controls': sheetId,
      'data-testid': 'sh-menu-toggle'
    },
    h('span', { class: 'sh-swap', 'aria-hidden': 'true' },
      icon('menu', { className: 'sh-menu-btn__open' }),
      icon('x', { className: 'sh-menu-btn__close' })),
    h('span', { class: 'sh-menu-btn__label' }, 'Menú'));
    state.menuBtn.addEventListener('click', function () {
      if (state.menuOpen) closeMenu();
      else openMenu();
    });

    state.bar = h('div', { class: 'sh-bar' },
      brand,
      nav,
      h('div', { class: 'sh-actions' }, state.themeBtn, state.menuBtn),
      state.indicator);
    el.appendChild(state.bar);

    // Hoja «Menú» (vidrio nivel A, 20px) y velo, en <body>.
    state.sheetLinks = NAV.map(function (s) {
      return h('a', { class: 'sh-sheet__link', href: '#' + s.id, 'data-section': s.id, 'data-testid': 'sh-sheet-' + s.id }, s.label);
    });
    state.sheet = h('div', {
      class: 'sh-sheet',
      id: sheetId,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Menú',
      'data-state': 'closed',
      'data-testid': 'sh-sheet'
    }, h('nav', { 'aria-label': 'Secciones' },
      h('ul', { class: 'sh-sheet__list', role: 'list' }, state.sheetLinks.map(function (a, i) {
        return h('li', { class: 'sh-sheet__item', style: { '--i': String(i) } }, a);
      }))));
    state.scrim = h('div', { class: 'sh-scrim', 'data-state': 'closed', 'aria-hidden': 'true' });
    state.sheet.hidden = true;
    state.scrim.hidden = true;
    state.scrim.addEventListener('click', function () { closeMenu(); });
    d.body.appendChild(state.scrim);
    d.body.appendChild(state.sheet);

    // Barra transparente sobre el inicio; vidrio en cuanto la página se desplaza.
    var sentinel = h('span', { class: 'sh-sentinel', 'aria-hidden': 'true' });
    d.body.insertBefore(sentinel, d.body.firstChild);
    var stopTop = function () {};
    if (typeof global.IntersectionObserver === 'function') {
      el.classList.add('is-at-top');
      stopTop = util.onVisible(sentinel, function (visible) { el.classList.toggle('is-at-top', visible); });
    }

    var stopSpy = setupSpy(el);
    var stopReading = keepReadingPosition();
    var stopSize = util.observeSize(state.bar, placeIndicator);
    if (d.fonts && d.fonts.ready && typeof d.fonts.ready.then === 'function') {
      d.fonts.ready.then(placeIndicator, function () {});
    }

    d.addEventListener('click', onDocClick);

    // Carga con #seccion (integrador): el navegador salta al ancla antes de que las secciones perezosas
    // crezcan, y la sección acababa cientos de píxeles más abajo. Tras «load» se alinea y se vigila.
    var initialId = '';
    try { initialId = decodeURIComponent((global.location && global.location.hash || '').slice(1)); } catch (err) { initialId = ''; }
    var onLoadAlign = null;
    if (IDS.indexOf(initialId) > 0) {
      onLoadAlign = function () {
        onLoadAlign = null;
        setTimeout(function () { if (state.header) scrollTo(initialId, { instant: true }); }, 0);
      };
      if (d.readyState === 'complete') onLoadAlign();
      else global.addEventListener('load', onLoadAlign);
    }

    var mq = typeof global.matchMedia === 'function' ? global.matchMedia(PHONE_QUERY) : null;
    var onMq = function () { if (!isPhone() && state.menuOpen) closeMenu({ restoreFocus: false }); };
    if (mq) {
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onMq);
      else if (typeof mq.addListener === 'function') mq.addListener(onMq);
    }

    var offs = [
      DSL.bus.on('theme:change', paintTheme),
      DSL.bus.on('tf:open', function () { scrollTo('transferencia', { focus: true }); }),
      DSL.bus.on('gallery:open', function () { scrollTo('galeria', { focus: true }); }),
      DSL.bus.on('concepts:open', function () { scrollTo('conceptos', { focus: true }); })
    ];
    paintTheme();

    return {
      destroy: function () {
        if (state.menuOpen) closeMenu({ restoreFocus: false });
        offs.forEach(function (off) { off(); });
        stopSpy();
        stopReading();
        stopSize();
        stopTop();
        d.removeEventListener('click', onDocClick);
        if (onLoadAlign) global.removeEventListener('load', onLoadAlign);
        if (mq) {
          if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onMq);
          else if (typeof mq.removeListener === 'function') mq.removeListener(onMq);
        }
        sentinel.remove();
        state.sheet.remove();
        state.scrim.remove();
        el.textContent = '';
        el.classList.remove('is-at-top');
        state.header = null;
        state.links = [];
        state.sheetLinks = [];
        state.indicator = null;
        state.bar = null;
        state.sheet = null;
        state.scrim = null;
        state.menuBtn = null;
        state.themeBtn = null;
        state.active = null;
      }
    };
  }

  /* ================================================================== pie */

  /** mountFooter(el) → { destroy }: cierre con la marca, nota de funcionamiento local y créditos. */
  function mountFooter(el) {
    var chartV = global.Chart && global.Chart.version ? ' ' + global.Chart.version : '';
    var katexV = global.katex && global.katex.version ? ' ' + global.katex.version : '';
    var credits = [
      ['Gráficas', 'Chart.js' + chartV, 'Licencia MIT'],
      ['Ecuaciones', 'KaTeX' + katexV, 'Licencia MIT'],
      ['Iconos', 'Lucide', 'Licencia ISC'],
      ['Tipografías', 'Bricolage Grotesque e IBM Plex Sans', 'SIL Open Font License 1.1']
    ];
    var root = h('div', { class: 'sh-footer', 'data-testid': 'sh-footer' },
      h('div', { class: 'sh-footer__lead' },
        h('p', { class: 'sh-footer__name' }, brandMark('sh-footer__mark'), h('span', null, 'Laboratorio de Sistemas Dinámicos')),
        h('p', { class: 'sh-footer__note' },
          'Simulador y centro de aprendizaje de sistemas dinámicos y funciones de transferencia. ',
          'Funciona sin conexión: cada simulación y cada cálculo se hacen en este navegador.')),
      h('div', { class: 'sh-footer__credits' },
        h('h2', { class: 'sh-footer__title' }, 'Créditos'),
        h('dl', { class: 'sh-credits', 'data-testid': 'sh-credits' }, credits.map(function (c) {
          return h('div', { class: 'sh-credit' },
            h('dt', null, c[0]),
            h('dd', null, h('span', { class: 'sh-credit__name' }, c[1]), h('span', { class: 'sh-credit__lic' }, c[2])));
        }))),
      h('a', { class: 'sh-footer__top', href: '#inicio', 'data-testid': 'sh-footer-top' }, icon('arrow-up', { size: 18 }), 'Volver al inicio'));
    el.appendChild(root);
    return {
      destroy: function () { el.textContent = ''; }
    };
  }

  DSL.ui.shell = {
    mountHeader: mountHeader,
    mountFooter: mountFooter,
    scrollTo: scrollTo,
    /** Sección activa según el scrollspy ('inicio', 'conceptos'…) o null antes del primer cálculo. */
    active: function () { return state.active; },
    /** Hoja «Menú»: abrir/cerrar por código (pruebas, atajos). */
    menu: {
      open: function () { openMenu(); },
      close: function (opts) { closeMenu(opts); },
      isOpen: function () { return state.menuOpen; }
    },
    SECTIONS: SECTIONS.map(function (s) { return { id: s.id, label: s.label, nav: s.nav !== false }; }),
    helpers: { pickActive: pickActive }
  };
})(window.DSL);
