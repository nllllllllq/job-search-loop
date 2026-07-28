import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createLocalTesseractOcrService } = require('../dist-electron/main/services/ocr.js');

const glyphs = {
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
};
const width = 190;
const height = 76;
const scale = 7;
const pixels = Buffer.alloc(width * height * 4, 255);
let cursor = 16;
for (const letter of 'JOB') {
  const rows = glyphs[letter];
  rows.forEach((row, y) => [...row].forEach((bit, x) => {
    if (bit !== '1') return;
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < scale; dx += 1) {
        const offset = (((12 + y * scale + dy) * width) + cursor + x * scale + dx) * 4;
        pixels[offset] = 0;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 0;
      }
    }
  }));
  cursor += 6 * scale;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
const scanlines = Buffer.alloc((width * 4 + 1) * height);
for (let y = 0; y < height; y += 1) {
  const row = y * (width * 4 + 1);
  scanlines[row] = 0;
  pixels.copy(scanlines, row + 1, y * width * 4, (y + 1) * width * 4);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(scanlines)),
  chunk('IEND', Buffer.alloc(0)),
]);

const service = await createLocalTesseractOcrService(resolve('dist-electron/ocr/lang'));
try {
  const result = await service.preview([
    { name: 'offline-smoke.png', type: 'image/png', bytes: png, width, height },
  ]);
  if (!result.text.toUpperCase().includes('JOB')) {
    throw new Error(`Offline OCR returned unexpected text: ${JSON.stringify(result.text)}`);
  }
  process.stdout.write(`Offline OCR OK: ${result.text.trim()}\n`);
} finally {
  await service.dispose();
}
