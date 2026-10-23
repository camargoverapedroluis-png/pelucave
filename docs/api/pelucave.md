# `DSL.anim` · Transición Pelucave (owner: anim)

Port 1:1 de la cinemática calibrada en el arnés **«la mejor page»** (repositorio hermano, tag `v2-calibrated-export`)
a Dynamic Modeling, sin GSAP ni ninguna otra dependencia: scripts clásicos bajo `window.DSL`, un único reloj
(`DSL.util.loop`), sin red y válido en `file://` y en el archivo único.

Qué hace la transición: la cabeza del logo **anticipa** (gira hacia atrás, se retrae y se aprieta), **abre la boca**
(mandíbula bivalva: la arcada inferior gira sobre el cóndilo y se separa a lo largo de la normal de la línea dental; la
superior se levanta levemente; ambas quedan contenidas en la silueta del cráneo por un `clipPath`), **expulsa** un objeto
en el clímax y **recupera** con rebote elástico; el ojo y el pelo siguen con inercia secundaria.

## Archivos

| Archivo | Qué es |
|---|---|
| `js/anim/pelucaveParams.js` | `DSL.anim.pelucaveParams`: el JSON exportado por el arnés, congelado en profundidad. **Inmutable**: no se ajusta aquí. `DSL.anim.pelucaveGeometria`: viewBox, línea dental y cajas en reposo del asset (geometría, no calibración) |
| `js/anim/pelucaveAsset.js` | **GENERADO** por `tools/pelucave.mjs` desde `tools/pelucave/svg-completo.svg`. Trazados `d` por capa, sin presentación. Nunca se edita a mano |
| `js/anim/pelucaveTransition.js` | `DSL.anim.pelucave`: easings, matrices, timeline puro, montaje del SVG y rig |
| `js/anim/pelucaveOverlay.js` | `DSL.anim.pelucaveOverlay`: la transición cableada a la navegación (capa fija, salto en el clímax, vuelo de la sección, limpieza) |
| `css/pelucave.css` | Presentación (prefijo `pv-`): tinta `--pv-ink` (por defecto `--ink`) y papel `--pv-paper` (por defecto `--bg`). Capa `components` |
| `tools/pelucave.mjs`, `tools/pelucave/svg-completo.svg` | Generador (`npm run pelucave`, `--check`) y asset fuente (logo original, 762×734, 32 paths) |
| `tests/unit/pelucave.test.mjs` | Pruebas (parámetros, easings contra GSAP, timeline, matrices, asset, rig en el DOM falso) |
| `tests/pages/pelucave.html` | Página aislada: reproducir, reiniciar, scrub, tema, movimiento reducido, lecturas. `?t=0.46` fija el instante; `?autoplay=1` reproduce al cargar |

## Protocolo de los parámetros (fuente de verdad única)

1. Se calibra **solo** en el arnés (`la mejor page`: `npm run serve`, panel, `Exportar JSON`).
2. Se pega el JSON completo en `js/anim/pelucaveParams.js` sin tocar ningún valor.
3. `npm test`: la prueba «coinciden exactamente con el JSON exportado» de `tests/unit/pelucave.test.mjs` lleva una copia
   literal del JSON; se actualiza en el mismo commit. Así ningún valor cambia por accidente.

Valores vigentes (tag `v2-calibrated-export`): apertura 32°, dx −6, dy 10, contracción −3°, cóndilo (384, 452),
separación 0 → 28 u, arcada superior −4° sobre (426, 390); cabeza −8° / 18 u de retracción / +5° / squash 0.05 sobre el
cuello (420, 699); inercia 0.06 s / 0.09 s, amplitudes 10 / 14 u, rotación del pelo −5°; `elastic.out(1.2, 0.35)`;
fases 0.28 + 0.18 + 0.35 + 0.90 s (duración real 1.80 s con la cola de inercia); objeto 56 u, 260 u hacia +X, −40 u.

## API

```js
const A = DSL.anim.pelucave;

A.createTimeline(params = DSL.anim.pelucaveParams)
  → { params, duration /* 1.8 */, starts /* { anticipacion: 0, apertura: .28, climax: .46, recuperacion: .81, fin: 1.71 } */,
      stateAt(t, into?) → state, phaseAt(t) → 'anticipacion'|'apertura'|'climax'|'recuperacion'|'fin', restState() }

A.createRig(container, { params?, label?, dummyContent?, maxDt = 0.1 })
  → rig = { el /* <svg class="pv-root"> */, nodes, params, duration, timeline,
            setTime(t) → state, time(), state(), apply(state), phaseAt(t?), ejectionPoint() → { x, y } | null,
            play({ onComplete?, from = 0 } | onComplete) → rig, stop() → rig, reset() → rig, isPlaying(), destroy() }

A.buildSvg() → { svg, nodes, ids }        // montaje sin rig (ids únicos por instancia, DSL.util.uid)
A.easings  { powerIn(n), powerOut(n), inOutFromOut(out), elasticOut(amplitude, period), byName }
A.matrix   { IDENTITY, translate, scale, rotate, multiply, compose, apply, aboutPivot, rotateAbout, scaleAbout, headMatrix, toSvgString }
A.geometry { mouthNormal, bboxCenter, midpoint }
A.PHASES, A.REST, A.phaseStarts(fases), A.restState(params), A.segments(params)
```

