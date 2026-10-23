# Despliegue en Cloudflare Pages: pelucave.com

Guía operativa para publicar el Laboratorio de Sistemas Dinámicos en Cloudflare Pages y servirlo en `https://pelucave.com`. Todos los comandos se ejecutan en la raíz del repositorio. Propietario: architect.

## 0. Qué se publica y por qué

| Elemento | Valor |
|---|---|
| Carpeta de salida (lo único que sube a Cloudflare) | `_site/` |
| Contenido de `_site/` | `index.html` (la página autocontenida, 2,35 MiB), `_headers`, `_redirects` |
| Comando de compilación | `npm run site` (equivale a `node tools/site.mjs`) |
| Dependencias necesarias para compilar | Ninguna: `tools/build.mjs` solo usa módulos de Node y `vendor/` está versionado |
| Node.js | 20 o superior (`engines` de `package.json`) |
| Proyecto de Pages | `pelucave` |
| Rama de producción | `main` |
| Dominios | `pelucave.com` (canónico) y `www.pelucave.com` (redirige al canónico) |

La aplicación es una SPA que enruta por `#hash` dentro de un solo archivo: no hay rutas de servidor, ni `fetch`, ni recursos externos. Eso simplifica todo lo demás:

- **No hace falta la regla `/* /index.html 200`.** Como `_site/` no contiene `404.html`, Pages ya sirve `index.html` con estado 200 para cualquier ruta desconocida.
- **No puede haber bloqueos CORS:** la página no hace ninguna petición a otro origen. `tools/check-site.mjs` lo verifica.
- **`wrangler.jsonc` es la configuración de Pages** (`pages_build_output_dir: "./_site"`). La versión anterior del archivo era una configuración de *Workers con assets estáticos*; sigue disponible con `git show 538eef8:wrangler.jsonc` si algún día prefiere esa vía (Cloudflare la recomienda para proyectos nuevos, pero Pages sigue siendo totalmente compatible y es lo que pide esta guía).

Archivos que intervienen:

| Archivo | Papel |
|---|---|
| `tools/site.mjs` | Vacía `_site/`, genera `index.html` con `tools/build.mjs --out=_site/index.html` y copia `deploy/*` |
| `deploy/_headers` | CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y `Cache-Control` de la página |
| `deploy/_redirects` | `/sistemas-dinamicos.html → /` (301). Solo admite orígenes relativos; las redirecciones por host (`www`, `pages.dev`) se configuran en el panel (§3.4) |
| `wrangler.jsonc` | Nombre del proyecto y carpeta de salida para Wrangler y para el panel |
| `tools/check-site.mjs` | Comprobación posterior al despliegue (consola, CSP, red, rutas, cabeceras) |
| `.gitignore` | Ya excluye `_site/` y `.wrangler/` |

## 1. Preparación y compilación

```bash
npm install                 # solo para pruebas y Wrangler; la compilación no lo necesita
npm run verify              # vendor → icons → pelucave → test → crosscheck → build → test:e2e
npm run site                # genera _site/ (index.html + _headers + _redirects)
npm run site:dev            # sirve _site/ en http://localhost:8788 con cabeceras y redirecciones reales
```

Con el servidor local en marcha, en otra terminal:

```bash
npm run site:check -- http://localhost:8788
# Si los navegadores de Playwright no están descargados pero hay Chrome instalado:
PW_CHANNEL=chrome npm run site:check -- http://localhost:8788
```

Resultado esperado: `200`, cabeceras `content-security-policy` y `strict-transport-security` presentes, las ocho secciones montadas (`bikeLab, concepts, gallery, hero, shell-footer, shell-header, tfengine, wizard`), `GET /ruta-inexistente: 200`, `GET /sistemas-dinamicos.html: 301 -> /` y la línea final «Sin errores de consola, CSP, red ni rutas». Wrangler no debe imprimir ningún `WARNING` sobre `_headers` o `_redirects` al arrancar.

## 2. Método de despliegue

Un proyecto de Pages es **o** de Git **o** de subida directa; no se mezclan. Recomendación: **Git** para producción (cada `push` a `main` publica, cada rama tiene vista previa, historial y *rollback* en el panel) y **Wrangler** para publicar desde la máquina cuando no quiera pasar por GitHub.

### 2A. Despliegue automático desde GitHub (recomendado)

El remoto ya existe: `https://github.com/camargoverapedroluis-png/pelucave.git`. Pages publica la rama de producción, así que el trabajo de `feat/pelucave-mouth-transition` tiene que llegar a `main`:

```bash
git switch main
git merge --ff-only feat/pelucave-mouth-transition   # o fusione con un pull request en GitHub
git push origin main
```

En el panel de Cloudflare:

1. **Workers & Pages → Create → Pages → Connect to Git.** Autorice la app de Cloudflare Pages en GitHub y elija el repositorio `pelucave`.
2. **Set up builds and deployments:**

   | Campo | Valor |
   |---|---|
   | Project name | `pelucave` |
   | Production branch | `main` |
   | Framework preset | `None` |
   | Build command | `npm run site` |
   | Build output directory | `_site` |
   | Root directory | `/` (vacío) |

3. **Environment variables (Production y Preview):**

   | Variable | Valor | Motivo |
   |---|---|---|
   | `NODE_VERSION` | `22` | `engines` exige Node 20 o superior; la imagen de compilación por defecto puede ser más antigua |
   | `SKIP_DEPENDENCY_INSTALL` | `1` | La compilación no usa `node_modules`; evita instalar Playwright y las fuentes en cada despliegue |

4. **Save and Deploy.** El primer despliegue queda en `https://pelucave.pages.dev`. Cada `push` posterior a `main` publica en producción; cada `push` a otra rama crea una vista previa en `https://<hash>.pelucave.pages.dev` (y `https://<rama>.pelucave.pages.dev`).

`wrangler.jsonc` se lee en la compilación: su `pages_build_output_dir` debe coincidir con «Build output directory» (`_site`); si difieren, la compilación falla con un mensaje explícito.

### 2B. Despliegue directo con Wrangler

```bash
npx wrangler login                                               # abre el navegador; una sola vez
npx wrangler pages project create pelucave --production-branch main
npm run deploy                                                   # npm test → npm run site → wrangler pages deploy _site (producción)
npm run deploy:preview                                           # vista previa en https://preview.pelucave.pages.dev
```

`npm run deploy` equivale a:

```bash
npx wrangler pages deploy _site --project-name pelucave --branch main
```

Comandos útiles:

```bash
npx wrangler whoami                                   # cuenta y permisos activos
npx wrangler pages project list
npx wrangler pages deployment list --project-name pelucave
```

Para automatizar sin sesión interactiva (CI), cree un **API Token** con el permiso `Cloudflare Pages: Edit` (y `Account Settings: Read`) y expórtelo antes del comando:

```bash
export CLOUDFLARE_API_TOKEN=...   # PowerShell: $env:CLOUDFLARE_API_TOKEN = '...'
export CLOUDFLARE_ACCOUNT_ID=...
npm run deploy
```

## 3. Dominio personalizado pelucave.com

### 3.1 Requisito: la zona en Cloudflare

Para servir el **apex** (`pelucave.com`, sin subdominio) el DNS del dominio tiene que estar en Cloudflare, porque un apex no admite CNAME en DNS normal y Cloudflare lo resuelve con *CNAME flattening*. Si el dominio está registrado en otro sitio:

1. **Add a domain** en el panel de Cloudflare → `pelucave.com` → plan Free.
2. Cambie los *nameservers* en su registrador por los dos que indique Cloudflare (`*.ns.cloudflare.com`).
3. Espere a que la zona aparezca como **Active** (minutos, hasta 24 h).

Si el dominio ya está en Cloudflare (o Cloudflare es el registrador), continúe.

### 3.2 Asociar el dominio al proyecto de Pages

En **Workers & Pages → pelucave → Custom domains → Set up a custom domain**:

1. Escriba `pelucave.com` → **Continue** → **Activate domain**. Como la zona está en la misma cuenta, Cloudflare crea el registro DNS por usted.
2. Repita con `www.pelucave.com`.

Registros que deben quedar en **DNS → Records** (créelos a mano solo si el asistente no lo hizo):

| Tipo | Nombre | Destino | Proxy |
|---|---|---|---|
| CNAME | `pelucave.com` (o `@`) | `pelucave.pages.dev` | Proxied (nube naranja) |
| CNAME | `www` | `pelucave.pages.dev` | Proxied |

No se usan registros A: el origen es la red de Cloudflare, no una IP fija. Si existía un registro A o AAAA antiguo para `@` o `www`, elimínelo antes; de lo contrario el asistente avisa de conflicto.

