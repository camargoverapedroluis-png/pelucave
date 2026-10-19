// tests/e2e/smoke.spec.mjs — Propietario: architect.
// Humo de toda la página en ambos proyectos (src y dist): carga sin errores de consola ni de página,
// sin red, con las cinco secciones montadas, bibliotecas, iconos, fuentes y tokens presentes.
// El fixture guard (tests/helpers/fixtures.mjs) ya falla ante cualquier error o petición externa.
import { test, expect } from '../helpers/fixtures.mjs';

const SECTIONS = [
  ['inicio', 'hero'],
  ['conceptos', 'concepts'],
  ['modelado', 'wizard'],
  ['galeria', 'gallery'],
  ['transferencia', 'tfengine'],
];

test.describe('humo', () => {
  test('estructura: landmarks, cinco secciones, montajes y títulos', async ({ page, gotoApp }) => {
    await gotoApp();
    await expect(page).toHaveTitle('Laboratorio de Sistemas Dinámicos');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('html')).toHaveAttribute('data-theme', /^(dark|light)$/);
    await expect(page.locator('a.skip-link[href="#contenido"]')).toHaveCount(1);
    await expect(page.locator('header[data-mount="shell-header"]')).toHaveCount(1);
    await expect(page.locator('footer[data-mount="shell-footer"]')).toHaveCount(1);
    await expect(page.locator('main#contenido')).toHaveCount(1);
    await expect(page.locator('main#contenido > section')).toHaveCount(SECTIONS.length);

    for (const [id, mount] of SECTIONS) {
      const section = page.locator(`main#contenido > section#${id}`);
      await expect(section, `#${id}`).toHaveCount(1);
      await expect(section.locator(`[data-mount="${mount}"]`), `montaje ${mount}`).toHaveCount(1);
      const labelledBy = await section.getAttribute('aria-labelledby');
      expect(labelledBy, `aria-labelledby de #${id}`).toBe(`${id}-title`);
      const title = page.locator(`#${labelledBy}`);
      await expect(title, `título #${labelledBy}`).toHaveCount(1);
      await expect(title).not.toBeEmpty();
    }
    await expect(page.locator('.app-error')).toHaveCount(0);
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('arranque: app:ready, espacio de nombres, bibliotecas e iconos', async ({ page, gotoApp }) => {
    await gotoApp();
    const info = await page.evaluate(() => ({
      ready: window.DSL.app.ready === true,
      slots: ['core', 'ui', 'viz', 'systems', 'sections', 'util', 'bus', 'prefs'].every((k) => typeof window.DSL[k] === 'object'),
      sections: ['hero', 'concepts', 'wizard', 'gallery', 'tfengine'].every((k) => typeof window.DSL.sections[k].mount === 'function'),
      chart: typeof window.Chart === 'function' && /^4\./.test(window.Chart.version),
      katex: typeof window.katex === 'object' && typeof window.katex.render === 'function',
      icons: Object.keys(window.DSL.iconsData || {}).length,
      handles: Object.keys(window.DSL.app.handles || {}).sort(),
    }));
    expect(info.ready).toBe(true);
    expect(info.slots).toBe(true);
    expect(info.sections).toBe(true);
    expect(info.chart).toBe(true);
    expect(info.katex).toBe(true);
    expect(info.icons).toBeGreaterThanOrEqual(40);
    expect(info.handles).toEqual(['concepts', 'gallery', 'hero', 'shell-footer', 'shell-header', 'tfengine', 'wizard']);
  });

  test('KaTeX dibuja con sus fuentes locales', async ({ page, gotoApp }) => {
    await gotoApp();
    const ok = await page.evaluate(async () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      window.katex.render('G(s)=\\frac{1}{ms^2+bs+k}', el, { throwOnError: true });
      await document.fonts.ready;
      const faces = await document.fonts.load('20px KaTeX_Main');
      const has = !!el.querySelector('.katex .mfrac');
      el.remove();
      return { has, faces: faces.length };
    });
    expect(ok.has).toBe(true);
    expect(ok.faces).toBeGreaterThan(0);
  });

  test('fuentes de texto y tokens cargados', async ({ page, gotoApp }) => {
    await gotoApp();
    const r = await page.evaluate(async () => {
      await document.fonts.ready;
      const plex = await document.fonts.load('400 17px "IBM Plex Sans"', 'Aá ζω');
      const plexGreek = await document.fonts.load('400 17px "IBM Plex Sans"', 'ζω');
      const brico = await document.fonts.load('600 36px "Bricolage Grotesque"', 'Aá');
      const css = getComputedStyle(document.documentElement);
      return {
        plex: plex.length,
        plexGreek: plexGreek.length,
        brico: brico.length,
        bg: css.getPropertyValue('--bg').trim(),
        accent: css.getPropertyValue('--accent').trim(),
        bodyFont: getComputedStyle(document.body).fontFamily,
        bodyBg: getComputedStyle(document.body).backgroundColor,
      };
    });
    expect(r.plex).toBeGreaterThan(0);
    expect(r.plexGreek).toBeGreaterThan(0);
    expect(r.brico).toBeGreaterThan(0);
    expect(r.bg.toUpperCase()).toBe('#0F1823');
    expect(r.accent.length).toBeGreaterThan(0);
    expect(r.bodyFont).toContain('IBM Plex Sans');
    expect(r.bodyBg).toBe('rgb(15, 24, 35)');
  });

  test('no toca la red: solo recursos file: o data:', async ({ page, gotoApp }) => {
    const urls = [];
    page.on('request', (req) => urls.push(req.url()));
    await gotoApp();
    await page.evaluate(() => document.fonts.ready);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u, u).toMatch(/^(file|data|blob):/);
  });

  test('tema: el conmutador global cambia data-theme y emite theme:change', async ({ page, gotoApp }) => {
    await gotoApp();
    const r = await page.evaluate(() => {
      const seen = [];
      const off = window.DSL.bus.on('theme:change', (p) => seen.push(p.theme));
      window.DSL.prefs.setTheme('light', { persist: false });
      const light = document.documentElement.getAttribute('data-theme');
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      window.DSL.prefs.setTheme('dark', { persist: false });
      off();
      return { seen, light, bg };
    });
    expect(r.light).toBe('light');
    expect(r.bg.toUpperCase()).toBe('#EEF2F6');
    expect(r.seen).toEqual(['light', 'dark']);
  });

  test('tema guardado: se aplica antes de pintar al recargar', async ({ page, gotoApp }) => {
    await gotoApp();
    await page.evaluate(() => window.DSL.prefs.setTheme('light'));
    await page.reload();
    await page.waitForSelector('html[data-ready="true"]', { state: 'attached' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveClass(/\bjs\b/);
    expect(await page.evaluate(() => window.DSL.prefs.theme)).toBe('light');
  });

  test('el fixture guard hace fallar un test con console.error (fallo esperado)', async ({ page, gotoApp }) => {
    test.fail(true, 'Autoprueba del guard: este test DEBE fallar en el desmontaje del fixture.');
    await gotoApp();
    await page.evaluate(() => console.error('error provocado por la autoprueba'));
  });

  test('captura de la página (1440×900 y 1024×768)', async ({ page, gotoApp }, testInfo) => {
    await gotoApp();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath('pagina-1440.png'), fullPage: true });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.screenshot({ path: testInfo.outputPath('pagina-1024.png'), fullPage: false });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'sin scroll horizontal').toBeLessThanOrEqual(0);
  });
});
