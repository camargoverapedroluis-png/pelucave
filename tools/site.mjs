// tools/site.mjs — Propietario: architect.
// Prepara la carpeta que publica Cloudflare: _site/index.html (la página autocontenida que genera
// tools/build.mjs) más los archivos de deploy/ (_headers, _redirects). Es lo único que sube a Cloudflare
// (wrangler.jsonc → assets.directory); el repositorio, vendor/ y dist/ nunca se publican. Guía: docs/DEPLOY.md.
//
// Uso: node tools/site.mjs                       (npm run site)
//      BUILD_DATE=2026-10-23 node tools/site.mjs  (fecha el banner, como en tools/build.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, '_site');
const DEPLOY = path.join(ROOT, 'deploy');

fs.rmSync(SITE, { recursive: true, force: true });
fs.mkdirSync(SITE, { recursive: true });

execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs'), `--out=${path.join(SITE, 'index.html')}`], {
  stdio: 'inherit',
  env: process.env,
});

const extras = fs.readdirSync(DEPLOY).filter((name) => !name.startsWith('.'));
for (const name of extras) fs.copyFileSync(path.join(DEPLOY, name), path.join(SITE, name));

const listing = fs.readdirSync(SITE).sort().map((name) => {
  const size = fs.statSync(path.join(SITE, name)).size;
  return `${name} (${size >= 1 << 20 ? (size / (1 << 20)).toFixed(2) + ' MiB' : size + ' B'})`;
});
console.log(`_site/: ${listing.join(', ')}`);
