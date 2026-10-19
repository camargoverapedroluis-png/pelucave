# API: `js/core/ns.js` (owner: architect)

`ns.js` is the first own script. It creates `window.DSL` with these parts:

- the namespaces;
- the event bus;
- the preferences (reduced motion and theme);
- a small set of stable utilities.

It does not overwrite an existing `window.DSL`; it fills in what is missing. Tests: `tests/unit/ns.test.mjs`.

## Namespace slots

```
DSL.version            '1.0.0'
DSL.core   = {}        math fills numeric, tf, latex
DSL.ui     = {}        design-system fills components and shell
DSL.viz    = { scenes: {} }   charts fills DSL.viz.charts; scenes fills DSL.viz.scenes
DSL.systems = {}       systems
DSL.sections = {}      section owners
DSL.app    = {}        app.js: { ready, handles }
DSL.util, DSL.bus, DSL.prefs   this file
```

## `DSL.bus` (event bus)

| Signature | Description |
|---|---|
| `on(event, fn) → unsubscribe()` | Subscribes `fn(payload, event)`. `unsubscribe` is idempotent. Throws `TypeError` if `fn` is not a function |
| `once(event, fn) → unsubscribe()` | Calls `fn` once, then unsubscribes it |
| `off(event, fn)` | Removes one subscription |
| `emit(event, payload) → number` | Calls the handlers synchronously, in subscription order, and returns how many ran. A handler that throws is reported with `console.error('[DSL] manejador de «event»:', err)`, and the remaining handlers still run. A handler removed during the emission is not called |
| `count(event) → number` | Number of current handlers |
| `clear([event])` | Removes the handlers for one event, or for all events |

`DSL.util.emitter()` creates an independent emitter with the same API.

The events are listed in `docs/ARCHITECTURE.md` §13. `ns.js` itself emits:

- `motion:change` `{ reducedMotion }`
- `theme:change` `{ theme }`

## `DSL.prefs`

| Member | Description |
|---|---|
| `reducedMotion: boolean` | Kept live from `matchMedia('(prefers-reduced-motion: reduce)')`. Every change emits `motion:change` |
| `setReducedMotion(value)` | `true`/`false` forces the value (for an in-app control or a test); `null` hands control back to the system |
| `theme: 'dark' \| 'light'` | Initial value from `<html data-theme>` (the inline `<head>` script restores the saved theme before first paint). Defaults to `'dark'` |
| `setTheme(theme, { persist = true }) → theme` | Sets `<html data-theme>` and saves `localStorage['dsl.v1.theme']` (JSON, inside try/catch). It also sets `<meta name="theme-color" content>` to the new `--bg`, and emits `theme:change` if the theme changed. Throws on an unknown theme |
| `toggleTheme() → theme` | Switches dark ↔ light |

## `DSL.util`

### Numbers

| Signature | Description |
|---|---|
| `clamp(x, lo, hi)` | |
| `lerp(a, b, t)` | |
| `invLerp(a, b, x)` | `(x − a)/(b − a)`; returns 0 when `a === b` |
| `formatNumber(x, digits = 4, opts)` | Display text, described in detail below |
| `parseNumber(str) → number` | Lenient parsing of user input, described in detail below |

**`formatNumber` options.** `digits` counts significant digits, from 1 to 15.

| Option | Effect |
|---|---|
| `decimals` | Fixed decimals inside the non-scientific range, without trimming zeros |
| `sci: 'unicode' \| 'e'` | `1.23×10⁻⁴` (default) or `1.23e-4` |
| `sciMin = 1e-3`, `sciMax = 1e6` | Scientific notation is used when `0 < |x| < sciMin` or `|x| ≥ sciMax` |
| `ascii` | `-` instead of the typographic minus `−` (U+2212) |
| `plus` | Adds `+` in front of positive numbers |

**`formatNumber` examples:**

| Call | Result |
|---|---|
| `formatNumber(0.5)` | `'0.5'` |
| `formatNumber(12.3456, 3)` | `'12.3'` |
| `formatNumber(-2.5)` | `'−2.5'` |
| `formatNumber(0.000123)` | `'1.23×10⁻⁴'` |
| `formatNumber(1.5, 4, { decimals: 2 })` | `'1.50'` |

`NaN` gives `'—'`, `±Infinity` gives `'∞'`/`'−∞'`, and a value that rounds to zero never shows a sign. The decimal mark is always the point.

**`parseNumber` rules.** It returns a `number`, or `NaN` when the text is not valid.

- **Accepted:**
  - `,` or `.` as the decimal mark;
  - a leading `+`, `-` or `−`;
  - `e` notation;
  - `1.5×10⁻³`, `2x10^3` and `2*10^(-2)`;
  - surrounding spaces.
- **Rejected:**
  - thousands separators (`1.000,5`);
  - more than one comma;
  - internal spaces;
  - hexadecimal;
  - `Infinity`.
- A JS number is returned unchanged.

### Time