Alternativa por API (mismo efecto que el asistente; `CF_ACCOUNT_ID` está en la página de resumen de la cuenta):

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/pages/projects/pelucave/domains" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"name":"pelucave.com"}'
```

El estado del dominio pasa de **Initializing** a **Active** cuando el certificado está emitido (normalmente menos de 15 minutos).

### 3.3 SSL/TLS

Pages emite y renueva el certificado del dominio personalizado (Universal SSL) sin ninguna acción. Ajustes de la zona, en **SSL/TLS**:

| Ajuste | Valor | Motivo |
|---|---|---|
| Overview → Encryption mode | **Full (strict)** | El origen de Pages es la propia red de Cloudflare, así que cualquier modo funciona con Pages; «Flexible» solo es un riesgo si algún día añade otro origen en la zona. «Full (strict)» es el único modo seguro de forma general |
| Edge Certificates → Always Use HTTPS | On | Redirige `http://` a `https://` en el borde |
| Edge Certificates → Automatic HTTPS Rewrites | On | Inocuo para esta página (no tiene enlaces `http://`) |
| Edge Certificates → Minimum TLS Version | TLS 1.2 | Compatible con todos los navegadores actuales |
| Edge Certificates → TLS 1.3 | On | |
| Edge Certificates → HSTS | Opcional | `deploy/_headers` ya envía `Strict-Transport-Security: max-age=31536000` (sin `includeSubDomains` ni `preload`, para no afectar a otros subdominios) |

Comprobación del certificado y de la redirección:

```bash
curl -sI https://pelucave.com | head -20
curl -sI http://pelucave.com | grep -i -E '^(HTTP|location)'      # 301 a https://
curl -sI https://www.pelucave.com | grep -i -E '^(HTTP|location)'  # 301 a https://pelucave.com/
openssl s_client -connect pelucave.com:443 -servername pelucave.com </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates
```

### 3.4 Un solo origen canónico: www y pages.dev → pelucave.com

El archivo `_redirects` de Pages solo acepta orígenes relativos (Wrangler descarta `https://host/*` con «Only relative URLs are allowed»), así que las redirecciones por nombre de host se configuran en el panel. Hágalo cuando `https://pelucave.com` ya responda (§3.2).

**www.pelucave.com → pelucave.com** (regla de la zona; ruta documentada por Cloudflare en «Redirect from WWW to root»). En **Rules → Overview → Create rule → Redirect Rule**:

| Campo | Valor |
|---|---|
| Rule name | `www a raiz` |
| When incoming requests match | Wildcard pattern · Request URL · `https://www.*` |
| Then | URL redirect · Dynamic · Target URL `https://${1}` |
| Status code | `301` |
| Preserve query string | Activado |

`${1}` es lo que capturó el comodín (`pelucave.com/lo-que-sea?q=1`), así que la ruta y la consulta se conservan.

**pelucave.pages.dev → pelucave.com** (Cloudflare documenta esta vía en «Redirect *.pages.dev to a custom domain»; `pages.dev` no es una zona suya, por eso no vale una Redirect Rule). En **Workers & Pages → pelucave → Custom domains** compruebe que `pelucave.com` aparece activo y después, en la cuenta, **Bulk Redirects → Create Bulk Redirect List**:

| Campo | Valor |
|---|---|
| Source URL | `pelucave.pages.dev` |
| Target URL | `https://pelucave.com` |
| Status | `301` |
| Parameters | Preserve query string · Subpath matching · Preserve path suffix · Include subdomains |

Después **Create Bulk Redirect Rule** usando esa lista. Con «Include subdomains» también redirigen las vistas previas `<hash>.pelucave.pages.dev`; si quiere seguir usándolas para revisar ramas, no marque esa opción.

