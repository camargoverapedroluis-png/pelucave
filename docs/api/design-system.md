# API: design-system (index)

The design-system key owns the visual foundation and the page chrome:

| File | Contents | Reference |
|---|---|---|
| `css/tokens.css` | Colour, type, space, glass, motion and z-index tokens, dark and light, plus reduced-motion and reduced-transparency overrides | [ui.md](ui.md) («Themes», «Tokens added») |
| `css/base.css` | Reset, s-plane backdrop and grain, type scale, landmarks, skip link, focus ring, print | [shell.md](shell.md) («Layout hooks») |
| `css/components.css` | `ds-` components and KaTeX hooks | [ui.md](ui.md) |
| `css/shell.css` | Top bar, menu sheet, footer | [shell.md](shell.md) |
| `js/ui/components.js` | `DSL.ui.*` factories, tooltips, toasts, live region | [ui.md](ui.md) |
| `js/ui/shell.js` | `DSL.ui.shell` | [shell.md](shell.md) |
| `js/app.js` | Boot and error boundary | [shell.md](shell.md) («js/app.js») |
| `tools/icons/design-system.list` | Lucide icons used by these files | regenerate with `node tools/icons.mjs` |
| `tests/pages/ui-kitchen-sink.html` | Every component in both themes, with the real shell | open from `file://` |
| `tests/unit/ui.test.mjs`, `tests/e2e/shell.spec.mjs` | Unit (fake DOM) and browser tests | screenshots in `test-results/design-system/` |