| Signature | Description |
|---|---|
| `now()` | `performance.now()` in milliseconds. Use it only for frame timing |
| `debounce(fn, ms)` | Returns `f`; `fn` runs on the trailing edge with the last arguments. `f.cancel()`, `f.flush()` (runs now and returns the result), `f.pending()` |
| `throttle(fn, ms)` | Returns `f`; `fn` runs on the leading edge at once, and on a trailing edge with the last arguments at the end of the interval. `f.cancel()` |
| `raf(fn)`, `cancelRaf(id)` | `requestAnimationFrame`, with a `setTimeout` fallback |
| `loop(fn, opts) → handle` | **The single shared rAF ticker**, described below |

**The `loop` ticker.** `fn(dt, now)` receives `dt` in seconds: it is 0 on the first frame after `start()` or after resuming, and is clamped to `opts.maxDt` (default 0.1).

- **Options:**
  - `element`: the loop pauses while this element is off-screen, using IntersectionObserver with `rootMargin` (default `'64px'`);
  - `autostart` (default `false`).
- **Pausing.** All loops pause while `document.hidden` is true. One `requestAnimationFrame` serves every active loop, in registration order, and no frame is requested when no loop is active.
- **Handle:**

  | Method | Description |
  |---|---|
  | `start()` | Starts the loop |
  | `stop()` | Stops the loop |
  | `toggle()` | Switches between started and stopped |
  | `isRunning()` | Whether the loop is wanted on |
  | `isActive()` | Whether it is also visible, with the tab shown |
  | `destroy()` | Unregisters the loop; it cannot be started again |

- **Errors.** If `fn` throws, the error is reported with `console.error` and the loop stops.

### Lazy initialisation

| Signature | Description |
|---|---|
| `lazyInit(el, phases, { rootMargin = '200px' }) → { ensure(), done, destroy() }` | Builds a section (or a card) in phases, so it is ready before the visitor gets there. Described below |
| `yieldTask() → Promise` | Gives the main thread back between two pieces of work: `scheduler.yield()` when the browser has it, otherwise a `setTimeout(0)` promise |

**`lazyInit`.** `phases` is a function or an array of functions. Each phase runs exactly once, in order.

- **Near the viewport.** When `el` comes within `rootMargin` of the viewport (`util.onVisible`), every
  remaining phase runs **synchronously**, in that callback.
