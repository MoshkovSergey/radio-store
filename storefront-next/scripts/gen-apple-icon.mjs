// Одноразовая генерация app/apple-icon.png из app/icon.svg.
// SVG не работает как apple touch icon на iOS/старом Safari, поэтому
// растеризуем вектор в PNG 180x180 тем же resvg, что и для favicon.
//
// Запуск (dev-зависимость ставится только для генерации):
//   npm i -D @resvg/resvg-js
//   node scripts/gen-apple-icon.mjs
//
// После генерации dev-зависимость можно удалить: npm rm @resvg/resvg-js

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, '..', 'app');

const svgPath = join(appDir, 'icon.svg');
const outPath = join(appDir, 'apple-icon.png');

const svg = readFileSync(svgPath, 'utf8');

// 180x180 — канонический размер apple-touch-icon.
const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 180 },
  background: 'rgba(0,0,0,0)',
});

const png = resvg.render().asPng();

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, png);

console.log(`OK: ${outPath} (${png.length} bytes)`);