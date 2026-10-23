// tools/check-site.mjs — Propietario: architect.
// Comprobación de la página publicada (o de `npm run site:dev` en local): la abre con Chromium, recorre
// todas las secciones para que se completen las perezosas y falla si hay errores de consola o de página,
// violaciones de la CSP, peticiones fallidas, respuestas 4xx/5xx o peticiones a otro origen (la app no
// debe tocar la red, así que tampoco puede haber bloqueos CORS; el beacon de Cloudflare Web Analytics
// se anota, no es un fallo). Muestra las cabeceras relevantes y comprueba que una ruta desconocida
// devuelve la página (SPA) y que el nombre antiguo redirige.
//
// Uso: node tools/check-site.mjs https://pelucave.com          (npm run site:check -- https://pelucave.com)
//      PW_CHANNEL=chrome node tools/check-site.mjs http://localhost:8788   (con el Chrome instalado,
//      si los navegadores de Playwright no están descargados)
import { chromium } from '@playwright/test';

const url = process.argv[2];
if (!url) {
  console.error('Uso: node tools/check-site.mjs <url>');
  process.exit(2);
}
const origin = new URL(url).origin;
const problems = [];
const HEADERS = ['content-type', 'content-encoding', 'cache-control', 'etag', 'content-security-policy',
  'strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'cf-ray', 'cf-cache-status'];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} (${r.failure()?.errorText})`));
// Cloudflare inyecta el beacon de Web Analytics en el HTML; la CSP de deploy/_headers lo permite.
const CF_BEACON = /^https:\/\/(static\.)?cloudflareinsights\.com\//;
const notes = [];
page.on('request', (r) => {
  const u = r.url();
  if (u.startsWith(origin + '/') || /^(data|blob|about):/.test(u)) return;
  if (CF_BEACON.test(u)) notes.push(`beacon de Cloudflare Web Analytics: ${u}`);
  else problems.push(`peticion a otro origen: ${u}`);
});
page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
await page.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) => {
    console.error(`CSP: ${e.violatedDirective} bloqueo ${e.blockedURI || 'inline'} (${e.sourceFile || '?'}:${e.lineNumber || 0})`);
  });
});

const res = await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
const headers = res.headers();
console.log(`${res.status()} ${res.url()}`);
for (const h of HEADERS) console.log(`  ${h}: ${headers[h] ?? '(ausente)'}`);
await page.waitForSelector('html[data-ready="true"]', { state: 'attached', timeout: 30_000 });

// Recorre las secciones (completa las fases perezosas) y fuerza el init de las que lo exponen.
for (const hash of ['#inicio', '#conceptos', '#modelado', '#galeria', '#transferencia']) {
  await page.evaluate((h) => { document.querySelector(h)?.scrollIntoView({ block: 'start', behavior: 'instant' }); }, hash);
  await page.waitForTimeout(500);
}
await page.evaluate(() => Promise.all(Object.values(window.DSL.app.handles).map((h) => (h && typeof h.init === 'function' ? h.init() : null))));
await page.waitForTimeout(3000);
const ready = await page.evaluate(() => Object.keys(window.DSL.app.handles).sort().join(', '));
console.log(`  secciones montadas: ${ready}`);

// Rutas: una desconocida devuelve la página (SPA) y el nombre antiguo del archivo redirige a la raíz.
for (const p of ['/ruta-inexistente', '/sistemas-dinamicos.html']) {
  const r = await page.request.get(origin + p, { maxRedirects: 0 });
  const loc = r.headers().location ? ` -> ${r.headers().location}` : '';
  console.log(`  GET ${p}: ${r.status()}${loc}`);
  if (p === '/ruta-inexistente' && r.status() !== 200) problems.push(`SPA: ${p} devolvio ${r.status()} en vez de 200`);
  if (p === '/sistemas-dinamicos.html' && !(r.status() === 301 || r.status() === 200)) problems.push(`${p} devolvio ${r.status()}`);
}
await browser.close();

for (const n of notes) console.log(`  nota: ${n}`);
if (problems.length) {
  console.error('\nProblemas:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log('\nSin errores de consola, CSP, red ni rutas.');
