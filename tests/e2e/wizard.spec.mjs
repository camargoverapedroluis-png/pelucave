// tests/e2e/wizard.spec.mjs — Propietario: wizard.
// Sección #modelado: asistente de 4 pasos sobre 4 ejemplos. Navegación por carril, botones y teclado,
// aria-current, resaltado enlazado diagrama ↔ lista, recorrido de leyes, ensamblado de la ecuación,
// eventos del bus, calibración con RMSE e invariantes, movimiento reducido, sin desbordamiento,
// sin errores de consola (guard) y capturas en ambos temas.
// Correcciones de la auditoría (WZ-01 … WZ-08): cambio de paso en secuencia con altura animada,
// nombres accesibles de los términos, foco al desactivarse botones, anuncios del RMSE agrupados,
// «Ver datos» de los residuos, contraste de los diagramas, objetivos táctiles, textos de entrada y
// construcción diferida con altura reservada.
// Ejecutar: npx playwright test tests/e2e/wizard.spec.mjs --project=src --output "test-results/wizard"
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, TIMING, ROOT } from '../helpers/fixtures.mjs';

const SHOTS = path.join(ROOT, 'test-results', 'wizard');
const EXAMPLES = [
  { id: 'massSpring', slug: 'massspring', item: 'wz-item-input-f', law: 'wz-law-newton', term: 'wz-term-inercia', terms: 4, last: 'entrada' },
  { id: 'rlc', slug: 'rlc', item: 'wz-item-input-v', law: 'wz-law-kvl', term: 'wz-term-inductivo', terms: 4, last: 'entrada' },
  { id: 'tanks', slug: 'tanks', item: 'wz-item-input-qin', law: 'wz-law-masa', term: 'wz-term-acumulacion', terms: 3, last: 'entrada' },
  { id: 'sir', slug: 'sir', item: 'wz-item-input-u', law: 'wz-law-conservacion', term: 'wz-term-ds', terms: 5, last: 'dR' },
];
const STEP_CONTENT = ['wz-boundary', 'wz-law-list', 'wz-eq', 'wz-fit'];
// Las capturas de elemento ocultan la barra fija y el enlace de salto, que se superpondrían.
const HIDE_CHROME = '.app-header, .skip-link { visibility: hidden; }';
/** Captura completa de la sección, con su borde superior alineado antes de medir. */
async function shootRoot(page, file) {
  const root = page.getByTestId('wz-root');
  await root.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.waitForTimeout(150);
  await root.screenshot({ path: path.join(SHOTS, file), animations: 'disabled', style: HIDE_CHROME });
}
const num = (s) => Number(String(s).replace(/−/g, '-').replace(/[^\d.\-e]/g, ''));

/** Abre la app en #modelado y espera a que el primer paso esté construido. */
async function openWizard(page, gotoApp, opts = {}) {
  await gotoApp('#modelado', opts);
  await page.locator('#modelado').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('wz-boundary')).toBeVisible({ timeout: 10000 });
}

const current = (page) => page.locator('[data-testid^="wz-step-"][aria-current="step"]');

async function expectStep(page, n) {
  await expect(page.getByTestId('wz-root')).toHaveAttribute('data-step', String(n));
  await expect(current(page)).toHaveCount(1);
  await expect(current(page)).toHaveAttribute('data-testid', `wz-step-${n}`);
  await expect(page.getByTestId(`wz-panel-${n}`)).toBeVisible();
  await expect(page.getByTestId(`wz-panel-${n}`).getByTestId(STEP_CONTENT[n - 1]).first()).toBeVisible();
  for (let k = 1; k <= 4; k++) if (k !== n) await expect(page.getByTestId(`wz-panel-${k}`)).toBeHidden();
}

async function pickExample(page, ex) {
  await page.getByTestId(`wz-example-${ex.slug}`).click();
  await expect(page.getByTestId('wz-root')).toHaveAttribute('data-example', ex.id);
  await page.waitForTimeout(260);
}

/** Desplaza la página para que el elemento quede justo bajo la barra fija. */
async function scrollToTestId(page, id) {
  await page.evaluate((tid) => {
    const el = document.querySelector(`[data-testid="${tid}"]`);
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64;
    window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - header - 16);
  }, id);
  await page.waitForTimeout(300);
}

/** Registra los eventos del bus que se quieren observar en window.__wzEvents. */
async function recordBus(page, names) {
  await page.evaluate((list) => {
    window.__wzEvents = [];
    list.forEach((n) => window.DSL.bus.on(n, (p) => window.__wzEvents.push({ name: n, payload: JSON.parse(JSON.stringify(p || {})) })));
  }, names);
}
const busEvents = (page) => page.evaluate(() => window.__wzEvents);

