// Render an SVG file to PNG using Playwright Chromium.
//
// Usage:
//   bun scripts/render-svg.mjs <input.svg> <output.png> [width] [height]
//
// Example (used by `bun run build:og` and `bun run build:infographic`):
//   bun scripts/render-svg.mjs og-image.svg og-image.png 1200 630
//   bun scripts/render-svg.mjs docs/infographic.svg docs/infographic.png 1200 1200
//
// We keep SVGs as source of truth (easy to edit by hand) and commit the rendered
// PNG alongside them for platforms that don't accept SVG (Facebook, WhatsApp,
// Twitter/X, LinkedIn previews).

import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , inputArg, outputArg, widthArg, heightArg] = process.argv;

if (!inputArg || !outputArg) {
  console.error('Usage: bun scripts/render-svg.mjs <input.svg> <output.png> [width] [height]');
  process.exit(1);
}

const input  = resolve(process.cwd(), inputArg);
const output = resolve(process.cwd(), outputArg);
const width  = Number(widthArg)  || 1200;
const height = Number(heightArg) || 1200;

const svg = readFileSync(input, 'utf8');

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width, height },
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
  const svgEl = page.locator('svg').first();
  const buffer = await svgEl.screenshot({ type: 'png', omitBackground: false });
  writeFileSync(output, buffer);

  console.log(`wrote ${outputArg} (${(buffer.length / 1024).toFixed(1)} KB, ${width}×${height})`);
} finally {
  await browser.close();
}
