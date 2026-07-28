import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
const resources = packageJson.build?.extraResources;
const hasOcrResource = Array.isArray(resources) && resources.some(
  (resource) => resource?.from === 'dist-electron/ocr' && resource?.to === 'ocr',
);

if (!hasOcrResource) {
  throw new Error('package.json 未配置 dist-electron/ocr -> ocr 的 extraResources');
}

for (const language of ['eng', 'chi_sim']) {
  const path = resolve('dist-electron', 'ocr', 'lang', `${language}.traineddata.gz`);
  const details = await stat(path).catch(() => null);
  if (!details?.isFile() || details.size === 0) {
    throw new Error(`离线 OCR 语言数据缺失或为空：${path}`);
  }
  process.stdout.write(`${language}: ${details.size} bytes\n`);
}

process.stdout.write('OCR build resources verified.\n');
