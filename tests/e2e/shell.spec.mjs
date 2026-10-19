// tests/e2e/shell.spec.mjs — Propietario: design-system.
// Navegador real (Chromium, file://) sobre tests/pages/ui-kitchen-sink.html: cada componente de DSL.ui
// en los dos temas, el shell (barra, scrollspy, tema, hoja «Menú», pie) y capturas para revisión visual
// en test-results/design-system/. Las pruebas de la página de pruebas solo corren en «src» (no existe en
// dist); las de la app («shell en la app», «auditoría foundation: la app»…) corren en los dos proyectos.
//   timeout 300 npx playwright test tests/e2e/shell.spec.mjs --project=src --output "test-results/design-system"
import path from 'node:path';
import zlib from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, TIMING, ROOT } from '../helpers/fixtures.mjs';

const PAGE = 'ui-kitchen-sink.html';
const SHOTS = path.join(ROOT, 'test-results', 'design-system');
const NB = ' ';

async function openKs(page, gotoTestPage, opts = {}) {
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoTestPage(PAGE);
  await page.waitForSelector('html[data-ready="true"]', { state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

/** Revela los bloques con aparición única recorriendo la página (como un visitante). */
async function visitAll(page) {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.6);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

async function noHorizontalOverflow(page) {
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const wide = [];
    const clipped = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (b.width && b.right > doc.clientWidth + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('.katex-mathml') && !clipped(el)) {
        wide.push((el.getAttribute('data-testid') || el.className || el.tagName).toString().slice(0, 60) + ' → ' + Math.round(b.right));
      }
    }
    return { sw: doc.scrollWidth, cw: doc.clientWidth, wide: wide.slice(0, 8) };
  });
  expect(r.wide, 'elementos que desbordan a la derecha').toEqual([]);
  expect(r.sw).toBeLessThanOrEqual(r.cw);
}

/* ======================================================================= página de pruebas */

