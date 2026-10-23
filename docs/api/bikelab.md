# API: `js/sections/bikelab.js` → `DSL.sections.bikeLab` (owner: bikelab)

Laboratorio avanzado de la galería: **dinámica de un marco de doble suspensión, vectores de fuerza y control en
lazo cerrado**. Es el segundo montaje de `#galeria` (`<div data-mount="bikeLab">`, justo después del de la
galería), de modo que la galería existente no cambia: el laboratorio es un módulo encapsulado con su propio
archivo JS, su hoja `css/sections/bikelab.css` (prefijo `bk-`, `@layer sections`, solo tokens) y su lista de iconos
`tools/icons/bikelab.list`. Script clásico (IIFE sobre `window.DSL`, `'use strict'`), funciona desde `file://`.

- **Depende de** `DSL.util` (DOM, `loop`, `fitCanvas`, `observeSize`, `mulberry32`, `lazyInit`), `DSL.ui`
  (`button`, `slider`, `segmented`, `transport`, `readout`, `chip`, `toast`, `icon`), `DSL.viz.charts`
  (`createTimeChart`, `dataToggle`; sin Chart.js las gráficas quedan inertes), `DSL.core.numeric` / `DSL.core.tf`
  (polinomios, raíces, `TransferFunction.stabilityInfo`) y `DSL.core.latex` (KaTeX con respaldo en texto).
- **Pruebas:** `tests/unit/bikelab.test.mjs` (estática, funciones de transferencia, terreno, simulador, montaje en
  el DOM falso) y `tests/e2e/bikelab.spec.mjs` (Playwright: escena, zoom, capas, parámetros en vivo, diagrama con
  ratón y teclado, caída y «Reintentar», movimiento reducido, axe; capturas en `test-results/bikelab/shots/`).
- **Tokens añadidos** (css/tokens.css, ambos temas): `--bk-frame` y `--bk-frame-edge`, el relleno y el borde del
  triángulo principal en el canvas. Los vectores reutilizan los colores de datos: peso `--c-pole`, normales
  `--c-out`, resorte y amortiguador `--c-zero`, inercia y momento `--accent`.

## `DSL.sections.bikeLab`

```js
DSL.sections.bikeLab = { mount(el) → handle, BikeSuspensionLab, helpers };
```

### `mount(el)`

Barato: pinta la cabecera (icono `bike`, `h3` «Laboratorio avanzado: …», resumen, chips), el visor con el `canvas`
y el dock, y deja la raíz `article.bk.is-pending` con una altura mínima por punto de corte. El resto se construye
por **fases** (`DSL.util.lazyInit`, `rootMargin` 200 px; sin él, `util.onVisible`): escena → paneles de
deslizadores → lecturas → gráfica 1 → gráfica 2 → gráfica 3 → funciones de transferencia y diagrama → primer
fotograma y arranque (en pausa con movimiento reducido). `handle.init()` completa las fases en el acto.

**Handle:** `init()`, `lab` (el simulador), `setZoom(on)`, `pick(id, kind?)`, `state()` (`ready, initPhases,
playing, running, zoom, view, pick, braking, t, speed, halted, fall, params, theta, margin, dx, Fs, xt, verdict,
charts[]`) y `destroy()` (bucle, gráficas, controles, observadores, temporizadores y DOM).

### DOM y test ids

```
article.bk[data-testid=bk-root]  (.is-pending → construido; .is-zoom; .is-live mientras corre; .is-diagram)
├─ .bk-head: icono · h3#…[data-testid=bk-title] · p.bk-lead · chips (bk-chip-category)
├─ .bk-viewer[data-testid=bk-viewer]
│  ├─ .bk-tools: botón «Zoom al marco y amortiguador» (bk-zoom, aria-pressed) · capas (bk-layer-W|N|Fs|inertia)
│  ├─ .bk-main: .bk-scenewrap (.bk-stage[role=img][data-testid=bk-stage] > canvas[data-testid=bk-canvas];
│  │             p.sr-only#…[data-testid=bk-summary]; .bk-fall[role=alert][data-testid=bk-fall] con «Reintentar» bk-retry)
│  │           · .bk-charts: ch-frame × 3 (canvas bk-chart-dx | bk-chart-theta | bk-chart-fs)
│  └─ .bk-dock.ds-glass: transporte (bk-play, bk-reset, bk-speed, bk-time) · botón «Frenar» (bk-brake, aria-pressed)
├─ .bk-data: «Ver datos» de cada gráfica (bk-chart-<id>-data-toggle)
├─ .bk-panels: 4 paneles de deslizadores (bk-params-rider|terrain|shock|control; cada slider bk-param-<key>)
│             + «Restablecer parámetros» (bk-params-restore, toast bk-toast) + lecturas (bk-readout-<id>)
└─ section.bk-tf: segmented bk-view (algebra | diagram) · chip de veredicto (bk-verdict)
   ├─ .bk-algebra: tarjetas bk-eq-GC|GV|G2|G1|H (botón «Ver detalle» bk-eq-pick-<id>) y bk-eq-T (global)
   ├─ .bk-diagrambox: svg.bk-diagram[data-testid=bk-diagram] con g[role=button] bk-diagram-<id>
   │                  (bloques GC, GV, G2, G1, H; señales Cset, E, M, Mag, Q, Treac, C) y valores en vivo [data-live]
   └─ .ds-panel.bk-detail[data-testid=bk-detail] (.is-preview al pasar el cursor)
```

