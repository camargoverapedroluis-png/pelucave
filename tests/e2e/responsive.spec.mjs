// tests/e2e/responsive.spec.mjs — Propietario: integrator.
// Página completa en cada proyecto (src = index.html, dist = archivo único), con todas las secciones ya
// iniciadas (se recorre la página para disparar los inicios perezosos):
// - sin desbordamiento horizontal en 1440, 1280, 1024, 820, 768, 390 y 375 px;
// - ningún texto visible recortado fuera de la ventana;
// - capturas de página completa (oscuro en 1440×900, 1280×800, 1024×768, 820×1180 y 390×844; claro en
//   1440×900) en test-results/integrator/shots/<proyecto>/ para la revisión visual.
// El fixture guard falla ante cualquier error de consola, de página o petición de red.
import path from 'node:path';
import { test, expect, ROOT } from '../helpers/fixtures.mjs';

const SHOTS = path.join(ROOT, 'test-results', 'integrator', 'shots');

const SIZES = [
  { w: 1440, h: 900, theme: 'dark', shot: true },
  { w: 1440, h: 900, theme: 'light', shot: true },
  { w: 1280, h: 800, theme: 'dark', shot: true },
  { w: 1024, h: 768, theme: 'dark', shot: true },
  { w: 820, h: 1180, theme: 'dark', shot: true },
  { w: 768, h: 1024, theme: 'dark', shot: false },
  { w: 390, h: 844, theme: 'dark', shot: true },
  { w: 375, h: 812, theme: 'dark', shot: false },
];

/** Recorre la página para que cada sección haga su inicio perezoso y espera a las fuentes. */
async function warmAll(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.round(window.innerHeight * 0.6));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
}

for (const s of SIZES) {
  test(`página completa ${s.w}×${s.h} (${s.theme})`, async ({ page, gotoApp }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: s.w, height: s.h });
    if (s.theme === 'light') await page.emulateMedia({ colorScheme: 'light' });
    await gotoApp();
    if (s.theme === 'light') await page.evaluate(() => window.DSL.prefs.setTheme('light', { persist: false }));
    await warmAll(page);

    const report = await page.evaluate(() => {
      const W = window.innerWidth;
      const overflow = document.documentElement.scrollWidth - W;
      // Texto visible que sobresale de la ventana, salvo dentro de un contenedor con desplazamiento propio.
      // Recortado a propósito: dentro de un contenedor con desplazamiento propio, o texto solo para
      // lectores de pantalla (clip / clip-path de 1 px).
      const exempt = (el) => {
        for (let p = el; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (p !== el && /(auto|scroll|hidden|clip)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
          if ((cs.clip && cs.clip !== 'auto') || (cs.clipPath && cs.clipPath !== 'none' && /inset\(50%|inset\(100%/.test(cs.clipPath))) return true;
          if (cs.position === 'absolute' && p.getBoundingClientRect().width <= 1) return true;
        }
        return false;
      };
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        const el = n.parentElement;
        if (!el || el.closest('[hidden], .sr-only, .ds-visually-hidden, [aria-hidden="true"] .sr-only')) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        const b = r.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if ((b.right > W + 1 || b.left < -1) && !exempt(el)) {
          out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} «${n.nodeValue.trim().slice(0, 30)}» [${Math.round(b.left)}, ${Math.round(b.right)}]`);
        }
      }
      return { overflow, out: out.slice(0, 20), height: document.documentElement.scrollHeight };
    });
    expect(report.overflow, `desbordamiento horizontal a ${s.w}px`).toBeLessThanOrEqual(0);
    expect(report.out, `texto fuera de la ventana a ${s.w}px`).toEqual([]);
    await expect(page.locator('.app-error')).toHaveCount(0);

    if (s.shot) {
      const file = path.join(SHOTS, testInfo.project.name, `pagina-${s.w}x${s.h}-${s.theme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      testInfo.annotations.push({ type: 'captura', description: `${file} (${report.height}px)` });
    }
  });
}
