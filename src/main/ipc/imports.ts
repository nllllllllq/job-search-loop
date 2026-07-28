import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
  classifyProjectText,
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
import { SafeIpcError, safeIpcHandler, type IpcMainRegistrar } from './common';

type StoredProjectPreview = Omit<ProjectImportPreview, 'sessionId'>;
type StoredPositionPreview = Omit<PositionImportPreview, 'sessionId'>;

export interface ImportRuntime {
  sessions?: ImportSessionService;
  createOcr?: () => Promise<OcrService>;
}

function userFacing(error: unknown): never {
  if (error instanceof SafeIpcError) throw error;
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
      const { images } = positionImportImagesSchema.parse(payload);
      const ocr = await getOcr();
      const recognized = await ocr.preview(images);
      const base = previewPositionFromText(recognized.text);
      const warnings = recognized.averageConfidence < 70
        ? ['截图识别置信度较低，请逐项检查', ...base.warnings]
        : base.warnings;
      const preview: StoredPositionPreview = {
        ...base,
        sourceSummary: `${images.length} 张截图，本地 OCR 平均置信度 ${Math.round(recognized.averageConfidence)}%`,
        warnings,
      };
      const sessionId = sessions.create('position', preview);
      return { sessionId, ...preview };
    } catch (error) {
      return userFacing(error);
    }
  }));

  ipcMain.handle(CHANNELS.imports.previewProjectsFromDocument, safeIpcHandler(async (_event, payload) => {
    try {
      const { file } = projectImportDocumentSchema.parse(payload);
      const extracted = await extractDocumentText(file);
      if (!extracted.text) throw new Error(extracted.warnings[0] ?? '文件中没有可提取文字');
      const segments = classifyProjectText(extracted.text);
      const preview: StoredProjectPreview = {
        sourceSummary: `${file.name} · ${segments.length} 个候选项目`,
        segments,
        warnings: extracted.warnings,
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
