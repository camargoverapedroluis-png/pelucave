// tests/unit/ui.test.mjs — Propietario: design-system.
// Lógica de DSL.ui (components.js), DSL.ui.shell (shell.js) y el límite de errores de app.js
// sobre el DOM falso de tests/helpers/load.mjs. Ejecutar: node --test tests/unit/ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDSL, toPlain } from '../helpers/load.mjs';

const UI = ['js/ui/icons-data.js', 'js/ui/components.js'];
const SHELL = UI.concat(['js/ui/shell.js']);

function boot(options) {
  const r = loadDSL(UI, options);
  return { ...r, ui: r.DSL.ui, h: r.DSL.util.h };
}

function q(root, sel) {
  const el = root.querySelector(sel);
  assert.ok(el, `falta ${sel}`);
  return el;
}

/** Monta un nodo dentro de <body> (para isConnected y la delegación). */
function attach(document, node) {
  document.body.appendChild(node);
  return node;
}

/* ======================================================================= carga */

test('carga: components.js y shell.js solo definen funciones, sin errores ni avisos', () => {
  const { DSL, env } = loadDSL(SHELL);
  const names = ['icon', 'button', 'help', 'slider', 'segmented', 'tabs', 'tooltip', 'transport', 'toggle',
    'collapsible', 'card', 'chip', 'readout', 'toast', 'reveal', 'announce', 'init'];
  for (const n of names) assert.equal(typeof DSL.ui[n], 'function', `DSL.ui.${n}`);
  assert.equal(typeof DSL.ui.tooltips.init, 'function');
  assert.equal(typeof DSL.ui.shell.mountHeader, 'function');
  assert.equal(env.document.body.childNodes.length, 0, 'nada toca el DOM al cargar');
  assert.equal(env.pendingTimers(), 0);
  assert.equal(env.pendingFrames(), 0);
  assert.deepEqual(env.console.error, []);
  assert.deepEqual(env.console.warn, []);
});

/* ======================================================================= helpers puros */

test('helpers: sigRound, snapTo, decimalsOf y slug', () => {
  const { ui } = boot();
  const H = ui.helpers;
  assert.equal(H.sigRound(123456, 3), 123000);
  assert.equal(H.sigRound(0.0012345, 3), 0.00123);
  assert.equal(H.sigRound(0, 3), 0);
  assert.equal(H.snapTo(0.1 + 0.2, 0.1), 0.3);
  assert.equal(H.snapTo(2.26, 0.5, 0), 2.5);
  assert.equal(H.snapTo(0.37, 0.1, 0.05), 0.35);
  assert.equal(H.decimalsOf(0.25), 2);
  assert.equal(H.decimalsOf(1e-7), 7);
  assert.equal(H.decimalsOf(3), 0);
  assert.equal(H.slug(0.25), '0-25');
  assert.equal(H.slug('Escalón'), 'escalon');
  assert.equal(H.slug('RK45 adaptativo'), 'rk45-adaptativo');
  assert.equal(H.slug('***'), 'x');
});

test('place(): lado preferido, cambio al opuesto y ajuste dentro de la ventana', () => {
  const { ui } = boot();
  const place = (o) => toPlain(ui.helpers.place(o));
  const vp = { width: 1000, height: 800 };
  const t = { width: 100, height: 30 };
  // Arriba, centrado sobre el ancla.
  assert.deepEqual(place({ anchor: { top: 100, left: 100, width: 20, height: 20 }, tip: t, viewport: vp }),
    { top: 62, left: 60, side: 'top' });
  // Sin sitio arriba: abajo.
  assert.deepEqual(place({ anchor: { top: 10, left: 100, width: 20, height: 20 }, tip: t, viewport: vp }),
    { top: 38, left: 60, side: 'bottom' });
  // Pegado al borde derecho: se ajusta a margin.
  assert.deepEqual(place({ anchor: { top: 100, left: 985, width: 10, height: 20 }, tip: t, viewport: vp }),
    { top: 62, left: 892, side: 'top' });
  // A la derecha sin sitio: a la izquierda.
  const r = place({ anchor: { top: 400, left: 950, width: 20, height: 20 }, tip: t, viewport: vp, side: 'right' });
  assert.equal(r.side, 'left');
  assert.equal(r.left, 950 - 8 - 100);
  assert.equal(r.top, 400 + 10 - 15);
  // Ventana estrecha: ni izquierda ni derecha → arriba o abajo (el lado con más espacio).
  const n = place({ anchor: { top: 600, left: 60, width: 20, height: 20 }, tip: { width: 200, height: 30 }, viewport: { width: 280, height: 800 }, side: 'left' });
  assert.equal(n.side, 'top');
  assert.ok(n.left >= 8 && n.left + 200 <= 280 - 8 + 1e-9);
  // offset y margin personalizados.
  assert.deepEqual(place({ anchor: { top: 100, left: 100, width: 20, height: 20 }, tip: t, viewport: vp, side: 'bottom', offset: 4 }),
    { top: 124, left: 60, side: 'bottom' });
});

test('makeScale: escala logarítmica de 60 posiciones por década y 3 cifras significativas', () => {
  const { ui } = boot();
  const sc = ui.helpers.makeScale(1, 1000, 0, 'log');
  assert.equal(sc.posMin, 0);
  assert.equal(sc.posMax, 180);
  assert.equal(sc.fromPos(0), 1);
  assert.equal(sc.fromPos(180), 1000);
  assert.equal(sc.fromPos(60), 10);
  assert.equal(sc.fromPos(96), 39.8);
  assert.equal(sc.toPos(40), 96);
  assert.equal(sc.snap(5000), 1000);
  assert.equal(sc.nudge(10, 1), 10.4);
  assert.equal(ui.helpers.makeScale(0.1, 1, 0, 'log').posMax, 100, 'al menos 100 posiciones');
  assert.throws(() => ui.helpers.makeScale(0, 10, 0, 'log'), /logarítmica/);
  const lin = ui.helpers.makeScale(0, 2, 0.25, 'linear');
  assert.equal(lin.snap(1.3), 1.25);
  assert.equal(lin.snap(-4), 0);
  assert.equal(lin.nudge(2, 1), 2);
  assert.equal(ui.helpers.makeScale(0, 2, 0, 'linear').posStep, 'any');
});

/* ======================================================================= icon, button, help */

