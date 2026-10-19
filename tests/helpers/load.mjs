// tests/helpers/load.mjs — Propietario: architect.
// Carga scripts clásicos del proyecto en un contexto node:vm que imita lo justo de un navegador
// (window === global del contexto) y devuelve window.DSL. Para pruebas unitarias con node:test.
//
//   import { loadDSL } from '../helpers/load.mjs';
//   const { DSL, env } = loadDSL(['js/core/numeric.js']);   // ns.js se antepone solo
//
// El entorno es determinista: reloj falso (performance.now, setTimeout, requestAnimationFrame),
// Math.random prohibido (lanza un error), matchMedia/IntersectionObserver/ResizeObserver/
// localStorage/getComputedStyle falsos y controlables, y un DOM mínimo (FakeElement).
// Documentación: docs/ARCHITECTURE.md §10 y docs/api/ns.md («Pruebas»).
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const NS = 'js/core/ns.js';

/** Scripts en el orden de index.html, por grupos, para cargar dependencias rápidamente. */
export const SCRIPTS = Object.freeze({
  core: ['js/core/ns.js', 'js/core/numeric.js', 'js/core/tf.js', 'js/core/latex.js'],
  systems: [
    'js/systems/registry.js', 'js/systems/simulator.js', 'js/systems/massSpring.js', 'js/systems/tanks.js',
    'js/systems/rlc.js', 'js/systems/sir.js', 'js/systems/market.js', 'js/systems/pendulum.js',
  ],
});

/* ======================================================================= DOM mínimo */

const SVG_NS = 'http://www.w3.org/2000/svg';

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = !!init.bubbles;
    this.cancelable = init.cancelable !== false;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this._stop = false;
    Object.assign(this, init);
  }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  stopPropagation() { this._stop = true; }
  stopImmediatePropagation() { this._stop = true; this._stopNow = true; }
}

class FakeEventTarget {
  constructor() { this._listeners = new Map(); }
  addEventListener(type, fn, opts) {
    if (typeof fn !== 'function' && !(fn && typeof fn.handleEvent === 'function')) return;
    const once = typeof opts === 'object' && opts !== null && !!opts.once;
    const list = this._listeners.get(type) || [];
    if (list.some((l) => l.fn === fn)) return;
    list.push({ fn, once });
    this._listeners.set(type, list);
  }
  removeEventListener(type, fn) {
    const list = this._listeners.get(type);
    if (!list) return;
    const i = list.findIndex((l) => l.fn === fn);
    if (i >= 0) list.splice(i, 1);
  }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    let node = this;
    while (node) {
      event.currentTarget = node;
      const list = node._listeners ? (node._listeners.get(event.type) || []).slice() : [];
      for (const l of list) {
        if (l.once) node.removeEventListener(event.type, l.fn);
        if (typeof l.fn === 'function') l.fn.call(node, event);
        else l.fn.handleEvent(event);
        if (event._stopNow) break;
      }
      if (!event.bubbles || event._stop) break;
      node = node.parentNode || null;
    }
    return !event.defaultPrevented;
  }
}

class FakeText {
  constructor(text) {
    this.nodeType = 3;
    this.nodeName = '#text';
    this.data = String(text);
    this.parentNode = null;
  }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
}

function kebab(s) { return s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()); }
function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

function makeStyle() {
  const props = new Map();
  const style = {
    setProperty(name, value) { props.set(name, String(value)); },
    getPropertyValue(name) { return props.get(name) || ''; },
    removeProperty(name) { const v = props.get(name) || ''; props.delete(name); return v; },
    get cssText() { return [...props].map(([k, v]) => `${k}: ${v};`).join(' '); },
    set cssText(text) {
      props.clear();
      String(text).split(';').forEach((decl) => {
        const i = decl.indexOf(':');
        if (i > 0) props.set(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
      });
    },
  };
  return new Proxy(style, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === 'string') return props.get(kebab(key)) || '';
      return undefined;
    },
    set(target, key, value) {
      if (key === 'cssText') { target.cssText = value; return true; }
      if (typeof key === 'string') props.set(kebab(key), String(value));
      return true;
    },
  });
}

