// Render an SVG file to PNG using @resvg/resvg-js (Rust + NAPI).
//
// No browser required — runs in milliseconds, works on Linux / macOS / Windows
// and on both Node and Bun. Replaces an earlier Playwright-based renderer that
// timed out on Windows + Bun due to a known Chromium launch issue.
//
// Usage:
//   bun scripts/render-svg.mjs <input.svg> <output.png> [width] [height]
//
// Examples (also wired up as npm scripts in package.json):
//   bun run build:og            # og-image.svg → og-image.png at 1200×630
//   bun run build:infographic   # docs/infographic.svg → docs/infographic.png at 1200×1200
//   bun run build:images        # both, in sequence

import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , inputArg, outputArg, widthArg] = process.argv;

if (!inputArg || !outputArg) {
  console.error('Usage: bun scripts/render-svg.mjs <input.svg> <output.png> [width]');
  process.exit(1);
}

const input  = resolve(process.cwd(), inputArg);
const output = resolve(process.cwd(), outputArg);
const width  = Number(widthArg) || undefined;

const svg = readFileSync(input, 'utf8');

const resvg = new Resvg(svg, {
  // Keep aspect ratio: setting width also scales height proportionally.
  fitTo: width ? { mode: 'width', value: width } : { mode: 'original' },
  font: {
    // Use whatever sans-serif the host machine has. Sufficient for the simple
    // text we render. If we ever need pixel-perfect cross-platform fonts, swap
    // for a bundled woff2 via `fontFiles`.
    loadSystemFonts: true,
    defaultFontFamily: 'Arial',
  },
});
const png = resvg.render().asPng();
writeFileSync(output, png);

const sizeKB = (png.length / 1024).toFixed(1);
console.log(`wrote ${outputArg} (${sizeKB} KB)`);