test.describe('#modelado — asistente de modelado en 4 pasos', () => {
  test('monta encabezado, selector de ejemplo, carril con aria-current y el paso 1', async ({ page, gotoApp }) => {
    await openWizard(page, gotoApp);
    await expect(page.locator('h2#modelado-title')).toHaveText('Pasos para modelar un sistema');
    await expect(page.getByTestId('wz-example')).toHaveAttribute('role', 'radiogroup');
    await expect(page.getByTestId('wz-example-massspring')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('wz-rail')).toHaveAttribute('aria-label', 'Pasos del modelado');
    await expect(page.locator('[data-testid^="wz-step-"]')).toHaveCount(4);
    await expectStep(page, 1);
    await expect(page.getByTestId('wz-prev')).toBeHidden();
    await expect(page.getByTestId('wz-next')).toHaveText(/Ir a: Aplicar leyes/);
    await expect(page.getByTestId('wz-boundary')).toHaveAttribute('role', 'img');
    const text = await page.locator('#modelado').innerText();
    expect(text).not.toMatch(/\b(fácil|simple|rápido|simplemente|Comenzar|Saber más)\b/i);
  });

  test('todos los pasos × todos los ejemplos: carril, Siguiente/Anterior y teclado', async ({ page, gotoApp }) => {
    test.setTimeout(90_000);
    await openWizard(page, gotoApp);
    for (const ex of EXAMPLES) {
      await pickExample(page, ex);
      // Teclado en el carril: flechas, Fin, Inicio.
      await page.getByTestId('wz-step-1').click();
      await expectStep(page, 1);
      for (let n = 2; n <= 4; n++) {
        await page.keyboard.press('ArrowRight');
        await expectStep(page, n);
        await expect(page.getByTestId(`wz-step-${n}`)).toBeFocused();
      }
      await page.keyboard.press('ArrowRight');
      await expectStep(page, 4);
      await page.keyboard.press('Home');
      await expectStep(page, 1);
      await page.keyboard.press('End');
      await expectStep(page, 4);
      await page.keyboard.press('ArrowLeft');
      await expectStep(page, 3);
      // Botones de navegación.
      await page.getByTestId('wz-step-1').click();
      for (let n = 2; n <= 4; n++) {
        await page.getByTestId('wz-next').click();
        await expectStep(page, n);
      }
      await expect(page.getByTestId('wz-next')).toBeHidden();
      await page.getByTestId('wz-prev').click();
      await expectStep(page, 3);
      await page.getByTestId('wz-step-1').click();
      await expectStep(page, 1);
    }
  });

  test('Enter y flechas sobre la navegación del panel cambian de paso', async ({ page, gotoApp }) => {
    await openWizard(page, gotoApp);
    await page.getByTestId('wz-next').focus();
    await page.keyboard.press('Enter');
    await expectStep(page, 2);
    await page.keyboard.press('ArrowRight');
    await expectStep(page, 3);
    await page.getByTestId('wz-next').focus();
    await page.keyboard.press('Enter');
    await expectStep(page, 4);
    // «Siguiente» desaparece en el último paso: el foco pasa al título del paso.
    await expect(page.locator('.wz-step:not([hidden]) .wz-step__title')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expectStep(page, 3);
  });

  test('paso 1: resaltado con puntero, foco y clic en ambos sentidos', async ({ page, gotoApp }) => {
    await openWizard(page, gotoApp);
    const dg = page.getByTestId('wz-boundary');
    const partF = dg.locator('[data-refs~="input:F"]').first();
    await page.getByTestId('wz-item-input-f').hover();
    await expect(dg).toHaveClass(/has-hl/);
    await expect(partF).toHaveClass(/is-hl/);
    await expect(dg.locator('[data-refs~="element:masa"]')).not.toHaveClass(/is-hl/);
    // Foco con el teclado.
    await page.mouse.move(5, 5);
    await page.getByTestId('wz-item-element-resorte').focus();
    await expect(dg.locator('[data-refs~="element:resorte"]')).toHaveClass(/is-hl/);
    // Clic: queda fijado.
    await page.getByTestId('wz-item-env-pared').click();
    await expect(page.getByTestId('wz-item-env-pared')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('wz-item-env-pared').blur();
    await page.mouse.move(5, 5);
    await expect(dg.locator('[data-refs~="env:pared"]')).toHaveClass(/is-hl/);
    // Del diagrama a la lista.
    await dg.locator('[data-refs~="element:masa"]').hover();
    await expect(page.getByTestId('wz-item-element-masa')).toHaveClass(/is-hl/);
    for (const ex of EXAMPLES.slice(1)) {
      await pickExample(page, ex);
      await page.getByTestId(ex.item).hover();
      await expect(page.getByTestId('wz-boundary')).toHaveClass(/has-hl/);
    }
  });

  test('paso 2: leyes resaltadas una a una, lazos R/B en SIR', async ({ page, gotoApp }) => {
    await openWizard(page, gotoApp, { reducedMotion: true });
    await page.getByTestId('wz-step-2').click();
    // Con movimiento reducido no hay recorrido automático: la primera ley queda fijada.
    await expect(page.getByTestId('wz-law-newton')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('wz-laws')).toHaveClass(/has-hl/);
    await page.getByTestId('wz-laws-play').click();
    await expect(page.getByTestId('wz-laws-play')).toHaveAttribute('data-state', 'playing');
    await expect(page.getByTestId('wz-law-hooke')).toHaveAttribute('aria-pressed', 'true', { timeout: 4000 });
    await page.getByTestId('wz-laws-play').click();
    await expect(page.getByTestId('wz-laws-play')).toHaveAttribute('data-state', 'paused');
    await page.getByTestId('wz-law-viscoso').click();
    await expect(page.getByTestId('wz-laws').locator('[data-refs~="law:viscoso"]')).toHaveClass(/is-hl/);

    await pickExample(page, EXAMPLES[3]);
    await expect(page.getByTestId('wz-stockflow')).toBeVisible();
    await expect(page.getByTestId('wz-cld')).toBeVisible();
    for (const id of ['r1', 'b1', 'b2']) await expect(page.getByTestId(`wz-loop-${id}`)).toBeVisible();
    await expect(page.getByTestId('wz-loop-r1')).toContainText('Lazo de refuerzo');
    await expect(page.getByTestId('wz-loop-b1')).toContainText('Lazo de equilibrio');
    await page.getByTestId('wz-loop-r1').click();
    await expect(page.getByTestId('wz-cld').locator('[data-refs~="loop:R1"]').first()).toHaveClass(/is-hl/);
    await expect(page.getByTestId('wz-cld').locator('.wz-badge__tx')).toHaveText(['R1', 'B1', 'B2']);
  });

  test('paso 2: el recorrido automático arranca una vez por ejemplo', async ({ page, gotoApp }) => {
    await openWizard(page, gotoApp);
    await page.getByTestId('wz-step-2').click();
    await expect(page.getByTestId('wz-laws-play')).toHaveAttribute('data-state', 'playing');
    await expect(page.getByTestId('wz-law-newton')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('wz-law-hooke')).toHaveAttribute('aria-pressed', 'true', { timeout: 4000 });
    await page.getByTestId('wz-step-1').click();
    await page.getByTestId('wz-step-2').click();
    await expect(page.getByTestId('wz-laws-play')).not.toHaveAttribute('data-state', 'playing');
  });

  test('paso 3: ensamblado término a término, detalle, espacio de estados y G(s)', async ({ page, gotoApp }) => {
    await openWizard(page, gotoApp);
    await recordBus(page, ['tf:open', 'concepts:open']);
    await page.getByTestId('wz-step-3').click();
    await expect(page.getByTestId('wz-asm-count')).toHaveText('4 de 4 términos', { timeout: 6000 });
    await page.getByTestId('wz-term-replay').click();
    await expect(page.getByTestId('wz-asm-count')).toHaveText(/^[0-2] de 4 términos$/);
    await page.getByTestId('wz-term-all').click();
    await expect(page.getByTestId('wz-asm-count')).toHaveText('4 de 4 términos');
    await page.getByTestId('wz-term-rigidez').click();
    // Solo la ficha del término elegido es visible (las demás se apilan ocultas en la misma celda).
    await expect(page.getByTestId('wz-term-detail').locator('.wz-detail__card.is-shown')).toHaveCount(1);
    await expect(page.getByTestId('wz-term-detail').locator('.wz-detail__card.is-shown')).toContainText('Rigidez');
    await expect(page.getByTestId('wz-term-detail').locator('.wz-detail__card.is-shown')).toBeVisible();
    await expect(page.getByTestId('wz-term-rigidez')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('wz-linear')).toHaveText('Lineal');
    const sym = await page.getByTestId('wz-statespace').innerText();
    await page.getByTestId('wz-ss-mode-num').click();
    await expect(page.getByTestId('wz-statespace')).not.toHaveText(sym);
    await expect(page.getByTestId('wz-ss-values')).toContainText('k = 4');
    await page.getByTestId('wz-open-tf').click();
    let ev = await busEvents(page);
    expect(ev[0]).toMatchObject({ name: 'tf:open', payload: { systemId: 'massSpring', variant: 'base', outputKey: 'x' } });
    expect(ev[0].payload.params).toMatchObject({ m: 1, b: 0.8, k: 4 });

    await page.locator('#modelado').scrollIntoViewIfNeeded();
    await pickExample(page, EXAMPLES[3]);
    await page.getByTestId('wz-step-3').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('wz-asm-count')).toHaveText('5 de 5 piezas', { timeout: 8000 });
    await expect(page.getByTestId('wz-linear')).toHaveText('No lineal');
    await page.getByTestId('wz-term-contagio').click();
    await expect(page.getByTestId('wz-eq')).toHaveAttribute('data-flow', 'contagio');
    await expect(page.locator('[data-testid="wz-eq"] .wz-flow--contagio')).toHaveCount(2);
    await page.getByTestId('wz-open-concepts').click();
    ev = await busEvents(page);
    expect(ev.at(-1)).toMatchObject({ name: 'concepts:open', payload: { card: 'linealidad', tab: 'superposicion' } });
  });

  test('paso 4: calibración, RMSE, residuos, veredicto e invariantes', async ({ page, gotoApp }) => {
    await openWizard(page, gotoApp, { reducedMotion: true });
    await recordBus(page, ['gallery:open']);
    await page.getByTestId('wz-step-4').click();
    await expect(page.getByTestId('wz-fit')).toBeVisible();
    await expect(page.getByTestId('wz-residuals')).toBeVisible();
    const rmse0 = num(await page.getByTestId('wz-rmse-value').innerText());
    expect(rmse0).toBeGreaterThan(0.008);
    await expect(page.getByTestId('wz-verdict')).not.toHaveAttribute('data-level', 'ruido');
    await expect(page.getByTestId('wz-noise-value')).toHaveText('0.004');
    const f = page.getByTestId('wz-calib-number');
    await f.fill('1,1');
    await f.press('Enter');
    await expect(page.getByTestId('wz-verdict')).toHaveAttribute('data-level', 'ruido');
    const rmse1 = num(await page.getByTestId('wz-rmse-value').innerText());
    expect(rmse1).toBeLessThan(0.005);
    // El rango del arrastre también recalcula.
    await page.getByTestId('wz-calib-input').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('wz-calib-number')).toHaveValue('1.05');
    await expect(page.getByTestId('wz-inv-energia')).toHaveText(/Se cumple/);
    await page.getByTestId('wz-method-euler').click();
    await expect(page.getByTestId('wz-inv-energia')).toHaveText(/No se cumple/);
    await page.getByTestId('wz-method-rk4').click();
    await page.getByTestId('wz-dt-20').click();
    await expect(page.getByTestId('wz-inv-energia')).toHaveText(/Se cumple/);
    await page.getByTestId('wz-open-gallery').click();
    const ev = await busEvents(page);
    expect(ev[0]).toMatchObject({ name: 'gallery:open', payload: { systemId: 'massSpring', variant: 'base' } });

    // Los demás ejemplos: valor verdadero → error al nivel del ruido.
    const TRUE = { rlc: '30', tanks: '12', sir: '0.33' };
    for (const ex of EXAMPLES.slice(1)) {
      await page.locator('#modelado').scrollIntoViewIfNeeded();
      await pickExample(page, ex);
      await expect(page.getByTestId('wz-fit')).toBeVisible();
      await expect(page.getByTestId('wz-verdict')).not.toHaveAttribute('data-level', 'ruido');
      await expect(page.locator('[data-testid^="wz-inv-"]').first()).toBeVisible();
      await page.getByTestId('wz-calib-number').fill(TRUE[ex.id]);
      await page.getByTestId('wz-calib-number').press('Enter');
      await expect(page.getByTestId('wz-verdict')).toHaveAttribute('data-level', 'ruido');
    }
    // El valor calibrado se conserva al cambiar de ejemplo y volver.
    await pickExample(page, EXAMPLES[0]);
    await expect(page.getByTestId('wz-calib-number')).toHaveValue('1.05');
  });

  test('movimiento reducido: sin desplazamientos, todo visible al entrar', async ({ page, gotoApp }) => {
    await openWizard(page, gotoApp, { reducedMotion: true });
    const travel = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--travel-step').trim());
    expect(travel).toBe('0px');
    await page.getByTestId('wz-next').click();
    await expectStep(page, 2);
    await expect(page.getByTestId('wz-laws-play')).not.toHaveAttribute('data-state', 'playing');
    await page.getByTestId('wz-next').click();
    await expect(page.getByTestId('wz-asm-count')).toHaveText('4 de 4 términos');
    const transform = await page.getByTestId('wz-panel-3').evaluate((n) => getComputedStyle(n).transform);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform);
  });

  test('sin desbordamiento horizontal a 1024, 768 y 390 px en los cuatro pasos', async ({ page, gotoApp }) => {
    test.setTimeout(90_000);
    for (const [w, h] of [[1024, 768], [768, 1024], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('about:blank');
      await openWizard(page, gotoApp, { reducedMotion: true });
      for (const ex of [EXAMPLES[0], EXAMPLES[3]]) {
        await pickExample(page, ex);
        for (let n = 1; n <= 4; n++) {
          await page.getByTestId(`wz-step-${n}`).click();
          await expectStep(page, n);
          const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(over, `desbordamiento a ${w}px (${ex.id}, paso ${n})`).toBeLessThanOrEqual(0);
          const wide = await page.evaluate(() => {
            const sec = document.querySelector('[data-mount="wizard"]').getBoundingClientRect();
            return [...document.querySelectorAll('[data-mount="wizard"] *')]
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.right > sec.right + 1 && !el.closest('.wz-figure__plot, .ds-math-block, .wz-example__seg, .wz-term--row, .wz-law__tex');
              })
              .map((el) => String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || el.tagName)
              .slice(0, 5);
          });
          expect(wide, `elementos fuera de la sección a ${w}px (${ex.id}, paso ${n})`).toEqual([]);
        }
      }
    }
  });

  for (const theme of ['dark', 'light']) {
    for (const [w, h] of [[1440, 900], [1024, 768]]) {
      test(`capturas ${w}×${h} (${theme})`, async ({ page, gotoApp }) => {
        test.setTimeout(180_000);
        await page.setViewportSize({ width: w, height: h });
        await openWizard(page, gotoApp, { reducedMotion: true });
        await page.evaluate((t) => window.DSL.prefs.setTheme(t), theme);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const all = w === 1440 && theme === 'dark';
        const list = all ? EXAMPLES : [EXAMPLES[0], EXAMPLES[3]];
        for (const ex of list) {
          await pickExample(page, ex);
          for (let n = 1; n <= 4; n++) {
            if (!all && ex.id === 'sir' && n !== 2 && n !== 3) continue;
            await page.getByTestId(`wz-step-${n}`).click();
            await expectStep(page, n);
            if (n === 1) await page.getByTestId(ex.item).click();
            if (n === 3 && await page.getByTestId('wz-term-all').isEnabled()) await page.getByTestId('wz-term-all').click();
            await page.waitForTimeout(450);
            const tag = `wz-${w}-${theme}-${ex.slug}-${n}`;
            await page.mouse.move(2, 2);
            await shootRoot(page, `${tag}.png`);
          }
          await page.getByTestId('wz-step-1').click();
        }
        // Vista de pantalla tal como la ve el estudiante (encabezado fijo incluido).
        await scrollToTestId(page, 'wz-rail');
        await page.screenshot({ path: path.join(SHOTS, `wz-${w}-${theme}-viewport.png`), animations: 'disabled' });
      });
    }
  }

  test('captura 390 px (oscuro)', async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openWizard(page, gotoApp, { reducedMotion: true });
    for (const ex of [EXAMPLES[0], EXAMPLES[3]]) {
      await pickExample(page, ex);
      for (let n = 1; n <= 4; n++) {
        if (ex.id === 'sir' && n !== 2) continue;
        await page.getByTestId(`wz-step-${n}`).click();
        await expectStep(page, n);
        await page.waitForTimeout(400);
        await shootRoot(page, `wz-390-dark-${ex.slug}-${n}.png`);
      }
      await page.getByTestId('wz-step-1').click();
    }
  });
});