test.describe('sistema de diseño: página de pruebas', () => {
  test('carga sin errores con cada bloque en los dos temas', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    await expect(page.locator('.ks-pane')).toHaveCount(10);
    await expect(page.locator('.ks-pane[data-theme="dark"]')).toHaveCount(5);
    await expect(page.locator('.ks-pane[data-theme="light"]')).toHaveCount(5);
    const info = await page.evaluate(() => {
      const css = (el, p) => getComputedStyle(el).getPropertyValue(p).trim();
      const light = document.querySelector('.ks-pane[data-theme="light"]');
      return {
        body: getComputedStyle(document.body).backgroundColor,
        bgDark: css(document.documentElement, '--bg'),
        bgLight: css(light, '--bg'),
        paneLight: getComputedStyle(light).backgroundColor,
        katex: document.querySelectorAll('.katex').length,
        plex: document.fonts.check('16px "IBM Plex Sans"'),
        brico: document.fonts.check('600 32px "Bricolage Grotesque"'),
        h1Font: getComputedStyle(document.querySelector('h1')).fontFamily,
        icons: document.querySelectorAll('svg.ds-icon').length,
        unknownIcons: [...document.querySelectorAll('svg.ds-icon')].filter((s) => !s.firstElementChild).length,
      };
    });
    expect(info.body).toBe('rgb(15, 24, 35)');
    expect(info.bgDark.toUpperCase()).toBe('#0F1823');
    expect(info.bgLight.toUpperCase()).toBe('#EEF2F6');
    expect(info.paneLight).toBe('rgb(238, 242, 246)');
    expect(info.katex).toBeGreaterThan(10);
    expect(info.plex).toBe(true);
    expect(info.brico).toBe(true);
    expect(info.h1Font).toMatch(/Bricolage/);
    expect(info.icons).toBeGreaterThan(40);
    expect(info.unknownIcons).toBe(0);
    await expect(page.getByTestId('sh-footer')).toBeVisible();
    await expect(page.locator('[data-testid="ds-live"]')).toHaveCount(1);
    // Cada botón y cada control tiene nombre accesible.
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('button, input, select, [role="switch"], [role="radio"], [role="tab"]')]
      .filter((el) => {
        const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label');
        return !label && !el.textContent.trim();
      })
      .map((el) => el.outerHTML.slice(0, 80)));
    expect(unnamed).toEqual([]);
  });

  test('slider: teclado, campo con coma, burbuja con foco, reinicio y ayuda', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    const root = page.getByTestId('ds-ks-dark-slider-m');
    const range = page.getByTestId('ds-ks-dark-slider-m-input');
    const bubble = page.getByTestId('ds-ks-dark-slider-m-value');
    const num = page.getByTestId('ds-ks-dark-slider-m-number');
    await expect(bubble).toHaveText(`1.0${NB}kg`);
    await range.focus();
    await page.keyboard.press('ArrowRight');
    await expect(bubble).toHaveText(`1.1${NB}kg`);
    await expect(range).toHaveAttribute('aria-valuetext', `1.1${NB}kg`);
    await expect(num).toHaveValue('1.1');
    // Con el teclado la burbuja no aparece (taparía la etiqueta); el valor se lee en el campo.
    expect(await bubble.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.1);
    await num.fill('2,5');
    await num.press('Enter');
    await expect(bubble).toHaveText(`2.5${NB}kg`);
    const pos = await root.evaluate((el) => el.style.getPropertyValue('--pos'));
    expect(Number(pos)).toBeCloseTo(2.4 / 9.9, 3);
    await num.fill('abc');
    await num.press('Enter');
    await expect(num).toHaveAttribute('aria-invalid', 'true');
    await expect(root.locator('.ds-slider__error')).toBeVisible();
    await num.press('Escape');
    await expect(num).toHaveValue('2.5');
    await expect(num).not.toHaveAttribute('aria-invalid', 'true');
    await page.getByTestId('ds-ks-dark-slider-m-reset').click();
    await expect(bubble).toHaveText(`1.0${NB}kg`);
    await expect(page.getByTestId('ds-ks-dark-slider-m-reset')).toBeDisabled();
    // El tooltip de ayuda se abre con el foco.
    await page.mouse.move(2, 400);
    await num.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('ds-ks-dark-slider-m-help')).toBeFocused();
    await expect(page.getByTestId('ds-tooltip')).toHaveAttribute('data-state', 'open');
    await expect(page.getByTestId('ds-tooltip')).toHaveText(/Inercia del bloque/);
    // Log: el extremo derecho da el máximo.
    const k = page.getByTestId('ds-ks-dark-slider-k-input');
    await k.focus();
    await page.keyboard.press('End');
    await expect(page.getByTestId('ds-ks-dark-slider-k-value')).toHaveText(`1000${NB}N/m`);
    // Un arrastre real con el ratón.
    const box = await range.boundingBox();
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 6 });
    await expect(root).toHaveClass(/is-dragging/);
    await expect.poll(() => bubble.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.9);
    const bb = await bubble.boundingBox();
    const tb = await range.boundingBox();
    expect(bb.y + bb.height).toBeLessThanOrEqual(tb.y + 4);
    await page.mouse.up();
    await expect(bubble).toHaveText(`10.0${NB}kg`);
    await expect(root).not.toHaveClass(/is-dragging/);
    const log = await page.evaluate(() => window.KS.log.filter((x) => x.startsWith('m:')));
    expect(log).toContain('m:change:10');
  });

  test('segmentado y pestañas: tabindex itinerante, flechas y pastilla bajo la opción elegida', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    const seg = page.getByTestId('ds-ks-dark-seg');
    await expect(seg).toHaveAttribute('role', 'radiogroup');
    await expect(seg.locator('[tabindex="0"]')).toHaveCount(1);
    await page.getByTestId('ds-ks-dark-seg-escalon').focus();
    await page.keyboard.press('ArrowRight');
    const pulso = page.getByTestId('ds-ks-dark-seg-pulso');
    await expect(pulso).toHaveAttribute('aria-checked', 'true');
    await expect(pulso).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const sen = page.getByTestId('ds-ks-dark-seg-senoidal');
    await expect(sen).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => {
      const t = await seg.locator('.ds-seg__thumb').boundingBox();
      const b = await sen.boundingBox();
      return Math.abs(t.x - b.x) + Math.abs(t.width - b.width);
    }).toBeLessThan(2);
    expect(await page.evaluate(() => window.KS.log.filter((x) => x.startsWith('seg:')))).toEqual(['seg:pulso', 'seg:escalon', 'seg:senoidal']);

    const tabs = page.getByTestId('ds-ks-dark-tabs');
    await expect(tabs.locator('[role="tabpanel"]:visible')).toHaveCount(1);
    await page.getByTestId('ds-ks-dark-tabs-polos').click();
    await expect(page.getByTestId('ds-ks-dark-tabs-polos')).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.locator('[role="tabpanel"]:visible')).toHaveText('Plano s');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('ds-ks-dark-tabs-bode')).toBeFocused();
    await expect(tabs.locator('[role="tabpanel"]:visible')).toHaveText('Magnitud y fase');
    await page.keyboard.press('Home');
    await expect(page.getByTestId('ds-ks-dark-tabs-paso')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(async () => {
      const ind = await tabs.locator('.ds-tabs__indicator').boundingBox();
      const b = await page.getByTestId('ds-ks-dark-tabs-paso').boundingBox();
      return Math.abs(ind.x - b.x) + Math.abs(ind.width - b.width);
    }).toBeLessThan(2);
  });

  test('tooltips: retardo al pasar, foco, Esc y colocación dentro de la ventana', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    const tip = page.getByTestId('ds-tooltip');
    const help = page.getByTestId('ds-ks-dark-help');
    await help.scrollIntoViewIfNeeded();
    await help.hover();
    await expect(tip).toHaveAttribute('data-state', 'open');
    await expect(tip).toHaveText(/energía disipa/);
    await expect(tip).toBeVisible();
    const id = await tip.getAttribute('id');
    await expect(help).toHaveAttribute('aria-describedby', id);
    const [t, a] = [await tip.boundingBox(), await help.boundingBox()];
    const overlap = !(t.y + t.height <= a.y || a.y + a.height <= t.y || t.x + t.width <= a.x || a.x + a.width <= t.x);
    expect(overlap, 'el tooltip no tapa su ancla').toBe(false);
    await page.keyboard.press('Escape');
    await expect(tip).toHaveAttribute('data-state', 'closed');
    await expect(help).not.toHaveAttribute('aria-describedby', id);

    // El de la derecha (panel claro, borde de la ventana) cabe en la ventana.
    const edge = page.getByTestId('ds-ks-light-help-edge');
    await edge.scrollIntoViewIfNeeded();
    await page.mouse.move(5, 5);
    await edge.focus();
    await expect(tip).toHaveAttribute('data-state', 'open');
    const vp = page.viewportSize();
    const e = await tip.boundingBox();
    expect(e.x).toBeGreaterThanOrEqual(7);
    expect(e.x + e.width).toBeLessThanOrEqual(vp.width - 7);
    expect(e.y).toBeGreaterThanOrEqual(7);
    // El tooltip de la barra va debajo de ella.
    await page.getByTestId('sh-theme-toggle').focus();
    await expect(tip).toHaveText('Tema claro');
    await expect(tip).toHaveAttribute('data-side', 'bottom');
    const hb = await page.locator('.app-header').boundingBox();
    expect((await tip.boundingBox()).y).toBeGreaterThanOrEqual(hb.y + hb.height);
  });

  test('transporte, conmutador, desplegables y avisos', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    const play = page.getByTestId('ds-ks-dark-play');
    const time = page.getByTestId('ds-ks-dark-time');
    await play.scrollIntoViewIfNeeded();
    await expect(play).toHaveAccessibleName('Reproducir');
    await expect(time.locator('.ds-transport__tv')).toHaveText('0.00');
    await play.click();
    await expect(play).toHaveAccessibleName('Pausar');
    await expect(play).toHaveAttribute('data-state', 'playing');
    await expect.poll(async () => parseFloat((await time.innerText()).replace(/[^\d.]/g, ''))).toBeGreaterThan(0.2);
    await page.getByTestId('ds-ks-dark-speed-4').click();
    await play.click();
    await expect(play).toHaveAccessibleName('Reproducir');
    await page.getByTestId('ds-ks-dark-reset').click();
    await expect(time.locator('.ds-transport__tv')).toHaveText('0.00');
    expect(await page.evaluate(() => window.KS.log.filter((x) => /^(play|pause|reset|speed)/.test(x)))).toEqual(['play', 'speed:4', 'pause', 'reset']);

    const sw = page.getByTestId('ds-ks-light-toggle');
    await expect(sw).toHaveAttribute('role', 'switch');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await sw.press('Space');
    await expect(sw).toHaveAttribute('aria-checked', 'false');

    const step2 = page.getByTestId('ds-ks-dark-step-2-toggle');
    const region2 = page.getByTestId('ds-ks-dark-step-2-region');
    await step2.scrollIntoViewIfNeeded();
    await expect(step2).toHaveAttribute('aria-expanded', 'false');
    expect((await region2.boundingBox()).height).toBeLessThan(2);
    await step2.press('Enter');
    await expect(step2).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(async () => (await region2.boundingBox()).height).toBeGreaterThan(40);
    await expect(region2.locator('.katex').first()).toBeVisible();

    await page.getByTestId('ds-ks-dark-toast-undo').click();
    const toast = page.getByTestId('ds-ks-dark-toast');
    await expect(toast).toBeVisible();
    await expect(page.getByTestId('ds-toasts')).toHaveAttribute('aria-label', 'Avisos');
    await expect(page.getByTestId('ds-live')).toHaveText('Parámetros restablecidos a sus valores iniciales.');
    await page.getByTestId('ds-ks-dark-toast-action').click();
    await expect(toast).toHaveCount(0);
    expect(await page.evaluate(() => window.KS.log.includes('undo'))).toBe(true);
    await page.getByTestId('ds-ks-dark-toast-warn').click();
    await expect(page.getByTestId('ds-ks-dark-toast-w')).toBeVisible();
    await page.getByTestId('ds-ks-dark-toast-w-close').click();
    await expect(page.getByTestId('ds-ks-dark-toast-w')).toHaveCount(0);
  });

  test('aparición única al entrar en pantalla y movimiento reducido', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    const item = page.getByTestId('ds-ks-dark-reveal').locator('.ks-reveal-item').first();
    await expect(item).toHaveClass(/ds-reveal/);
    await expect(item).not.toHaveClass(/is-revealed/);
    await item.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 200));
    await expect(item).toHaveClass(/is-revealed/);
    await expect.poll(() => item.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
  });

  test('con movimiento reducido no hay ocultaciones ni desplazamiento suave', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage, { reducedMotion: true });
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
    const item = page.getByTestId('ds-ks-dark-reveal').locator('.ks-reveal-item').first();
    await expect(item).not.toHaveClass(/ds-reveal/);
    expect(await item.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    await page.getByTestId('sh-nav-transferencia').click();
    // Instantáneo: sin esperar.
    const top = await page.evaluate(() => document.getElementById('transferencia').getBoundingClientRect().top);
    const hh = await page.evaluate(() => document.querySelector('.app-header').getBoundingClientRect().height);
    expect(Math.abs(top - hh)).toBeLessThan(3);
    const dur = await page.getByTestId('ds-ks-dark-seg').locator('.ds-seg__thumb').evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(dur.split(',').every((d) => parseFloat(d) <= 0.01)).toBe(true);
  });

  for (const [w, h] of [[1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
    test(`sin desbordamiento horizontal a ${w}px`, async ({ page, gotoTestPage }) => {
      await page.setViewportSize({ width: w, height: h });
      await openKs(page, gotoTestPage);
      await noHorizontalOverflow(page);
    });
  }
});

