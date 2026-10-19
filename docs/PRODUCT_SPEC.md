# Especificación del producto: Laboratorio de Sistemas Dinámicos

Este documento fija **qué** se construye. La petición original se conserva literal; la interpretación acordada la desarrolla sin debilitar ni omitir nada. El **cómo** (archivos, propietarios, API) está en `docs/ARCHITECTURE.md`; las reglas visuales y de UX, en `docs/SKILLS_BRIEF.md`.

Precedencia cuando dos fuentes difieren: (1) la petición original del usuario, (2) la interpretación acordada de este documento, (3) `docs/ARCHITECTURE.md`, (4) `docs/SKILLS_BRIEF.md`, (5) cada skill por separado.

---

## Petición original del usuario

> Texto literal, sin cambios.

Actúa como un Ingeniero Senior Full Stack, Diseñador UX/UI de élite y Especialista en Sistemas de Control y Simulación Matemática.
Tu misión es desarrollar una aplicación web interactiva, moderna, altamente visual y animada que funcione como un **Simulador y Centro de Aprendizaje de Sistemas Dinámicos y Funciones de Transferencia**. La interfaz debe ser deslumbrante (estilo tech-minimalista o glassmorphism, con modo oscuro por defecto, transiciones suaves y micro-interacciones).
### Stack Tecnológico Sugerido (o equivalente moderno en SPA autocontenida):
- HTML5, CSS3 / Tailwind CSS (para un diseño limpio y futurista).
- JavaScript (Vanilla moderno o React, preferiblemente en un solo archivo HTML modularizado si es una SPA ligera, o estructura limpia).
- Chart.js / Plotly.js o D3.js (para gráficas dinámicas y animadas).
- KaTeX o MathJax (para renderizar ecuaciones matemáticas de forma impecable).
- Lucide Icons (para iconografía limpia).
### Características Principales que debe incluir la Web App:
1. **Dashboard Principal / Explorador de Sistemas Dinámicos:**
   - Una introducción visualmente atractiva con tarjetas interactivas que expliquen:
     - **Definición de sistema dinámico:** Conjunto de elementos interconectados cuyas reglas de movimiento o cambio se describen mediante ecuaciones.
     - **Variable independiente:** El tiempo ($t$), evaluado conforme este transcurre.
     - **Ecuaciones de representación:** Ecuaciones diferenciales ordinarias (EDO) en tiempo continuo o ecuaciones en diferencias en tiempo discreto.
     - **Linealidad vs. No linealidad:** Explicación visual de proporcionalidad, superposición y métodos numéricos avanzados.
2. **Guía Interactiva: Pasos para Modelar un Sistema:**
   - Un componente paso a paso animado (Wizard o Timeline interactivo):
     1. **Delimitar el sistema:** Identificar fronteras, entradas (fuerzas, voltajes, flujos) y salidas (velocidad, nivel, temperatura).
     2. **Aplicar leyes físicas o principios de conservación:** Segunda ley de Newton (mecánicos), leyes de Kirchhoff (circuitos), o balances de masa y energía.
     3. **Formular el modelo matemático:** Conversión a ecuaciones algebraicas o diferenciales.
     4. **Simular y validar:** Métodos numéricos para comprobar precisión frente al mundo real.
3. **Galería de Ejemplos Interactivos (Con Simulaciones y Gráficas Animadas):**
   El usuario debe poder seleccionar entre varios sistemas preconfigurados y ver una gráfica animada en tiempo real (con controles de Play, Pause, Reset y velocidad):
   - **Mecánicos:** Sistema masa-resorte-amortiguador.
   - **Hidráulicos:** Tanques de almacenamiento de líquidos con niveles de fluido variables.
   - **Eléctricos:** Circuitos RLC (resistencia, inductor y capacitor).
   - **Biológicos y Económicos:** Propagación de epidemias o fluctuaciones de mercado.
4. **Motor de Funciones de Transferencia y Resolución Paso a Paso:**
   - Una sección dedicada a ingresar parámetros o seleccionar sistemas para obtener:
     - Su **Función de Transferencia $G(s)$**.
     - El **Procedimiento matemático paso a paso** detallado y renderizado con fórmulas claras.
     - Gráficas de respuesta al escalón o análisis de comportamiento dinámico con animaciones fluidas al cambiar parámetros (sliders interactivos).