### Parámetros (deslizadores, valores SI en `lab.params`)

| Grupo | Clave | Símbolo | Unidad mostrada | Rango | Omisión |
|---|---|---|---|---|---|
| Ciclista y movimiento | `v` | v | km/h (→ m/s) | 5–70 | 25 |
| | `mp`, `mb` | m_p, m_b | kg | 40–120, 8–25 | 75, 14 |
| | `xcg` | x_cg | cm (→ m) | −30…30 | 0 |
| | `ab` | a_b | m/s² | 0–8 | 3 |
| Terreno | `alpha` | α | ° (→ rad) | 0–60 | 10 |
| | `wb`, `Ab` | ω_b, A_b | Hz, cm (→ m) | 0.2–4, 0–20 | 1.2, 4 |
| Suspensión | `k`, `c` | k, c | N/m, N·s/m | 3000–40000, 100–5000 | 12000, 1200 |
| Control | `Kp`, `Kd`, `Ki` | K_p, K_d, K_i | — | 0–20, 0–6, 0–6 | 6, 1.5, 0.8 |
| | `thetaSet` | θ^set | ° (→ rad) | −6…6 | 0 |

Fijos (`helpers.FIXED`): `Kv = 1`, `τ_m = 0.2 s`, `L_pivote = 4000 N/m`, `J = 1`, `b_pivote = 2`, masa suspendida
`m_eq = 0.6·(m_p + m_b)`, horquilla al 40 % de masa y 90 % de k y c. Geometría (`helpers.GEO`): L = 1.16 m,
R = 0.37 m, h_cg = 1.0 m, r_c = 0.17 m, inclinación máxima del torso 0.35 m.

## Modelo (`BikeSuspensionLab`)

```js
var lab = new DSL.sections.bikeLab.BikeSuspensionLab({ alpha: 0.2 }, { seed: 0x5EED });
lab.setParams({ k: 20000 });   // SI; cambiar v, ω_b o A_b regenera el terreno por delante de la bicicleta
lab.brake(true);               // aplica a_b mientras está activo
lab.step(1 / 60);              // RK4 en subpasos ≤ 1/480 s; devuelve { kind: 'otb'|'rear', theta, limit } si cae
lab.out;                       // lecturas (ver abajo); lab.halted, lab.fall, lab.t, lab.reset()
```

- **Estática del vuelco** (`helpers.statics(α, a_b, x_cg_ef, m)`): ángulo del resultante
  θ_est = atan(tan α + a_b/(g cos α)); umbrales θ_cf = atan(a_ef/h) y θ_cr = −atan(b_ef/h), con a_ef = L/2 − x_cg_ef y
  b_ef = L/2 + x_cg_ef; normales cuasiestáticas N_t = (W cos α·a_ef − (W sin α + m a_b)·h)/L, N_d = W cos α − N_t;
  momento de vuelco τ = (W sin α + m a_b)·h − W cos α·a_ef (= −N_t·L).
- **Lazo** con la topología exacta del diagrama: E = C_set − C → G_C = K_p + K_d s + K_i/s → M → G_V = K_v/(τ_m s+1)
  → Ṁ_ag (velocidad del torso) → G_2 = L_p/(J s² + b_p s) (su integrador es la posición del torso x_t, saturada en
  ±0.35 m con anti-windup) ─(+)─; Q = z_r(rueda trasera) + (W sin α + m a_b)·h/(L k) → G_1 = k/(τ_w s + 1), τ_w = r_c/v
  ─(+)─ → T_reac → H = 1/(m_eq s² + c s + k) → C (desplazamiento de la masa suspendida trasera, m). C_set = L·tan θ_set.
