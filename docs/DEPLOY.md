# Despliegue en Cloudflare: pelucave.com

Guía operativa para publicar el Laboratorio de Sistemas Dinámicos en `https://pelucave.com`. Todos los comandos se ejecutan en la raíz del repositorio. Propietario: architect.

## 0. Estado real y qué se publica

Producción es el **Worker `pelucave` con assets estáticos**, compilado por **Workers Builds** desde GitHub (rama `main`). Es lo que responde en `https://pelucave.com` desde el commit `538eef8`. No existe ningún proyecto de Cloudflare Pages (`pelucave.pages.dev` no resuelve); Pages queda documentado en §2C como alternativa, por si algún día se prefiere.

| Elemento | Valor |
|---|---|
| Worker | `pelucave` (cuenta `98d59dac909cc77eaa65753f3647ad99`) |
| Carpeta publicada (lo único que sube a Cloudflare) | `_site/` (`assets.directory` en `wrangler.jsonc`) |
| Contenido de `_site/` | `index.html` (la página autocontenida, 2,35 MiB), `_headers`, `_redirects` |
| Compilación | `wrangler deploy` ejecuta `build.command` = `node tools/site.mjs` y sube `_site/` |
| Dependencias necesarias para compilar | Ninguna: `tools/build.mjs` solo usa módulos de Node y `vendor/` está versionado |
| Node.js | 20 o superior (`engines` de `package.json`) |
| Rama de producción | `main` |
| Dominios | `pelucave.com` (canónico) y `www.pelucave.com` (redirige al canónico) |

La aplicación es una SPA que enruta por `#hash` dentro de un solo archivo: no hay rutas de servidor, ni `fetch`, ni recursos externos. Eso simplifica el resto:

- **Rutas desconocidas:** `assets.not_found_handling = "single-page-application"` hace que cualquier ruta devuelva `index.html` con 200. No hace falta la regla `/* /index.html 200`.
- **CORS:** la página no hace ninguna petición a otro origen, así que no puede haber bloqueos. La única petición externa es el beacon de Cloudflare Web Analytics, que Cloudflare inyecta en el HTML y la CSP permite. `tools/check-site.mjs` lo verifica.
- **`_headers` y `_redirects`** se aplican igual en un Worker con assets estáticos que en Pages.

Archivos que intervienen:

| Archivo | Papel |
|---|---|
| `wrangler.jsonc` | Nombre del Worker, `build.command`, `assets.directory` y el fallback SPA |
| `tools/site.mjs` | Vacía `_site/`, genera `index.html` con `tools/build.mjs --out=_site/index.html` y copia `deploy/*` |
| `deploy/_headers` | CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y `Cache-Control` |
| `deploy/_redirects` | `/sistemas-dinamicos.html → /` (301). Solo admite orígenes relativos; la redirección `www → raíz` va en el panel (§3.3) |
| `tools/check-site.mjs` | Comprobación posterior al despliegue (consola, CSP, red, rutas, cabeceras) |
| `.gitignore` | Excluye `_site/` y `.wrangler/` |

## 1. Preparación y compilación

```bash
npm install                 # solo para pruebas y Wrangler; la compilación no lo necesita
npm run verify              # vendor → icons → pelucave → test → crosscheck → build → test:e2e
npm run site                # genera _site/ (index.html + _headers + _redirects)
npx wrangler deploy --dry-run   # valida wrangler.jsonc y ejecuta build.command sin subir nada
npm run site:dev            # sirve _site/ en http://localhost:8788 con cabeceras, redirecciones y fallback SPA reales
```

Con el servidor local en marcha, en otra terminal:

```bash
npm run site:check -- http://localhost:8788
# Si los navegadores de Playwright no están descargados pero hay Chrome instalado:
PW_CHANNEL=chrome npm run site:check -- http://localhost:8788
```

Resultado esperado: `200`, cabeceras `content-security-policy` y `strict-transport-security` presentes, las ocho secciones montadas (`bikeLab, concepts, gallery, hero, shell-footer, shell-header, tfengine, wizard`), `GET /ruta-inexistente: 200`, `GET /sistemas-dinamicos.html: 301 -> /` y la línea final «Sin errores de consola, CSP, red ni rutas». Wrangler no debe imprimir ningún `WARNING` sobre `_headers` o `_redirects`.

## 2. Método de despliegue