### Requisitos de UI/UX:
- **Animaciones fluidas:** Uso de transiciones CSS suaves y efectos de aparición gradual para las gráficas y textos.
- **Interactividad total:** Sliders, botones dinámicos, tooltips explicativos y selectores de sistemas que actualicen instantáneamente los cálculos y las gráficas sin recargar la página.
- **Diseño responsive:** Adaptado perfectamente a pantallas de escritorio y tablets.
Por favor, entrégame el código completo, funcional, limpio y listo para probarse (idealmente en un archivo HTML autocontenido con sus scripts y estilos embebidos, o una estructura modular clara). ¡Sorpréndeme con la calidad del diseño y la fluidez de las animaciones!

---

## Interpretación acordada

### 1. Producto

- **Nombre:** «Laboratorio de Sistemas Dinámicos».
- **Qué es:** una aplicación de una sola página (SPA), en español, que funciona como **simulador y centro de aprendizaje** de sistemas dinámicos y funciones de transferencia.
- **Estética:** modo oscuro por defecto con conmutador a tema claro; estilo glassmorphism / tech-minimalista según `docs/SKILLS_BRIEF.md`; animación fluida y micro-interacciones.
- **Responsive:** escritorio (≥ 1280 px) y tableta (768–1279 px) como objetivos principales; en teléfonos la aplicación se degrada con dignidad (una columna, sin scroll horizontal).
- **Entregables:**
  1. **Código fuente modular:** `index.html` + `css/` + `js/` como *scripts clásicos*, que se abre directamente desde `file://`, con las bibliotecas copiadas en `vendor/` y **sin necesidad de red**.
  2. **Un único archivo autocontenido:** `dist/sistemas-dinamicos.html`, con todo el CSS, el JS y las fuentes incrustados; funciona sin conexión.
- **Bibliotecas:** Chart.js 4, KaTeX, iconos Lucide (SVG en línea solo de los iconos usados), fuentes incrustadas como woff2.
- **CSS:** escrito a mano con *design tokens*; sustituye a Tailwind (la petición admite un «equivalente moderno»).

### 2. Secciones (orden de navegación e identificadores)

#### 2.1 `#inicio` — Hero

- Título, subtítulo y llamadas a la acción hacia `#galeria` y `#transferencia`.
- Fondo animado en un `canvas`, vivo y de bajo coste (por ejemplo, respuestas amortiguadas o estelas de polos en el plano s), que **se pausa fuera de pantalla** y **respeta la reducción de movimiento**.
- Sin métricas inventadas.

#### 2.2 `#conceptos` — Cuatro tarjetas de concepto interactivas

- **a. «¿Qué es un sistema dinámico?»** — conjunto de elementos interconectados cuyas reglas de movimiento o cambio se describen mediante ecuaciones. Diagrama de bloques animado u(t) → sistema (estado x(t)) → y(t), con elementos interconectados y un conmutador de realimentación.
- **b. «La variable independiente: el tiempo t»** — control de reproducción/arrastre (*scrub*) que hace evolucionar un estado en t (por ejemplo, el punto de un oscilador amortiguado y su traza), «evaluado conforme este transcurre».
- **c. «Ecuaciones de representación»** — EDO en tiempo continuo frente a ecuaciones en diferencias en tiempo discreto: el mismo sistema de primer orden dy/dt = −a·y + a·u frente a y[k+1] = y[k] + T(−a·y[k] + a·u[k]). Un slider de T muestra tallos/escalera frente a la curva continua, y la inestabilidad cuando aT > 2. Ecuaciones con KaTeX.
- **d. «Linealidad vs. no linealidad»** — pestañas:
  - **(i) Proporcionalidad y superposición:** respuestas a u1, u2 y u1+u2 frente a y1+y2 para un sistema lineal (coinciden) y para uno no lineal (tanque de Torricelli o péndulo: el desajuste se sombrea).
  - **(ii) Métodos numéricos:** Euler, Heun, RK4 y RK45 adaptativo como referencia sobre el péndulo no lineal, con un slider de tamaño de paso, lectura del error y gráfica.

#### 2.3 `#modelado` — Asistente animado de 4 pasos