/* ======================================================================== auditoría WZ-01 … WZ-08 */

const HIDE_SVG_TEXT = '.wz-dg text, .wz-dg tspan { fill: transparent !important; stroke: transparent !important; transition: none !important; }';
const IDENTITY = ['none', 'matrix(1, 0, 0, 1, 0, 0)'];
const countText = (n) => new RegExp(`^${n} de ${n} (términos|piezas)$`);

/**
 * Muestrea por frames (requestAnimationFrame) un clic en la marca k del carril: opacidad y transform de
 * cada panel, alto del escenario y su altura en línea. t se mide desde el clic con la marca de tiempo
 * del frame (el reloj con que se muestrean las animaciones), no con la hora a la que se ejecuta el
 * callback, que con la máquina cargada llega tarde respecto al estado que lee. `start` es el instante
 * (mismo reloj) en que arranca la animación de entrada del paso k: el clic y el primer frame con el
 * paso nuevo en pantalla ocurren antes.
 */
async function sampleStepChange(page, k, ms = 700) {
  return page.evaluate(({ k, ms }) => new Promise((resolve) => {
    const stage = document.querySelector('[data-testid="wz-stage"]');
    const panels = [...stage.children].filter((c) => c.classList.contains('wz-step'));
    const frames = [];
    const h0 = stage.getBoundingClientRect().height;
    let start = null;
    const t0 = performance.now();
    document.querySelector(`[data-testid="wz-step-${k}"]`).click();
    const handler = performance.now() - t0;
    function tick(ts) {
      const t = Math.max(0, ts - t0);
      if (start === null) {
        const a = panels[k - 1].getAnimations().find((x) => x.animationName === 'wz-step-in');
        if (a && a.startTime !== null) start = a.startTime - t0;
      }
      frames.push({
        t,
        h: stage.getBoundingClientRect().height,
        inline: stage.style.height,
        morph: stage.classList.contains('is-morphing'),
        vis: panels.map((p, i) => {
          const cs = p.hidden ? null : getComputedStyle(p);
          return { i, hidden: p.hidden, op: cs ? Number(cs.opacity) : 0, tf: cs ? cs.transform : 'none' };
        }),
      });
      if (t < ms) requestAnimationFrame(tick); else resolve({ h0, frames, start, handler });
    }
    requestAnimationFrame(tick);
  }), { k, ms });
}