/* ======================================================================= shell */

test.describe('shell', () => {
  test('navegación: clic desplaza bajo la barra, enfoca la sección y mueve el indicador', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    const header = page.locator('.app-header');
    await expect(header).toHaveClass(/is-at-top/);
    const link = page.getByTestId('sh-nav-modelado');
    await link.click();
    await expect(page.locator('#modelado')).toBeFocused();
    await expect.poll(() => page.evaluate(() => {
      const t = document.getElementById('modelado').getBoundingClientRect().top;
      const hh = document.querySelector('.app-header').getBoundingClientRect().height;
      return Math.round(Math.abs(t - hh));
    }), { timeout: 4000 }).toBeLessThan(3);
    await expect(link).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.sh-link[aria-current="true"]')).toHaveCount(1);
    expect(page.url()).toMatch(/#modelado$/);
    await expect(header).not.toHaveClass(/is-at-top/);
    await expect.poll(async () => {
      const i = await page.locator('.sh-indicator').boundingBox();
      const l = await link.boundingBox();
      return i && i.x >= l.x - 1 && i.x + i.width <= l.x + l.width + 1 && i.width > l.width * 0.5;
    }).toBe(true);
    // La barra tiene vidrio fuera del inicio.
    const bf = await header.evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(bf).toMatch(/blur/);
  });

  test('scrollspy al desplazarse y tf:open lleva a «Función de transferencia»', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    await page.evaluate(() => document.getElementById('galeria').scrollIntoView({ behavior: 'instant' }));
    await expect(page.getByTestId('sh-nav-galeria')).toHaveAttribute('aria-current', 'true');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect(page.locator('.sh-link[aria-current="true"]')).toHaveCount(0);
    const changes = await page.evaluate(async () => {
      const seen = [];
      window.DSL.bus.on('section:change', (p) => seen.push(p.id));
      window.DSL.bus.emit('tf:open', { num: [1], den: [1, 2, 5] });
      await new Promise((r) => setTimeout(r, 1500));
      return seen;
    });
    await expect(page.locator('#transferencia')).toBeFocused();
    await expect(page.getByTestId('sh-nav-transferencia')).toHaveAttribute('aria-current', 'true');
    expect(changes[changes.length - 1]).toBe('transferencia');
  });

  test('tema: el conmutador cambia, persiste tras recargar y avisa con theme:change', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    const btn = page.getByTestId('sh-theme-toggle');
    await expect(btn).toHaveAccessibleName('Tema claro');
    await page.evaluate(() => { window.__themes = []; window.DSL.bus.on('theme:change', (p) => window.__themes.push(p.theme)); });
    await btn.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(238, 242, 246)');
    expect(await page.evaluate(() => window.__themes)).toEqual(['light']);
    await expect(btn).toHaveAccessibleName('Tema oscuro');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', /#EEF2F6/i);
    await page.reload();
    await page.waitForSelector('html[data-ready="true"]', { state: 'attached' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByTestId('sh-theme-toggle')).toHaveAccessibleName('Tema oscuro');
    await page.getByTestId('sh-theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('enlace para saltar al contenido: primer Tab, visible y lleva el foco a <main>', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    await page.keyboard.press('Tab');
    const skip = page.locator('a.skip-link');
    await expect(skip).toBeFocused();
    await expect.poll(async () => (await skip.boundingBox()).y).toBeGreaterThanOrEqual(0);
    expect((await skip.boundingBox()).height).toBeGreaterThan(20);
    await page.keyboard.press('Enter');
    await expect(page.locator('#contenido')).toBeFocused();
    // El siguiente Tab sigue dentro del contenido, no vuelve a la barra.
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#contenido'))).toBe(true);
  });

  test('teléfono: hoja «Menú» con foco atrapado, Esc y clic en enlace', async ({ page, gotoTestPage }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openKs(page, gotoTestPage);
    await expect(page.locator('.sh-nav')).toBeHidden();
    const menu = page.getByTestId('sh-menu-toggle');
    await expect(menu).toBeVisible();
    const mb = await menu.boundingBox();
    expect(mb.height).toBeGreaterThanOrEqual(44);
    await menu.click();
    const sheet = page.getByTestId('sh-sheet');
    await expect(sheet).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('sh-sheet-conceptos')).toBeFocused();
    await expect(page.locator('main')).toHaveAttribute('inert', '');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    await expect(page.getByTestId('sh-sheet-transferencia')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(menu).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('sh-sheet-transferencia')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(menu).toBeFocused();
    await expect(page.locator('main')).not.toHaveAttribute('inert', '');
    await menu.click();
    await page.getByTestId('sh-sheet-galeria').click();
    await expect(sheet).toBeHidden();
    await expect(page.locator('#galeria')).toBeFocused();
    await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('galeria').getBoundingClientRect().top)), { timeout: 4000 })
      .toBeLessThan(70);
    await page.screenshot({ path: path.join(SHOTS, 'ks-390-galeria.png') });
    await menu.click();
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(SHOTS, 'ks-390-menu.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 900, height: 844 });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(sheet).toBeHidden();
  });

  test('el foco de teclado no queda bajo la barra y enfocar la barra no desplaza la página', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage, { reducedMotion: true });
    await page.evaluate(() => window.DSL.ui.shell.scrollTo('galeria'));
    const y0 = await page.evaluate(() => Math.round(scrollY));
    await page.evaluate(() => document.querySelector('[data-testid="sh-theme-toggle"]').focus());
    await page.evaluate(() => document.querySelector('[data-testid="sh-nav-conceptos"]').focus());
    expect(await page.evaluate(() => Math.round(scrollY))).toBe(y0);
    // Un control que ha quedado bajo la barra se desplaza a la vista al recibir el foco.
    const hidden = page.getByTestId('ds-ks-dark-btn-primary');
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="ds-ks-dark-btn-primary"]');
      window.scrollBy(0, el.getBoundingClientRect().top - 20);
    });
    await hidden.focus();
    const hh = await page.evaluate(() => document.querySelector('.app-header').getBoundingClientRect().bottom);
    expect((await hidden.boundingBox()).y).toBeGreaterThanOrEqual(hh);
  });

  test('pie: créditos de Chart.js, KaTeX, Lucide y las tipografías', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    const credits = page.getByTestId('sh-credits');
    await expect(credits).toContainText('KaTeX');
    await expect(credits).toContainText('Chart.js');
    await expect(credits).toContainText('Lucide');
    await expect(credits).toContainText('Bricolage Grotesque e IBM Plex Sans');
    await expect(credits).toContainText('SIL Open Font License 1.1');
    await page.getByTestId('sh-footer-top').click();
    await expect(page.locator('#inicio')).toBeFocused();
  });
});