Stepper/línea de tiempo con progreso, anterior/siguiente, teclas de flecha y transiciones animadas, con un ejemplo en curso seleccionable (masa-resorte, circuito RLC, tanque, epidemia SIR):

1. **Delimitar el sistema:** diagrama SVG con frontera discontinua; entradas (fuerzas, voltajes, flujos) y salidas (posición/velocidad, nivel, voltaje/corriente, infectados) resaltadas al pasar el puntero o al enfocar; entorno frente a sistema.
2. **Aplicar leyes físicas o principios de conservación:** Newton (diagrama de cuerpo libre), Kirchhoff (lazo KVL), balance de masa/energía; para SIR, la vista de stocks y flujos + diagrama causal (método de dinámica de sistemas: stocks, flujos, lazos de refuerzo/equilibrio); los términos se resaltan uno a uno.
3. **Formular el modelo matemático:** ecuación ensamblada término a término (KaTeX, animada), EDO → forma de espacio de estados; etiqueta lineal / no lineal.
4. **Simular y validar:** simulación numérica frente a «datos medidos» sintéticos (ruido determinista con semilla), un slider de calibración para ajustar un parámetro, lectura de RMSE, gráfica de residuos y comprobaciones de invariantes como insignias (balance de energía, balance de masa, S+I+R=N).

#### 2.4 `#galeria` — Galería de ejemplos en vivo

- **Selector** (tarjetas con icono + chip de categoría):
  - **Mecánico:** masa-resorte-amortiguador.
  - **Hidráulico:** tanques, con variantes: 1 tanque lineal; 1 tanque con descarga de Torricelli (no lineal); 2 tanques en cascada no interactuantes.
  - **Eléctrico:** circuito RLC serie.
  - **Biológico:** epidemia SIR.
  - **Económico:** mercado, con variantes: modelo de la telaraña en tiempo discreto; ajuste continuo de precio (Walras/Evans).
- **Cada sistema incluye:**
  - Escena física animada sincronizada con el estado de la simulación: resorte que se estira + masa + amortiguador; niveles de fluido con onda en la superficie y chorros de entrada/salida; circuito con puntos de corriente cuya velocidad y dirección siguen i(t), llenado de carga del capacitor y brillo del inductor; stocks y flujos SIR con flujos animados + rejilla de puntos de población; diagrama de oferta/demanda con telaraña animada o marcador de precio.
  - Gráfica(s) en streaming en tiempo real.
  - Transporte: Reproducir/Pausar, Reiniciar, velocidad (0.25× 0.5× 1× 2× 4×) y lectura del tiempo.
  - Selector de entrada (escalón, pulso, senoidal donde tenga sentido).
  - Sliders de parámetros con unidades y tooltips explicativos.
  - Lecturas en vivo (ζ, ωn, τ, R0, equilibrio…).
  - Acción «Ver G(s) paso a paso», que abre `#transferencia` precargada con el mismo sistema y los mismos parámetros.
- Los cambios de parámetros se aplican en vivo durante la reproducción.

#### 2.5 `#transferencia` — Motor de funciones de transferencia

- **Modos:**
  - **(a) «Desde un sistema»:** masa-resorte X/F; RLC VC/V e I/V; tanque H/Qin; tanque de Torricelli linealizado; 2 tanques H2/Qin; ajuste de precio P/D. Con sliders.
  - **(b) «Forma estándar»:** 1.er orden K/(τs+1) y 2.º orden K·ωn²/(s²+2ζωn·s+ωn²).
  - **(c) «Personalizada»:** coeficientes de numerador/denominador (grado del denominador 1–4, grado del numerador ≤ grado del denominador; estrictamente propia o propia), con mensajes de validación en español.