- **Horquilla** (solo cabeceo y escena): m_f C̈_f = k_f (z_f − C_f) + c_f (ż_f − Ċ_f) con el perfil bajo la rueda delantera.
- **Ángulo de estabilidad** θ = θ_est + φ, φ = atan((C − C_f)/L). Caída si θ > θ_cf (vuelco frontal, «otb») o
  θ < θ_cr (vuelco trasero, «rear») durante 50 ms. La simulación queda detenida hasta `reset()`.
- **Velocidad:** sin freno vuelve a la consigna con τ = 1.2 s; con freno decelera a_b (con la bicicleta casi parada,
  como mucho g sin α). Nunca negativa.
- **Terreno** (`helpers.bumpField(seed)`): versinas z = A/2·(1 − cos 2πu) generadas por delante con `mulberry32`;
  separación media v/ω_b (±35 %), 30 % de «rocas» más estrechas; `at(s, out)` da altura y pendiente dz/ds.
- **Lecturas** (`lab.out`): `t, v, s, ab, braking, zr, zf, C, Cd, Cf, dx (= z_r − C), dxf, Fs (= k Δx + c Δẋ), Ff, xt,
  xcgEff, phi, thetaStatic, theta, thetaCritFront, thetaCritRear, margin, Nr, Nf, W, push, tipMoment, aEff, bEff,
  Cset, E, M, Mag, Q, Treac, F1, F2`.

## Funciones de transferencia (`helpers.transferFunctions(coeffs)` y `helpers.analyze(tf)`)

Polinomios en potencias descendentes de G_C, G_V, G_2, G_1, H, el lazo abierto L = G_C G_V G_2 H, la global
T = L/(1 + L) y la de la perturbación C/Q = G_1 H/(1 + L). `analyze` devuelve polos, ceros, `verdict`
(`'estable' | 'marginal' | 'inestable'`, con `DSL.core.tf` cuando la función es propia; G_C es impropia y solo
lleva raíces), `reason` y ganancia estática. Con los valores por omisión T(s) es estable (orden 6, sobrepaso ≈ 25 %).
La vista algebraica muestra cada bloque con KaTeX (forma simbólica y numérica, polos y ceros); el diagrama SVG
replica la topología (dos sumadores, perturbación por arriba, realimentación negativa por abajo), anima el flujo de
señal mientras corre (no con movimiento reducido) y, al pulsar o pasar el cursor por un bloque o una señal (también
con Tab e Intro), rellena el panel de detalle con su ecuación, polos y ceros, valores en vivo y papel físico.

## Escena (`helpers.Scene`)

Canvas 2D a 60 fps en el único ticker de la app (`util.loop` con `element`: se para fuera de pantalla y con la
pestaña oculta). El mundo se dibuja inclinado α (e1 cuesta abajo, e2 normal a la cresta); la bicicleta tiene el
basculante articulado (verde `--c-zero`) que gira en torno al pivote con la rueda trasera, el amortiguador con
resorte helicoidal entre el balancín y el tubo diagonal, el triángulo principal (`--bk-frame`), la horquilla y un
ciclista articulado cuyo torso sigue x_cg + x_t. **Cámara dual:** general (≈ 3.6 m de ancho) o «Zoom al marco y
amortiguador» (≈ 1.35 m centrados en el pivote y el amortiguador, con la cota Δx y k, c); la transición suaviza
escala y anclaje (τ = 0.22 s; instantánea con movimiento reducido). **Vectores** (capas activables): peso W vertical
desde el CG, normales N_t y N_d perpendiculares a la cresta, F_s en el eje del amortiguador, m·a_b cuesta abajo y el
arco del momento de vuelco en el contacto delantero (rojo cuando vuelca). **Caída:** el conjunto gira alrededor del
contacto delantero (otb) o trasero (rear) durante 1.4 s y el ciclista sale despedido; el aviso `role="alert"` ofrece
«Reintentar». HUD con v, θ y umbral, Δx y F_s y una barra de margen (verde → ámbar → rojo). Los colores se leen de
los tokens con `util.cssVar` y se recargan con `theme:change`. Un resumen textual (`p.sr-only`) se actualiza cada 0.5 s.

## Gráficas

Tres `createTimeChart` con ventana de 10 s y «Ver datos»: compresión Δx y perfil z_r (mm); ángulo de estabilidad θ
con los umbrales frontal y trasero (°, discontinuos en `--c-pole`); fuerza en el amortiguador F_s y reacción total
T_reac (N). Se empujan ≤ 1200 muestras por ventana; las tablas abiertas se refrescan cada 2 s.
