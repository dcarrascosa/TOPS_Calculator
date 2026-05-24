// Render og-image.svg → og-image.png at 1200×630.
//
// We keep the SVG as source of truth (easy to edit) and commit the rendered PNG
// alongside it for social platforms that don't accept SVG (Facebook, WhatsApp,
// Twitter/X). Run this whenever the SVG changes:
//
//     bun run build:og
//
// Requires Playwright Chromium (already a devDependency).

import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const svg  = readFileSync(resolve(root, 'og-image.svg'), 'utf8');

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
await page.setContent(
  `<!doctype html><html><head><style>
     html, body { margin: 0; padding: 0; }
     svg { display: block; }
   </style></head>
   <body>${svg}</body></html>`,
  { waitUntil: 'networkidle' },
);
const svgEl = await page.locator('svg').first();
const buffer = await svgEl.screenshot({ type: 'png', omitBackground: false });
writeFileSync(resolve(root, 'og-image.png'), buffer);
await browser.close();

console.log(`wrote og-image.png (${(buffer.length / 1024).toFixed(1)} KB)`);