- **Salidas:**
  - G(s) grande con KaTeX.
  - **«Procedimiento paso a paso»:** pasos numerados y plegables que se animan en secuencia y se actualizan en vivo con los números:
    1. Ley física / ecuación diferencial.
    2. Transformada de Laplace con condiciones iniciales nulas (propiedades usadas).
    3. Despeje G(s) = Y(s)/U(s).
    4. Forma canónica y parámetros (K, τ o ωn, ζ, ωd).
    5. Polos y ceros + estabilidad (tabla de Routh-Hurwitz).
    6. Respuesta al escalón: Y(s) = G(s)/s, fracciones parciales con residuos, transformada inversa → y(t) explícita.
    7. Valor final (teorema del valor final, solo si es estable) y métricas (tr 10–90 %, tp, Mp %, ts 2 %), indicando qué fórmulas son exactas y cuáles aproximadas.
  - **Gráficas:** respuesta al escalón (transformación suave al cambiar parámetros + «fantasma» atenuado de la curva anterior + anotaciones: valor final, pico, banda ±2 %); mapa de polos y ceros (plano s, sombreado del semiplano estable, movimiento animado de los polos); Bode de magnitud (dB) y fase (grados, desenrollada) sobre ω logarítmica; respuesta al impulso opcional; tarjetas de métricas.

### 3. Requisitos matemáticos

- **G(s) con condiciones iniciales nulas.**
- **Coeficientes de polinomios en potencias descendentes.**
- **Raíces** por un método robusto y determinista (Aberth o Durand-Kerner con pulido), con orden determinista.
- **Respuesta al escalón analítica** por fracciones parciales para polos reales/complejos distintos y polos repetidos (multiplicidad general, o al menos 2; si no, numérica con un aviso visible).
- **Métricas** calculadas numéricamente a partir de una respuesta fina y comparadas con las fórmulas canónicas para un 2.º orden puro: Mp = e^{−ζπ/√(1−ζ²)}, tp = π/ωd, ts ≈ 4/(ζωn) (etiquetada como aproximada).
- **Teorema del valor final** solo cuando el sistema es estable.
- **Integradores:** Euler, Heun, RK4 y RK45 adaptativo (Dormand-Prince).
- **Modelos:**

| Modelo | Ecuaciones | Resultados |
|---|---|---|
| Masa-resorte-amortiguador | m·x'' + b·x' + k·x = F | G = 1/(m s² + b s + k), ωn = √(k/m), ζ = b/(2√(k m)) |
| RLC serie | L di/dt + R i + vC = v, C dvC/dt = i | VC/V = 1/(LC s² + RC s + 1), I/V = C s/(LC s² + RC s + 1), ωn = 1/√(LC), ζ = (R/2)·√(C/L) |
| Tanque lineal | A dh/dt = qin − h/R | H/Qin = R/(A R s + 1), τ = A R |
| Tanque de Torricelli | A dh/dt = qin − a√(2 g h) | equilibrio h0 = (qin0/(a√(2g)))²; linealizado R = 2√h0/(a√(2g)) = 2 h0/qin0 |
| 2 tanques no interactuantes | (en cascada) | H2/Qin = R2/((A1 R1 s + 1)(A2 R2 s + 1)) |
| Epidemia SIR | S' = −β S I/N, I' = β S I/N − γ I, R' = γ I | R0 = β/γ; umbral de inmunidad de grupo 1 − 1/R0; invariante S+I+R = N; **sin G(s) global** (no lineal): se explica la linealización en el equilibrio libre de enfermedad (I' ≈ (β−γ) I) |
| Telaraña (discreto) | Qd = a − b·P_t, Qs = c + d·P_{t−1} | P* = (a−c)/(b+d); P_t − P* = (−d/b)^t (P_0 − P*); estable si y solo si d/b < 1 |
| Ajuste de precio (continuo) | dP/dt = α (Qd − Qs) | respuesta del precio a un desplazamiento de demanda D: G = α/(s + α(b+d)) |
| Péndulo | θ'' + c θ' + (g/L) sin θ = 0 | frente al linealizado θ'' + c θ' + (g/L) θ = 0 |

### 4. Calidad

- **Determinista:** nada de `Math.random`; generador pseudoaleatorio con semilla para los datos sintéticos.
- **60 fps:** bucles con `requestAnimationFrame` y subpasos RK4 de paso fijo; pausa fuera de pantalla o con la pestaña oculta; canvas conscientes del DPR; actualizaciones de gráficas limitadas (*throttled*).
- **Accesible:** landmarks, enlace para saltar al contenido, todo operable con teclado, `focus-visible`, etiquetas aria en español, regiones vivas *polite* para las lecturas clave, `prefers-reduced-motion` respetado, contraste WCAG AA.
- **Cero errores de consola.**
- **`localStorage` solo para el tema**, y siempre dentro de `try/catch`.