**Estado** (19 números, el mismo objeto que el arnés): `cabezaRot, cabezaX, cabezaY, cabezaSx, cabezaSy, mandAngle,
mandX, mandY, supAngle, separacion, ojoX, ojoY, peloX, peloY, peloRot, dummyX, dummyY, dummyS, dummyO`.

**Rig.** `createRig` construye el SVG dentro de `container` (que debe estar en el documento para pintarse, no para
calcular: el rig no lee layout) y lo deja en reposo. `setTime(t)` acota `t` a `[0, duration]`, evalúa el estado y
escribe `transform="matrix(…)"` en cinco grupos más `transform` y `opacity` del objeto expulsado: **una escritura por
nodo y cuadro, y solo si el valor cambió**. `play()` usa el ticker compartido (`DSL.util.loop`, `dt` recortado a
`maxDt`) y llama a `onComplete(rig)` una sola vez al llegar al final; `stop()` interrumpe sin completar. Con
`DSL.prefs.reducedMotion`, `play()` salta al estado final y completa **en el acto** (sin recorrido ni escala), como
pide §14.5.

**Objeto expulsado.** Por defecto, la caja del arnés (`rect.pv-dummy-caja`, `--accent`) de `dummy.tamano` u de lado.
`dummyContent` acepta cualquier nodo SVG dibujado en la caja `[0, tamano]²`; el rig lo escala desde 0.15 a 1 y lo
traslada desde el centro de la cavidad (`ejectionPoint()`, punto medio entre los centros de ambas arcadas en mundo).

**Accesibilidad.** Sin `label`, el SVG es decorativo (`aria-hidden="true"`). Con `label`, `role="img"` + `aria-label`.

## CSS (`css/pelucave.css`, prefijo `pv-`)

| Gancho | Uso |
|---|---|
| `.pv-root` | `<svg>` raíz: bloque, ancho 100 %, `overflow: visible` (el objeto sale del viewBox), sin eventos de puntero |
| `.pv-silueta`, `.pv-relleno` | cráneo, pelo y cuencas: `fill`/`stroke` `var(--pv-ink, var(--ink))`, trazo 1 u (oculta costuras) |
| `.pv-pieza` | ojo y arcadas: `fill: var(--pv-paper, var(--bg))`, trazo en tinta |
| `.pv-dummy-caja` | caja por defecto del objeto expulsado: `--accent` |
| `--pv-ink`, `--pv-paper` | redefinibles en el contenedor (p. ej. `--pv-paper: var(--surface-1)` sobre un panel) |

Clases de estructura (sin estilos propios, para selectores y pruebas): `pv-cabeza`, `pv-craneo`, `pv-cuencas`,
`pv-pelo`, `pv-ojo`, `pv-mandibula`, `pv-mandibula-superior`, `pv-mandibula-inferior`, `pv-dummy`.

## Equivalencia con el arnés (evidencia)

El port se contrastó contra el timeline GSAP real del arnés (GSAP 3.12.5 vendorizado allí) canal a canal, en 1801
instantes (paso 1 ms, ida y vuelta): desviación máxima **5·10⁻⁷** en los 19 canales, que es el redondeo interno de
GSAP al interpolar (el port devuelve el valor analítico). Parámetros idénticos byte a byte con `DEFAULT_PARAMS` del
arnés. Los easings reproducen las fórmulas de GSAP: `powerN.in = p^(N+1)`, `powerN.out = 1 − (1−p)^(N+1)`,
`inOut` por reflexión del `out`, y `elastic.out(a, p)` con `p3 = p/(2π)·asin(1/a)`; la prueba unitaria compara con
valores tomados de la biblioteca.

Diferencias deliberadas respecto al arnés (solo diagnóstico, no cinemática): no hay overlays, métrica dental ni panel;
las cajas en reposo de las piezas son constantes (`pelucaveGeometria.bboxReposo`, medidas con `getBBox` en Chromium,
≤ 0.001 u de diferencia con lo que el arnés lee en vivo) para no leer layout en tiempo de ejecución.