/* ======================================================================= capturas para revisión */

const SECTIONS = ['inicio', 'conceptos', 'modelado', 'galeria', 'transferencia'];

test.describe('capturas', () => {
  for (const [w, h] of [[1440, 900], [1024, 768]]) {
    for (const theme of ['dark', 'light']) {
      test(`página de pruebas ${w}×${h} con la página en tema ${theme === 'dark' ? 'oscuro' : 'claro'}`, async ({ page, gotoTestPage }) => {
        test.setTimeout(60_000);
        await page.setViewportSize({ width: w, height: h });
        await openKs(page, gotoTestPage);
        if (theme === 'light') await page.evaluate(() => window.DSL.prefs.setTheme('light', { persist: false }));
        await visitAll(page);
        const tag = `ks-${w}-${theme}`;
        // Vista inicial tal como la ve el visitante (barra transparente sobre el plano s).
        await page.screenshot({ path: path.join(SHOTS, `${tag}-top.png`), animations: 'disabled' });
        // Barra con vidrio sobre contenido.
        await page.evaluate(() => document.getElementById('modelado').scrollIntoView({ behavior: 'instant' }));
        await page.mouse.move(w - 20, h - 20);
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(SHOTS, `${tag}-scrolled.png`), animations: 'disabled' });
        if (theme === 'dark') {
          // Secciones completas (sin la barra fija encima) para revisar cada componente.
          await page.addStyleTag({ content: '.app-header{position:relative !important}.skip-link{display:none !important}' });
          for (const id of SECTIONS) {
            await page.locator('#' + id).screenshot({ path: path.join(SHOTS, `${tag}-${id}.png`), animations: 'disabled' });
          }
        }
        await page.locator('.app-footer').screenshot({ path: path.join(SHOTS, `${tag}-footer.png`), animations: 'disabled' });
      });
    }
  }

  test('estados interactivos: tooltip, foco, botón pulsado y aviso', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    await visitAll(page);
    const pane = page.getByTestId('ds-ks-dark-acciones');
    await page.getByTestId('ds-ks-dark-pressed').click();
    await page.getByTestId('ds-ks-dark-card').hover({ position: { x: 80, y: 40 } });
    await page.getByTestId('ds-ks-dark-btn-secondary').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await page.evaluate(() => document.querySelector('[data-testid="ds-ks-dark-btn-primary"]').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.getByTestId('ds-ks-dark-help').hover();
    await expect(page.getByTestId('ds-tooltip')).toHaveAttribute('data-state', 'open');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOTS, 'ks-states-acciones.png') });
    await expect(pane).toBeVisible();
    await page.getByTestId('ds-ks-dark-toast-warn').click();
    await page.getByTestId('ds-ks-dark-slider-m-input').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, 'ks-states-viewport.png') });
  });
});

/* ======================================================================= la app real */

test.describe('shell en la app', () => {
  // Corre en los dos proyectos (index.html y el archivo único): solo se omiten en dist las pruebas
  // que abren páginas de tests/pages/.
  test('app: barra, pie y conmutador de tema', async ({ page, gotoApp }) => {
    await gotoApp();
    await expect(page.getByTestId('sh-brand')).toBeVisible();
    await expect(page.locator('.sh-link')).toHaveCount(4);
    await expect(page.getByTestId('sh-credits')).toContainText('Chart.js 4.');
    await page.getByTestId('sh-theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByTestId('sh-nav-transferencia').click();
    await expect(page.locator('#transferencia')).toBeFocused();
  });
});

/* ======================================================================= auditoría foundation (FND) */

/** PNG de 8 bits RGB/RGBA sin entrelazar (capturas de Playwright) → { w, h, data RGBA }. */
function decodePng(buf) {
  let pos = 8;
  let w = 0;
  let h = 0;
  let ct = 6;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      out[o] = line[x * bpp];
      out[o + 1] = line[x * bpp + 1];
      out[o + 2] = line[x * bpp + 2];
      out[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { w, h, data: out };
}

/** Píxeles de tinta: los que se alejan claramente del color de fondo bg [r, g, b]. */
function inkPixels(png, bg) {
  const img = decodePng(png);
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (Math.abs(img.data[i] - bg[0]) + Math.abs(img.data[i + 1] - bg[1]) + Math.abs(img.data[i + 2] - bg[2]) > 150) n++;
  }
  return n;
}

/** Relación de contraste WCAG entre dos colores rgb()/rgba() opacos. */
function contrast(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Elementos de la barra y del pie que asoman a la derecha de la ventana (o a la izquierda de 0). */
async function chromeOverflow(page) {
  return page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll('.app-header *, .app-footer *')) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      if (b.width <= 1 && b.height <= 1) continue;          // texto solo para lectores (sr-only)
      if (b.right > cw + 0.5 || b.left < -0.5) out.push(`${(el.getAttribute('data-testid') || el.className || el.tagName).toString().slice(0, 50)} ${Math.round(b.left)}..${Math.round(b.right)}`);
    }
    return { cw, sw: document.documentElement.scrollWidth, out: out.slice(0, 8) };
  });
}

