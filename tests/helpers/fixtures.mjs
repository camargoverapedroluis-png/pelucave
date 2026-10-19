// tests/helpers/fixtures.mjs — Propietario: architect.
// Fixtures comunes de Playwright. Todo spec importa de aquí:
//
//   import { test, expect } from '../helpers/fixtures.mjs';
//   test('…', async ({ page, gotoApp }) => { await gotoApp('#galeria'); … });
//
// - guard (automático): falla el test si hubo console.error, errores de página, peticiones fallidas
//   o cualquier petición fuera de file:/data:/blob:/about: (la app no debe tocar la red).
//   guard.allow(/regex/) permite un mensaje concreto; guard.problems lista lo recogido.
// - gotoApp(hash?, { reducedMotion? }): abre la página del proyecto (index.html o el dist) y espera
//   a <html data-ready="true">, que app.js fija tras montar todas las secciones.
// - gotoTestPage(nombre): abre tests/pages/<nombre> (solo proyecto «src»; en «dist» se omite el test).
// - appUrl / isDist / fileUrl(ruta): utilidades.
// - TIMING: detalles de un test que acota tiempo real (LCP/CLS, tareas largas, Event Timing, fps, ms):
//   test('…', TIMING, async (…) => {…}). Lleva la etiqueta @timing; playwright.config.mjs saca esos tests
//   de «src» y «dist» y los ejecuta en «src-timing» y «dist-timing», de uno en uno y cuando el resto ya
//   terminó (docs/ARCHITECTURE.md §15.2).
import { test as base, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** URL file:// de una ruta relativa a la raíz del proyecto. */
export function fileUrl(rel) {
  return pathToFileURL(path.join(ROOT, rel)).href;
}

const LOCAL = /^(file|data|blob|about):/i;

/** Detalles de los tests que acotan tiempo real (ver la cabecera y playwright.config.mjs). */
export const TIMING = { tag: '@timing' };

export const test = base.extend({
  /** Página de la app para el proyecto actual (la fija playwright.config.mjs). */
  appPage: ['index.html', { option: true }],

  appUrl: async ({ appPage }, use) => {
    await use(fileUrl(appPage));
  },

  isDist: async ({ appPage }, use) => {
    await use(appPage.startsWith('dist/'));
  },

  guard: [async ({ page }, use) => {
    const problems = [];
    const allowed = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
    page.on('requestfailed', (req) => problems.push(`requestfailed: ${req.url()} (${req.failure()?.errorText})`));
    page.on('request', (req) => {
      const url = req.url();
      if (!LOCAL.test(url)) problems.push(`red: ${url}`);
    });
    await use({
      problems,
      allow(re) { allowed.push(re); },
    });
    const real = problems.filter((p) => !allowed.some((re) => re.test(p)));
    expect(real, 'errores de consola, de página o de red durante el test').toEqual([]);
  }, { auto: true }],

  gotoApp: async ({ page, appUrl }, use) => {
    await use(async (hash = '', opts = {}) => {
      if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(appUrl + (hash || ''));
      await page.waitForSelector('html[data-ready="true"]', { state: 'attached' });
      return page;
    });
  },

  gotoTestPage: async ({ page, isDist }, use) => {
    await use(async (name) => {
      test.skip(isDist, 'Las páginas de prueba solo existen en el proyecto «src».');
      await page.goto(fileUrl(path.posix.join('tests/pages', name)));
      await page.waitForLoadState('load');
      return page;
    });
  },
});

export { expect };