/**
 * Contraste de cada texto de los SVG indicados: color de relleno calculado (con la opacidad de sus
 * antepasados) frente a la mediana del fondo en su recuadro, muestreada de una captura sin textos.
 * Los colores de todos los SVG se leen antes de la primera captura: al quitar el estilo que oculta los
 * textos, su relleno vuelve con la transición de 400 ms, y leer el SVG siguiente en ese intervalo
 * mediría un color a medio camino que ningún usuario ve en reposo.
 */
async function svgTextContrast(page, svgs) {
  const out = [];
  const n = await svgs.count();
  const all = [];
  for (let i = 0; i < n; i++) {
    all.push(await svgs.nth(i).evaluate((root) => {
      const sr = root.getBoundingClientRect();
      const nums = (c) => (String(c).match(/[\d.]+/g) || []).map(Number);
      return [...root.querySelectorAll('text')].map((t) => {
        const r = t.getBoundingClientRect();
        let op = 1;
        for (let e = t; e && e !== root; e = e.parentNode) op *= Number(getComputedStyle(e).opacity);
        return { text: t.textContent.trim(), x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height, fg: nums(getComputedStyle(t).fill), op };
      }).filter((it) => it.text && it.w > 1 && it.h > 1);
    }));
  }
  for (let i = 0; i < n; i++) {
    const svg = svgs.nth(i);
    const items = all[i];
    await svg.scrollIntoViewIfNeeded();
    const png = await svg.screenshot({ animations: 'disabled', style: HIDE_CHROME + HIDE_SVG_TEXT });
    const res = await page.evaluate(async ({ b64, items }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      return items.map((it) => {
        const x = Math.max(0, Math.min(img.width - 1, Math.round(it.x)));
        const y = Math.max(0, Math.min(img.height - 1, Math.round(it.y)));
        const w = Math.max(1, Math.min(Math.round(it.w), img.width - x));
        const h = Math.max(1, Math.min(Math.round(it.h), img.height - y));
        const d = ctx.getImageData(x, y, w, h).data;
        const px = [];
        for (let k = 0; k < d.length; k += 4) px.push([L(d[k], d[k + 1], d[k + 2]), d[k], d[k + 1], d[k + 2]]);
        px.sort((a, b) => a[0] - b[0]);
        const bg = px[Math.floor(px.length / 2)];
        const a = (it.fg[3] === undefined ? 1 : it.fg[3]) * it.op;
        const fg = [0, 1, 2].map((c) => a * it.fg[c] + (1 - a) * bg[c + 1]);
        const lf = L(fg[0], fg[1], fg[2]);
        const ratio = (Math.max(lf, bg[0]) + 0.05) / (Math.min(lf, bg[0]) + 0.05);
        return { text: it.text, ratio: Math.round(ratio * 100) / 100, fg: fg.map(Math.round), bg: bg.slice(1) };
      });
    }, { b64: png.toString('base64'), items });
    out.push(...res.map((r) => ({ ...r, svg: i })));
  }
  return out;
}

const lowContrast = (rows) => rows.filter((r) => r.ratio < 4.5).map((r) => `${r.text} ${r.ratio} fg=${r.fg} bg=${r.bg}`);

/**
 * Contraste de la tinta de un texto del diagrama, con el método de SCN-02 (scenes.spec): la tinta son los
 * píxeles que cambian al ocultar los textos, el fondo es la captura sin textos en esa tinta dilatada 1 px
 * y el color del texto es su fill calculado. El texto es el primero de `sel` cuyo contenido es `text`.
 * Devuelve el peor cociente y el número de píxeles de tinta.
 */
