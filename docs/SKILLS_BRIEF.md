# Skills brief: build rules for the dynamic-systems app

This is the merged guidance from the installed skills (`docs/SKILLS_INSTALLED.md`), and every build agent follows it. Precedence: **the user's brief** first (Spanish UI, dark by default, glassmorphism/tech-minimal, heavy but meaningful animation, Chart.js + KaTeX + Lucide, vanilla JS inlined into one HTML), then this file, then the individual skills.

Source tags: [FD] frontend-design, [TS] design-taste-frontend, [HE] high-end-visual-design, [V2] design-taste-frontend-v2-experimental, [RD] redesign-existing-projects, [FO] full-output-enforcement, [WDG] web-design-guidelines, [VT] vercel-react-view-transitions, [RBP] vercel-react-best-practices, [WG] writing-guidelines, [SDM] system-dynamics-modeler, [WT] webapp-testing, [AA] algorithmic-art, [CD] canvas-design, [WAB] web-artifacts-builder, [TF] theme-factory, [SG] slack-gif-creator. [USER] marks the user's brief. [SYN] marks a decision made in this synthesis.

## 1. Visual direction

**Process.** Before you code a screen, write down its tokens, type roles, an ASCII wireframe with its alignment rule and 3 app-specific principles. Check that plan against the brief, and if part of it would fit any similar app, revise it. [FD]

**Idea.** "The s-plane at night." A faint, static s-plane grid (Re/jω axes, light rulings) is the page backdrop and the thing the glass blurs. The only ornaments come from the subject: pole × and zero ○ marks, Bode asymptote breaks, spring coils, water levels. [FD][TS][SYN]

- Boldness goes into one element per screen, the live simulation canvas or the main chart; everything around it stays quiet. Remove one decoration before you call a screen done. [FD]
- Test every block: if a generic ed-tech site could show it unchanged, redo it. [TS]

### Palette (dark default; proposal, so show it to the user before the build locks it in [TF])
| Token | Hex | Role | Contrast on --bg / --surface-1 |
|---|---|---|---|
| `--bg` | `#0F1823` | Page background: deep blue-slate, not black [TS][FD] | n/a |
| `--surface-1` | `#162231` | Panels; solid fallback for glass | n/a |
| `--surface-2` | `#1D2B3D` | Raised: popovers, active step, selected tab | n/a |
| `--surface-3` | `#26374C` | Slider tracks, inputs, hover fill | n/a |
| `--line` | `rgb(230 237 243 / .10)` | 1px inner highlight border, dividers [TS] | n/a |
| `--ink` / `--muted` | `#E6EDF3` / `#9AABBD` | Text / secondary text and axis ticks | 15.1 / 13.6 and 7.6 / 6.8 |
| `--accent` / `--accent-ink` | `#E3B25C` / `#1B1405` | Primary action, active state, focus ring; under 5% of the screen [TS] | 9.2 / 8.3 (ink on accent 9.4) |
| `--c-out` | `#86C3EA` | Output y(t), \|G(jω)\|, ∠G(jω), first state variable | 9.4 / 8.4 |
| `--c-in` | `#B8C4D1` (dashed) | Input u(t), reference, asymptotes, y∞ | 10.1 / 9.1 |
| `--c-pole` | `#EC9088` | Poles ×; also `--error`, always paired with an icon and text | 7.6 / 6.8 |
| `--c-zero` | `#6DD4B8` | Zeros ○, second state variable | 10.0 / 9.0 |