test('icon: decorativo por defecto, con nombre si hay label, y un aviso por nombre desconocido', () => {
  const { ui, env } = boot();
  const a = ui.icon('play');
  assert.equal(a.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(a.getAttribute('data-icon'), 'play');
  assert.equal(a.getAttribute('aria-hidden'), 'true');
  assert.equal(a.getAttribute('width'), '20');
  assert.ok(a.innerHTML.length > 10, 'marcado de Lucide');
  assert.ok(a.classList.contains('ds-icon'));
  const b = ui.icon('sun', { label: 'Tema claro', size: 16, className: 'x' });
  assert.equal(b.getAttribute('role'), 'img');
  assert.equal(b.getAttribute('aria-label'), 'Tema claro');
  assert.equal(b.getAttribute('aria-hidden'), null);
  assert.ok(b.classList.contains('x'));
  ui.icon('no-existe');
  ui.icon('no-existe');
  assert.equal(env.console.warn.length, 1);
  assert.match(env.console.warn[0][0], /Icono desconocido: «no-existe»/);
});

test('button: variantes, conmutador aria-pressed, tooltip accesible y nombre del botón de icono', () => {
  const { ui, env } = boot();
  const p = ui.button({ label: 'Simular', icon: 'play', variant: 'primary', testid: 'b1' });
  assert.equal(p.getAttribute('type'), 'button');
  assert.ok(p.classList.contains('ds-btn--primary'));
  assert.equal(p.getAttribute('data-testid'), 'b1');
  assert.equal(q(p, '.ds-btn__label').textContent, 'Simular');
  assert.equal(ui.button({ label: 'x', variant: 'raro' }).classList.contains('ds-btn--secondary'), true);

  const calls = [];
  const t = ui.button({ label: 'Ver datos', pressed: false, onClick: (e, on) => calls.push(on) });
  assert.equal(t.getAttribute('aria-pressed'), 'false');
  t.click();
  t.click();
  assert.deepEqual(calls, [true, false]);
  assert.equal(t.getAttribute('aria-pressed'), 'false');

  const i = ui.button({ icon: 'rotate-ccw', iconOnly: true, ariaLabel: 'Reiniciar', title: 'Reiniciar', size: 'sm' });
  assert.equal(i.getAttribute('aria-label'), 'Reiniciar');
  assert.equal(i.getAttribute('data-tip'), 'Reiniciar');
  assert.equal(i.getAttribute('title'), null, 'sin title nativo');
  assert.ok(i.classList.contains('ds-btn--icon') && i.classList.contains('ds-btn--sm'));
  assert.equal(i.querySelector('.ds-btn__label'), null);
  assert.equal(ui.button({ label: 'x', disabled: true }).hasAttribute('disabled'), true);
  ui.button({ icon: 'x', iconOnly: true });
  assert.match(env.console.warn[0][0], /ariaLabel/);
});

test('help: botón «?» con nombre accesible y data-tip', () => {
  const { ui } = boot();
  const b = ui.help('Mide la energía disipada.', { label: 'Amortiguamiento', testid: 'hz', side: 'right' });
  assert.equal(b.getAttribute('aria-label'), 'Explicación de «Amortiguamiento»');
  assert.equal(b.getAttribute('data-tip'), 'Mide la energía disipada.');
  assert.equal(b.getAttribute('data-tip-side'), 'right');
  assert.equal(b.getAttribute('data-testid'), 'hz');
  assert.equal(q(b, 'svg').getAttribute('data-icon'), 'circle-help');
});

/* ======================================================================= slider */

function massSlider(ui, extra = {}) {
  const log = [];
  const s = ui.slider({
    label: 'Masa', symbol: 'm', unit: 'kg', min: 0.1, max: 10, step: 0.1, value: 1, testid: 'm',
    tooltip: 'Inercia del bloque.',
    onInput: (v, o) => log.push(['input', v, o.final]),
    onChange: (v) => log.push(['change', v]),
    ...extra,
  });
  return { s, log };
}

test('slider: estructura, textos accesibles y posición --pos', () => {
  const { ui } = boot();
  const { s } = massSlider(ui);
  const el = s.el;
  assert.equal(s.value, 1);
  assert.equal(s.input.getAttribute('type'), 'range');
  assert.equal(s.input.getAttribute('min'), '0.1');
  assert.equal(s.input.getAttribute('max'), '10');
  assert.equal(s.input.getAttribute('step'), '0.1');
  assert.equal(s.input.value, '1');
  assert.equal(s.input.getAttribute('aria-valuetext'), '1.0\u00a0kg');
  assert.equal(q(el, '[data-testid="m-value"]').textContent, '1.0\u00a0kg');
  assert.equal(q(el, '[data-testid="m-number"]').value, '1.0');
  assert.equal(q(el, '[data-testid="m-number"]').getAttribute('aria-label'), 'Masa en kg');
  assert.equal(q(el, 'label').getAttribute('for'), s.input.id);
  assert.equal(q(el, '.ds-sym').textContent, 'm');
  assert.equal(q(el, '[data-testid="m-help"]').getAttribute('aria-label'), 'Explicación de «Masa»');
  const desc = s.input.getAttribute('aria-describedby');
  assert.equal(q(el, '#' + desc).textContent, 'Inercia del bloque.');
  assert.equal(el.style.getPropertyValue('--pos'), String(Math.round((0.9 / 9.9) * 10000) / 10000));
  const reset = q(el, '[data-testid="m-reset"]');
  assert.equal(reset.disabled, true, 'restablecer desactivado en el valor inicial');
  assert.equal(reset.getAttribute('aria-label'), 'Restablecer «Masa» a 1.0\u00a0kg');
});

test('slider: arrastre agrupado en un frame (final:false) y confirmación con change', () => {
  const { ui, env } = boot();
  const { s, log } = massSlider(ui);
  s.input.value = '2.3';
  env.fire(s.input, 'input');
  s.input.value = '2.5';
  env.fire(s.input, 'input');
  assert.deepEqual(log, [], 'nada antes del frame');
  assert.equal(q(s.el, '[data-testid="m-value"]').textContent, '2.5\u00a0kg', 'la burbuja sigue al instante');
  env.frame();
  assert.deepEqual(log, [['input', 2.5, false]]);
  env.fire(s.input, 'change');
  assert.deepEqual(log[1], ['change', 2.5]);
  assert.equal(q(s.el, '[data-testid="m-reset"]').disabled, false);
  assert.ok(s.el.classList.contains('is-dirty'));
  env.fire(s.input, 'pointerdown');
  assert.ok(s.el.classList.contains('is-dragging'));
  env.fire(env.window, 'pointerup');
  assert.ok(!s.el.classList.contains('is-dragging'));
});

test('slider: campo numérico con coma, límites, error accesible, Esc y flechas', () => {
  const { ui, env } = boot();
  const { s, log } = massSlider(ui);
  const num = q(s.el, '[data-testid="m-number"]');
  num.value = '2,5';
  env.fire(num, 'input');
  env.fire(num, 'keydown', { key: 'Enter' });
  assert.equal(s.value, 2.5);
  assert.deepEqual(log.pop(), ['change', 2.5]);
  assert.equal(num.value, '2.5');

  num.value = '50';
  env.fire(num, 'keydown', { key: 'Enter' });
  assert.equal(s.value, 10, 'se ajusta al máximo');
  assert.deepEqual(log.pop(), ['change', 10]);

  num.value = '1,2,3';
  env.fire(num, 'keydown', { key: 'Enter' });
  assert.equal(s.value, 10);
  assert.equal(num.getAttribute('aria-invalid'), 'true');
  const err = q(s.el, '.ds-slider__error');
  // Región viva persistente (FND-17): role="alert", vacía mientras no hay error.
  assert.equal(err.getAttribute('role'), 'alert');
  assert.notEqual(err.hidden, true);
  assert.match(err.textContent, /entre 0\.1 y 10 kg\. Se acepta la coma decimal\./);
  assert.ok(s.el.classList.contains('is-invalid'));
  assert.equal(num.getAttribute('aria-describedby'), err.id);
  env.fire(num, 'blur');
  assert.equal(num.getAttribute('aria-invalid'), null);
  assert.equal(err.textContent, '', 'sin error la región queda vacía');
  assert.ok(!s.el.classList.contains('is-invalid'));
  assert.equal(num.value, '10.0', 'al salir vuelve al último valor válido');

  num.value = '7';
  env.fire(num, 'input');
  env.fire(num, 'keydown', { key: 'Escape' });
  assert.equal(num.value, '10.0');
  assert.equal(s.value, 10);

  log.length = 0;
  env.fire(num, 'keydown', { key: 'ArrowDown' });
  assert.equal(s.value, 9.9);
  env.fire(num, 'keydown', { key: 'ArrowDown', shiftKey: true });
  assert.equal(s.value, 8.9);
  assert.deepEqual(log, [['change', 9.9], ['change', 8.9]]);
  env.fire(num, 'keydown', { key: 'ArrowUp', shiftKey: true });
  env.fire(num, 'keydown', { key: 'ArrowUp', shiftKey: true });
  assert.equal(s.value, 10, 'no pasa del máximo');
  assert.equal(log.length, 4, 'en el tope no repite onChange');
  // Un valor igual no dispara onChange.
  num.value = '10';
  env.fire(num, 'keydown', { key: 'Enter' });
  assert.equal(log.length, 4);
});

test('slider: set, reset, setRange, setDisabled, sin onChange y destroy', () => {
  const { ui, env } = boot();
  const { s, log } = massSlider(ui);
  s.set(3.04, { silent: true });
  assert.equal(s.value, 3);
  assert.deepEqual(log, []);
  s.set(4);
  assert.deepEqual(log, [['change', 4]]);
  q(s.el, '[data-testid="m-reset"]').click();
  assert.equal(s.value, 1);
  assert.deepEqual(log[1], ['change', 1]);
  assert.equal(s.set('abc'), 1, 'texto no numérico se ignora');

  s.set(8, { silent: true });
  s.setRange({ min: 0, max: 5, step: 0.5 });
  assert.equal(s.value, 5);
  assert.equal(s.input.getAttribute('max'), '5');
  assert.equal(s.input.getAttribute('step'), '0.5');
  assert.throws(() => s.setRange({ min: 6 }), /mayor/);

  s.setDisabled(true);
  assert.equal(s.input.disabled, true);
  assert.equal(q(s.el, '[data-testid="m-number"]').disabled, true);
  assert.equal(q(s.el, '[data-testid="m-reset"]').disabled, true);
  assert.ok(s.el.classList.contains('is-disabled'));

  // Sin onChange: la confirmación llega como onInput(v, { final: true }).
  const only = [];
  const t = ui.slider({ label: 'Paso', min: 0, max: 1, step: 0.01, value: 0.1, numberField: false, testid: 't', onInput: (v, o) => only.push([v, o.final]) });
  assert.equal(q(t.el, '[data-testid="t-readout"]').textContent, '0.10');
  assert.equal(t.el.querySelector('[data-testid="t-number"]'), null);
  t.input.value = '0.5';
  env.fire(t.input, 'change');
  assert.deepEqual(only, [[0.5, true]]);

  // destroy cancela el frame pendiente.
  t.input.value = '0.7';
  env.fire(t.input, 'input');
  attach(env.document, t.el);
  t.destroy();
  env.frame();
  assert.deepEqual(only, [[0.5, true]]);
  assert.equal(t.el.parentNode, null);
  assert.throws(() => ui.slider({ label: 'x', min: 2, max: 1 }), /mayor/);
});

test('slider logarítmico: posiciones enteras y valores a 3 cifras', () => {
  const { ui, env } = boot();
  const seen = [];
  const k = ui.slider({ label: 'Rigidez', symbol: 'k', unit: 'N/m', min: 1, max: 1000, value: 40, scale: 'log', testid: 'k', onChange: (v) => seen.push(v) });
  assert.equal(k.input.getAttribute('min'), '0');
  assert.equal(k.input.getAttribute('max'), '180');
  assert.equal(k.input.getAttribute('step'), '1');
  assert.equal(k.input.value, '96');
  assert.equal(q(k.el, '[data-testid="k-value"]').textContent, '40\u00a0N/m');
  k.input.value = '180';
  env.fire(k.input, 'change');
  assert.equal(k.value, 1000);
  k.input.value = '60';
  env.fire(k.input, 'change');
  assert.equal(k.value, 10);
  const num = q(k.el, '[data-testid="k-number"]');
  num.value = '0,5';
  env.fire(num, 'keydown', { key: 'Enter' });
  assert.equal(k.value, 1);
  num.value = '123456';
  env.fire(num, 'keydown', { key: 'Enter' });
  assert.equal(k.value, 1000);
  num.value = '47,13';
  env.fire(num, 'keydown', { key: 'Enter' });
  assert.equal(k.value, 47.1);
  assert.deepEqual(seen, [1000, 10, 1, 1000, 47.1]);
});

/* ======================================================================= segmented y tabs */

test('segmented: radiogroup con tabindex itinerante, flechas con vuelta, Home/End y set silencioso', () => {
  const { ui, env } = boot();
  const got = [];
  const seg = ui.segmented({
    label: 'Entrada', value: 'pulso', testid: 'in', onChange: (v) => got.push(v),
    options: [{ value: 'escalon', label: 'Escalón' }, { value: 'pulso', label: 'Pulso' }, { value: 'senoidal', label: 'Senoidal', title: 'Seno de amplitud 1' }],
  });
  attach(env.document, seg.el);
  assert.equal(seg.el.getAttribute('role'), 'radiogroup');
  assert.equal(seg.el.getAttribute('aria-label'), 'Entrada');
  const [a, b, c] = seg.el.querySelectorAll('[role="radio"]');
  assert.equal(a.getAttribute('data-testid'), 'in-escalon');
  assert.equal(c.getAttribute('data-tip'), 'Seno de amplitud 1');
  const state = () => [a, b, c].map((x) => x.getAttribute('aria-checked') + ':' + x.getAttribute('tabindex'));
  assert.deepEqual(state(), ['false:-1', 'true:0', 'false:-1']);
  assert.equal(seg.value, 'pulso');

  env.fire(b, 'keydown', { key: 'ArrowRight' });
  assert.deepEqual(state(), ['false:-1', 'false:-1', 'true:0']);
  assert.equal(env.document.activeElement, c);
  env.fire(c, 'keydown', { key: 'ArrowRight' });
  assert.equal(seg.value, 'escalon', 'vuelve al principio');
  assert.equal(env.document.activeElement, a);
  env.fire(a, 'keydown', { key: 'ArrowUp' });
  assert.equal(seg.value, 'senoidal');
  env.fire(c, 'keydown', { key: 'Home' });
  env.fire(a, 'keydown', { key: 'End' });
  const ev = env.fire(c, 'keydown', { key: 'x' });
  assert.equal(ev, true, 'otras teclas no se consumen');
  assert.deepEqual(got, ['senoidal', 'escalon', 'senoidal', 'escalon', 'senoidal']);

  seg.set('pulso', { silent: true });
  assert.equal(seg.value, 'pulso');
  assert.equal(got.length, 5);
  b.click();
  assert.equal(got.length, 5, 'pulsar la opción actual no repite onChange');
  a.click();
  assert.deepEqual(got.slice(-1), ['escalon']);
  seg.set('no-existe');
  assert.equal(seg.value, 'escalon');
  assert.throws(() => ui.segmented({ options: [] }), /al menos una opción/);
});

test('segmented: la pastilla se coloca con --seg-x/--seg-w al medir y luego queda lista', () => {
  const { ui, env } = boot();
  const seg = ui.segmented({ value: 0.5, testid: 'sp', options: [{ value: 0.25, label: '0.25×' }, { value: 0.5, label: '0.5×' }] });
  const [o1, o2] = seg.el.querySelectorAll('[role="radio"]');
  assert.equal(o1.getAttribute('data-testid'), 'sp-0-25');
  o1.offsetLeft = 4; o1.offsetWidth = 60;
  o2.offsetLeft = 64; o2.offsetWidth = 58;
  env.resize(seg.el, 130, 40);
  env.frame();
  const thumb = q(seg.el, '.ds-seg__thumb');
  assert.equal(thumb.style.getPropertyValue('--seg-x'), '64px');
  assert.equal(thumb.style.getPropertyValue('--seg-w'), '58px');
  assert.ok(!seg.el.classList.contains('is-ready'), 'la primera colocación no anima');
  env.frame();
  assert.ok(seg.el.classList.contains('is-ready'));
  seg.set(0.25);
  assert.equal(thumb.style.getPropertyValue('--seg-x'), '4px');
  seg.destroy();
});

test('tabs: patrón ARIA, activación automática con flechas y paneles', () => {
  const { ui, env, h } = boot();
  const got = [];
  const t = ui.tabs({
    label: 'Gráficas', value: 'polos', testid: 'g', onChange: (id) => got.push(id),
    tabs: [
      { id: 'paso', label: 'Respuesta al escalón', icon: 'chart-spline', panel: h('div', null, 'P1') },
      { id: 'polos', label: 'Polos y ceros', panel: h('div', { id: 'mi-panel' }, 'P2') },
      { id: 'bode', label: 'Bode', panel: h('div', null, 'P3') },
    ],
  });
  attach(env.document, t.el);
  assert.equal(t.tablist.getAttribute('role'), 'tablist');
  assert.equal(t.tablist.getAttribute('aria-label'), 'Gráficas');
  const tabsEls = t.el.querySelectorAll('[role="tab"]');
  const panels = t.el.querySelectorAll('[role="tabpanel"]');
  assert.equal(tabsEls.length, 3);
  assert.equal(panels.length, 3);
  assert.equal(panels[1].id, 'mi-panel', 'conserva el id del panel');
  tabsEls.forEach((b, i) => {
    assert.equal(b.getAttribute('aria-controls'), panels[i].id);
    assert.equal(panels[i].getAttribute('aria-labelledby'), b.id);
  });
  const vis = () => panels.map((p) => !p.hidden);
  assert.deepEqual(vis(), [false, true, false]);
  assert.equal(tabsEls[1].getAttribute('tabindex'), '0');
  assert.equal(tabsEls[0].getAttribute('data-testid'), 'g-paso');

  env.fire(tabsEls[1], 'keydown', { key: 'ArrowLeft' });
  assert.equal(t.value, 'paso');
  assert.equal(env.document.activeElement, tabsEls[0]);
  assert.deepEqual(vis(), [true, false, false]);
  env.fire(tabsEls[0], 'keydown', { key: 'ArrowLeft' });
  assert.equal(t.value, 'bode', 'vuelta al final');
  env.fire(tabsEls[2], 'keydown', { key: 'Home' });
  env.fire(tabsEls[0], 'keydown', { key: 'End' });
  assert.deepEqual(got, ['paso', 'bode', 'paso', 'bode']);
  t.select('polos', { silent: true });
  assert.equal(got.length, 4);
  assert.deepEqual(vis(), [false, true, false]);
  tabsEls[0].click();
  assert.deepEqual(got.slice(-1), ['paso']);
  assert.equal(env.document.activeElement, tabsEls[2], 'el clic no mueve el foco por código');
  // Indicador
  tabsEls[0].offsetLeft = 0; tabsEls[0].offsetWidth = 180;
  env.resize(t.tablist, 500, 44);
  env.frame();
  const ind = q(t.el, '.ds-tabs__indicator');
  assert.equal(ind.style.getPropertyValue('--tab-x'), '0px');
  assert.equal(ind.style.getPropertyValue('--tab-s'), '1.8');
});

/* ======================================================================= toggle, collapsible, card, chip */

test('toggle: role=switch con aria-checked y descripción', () => {
  const { ui } = boot();
  const got = [];
  const t = ui.toggle({ label: 'Realimentación', description: 'Cierra el lazo.', testid: 'fb', onChange: (v) => got.push(v) });
  assert.equal(t.button.getAttribute('role'), 'switch');
  assert.equal(t.button.getAttribute('aria-checked'), 'false');
  assert.equal(q(t.el, '.ds-toggle__label').textContent, 'Realimentación');
  const desc = t.button.getAttribute('aria-describedby');
  assert.equal(q(t.el, '#' + desc).textContent, 'Cierra el lazo.');
  t.button.click();
  assert.equal(t.checked, true);
  assert.equal(t.button.getAttribute('aria-checked'), 'true');
  t.set(false, { silent: true });
  t.set(false);
  assert.deepEqual(got, [true]);
  t.set(true);
  assert.deepEqual(got, [true, true]);
});

test('collapsible: encabezado con botón aria-expanded que controla la región', () => {
  const { ui, h } = boot();
  const got = [];
  const c = ui.collapsible({ title: 'Ley física', number: 1, headingLevel: 4, content: h('p', null, 'Newton'), testid: 's1', onToggle: (v) => got.push(v) });
  const btn = q(c.el, '[data-testid="s1-toggle"]');
  const region = q(c.el, '[data-testid="s1-region"]');
  assert.equal(btn.parentNode.tagName, 'H4');
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
  assert.equal(btn.getAttribute('aria-controls'), region.id);
  assert.equal(q(btn, '.ds-collapse__num').textContent, '1');
  assert.ok(c.el.classList.contains('ds-collapse--numbered'));
  btn.click();
  assert.equal(c.isOpen(), true);
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  assert.ok(c.el.classList.contains('is-open'));
  c.open();
  c.close();
  c.toggle();
  assert.deepEqual(got, [true, false, true]);
  c.setContent(['Texto ', h('strong', null, 'nuevo')]);
  assert.equal(region.textContent, 'Texto nuevo');
  assert.equal(ui.collapsible({ title: 'x', headingLevel: 9 }).el.querySelector('h6') !== null, true);
});

test('card y chip: niveles de encabezado, reflejo opcional y tono con texto', () => {
  const { ui, h } = boot();
  const c = ui.card({ title: 'Linealidad', icon: 'sigma', body: h('p', null, 'Superposición'), footer: 'Pie', spotlight: true, interactive: true, headingLevel: 2, testid: 'c' });
  assert.equal(c.tagName, 'ARTICLE');
  assert.equal(c.getAttribute('data-spotlight'), '');
  assert.ok(c.classList.contains('ds-card--interactive'));
  assert.equal(q(c, 'h2').textContent, 'Linealidad');
  assert.equal(q(c, '.ds-card__foot').textContent, 'Pie');
  assert.equal(ui.card({ body: 'x', as: 'div' }).getAttribute('data-spotlight'), null);

  const ch = ui.chip({ label: 'Estable', tone: 'success', icon: 'check', title: 'Polos en el semiplano izquierdo', testid: 'ok' });
  assert.ok(ch.classList.contains('ds-chip--success'));
  assert.equal(ch.getAttribute('data-tip'), 'Polos en el semiplano izquierdo');
  assert.equal(q(ch, '.sr-only').textContent, ' (Polos en el semiplano izquierdo)');
  assert.equal(q(ch, '.ds-chip__label').textContent, 'Estable');
  assert.ok(ui.chip({ label: 'x', tone: 'morado' }).classList.contains('ds-chip--neutral'));
});

/* ======================================================================= readout */

test('readout: formato con punto decimal, signo menos, unidad, guion para vacío y región viva opcional', () => {
  const { ui } = boot();
  const r = ui.readout({ label: 'Frecuencia natural', value: 3.1623, unit: 'rad/s', testid: 'wn' });
  const num = q(r.el, '[data-testid="wn-value"]');
  assert.equal(num.textContent, '3.16');
  // La unidad no lleva espacio delante (no sangra al bajar de l\u00ednea); un espacio normal entre la cifra y
  // la unidad, fuera de ambas, mantiene \u00ab3.16 rad/s\u00bb para textContent y los lectores (auditor\u00eda, ronda 2).
  const value = q(r.el, '.ds-readout__value');
  assert.equal(q(r.el, '.ds-readout__unit').textContent, 'rad/s');
  assert.equal(value.textContent, '3.16 rad/s');
  assert.equal(r.el.getAttribute('aria-live'), null);
  r.set(-0.5);
  assert.equal(num.textContent, '−0.5');
  r.set(12345.678, { unit: 'Hz' });
  assert.equal(num.textContent, '12346', 'formatNumber no recorta la parte entera');
  assert.equal(q(r.el, '.ds-readout__unit').textContent, 'Hz');
  assert.equal(value.textContent, '12346 Hz');
  r.set(4, { unit: '' });
  assert.equal(value.textContent, '4', 'sin unidad no queda separador');
  r.set(4, { unit: 'Hz' });
  assert.equal(value.textContent, '4 Hz', 'la misma cifra con otra unidad se vuelve a escribir');
  r.set(2e-6);
  assert.equal(num.textContent, '2×10⁻⁶');
  r.set(null);
  assert.equal(num.textContent, '—');
  r.set('Calculando…');
  assert.equal(num.textContent, 'Calculando…');
  const l = ui.readout({ label: 'R0', value: 2.5, live: true, digits: 2, layout: 'inline', tone: 'accent' });
  assert.equal(l.el.getAttribute('role'), 'status');
  assert.equal(l.el.getAttribute('aria-live'), 'polite');
  assert.ok(l.el.classList.contains('ds-readout--inline') && l.el.classList.contains('ds-readout--accent'));
  assert.equal(q(l.el, '.ds-readout__num').textContent, '2.5');
});

test('readout: símbolo con KaTeX si existe (strict ignore) y texto plano si no', () => {
  const calls = [];
  const katex = { render: (tex, el, o) => { calls.push([tex, o.strict, o.throwOnError]); el.textContent = 'K:' + tex; } };
  const { ui } = boot({ globals: { katex } });
  const r = ui.readout({ label: 'Amortiguamiento', tex: '\\zeta', value: 0.354 });
  assert.equal(q(r.el, '.ds-readout__sym').textContent, 'K:\\zeta');
  assert.deepEqual(calls, [['\\zeta', 'ignore', false]]);
  const plain = boot().ui.readout({ label: 'x', tex: '\\tau', value: 1 });
  assert.equal(q(plain.el, '.ds-readout__sym').textContent, '\\tau');
  assert.equal(q(plain.el, '.ds-readout__sym').getAttribute('aria-hidden'), 'true');
});

/* ======================================================================= transport */

test('transport: reproducir/pausar con un solo botón, reinicio, velocidad y tiempo', () => {
  const { ui, env } = boot();
  const log = [];
  const tr = ui.transport({
    testidPrefix: 'sim',
    onPlay: () => log.push('play'), onPause: () => log.push('pause'),
    onReset: () => log.push('reset'), onSpeed: (x) => log.push('speed:' + x),
  });
  attach(env.document, tr.el);
  const play = q(tr.el, '[data-testid="sim-play"]');
  assert.equal(tr.el.getAttribute('role'), 'group');
  assert.equal(tr.el.getAttribute('aria-label'), 'Controles de la simulación');
  assert.equal(play.getAttribute('aria-label'), 'Reproducir');
  assert.equal(play.getAttribute('data-state'), 'paused');
  play.click();
  assert.equal(tr.playing, true);
  assert.equal(play.getAttribute('aria-label'), 'Pausar');
  assert.equal(play.getAttribute('data-tip'), 'Pausar');
  assert.equal(play.getAttribute('data-state'), 'playing');
  play.click();
  assert.deepEqual(log, ['play', 'pause']);

  const reset = q(tr.el, '[data-testid="sim-reset"]');
  assert.equal(reset.getAttribute('aria-label'), 'Reiniciar');
  reset.click();
  assert.ok(reset.classList.contains('is-spinning'));
  env.fire(reset, 'animationend');
  assert.ok(!reset.classList.contains('is-spinning'));

  const labels = tr.el.querySelectorAll('.ds-seg__label').map((x) => x.textContent);
  assert.deepEqual(labels, ['0.25×', '0.5×', '1×', '2×', '4×']);
  assert.equal(tr.speed, 1);
  q(tr.el, '[data-testid="sim-speed-2"]').click();
  assert.equal(tr.speed, 2);
  tr.setSpeed(0.25);
  assert.equal(tr.speed, 0.25);
  assert.equal(q(tr.el, '[data-testid="sim-speed-0-25"]').getAttribute('aria-checked'), 'true');
  assert.deepEqual(log.slice(2), ['reset', 'speed:2'], 'setSpeed es silencioso');

  const time = q(tr.el, '[data-testid="sim-time"]');
  assert.equal(time.getAttribute('role'), 'timer');
  assert.equal(q(time, '.ds-transport__tv').textContent, '0.00');
  tr.setTime(1.23456);
  assert.equal(q(time, '.ds-transport__tv').textContent, '1.23');
  assert.equal(q(time, '.ds-transport__tu').textContent, 's');
  tr.setPlaying(true);
  assert.equal(play.getAttribute('aria-label'), 'Pausar');
  assert.equal(log.length, 4, 'setPlaying no llama a onPlay');
  tr.destroy();
  assert.equal(tr.el.parentNode, null);
});

test('transport: con movimiento reducido el reinicio no gira', () => {
  const { ui } = boot({ media: { '(prefers-reduced-motion: reduce)': true } });
  const tr = ui.transport({ testidPrefix: 'x', timeUnit: '', timeDecimals: 1 });
  const reset = q(tr.el, '[data-testid="x-reset"]');
  reset.click();
  assert.ok(!reset.classList.contains('is-spinning'));
  assert.equal(tr.el.querySelector('.ds-transport__tu'), null);
  tr.setTime(2);
  assert.equal(q(tr.el, '.ds-transport__tv').textContent, '2.0');
});

/* ======================================================================= announce, toast */

test('announce: región viva compartida que vuelve a anunciar el mismo texto', () => {
  const { ui, env } = boot();
  ui.announce('Paso 2 de 4');
  const live = q(env.document.body, '[data-testid="ds-live"]');
  assert.equal(live.getAttribute('role'), 'status');
  assert.equal(live.getAttribute('aria-live'), 'polite');
  assert.equal(live.textContent, '', 'se vacía primero');
  env.tick(119);
  assert.equal(live.textContent, '');
  env.tick(1);
  assert.equal(live.textContent, 'Paso 2 de 4');
  ui.announce('Paso 2 de 4');
  assert.equal(live.textContent, '');
  env.tick(60);
  assert.equal(live.textContent, 'Paso 2 de 4');
  assert.equal(env.document.body.querySelectorAll('[data-testid="ds-live"]').length, 1);
});

test('toast: temporizador, pausa con el puntero, acción, cierre y máximo de tres', () => {
  const { ui, env } = boot();
  const t = ui.toast('Parámetros restablecidos.', { duration: 1000, testid: 'tt', action: { label: 'Deshacer', onClick: () => undone.push(1) } });
  const undone = [];
  const host = q(env.document.body, '.ds-toasts');
  assert.equal(host.tagName, 'SECTION');
  assert.equal(host.getAttribute('aria-label'), 'Avisos');
  assert.equal(t.el.getAttribute('data-state'), 'open');
  assert.equal(q(t.el, '.ds-toast__msg').textContent, 'Parámetros restablecidos.');
  assert.equal(q(t.el, '[data-testid="tt-close"]').getAttribute('aria-label'), 'Cerrar aviso');
  env.tick(400);
  env.fire(t.el, 'pointerenter');
  env.tick(5000);
  assert.equal(t.el.getAttribute('data-state'), 'open', 'pausado con el puntero encima');
  env.fire(t.el, 'pointerleave');
  env.tick(799);
  assert.equal(t.el.getAttribute('data-state'), 'open', 'al menos 800 ms tras reanudar');
  env.tick(1);
  assert.equal(t.el.getAttribute('data-state'), 'exit');
  env.tick(180);
  assert.equal(t.el.parentNode, null);
  assert.equal(q(env.document.body, '[data-testid="ds-live"]').textContent, 'Parámetros restablecidos.');

  const a = ui.toast('Con aT > 2 la iteración diverge.', { tone: 'warning', duration: 0, testid: 'w', action: { label: 'Deshacer', onClick: () => undone.push(2) } });
  assert.ok(a.el.classList.contains('ds-toast--warning'));
  assert.equal(q(a.el, '.ds-toast__icon').getAttribute('data-icon'), 'triangle-alert');
  env.tick(60000);
  assert.equal(a.el.getAttribute('data-state'), 'open', 'duration 0: no se cierra solo');
  q(a.el, '[data-testid="w-action"]').click();
  assert.deepEqual(undone, [2]);
  assert.equal(a.el.getAttribute('data-state'), 'exit');

  const many = [1, 2, 3, 4].map((i) => ui.toast('Aviso ' + i, { duration: 0 }));
  assert.equal(many[0].el.getAttribute('data-state'), 'exit');
  assert.ok(many.slice(1).every((x) => x.el.getAttribute('data-state') === 'open'));
  q(many[3].el, '.ds-toast__close').click();
  assert.equal(many[3].el.getAttribute('data-state'), 'exit');
  many[3].dismiss();
  env.tick(200);
  assert.equal(host.querySelectorAll('.ds-toast').length, 2);
});

test('toast: el foco dentro pausa el temporizador', () => {
  const { ui, env } = boot();
  const t = ui.toast('Hola', { duration: 1000 });
  env.tick(100);
  env.fire(t.el, 'focusin');
  env.tick(3000);
  assert.equal(t.el.getAttribute('data-state'), 'open');
  env.fire(t.el, 'focusout', { relatedTarget: q(t.el, '.ds-toast__close') });
  env.tick(3000);
  assert.equal(t.el.getAttribute('data-state'), 'open', 'el foco sigue dentro');
  env.fire(t.el, 'focusout', { relatedTarget: null });
  env.tick(900);
  assert.equal(t.el.getAttribute('data-state'), 'exit');
});

/* ======================================================================= tooltips */

function tipSetup(options) {
  const r = boot(options);
  const { ui, env, h } = r;
  const root = attach(env.document, h('div', { class: 'zona' }));
  ui.tooltips.init(root);
  const btn = root.appendChild(ui.button({ icon: 'rotate-ccw', iconOnly: true, ariaLabel: 'Reiniciar', title: 'Vuelve a t = 0' }));
  const same = root.appendChild(ui.button({ icon: 'x', iconOnly: true, ariaLabel: 'Cerrar', title: 'Cerrar' }));
  const helpBtn = root.appendChild(ui.help('Explicación larga.', { label: 'ζ' }));
  const tipEl = () => env.document.body.querySelector('[data-testid="ds-tooltip"]');
  return { ...r, root, btn, same, helpBtn, tipEl };
}

test('tooltips: al enfocar se muestra con aria-describedby y Esc lo cierra', () => {
  const { ui, env, btn, same, tipEl } = tipSetup();
  env.fire(btn, 'focusin');
  const tip = tipEl();
  assert.ok(tip);
  assert.equal(tip.getAttribute('role'), 'tooltip');
  assert.equal(tip.getAttribute('data-state'), 'open');
  assert.equal(tip.textContent, 'Vuelve a t = 0');
  assert.equal(btn.getAttribute('aria-describedby'), tip.id);
  assert.ok(tip.style.getPropertyValue('--tip-x').endsWith('px'));
  assert.ok(['top', 'bottom', 'left', 'right'].includes(tip.getAttribute('data-side')));
  assert.equal(ui.tooltips.isOpen(), true);
  const ev = new env.FakeEvent('keydown', { key: 'Escape', bubbles: true });
  env.document.dispatchEvent(ev);
  assert.equal(ev._stop, true, 'Esc no llega a otros oyentes');
  assert.equal(tip.getAttribute('data-state'), 'closed');
  assert.equal(btn.getAttribute('aria-describedby'), null);
  // Esc sin tooltip abierto no se consume.
  const ev2 = new env.FakeEvent('keydown', { key: 'Escape', bubbles: true });
  env.document.dispatchEvent(ev2);
  assert.equal(ev2._stop, false);
  // Mismo texto que el nombre: sin aria-describedby (no se lee dos veces).
  env.fire(same, 'focusin');
  assert.equal(tip.getAttribute('data-state'), 'open');
  assert.equal(same.getAttribute('aria-describedby'), null);
  env.fire(same, 'focusout');
  assert.equal(tip.getAttribute('data-state'), 'closed');
  assert.equal(env.document.body.querySelectorAll('[data-testid="ds-tooltip"]').length, 1);
});

test('tooltips: retardo al pasar el puntero, margen de gracia y apertura inmediata en caliente', () => {
  const { env, btn, same, tipEl } = tipSetup();
  env.tick(2000);
  env.fire(btn, 'pointerover', { pointerType: 'mouse' });
  assert.equal(tipEl(), null, 'todavía no se ha creado');
  env.tick(279);
  assert.equal(tipEl(), null);
  env.tick(1);
  const tip = tipEl();
  assert.equal(tip.getAttribute('data-state'), 'open');
  env.fire(btn, 'pointerout', { pointerType: 'mouse', relatedTarget: tip });
  env.tick(500);
  assert.equal(tip.getAttribute('data-state'), 'open', 'el puntero pasó al tooltip');
  env.fire(btn, 'pointerout', { pointerType: 'mouse', relatedTarget: null });
  env.tick(119);
  assert.equal(tip.getAttribute('data-state'), 'open');
  env.tick(1);
  assert.equal(tip.getAttribute('data-state'), 'closed');
  env.tick(100);
  env.fire(same, 'pointerover', { pointerType: 'mouse' });
  assert.equal(tip.getAttribute('data-state'), 'open', 'en caliente: sin espera');
  assert.equal(tip.textContent, 'Cerrar');
  // El tacto no abre tooltips al pasar.
  env.fire(env.window, 'resize');
  assert.equal(tip.getAttribute('data-state'), 'closed', 'resize cierra');
  env.tick(1000);
  env.fire(btn, 'pointerover', { pointerType: 'touch' });
  env.tick(1000);
  assert.equal(tip.getAttribute('data-state'), 'closed');
});

test('tooltips: tocar «?» alterna; tooltip() y refresh actualizan el texto; en la barra va abajo', () => {
  const { ui, env, h, root, btn, helpBtn, tipEl } = tipSetup();
  env.fire(helpBtn, 'pointerdown', { pointerType: 'touch' });
  const tip = tipEl();
  assert.equal(tip.getAttribute('data-state'), 'open');
  assert.equal(tip.textContent, 'Explicación larga.');
  env.fire(helpBtn, 'pointerdown', { pointerType: 'touch' });
  assert.equal(tip.getAttribute('data-state'), 'closed');
  env.fire(helpBtn, 'pointerdown', { pointerType: 'touch' });
  env.fire(root, 'pointerdown', { pointerType: 'touch' });
  assert.equal(tip.getAttribute('data-state'), 'closed', 'tocar fuera cierra');

  ui.tooltips.show(btn);
  ui.tooltip(btn, 'Texto nuevo');
  assert.equal(tip.textContent, 'Texto nuevo');
  ui.tooltip(btn, '');
  assert.equal(btn.hasAttribute('data-tip'), false);
  ui.tooltips.hide();

  const header = attach(env.document, h('header', { class: 'app-header' }));
  ui.tooltips.init(header);
  const hb = header.appendChild(ui.button({ icon: 'sun', iconOnly: true, ariaLabel: 'Tema claro', title: 'Tema claro', testid: 'hb' }));
  hb.setAttribute('data-tip-side', 'top');
  env.fire(hb, 'focusin');
  assert.equal(tip.getAttribute('data-side'), 'bottom');
});

/* ======================================================================= reveal, init */

test('reveal: escalonado al entrar en pantalla; nada con movimiento reducido', () => {
  const { ui, env, h } = boot();
  const box = attach(env.document, h('div', null, h('p', { class: 'it' }, 'a'), h('p', { class: 'it' }, 'b'), h('p', { class: 'it' }, 'c')));
  const stop = ui.reveal(box, { items: '.it', stagger: 70, delay: 10 });
  const items = box.querySelectorAll('.it');
  assert.deepEqual(items.map((x) => x.style.getPropertyValue('--reveal-delay')), ['10ms', '80ms', '150ms']);
  assert.ok(items.every((x) => x.classList.contains('ds-reveal') && !x.classList.contains('is-revealed')));
  env.intersect(box, true);
  assert.ok(items.every((x) => x.classList.contains('is-revealed')));
  stop();
  assert.ok(items.every((x) => !x.classList.contains('ds-reveal')));

  const rm = boot({ media: { '(prefers-reduced-motion: reduce)': true } });
  const el = rm.h('div');
  rm.ui.reveal(el)();
  assert.equal(el.className, '');
  const noIo = boot({ intersection: false });
  const el2 = noIo.h('div');
  noIo.ui.reveal(el2);
  assert.equal(el2.className, '');
});

test('init: data-motion sigue a la preferencia, región viva y reflejo de tarjetas con el ratón', () => {
  const { DSL, ui, env, h } = boot({ media: { '(prefers-reduced-motion: reduce)': true } });
  const root = attach(env.document, h('div'));
  ui.init(root);
  ui.init(root);
  const html = env.document.documentElement;
  assert.equal(html.getAttribute('data-motion'), 'reduce');
  assert.equal(env.document.body.querySelectorAll('[data-testid="ds-live"]').length, 1);
  DSL.prefs.setReducedMotion(false);
  assert.equal(html.getAttribute('data-motion'), null);

  const c = root.appendChild(ui.card({ title: 'T', body: h('p', { class: 'in' }, 'x'), spotlight: true }));
  env.fire(q(c, '.in'), 'pointermove', { pointerType: 'mouse', clientX: 50, clientY: 30 });
  env.fire(q(c, '.in'), 'pointermove', { pointerType: 'mouse', clientX: 70, clientY: 40 });
  assert.equal(env.pendingFrames(), 1, 'un frame por movimiento agrupado');
  env.frame();
  assert.equal(c.style.getPropertyValue('--mx'), '70px');
  assert.equal(c.style.getPropertyValue('--my'), '40px');
  env.fire(q(c, '.in'), 'pointermove', { pointerType: 'touch', clientX: 1, clientY: 1 });
  assert.equal(env.pendingFrames(), 0, 'el tacto no mueve el reflejo');
  DSL.prefs.setReducedMotion(true);
  env.fire(q(c, '.in'), 'pointermove', { pointerType: 'mouse', clientX: 1, clientY: 1 });
  assert.equal(env.pendingFrames(), 0, 'ni con movimiento reducido');
  assert.equal(html.getAttribute('data-motion'), 'reduce');
});

/* ======================================================================= shell */

function shellPage(options = {}) {
  const r = loadDSL(SHELL, options);
  const { DSL, env } = r;
  const h = DSL.util.h;
  const d = env.document;
  const header = attach(d, h('header', { class: 'app-header', 'data-mount': 'shell-header' }));
  const main = attach(d, h('main', { class: 'app-main', id: 'contenido' },
    ['inicio', 'conceptos', 'modelado', 'galeria', 'transferencia'].map((id) => h('section', { id, class: 'app-section' }, id))));
  const footer = attach(d, h('footer', { class: 'app-footer', 'data-mount': 'shell-footer' }));
  return { ...r, h, d, header, main, footer, shell: DSL.ui.shell };
}

test('shell.helpers.pickActive: la última sección visible en orden de documento', () => {
  const { DSL } = loadDSL(SHELL);
  const pick = DSL.ui.shell.helpers.pickActive;
  const ids = ['inicio', 'conceptos', 'modelado'];
  assert.equal(pick(ids, { inicio: true, conceptos: true }), 'conceptos');
  assert.equal(pick(ids, { modelado: true, inicio: true }), 'modelado');
  assert.equal(pick(ids, { conceptos: false }), null);
  assert.deepEqual(toPlain(DSL.ui.shell.SECTIONS).map((s) => s.id), ['inicio', 'conceptos', 'modelado', 'galeria', 'transferencia']);
  assert.equal(DSL.ui.shell.SECTIONS[0].nav, false);
});

test('shell: cabecera con marca, cuatro enlaces, tema y menú; la hoja va a <body>', () => {
  const { shell, header, d } = shellPage();
  const handle = shell.mountHeader(header);
  const brand = q(header, '[data-testid="sh-brand"]');
  assert.equal(brand.getAttribute('href'), '#inicio');
  assert.equal(brand.textContent, 'Laboratorio de Sistemas Dinámicos');
  const nav = q(header, 'nav');
  assert.equal(nav.getAttribute('aria-label'), 'Secciones');
  const links = header.querySelectorAll('.sh-link');
  assert.deepEqual(links.map((a) => a.textContent), ['Conceptos', 'Modelado', 'Galería', 'Función de transferencia']);
  assert.deepEqual(links.map((a) => a.getAttribute('data-testid')), ['sh-nav-conceptos', 'sh-nav-modelado', 'sh-nav-galeria', 'sh-nav-transferencia']);
  const theme = q(header, '[data-testid="sh-theme-toggle"]');
  assert.equal(theme.getAttribute('aria-label'), 'Tema claro');
  assert.equal(theme.getAttribute('data-tip'), 'Tema claro');
  const menuBtn = q(header, '[data-testid="sh-menu-toggle"]');
  const sheet = q(d.body, '[data-testid="sh-sheet"]');
  assert.equal(sheet.parentNode, d.body, 'fuera del vidrio de la barra');
  assert.equal(menuBtn.getAttribute('aria-controls'), sheet.id);
  assert.equal(menuBtn.getAttribute('aria-expanded'), 'false');
  assert.equal(sheet.getAttribute('role'), 'dialog');
  assert.equal(sheet.getAttribute('aria-modal'), 'true');
  assert.equal(sheet.hidden, true);
  assert.ok(header.classList.contains('is-at-top'));
  const sentinel = q(d.body, '.sh-sentinel');
  assert.equal(d.body.firstChild, sentinel);
  assert.throws(() => shell.mountHeader(header), /ya está montada/);
  handle.destroy();
  assert.equal(header.childNodes.length, 0);
  assert.equal(d.body.querySelector('[data-testid="sh-sheet"]'), null);
  assert.equal(d.body.querySelector('.sh-sentinel'), null);
  shell.mountHeader(header);
});

test('shell: la barra deja de ser transparente al desplazarse (centinela)', () => {
  const { shell, header, d, env } = shellPage();
  shell.mountHeader(header);
  const sentinel = q(d.body, '.sh-sentinel');
  env.intersect(sentinel, false);
  assert.ok(!header.classList.contains('is-at-top'));
  env.intersect(sentinel, true);
  assert.ok(header.classList.contains('is-at-top'));
});

test('shell: scrollspy marca aria-current, emite section:change y coloca el indicador', () => {
  const { DSL, shell, header, d, env } = shellPage();
  const seen = [];
  DSL.bus.on('section:change', (p) => seen.push(p.id));
  shell.mountHeader(header);
  assert.equal(shell.active(), null);
  const link = q(header, '[data-testid="sh-nav-conceptos"]');
  link.clientWidth = 96;
  env.intersect(d.getElementById('inicio'), true);
  env.intersect(d.getElementById('conceptos'), true);
  assert.equal(shell.active(), 'conceptos');
  assert.equal(link.getAttribute('aria-current'), 'true');
  assert.equal(q(d.body, '[data-testid="sh-sheet-conceptos"]').getAttribute('aria-current'), 'true');
  const ind = q(header, '.sh-indicator');
  assert.equal(ind.style.getPropertyValue('--ind-x'), '0px');
  assert.equal(ind.style.getPropertyValue('--ind-s'), '0.96');
  assert.ok(ind.classList.contains('is-visible'));
  env.intersect(d.getElementById('modelado'), true);
  assert.equal(shell.active(), 'modelado');
  assert.equal(link.getAttribute('aria-current'), null);
  assert.ok(!ind.classList.contains('is-visible'), 'sin medida del enlace no se muestra');
  env.intersect(d.getElementById('modelado'), false);
  assert.equal(shell.active(), 'conceptos');
  env.intersect(d.getElementById('conceptos'), false);
  assert.equal(shell.active(), 'inicio');
  assert.equal(header.querySelectorAll('[aria-current="true"]').length, 0, 'inicio no tiene enlace en la barra');
  assert.deepEqual(seen, ['inicio', 'conceptos', 'modelado', 'conceptos', 'inicio']);
});

test('shell: clic en un ancla de sección desplaza, enfoca y respeta modificadores', () => {
  const { DSL, shell, header, d, env } = shellPage();
  shell.mountHeader(header);
  const link = q(header, '[data-testid="sh-nav-galeria"]');
  const ok = env.fire(d, 'click', { target: link, button: 0 });
  assert.equal(ok, false, 'preventDefault');
  const target = d.getElementById('galeria');
  assert.equal(d._scrolledTo, target);
  assert.equal(d.activeElement, target);
  assert.equal(target.getAttribute('tabindex'), '-1');
  d._scrolledTo = null;
  assert.equal(env.fire(d, 'click', { target: link, ctrlKey: true }), true, 'Ctrl+clic: navegador');
  const other = DSL.util.h('a', { href: '#otra' }, 'x');
  attach(d, other);
  assert.equal(env.fire(d, 'click', { target: other }), true, 'anclas ajenas no se tocan');
  assert.equal(d._scrolledTo, null);
  assert.equal(shell.scrollTo('no-existe'), false);
  DSL.bus.emit('tf:open', { num: [1], den: [1, 1] });
  assert.equal(d._scrolledTo, d.getElementById('transferencia'));
  assert.equal(d.activeElement, d.getElementById('transferencia'));
  DSL.bus.emit('gallery:open', {});
  assert.equal(d._scrolledTo, d.getElementById('galeria'));
  DSL.bus.emit('concepts:open', {});
  assert.equal(d._scrolledTo, d.getElementById('conceptos'));
});

test('shell: el conmutador de tema cambia, persiste y actualiza su nombre', () => {
  const { DSL, shell, header, d, env } = shellPage();
  shell.mountHeader(header);
  const themes = [];
  DSL.bus.on('theme:change', (p) => themes.push(p.theme));
  const btn = q(header, '[data-testid="sh-theme-toggle"]');
  btn.click();
  assert.equal(d.documentElement.getAttribute('data-theme'), 'light');
  assert.equal(JSON.parse(env.storage.get('dsl.v1.theme')), 'light');
  assert.equal(btn.getAttribute('aria-label'), 'Tema oscuro');
  assert.equal(btn.getAttribute('data-mode'), 'light');
  btn.click();
  assert.equal(btn.getAttribute('aria-label'), 'Tema claro');
  assert.deepEqual(themes, ['light', 'dark']);

  // Almacenamiento bloqueado: el tema cambia igual, sin errores.
  const blocked = shellPage({ storage: 'throw' });
  blocked.shell.mountHeader(blocked.header);
  q(blocked.header, '[data-testid="sh-theme-toggle"]').click();
  assert.equal(blocked.d.documentElement.getAttribute('data-theme'), 'light');
  assert.deepEqual(blocked.env.console.error, []);

  // Con View Transitions: el cambio va dentro de la transición y sus promesas rechazadas se capturan.
  const vt = shellPage();
  let ran = 0;
  vt.d.startViewTransition = (fn) => { fn(); ran++; const rej = Promise.reject(new Error('omitida')); return { ready: rej, finished: rej, updateCallbackDone: Promise.resolve() }; };
  vt.shell.mountHeader(vt.header);
  q(vt.header, '[data-testid="sh-theme-toggle"]').click();
  assert.equal(ran, 1);
  assert.equal(vt.d.documentElement.getAttribute('data-theme'), 'light');
});

test('shell: hoja «Menú» con foco atrapado, Esc, cierre al ensanchar y fondo inerte', () => {
  const { shell, header, d, env, main, footer } = shellPage({ media: { '(max-width: 767.98px)': true } });
  shell.mountHeader(header);
  const menuBtn = q(header, '[data-testid="sh-menu-toggle"]');
  const sheet = q(d.body, '[data-testid="sh-sheet"]');
  const links = sheet.querySelectorAll('.sh-sheet__link');
  menuBtn.click();
  assert.equal(shell.menu.isOpen(), true);
  assert.equal(sheet.hidden, false);
  assert.equal(sheet.getAttribute('data-state'), 'open');
  assert.equal(menuBtn.getAttribute('aria-expanded'), 'true');
  assert.equal(menuBtn.getAttribute('aria-label'), 'Cerrar menú');
  assert.ok(d.documentElement.classList.contains('sh-lock'));
  assert.ok(header.classList.contains('is-menu-open'));
  assert.equal(main.getAttribute('inert'), '');
  assert.equal(footer.getAttribute('inert'), '');
  assert.equal(d.activeElement, links[0]);

  links[3].focus();
  assert.equal(env.fire(d, 'keydown', { key: 'Tab' }), false);
  assert.equal(d.activeElement, menuBtn, 'Tab en el último vuelve al botón');
  env.fire(d, 'keydown', { key: 'Tab', shiftKey: true });
  assert.equal(d.activeElement, links[3], 'Mayús+Tab en el primero va al último');
  links[1].focus();
  assert.equal(env.fire(d, 'keydown', { key: 'Tab' }), true, 'en medio, Tab normal');

  env.fire(d, 'keydown', { key: 'Escape' });
  assert.equal(shell.menu.isOpen(), false);
  assert.equal(d.activeElement, menuBtn);
  assert.equal(main.hasAttribute('inert'), false);
  assert.ok(!d.documentElement.classList.contains('sh-lock'));
  assert.equal(sheet.hidden, false, 'se oculta tras la transición');
  env.tick(240);
  assert.equal(sheet.hidden, true);

  // Clic en un enlace de la hoja: cierra y desplaza.
  shell.menu.open();
  env.fire(d, 'click', { target: links[2] });
  assert.equal(shell.menu.isOpen(), false);
  assert.equal(d._scrolledTo, d.getElementById('galeria'));
  assert.equal(d.activeElement, d.getElementById('galeria'));

  // Abre con la sección activa enfocada; se cierra al pasar a tableta.
  env.intersect(d.getElementById('modelado'), true);
  shell.menu.open();
  assert.equal(d.activeElement, links[1]);
  env.setMedia('(max-width: 767.98px)', false);
  assert.equal(shell.menu.isOpen(), false);
  q(d.body, '.sh-scrim');
  shell.menu.open();
  q(d.body, '.sh-scrim').click();
  assert.equal(shell.menu.isOpen(), false);
});

test('shell: pie con créditos (versiones de Chart.js y KaTeX si están cargados)', () => {
  const { shell, footer } = shellPage({ globals: { Chart: { version: '4.4.1' }, katex: { version: '0.16.11', render() {} } } });
  shell.mountFooter(footer);
  const dl = q(footer, '[data-testid="sh-credits"]');
  const rows = dl.querySelectorAll('.sh-credit').map((r) => r.textContent);
  assert.deepEqual(rows, [
    'GráficasChart.js 4.4.1Licencia MIT',
    'EcuacionesKaTeX 0.16.11Licencia MIT',
    'IconosLucideLicencia ISC',
    'TipografíasBricolage Grotesque e IBM Plex SansSIL Open Font License 1.1',
  ]);
  assert.equal(q(footer, 'h2').textContent, 'Créditos');
  assert.equal(q(footer, '[data-testid="sh-footer-top"]').getAttribute('href'), '#inicio');
  assert.match(q(footer, '.sh-footer__note').textContent, /sin conexión/);
  const bare = shellPage();
  bare.shell.mountFooter(bare.footer);
  assert.match(q(bare.footer, '[data-testid="sh-credits"]').textContent, /Chart\.jsLicencia MIT/);
});

/* ======================================================================= app.js */

test('app.js: monta cabecera, secciones y pie; un fallo pinta la tarjeta de error y no detiene al resto', () => {
  const { DSL, env } = loadDSL(SHELL, { readyState: 'loading' });
  const h = DSL.util.h;
  const d = env.document;
  attach(d, h('header', { class: 'app-header', 'data-mount': 'shell-header' }));
  const main = attach(d, h('main', { class: 'app-main' },
    h('section', { id: 'conceptos' }, h('div', { 'data-mount': 'concepts' })),
    h('section', { id: 'modelado' }, h('div', { 'data-mount': 'wizard' })),
    h('section', { id: 'galeria' }, h('div', { 'data-mount': 'gallery' }))));
  attach(d, h('footer', { class: 'app-footer', 'data-mount': 'shell-footer' }));
  DSL.sections.concepts = { mount() { throw new Error('fallo de prueba'); } };
  DSL.sections.wizard = { mount(el) { el.appendChild(h('p', null, 'ok')); return { x: 1 }; } };
  let payload = null;
  DSL.bus.on('app:ready', (p) => { payload = toPlain(p); });
  env.load('js/app.js');
  assert.equal(DSL.app.ready, false, 'espera a DOMContentLoaded');
  env.domReady();
  assert.equal(DSL.app.ready, true);
  assert.equal(d.documentElement.getAttribute('data-ready'), 'true');
  assert.deepEqual(payload, { mounted: ['shell-header', 'wizard', 'shell-footer'], failed: ['concepts', 'gallery'] });
  assert.equal(DSL.app.handles.wizard.x, 1);
  assert.ok(d.body.querySelector('.sh-bar'), 'cabecera montada');
  assert.ok(d.body.querySelector('[data-testid="sh-footer"]'), 'pie montado');

  const card = q(main, '[data-testid="app-error-concepts"]');
  assert.equal(card.getAttribute('role'), 'alert');
  assert.ok(card.classList.contains('app-error'));
  assert.equal(q(card, 'strong').textContent, 'No se pudo cargar la parte «Conceptos».');
  assert.match(card.textContent, /Recargue la página/);
  assert.match(card.textContent, /fallo de prueba/);
  assert.equal(q(card, 'svg').getAttribute('data-icon'), 'triangle-alert');
  const gal = q(main, '[data-testid="app-error-gallery"]');
  assert.equal(q(gal, 'strong').textContent, 'No se pudo cargar la parte «Galería».');
  assert.match(gal.textContent, /DSL\.sections\.gallery\.mount/);
  assert.equal(env.console.error.length, 2);
  assert.equal(env.console.error[0][0], '[app] No se pudo montar «concepts»:');
  assert.equal(env.console.error[1][0], '[app] No se pudo montar «gallery»:');
  assert.ok(d.body.querySelector('[data-testid="ds-live"]'), 'init preparó la región viva');
});

test('app.js: sin DSL.ui.init cae a tooltips.init y una sección desconocida usa su nombre', () => {
  const { DSL, env } = loadDSL(SHELL, { readyState: 'loading' });
  const h = DSL.util.h;
  const d = env.document;
  const box = attach(d, h('div', { 'data-mount': 'otra' }));
  let tipInit = 0;
  DSL.ui.init = undefined;
  DSL.ui.tooltips = { init() { tipInit++; }, refresh() {} };
  env.load('js/app.js');
  env.domReady();
  assert.equal(tipInit, 1);
  assert.equal(q(box, 'strong').textContent, 'No se pudo cargar la parte «otra».');
});

/* ======================================================================= auditoría foundation (FND) */

test('slider: nota de ajuste al límite (role=status, ~4 s) y error role=alert sin «..» tras una unidad con punto', () => {
  const { ui, env } = boot();
  const { s } = massSlider(ui);
  attach(env.document, s.el);
  const num = q(s.el, '[data-testid="m-number"]');
  const note = q(s.el, '[data-testid="m-note"]');
  assert.equal(note.getAttribute('role'), 'status');
  assert.equal(q(s.el, '[data-testid="m-error"]').getAttribute('role'), 'alert');
  assert.equal(note.textContent, '');
  num.value = '50';
  env.fire(num, 'keydown', { key: 'Enter' });
  assert.equal(s.value, 10);
  assert.equal(note.textContent, 'Se ajustó a 10.0 kg (máximo).');
  env.tick(3900);
  assert.notEqual(note.textContent, '', 'sigue a la vista unos 4 s');
  env.tick(200);
  assert.equal(note.textContent, '');
  num.value = '-3';
  env.fire(num, 'keydown', { key: 'Enter' });
  assert.match(note.textContent, /^Se ajustó a 0\.1 kg \(mínimo\)\.$/);
  num.value = '5';
  env.fire(num, 'keydown', { key: 'Enter' });
  assert.equal(note.textContent, '', 'un valor dentro del rango quita la nota');

  const u = ui.slider({ label: 'Nivel', unit: 'u.a.', min: 0, max: 5, step: 0.5, value: 1, testid: 'ua' });
  const un = q(u.el, '[data-testid="ua-number"]');
  un.value = 'x';
  env.fire(un, 'keydown', { key: 'Enter' });
  const msg = q(u.el, '[data-testid="ua-error"]').textContent;
  assert.match(msg, /^Escriba un número entre 0 y 5 u\.a\. Se acepta la coma decimal\.$/);
  assert.ok(!msg.includes('..'));
});

test('slider: set silencioso no pisa lo que se escribe; Enter confirma lo escrito; onEditStart una vez por edición', () => {
  const { ui, env } = boot();
  const starts = [];
  const { s, log } = massSlider(ui, { onEditStart: () => starts.push(1) });
  attach(env.document, s.el);
  const num = q(s.el, '[data-testid="m-number"]');
  num.focus();
  num.value = '3';
  env.fire(num, 'input');
  env.fire(num, 'input');
  assert.equal(starts.length, 1);
  s.set(1.25, { silent: true });
  assert.equal(num.value, '3', 'el campo conserva lo escrito');
  assert.deepEqual(log, []);
  env.fire(num, 'keydown', { key: 'Enter' });
  assert.equal(s.value, 3);
  assert.deepEqual(log, [['change', 3]]);
  num.value = '4';
  env.fire(num, 'input');
  assert.equal(starts.length, 2, 'una edición nueva');
  num.blur();
  env.fire(num, 'blur');
  s.set(2, { silent: true });
  assert.equal(num.value, '2.0', 'sin foco, set silencioso sí actualiza el campo');
});

test('slider: si el botón de reinicio enfocado se desactiva, el foco pasa antes al deslizador', () => {
  const { ui, env } = boot();
  const { s } = massSlider(ui);
  attach(env.document, s.el);
  s.set(4);
  const reset = q(s.el, '[data-testid="m-reset"]');
  assert.equal(reset.disabled, false);
  reset.focus();
  reset.click();
  assert.equal(s.value, 1);
  assert.equal(reset.disabled, true);
  assert.equal(env.document.activeElement, s.input);
});

test('toast: tras una tecla, el foco va a la acción; Esc cierra y devuelve el foco; con puntero no se mueve', () => {
  const { ui, env, h } = boot();
  const d = env.document;
  ui.init();
  const origin = attach(d, h('button', { type: 'button' }, 'Restablecer'));
  origin.focus();
  env.fire(d, 'keydown', { key: 'Enter' });
  assert.equal(ui.inputModality(), 'keyboard');
  const t = ui.toast('Restablecido.', { testid: 'k', action: { label: 'Deshacer', onClick() {} } });
  const act = q(t.el, '[data-testid="k-action"]');
  assert.equal(d.activeElement, act, 'la acción es alcanzable con el teclado');
  env.fire(act, 'keydown', { key: 'Escape' });
  assert.equal(t.el.getAttribute('data-state'), 'exit');
  assert.equal(d.activeElement, origin, 'vuelve al elemento anterior');

  const other = attach(d, h('button', { type: 'button' }, 'Otro'));
  env.fire(d, 'keydown', { key: 'Enter' });
  const t2 = ui.toast('B', { testid: 'k2', action: { label: 'Deshacer', onClick() {} }, returnFocus: () => other });
  q(t2.el, '[data-testid="k2-action"]').click();
  assert.equal(d.activeElement, other, 'returnFocus (función)');

  env.fire(d, 'pointerdown', {});
  assert.equal(ui.inputModality(), 'pointer');
  origin.focus();
  const t3 = ui.toast('C', { testid: 'p', action: { label: 'Deshacer', onClick() {} } });
  assert.equal(d.activeElement, origin, 'con puntero el foco no se mueve');
  env.tick(4999);
  assert.equal(t3.el.getAttribute('data-state'), 'open');
  env.tick(1);
  assert.equal(t3.el.getAttribute('data-state'), 'exit', '5 s con puntero');
  // Una tecla de hace más de 1 s no cuenta como «creado con el teclado».
  env.fire(d, 'keydown', { key: 'a' });
  env.tick(1500);
  const t4 = ui.toast('D', { testid: 'late', action: { label: 'Deshacer', onClick() {} } });
  assert.notEqual(d.activeElement, q(t4.el, '[data-testid="late-action"]'));
});

test('tooltips: Enter o Espacio sobre «?» (clic sin puntero) alternan la explicación', () => {
  const { env, helpBtn, tipEl } = tipSetup();
  env.fire(helpBtn, 'focusin');
  const tip = tipEl();
  assert.equal(tip.getAttribute('data-state'), 'open', 'al enfocar');
  env.document.dispatchEvent(new env.FakeEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(tip.getAttribute('data-state'), 'closed', 'Esc');
  env.fire(helpBtn, 'click', { detail: 0 });
  assert.equal(tip.getAttribute('data-state'), 'open', 'Enter abre');
  env.fire(helpBtn, 'click', { detail: 0 });
  assert.equal(tip.getAttribute('data-state'), 'closed', 'Enter cierra');
  env.fire(helpBtn, 'click', { detail: 0 });
  assert.equal(tip.getAttribute('data-state'), 'open', 'Espacio abre');
  env.fire(helpBtn, 'click', { detail: 1 });
  assert.equal(tip.getAttribute('data-state'), 'open', 'un clic de ratón no alterna');
});

test('readout: tip añade el botón «?» con nombre, data-tip y texto sr-only; sin tip el marcado no cambia', () => {
  const { ui } = boot();
  const r = ui.readout({ label: 'Sobrepaso', value: 12, unit: '%', tip: 'Cuánto supera el pico al valor final.', testid: 'mp' });
  const b = q(r.el, '.ds-help');
  assert.equal(b.getAttribute('aria-label'), 'Explicación de «Sobrepaso»');
  assert.equal(b.getAttribute('data-tip'), 'Cuánto supera el pico al valor final.');
  assert.equal(b.getAttribute('data-testid'), 'mp-help');
  assert.ok(q(r.el, '.ds-readout__label').contains(b));
  assert.match(q(r.el, '.sr-only').textContent, /Cuánto supera el pico/);
  const plain = ui.readout({ label: 'Sobrepaso', value: 12 });
  assert.equal(plain.el.querySelector('.ds-help'), null);
  assert.equal(plain.el.querySelector('.sr-only'), null);
  assert.equal(q(plain.el, '.ds-readout__label').childNodes.length, 1);
});

test('readout: la cifra y «%» del nombre van unidas por un espacio duro; el nombre accesible del «?» no cambia', () => {
  const { ui } = boot();
  const NB = String.fromCharCode(0xa0);
  const r = ui.readout({ label: 'Tiempo de establecimiento (≈, 2 %)', value: 10, unit: 's', tip: 'Banda del 2 %.', testid: 'ts' });
  assert.equal(q(r.el, '.ds-readout__text').textContent, 'Tiempo de establecimiento (≈, 2' + NB + '%)');
  assert.equal(q(r.el, '.ds-help').getAttribute('aria-label'), 'Explicación de «Tiempo de establecimiento (≈, 2 %)»');
  const plain = ui.readout({ label: 'Sobrepaso 5 % y 10 %', value: 1 });
  assert.equal(q(plain.el, '.ds-readout__text').textContent, 'Sobrepaso 5' + NB + '% y 10' + NB + '%');
  const sinCifra = ui.readout({ label: 'Margen % útil', value: 1 });
  assert.equal(q(sinCifra.el, '.ds-readout__text').textContent, 'Margen % útil');
});

test('shell: scrollTo quita is-at-top en el acto y marca <html data-jumping> mientras dura el salto', () => {
  const { shell, header, d, env } = shellPage();
  shell.mountHeader(header);
  assert.ok(header.classList.contains('is-at-top'));
  const target = d.getElementById('modelado');
  target.getBoundingClientRect = () => ({ x: 0, y: 1200, top: 1200, left: 0, width: 800, height: 900, right: 800, bottom: 2100 });
  d.documentElement.scrollHeight = 6000;
  shell.scrollTo('modelado', { instant: true });
  assert.ok(!header.classList.contains('is-at-top'), 'sin esperar al centinela');
  assert.ok(d.documentElement.hasAttribute('data-jumping'));
  env.tick(2500);
  assert.ok(!d.documentElement.hasAttribute('data-jumping'), 'al terminar la corrección');
  // El inicio (destino a menos de 8 px) no fuerza nada: lo decide el centinela.
  header.classList.add('is-at-top');
  shell.scrollTo('inicio', { instant: true });
  assert.ok(header.classList.contains('is-at-top'));
});