## Desviaciones del contrato y decisiones

- **Easing elástico.** §14.5 prohíbe curvas elásticas en la interfaz. La directiva del usuario pide integrar esta
  cinemática con sus parámetros calibrados **exactamente**, incluido `elastic.out(1.2, 0.35)`; el usuario gana
  (precedencia de §0). Se limita a esta transición.
- **Capa CSS.** `css/pelucave.css` escribe en `@layer components` en vez de declarar una capa nueva (la lista de capas
  de `tokens.css` no se amplía). Prefijo propio `pv-`.
- **Sin GSAP.** Se descartó vendorizar GSAP (≈ 70 KB más en el archivo único y una dependencia nueva) porque el
  timeline es pequeño y determinista; el port se verifica contra la biblioteca real desde el arnés.
- **Pruebas de navegador.** `tests/e2e/` no tiene aún un spec de la transición: en esta máquina no está instalado
  Playwright (`node_modules/` ausente) y su descarga de Chromium requiere el visto bueno del usuario. La página
  `tests/pages/pelucave.html` queda lista para ese spec (data-testids `demo-*`, `html[data-ready]`, `window.__pelucave`).

## Cableado en la página (`js/anim/pelucaveOverlay.js`)

```js
DSL.anim.pelucaveOverlay.navigate(sectionId) → boolean   // true: la transición se encarga (evitar la navegación por defecto)
DSL.anim.pelucaveOverlay.isRunning() → boolean
DSL.anim.pelucaveOverlay.cancel() → boolean               // termina en el acto: sección asentada, capa desmontada
```

**Si «no pasa nada» al pulsar el botón.** Compruebe en la consola `DSL.prefs.reducedMotion`: si es `true`, el sistema
declara «reducir movimiento» (en Windows: Rendimiento → «Animar controles y elementos dentro de las ventanas»
desactivado, habitual en Windows Server) y la app sustituye toda animación por un cambio instantáneo, esta
transición incluida. Para verla igualmente: `index.html?movimiento=normal`, o `DSL.prefs.setReducedMotion(false)`
en la consola, o active los efectos visuales del sistema.

**Disparo.** El ancla «Simular un sistema» del inicio (`js/sections/hero.js`, `data-testid="hero-cta-galeria"`)
llama a `navigate('galeria')` en su clic y solo evita la navegación por defecto si devuelve `true`. Devuelve
`false` con movimiento reducido o si falta el módulo (el shell desplaza la página como siempre) y `true`
mientras ya corre una transición (candado: el clic repetido se ignora). Los enlaces «Galería» de la barra y del
menú no se tocan.

**Secuencia (1.8 s).**

| Instante | Capa (`div.pv-overlay`, fija, bajo la barra, sin puntero) | Sección `#galeria` |
|---|---|---|
| 0 → 0.28 s anticipación | velo `--bg` 0 → 1 (`power2.inOut`); la cabeza se echa atrás | sin tocar |
| 0.28 → 0.46 s apertura | velo 1; la boca se abre | sin tocar |
| 0.46 s clímax | `shell.scrollTo('galeria', { instant: true })` detrás del velo; velo 1 → 0 (`power2.out`) | nace en la boca: `transform-origin` = punto de aterrizaje de la trayectoria calibrada; cada cuadro `translate(…) scale(dummyS)` (0.15 → 1, recorrido `distancia 260` / `elevacion −40` u × escala de la cabeza); clase `pv-vuelo` (`will-change`) |
| 0.81 s recuperación | cierre elástico; fundido de la cabeza en los últimos 0.3 s | asentada: se retiran `transform`, `transform-origin`, la clase y el atributo `style` vacío |
| 1.80 s fin | `visibility: hidden`, rig destruido, nodo eliminado, candado liberado | recibe el foco (`tabindex="-1"`, sin desplazar) |

La cabeza se dimensiona en px desde el módulo (62 % del alto de la ventana, como mucho el 90 % del ancho) de
modo que su punto de eyección en reposo cae en el 32 % × 52 % de la ventana; su papel es `--bg`, igual que el
velo. Una sola lectura de layout (`getBoundingClientRect` de la sección) en el clímax, fuera del bucle. Mientras
la sección vuela, sus gráficas y escenas se reconstruyen con normalidad (el salto instantáneo dispara su
inicialización perezosa si aún no había corrido).

**Limpieza garantizada.** Al terminar no queda ningún nodo de la capa en el documento ni ningún estilo en línea
en la sección; `pointer-events: none` en la capa durante toda la secuencia, así que ni siquiera mientras corre
bloquea deslizadores, lienzos o botones. `cancel()` fuerza ese estado final en el acto.