Comprobación:

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' 'https://www.pelucave.com/a/b?q=1'   # 301 https://pelucave.com/a/b?q=1
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' 'https://pelucave.pages.dev/a/b'    # 301 https://pelucave.com/a/b
```

## 4. Optimización

La página es un único HTML de 2,35 MiB (incluye KaTeX, Chart.js y las fuentes). Lo que importa es que viaje comprimido, que el navegador la revalide con ETag y que Cloudflare **no la modifique**.

| Dónde | Ajuste | Valor | Motivo |
|---|---|---|---|
| Pages (automático) | Compresión Brotli / gzip | Activa | Pages comprime `text/html`; `curl -sI -H 'Accept-Encoding: br' https://pelucave.com` debe mostrar `content-encoding: br` |
| Pages (automático) | Caché en el borde + ETag | Activa | Cada despliegue invalida la caché; `_headers` fija `max-age=0, must-revalidate`, así que el navegador recibe 304 cuando no ha cambiado nada |
| Speed → Optimization → Content | **Rocket Loader** | **Off** | Reordena y difiere los `<script>`; la app es una cadena de scripts clásicos que dependen del orden (`window.DSL`) y además la CSP bloquearía el script inyectado |
| Speed → Optimization → Content | Early Hints | On | Inocuo |
| Speed → Optimization → Content | Cloudflare Fonts | Off | Las fuentes van incrustadas; no hay nada que reescribir |
| Speed → Optimization → Protocol | HTTP/2, HTTP/3 (QUIC), 0-RTT | On | Una sola transferencia grande se beneficia de QUIC |
| Speed → Optimization → Image | Polish, Mirage | No aplica | La página no tiene imágenes |
| Scrape Shield | Email Address Obfuscation | Off | Inyecta un script en el HTML; no hay correos que proteger |
| Caching → Configuration | Browser Cache TTL | Respect Existing Headers | Deja mandar a `_headers` |
| Caching → Cache Rules | Ninguna | | Una regla «Cache Everything» con TTL largo serviría la versión antigua tras un despliegue |
| Analytics → Web Analytics | Opcional | | Si lo activa, añada `https://static.cloudflareinsights.com` a `script-src` y `https://cloudflareinsights.com` a `connect-src` en `deploy/_headers`; si no, la CSP bloquea el *beacon* |

«Auto Minify» ya no existe en Cloudflare (se retiró en 2024) y no haría falta: el archivo se sirve comprimido.

## 5. Verificación posterior al despliegue

1. **Cabeceras, compresión y redirecciones** (desde cualquier terminal):

   ```bash
   curl -sI -H 'Accept-Encoding: br' https://pelucave.com | grep -i -E '^(HTTP|content-type|content-encoding|cache-control|etag|content-security-policy|strict-transport|x-content-type|x-frame|referrer|cf-cache-status)'
   curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://pelucave.com/sistemas-dinamicos.html   # 301 https://pelucave.com/
   curl -s -o /dev/null -w '%{http_code}\n' https://pelucave.com/ruta-inexistente                          # 200 (SPA)
   curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://www.pelucave.com/                      # 301 https://pelucave.com/
   ```

2. **Consola, CSP, red y rutas con un navegador real:**

   ```bash
   npm run site:check -- https://pelucave.com
   ```

   El script falla (código 1) y lista el motivo si aparece cualquier `console.error`, error de página, violación de la CSP, petición fallida, respuesta 4xx/5xx o petición a un origen distinto de `https://pelucave.com`. Como la aplicación no hace peticiones, cualquier línea «peticion a otro origen» indica un script inyectado por un ajuste de Cloudflare (Rocket Loader, Web Analytics, Email Obfuscation): desactívelo o amplíe la CSP.

3. **La batería e2e del proyecto sobre el archivo publicado.** Las pruebas de `dist` usan `file://`, así que basta con descargar la página publicada al lugar que esperan y lanzarlas:

   ```bash
   curl -s https://pelucave.com -o dist/sistemas-dinamicos.html
   npx playwright test --project=dist
   git checkout -- dist/sistemas-dinamicos.html      # restaura el archivo versionado
   ```

   Si Cloudflare no altera el HTML, `sha256sum dist/sistemas-dinamicos.html` coincide con el valor que imprimió `npm run site`.

4. **Comprobación manual en el navegador:** DevTools → Network, filtro «All», recargar: una sola petición de documento (más `favicon.ico`, que Pages responde con 404 sin consecuencias si no existe), sin peticiones a terceros, sin avisos de CSP en Console. En Lighthouse (pestaña «Lighthouse», modo Navigation, Desktop) la puntuación de Best Practices debería ser 100 gracias a la CSP y a HTTPS.

## 6. Operación

- **Rollback:** Workers & Pages → pelucave → Deployments → menú del despliegue anterior → **Rollback to this deployment**. Es instantáneo y no requiere compilar.
- **Vistas previas:** cualquier rama distinta de `main` (Git) o `npm run deploy:preview` (Wrangler). Las URL `*.pelucave.pages.dev` de vista previa son públicas; en Settings → General → **Access policy** puede restringirlas con Cloudflare Access.
- **Límites de Pages (plan Free) que esta página cumple:** 20 000 archivos y 25 MiB por archivo; `_site/` tiene 3 archivos y el mayor pesa 2,35 MiB. 500 compilaciones al mes en Git.
- **Fechar el banner de la página:** `BUILD_DATE=2026-10-23 npm run site` (o la variable `BUILD_DATE` en el entorno de compilación de Pages).
