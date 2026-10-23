/*
 * js/app.js — Propietario: design-system.
 * Arranque: al cargar el DOM prepara la capa de UI (DSL.ui.init: tooltips delegados, región viva,
 * data-motion) y monta cada [data-mount] en orden de documento, cada uno dentro de try/catch:
 *   shell-header / shell-footer → DSL.ui.shell.mountHeader / mountFooter (si existe DSL.ui.shell)
 *   cualquier otro nombre      → DSL.sections[nombre].mount(el)
 * Un fallo pinta en su lugar una tarjeta de error en español (límite de errores) y no detiene al resto.
 * Al terminar: DSL.app.ready = true, <html data-ready="true"> y evento 'app:ready' { mounted, failed }.
 * Contrato: docs/ARCHITECTURE.md §6. API: docs/api/shell.md.
 */
(function (DSL) {
  'use strict';
  var h = DSL.util.h;

  DSL.app.handles = DSL.app.handles || {};
  DSL.app.ready = false;

  var NAMES = {
    hero: 'Inicio',
    concepts: 'Conceptos',
    wizard: 'Modelado',
    gallery: 'Galería',
    bikeLab: 'Laboratorio de la bicicleta',
    tfengine: 'Función de transferencia',
    'shell-header': 'Barra superior',
    'shell-footer': 'Pie de página'
  };

  function renderError(el, name, err) {
    var detail = err && err.message ? err.message : String(err);
    var part = NAMES[name] ? '«' + NAMES[name] + '»' : '«' + name + '»';
    var icon = DSL.ui && typeof DSL.ui.icon === 'function' ? DSL.ui.icon('triangle-alert', { size: 20 }) : null;
    el.appendChild(h('div', { class: 'app-error', role: 'alert', 'data-testid': 'app-error-' + name },
      icon,
      h('div', null,
        h('strong', null, 'No se pudo cargar la parte ' + part + '.'),
        h('span', null, 'El resto de la página funciona. Recargue la página para intentarlo de nuevo. Detalle técnico (módulo «' + name + '»): ' + detail))));
  }

  function mountOne(el) {
    var name = el.getAttribute('data-mount');
    if (name === 'shell-header' || name === 'shell-footer') {
      var shell = DSL.ui.shell;
      if (!shell) return null;
      return name === 'shell-header' ? shell.mountHeader(el) : shell.mountFooter(el);
    }
    var section = DSL.sections[name];
    if (!section || typeof section.mount !== 'function') {
      throw new Error('el módulo no está disponible (DSL.sections.' + name + '.mount).');
    }
    return section.mount(el);
  }

  function initUi() {
    try {
      if (DSL.ui && typeof DSL.ui.init === 'function') DSL.ui.init(document);
      else if (DSL.ui.tooltips && typeof DSL.ui.tooltips.init === 'function') DSL.ui.tooltips.init(document);
    } catch (err) {
      console.error('[app] No se pudo preparar la capa de interfaz:', err);
    }
  }

  function start() {
    var mounted = [];
    var failed = [];
    initUi();
    var nodes = document.querySelectorAll('[data-mount]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var name = el.getAttribute('data-mount');
      try {
        var handle = mountOne(el);
        DSL.app.handles[name] = handle || {};
        mounted.push(name);
      } catch (err) {
        failed.push(name);
        renderError(el, name, err);
        console.error('[app] No se pudo montar «' + name + '»:', err);
      }
    }
    DSL.app.ready = true;
    document.documentElement.setAttribute('data-ready', 'true');
    DSL.bus.emit('app:ready', { mounted: mounted, failed: failed });
  }

  DSL.util.ready(start);
})(window.DSL);