async function inkContrast(page, svg, sel, text) {
  await svg.scrollIntoViewIfNeeded();
  const it = await svg.evaluate((root, { sel, text }) => {
    const t = [...root.querySelectorAll(sel)].find((n) => n.textContent.trim() === text);
    const rb = root.getBoundingClientRect();
    const r = t.getBoundingClientRect();
    let op = 1;
    for (let e = t; e && e !== root; e = e.parentNode) op *= Number(getComputedStyle(e).opacity);
    return { fill: getComputedStyle(t).fill, op, x: r.left - rb.left, y: r.top - rb.top, w: r.width, h: r.height };
  }, { sel, text });
  const shown = await svg.screenshot({ animations: 'disabled', style: HIDE_CHROME });
  const hidden = await svg.screenshot({ animations: 'disabled', style: HIDE_CHROME + HIDE_SVG_TEXT });
  return page.evaluate(async ({ a64, b64, it }) => {
    const load = async (b) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b}`;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, img.width, img.height);
    };
    const A = await load(a64);
    const B = await load(b64);
    const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const W = A.width;
    const H = A.height;
    const fg = it.fill.match(/[\d.]+/g).map(Number);
    const lf = lum(fg[0], fg[1], fg[2]);
    const x0 = Math.max(0, Math.floor(it.x) - 2);
    const y0 = Math.max(0, Math.floor(it.y) - 2);
    const x1 = Math.min(W - 1, Math.ceil(it.x + it.w) + 2);
    const y1 = Math.min(H - 1, Math.ceil(it.y + it.h) + 2);
    const ink = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = 4 * (y * W + x);
        if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 30) ink.push([x, y]);
      }
    }
    let worst = Infinity;
    for (const [px, py] of ink) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = px + dx;
          const y = py + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const i = 4 * (y * W + x);
          worst = Math.min(worst, ratio(lf, lum(B.data[i], B.data[i + 1], B.data[i + 2])));
        }
      }
    }
    const xs = ink.map((p) => p[0]);
    const ys = ink.map((p) => p[1]);
    const box = ink.length ? { l: Math.min(...xs), t: Math.min(...ys), r: Math.max(...xs) + 1, b: Math.max(...ys) + 1 } : null;
    return { inkPx: ink.length, op: it.op, ratio: Math.round(worst * 100) / 100, box };
  }, { a64: shown.toString('base64'), b64: hidden.toString('base64'), it });
}

async function setTheme(page, theme) {
  await page.evaluate((t) => window.DSL.prefs.setTheme(t), theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.waitForTimeout(450);
}

test.describe('#modelado — correcciones de la auditoría', () => {
  test('WZ-01: el cambio de paso sale y luego entra, sin superponerse, y la altura se anima', TIMING, async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    await openWizard(page, gotoApp);
    await scrollToTestId(page, 'wz-rail');
    for (const k of [2, 3, 4, 3, 2, 1]) {
      // El paso de destino ya está construido antes del clic: los vecinos del paso actual se
      // construyen ocultos en tiempo ocioso (2 al estar en 1, 3 al estar en 2, 4 al estar en 3).
      await expect(page.getByTestId(`wz-panel-${k}`).locator('.wz-step__body'), `paso ${k} sin construir de antemano`).not.toBeEmpty({ timeout: 5000 });
      const { h0, frames, start, handler } = await sampleStepChange(page, k, 900);
      const target = k - 1;
      // Nunca dos pasos legibles a la vez.
      const both = frames.filter((f) => f.vis.filter((v) => v.op > 0.05).length > 1).map((f) => Math.round(f.t));
      expect(both, `frames con dos pasos por encima de 0,05 (→ paso ${k})`).toEqual([]);
      // El clic no hace trabajo síncrono pesado: no construye nada ni fuerza estilo o disposición del
      // paso nuevo (todas las medidas se leen antes de tocar el DOM).
      expect(handler, `trabajo síncrono del clic (→ paso ${k})`).toBeLessThanOrEqual(30);
      // La animación arranca en cuanto el navegador pinta el paso nuevo. Ese primer pintado (estilo,
      // disposición y rasterizado del panel) es trabajo del navegador: 5–60 ms con la máquina libre,
      // hasta ~180 ms con varias suites en paralelo. El límite solo descarta un retraso añadido.
      expect(start, `la entrada del paso ${k} no arrancó`).not.toBeNull();
      expect(start, `del clic al arranque de la animación (→ paso ${k})`).toBeLessThanOrEqual(250);
      // Todo el cambio (salida 150 ms + entrada 250 ms, y la altura en 300 ms) ha terminado 400 ms
      // después de arrancar: el último frame aún en curso cae antes de start + 400 (+10 de margen).
      // Medido así, un frame perdido por la carga de la máquina no cuenta como animación más larga.
      const settled = (f) => !f.inline && !f.morph && f.vis.every((v) => (v.i === target
        ? !v.hidden && v.op >= 0.99 && IDENTITY.includes(v.tf)
        : v.hidden));
      let idx = frames.length;
      while (idx > 0 && settled(frames[idx - 1])) idx--;
      expect(idx, `el cambio al paso ${k} no terminó en 900 ms`).toBeLessThan(frames.length);
      expect(idx, `el cambio al paso ${k} ya estaba terminado en el primer frame`).toBeGreaterThan(0);
      const busy = frames[idx - 1].t - start;
      expect(busy, `el cambio al paso ${k} seguía en curso ${Math.round(busy)} ms después de arrancar`).toBeLessThanOrEqual(410);
      // La altura del escenario cambia a lo largo de varios frames, no de golpe.
      const h1 = frames.at(-1).h;
      expect(Math.abs(h1 - h0), `alturas de los pasos (→ ${k})`).toBeGreaterThan(20);
      const moves = frames.filter((f, i) => Math.abs(f.h - (i ? frames[i - 1].h : h0)) > 0.5).length;
      expect(moves, `frames en que cambia la altura (→ paso ${k})`).toBeGreaterThanOrEqual(3);
      await expectStep(page, k);
    }
  });

  test('WZ-01: con movimiento reducido el cambio es instantáneo, sin animación', async ({ page, gotoApp }) => {
    await openWizard(page, gotoApp, { reducedMotion: true });
    for (const k of [2, 3, 4, 3, 1]) {
      const r = await page.evaluate((k) => new Promise((resolve) => {
        const stage = document.querySelector('[data-testid="wz-stage"]');
        const panels = [...stage.children].filter((c) => c.classList.contains('wz-step'));
        const snap = () => ({
          shown: panels.map((p) => !p.hidden),
          anims: stage.getAnimations().length + panels.reduce((s, p) => s + p.getAnimations().length, 0),
          inline: stage.style.height,
          morph: stage.classList.contains('is-morphing'),
          cls: panels.map((p) => p.className).join(' '),
        });
        document.querySelector(`[data-testid="wz-step-${k}"]`).click();
        const a = snap();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve([a, snap()])));
      }), k);
      for (const s of r) {
        expect(s.shown).toEqual([0, 1, 2, 3].map((i) => i === k - 1));
        expect(s.anims).toBe(0);
        expect(s.inline).toBe('');
        expect(s.morph).toBe(false);
        expect(s.cls).not.toMatch(/is-leaving|is-entering/);
      }
      await expectStep(page, k);
    }
  });

  test('WZ-01: «Ir a…» al pie de un paso largo deja el escenario justo bajo la barra', async ({ page, gotoApp }) => {
    await openWizard(page, gotoApp, { reducedMotion: true });
    await page.getByTestId('wz-step-4').click();
    await expectStep(page, 4);
    await page.getByTestId('wz-prev').scrollIntoViewIfNeeded();
    const stageTop = () => page.getByTestId('wz-stage').evaluate((n) => n.getBoundingClientRect().top);
    expect(await stageTop()).toBeLessThan(64);
    await page.getByTestId('wz-prev').click();
    await expectStep(page, 3);
    const want = await page.getByTestId('wz-stage').evaluate((n) => parseFloat(getComputedStyle(n).scrollMarginTop));
    expect(want).toBeGreaterThan(64);
    await expect.poll(stageTop).toBeGreaterThan(want - 2);
    expect(await stageTop()).toBeLessThan(want + 2);
  });

  test('WZ-02: cada término del paso 3 tiene un nombre accesible propio (axe button-name)', async ({ page, gotoApp }) => {
    test.setTimeout(120_000);
    await openWizard(page, gotoApp, { reducedMotion: true });
    for (const theme of ['dark', 'light']) {
      await setTheme(page, theme);
      for (const ex of EXAMPLES) {
        await page.locator('#modelado').scrollIntoViewIfNeeded();
        await pickExample(page, ex);
        await page.getByTestId('wz-step-3').click();
        await expectStep(page, 3);
        await expect(page.getByTestId('wz-asm-count')).toHaveText(countText(ex.terms));
        const terms = page.getByTestId('wz-asm').locator('.wz-term');
        await expect(terms).toHaveCount(ex.terms);
        const names = await terms.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''));
        expect(new Set(names).size, `nombres únicos (${ex.id})`).toBe(ex.terms);
        const order = names.map((s) => Number((/^Término (\d+) de (\d+): \S/.exec(s) || [])[1])).sort((a, b) => a - b);
        expect(order, `numeración de los términos (${ex.id}): ${names.join(' | ')}`).toEqual([...Array(ex.terms)].map((_, i) => i + 1));
        for (let k = 0; k < ex.terms; k++) {
          await expect(terms.nth(k)).toHaveAccessibleName(names[k]);
          await expect(terms.nth(k)).toHaveAccessibleDescription(/\S/);
          await expect(page.getByRole('button', { name: names[k], exact: true })).toHaveCount(1);
        }
        const axe = await new AxeBuilder({ page }).include('[data-testid="wz-panel-3"]').withRules(['button-name']).analyze();
        expect(axe.violations.map((v) => v.id + ': ' + v.nodes.length), `axe button-name (${ex.id}, ${theme})`).toEqual([]);
      }
    }
    await page.locator('#modelado').scrollIntoViewIfNeeded();
    await pickExample(page, EXAMPLES[0]);
    await expect(page.getByTestId('wz-term-inercia')).toHaveAccessibleName('Término 1 de 4: inercia, m·ẍ');
    await expect(page.getByTestId('wz-term-inercia')).toHaveAccessibleDescription('Fuerza neta necesaria para acelerar la masa.');
  });

  test('WZ-03: el foco se queda en el paso 3 cuando sus botones se desactivan', async ({ page, gotoApp }) => {
    test.setTimeout(120_000);
    await openWizard(page, gotoApp);
    const where = () => page.evaluate(() => {
      const a = document.activeElement;
      return {
        body: !a || a === document.body,
        inStep: !!(a && a.closest('[data-testid="wz-panel-3"]')),
        tid: (a && a.getAttribute('data-testid')) || '',
        term: (a && a.classList.contains('wz-term') && a.getAttribute('data-term')) || '',
      };
    });
    for (const [j, ex] of EXAMPLES.entries()) {
      await page.locator('#modelado').scrollIntoViewIfNeeded();
      await pickExample(page, ex);
      await page.getByTestId('wz-step-3').click();
      await expectStep(page, 3);
      const asm = page.getByTestId('wz-asm-count');
      await expect(asm).toHaveText(countText(ex.terms), { timeout: 8000 });

      // «Repetir»: se desactiva y el foco pasa a «Término siguiente».
      await page.getByTestId('wz-term-replay').focus();
      await page.keyboard.press('Enter');
      let f = await where();
      expect(f, `tras «Repetir» (${ex.id})`).toMatchObject({ body: false, inStep: true, tid: 'wz-term-next' });
      if (j === 0) {
        // El recorrido automático vuelve a completar la ecuación: «Término siguiente» se desactiva con el foco.
        await expect(asm).toHaveText(countText(ex.terms), { timeout: 8000 });
        f = await where();
        expect(f, 'tras el recorrido automático').toMatchObject({ body: false, inStep: true, term: ex.last });
        await page.getByTestId('wz-term-replay').focus();
        await page.keyboard.press('Enter');
      }

      // «Término siguiente» hasta el último: el foco pasa al último término revelado.
      for (let i = 0; i < ex.terms; i++) await page.keyboard.press('Enter');
      await expect(asm).toHaveText(countText(ex.terms));
      f = await where();
      expect(f, `tras el último «Término siguiente» (${ex.id})`).toMatchObject({ body: false, inStep: true, term: ex.last });

      // «Mostrar todo»: el foco pasa al último término.
      await page.getByTestId('wz-term-replay').focus();
      await page.keyboard.press('Enter');
      await page.getByTestId('wz-term-all').focus();
      await page.keyboard.press('Enter');
      await expect(asm).toHaveText(countText(ex.terms));
      f = await where();
      expect(f, `tras «Mostrar todo» (${ex.id})`).toMatchObject({ body: false, inStep: true, term: ex.last });
    }
  });

  test('WZ-04: diez pulsaciones del deslizador dan un solo anuncio del RMSE, al asentarse', async ({ page, gotoApp }) => {
    await openWizard(page, gotoApp, { reducedMotion: true });
    await page.getByTestId('wz-step-4').click();
    await expectStep(page, 4);
    await page.evaluate(() => {
      window.__live = [];
      new MutationObserver((recs) => {
        for (const r of recs) {
          const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
          const live = el && el.closest('[data-testid="ds-live"]');
          if (live && live.textContent) window.__live.push({ t: performance.now(), text: live.textContent });
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await page.getByTestId('wz-calib-input').focus();
    await page.waitForTimeout(800);
    await page.evaluate(() => { window.__live = []; });
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(180);
    }
    const tLast = await page.evaluate(() => performance.now());
    await page.waitForTimeout(1200);
    const live = await page.evaluate(() => window.__live);
    expect(live.length, JSON.stringify(live)).toBeLessThanOrEqual(2);
    const rmse = live.filter((x) => /RMSE/.test(x.text));
    expect(rmse, JSON.stringify(live)).toHaveLength(1);
    expect(rmse[0].t).toBeGreaterThan(tLast - 200);
    const value = await page.evaluate(() => window.DSL.app.handles.wizard.state.fit.massSpring.value);
    expect(value).toBeCloseTo(1.3, 6);
    expect(rmse[0].text).toContain('b = 1.3');
  });

  test('WZ-05: los residuos tienen su «Ver datos», con una fila por punto medido', async ({ page, gotoApp }) => {
    await openWizard(page, gotoApp, { reducedMotion: true });
    await page.getByTestId('wz-step-4').click();
    await expectStep(page, 4);
    const panel = page.getByTestId('wz-panel-4');
    for (const ex of [EXAMPLES[0], EXAMPLES[3]]) {
      if (ex !== EXAMPLES[0]) {
        await page.locator('#modelado').scrollIntoViewIfNeeded();
        await pickExample(page, ex);
      }
      await expect(panel.locator('.ch-data__toggle')).toHaveCount(2);
      await expect(page.getByTestId('wz-fit-data-toggle')).toBeVisible();
      await expect(page.getByTestId('wz-residuals-data-toggle')).toBeVisible();
      const data = await page.evaluate((id) => {
        const d = window.DSL.systems.syntheticData(id);
        return { n: window.DSL.systems.get(id).wizard.measured.samples, t: Array.from(d.t) };
      }, ex.id);
      if (ex.id === 'massSpring') expect(data.n).toBe(60);
      await page.getByTestId('wz-residuals-data-toggle').click();
      const table = page.getByTestId('wz-residuals-data').locator('table');
      await expect(table.locator('tbody tr')).toHaveCount(data.n);
      await expect(table.locator('thead th').first()).toHaveText(/^Tiempo t/);
      await expect(table.locator('thead th').nth(1)).toHaveText(/^Residuo/);
      const read = () => table.locator('tbody tr').evaluateAll((rows) => rows.map((r) => [...r.children].map((c) => c.textContent)));
      const rows0 = await read();
      rows0.forEach((r, i) => {
        expect(r).toHaveLength(2);
        expect(num(r[0])).toBeCloseTo(data.t[i], 2);
        expect(r[1]).toMatch(/\d/);
      });
      // Una nueva calibración actualiza la tabla abierta.
      const f = page.getByTestId('wz-calib-number');
      const v0 = Number(await f.inputValue());
      await f.fill(String(Math.round(v0 * 120) / 100).replace('.', ','));
      await f.press('Enter');
      await expect.poll(async () => (await read()).map((r) => r[1]).join('|')).not.toBe(rows0.map((r) => r[1]).join('|'));
      await page.getByTestId('wz-residuals-data-toggle').click();
    }
  });

  for (const theme of ['dark', 'light']) {
    test(`WZ-06: textos de los diagramas ≥ 4,5:1 en los pasos 1 y 2, «Frontera del sistema» incluida (${theme})`, async ({ page, gotoApp }) => {
      test.setTimeout(180_000);
      await openWizard(page, gotoApp, { reducedMotion: true });
      await setTheme(page, theme);
      const bad = [];
      for (const ex of EXAMPLES) {
        await page.locator('#modelado').scrollIntoViewIfNeeded();
        await pickExample(page, ex);
        // Paso 1: todos los rótulos (también los que van sobre el líquido, como «h») sin resaltado y
        // con cada parte de la lista fijada; el de la frontera, siempre presente.
        await page.getByTestId('wz-step-1').click();
        await expectStep(page, 1);
        const dg1 = page.getByTestId('wz-panel-1').locator('svg.wz-dg');
        const items = await page.getByTestId('wz-panel-1').locator('[data-testid^="wz-item-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
        expect(items).toContain(ex.item);
        expect(items).toContain('wz-item-boundary');
        for (const pin of [null, ...items]) {
          if (pin) await page.getByTestId(pin).click();
          await page.mouse.move(2, 2);
          await page.waitForTimeout(450);
          const rows = await svgTextContrast(page, dg1);
          expect(rows.filter((r) => r.text === 'Frontera del sistema'), `rótulo de la frontera (${ex.id})`).toHaveLength(1);
          bad.push(...lowContrast(rows).map((s) => `${ex.id} paso 1 [${pin || 'sin resaltar'}] ${s}`));
        }
        // Paso 2: estado inicial (primera ley fijada) y cada ley o lazo fijado.
        await page.getByTestId('wz-step-2').click();
        await expectStep(page, 2);
        const svgs = page.getByTestId('wz-panel-2').locator('svg.wz-dg');
        await expect(svgs.first()).toHaveClass(/has-hl/);
        const pins = await page.getByTestId('wz-panel-2').locator('.wz-law__btn').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
        for (const pin of [null, ...pins]) {
          if (pin) await page.getByTestId(pin).click();
          await page.mouse.move(2, 2);
          await page.waitForTimeout(450);
          const rows = await svgTextContrast(page, svgs);
          expect(rows.length).toBeGreaterThan(3);
          bad.push(...lowContrast(rows).map((s) => `${ex.id} paso 2 [${pin || 'inicial'}] ${s}`));
        }
      }
      expect(bad).toEqual([]);
    });

    test(`WZ-06: axe sin problemas de contraste en los estados del asistente (${theme})`, async ({ page, gotoApp }) => {
      test.setTimeout(180_000);
      await openWizard(page, gotoApp, { reducedMotion: true });
      await setTheme(page, theme);
      const found = [];
      for (const ex of EXAMPLES) {
        await page.locator('#modelado').scrollIntoViewIfNeeded();
        await pickExample(page, ex);
        for (let n = 1; n <= 4; n++) {
          await page.getByTestId(`wz-step-${n}`).click();
          await expectStep(page, n);
          if (n === 1) await page.getByTestId(ex.item).click();
          if (n === 3) await page.getByTestId(ex.id === 'sir' ? 'wz-term-contagio' : ex.term).click();
          await page.waitForTimeout(450);
          const axe = await new AxeBuilder({ page }).include('[data-testid="wz-root"]').withRules(['color-contrast']).analyze();
          for (const v of axe.violations) for (const node of v.nodes) found.push(`${ex.id} paso ${n}: ${node.target.join(' ')} — ${node.any.map((a) => a.message).join('; ')}`);
        }
        await page.getByTestId('wz-step-1').click();
      }
      expect(found).toEqual([]);
    });
  }

  // Auditoría, ronda 2: la «h» del tanque cae sobre el líquido. Lleva la placa de los rótulos sobre el
  // fluido de las escenas (SCN-02) y su tinta, medida como en SCN-02, cumple 4.5:1 en cada estado.
  for (const theme of ['dark', 'light']) {
    for (const [w, hh] of [[1440, 900], [390, 844]]) {
      test(`ronda 2: la «h» sobre el líquido del tanque (paso 1) lleva la placa de SCN-02 y su tinta mide ≥ 4,5:1 en cada estado (${theme}, ${w} px)`, async ({ page, gotoApp }) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width: w, height: hh });
        await openWizard(page, gotoApp, { reducedMotion: true });
        await setTheme(page, theme);
        await page.locator('#modelado').scrollIntoViewIfNeeded();
        await pickExample(page, EXAMPLES[2]);
        await page.getByTestId('wz-step-1').click();
        await expectStep(page, 1);
        const panel = page.getByTestId('wz-panel-1');
        const dg = panel.locator('svg.wz-dg');
        const geo = await dg.evaluate((root) => {
          const rb = root.getBoundingClientRect();
          const box = (n) => { const b = n.getBoundingClientRect(); return { l: b.left - rb.left, t: b.top - rb.top, r: b.right - rb.left, b: b.bottom - rb.top }; };
          const t = [...root.querySelectorAll('.wz-out text')].find((n) => n.textContent.trim() === 'h');
          const tag = t.closest('.wz-part').querySelector('rect.wz-tag--fluid');
          const probe = document.createElement('span');
          probe.style.color = 'var(--c-plot-bg)';
          root.parentNode.appendChild(probe);
          const plotBg = getComputedStyle(probe).color;
          probe.remove();
          const cs = tag && getComputedStyle(tag);
          return {
            text: box(t), liq: box(root.querySelector('rect.wz-liq:not(.wz-liq--stream)')), tag: tag && box(tag),
            plotBg, fill: cs && cs.fill, stroke: cs && cs.stroke, sw: cs && parseFloat(cs.strokeWidth),
            under: !!tag && !!(tag.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING),
          };
        });
        // El rótulo cae sobre el líquido (la razón de la placa) y la placa se pinta debajo de él.
        expect(Math.min(geo.text.r, geo.liq.r) > Math.max(geo.text.l, geo.liq.l) && Math.min(geo.text.b, geo.liq.b) > Math.max(geo.text.t, geo.liq.t), JSON.stringify(geo)).toBe(true);
        expect(geo.tag, 'placa .wz-tag--fluid en la parte de «h»').not.toBeNull();
        expect(geo.under, 'la placa va antes que el texto').toBe(true);
        // La receta de SCN-02 (.sc-tag-bg): relleno del área de trazado y filete de 1 px.
        expect(geo.fill).toBe(geo.plotBg);
        expect(geo.stroke).not.toBe('none');
        expect(geo.sw).toBeGreaterThanOrEqual(1);
        const items = await panel.locator('[data-testid^="wz-item-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
        expect(items).toContain('wz-item-output-h');
        const bad = [];
        const ratios = [];
        for (const pin of [null, ...items]) {
          if (pin) await page.getByTestId(pin).click();
          await page.mouse.move(2, 2);
          await page.waitForTimeout(450);
          const r = await inkContrast(page, dg, '.wz-out text', 'h');
          const state = pin || 'sin resaltar';
          ratios.push(`${state} ${r.ratio}`);
          if (!(r.inkPx > 10)) bad.push(`${state}: solo ${r.inkPx} píxeles de tinta`);
          if (r.ratio < 4.5) bad.push(`${state}: ${r.ratio}:1`);
          // Toda la tinta, dilatada 1 px (el fondo que se muestrea), cae dentro de la placa.
          if (r.box && (r.box.l - 1 < geo.tag.l - 0.5 || r.box.t - 1 < geo.tag.t - 0.5 || r.box.r + 1 > geo.tag.r + 0.5 || r.box.b + 1 > geo.tag.b + 0.5)) {
            bad.push(`${state}: tinta ${JSON.stringify(r.box)} fuera de la placa ${JSON.stringify(geo.tag)}`);
          }
        }
        test.info().annotations.push({ type: 'contraste de «h»', description: ratios.join(' · ') });
        expect(bad).toEqual([]);
      });
    }
  }

  test.describe('puntero táctil a 390 px', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
    test('WZ-06: cada marca del carril mide al menos 44 px de alto', async ({ page, gotoApp }) => {
      await openWizard(page, gotoApp, { reducedMotion: true });
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      for (let n = 1; n <= 4; n++) {
        await page.getByTestId(`wz-step-${n}`).click();
        await expectStep(page, n);
        const hs = await page.locator('.wz-mark').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
        expect(hs).toHaveLength(4);
        for (const hh of hs) expect(hh).toBeGreaterThanOrEqual(44);
      }
    });
  });

  test('WZ-07: las entradas de los pasos nombran temperatura y energía, sin desbordar a 390 px', async ({ page, gotoApp }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWizard(page, gotoApp, { reducedMotion: true });
    const intro = (n) => page.getByTestId(`wz-panel-${n}`).locator('.wz-step__intro');
    await expect(intro(1)).toContainText('temperatura');
    await expect(intro(1)).toContainText('fuerzas, voltajes, flujos');
    for (let n = 1; n <= 2; n++) {
      await page.getByTestId(`wz-step-${n}`).click();
      await expectStep(page, n);
      const r = await page.evaluate(() => {
        const W = window.innerWidth;
        const wide = [...document.querySelectorAll('#modelado *')]
          .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > W + 0.5 && !el.closest('.wz-figure__plot, .ds-math-block, .wz-example__seg, .wz-term--row, .wz-law__tex'); })
          .map((el) => String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || el.tagName)
          .slice(0, 5);
        return { over: document.documentElement.scrollWidth - W, wide };
      });
      expect(r.wide, `elementos de #modelado más allá de 390 px (paso ${n})`).toEqual([]);
      expect(r.over, `desbordamiento de la página (paso ${n})`).toBeLessThanOrEqual(0);
    }
    await expect(intro(2)).toContainText('balances de masa y energía');
    for (const word of ['Newton', 'Kirchhoff', 'población']) await expect(intro(2)).toContainText(word);
  });

  for (const [w, hh] of [[1440, 900], [1024, 768], [820, 1180], [390, 844]]) {
    test(`WZ-08: construir el paso 1 apenas cambia el alto de #modelado (${w}×${hh})`, TIMING, async ({ page, gotoApp }) => {
      await page.setViewportSize({ width: w, height: hh });
      await gotoApp('', { reducedMotion: true });
      const before = await page.evaluate(() => ({
        ready: window.DSL.app.handles.wizard.ready,
        h: document.getElementById('modelado').getBoundingClientRect().height,
      }));
      expect(before.ready, 'el asistente aún no debe estar construido').toBe(false);
      const after = await page.evaluate(() => {
        const t0 = performance.now();
        window.DSL.app.handles.wizard.init();
        const ms = performance.now() - t0;
        return { ms, ready: window.DSL.app.handles.wizard.ready, h: document.getElementById('modelado').getBoundingClientRect().height };
      });
      expect(after.ready).toBe(true);
      await expect(page.getByTestId('wz-boundary')).toBeAttached();
      expect(Math.abs(after.h - before.h), `alto antes ${before.h}, después ${after.h}`).toBeLessThanOrEqual(40);
      expect(after.ms, 'duración de la inicialización').toBeLessThan(120);
    });
  }

  test('WZ-08: 5 s después de cargar, un salto de #conceptos a #galeria llega a su sitio', TIMING, async ({ page, gotoApp }) => {
    test.setTimeout(30_000);
    await gotoApp('');
    await page.waitForTimeout(5000);
    await page.evaluate(() => document.getElementById('conceptos').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('galeria').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const header = document.querySelector('.app-header');
      const hb = header ? header.getBoundingClientRect().bottom : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h'));
      return { top: document.getElementById('galeria').getBoundingClientRect().top, hb, wizardReady: window.DSL.app.handles.wizard.ready };
    });
    expect(Math.abs(r.top - r.hb), JSON.stringify(r)).toBeLessThanOrEqual(8);
  });
});
