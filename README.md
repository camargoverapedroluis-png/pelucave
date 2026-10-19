# Laboratorio de Sistemas Dinámicos

Simulador y centro de aprendizaje de **sistemas dinámicos y funciones de transferencia**, en español. Es una aplicación de una sola página que reúne cuatro partes:

- tarjetas de conceptos interactivas;
- un asistente de modelado en cuatro pasos;
- una galería de sistemas simulados en tiempo real (mecánico, hidráulico, eléctrico, biológico y económico);
- un motor que obtiene G(s) con su procedimiento paso a paso, la respuesta al escalón, el mapa de polos y ceros y el diagrama de Bode.

Todos los cálculos se hacen en el navegador, de forma determinista, y la aplicación **no necesita conexión a internet**.

- Qué se construye: [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md).
- Contrato técnico (archivos, propietarios y API): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- Reglas visuales y de experiencia de uso: [`docs/SKILLS_BRIEF.md`](docs/SKILLS_BRIEF.md).

## Cómo abrirla

Hay dos formas, y ninguna necesita servidor ni red:

1. **Código modular:** abra `index.html` con doble clic. Las bibliotecas y las fuentes ya están copiadas en `vendor/`.
2. **Archivo único:** abra `dist/sistemas-dinamicos.html`. Lleva todo el CSS, el JavaScript y las fuentes que usa incrustados, y se puede copiar o enviar como un solo archivo.

Navegadores recomendados: versiones actuales de Chrome, Edge, Firefox o Safari.

La página no hace ninguna petición de red: no usa CDN, analítica ni fuentes remotas. Una prueba de navegador lo comprueba bloqueando toda petición http(s) (ver «Pruebas»). Solo guarda en `localStorage` el tema elegido.

## Uso

La barra superior lleva a las cinco secciones. También se puede entrar directamente a una de ellas añadiendo su ancla al archivo, por ejemplo `index.html#galeria` o `sistemas-dinamicos.html#transferencia`.

| Sección | Qué ofrece |
|---|---|
| `#inicio` | Presentación con una escena animada y dos accesos: «Simular un sistema» (galería) y «Obtener G(s) paso a paso» (motor) |
| `#conceptos` | Cuatro tarjetas con figuras calculadas en vivo: «¿Qué es un sistema dinámico?», «La variable independiente: el tiempo t», «Ecuaciones de representación» y «Linealidad vs. no linealidad» (con superposición y métodos numéricos: Euler, Heun y RK4 frente a RK45 sobre el péndulo no lineal) |
| `#modelado` | Asistente en cuatro pasos (Delimitar el sistema → Aplicar leyes físicas o principios de conservación → Formular el modelo matemático → Simular y validar) con cuatro ejemplos: masa-resorte, RLC, tanque y SIR. En «Formular el modelo matemático», un ejemplo lineal abre su G(s) en el motor (el SIR, que no es lineal, lleva a «Linealidad vs. no linealidad»); en «Simular y validar», el ejemplo se abre en la galería |
| `#galeria` | Cinco sistemas simulados en tiempo real, con escena animada, gráficas y controles de parámetros: masa-resorte, tanques (lineal, Torricelli, cascada), circuito RLC, epidemia SIR y mercado (telaraña y ajuste continuo). «Ver G(s) paso a paso» envía el sistema, con sus parámetros, al motor |
| `#transferencia` | Motor de funciones de transferencia: escriba G(s) o elija un sistema, y obtenga el procedimiento, la respuesta al escalón con sus métricas, el mapa de polos y ceros y el diagrama de Bode |

Controles comunes:

- **Tema claro u oscuro:** botón de la barra superior. La aplicación empieza en oscuro, sea cual sea la preferencia del sistema operativo; el tema elegido se recuerda en `localStorage` (clave `dsl.v1.theme`) y se aplica antes de pintar al volver a abrirla.
- **Movimiento reducido:** si el sistema lo pide, las animaciones se sustituyen por cambios instantáneos y la galería empieza en pausa.
- **Teclado:** todo se maneja con Tab, Intro, Espacio y las flechas. Los deslizadores aceptan Re Pág / Av Pág e Inicio / Fin, y cada uno tiene una casilla numérica al lado.
- **Ver datos:** cada gráfica tiene una tabla con sus valores, que también leen los lectores de pantalla. La tabla abierta se actualiza sola cuando cambian los datos (al terminar la transición o, con la simulación en marcha, como mucho dos veces por segundo). Una serie de 60 filas o menos se muestra entera; las más largas se muestrean, y el título de la tabla dice cuántas filas se muestran de cada serie.
- **Fuera de su dominio:** si un sistema de la galería sale del dominio en el que su modelo tiene sentido (por ejemplo, un precio o una cantidad negativos en la telaraña del mercado), la simulación se detiene y un aviso dice el motivo y qué parámetro cambiar antes de pulsar «Reiniciar».

