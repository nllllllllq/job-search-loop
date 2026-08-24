import { randomUUID } from 'node:crypto';

export type ImportSessionKind = 'position' | 'project';

type Entry = {
  kind: ImportSessionKind;
  value: unknown;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
};

export class ImportSessionError extends Error {
  constructor(message = '导入预览已失效，请重新导入') {
    super(message);
    this.name = 'ImportSessionError';
  }
}

export interface ImportSessionService {
  create<T>(kind: ImportSessionKind, value: T): string;
  get<T>(id: string, kind: ImportSessionKind): T;
  update<T>(id: string, kind: ImportSessionKind, value: T): void;
  consume<T>(id: string, kind: ImportSessionKind): T;
  cancel(id: string): void;
  size(): number;
}

export function createImportSessionService(options?: {
  ttlMs?: number;
  now?: () => number;
}): ImportSessionService {
  const ttlMs = options?.ttlMs ?? 15 * 60_000;
  const now = options?.now ?? Date.now;
  const entries = new Map<string, Entry>();

  const remove = (id: string) => {
    const entry = entries.get(id);
    if (entry) clearTimeout(entry.timer);
    entries.delete(id);
  };

  const read = <T>(id: string, kind: ImportSessionKind): T => {
    const entry = entries.get(id);
    if (!entry || entry.kind !== kind || entry.expiresAt <= now()) {
      remove(id);
      throw new ImportSessionError();
    }
    return entry.value as T;
  };

  return {
    create(kind, value) {
      const id = randomUUID();
      const timer = setTimeout(() => entries.delete(id), ttlMs);
      timer.unref?.();
      entries.set(id, { kind, value, expiresAt: now() + ttlMs, timer });
      return id;
    },
    get<T>(id: string, kind: ImportSessionKind) {
      return read<T>(id, kind);
    },
    update(id, kind, value) {
      read(id, kind);
      const entry = entries.get(id)!;
      entry.value = value;
    },
    consume<T>(id: string, kind: ImportSessionKind) {
      const value = read<T>(id, kind);
      remove(id);
      return value;
    },
    cancel: remove,
    size: () => entries.size,
  };
}