### 2A. Workers Builds desde GitHub (configuración actual, recomendada)

Cada `push` a `main` lanza una compilación. El resultado aparece como estado del commit en GitHub («Workers Builds: pelucave», con enlace al registro) y en **Workers & Pages → pelucave → Deployments**.

```bash
git switch main
git merge --ff-only feat/<rama>      # o fusione con un pull request
git push origin main                 # dispara la compilación y el despliegue
```

Ajustes del Worker en **Workers & Pages → pelucave → Settings → Build** (ya configurados; se listan para poder restaurarlos):

| Campo | Valor |
|---|---|
| Git repository | `camargoverapedroluis-png/pelucave` |
| Production branch | `main` |
| Build command | vacío (`wrangler deploy` ejecuta `build.command` de `wrangler.jsonc`) |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |
| Build variables (opcional) | `NODE_VERSION=22` si la imagen de compilación trajera un Node anterior a 20 |

Una compilación fallida **no toca producción**: sigue sirviéndose el último despliegue correcto. El registro del fallo está en el enlace del estado del commit.

### 2B. Despliegue directo con Wrangler

Útil para publicar desde la máquina sin pasar por GitHub (mismo Worker, mismo dominio):

```bash
npx wrangler login                 # abre el navegador; una sola vez
npx wrangler whoami
npm run deploy                     # npm test → wrangler deploy (build.command + subida de _site/)
npm run deploy:preview             # wrangler versions upload: versión con URL de vista previa, sin tocar producción
npx wrangler deployments list      # historial
npx wrangler rollback              # vuelve a la versión anterior
```

Para CI sin sesión interactiva: API Token con `Workers Scripts: Edit` y exportar `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` antes de `npm run deploy`.

### 2C. Alternativa: Cloudflare Pages

Pages sirve exactamente lo mismo (`_site/`), pero exige otra forma de `wrangler.jsonc` y un proyecto distinto. Solo tiene sentido si se abandona el Worker. Pasos:

1. En el Worker, **Settings → Domains & Routes**, quite `pelucave.com` y `www.pelucave.com` (un dominio no puede apuntar a dos cosas).
2. Sustituya `wrangler.jsonc` por la forma de Pages (los campos `build` y `assets` no son válidos ahí):

   ```jsonc
   {
     "name": "pelucave",
     "pages_build_output_dir": "./_site",
     "compatibility_date": "2026-10-12"
   }
   ```

3. **Workers & Pages → Create → Pages → Connect to Git**, con *build command* `npm run site`, *build output directory* `_site`, preset `None`, rama `main`, variables `NODE_VERSION=22` y `SKIP_DEPENDENCY_INSTALL=1`. O con Wrangler: `npx wrangler pages project create pelucave --production-branch main` y `npx wrangler pages deploy _site --project-name pelucave --branch main`.
4. **Custom domains** del proyecto: añada `pelucave.com` y `www.pelucave.com`.
5. Para redirigir `pelucave.pages.dev` al dominio, Cloudflare recomienda **Bulk Redirects** (Source URL `pelucave.pages.dev`, Target `https://pelucave.com`, 301, «Preserve query string», «Subpath matching», «Preserve path suffix», «Include subdomains»).

En Pages el fallback SPA no viene de `not_found_handling` sino de que `_site/` no contiene `404.html`; el resultado es el mismo.

## 3. Dominio personalizado pelucave.com

### 3.1 La zona en Cloudflare

Para servir el **apex** (`pelucave.com`) el DNS del dominio tiene que estar en Cloudflare, porque un apex no admite CNAME en DNS clásico. La zona ya está activa: `pelucave.com` resuelve a direcciones de Cloudflare (`104.21.x.x`, `172.67.x.x` y sus IPv6). Si en el futuro hiciera falta repetirlo: **Add a domain** → `pelucave.com` → cambiar los *nameservers* en el registrador por los dos `*.ns.cloudflare.com` indicados → esperar a **Active**.

### 3.2 Asociar el dominio al Worker

En **Workers & Pages → pelucave → Settings → Domains & Routes → Add → Custom Domain**:

1. `pelucave.com` → **Add domain**. Cloudflare crea el registro DNS y emite el certificado.
2. Repita con `www.pelucave.com`.

Registros que deben existir en **DNS → Records** (los crea el asistente; no cree registros A ni CNAME a mano, un dominio personalizado de Worker los gestiona Cloudflare):

