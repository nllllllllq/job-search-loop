import type { ImportedImageInput } from '../../shared/domain';

export type OcrRecognition = { text: string; confidence: number };
export type OcrRecognizer = (
  bytes: Uint8Array,
  onProgress?: (value: number) => void,
) => Promise<OcrRecognition>;

export type OcrPreviewResult = {
  text: string;
  averageConfidence: number;
};

export interface OcrService {
  preview(
    images: ImportedImageInput[],
    options?: { onProgress?: (value: number) => void; signal?: AbortSignal },
  ): Promise<OcrPreviewResult>;
  dispose(): Promise<void>;
}

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

export function createOcrService(options: {
  recognize: OcrRecognizer;
  dispose?: () => Promise<void>;
}): OcrService {
  return {
    async preview(images, requestOptions) {
      if (images.length < 1 || images.length > 10) throw new Error('请选择 1–10 张截图');
      let pixels = 0;
      for (const image of images) {
        if (image.bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('单张图片不能超过 12 MB');
        pixels += image.width * image.height;
      }
      if (pixels > MAX_PIXELS) throw new Error('图片总像素不能超过 4000 万');
      const text: string[] = [];
      const confidences: number[] = [];
      for (let index = 0; index < images.length; index += 1) {
        if (requestOptions?.signal?.aborted) throw new Error('识别已取消');
        const result = await options.recognize(images[index]!.bytes, (fraction) => {
          requestOptions?.onProgress?.(
            Math.round(((index + Math.max(0, Math.min(1, fraction))) / images.length) * 100),
          );
        });
        text.push(result.text.trim());
        confidences.push(result.confidence);
        requestOptions?.onProgress?.(Math.round(((index + 1) / images.length) * 100));
      }
      return {
        text: text.filter(Boolean).join('\n\n'),
        averageConfidence: confidences.length
          ? confidences.reduce((total, value) => total + value, 0) / confidences.length
          : 0,
      };
    },
    dispose: options.dispose ?? (async () => undefined),
  };
}

export async function createLocalTesseractOcrService(
  langPath: string,
): Promise<OcrService> {
  const { createWorker, OEM } = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let activeProgress: ((value: number) => void) | undefined;
  worker = await createWorker(['eng', 'chi_sim'], OEM.LSTM_ONLY, {
    langPath,
    cacheMethod: 'none',
    gzip: true,
    logger(message) {
      if (message.status === 'recognizing text') activeProgress?.(message.progress);
    },
  });
  return createOcrService({
    async recognize(bytes, onProgress) {
      activeProgress = onProgress;
      try {
        const result = await worker!.recognize(Buffer.from(bytes));
        return { text: result.data.text, confidence: result.data.confidence };
      } finally {
        activeProgress = undefined;
      }
    },
    async dispose() {
      if (worker) await worker.terminate();
      worker = null;
    },
  });
}