/** Contexto 2D falso: registra cada llamada en ctx.calls ([nombre, ...args]); propiedades asignables. */
function makeContext2d(canvas) {
  const calls = [];
  const state = { canvas, calls };
  return new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return (text) => ({ width: String(text).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (key === 'getImageData') return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createConicGradient' || key === 'createPattern') {
        return (...args) => { calls.push([key, ...args]); return { addColorStop() {} }; };
      }
      if (key === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (typeof key === 'symbol') return undefined;
      return (...args) => { calls.push([key, ...args]); };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

class FakeElement extends FakeEventTarget {
  constructor(tagName, ownerDocument, namespaceURI = null) {
    super();
    this.nodeType = 1;
    this.namespaceURI = namespaceURI;
    this.tagName = namespaceURI === SVG_NS ? tagName : String(tagName).toUpperCase();
    this.nodeName = this.tagName;
    this.localName = String(tagName).toLowerCase();
    this.ownerDocument = ownerDocument;
    this.childNodes = [];
    this.parentNode = null;
    this._attrs = new Map();
    this.style = makeStyle();
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.scrollTop = 0;
    this.hidden = false;
    this.value = '';
    this.checked = false;
    this.width = 300;
    this.height = 150;
    this._ctx = null;
    const self = this;
    this.dataset = new Proxy({}, {
      get(_, key) { return typeof key === 'string' ? self.getAttribute('data-' + kebab(key)) ?? undefined : undefined; },
      set(_, key, value) { self.setAttribute('data-' + kebab(key), String(value)); return true; },
      deleteProperty(_, key) { self.removeAttribute('data-' + kebab(key)); return true; },
      has(_, key) { return self.hasAttribute('data-' + kebab(String(key))); },
      ownKeys() { return [...self._attrs.keys()].filter((k) => k.startsWith('data-')).map((k) => camel(k.slice(5))); },
      getOwnPropertyDescriptor(_, key) {
        const v = self.getAttribute('data-' + kebab(String(key)));
        return v === null ? undefined : { value: v, enumerable: true, configurable: true, writable: true };
      },
    });
    this.classList = {
      add: (...c) => { const s = self._classSet(); c.forEach((x) => s.add(x)); self._setClassSet(s); },
      remove: (...c) => { const s = self._classSet(); c.forEach((x) => s.delete(x)); self._setClassSet(s); },
      contains: (c) => self._classSet().has(c),
      toggle: (c, force) => {
        const s = self._classSet();
        const on = force === undefined ? !s.has(c) : !!force;
        if (on) s.add(c); else s.delete(c);
        self._setClassSet(s);
        return on;
      },
      get length() { return self._classSet().size; },
      toString: () => self.getAttribute('class') || '',
    };
  }
  _classSet() { return new Set((this.getAttribute('class') || '').split(/\s+/).filter(Boolean)); }
  _setClassSet(s) { this.setAttribute('class', [...s].join(' ')); }

  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get isConnected() {
    let n = this;
    while (n) { if (n === this.ownerDocument.documentElement) return true; n = n.parentNode; }
    return false;
  }

  setAttribute(name, value) { this._attrs.set(String(name), String(value)); }
  getAttribute(name) { return this._attrs.has(name) ? this._attrs.get(name) : null; }
  hasAttribute(name) { return this._attrs.has(name); }
  removeAttribute(name) { this._attrs.delete(name); }
  toggleAttribute(name, force) {
    const on = force === undefined ? !this.hasAttribute(name) : !!force;
    if (on) this.setAttribute(name, ''); else this.removeAttribute(name);
    return on;
  }
  getAttributeNames() { return [...this._attrs.keys()]; }

  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  append(...nodes) {
    nodes.forEach((n) => this.appendChild(typeof n === 'object' ? n : this.ownerDocument.createTextNode(n)));
  }
  prepend(...nodes) {
    const first = this.firstChild;
    nodes.forEach((n) => this.insertBefore(typeof n === 'object' ? n : this.ownerDocument.createTextNode(n), first));
  }
  insertBefore(node, ref) {
    if (!ref) return this.appendChild(node);
    if (node.parentNode) node.parentNode.removeChild(node);
    const i = this.childNodes.indexOf(ref);
    node.parentNode = this;
    this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, node);
    return node;
  }
  removeChild(node) {
    const i = this.childNodes.indexOf(node);
    if (i >= 0) this.childNodes.splice(i, 1);
    node.parentNode = null;
    return node;
  }
  replaceChildren(...nodes) {
    this.childNodes.slice().forEach((n) => this.removeChild(n));
    this.append(...nodes);
  }
  replaceWith(node) {
    if (!this.parentNode) return;
    this.parentNode.insertBefore(node, this);
    this.remove();
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(node) {
    let n = node;
    while (n) { if (n === this) return true; n = n.parentNode; }
    return false;
  }

  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) {
    this.childNodes.slice().forEach((n) => this.removeChild(n));
    if (v !== '' && v !== null && v !== undefined) this.appendChild(new FakeText(v));
  }
  /** innerHTML no se analiza: guarda el texto en _html y vacía los hijos. Use h()/svg() en el código probado. */
  get innerHTML() { return this._html || ''; }
  set innerHTML(v) { this.textContent = ''; this._html = String(v); }

  matches(selector) { return selector.split(',').some((s) => matchCompound(this, s.trim())); }
  closest(selector) {
    let n = this;
    while (n && n.nodeType === 1) { if (n.matches(selector)) return n; n = n.parentNode; }
    return null;
  }
  querySelectorAll(selector) {
    const out = [];
    const walk = (node) => {
      for (const c of node.childNodes) {
        if (c.nodeType !== 1) continue;
        if (c.matches(selector)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getElementsByTagName(tag) { return this.querySelectorAll(tag); }

  focus() { this.ownerDocument.activeElement = this; this.dispatchEvent(new FakeEvent('focus')); }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  click() { this.dispatchEvent(new FakeEvent('click', { bubbles: true })); }
  getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, width: this.clientWidth, height: this.clientHeight, right: this.clientWidth, bottom: this.clientHeight };
  }
  scrollIntoView() { this.ownerDocument._scrolledTo = this; }
  animate() { return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null }; }
  getAnimations() { return []; }
  getContext(type) {
    if (type !== '2d') return null;
    if (!this._ctx) this._ctx = makeContext2d(this);
    return this._ctx;
  }
  getTotalLength() { return 100; }
  getBBox() { return { x: 0, y: 0, width: this.clientWidth, height: this.clientHeight }; }
}

/** Selectores compuestos simples: tag, #id, .clase, [attr], [attr="v"], [attr^="v"], :not() no soportado. */
function matchCompound(el, sel) {
  const parts = sel.match(/^([a-zA-Z][\w-]*|\*)?((?:#[\w-]+|\.[\w-]+|\[[^\]]+\])*)$/);
  if (!parts) throw new Error(`Selector no soportado por el DOM falso: «${sel}»`);
  const [, tag, rest] = parts;
  if (tag && tag !== '*' && el.localName !== tag.toLowerCase()) return false;
  for (const m of rest.matchAll(/#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:([\^$*~|]?=)["']?([^"'\]]*)["']?)?\]/g)) {
    if (m[1] !== undefined && el.id !== m[1]) return false;
    if (m[2] !== undefined && !el.classList.contains(m[2])) return false;
    if (m[3] !== undefined) {
      const v = el.getAttribute(m[3]);
      if (v === null) return false;
      if (m[4]) {
        const want = m[5];
        if (m[4] === '=' && v !== want) return false;
        if (m[4] === '^=' && !v.startsWith(want)) return false;
        if (m[4] === '$=' && !v.endsWith(want)) return false;
        if (m[4] === '*=' && !v.includes(want)) return false;
        if (m[4] === '~=' && !v.split(/\s+/).includes(want)) return false;
      }
    }
  }
  return true;
}

class FakeDocument extends FakeEventTarget {
  constructor(readyState) {
    super();
    this.nodeType = 9;
    this.readyState = readyState;
    this.hidden = false;
    this.visibilityState = 'visible';
    this.documentElement = new FakeElement('html', this);
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.documentElement.setAttribute('lang', 'es');
    this.documentElement.setAttribute('data-theme', 'dark');
    this.activeElement = this.body;
    this.fonts = { ready: Promise.resolve(), check: () => true, load: async () => [] };
    const meta = this.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#0F1823');
    this.head.appendChild(meta);
  }
  createElement(tag) { return new FakeElement(tag, this, null); }
  createElementNS(ns, tag) { return new FakeElement(tag, this, ns); }
  createTextNode(text) { return new FakeText(text); }
  createDocumentFragment() { return new FakeElement('#fragment', this, null); }
  getElementById(id) { return this.documentElement.querySelector(`#${id}`); }
  querySelector(s) { return this.documentElement.matches(s) ? this.documentElement : this.documentElement.querySelector(s); }
  querySelectorAll(s) { return (this.documentElement.matches(s) ? [this.documentElement] : []).concat(this.documentElement.querySelectorAll(s)); }
}

/* ======================================================================= entorno */

/**
 * Crea un contexto vm con un navegador mínimo y determinista.
 * options:
 *   media: { '(prefers-reduced-motion: reduce)': true, … }  estado inicial de matchMedia
 *   cssVars: { '--bg': '#0F1823', … }                        valores para getComputedStyle
 *   storage: 'memory' (por defecto) | 'throw' (todo acceso a localStorage lanza)
 *   readyState: 'complete' (por defecto) | 'loading'
 *   allowRandom: false (por defecto Math.random lanza un error)
 *   intersection: true | false  (si false, no hay IntersectionObserver)
 *   resizeObserver: true | false
 *   dpr: 1
 *   globals: { … }  propiedades extra del global (p. ej. katex o Chart falsos)
 *   echo: false     si true, también imprime console.* del contexto
 */
export function createEnv(options = {}) {
  const clock = { now: 0 };
  let timerSeq = 0;
  const timers = [];
  const rafQueue = [];
  let rafSeq = 0;
  const captured = { error: [], warn: [], log: [], info: [] };

  const document = new FakeDocument(options.readyState || 'complete');

  // ---- media queries
  const mediaState = new Map(Object.entries(options.media || {}));
  const mediaLists = new Map();
  function matchMedia(query) {
    if (!mediaLists.has(query)) {
      const mql = new FakeEventTarget();
      mql.media = query;
      mql.onchange = null;
      // Getter vivo (Object.assign copiaría el valor del momento).
      Object.defineProperty(mql, 'matches', { get: () => !!mediaState.get(query), enumerable: true });
      mql.addListener = (fn) => mql.addEventListener('change', fn);
      mql.removeListener = (fn) => mql.removeEventListener('change', fn);
      mediaLists.set(query, mql);
    }
    return mediaLists.get(query);
  }

  // ---- observadores
  const ioInstances = new Set();
  class IntersectionObserver {
    constructor(cb, opts) { this.cb = cb; this.opts = opts || {}; this.targets = new Set(); ioInstances.add(this); }
    observe(el) { this.targets.add(el); }
    unobserve(el) { this.targets.delete(el); }
    disconnect() { this.targets.clear(); ioInstances.delete(this); }
    takeRecords() { return []; }
  }
  const roInstances = new Set();
  class ResizeObserver {
    constructor(cb) { this.cb = cb; this.targets = new Set(); roInstances.add(this); }
    observe(el) { this.targets.add(el); }
    unobserve(el) { this.targets.delete(el); }
    disconnect() { this.targets.clear(); roInstances.delete(this); }
  }

  // ---- almacenamiento
  const storageMap = new Map();
  const throwing = options.storage === 'throw';
  const guard = () => { if (throwing) throw new Error('SecurityError: almacenamiento bloqueado (simulado)'); };
  const localStorage = {
    getItem(k) { guard(); return storageMap.has(k) ? storageMap.get(k) : null; },
    setItem(k, v) { guard(); storageMap.set(String(k), String(v)); },
    removeItem(k) { guard(); storageMap.delete(k); },
    clear() { guard(); storageMap.clear(); },
    key(i) { guard(); return [...storageMap.keys()][i] ?? null; },
    get length() { guard(); return storageMap.size; },
  };

  // ---- estilos calculados
  const cssVars = new Map(Object.entries(options.cssVars || {}));
  function getComputedStyle() {
    return { getPropertyValue: (name) => (cssVars.has(name) ? ` ${cssVars.get(name)}` : '') };
  }

  // ---- temporizadores falsos
  function setTimeout(fn, ms = 0, ...args) {
    const id = ++timerSeq;
    timers.push({ id, at: clock.now + Math.max(0, Number(ms) || 0), fn, args, every: null });
    return id;
  }
  function setInterval(fn, ms = 0, ...args) {
    const id = ++timerSeq;
    const every = Math.max(1, Number(ms) || 0);
    timers.push({ id, at: clock.now + every, fn, args, every });
    return id;
  }
  function clearTimeout(id) {
    const i = timers.findIndex((t) => t.id === id);
    if (i >= 0) timers.splice(i, 1);
  }
  function requestAnimationFrame(cb) {
    const id = ++rafSeq;
    rafQueue.push({ id, cb });
    return id;
  }
  function cancelAnimationFrame(id) {
    const i = rafQueue.findIndex((r) => r.id === id);
    if (i >= 0) rafQueue.splice(i, 1);
  }

  const consoleProxy = {};
  for (const level of ['error', 'warn', 'log', 'info', 'debug']) {
    consoleProxy[level] = (...args) => {
      (captured[level] || (captured[level] = [])).push(args);
      if (options.echo) console[level](...args);
    };
  }

  const sandbox = {
    document,
    navigator: { userAgent: 'node-vm', language: 'es-ES', languages: ['es-ES', 'es'] },
    location: { href: 'file:///index.html', protocol: 'file:', hash: '', pathname: '/index.html', search: '' },
    history: { replaceState() {}, pushState() {}, state: null },
    console: consoleProxy,
    performance: { now: () => clock.now },
    matchMedia,
    IntersectionObserver: options.intersection === false ? undefined : IntersectionObserver,
    ResizeObserver: options.resizeObserver === false ? undefined : ResizeObserver,
    localStorage,
    getComputedStyle,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval: clearTimeout,
    requestAnimationFrame,
    cancelAnimationFrame,
    devicePixelRatio: options.dpr || 1,
    innerWidth: 1440,
    innerHeight: 900,
    Event: FakeEvent,
    CustomEvent: FakeEvent,
    KeyboardEvent: FakeEvent,
    PointerEvent: FakeEvent,
    MouseEvent: FakeEvent,
    queueMicrotask,
    structuredClone,
    Intl,
    TextEncoder,
    TextDecoder,
    ...(options.globals || {}),
  };
  // window también es un EventTarget (resize, keydown…).
  const winTarget = new FakeEventTarget();
  sandbox.addEventListener = winTarget.addEventListener.bind(winTarget);
  sandbox.removeEventListener = winTarget.removeEventListener.bind(winTarget);
  sandbox.dispatchEvent = winTarget.dispatchEvent.bind(winTarget);

  const context = vm.createContext(sandbox, { name: 'dsl-test' });
  vm.runInContext(
    'globalThis.window = globalThis; globalThis.self = globalThis; globalThis.globalThis = globalThis;',
    context,
  );
  if (!options.allowRandom) {
    vm.runInContext(
      "Math.random = function () { throw new Error('Math.random está prohibido: use DSL.util.mulberry32(semilla).'); };",
      context,
    );
  }
  const window = vm.runInContext('globalThis', context);

  /* -------- controles del entorno para las pruebas */
  const env = {
    context,
    window,
    document,
    clock,
    console: captured,
    FakeEvent,
    /** Ruta absoluta de un archivo del proyecto. */
    path: (rel) => path.resolve(ROOT, rel),
    /** Carga más scripts en el mismo contexto. */
    load(files) {
      for (const f of [].concat(files)) {
        const abs = path.resolve(ROOT, f);
        vm.runInContext(fs.readFileSync(abs, 'utf8'), context, { filename: abs });
      }
      return window.DSL;
    },
    /** Evalúa código en el contexto y devuelve el resultado. */
    run(code) { return vm.runInContext(code, context); },
    /** Avanza el reloj ms milisegundos ejecutando los temporizadores vencidos en orden. */
    tick(ms = 0) {
      const end = clock.now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at || a.id - b.id);
        const next = timers[0];
        if (!next || next.at > end) break;
        clock.now = next.at;
        if (next.every) next.at += next.every;
        else timers.shift();
        next.fn(...next.args);
      }
      clock.now = end;
    },
    /** Ejecuta un frame: avanza ms (16 por defecto) y llama a los callbacks de rAF pendientes. */
    frame(ms = 16) {
      env.tick(ms);
      const queue = rafQueue.splice(0, rafQueue.length);
      for (const r of queue) r.cb(clock.now);
      return queue.length;
    },
    frames(n, ms = 16) {
      let calls = 0;
      for (let i = 0; i < n; i++) calls += env.frame(ms);
      return calls;
    },
    pendingFrames: () => rafQueue.length,
    pendingTimers: () => timers.length,
    /** Cambia una media query y dispara 'change' a sus oyentes. */
    setMedia(query, matches) {
      mediaState.set(query, !!matches);
      const mql = mediaLists.get(query);
      if (mql) {
        const ev = new FakeEvent('change', { matches: !!matches, media: query });
        mql.dispatchEvent(ev);
        if (typeof mql.onchange === 'function') mql.onchange(ev);
      }
    },
    /** Simula ocultar/mostrar la pestaña (visibilitychange). */
    setHidden(hidden) {
      document.hidden = !!hidden;
      document.visibilityState = hidden ? 'hidden' : 'visible';
      document.dispatchEvent(new FakeEvent('visibilitychange'));
    },
    /** Notifica a los IntersectionObserver que observan el elemento. */
    intersect(el, isIntersecting = true) {
      for (const io of [...ioInstances]) {
        if (io.targets.has(el)) io.cb([{ target: el, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 }], io);
      }
    },
    /** Cambia el tamaño de un elemento y notifica a los ResizeObserver. */
    resize(el, width, height) {
      el.clientWidth = width;
      el.clientHeight = height;
      for (const ro of [...roInstances]) {
        if (ro.targets.has(el)) ro.cb([{ target: el, contentRect: { width, height, x: 0, y: 0, top: 0, left: 0 } }], ro);
      }
    },
    setCssVar(name, value) { cssVars.set(name, value); },
    storage: storageMap,
    /** Dispara un evento sobre un nodo: env.fire(el, 'keydown', { key: 'ArrowRight' }). */
    fire(node, type, init = {}) {
      return node.dispatchEvent(new FakeEvent(type, { bubbles: true, ...init }));
    },
    /** Marca el documento como cargado y dispara DOMContentLoaded. */
    domReady() {
      document.readyState = 'interactive';
      document.dispatchEvent(new FakeEvent('DOMContentLoaded'));
      document.readyState = 'complete';
    },
  };
  return env;
}

/**
 * Carga scripts del proyecto (rutas relativas a la raíz) y devuelve { DSL, window, document, env }.
 * ns.js se antepone automáticamente si no está en la lista (options.withNs = false lo evita).
 */
export function loadDSL(files = [], options = {}) {
  const list = [].concat(files);
  if (options.withNs !== false && !list.includes(NS)) list.unshift(NS);
  const env = createEnv(options);
  env.load(list);
  return { DSL: env.window.DSL, window: env.window, document: env.document, env };
}

/**
 * Copia profunda a objetos del reino de Node. Los arrays/objetos creados dentro del contexto vm
 * tienen otros prototipos y assert.deepStrictEqual los considera distintos de los literales del test:
 *   assert.deepStrictEqual(toPlain(DSL.core.numeric.poly.mul([1, 1], [1, -1])), [1, 0, -1]);
 * Conserva NaN, ±Infinity y -0; las funciones se sustituyen por '[Function]'; los ciclos lanzan.
 */
export function toPlain(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' ? '[Function]' : value;
  }
  if (seen.has(value)) throw new Error('toPlain: estructura cíclica');
  seen.add(value);
  let out;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    out = Array.from(value, (v) => toPlain(v, seen));
  } else {
    out = {};
    for (const k of Object.keys(value)) out[k] = toPlain(value[k], seen);
  }
  seen.delete(value);
  return out;
}

export { FakeElement, FakeEvent, FakeDocument };