| Tipo | Nombre | Contenido | Proxy |
|---|---|---|---|
| Worker | `pelucave.com` | `pelucave` | Proxied |
| Worker | `www` | `pelucave` | Proxied |

Si existía un registro A, AAAA o CNAME antiguo para `@` o `www`, el asistente avisa de conflicto: elimínelo antes. El estado pasa a **Active** cuando el certificado está emitido (normalmente menos de 15 minutos).

Opcional, en la misma pantalla: desactive la URL `pelucave.<cuenta>.workers.dev` (y las *Preview URLs*) para que el contenido solo se sirva en el dominio.

### 3.3 Un solo origen canónico: www → pelucave.com

`_redirects` solo acepta orígenes relativos (Wrangler descarta `https://host/*` con «Only relative URLs are allowed»), así que esta redirección va en el panel, según el ejemplo «Redirect from WWW to root» de Cloudflare. En **Rules → Overview → Create rule → Redirect Rule**:

| Campo | Valor |
|---|---|
| Rule name | `www a raiz` |
| When incoming requests match | Wildcard pattern · Request URL · `https://www.*` |
| Then | URL redirect · Dynamic · Target URL `https://${1}` |
| Status code | `301` |
| Preserve query string | Activado |

`${1}` es lo que capturó el comodín (`pelucave.com/lo-que-sea?q=1`), así que ruta y consulta se conservan.

### 3.4 SSL/TLS

El certificado del dominio lo emite y renueva Cloudflare (Universal SSL). Ajustes de la zona en **SSL/TLS**:

| Ajuste | Valor | Motivo |
|---|---|---|
| Overview → Encryption mode | **Full (strict)** | El origen es la propia red de Cloudflare, así que cualquier modo funciona con el Worker; «Flexible» solo sería un riesgo si se añadiera otro origen a la zona. «Full (strict)» es el único modo seguro en general |
| Edge Certificates → Always Use HTTPS | **On** | Hoy `http://pelucave.com` responde 200 sin redirigir; con esto el borde redirige a `https://` con 301 |
| Edge Certificates → Automatic HTTPS Rewrites | On | Inocuo para esta página |
| Edge Certificates → Minimum TLS Version | TLS 1.2 | Compatible con todos los navegadores actuales |
| Edge Certificates → TLS 1.3 | On | |
| Edge Certificates → HSTS | Opcional | `deploy/_headers` ya envía `Strict-Transport-Security: max-age=31536000` (sin `includeSubDomains` ni `preload`) |

Comprobación:

```bash
curl -4 -sI https://pelucave.com | head -20
curl -4 -sI http://pelucave.com | grep -i -E '^(HTTP|location)'       # 301 a https:// (tras activar Always Use HTTPS)
curl -4 -sI https://www.pelucave.com | grep -i -E '^(HTTP|location)'   # 301 a https://pelucave.com/
openssl s_client -connect pelucave.com:443 -servername pelucave.com </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates
```

`-4` evita que `curl` se quede esperando en redes sin salida IPv6 (en la máquina de desarrollo el intento IPv6 tarda 20 s en fallar antes de pasar a IPv4; el navegador lo hace solo).

## 4. Optimización

La página es un único HTML de 2,35 MiB (incluye KaTeX, Chart.js y las fuentes). Lo que importa es que viaje comprimido (hoy llega en 0,86 MiB con Brotli), que el navegador la revalide y que Cloudflare **no la modifique**.