- **Idle time.** Otherwise the instance joins one FIFO queue shared by the page. The queue starts
  800 ms after `app:ready` (after the hero's load sequence). An instance created after `app:ready` without a
  recorded time (for example in a test page) counts from its own creation. It runs **one phase per idle callback**, in registration order:
  `requestIdleCallback` with a 2000 ms timeout, or `setTimeout` when it does not exist.
- **`ensure()`** runs the remaining phases synchronously (for example before `concepts:open` scrolls to a
  card). **`done`** is `true` once every phase ran. **`destroy()`** stops the observer and leaves the queue;
  phases that did not run never will.
- **End.** After the last phase, `el.dataset.lazy = 'done'`.
- **Errors.** A phase that throws is reported with `console.error('[DSL] lazyInit: la fase i de n falló', err)`;
  that instance stops (`el.dataset.lazy = 'error'`) and the queue moves on to the next one.
- **Without IntersectionObserver** the phases run at once (as `onVisible` does).
- Phases should take about 50 ms or less each at 1× CPU, so no single task blocks input for long.

### Deterministic randomness

| Signature | Description |
|---|---|
| `mulberry32(seed) → rng()` | Uniform values in [0, 1), bit-identical to the reference mulberry32. **`Math.random` is forbidden** in app code; `tests/unit/contract.test.mjs` checks this |
| `gaussian(rng) → number` | Standard normal value (Box–Muller; uses two draws per call) |

### DOM

| Signature | Description |
|---|---|
| `h(tag, props, ...children)` | Creates an HTML element; props are described below |
| `svg(tag, props, ...children)` | The same, in the SVG namespace (`DSL.util.SVG_NS`). Attributes such as `viewBox` keep their case |
| `escapeHtml(s)` | Escapes `& < > " '`; `null`/`undefined` give `''` |
| `uid(prefix = 'dsl') → 'prefix-N'` | A counter for the whole page load, deterministic in load order |
| `cssVar(name, el = <html>) → string` | Trimmed computed value of a custom property. Accepts `'--bg'` or `'bg'`; returns `''` if it is unknown |
| `ready(fn)` | Runs `fn` now if the DOM is parsed, otherwise on `DOMContentLoaded` |
| `onVisible(el, cb(visible, entry), { rootMargin = '0px', threshold = 0, once = false }) → stop()` | Calls `cb` only when visibility **changes**. With `once`, it disconnects after the first visible callback. Without IntersectionObserver it calls `cb(true, null)` synchronously |
| `observeSize(el, cb({ width, height })) → stop()` | ResizeObserver (content box), coalesced to at most one callback per frame. Falls back to window `resize` |
| `fitCanvas(canvas, { width, height, maxDpr = 2 }) → { ctx, width, height, dpr }` | Described below |

**`h` props:**

| Prop | Effect |
|---|---|
| `class` / `className` | A string, or an array (falsy entries are dropped) |
| `style` | A string, or an object: `--custom` and dashed keys go through `setProperty`; other keys are assigned |
| `dataset` | `{ fooBar: 1 }` sets `data-foo-bar="1"` |
| `text` | `textContent` |
| `html` | `innerHTML`. Only for the module's own constant markup |
| `on<Event>` | A function; `onClick` adds a `click` listener |
| `value`, `checked`, `selected`, `indeterminate`, `muted` | Set as DOM properties |
| `true` | Adds an empty attribute |
| `false`, `null`, `undefined` | Omits the attribute |
| anything else | `setAttribute(key, String(value))` |

Children may be nodes, strings or numbers, or nested arrays of them. `null`, `undefined`, `true` and `false` are skipped.

**`fitCanvas`** sizes the backing store to the CSS size × dpr and calls `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`, so you draw in CSS pixels. It reads `clientWidth`/`clientHeight` unless `width`/`height` are passed. Call it from a resize callback, never inside the frame loop.

### Storage

`store` wraps `localStorage` with the key prefix `dsl.v1.`, JSON values and try/catch. It never throws.

| Signature | Description |
|---|---|
| `store.get(key, fallback)` | The stored value, or `fallback` |
| `store.set(key, value) → boolean` | |
| `store.remove(key) → boolean` | |

Only `DSL.prefs.setTheme` uses it. Nothing else is persisted.

## Testing helpers

`tests/helpers/load.mjs` is owned by the architect.

### Loading scripts

```js
import { loadDSL, createEnv, toPlain, SCRIPTS, ROOT } from '../helpers/load.mjs';

const { DSL, env, document, window } = loadDSL(['js/core/numeric.js'], {
  media: { '(prefers-reduced-motion: reduce)': true },  // initial matchMedia state
  cssVars: { '--c-out': '#86C3EA' },                    // values returned by getComputedStyle
  storage: 'memory' | 'throw',                         // 'throw': every localStorage access throws
  readyState: 'complete' | 'loading',
  allowRandom: false,                                  // Math.random throws unless this is true
  intersection: true, resizeObserver: true,            // false removes the observer
  dpr: 1,
  globals: { katex: fakeKatex },                       // extra globals
  echo: false,                                         // also print the context's console output
  withNs: true,                                        // prepend js/core/ns.js
});
```

`SCRIPTS.core` and `SCRIPTS.systems` list the scripts in contract order.

### Controlling the environment

| Control | Effect |
|---|---|
| `env.tick(ms)` | Advances the fake clock and runs the timers that fall due, in order |
| `env.frame(ms = 16)`, `env.frames(n, ms)` | Advances the clock and runs the pending rAF callbacks |
| `env.pendingFrames()`, `env.pendingTimers()` | Counts what is waiting |
| `env.setMedia(query, matches)` | Changes a media query and fires `change` |
| `env.setHidden(bool)` | Fires `visibilitychange` |
| `env.intersect(el, isIntersecting)` | Notifies the IntersectionObservers that watch `el`. **Note:** a `util.loop` created with `{ element }` stays paused until the element is reported visible, so a unit test must call `env.intersect(element, true)` after creating it (charts and sections do this in their setup) |
| `env.resize(el, w, h)` | Notifies the ResizeObservers that watch `el` |
| `env.setCssVar(name, value)` | Changes a value that `getComputedStyle` returns |
| `env.storage` | The `Map` behind the fake `localStorage` |
| `env.console.error`, `.warn`, `.log` | Captured calls, as arrays of argument lists |
| `env.fire(el, type, init)` | Dispatches an event; it bubbles |
| `env.domReady()` | Fires `DOMContentLoaded` |
| `env.load(files)` | Loads more scripts into the same context |
| `env.run(code)` | Evaluates code inside the context |

### Fake DOM

`FakeElement` supports:

- attributes, `classList`, `dataset` and `style` (including `setProperty`);
- child operations;
- events with bubbling;
- simple compound selectors: `tag#id.class[attr="v"]`, plus comma lists;
- `closest`, `matches` and `focus`;
- a `<canvas>` `getContext('2d')` that records every call in `ctx.calls`.

`innerHTML` is not parsed.

### Comparing values from the vm

Arrays and objects created inside the vm have other prototypes, so compare them with `assert.deepStrictEqual(toPlain(x), expected)`. For errors, check the name rather than the class: `assert.throws(fn, { name: 'TypeError' })`.

### Playwright fixtures

`tests/helpers/fixtures.mjs` provides these fixtures:

- `guard` (automatic): fails a test on any console error, page error or network access.
- `gotoApp(hash?, { reducedMotion })`
- `gotoTestPage(name)`
- `appUrl`, `isDist`, and the helper `fileUrl(rel)`

Usage is described in `docs/ARCHITECTURE.md` §15.2.
