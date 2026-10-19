// playwright.config.mjs — Propietario: architect.
// Chromium sin cabeza contra file:// (sin servidor). Dos páginas:
//   src  → index.html (código modular)          dist → dist/sistemas-dinamicos.html (archivo único)
// Los specs abren la app con el fixture gotoApp de tests/helpers/fixtures.mjs, que usa la opción
// appPage de cada proyecto. Las páginas de prueba (tests/pages/*.html) solo corren en «src».
//
// Pruebas de tiempo real (auditoría, ronda 2). Los tests que acotan tiempo real (LCP/CLS, tareas largas,
// Event Timing a 4× de CPU, fps, ms, la relación 1×/4× de la galería) llevan la etiqueta @timing
// (TIMING de tests/helpers/fixtures.mjs). «src» y «dist» las excluyen y las pasan a «src-timing» y
// «dist-timing», con un solo proceso cada uno. Son su teardown: Playwright las ejecuta en una fase
// aparte, cuando su proyecto ya terminó, aunque haya fallado algún test, y sin ningún otro test en
// marcha. En una ejecución completa las dos comparten esa última fase: como mucho un test de tiempo por
// proyecto a la vez. Encadenarlas (una como teardown de la otra) bloquea el reparto de fases de
// Playwright, por eso no se hace. Detalles y órdenes: docs/ARCHITECTURE.md §15.2.
//
//   npx playwright test                       todo: src + dist y después sus pruebas de tiempo
//   npx playwright test --project=src         src y después src-timing (dist igual)
//   npx playwright test tests/e2e/<clave>.spec.mjs --project="src*" --no-deps --output "test-results/<clave>"
//                                             un archivo entero (también sus pruebas de tiempo); sin
//                                             --no-deps, el teardown traería todas las pruebas de tiempo
import { defineConfig } from '@playwright/test';

const TIMING = /@timing/;
const PAGES = { src: 'index.html', dist: 'dist/sistemas-dinamicos.html' };

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.mjs$/,
  outputDir: 'test-results/playwright',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'es-ES',
    timezoneId: 'UTC',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  projects: Object.entries(PAGES).flatMap(([name, appPage]) => [
    { name, use: { appPage }, grepInvert: TIMING, teardown: `${name}-timing` },
    { name: `${name}-timing`, use: { appPage }, grep: TIMING, workers: 1 },
  ]),
});
