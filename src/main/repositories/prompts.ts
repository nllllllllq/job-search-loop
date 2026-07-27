import type { DatabaseSync } from 'node:sqlite';
import type { PromptKind, PromptTemplate } from '../../shared/domain';
import { promptKindSchema, promptSaveSchema } from '../../shared/schemas';
import { notFound, row, text } from './common';

function decodePrompt(value: unknown): PromptTemplate {
  const data = row(value, 'prompt');
  return {
    id: text(data.id, 'id'),
    kind: promptKindSchema.parse(text(data.kind, 'kind')),
    name: text(data.name, 'name'),
    content: text(data.content, 'content'),
    createdAt: text(data.created_at, 'created_at'),
    updatedAt: text(data.updated_at, 'updated_at'),
  };
}

export interface PromptsRepository {
  list(): PromptTemplate[];
  get(kind: PromptKind): PromptTemplate;
  save(kind: PromptKind, content: string): PromptTemplate;
}

export function createPromptsRepository(db: DatabaseSync): PromptsRepository {
  const get = (kind: PromptKind): PromptTemplate => {
    const parsedKind = promptKindSchema.parse(kind);
    const value = db.prepare('SELECT * FROM prompt_templates WHERE kind = ?').get(parsedKind);
    if (value === undefined) notFound('Prompt template', parsedKind);
    return decodePrompt(value);
  };
  return {
    list() {
      return db.prepare('SELECT * FROM prompt_templates ORDER BY kind').all().map(decodePrompt);
    },
    get,
    save(kind, content) {
      const parsed = promptSaveSchema.parse({ kind, content });
      get(parsed.kind);
      db.prepare('UPDATE prompt_templates SET content = ?, updated_at = ? WHERE kind = ?')
        .run(parsed.content, new Date().toISOString(), parsed.kind);
      return get(parsed.kind);
    },
  };
}