test.describe('auditoría foundation: componentes en la página de pruebas', () => {
  test('FND-17: el error del campo es role=alert y un valor fuera de rango se ajusta con una nota role=status', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    const root = page.getByTestId('ds-ks-dark-slider-m');
    const num = page.getByTestId('ds-ks-dark-slider-m-number');
    await num.fill('abc');
    await num.press('Enter');
    await expect(root.getByRole('alert')).toContainText('Escriba un número entre 0.1 y 10');
    await expect(root.getByRole('alert')).not.toContainText('..');
    await num.fill('999');
    await num.press('Enter');
    await expect(root.getByRole('alert')).toHaveText('');
    await expect(root.getByRole('status').filter({ hasText: 'Se ajustó a' })).toHaveText(`Se ajustó a 10.0${NB}kg (máximo).`);
    await expect(num).toHaveValue('10.0');
    // La nota desaparece sola (~4 s) y, vacía, no ocupa sitio.
    await expect(root.locator('.ds-slider__note')).toHaveText('', { timeout: 6000 });
    expect(await root.locator('.ds-slider__note').evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
  });

  test('FND-14: Enter sobre el reinicio de un deslizador deja el foco en su deslizador, no en <body>', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    const range = page.getByTestId('ds-ks-dark-slider-m-input');
    const reset = page.getByTestId('ds-ks-dark-slider-m-reset');
    await range.focus();
    await page.keyboard.press('ArrowRight');
    await expect(reset).toBeEnabled();
    await reset.focus();
    await page.keyboard.press('Enter');
    await expect(reset).toBeDisabled();
    await expect(range).toBeFocused();
  });

  test('FND-15: un aviso con acción creado con el teclado enfoca «Deshacer»; Enter o Esc devuelven el foco; con ratón no cambia nada', async ({ page, gotoTestPage }) => {
    test.setTimeout(45_000);
    await openKs(page, gotoTestPage);
    const undo = page.getByTestId('ds-ks-dark-toast-undo');
    const action = page.getByTestId('ds-ks-dark-toast-action');
    const toast = page.getByTestId('ds-ks-dark-toast');
    await undo.focus();
    await page.keyboard.press('Enter');
    await expect(action).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(toast).toHaveCount(0);
    expect(await page.evaluate(() => window.KS.log.filter((x) => x === 'undo').length)).toBe(1);
    await expect(undo).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(action).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(toast).toHaveCount(0);
    await expect(undo).toBeFocused();
    expect(await page.evaluate(() => window.KS.log.filter((x) => x === 'undo').length)).toBe(1);

    // Con ratón: el foco no se mueve y el aviso dura sus 5 s (medidos en la página, sin la latencia del test).
    await page.evaluate(() => {
      window.__toastLife = {};
      const mo = new MutationObserver(() => {
        const t = document.querySelector('[data-testid="ds-ks-dark-toast"]');
        if (t && !window.__toastLife.born) window.__toastLife.born = performance.now();
        if (t && t.getAttribute('data-state') === 'exit' && !window.__toastLife.exit) window.__toastLife.exit = performance.now();
      });
      mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
    });
    await undo.click();
    await page.mouse.move(2, 2);
    await expect(toast).toBeVisible();
    await expect(action).not.toBeFocused();
    await expect(toast).toHaveCount(0, { timeout: 9000 });
    const life = await page.evaluate(() => window.__toastLife.exit - window.__toastLife.born);
    expect(life).toBeGreaterThanOrEqual(4900);
    expect(life).toBeLessThan(7000);
  });

  test('FND-16: la opción elegida lleva un indicador de al menos 3:1 en los dos temas y su etiqueta pasa a 600', async ({ page, gotoTestPage }, testInfo) => {
    await openKs(page, gotoTestPage);
    for (const theme of ['dark', 'light']) {
      const seg = page.getByTestId(`ds-ks-${theme}-seg`);
      await expect(seg).toHaveClass(/is-ready/);
      const r = await seg.evaluate((el) => {
        const thumb = el.querySelector('.ds-seg__thumb');
        const bar = getComputedStyle(thumb, '::after');
        const sel = el.querySelector('[aria-checked="true"] .ds-seg__label');
        const other = el.querySelector('[aria-checked="false"] .ds-seg__label');
        return {
          bar: bar.backgroundColor,
          barH: parseFloat(bar.height),
          track: getComputedStyle(el).backgroundColor,
          thumb: getComputedStyle(thumb).backgroundColor,
          weight: getComputedStyle(sel).fontWeight,
          otherWeight: getComputedStyle(other).fontWeight,
          dur: getComputedStyle(thumb).transitionDuration,
        };
      });
      expect(r.barH).toBe(2);
      expect(contrast(r.bar, r.track), `${theme}: indicador frente al carril`).toBeGreaterThanOrEqual(3);
      expect(contrast(r.bar, r.thumb), `${theme}: indicador frente a la pastilla`).toBeGreaterThanOrEqual(3);
      expect(r.weight).toBe('600');
      expect(r.otherWeight).toBe('500');
      expect(r.dur).toMatch(/0\.22s/);
    }
    // El ancho de cada opción no cambia al elegir (la etiqueta en 600 tiene su hueco reservado).
    const seg = page.getByTestId('ds-ks-dark-seg');
    const w0 = await seg.evaluate((el) => Array.from(el.querySelectorAll('.ds-seg__opt')).map((o) => o.getBoundingClientRect().width));
    await page.getByTestId('ds-ks-dark-seg-pulso').click();
    const w1 = await seg.evaluate((el) => Array.from(el.querySelectorAll('.ds-seg__opt')).map((o) => o.getBoundingClientRect().width));
    expect(w1).toEqual(w0);
    const speed = page.getByTestId('ds-ks-dark-play').locator('xpath=ancestor::*[contains(@class,"ds-transport")][1]');
    await speed.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await speed.screenshot({ path: testInfo.outputPath('fnd16-transport-dark.png') });
    const results = await new AxeBuilder({ page }).options({ preload: false })
      .include('[data-testid="ds-ks-dark-controles"]').include('[data-testid="ds-ks-light-controles"]')
      .include('[data-testid="ds-ks-dark-simulacion"]').include('[data-testid="ds-ks-light-simulacion"]')
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
  });

  test('FND-20: Enter y Espacio sobre «?» alternan su explicación', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    const tip = page.getByTestId('ds-tooltip');
    const help = page.getByTestId('ds-ks-dark-help');
    await help.scrollIntoViewIfNeeded();
    await page.mouse.move(2, 2);
    await help.focus();
    await expect(tip).toHaveAttribute('data-state', 'open');
    await page.keyboard.press('Escape');
    await expect(tip).toHaveAttribute('data-state', 'closed');
    await page.keyboard.press('Enter');
    await expect(tip).toHaveAttribute('data-state', 'open');
    await expect(tip).toHaveText(/energía disipa/);
    await page.keyboard.press('Enter');
    await expect(tip).toHaveAttribute('data-state', 'closed');
    await page.keyboard.press('Space');
    await expect(tip).toHaveAttribute('data-state', 'open');
    await expect(help).toBeFocused();
  });

  test('FND-22: una lectura con tip tiene «?» con nombre, tooltip al pasar y al enfocar, y texto para lectores', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    const ro = page.getByTestId('ds-ks-dark-ro-tip');
    const help = page.getByTestId('ds-ks-dark-ro-tip-help');
    const tip = page.getByTestId('ds-tooltip');
    await ro.scrollIntoViewIfNeeded();
    await expect(help).toHaveAccessibleName('Explicación de «Sobrepaso máximo»');
    await expect(ro.locator('.sr-only')).toHaveText(/Cuánto supera el pico/);
    await help.hover();
    await expect(tip).toHaveAttribute('data-state', 'open');
    await expect(tip).toHaveText(/Cuánto supera el pico/);
    await page.keyboard.press('Escape');
    await page.mouse.move(2, 2);
    await expect(tip).toHaveAttribute('data-state', 'closed');
    await help.focus();
    await expect(tip).toHaveAttribute('data-state', 'open');
    const results = await new AxeBuilder({ page }).options({ preload: false }).include('[data-testid="ds-ks-dark-readouts"]').include('[data-testid="ds-ks-light-readouts"]').analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  for (const [w, h] of [[1440, 900], [1024, 768]]) {
    test(`FND-10: en una fila de lecturas los valores quedan a la misma altura (${w}px)`, async ({ page, gotoTestPage }) => {
      await page.setViewportSize({ width: w, height: h });
      await openKs(page, gotoTestPage);
      for (const theme of ['dark', 'light']) {
        const rows = await page.getByTestId(`ds-ks-${theme}-readouts`).evaluate((grid) => {
          const byRow = new Map();
          for (const ro of grid.querySelectorAll(':scope > .ds-readout')) {
            const top = Math.round(ro.getBoundingClientRect().top);
            const v = ro.querySelector('.ds-readout__value').getBoundingClientRect().top;
            const labelH = ro.querySelector('.ds-readout__label').getBoundingClientRect().height;
            if (!byRow.has(top)) byRow.set(top, []);
            byRow.get(top).push({ v, labelH });
          }
          return Array.from(byRow.values());
        });
        expect(rows.length).toBeGreaterThanOrEqual(2);
        for (const row of rows) {
          const tops = row.map((x) => x.v);
          expect(Math.max(...tops) - Math.min(...tops), JSON.stringify(row)).toBeLessThanOrEqual(2);
        }
      }
    });
  }

  test('FND-11: con colores forzados, glifo de reproducir, selección, pestañas, conmutador, deslizador y navegación siguen a la vista', async ({ page, gotoTestPage }, testInfo) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openKs(page, gotoTestPage);
    await page.evaluate(() => window.DSL.ui.shell.scrollTo('modelado', { instant: true }));
    await expect(page.getByTestId('sh-nav-modelado')).toHaveAttribute('aria-current', 'true');
    const r = await page.evaluate(() => {
      const cs = (el, pseudo) => getComputedStyle(el, pseudo || null);
      const q = (s) => document.querySelector(s);
      const seg = q('[data-testid="ds-ks-dark-seg"]');
      return {
        canvas: cs(document.body).backgroundColor,
        glyph: cs(q('[data-testid="ds-ks-dark-play"] .ds-playglyph__a')).backgroundColor,
        segBar: cs(seg.querySelector('.ds-seg__thumb'), '::after').backgroundColor,
        segOutline: cs(seg.querySelector('.ds-seg__thumb')).outlineColor,
        tabs: cs(q('[data-testid="ds-ks-dark-tabs"] .ds-tabs__indicator')).backgroundColor,
        trackOn: cs(q('[data-testid="ds-ks-dark-toggle"] .ds-toggle__track')).backgroundColor,
        thumbOn: cs(q('[data-testid="ds-ks-dark-toggle"] .ds-toggle__thumb')).backgroundColor,
        trackOff: cs(q('[data-testid="ds-ks-light-toggle"] .ds-toggle__track')).outlineColor,
        thumbOff: cs(q('[data-testid="ds-ks-light-toggle"] .ds-toggle__thumb')).backgroundColor,
        rail: cs(q('[data-testid="ds-ks-dark-slider-m"] .ds-slider__rail')).outlineColor,
        fill: cs(q('[data-testid="ds-ks-dark-slider-m"] .ds-slider__fill')).backgroundColor,
        nav: cs(q('.sh-indicator')).backgroundColor,
      };
    });
    for (const k of ['glyph', 'segBar', 'segOutline', 'tabs', 'trackOn', 'trackOff', 'thumbOff', 'rail', 'fill', 'nav']) {
      expect(r[k], `${k} (Canvas = ${r.canvas})`).not.toBe(r.canvas);
      expect(r[k], k).not.toBe('rgba(0, 0, 0, 0)');
    }
    // Encendido: la bola (HighlightText) se distingue de su carril (Highlight), que ya no es Canvas.
    expect(r.thumbOn).not.toBe(r.trackOn);
    expect(r.thumbOn).not.toBe('rgba(0, 0, 0, 0)');
    // La caja del glifo tiene píxeles de tinta: ocultarlo cambia la imagen.
    const play = page.getByTestId('ds-ks-dark-play');
    await play.scrollIntoViewIfNeeded();
    await page.mouse.move(2, 2);
    const box = await play.locator('.ds-playglyph').boundingBox();
    const clip = { x: box.x - 1, y: box.y - 1, width: box.width + 2, height: box.height + 2 };
    const shown = await page.screenshot({ clip, animations: 'disabled' });
    await page.screenshot({ path: testInfo.outputPath('fnd11-forced-colors.png') });
    await page.addStyleTag({ content: '.ds-playglyph > * { visibility: hidden !important; }' });
    const hidden = await page.screenshot({ clip, animations: 'disabled' });
    expect(shown.equals(hidden)).toBe(false);
  });

  test('FND-12: con colores forzados, el acento de KaTeX no tapa la letra base de ẋ ni de ẍ', async ({ page, gotoTestPage }, testInfo) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openKs(page, gotoTestPage);
    const step = page.locator('[data-testid="ds-ks-dark-step-1"]');
    await step.scrollIntoViewIfNeeded();
    await page.mouse.move(2, 2);
    const boxes = await step.evaluate((root) => {
      const xs = Array.from(root.querySelectorAll('.katex .mord.mathnormal')).filter((e) => e.textContent === 'x');
      const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
      return {
        accented: xs.filter((e) => e.closest('.accent')).map(r),
        plain: xs.filter((e) => !e.closest('.accent')).map(r),
        bg: getComputedStyle(document.body).backgroundColor,
        fca: getComputedStyle(root.querySelector('.katex')).forcedColorAdjust,
      };
    });
    expect(boxes.fca).toBe('none');
    expect(boxes.accented.length).toBe(2);
    expect(boxes.plain.length).toBeGreaterThan(0);
    const bg = boxes.bg.match(/\d+/g).slice(0, 3).map(Number);
    const ink = async (b) => inkPixels(await page.screenshot({ clip: b, animations: 'disabled' }), bg);
    // La x con punto(s) deja tanta tinta en su caja como la x sin acento (con la placa de fondo del
    // acento tapándola quedaba en torno a un tercio).
    const plain = await ink(boxes.plain[0]);
    expect(plain).toBeGreaterThan(10);
    for (const b of boxes.accented) expect(await ink(b), `tinta de la x acentuada frente a ${plain} de la x simple`).toBeGreaterThanOrEqual(0.75 * plain);
    await step.screenshot({ path: testInfo.outputPath('fnd12-katex-forced.png') });
  });

  for (const [w, h] of [[320, 640], [360, 740]]) {
    test(`FND-13: a ${w}px la barra y el pie caben y «Menú» se ve entero con su nombre`, async ({ page, gotoTestPage }, testInfo) => {
      await page.setViewportSize({ width: w, height: h });
      await openKs(page, gotoTestPage);
      const r = await chromeOverflow(page);
      expect(r.out, 'barra o pie fuera de la ventana').toEqual([]);
      const menu = page.getByTestId('sh-menu-toggle');
      await expect(menu).toBeVisible();
      await expect(menu).toHaveAccessibleName('Menú');
      const b = await menu.boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(w);
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.width).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: testInfo.outputPath(`fnd13-header-${w}.png`) });
      await page.locator('.app-footer').screenshot({ path: testInfo.outputPath(`fnd13-footer-${w}.png`) });
    });
  }

  test('FND-13: desde 390px el botón conserva la palabra «Menú» a la vista', async ({ page, gotoTestPage }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openKs(page, gotoTestPage);
    const label = page.getByTestId('sh-menu-toggle').locator('.sh-menu-btn__label');
    expect((await label.boundingBox()).width).toBeGreaterThan(20);
    expect((await chromeOverflow(page)).out).toEqual([]);
  });

  for (const reduced of [false, true]) {
    test(`FND-08: tras un salto la barra nunca queda transparente sobre el contenido (${reduced ? 'movimiento reducido' : 'desplazamiento suave'})`, async ({ page, gotoTestPage }) => {
      test.setTimeout(45_000);
      await openKs(page, gotoTestPage, { reducedMotion: reduced });
      const r = await page.evaluate(async () => {
        const header = document.querySelector('.app-header');
        const bad = [];
        let samples = 0;
        let on = true;
        const sample = () => {
          samples++;
          if (header.classList.contains('is-at-top') && window.scrollY > 8) bad.push(Math.round(window.scrollY));
          if (on) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        const frame = () => new Promise((res) => requestAnimationFrame(() => res()));
        const wait = (ms) => new Promise((res) => setTimeout(res, ms));
        for (const id of ['conceptos', 'modelado', 'galeria', 'transferencia']) {
          window.scrollTo({ top: 0, behavior: 'instant' });
          for (let i = 0; i < 30 && !header.classList.contains('is-at-top'); i++) await frame();
          document.querySelector(`[data-testid="sh-nav-${id}"]`).click();
          await wait(1300);
        }
        // Entre secciones y de vuelta al inicio.
        document.querySelector('[data-testid="sh-nav-conceptos"]').click();
        await wait(1300);
        document.querySelector('[data-testid="sh-nav-galeria"]').click();
        await wait(1300);
        document.querySelector('[data-testid="sh-brand"]').click();
        await wait(1300);
        on = false;
        return { bad, samples, top: window.scrollY, atTop: header.classList.contains('is-at-top') };
      });
      expect(r.samples).toBeGreaterThan(60);
      expect(r.bad, 'muestras con .is-at-top y scrollY > 8').toEqual([]);
      expect(r.top).toBeLessThanOrEqual(8);
      expect(r.atTop).toBe(true);
    });
  }
});