Los números usan punto decimal y las magnitudes van en unidades del SI.

## Desarrollo

Requisitos: Node.js 20 o superior. Para el contraste numérico con Python hace falta además [uv](https://docs.astral.sh/uv/).

```bash
npm install          # dependencias de desarrollo (exactas, sin rangos)
```

| Script | Qué hace |
|---|---|
| `npm run vendor` | Copia en `vendor/` Chart.js, KaTeX (CSS reescrito para usar solo woff2) y las fuentes woff2, y genera `vendor/fonts.css` y `vendor/VERSIONS.json`. Es determinista |
| `npm run icons` | Genera `js/ui/icons-data.js` con los iconos Lucide listados en `tools/icons/*.list`. Falla si un nombre no existe |
| `npm run build` | Genera `dist/sistemas-dinamicos.html`, el archivo autocontenido. No incrusta las caras tipográficas que la app no puede usar (lista `DIST_PRUNED_FONTS` de `tools/lib.mjs`: KaTeX Fraktur, Script, Typewriter, SansSerif y negrita cursiva, Bricolage latin-ext y Plex cursiva latin-ext) y falla si `js/` usa una orden de TeX que las pediría (`\mathfrak`, `\mathscr`, `\mathtt`, `\texttt`, `\mathsf`, `\boldsymbol`, `\bm`…). Mismas entradas, mismos bytes; para fechar el banner, `BUILD_DATE=AAAA-MM-DD npm run build`. `node tools/build.mjs --out=<archivo>` escribe en otra ruta sin tocar `dist/` |
| `npm test` | Pruebas unitarias (`node:test`) de `tests/unit/` |
| `npm run test:e2e` | Pruebas de navegador (Playwright, Chromium, `file://`) sobre `index.html` (proyectos `src` y `src-timing`) y sobre el archivo único (`dist` y `dist-timing`); las pruebas que miden tiempo real corren al final, de una en una (ver «Pruebas») |
| `npm run crosscheck` | Contrasta el motor numérico con NumPy y SciPy (`uv run --with numpy --with scipy python tests/crosscheck/run.py`) |
| `npm run verify` | Todo en orden: vendor → icons → test → crosscheck → build → test:e2e |

Para ejecutar un solo archivo de pruebas de navegador sobre el código modular (con sus pruebas de tiempo real, si tiene):

```bash
npx playwright test tests/e2e/smoke.spec.mjs --project="src*" --no-deps --output "test-results/mi-carpeta"
```

`--no-deps` evita que, al filtrar, Playwright añada todas las pruebas de tiempo real de `src-timing` (ver «Pruebas»).

Notas:

- **Node 24:** `node --test tests/unit` ya no acepta una carpeta y falla con «Cannot find module». Use `npm test`, que pasa el patrón `tests/unit/**/*.test.mjs`.
- **Reconstruya antes de probar `dist`:** el proyecto `dist` prueba el archivo generado. Si cambia el código, ejecute `npm run build` antes de `npx playwright test --project=dist`.

## Pruebas

| Capa | Dónde | Qué cubre |
|---|---|---|
| Unitarias | `tests/unit/*.test.mjs` | Números complejos, polinomios y raíces, integradores, `TransferFunction` (respuesta al escalón, métricas, fracciones parciales, Bode), LaTeX, modelos y simulador, el espacio de nombres `DSL`, la lógica de gráficas, escenas, componentes y secciones con un DOM simulado, y el contrato de archivos (`contract.test.mjs`) |
| Contraste numérico | `tests/crosscheck/run.py` | Mismos casos que el motor, contra NumPy y SciPy, con la tabla de tolerancias de `docs/api/tf.md` |
| Navegador, por módulo | `tests/e2e/<módulo>.spec.mjs` | Cada sección y capa (cabecera, gráficas, escenas, conceptos, asistente, galería, motor de G(s)) con teclado, accesibilidad y movimiento reducido |
| Navegador, integración | `tests/e2e/integration.spec.mjs` | Los eventos entre secciones: galería → motor con los mismos parámetros y el mismo denominador que el modelo; asistente → motor y → galería; diagnósticos del motor → conceptos y → galería. Además, que los accesos del inicio dejan la sección bajo la barra; el funcionamiento sin red (se aborta toda petición http(s) y no debe haber ninguna); el tiempo entre fotogramas con la galería en marcha; y que, tras recorrer toda la aplicación, ninguna fuente falla y las caras que el archivo único omite nunca se piden |
| Navegador, adaptable | `tests/e2e/responsive.spec.mjs` | Página completa a 1440, 1280, 1024, 820, 768, 390 y 375 px: sin desplazamiento horizontal ni texto cortado fuera de la ventana. Guarda capturas de página completa |

Tamaño actual de la batería (ronda 2 de auditoría, `docs/AUDIT.md`): 686 pruebas unitarias, 62 casos de contraste con SciPy y 311 pruebas de navegador por página (102 de ellas usan páginas de prueba de `tests/pages/` y se omiten con el archivo único; las demás, también las de la cabecera y el pie de la app, corren sobre las dos páginas). Las comprobaciones de accesibilidad con axe van dentro de las pruebas de cabecera, conceptos, asistente, galería y motor.

Cada prueba de navegador falla ante cualquier error de consola, error de página o petición de red. Toda la batería se ejecuta con una sola orden, después de `npm run build`:

```bash
npx playwright test --output "test-results/integrator/completa"
```

Tarda entre 17 y 19 minutos (unos 3 de ellos, las pruebas de tiempo real), así que conviene lanzarla en segundo plano y guardar su salida en un archivo. Para una sola página: `npx playwright test --project=src` (o `--project=dist`).

Algunas pruebas miden tiempo real: LCP y CLS al cargar, tareas largas y fases durante la preparación de las secciones, la latencia de interacción con la CPU ralentizada 4×, la coreografía del asistente, la relación de velocidades 1×/4× de la galería, los fotogramas por segundo y los presupuestos en milisegundos. Llevan la etiqueta `@timing` (`TIMING` en `tests/helpers/fixtures.mjs`). Los proyectos `src` y `dist` las excluyen; `src-timing` y `dist-timing` las ejecutan con un solo proceso, cuando su proyecto ya ha terminado (aunque haya fallado algo) y sin otras pruebas en marcha. Son 31 por página. Si se lanzan varias baterías de Playwright a la vez, la máquina se carga igualmente: ejecute una cada vez y, si una prueba de tiempo falla con la máquina ocupada, repita `npx playwright test --project=src-timing` antes de darla por regresión. Detalles: `docs/ARCHITECTURE.md` §15.2.

Resultados que dejan en `test-results/integrator/`:

- `shots/<proyecto>/pagina-<ancho>x<alto>-<tema>.png`: capturas de página completa (oscuro a 1440×900, 1280×800, 1024×768, 820×1180 y 390×844; claro a 1440×900).
- `frames-<página>.json` (`src` o `dist`): tiempos entre fotogramas (mediana, percentil 95 y máximo) medidos durante 3 s.
- `fonts-<proyecto>.json`: cada cara de `document.fonts` (familia, estilo, peso, rango y estado) tras el recorrido completo.

## Estructura

```
index.html              página: secciones #inicio, #conceptos, #modelado, #galeria, #transferencia
css/                    tokens de diseño (tokens.css), base, componentes, shell, gráficas, escenas, secciones/
js/core/                ns.js (espacio de nombres DSL), numeric.js, tf.js, latex.js
js/ui/                  iconos generados, componentes, cabecera y pie
js/viz/                 gráficas (Chart.js) y escenas físicas animadas (scenes/)
js/systems/             registro de modelos, simulador y modelos (masa-resorte, tanques, RLC, SIR, mercado, péndulo)
js/sections/            hero, conceptos, asistente de modelado, galería, motor de G(s)
js/app.js               arranque: monta cada sección
vendor/                 bibliotecas y fuentes copiadas (generado por tools/vendor.mjs)
tools/                  vendor.mjs, icons.mjs, build.mjs y las listas de iconos
tests/                  unit/, e2e/ (un spec por módulo, más integration y responsive), helpers/, pages/, crosscheck/
dist/                   sistemas-dinamicos.html (generado por tools/build.mjs)
test-results/           salidas de Playwright (integrator/: capturas y tiempos de fotograma)
docs/                   especificación, arquitectura, guía de diseño y API de cada módulo (api/)
```

Todo el JavaScript son *scripts clásicos* (sin módulos ES ni paso de compilación) que cuelgan de `window.DSL`. Por eso `index.html` funciona desde `file://`.

## Créditos y licencias

Las bibliotecas y fuentes de terceros se distribuyen copiadas en `vendor/` (y dentro de `dist/`). Sus licencias completas están en `vendor/LICENSES/` y las versiones exactas en `vendor/VERSIONS.json`.

| Componente | Versión | Licencia | Uso |
|---|---|---|---|
| [Chart.js](https://www.chartjs.org/) | 4.5.1 | MIT | Gráficas |
| [KaTeX](https://katex.org/) (incluidas sus fuentes) | 0.16.47 | MIT | Ecuaciones |
| [Lucide](https://lucide.dev/) (`lucide-static`) | 1.50.0 | ISC | Iconos (solo los usados, en línea) |
| [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) (`@fontsource-variable/bricolage-grotesque`) | 5.3.0 | SIL Open Font License 1.1 | Titulares |
| [IBM Plex Sans](https://github.com/IBM/plex) (`@fontsource-variable/ibm-plex-sans`) | 5.3.0 | SIL Open Font License 1.1 | Interfaz y texto |
| [Playwright](https://playwright.dev/) | 1.63.0 | Apache-2.0 | Solo pruebas (no se distribuye) |