| Dónde | Ajuste | Valor | Motivo |
|---|---|---|---|
| Automático | Compresión Brotli / Zstandard / gzip | Activa | `curl -4 -sI -H 'Accept-Encoding: br' https://pelucave.com` muestra `content-encoding: br` |
| Automático | Caché en el borde | Activa (`cf-cache-status: HIT`) | Cada despliegue invalida la caché del Worker; `_headers` fija `max-age=0, must-revalidate` para el navegador |
| Speed → Optimization → Content | **Rocket Loader** | **Off** | Reordena y difiere los `<script>`; la app es una cadena de scripts clásicos que dependen del orden (`window.DSL`) y la CSP bloquearía el script inyectado |
| Speed → Optimization → Content | Early Hints | On | Inocuo |
| Speed → Optimization → Content | Cloudflare Fonts | Off | Las fuentes van incrustadas |
| Speed → Optimization → Protocol | HTTP/2, HTTP/3 (QUIC), 0-RTT | On | Una sola transferencia grande se beneficia de QUIC (`alt-svc: h3` ya se anuncia) |
| Speed → Optimization → Image | Polish, Mirage | No aplica | No hay imágenes |
| Scrape Shield | Email Address Obfuscation | Off | Inyecta un script; no hay correos que proteger |
| Caching → Configuration | Browser Cache TTL | Respect Existing Headers | Deja mandar a `_headers` |
| Caching → Cache Rules | Ninguna | | Una regla «Cache Everything» con TTL largo serviría la versión antigua tras un despliegue |
| Analytics → Web Analytics | Activo | | Está activo: Cloudflare inyecta `static.cloudflareinsights.com/beacon.min.js`; la CSP de `_headers` lo permite. Si lo desactiva, puede retirar esas dos entradas de la CSP |

«Auto Minify» ya no existe en Cloudflare (se retiró en 2024) y no haría falta: el archivo se sirve comprimido.

## 5. Verificación posterior al despliegue

1. **Estado de la compilación:** en GitHub, el commit de `main` muestra «Workers Builds: pelucave» en verde; o en **Workers & Pages → pelucave → Deployments**. Desde la terminal, sin autenticación (el repositorio es público):

   ```bash
   curl -s https://api.github.com/repos/camargoverapedroluis-png/pelucave/commits/main/check-runs | grep -o '"conclusion": *"[a-z]*"' | head -1
   ```

2. **Qué versión está publicada:** el hash del HTML servido debe coincidir con el de `_site/index.html` que imprime `npm run site`.

   ```bash
   curl -4 -s --compressed https://pelucave.com | sha256sum
   ```

3. **Cabeceras, compresión y redirecciones:**

   ```bash
   curl -4 -sI -H 'Accept-Encoding: br' https://pelucave.com | grep -i -E '^(HTTP|content-type|content-encoding|cache-control|etag|content-security-policy|strict-transport|x-content-type|x-frame|referrer|cf-cache-status)'
   curl -4 -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://pelucave.com/sistemas-dinamicos.html   # 301 https://pelucave.com/
   curl -4 -s -o /dev/null -w '%{http_code}\n' https://pelucave.com/ruta-inexistente                          # 200 (SPA)
   curl -4 -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://www.pelucave.com/                      # 301 https://pelucave.com/
   ```

4. **Consola, CSP, red y rutas con un navegador real:**

   ```bash
   npm run site:check -- https://pelucave.com
   ```

   Falla (código 1) y lista el motivo si aparece cualquier `console.error`, error de página, violación de la CSP, petición fallida, respuesta 4xx/5xx o petición a un origen distinto de `https://pelucave.com` (salvo el beacon de Web Analytics, que se anota). Una línea «peticion a otro origen» señala un script inyectado por un ajuste de Cloudflare (Rocket Loader, Email Obfuscation): desactívelo o amplíe la CSP.

5. **La batería e2e del proyecto sobre el archivo publicado.** Las pruebas de `dist` usan `file://`, así que basta con descargar la página al lugar que esperan:

   ```bash
   curl -4 -s --compressed https://pelucave.com -o dist/sistemas-dinamicos.html
   npx playwright test --project=dist
   git checkout -- dist/sistemas-dinamicos.html      # restaura el archivo versionado
   ```

6. **Manual en el navegador:** DevTools → Network, recargar: una petición de documento, el beacon de Web Analytics y nada más; sin avisos de CSP en Console. Lighthouse (Navigation, Desktop): Best Practices 100 gracias a la CSP y a HTTPS.

## 6. Operación

- **Rollback:** Workers & Pages → pelucave → Deployments → versión anterior → **Rollback**; o `npx wrangler rollback`. Instantáneo, sin compilar.
- **Vista previa sin tocar producción:** `npm run deploy:preview` (`wrangler versions upload`) devuelve una URL de vista previa si están activas las *Preview URLs* del Worker.
- **Límites de assets estáticos que esta página cumple:** 20 000 archivos y 25 MiB por archivo; `_site/` tiene 3 archivos y el mayor pesa 2,35 MiB.
- **Fechar el banner de la página:** `BUILD_DATE=2026-10-23 npm run site` (o la variable `BUILD_DATE` entre las *build variables* del Worker).
