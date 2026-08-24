import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { CHANNELS } from '../../shared/ipc';
import {
  importCancelSchema,
  positionImportImagesSchema,
  positionImportTextSchema,
  projectImportDocumentSchema,
  projectSegmentsUpdateSchema,
} from '../../shared/schemas';
import type {
  PositionImportPreview,
  ProjectImportPreview,
  ProjectSegmentPreview,
} from '../../shared/domain';
import { extractDocumentText } from '../services/document-import';
import {
  analyzeProjectImport,
  type ProjectImportAiDependencies,
} from '../services/project-import-ai';
import {
  mergeProjectSegments,
  renameProjectSegment,
  reorderProjectSegments,
  splitProjectSegment,
} from '../services/import-classifier';
import {
  createImportSessionService,
  ImportSessionError,
  type ImportSessionService,
} from '../services/import-sessions';
import {
  createLocalTesseractOcrService,
  type OcrService,
} from '../services/ocr';
import { previewPositionFromText } from '../services/position-import';
import { createPositionImageImportService } from '../services/position-image-import';
import { AiServiceError } from '../services/ai-settings';
import { SafeIpcError, safeIpcHandler, type IpcMainRegistrar } from './common';

type StoredProjectPreview = Omit<ProjectImportPreview, 'sessionId'>;
type StoredPositionPreview = Omit<PositionImportPreview, 'sessionId'>;

export interface ImportRuntime {
  sessions?: ImportSessionService;
  createOcr?: () => Promise<OcrService>;
  ai?: ProjectImportAiDependencies['ai'];
  getSettings?: ProjectImportAiDependencies['getSettings'];
  prompts?: ProjectImportAiDependencies['prompts'];
}

function userFacing(error: unknown): never {
  if (error instanceof SafeIpcError) throw error;
  if (error instanceof AiServiceError) throw error;
  if (error instanceof ZodError) {
    throw new SafeIpcError('VALIDATION_ERROR', error.issues[0]?.message ?? 'Invalid request');
  }
  if (error instanceof ImportSessionError) {
    throw new SafeIpcError('NOT_FOUND', error.message);
  }
  throw new SafeIpcError(
    'VALIDATION_ERROR',
    error instanceof Error ? error.message : '导入内容无法识别',
  );
}

export function defaultOcrAssetPath(): string {
  const packaged = join(process.resourcesPath || '', 'ocr/lang');
  return existsSync(packaged)
    ? packaged
    : join(process.cwd(), 'dist-electron/ocr/lang');
}

export function registerImportHandlers(
  ipcMain: IpcMainRegistrar,
  runtime: ImportRuntime = {},
): void {
  const sessions = runtime.sessions ?? createImportSessionService();
  let ocrPromise: Promise<OcrService> | null = null;
  const getOcr = () => {
    ocrPromise ??= runtime.createOcr?.()
      ?? createLocalTesseractOcrService(defaultOcrAssetPath());
    return ocrPromise;
  };
  const positionImageImport = runtime.ai && runtime.getSettings && runtime.prompts
    ? createPositionImageImportService({
      ai: runtime.ai as unknown as Parameters<typeof createPositionImageImportService>[0]['ai'],
      getSettings: runtime.getSettings,
      prompts: runtime.prompts,
    })
    : undefined;

  ipcMain.handle(CHANNELS.imports.previewPositionFromText, safeIpcHandler(async (_event, payload) => {
    try {
      const { text } = positionImportTextSchema.parse(payload);
      const preview = previewPositionFromText(text);
      const sessionId = sessions.create('position', preview);
      return { sessionId, ...preview };
    } catch (error) {
      return userFacing(error);
    }
  }));

  ipcMain.handle(CHANNELS.imports.previewPositionFromImages, safeIpcHandler(async (_event, payload) => {
    try {
      const { images, mode } = positionImportImagesSchema.parse(payload);
      if (!positionImageImport) {
        throw new AiServiceError('AI_NOT_CONFIGURED', 'AI image import is not configured.');
      }
      const recognized = mode === 'vision'
        ? await positionImageImport.preview(images)
        : await (async () => {
          const ocr = await getOcr();
          const extracted = await ocr.preview(images);
          const structured = await positionImageImport.previewText(extracted.text);
          return {
            ...structured,
            warnings: extracted.averageConfidence < 70
              ? ['截图 OCR 置信度较低，请逐项检查', ...structured.warnings]
              : structured.warnings,
          };
        })();
      const preview: StoredPositionPreview = {
        sourceSummary: mode === 'vision'
          ? `${images.length} 张截图，已由 AI 按当前顺序识别`
          : `${images.length} 张截图，已由本地 OCR 提取并由 AI 结构化`,
        suggested: {
          company: recognized.company,
          title: recognized.title,
          location: recognized.location,
          interest: 3,
          rawJd: recognized.rawJd,
        },
        confidence: recognized.confidence,
        warnings: recognized.warnings,
      };
      const sessionId = sessions.create('position', preview);
      return { sessionId, ...preview };
    } catch (error) {
      return userFacing(error);
    }
  }));

  ipcMain.handle(CHANNELS.imports.previewProjectsFromDocument, safeIpcHandler(async (_event, payload) => {
    try {
      const { file, mode } = projectImportDocumentSchema.parse(payload);
      const extracted = await extractDocumentText(file);
      if (!extracted.text) throw new Error(extracted.warnings[0] ?? '文件中没有可提取文字');
      const aiDependencies = runtime.ai && runtime.getSettings && runtime.prompts
        ? {
          ai: runtime.ai,
          getSettings: runtime.getSettings,
          prompts: runtime.prompts,
        }
        : undefined;
      const analyzed = await analyzeProjectImport(extracted.text, mode, aiDependencies);
      const preview: StoredProjectPreview = {
        sourceSummary: `${file.name} · ${analyzed.segments.length} 个候选项目`,
        ...analyzed,
        warnings: [...extracted.warnings, ...analyzed.warnings],
      };
      const sessionId = sessions.create('project', preview);
      return { sessionId, ...preview };
    } catch (error) {
      return userFacing(error);
    }
  }));

  ipcMain.handle(CHANNELS.imports.updateProjectSegments, safeIpcHandler(async (_event, payload) => {
    try {
      const { sessionId, operation } = projectSegmentsUpdateSchema.parse(payload);
      const current = sessions.get<StoredProjectPreview>(sessionId, 'project');
      let segments: ProjectSegmentPreview[] = current.segments;
      switch (operation.type) {
        case 'rename':
          segments = renameProjectSegment(segments, operation.tempId, operation.name);
          break;
        case 'merge-next':
          segments = mergeProjectSegments(segments, operation.tempId);
          break;
        case 'split':
          segments = splitProjectSegment(segments, operation.tempId, operation.marker);
          break;
        case 'reorder':
          segments = reorderProjectSegments(segments, operation.orderedIds);
          break;
        case 'remove':
          segments = segments.filter((item) => item.tempId !== operation.tempId);
          break;
      }
      if (segments.length === 0) throw new Error('至少保留一个项目');
      const next = { ...current, segments };
      sessions.update(sessionId, 'project', next);
      return { sessionId, ...next };
    } catch (error) {
      return userFacing(error);
    }
  }));

  ipcMain.handle(CHANNELS.imports.cancel, safeIpcHandler((_event, payload) => {
    const { sessionId } = importCancelSchema.parse(payload);
    sessions.cancel(sessionId);
  }));
}