test.describe('auditoría foundation: puntero táctil', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('FND-21: con puntero grueso, opciones segmentadas y campos numéricos miden al menos 44px de alto', async ({ page, gotoTestPage }) => {
    await openKs(page, gotoTestPage);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const small = await page.evaluate(() => Array.from(document.querySelectorAll('.ds-seg__opt, .ds-slider__number'))
      .map((el) => ({ id: el.getAttribute('data-testid') || el.className, h: el.getBoundingClientRect().height }))
      .filter((x) => x.h > 0 && x.h < 43.5));
    expect(small).toEqual([]);
  });
});

/* ======================================================================= auditoría foundation en la app */

test.describe('auditoría foundation: primera pintura', () => {
  // Mediciones de tiempo: las cuatro cargas, una tras otra (no compiten entre sí por la CPU). El umbral no
  // cambia; con varios trabajadores cargando la app a la vez, el LCP puede pasar de 2.5 s solo por falta de
  // CPU (aislado: 1.4–1.8 s), así que una medición puede repetirse.
  test.describe.configure({ mode: 'serial', retries: 2 });
  for (const [w, h] of [[1440, 900], [1024, 768], [820, 1180], [390, 844]]) {
    test(`FND-06: primera pintura limpia a ${w}×${h}: CLS < 0.05 y LCP < 2.5 s`, TIMING, async ({ page, gotoApp }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.addInitScript(() => {
        window.__cls = 0;
        window.__lcp = 0;
        window.__shifts = [];
        try {
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              if (e.hadRecentInput) continue;
              window.__cls += e.value;
              window.__shifts.push({ v: Math.round(e.value * 1e4) / 1e4, t: Math.round(e.startTime), src: (e.sources || []).map((s) => (s.node && (s.node.className || s.node.nodeName)) || '?').join(', ').slice(0, 120) });
            }
          }).observe({ type: 'layout-shift', buffered: true });
          new PerformanceObserver((list) => {
            const es = list.getEntries();
            const last = es[es.length - 1];
            if (last) window.__lcp = last.renderTime || last.loadTime || last.startTime;
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        } catch (e) { /* sin PerformanceObserver */ }
      });
      await gotoApp();
      // Antes de data-ready nada se ve (sin cajas vacías que luego se desplacen); al llegar, todo visible.
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('.app-main')).visibility)).toBe('visible');
      await page.waitForTimeout(3000);
      const r = await page.evaluate(() => ({ cls: window.__cls, lcp: window.__lcp, shifts: window.__shifts.slice(0, 6) }));
      expect(r.cls, JSON.stringify(r.shifts)).toBeLessThan(0.05);
      expect(r.lcp).toBeGreaterThan(0);
      expect(r.lcp).toBeLessThan(2500);
    });
  }
});

