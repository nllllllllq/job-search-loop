import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = resolve('dist-electron/ocr/lang');
await mkdir(target, { recursive: true });
await Promise.all([
  cp(
    resolve('node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz'),
    resolve(target, 'eng.traineddata.gz'),
  ),
  cp(
    resolve('node_modules/@tesseract.js-data/chi_sim/4.0.0/chi_sim.traineddata.gz'),
    resolve(target, 'chi_sim.traineddata.gz'),
  ),
]);