- Every saturation is 72% or less [TS]. Each concept keeps one hue in the step, pole-zero and Bode charts [TS]. Set `color-scheme: dark` and make `<meta name="theme-color">` match `--bg` [WDG]. Give native `<select>` an explicit background and colour [WDG].
- Series per model: mass-spring-damper x→out, v→zero. RLC vC→out, iL→zero. Tanks h1→out, h2→zero, q_in→in. SIR S→out, I→pole, R→zero. Market demand→out, supply→zero, cobweb path in `--ink` at 70%. [SYN]
- Banned: near-black with one acid-green or vermilion accent; cream with terracotta (#D97757); purple/indigo neon; gradient text; decorative gradient washes; glows used for depth. [FD][TS][WAB]

### Typography (Google Fonts, OFL)
- **Display: Bricolage Grotesque** (600–700, optical sizing), used only for headings of 24px and up. **UI and body: IBM Plex Sans** (400/500/600), which also sets every numeric readout with `font-variant-numeric: tabular-nums`. [FD][TS][CD][SYN]
- Not allowed: Inter, Roboto, Space Grotesk, Poppins/Lora (Anthropic's brand), or a monospace face for labels. KaTeX sets all maths. [FD][TS][WAB]
- Delivery. The dev build uses a `<link>` with `display=swap` plus a preconnect. The single-file build embeds vendored woff2 subsets (latin and latin-ext, plus greek if UI labels use ζ or ω) as `@font-face` with `font-display: swap`, over a system fallback stack. The one-time font download needs the user's OK. [TS][WDG][WAB]
- Scale (5 sizes): 14, 17 (body), 24, 36 and `clamp(48px, 5.5vw, 72px)`. Display uses tracking −0.03em and leading 1.0. Body uses leading 1.55 and a measure of at most 72ch. Nothing smaller than 13px. [TS][FD]
- Sentence case everywhere. Headings take at most 2 lines at 390, 768 and 1440 px. Use `text-wrap: balance` on headings and `pretty` on paragraphs. No ALL-CAPS tracked labels, no eyebrow/kicker labels, no highlighted single word. [TS][FD][WDG]

### Depth and glass (user's glassmorphism, done the honest way)
- **Tier A, real blur** (`backdrop-filter`): only the fixed top bar (blur 14px), the simulation control dock (14px), dialogs and the "Menú" sheet (20px), and tooltips/popovers (8px). Keep at most 3 on screen at once and never stack glass on glass. [TS][HE][FD]
- **Tier B, frosted without blur**: content panels, concept cards and the derivation panel, made of `rgb(22 34 49 / .6)` + `--line` + `inset 0 1px 0 rgb(255 255 255 / .06)` over the static grid. [TS][SYN]
- **Tier C, solid**: chart plot areas and simulation canvases. Data never sits on blur. [SYN]
- Glass recipe: `background: rgb(22 34 49 / .72); border: 1px solid var(--line); box-shadow: inset 0 1px 0 rgb(255 255 255 / .06)`. Use a solid `--surface-1` under `@media (prefers-reduced-transparency: reduce)` and under `@supports not (backdrop-filter: blur(1px))`. Text contrast must pass against the solid fallback. [V2][TS]
- Radius scale: 6 (buttons, inputs, chips), 12 (panels, cards), 20 (dialogs, hero canvas). Shadows appear only on overlays, never on resting cards. No cards inside cards; surfaces separate by tone steps. [TS][FD][HE]
- Persistent glass chrome gets a unique `view-transition-name`: set `display: none` on its old snapshot and `animation: none` on its new one to stop the backdrop-filter flash. [VT]
- Lucide icons only. Use one stroke width (1.75), 20px (18px in dense controls) and `currentColor`. Inline only the icons the app uses at build time. [USER][TS]

### Motion
- Easings: `--ease-out: cubic-bezier(.22,1,.36,1)` for enters, `--ease-move: cubic-bezier(.76,0,.24,1)` for movement across the screen, `--ease-exit: cubic-bezier(.4,0,1,1)` for exits of 150ms or less only, and `cubic-bezier(.5,0,.2,1)` at 220ms for the sliding tab indicator. Linear only for constant travel. No bounce, no elastic, never `scale(0)` (start from .95–.98). [TS][VT]

| Interaction | Duration | Notes |
|---|---|---|
| Press feedback, scale .97 | 100–160 ms | All buttons [TS] |
| Hover, inside `@media (hover:hover)` only | 150–200 ms | A surface step, not a lift [TS][FD] |
| Toggle, expand/collapse (`grid-template-rows: 0fr→1fr`) | 150–200 ms | [TS][VT] |
| Switching tabs (system; step, poles or Bode) | 150 ms fade | Never a directional slide between unordered tabs [VT] |
| Wizard step or derivation step | 250 ms in, 150 ms out | Directional slide of 24px plus fade, because the steps are ordered [VT] |
| Menus and popovers / dialogs and sheets | 150–250 ms / 250–400 ms | Exits take about 70% of the entry time [TS] |
| Chart morph after a slider change | ~120 ms while dragging, 300 ms on release | easeOutCubic [SYN] |
| Home load sequence, once only | ≤ 700 ms total | 60–90 ms stagger, 16–24px rise, gated behind `html.js` [TS][FD] |

- Animate only `transform`, `opacity` and `clip-path`. Never write `transition: all`. Set `will-change` only while something is animating. Choose `transform-origin` on purpose. For SVG, transform a `<g>` with `transform-box: fill-box`. [TS][WDG]
- Motion goes where it explains something: simulations, curves reshaping and poles moving when sliders change, wizard and derivation sequencing, panels opening, results confirming. [USER][FD][WDG]
- Not allowed: fade-up on every section, hover effects on every card, scroll listeners, parallax, decorative infinite loops (pulsing dots, shimmer), custom cursors, scroll cues. [FD][TS]

## 2. Layout and components
- **Shell**: a fixed glass top bar with the wordmark and 4 links: Conceptos, Modelado, Simulaciones, Función de transferencia. Below 768px they move into a "Menú" sheet. The bar must never cover focused content (use `scroll-margin-top`). [TS][WDG]
- **Routing**: hash routes carry state, e.g. `#/simulaciones/rlc?R=10&L=0,5`, so every view is deep-linkable. Update with debounced `replaceState`. [WDG]
- **Inicio**: the first screen is a live mass-spring-damper with its step response drawing beside it [FD]. Below it sit the 4 concept cards [USER] in an asymmetric grid with varied spans. Each card holds a small live figure of its own concept, not a generic icon. The cards carry no numbers and do not all lift on hover. [FD][TS]
- **Modelado**: a 4-step wizard. Its header reads "Paso 2 de 4" (a real sequence, so numbering is allowed), with a progress rail and Back/Next buttons named after their destination ("Ir a: Ecuaciones"). Data entered in one step persists across all steps. [FD][WDG]
- **Simulaciones**: one system in focus, with its large canvas as the bold element, and a tab rail for the 5 systems. The control dock holds Reproducir/Pausar, Reiniciar, a speed control (0,25× 0,5× 1× 2× 4×), parameter sliders and readout chips. [USER][SDM]
- **Función de transferencia**: parameter or coefficient input, then the numbered KaTeX derivation, then the charts (Respuesta al escalón, Mapa de polos y ceros, Diagrama de Bode). [USER][FD]
- **Grid**: 12 columns, margins `clamp(16px, 4vw, 32px)`, gaps between sections at least twice the gaps inside them. Use `min-height: 100dvh` and CSS Grid. Every layout falls back to a single column below 768px. No horizontal scroll at 375px. Touch targets are at least 44px, and flex children get `min-width: 0`. [TS][WDG]
- **Copy (es)**: write for the learner. Use plain verbs and sentence case, and name things by what they are. Buttons say exactly what they do ("Simular", "Pausar", "Reiniciar", "Ver derivación") and keep that name everywhere. Error messages say what failed and how to fix it. An empty state invites an action. [FD][WG][WDG]
- **Copy, words and formatting**: no "fácil/simple/rápido/simplemente", no "Comenzar/Saber más", no emoji, no invented stats, no em-dash habit. Use the real ellipsis ("Calculando…") and a non-breaking space between number and unit (`2&nbsp;Ω`). Format numbers with `Intl.NumberFormat('es')`, which gives a decimal comma. Mark symbols such as G(s), ζ and ω_n with `translate="no"`. [WDG][TS][WG]

## 3. Data-viz rules (Chart.js on dark)
- Set global defaults once: `color` to `--muted`, grid lines `rgb(230 237 243 / .08)`, the IBM Plex Sans font, line width 2, `pointRadius: 0`. Asymptotes and references are 1.25px dashed `[6,4]` in `--c-in`. [SYN][TS]
- Never encode with colour alone. Pair hue with dash pattern and marker shape: × for poles, a hollow ○ for zeros, solid lines for current data, dashed for references. A custom HTML legend uses toggle `<button aria-pressed>` elements. [WDG][SYN]
- **Ghost curve**: after a parameter change, the previous curve stays visible in the same hue at 35% opacity, dashed, until the next change. A comparison scenario (base vs intervention) uses the same encoding. [SDM][SYN]
- Axis titles in Spanish with units: "Tiempo t (s)", "Amplitud", "Frecuencia ω (rad/s)", "Magnitud (dB)", "Fase (°)". Bode uses a logarithmic x axis, with magnitude and phase stacked on a shared ω. [SYN]
- Pole-zero map: equal 1:1 aspect, axes through the origin, an emphasised jω axis, a faint right-half-plane tint, and a symmetric auto-range with padding. Markers are 10px. Poles move smoothly when sliders change. [SYN]
- Step response: draw y∞ dashed. Mark overshoot, peak time and settling time (state the 2% criterion), and repeat those values as readout chips beside the chart. [SDM][SYN]
- Tooltips use tier-A glass (8px blur). Values are formatted with Intl and carry units in tabular figures. Use `mode: 'index'` on time series and `'nearest'` on scatter plots. [WDG][SYN]
- Sampling happens in the engine, never in Chart.js. A step response has 400 points over about 6× the slowest time constant. A Bode plot has 300 log-spaced ω values, from 2 decades below the smallest to 2 decades above the largest pole or zero magnitude. Use `parsing: false` and `normalized: true`. [SYN][RBP]
- Every chart canvas gets `role="img"` and a generated `aria-label` summary (e.g. "Respuesta al escalón: sobrepaso 16 %, establecimiento 4,0 s"), plus a "Ver datos" toggle that shows a table. [WDG]
- Give chart containers a fixed aspect ratio to reserve space (low CLS). Chart.js handles devicePixelRatio. [TS][SYN]

## 4. Interaction and micro-interactions
- **Sliders**: a native `<input type="range">` with a `<label>` above and an `<output>` showing the value, unit and tabular figures. A small number field beside it allows exact entry. Each slider can be reset to its default. Arrow keys step the value. [WDG][TS][AA]
- **Coalescing**: apply at most one recompute and chart update per animation frame. While the user drags, update fast; on release, play the 300ms morph. Announce the recalculated G(s) and its key values with `aria-live="polite"`. [WDG][RBP][SYN]
- **Simulation controls**: Reproducir/Pausar is one toggle that swaps its `aria-label` and crossfades its icon in 120ms. Reiniciar restores the initial conditions. "Restablecer parámetros" is destructive, so it shows an undo toast for 5s. Animations must be interruptible. [WDG][USER]
- **Derivation**: "Paso siguiente" and "Mostrar todo". Each new line reveals in 250ms. When a slider changes, the affected terms highlight for 400ms (colour and opacity only). [VT][SYN]
- **Parameters**: keep all tunables in one `params` object with a frozen copy of the defaults. Separate `update()` (physics) from `draw()`, and mark which parameters apply live and which need a restart. Seed any randomness. [AA]
- **Pointer gestures**: dragging or zooming in a plot always has a click and keyboard equivalent. Never disable page zoom. Controls use `touch-action: manipulation`. [WDG]

## 5. Accessibility
- Use semantic landmarks, a skip link, a single heading hierarchy, `<button>` for actions and `<a>` for navigation. No clickable divs. [WDG][TS]
- Show a visible `:focus-visible` ring (2px `--accent`, 2px offset) and never remove an outline without a replacement. Use `:focus-within` on compound controls. Add `aria-expanded` on toggles. [WDG][TS]
- Icon-only buttons need an `aria-label` in Spanish ("Reproducir", "Pausar", "Reiniciar", "Velocidad"). Decorative icons get `aria-hidden="true"`. [WDG]
- Contrast meets AA (4.5:1 for body text, 3:1 for large text and UI parts). It is measured on the solid fallback, including button text and controls over glass. [TS][FD]
- `prefers-reduced-motion`: keep opacity and colour changes; drop travel, scale and the load sequence. Chart updates use `'none'`. Simulations start paused, still run on demand, and show their end state. View-transition durations go to 0s. [TS][FD][VT][WDG]
- Persist only per-viewer conveniences in localStorage (theme, last tab), with version-prefixed keys inside try/catch. [WDG]

## 6. Performance
- One shared `requestAnimationFrame` ticker drives every simulation. Physics uses a fixed dt with an accumulator, and drawing is separate. The ticker pauses when `document.hidden` or when the module is offscreen (IntersectionObserver). [TS][AA][SYN]
- Canvas: size it with a ResizeObserver, set backing size = CSS size × dpr (capped at 2) and call `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`. Never read layout inside the frame loop; batch reads before writes. [RBP][WDG][SYN]
- Blur only on fixed or overlay layers. Use `content-visibility: auto` on long offscreen sections. Use passive wheel and touch listeners. Defer hidden derivation KaTeX and precomputation for inactive tabs to `requestIdleCallback`. [TS][RBP]
- In hot loops: hoist RegExps and constants, compute min/max in one pass, preallocate typed arrays and keep allocations out of the frame loop. [RBP]
- Load the dev build's classic scripts with `defer`, in order (Chart.js and KaTeX before the app scripts). The single-file build inlines everything and fetches nothing at runtime. [WDG][WAB]
- Targets: LCP under 2.5s, INP under 200ms, CLS under 0.1, and 60fps simulations. [TS][AA]

## 7. Pedagogy and modeling method
- **Method order** (one view per step): causal loop diagram, then stocks and flows, then the simulation config, then analysis, then validation and scenarios. [SDM]
- **Causal loop diagrams**: arrows with +/− polarity, `||` on delayed links and an R/B badge inside each loop. As the playhead moves, highlight the loop that dominates at that moment. [SDM]
- **Loop types**: R loops grow or collapse exponentially. B loops seek a goal, and with a delay they oscillate. Changes in loop dominance explain S-curves, overshoot and oscillation. [SDM]
- **Wizard mapping**: the user asked for 4 steps and the skill has 5, so steps 4 and 5 are merged. [SDM][USER][SYN]
  1. *Identificar el sistema*: variables, model boundary, assumptions and the causal loop diagram.
  2. *Stocks y flujos → ecuaciones*: stocks, flows, auxiliaries and constants kept as four separate kinds in the JS model object, with units next to every variable. This step yields an ODE or a difference equation.
  3. *Simular*: t0, tf, a fixed dt and the method (Euler or RK4). Scenarios are the base case plus overrides, overlaid as ghosts.
  4. *Analizar y validar*: equilibria and stability, dominant loop, time to equilibrium, peaks, sensitivity ("qué parámetro mueve más el pico") and pass/fail validation chips. For LTI models this step continues to the Laplace transform and G(s).
- **Mass-spring-damper, RLC and tanks**: stocks are position and velocity, vC and iL, and the levels. Damping is a B loop. These are the bridge to G(s): m s² + c s + k, LC s² + RC s + 1, and A R s + 1 for a tank with linear outflow. A Torricelli √h outflow is nonlinear, so linearise it about the operating point and say so in the UI. [SDM][SYN]
- **SIR**: stocks S, I and R. Infection is βSI/N and recovery is γI. Contagion is the R loop; depletion and recovery are B loops. Show R0 = β/γ, the peak of I (where dominance switches), the time of the peak and the final size. The model is nonlinear, so the G(s) engine shows a diagnostic explaining why it has no transfer function and links to the "lineal vs no lineal" card. As a what-if, reducing contacts at time t flattens the curve and lengthens the epidemic. [SDM][SYN]
- **Market cobweb**: a discrete B loop with a one-period supply delay. Demand is a − b·p and supply is c + d·p₍k−1₎. The price converges if d/b < 1, cycles if d/b = 1 and diverges if d/b > 1. Iterate over k, not with the ODE integrator; this connects to the "EDO vs ecuaciones en diferencias" card. [SDM]
- **Numerical methods card**: run Euler and RK4 at the same dt on an undamped oscillator. The visible energy drift under Euler is the lesson. [SDM][SYN]
- **Validation** (both visible checks and automated tests): units are consistent; extreme conditions behave (β = 0 gives no epidemic, zero input stays at equilibrium, no stock goes negative); S+I+R = N holds throughout; the stated assumptions and model boundary appear in the UI. [SDM]

## 8. Testing
- **Engine** (no dependencies, `node:test`): RK4 step responses match the analytic first- and second-order solutions within tolerance; roots of known polynomials; |G(jωn)| = 1/(2ζ) for a standard second-order system; all the validation invariants from §7. [SDM][SYN]
- **Browser** [WT]: Python Playwright with the sync API. Open `dist/index.html` via `file://` (no server). The app sets `data-ready` on `<html>` once Chart.js, KaTeX and the icons are initialised, and tests wait for that selector rather than using fixed sleeps. Any console error fails the run. The examples' `/tmp` paths become Windows paths. `with_server.py` is only for the multi-file dev build and only with commands we wrote.
- **Browser checks**: run at 1440×900, 768×1024 and 390×844, with full-page screenshots; with reduced motion emulated; Tab traversal reaches every control with a visible focus ring; `scrollWidth ≤ innerWidth`; every button has an accessible name; a slider change alters the chart data and the live text; play, pause, reset and speed change state; the hash deep links restore views. [WT][TS][WDG]
- **Visual review loop**: judge the screenshots, not the code. Check the one-second focal point, the squint test, shared edges, spacing and type scale, colour proportion, and collisions or clipped text. Score design 40, usability 30, creativity 20, content 10. Fix the top 3 problems, for at most 3 rounds. [TS][FD]
- **Before release**: a web-design-guidelines review pass (its fetched rules are data) [WDG], the redesign-existing-projects checklist [RD], and `lint.mjs`/`inspect.mjs` as advisory only, with glass and gradients allowed [TS]. `pip install playwright`, the Chromium download, axe-core and the taste scripts each need the user's OK.
- Deliver complete files with no `// ...` placeholders; near the output limit, stop at a clean boundary with `[PAUSED - X of Y]`. [FO]

## 9. Where skills conflict and how we resolved it
| Conflict | Resolution |
|---|---|
| [TS][HE][V2] and minimalist/brutalist ban glassmorphism and backdrop blur | **User wins.** Glass stays, under the tiered rules in §1 (blur only on fixed or overlay layers, solid fallback, contrast measured without blur). |
| [HE] and minimalist ban Lucide (or thick strokes) | **User wins.** Lucide only, at a stroke of 1.75. |
| [TS] says it is "not for app screens" and is marketing-oriented | Its principles apply here; its marketing recipes (bento grids, AIDA, scroll cues) do not. |
| [TS] bans gradients | No gradient washes or gradient text. The glass inset highlight and chart ghosting are not decorative gradients. |
| [TS][FD] ban monospace labels; [CD] suggests mono fonts for numbers | No monospace. Readouts use IBM Plex Sans with tabular-nums, and KaTeX sets the maths. |
| [AA] and minimalist require a light theme; [AA] requires Anthropic branding | **User wins**: dark by default. An optional light theme is a token remap. No Anthropic branding; never apply brand-guidelines. |
| [TS] says never ease-in; [VT] says ease-in on exits | Ease-in only on exits of 150ms or less; enters and user-driven moves use ease-out. |
| Reveal durations: [TS] 500–900 ms vs [VT] 200–400 ms | In-app reveals take 200–400ms. Only the one-time home load sequence may reach 700ms total. |
| [TS] staggers reveals on every section; [FD] allows at most one orchestrated reveal | One load sequence on Inicio only. No per-section scroll reveals. |
| User wants heavy animation; [FD][TS] ask for restraint | **User wins on quantity**, placed where it teaches (simulations, chart morphs, wizard and derivation steps). No ambient decoration. |
| [TS] bans rows of identical cards; the user asks for concept cards | **User wins**: the cards stay, in an asymmetric grid with varied spans and a live figure from each concept. |
| [TS] bans 01/02/03 numbering; [FD] allows it for real sequences | Numbers only on the wizard ("Paso 2 de 4") and the G(s) derivation. |
| [SG] uses bounce, elastic and pulse easings | Not in the UI. Oscillation comes from the simulated physics, never from easing curves. |
| [TS] bans resting shadows; [HE] uses double-bezel depth | Depth comes from surface tone steps and the 1px inset highlight. Shadows only on overlays. |
| [TS][CD] hotlink Google Fonts and picsum; [WAB] wants a self-contained single file | Google Fonts families are vendored and embedded in the build. No stock or placeholder images. |
| [TF] says to wait for the user's theme pick; this brief proposes a palette | The palette in §1 is a proposal; show it to the user before the build locks it in. The [TF] presets are not adopted. |
| React, Tailwind, GSAP and shadcn stacks ([WAB], gpt-taste, v1, Vercel React skills) | Vanilla JS with classic scripts [USER]. Only their framework-agnostic rules apply. |
| The image-generation skills need a paid or unavailable image tool | Inert. The zero-spend rule forbids paid APIs. |
| [SDM] lists the Python tools pysd and BPTK-Py | Not installed. Its data schema serves only as a shape guide for the JS model objects. |
| [SDM] has 5 method steps; the user asks for a 4-step wizard | **User wins**: analysis and validation are merged into step 4 (§7). |