test.describe('auditoría foundation: la app', () => {
  test('FND-07: un salto a la tarjeta «Ecuaciones» la muestra con opacidad 1 antes de 100 ms y sigue así al terminar', TIMING, async ({ page, gotoApp }) => {
    await gotoApp();
    const r = await page.evaluate(async () => {
      const root = document.documentElement;
      const card = () => document.querySelector('[data-card="ecuaciones"]');
      const t0 = performance.now();
      window.DSL.bus.emit('concepts:open', { card: 'ecuaciones' });
      const jumping = root.hasAttribute('data-jumping');
      await new Promise((res) => setTimeout(res, 100));
      const el = card();
      const at100 = el ? Number(getComputedStyle(el).opacity) : -1;
      const reveal = !!el && el.classList.contains('ds-reveal');
      await new Promise((resolve) => {
        const check = () => (!root.hasAttribute('data-jumping') || performance.now() - t0 > 8000 ? resolve() : setTimeout(check, 50));
        check();
      });
      const after = [];
      for (let i = 0; i < 20; i++) {
        await new Promise((res) => requestAnimationFrame(() => res()));
        after.push(Number(getComputedStyle(card()).opacity));
      }
      const b = card().getBoundingClientRect();
      return { jumping, at100, reveal, after: Math.min(...after), inView: b.top < innerHeight && b.bottom > 0, ended: !root.hasAttribute('data-jumping') };
    });
    expect(r.jumping).toBe(true);
    expect(r.reveal).toBe(true);
    expect(r.at100).toBe(1);
    expect(r.ended).toBe(true);
    expect(r.inView).toBe(true);
    expect(r.after).toBe(1);
  });

  test('FND-07: tras un salto instantáneo a «Conceptos», las tarjetas a la vista ya están en su estado final', async ({ page, gotoApp }) => {
    await gotoApp();
    const r = await page.evaluate(async () => {
      window.DSL.ui.shell.scrollTo('conceptos', { instant: true });
      await new Promise((res) => setTimeout(res, 100));
      return Array.from(document.querySelectorAll('.cc-card')).filter((c) => {
        const b = c.getBoundingClientRect();
        return b.top < innerHeight && b.bottom > 0;
      }).map((c) => Number(getComputedStyle(c).opacity));
    });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((o) => o === 1), JSON.stringify(r)).toBe(true);
  });

  for (const id of ['modelado', 'galeria', 'transferencia', 'conceptos']) {
    test(`FND-09: al cambiar el ancho, #${id} sigue bajo la barra (±80 px)`, async ({ page, gotoApp }) => {
      test.setTimeout(120_000);
      const offset = () => page.evaluate((sid) => {
        const t = document.getElementById(sid).getBoundingClientRect().top;
        const hb = document.querySelector('.app-header').getBoundingClientRect().bottom;
        return Math.round(t - hb);
      }, id);
      for (const [[w0, h0], [w1, h1]] of [[[1440, 900], [390, 844]], [[390, 844], [1440, 900]], [[1920, 1080], [960, 1080]]]) {
        await page.setViewportSize({ width: w0, height: h0 });
        await gotoApp();
        await page.evaluate((sid) => window.DSL.ui.shell.scrollTo(sid, { instant: true }), id);
        await page.waitForTimeout(2300);
        const before = await offset();
        await page.setViewportSize({ width: w1, height: h1 });
        await page.waitForTimeout(1000);
        const after = await offset();
        expect(Math.abs(after), `${w0}→${w1}: antes ${before} px, después ${after} px`).toBeLessThanOrEqual(80);
      }
    });
  }

  test('FND-09: un cambio solo de alto no mueve la página', async ({ page, gotoApp }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp();
    await page.evaluate(() => window.DSL.ui.shell.scrollTo('galeria', { instant: true }));
    await page.waitForTimeout(2300);
    const y0 = await page.evaluate(() => window.scrollY);
    await page.setViewportSize({ width: 390, height: 760 });
    await page.waitForTimeout(800);
    const y1 = await page.evaluate(() => window.scrollY);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    const y2 = await page.evaluate(() => window.scrollY);
    expect(Math.abs(y1 - y0)).toBeLessThanOrEqual(1);
    expect(Math.abs(y2 - y0)).toBeLessThanOrEqual(1);
  });

  for (const [w, h] of [[1440, 900], [1024, 768]]) {
    test(`FND-10: lecturas de la galería y de Conceptos con los valores alineados por fila (${w}px)`, async ({ page, gotoApp }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width: w, height: h });
      await gotoApp();
      await page.evaluate(() => window.DSL.ui.shell.scrollTo('galeria', { instant: true }));
      await expect(page.locator('[data-testid="gl-readouts"] .ds-readout').first()).toBeVisible({ timeout: 10_000 });
      await page.evaluate(() => window.DSL.app.handles.concepts && window.DSL.app.handles.concepts.initAll && window.DSL.app.handles.concepts.initAll());
      await page.waitForTimeout(600);
      const rows = await page.evaluate(() => {
        const out = [];
        for (const grid of document.querySelectorAll('.gl-readouts, .cc-readouts')) {
          const byRow = new Map();
          for (const ro of grid.querySelectorAll(':scope > .ds-readout, :scope > * > .ds-readout')) {
            if (ro.classList.contains('ds-readout--inline')) continue;
            const b = ro.getBoundingClientRect();
            if (!b.height) continue;
            const key = Math.round(b.top);
            if (!byRow.has(key)) byRow.set(key, []);
            byRow.get(key).push(Math.round(ro.querySelector('.ds-readout__value').getBoundingClientRect().top * 10) / 10);
          }
          byRow.forEach((tops) => { if (tops.length > 1) out.push({ grid: grid.className, tops }); });
        }
        return out;
      });
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(Math.max(...row.tops) - Math.min(...row.tops), JSON.stringify(row)).toBeLessThanOrEqual(2);
    });
  }

  test('FND-13: a 320px la barra y el pie de la app caben en la ventana', async ({ page, gotoApp }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoApp();
    expect((await chromeOverflow(page)).out).toEqual([]);
    await expect(page.getByTestId('sh-menu-toggle')).toHaveAccessibleName('Menú');
  });

  // R32: el desbordamiento de #conceptos no debe existir en ningún momento, tampoco antes de que las
  // tarjetas se inicien (la capa SVG del diagrama de bloques medía 300 px hasta su primera medida).
  for (const w of [320, 360, 390]) {
    test(`R32: a ${w}px no hay desplazamiento horizontal en ningún fotograma, desde la carga hasta que «sistema» mide su diagrama`, async ({ page, gotoApp }) => {
      await page.setViewportSize({ width: w, height: 640 });
      await page.addInitScript(() => {
        const frames = [];
        window.__r32 = frames;
        const t0 = performance.now();
        const tick = () => {
          const de = document.documentElement;
          if (de && document.body) frames.push([Math.round(performance.now() - t0), de.scrollWidth - de.clientWidth]);
          if (!window.__r32stop) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await gotoApp();
      // La tarjeta «sistema» mide su diagrama (viewBox de la capa de cables) al iniciarse.
      await page.waitForFunction(() => {
        const wires = document.querySelector('[data-testid="cc-card-sistema"] .cc-bd__wires');
        return !!wires && wires.hasAttribute('viewBox');
      }, null, { timeout: 15_000 });
      await page.waitForTimeout(500);
      const frames = await page.evaluate(() => {
        window.__r32stop = true;
        return window.__r32;
      });
      expect(frames.length).toBeGreaterThan(10);
      const bad = frames.filter((f) => f[1] > 0);
      expect(bad, `fotogramas con desbordamiento [ms, px] (de ${frames.length}): ${JSON.stringify(bad.slice(0, 5))}`).toEqual([]);
    });
  }

  for (const theme of ['dark', 'light']) {
    for (const [w, h] of [[1440, 900], [1024, 768]]) {
      test(`capturas de la app ${theme} ${w}×${h}`, async ({ page, gotoApp }, testInfo) => {
        test.setTimeout(60_000);
        await page.setViewportSize({ width: w, height: h });
        await gotoApp();
        if (theme === 'light') await page.evaluate(() => window.DSL.prefs.setTheme('light', { persist: false }));
        await page.waitForTimeout(1200);
        await page.screenshot({ path: testInfo.outputPath(`app-${theme}-${w}-top.png`) });
        for (const id of ['conceptos', 'galeria', 'transferencia']) {
          await page.evaluate((sid) => window.DSL.ui.shell.scrollTo(sid, { instant: true }), id);
          await page.waitForTimeout(1500);
          await page.screenshot({ path: testInfo.outputPath(`app-${theme}-${w}-${id}.png`) });
        }
      });
    }
  }
});

test.describe('auditoría foundation: sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('FND-06: sin JavaScript el aviso noscript se ve (la puerta de arranque solo actúa con html.js)', async ({ page, appUrl }) => {
    await page.goto(appUrl);
    await expect(page.locator('.app-noscript')).toBeVisible();
  });
});
