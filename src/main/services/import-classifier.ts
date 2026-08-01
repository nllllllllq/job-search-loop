import { randomUUID } from 'node:crypto';
import type {
  ProjectImportField,
  ProjectImportFieldValue,
  ProjectInput,
  ProjectSegmentPreview,
} from '../../shared/domain';

const FIELD_RULES: Array<[keyof ProjectInput, RegExp]> = [
  ['background', /^(?:背景|项目背景)\s*[:：]\s*(.+)$/i],
  ['goal', /^(?:目标|项目目标)\s*[:：]\s*(.+)$/i],
  ['role', /^(?:角色|我的角色|职责)\s*[:：]\s*(.+)$/i],
  ['keyDecisions', /^(?:关键决策|决策|方案)\s*[:：]\s*(.+)$/i],
  ['outcome', /^(?:结果|成果|产出)\s*[:：]\s*(.+)$/i],
  ['evidence', /^(?:证据|数据|指标)\s*[:：]\s*(.+)$/i],
  ['reflections', /^(?:反思|复盘|经验)\s*[:：]\s*(.+)$/i],
  ['storytellingVersions', /^(?:讲述版本|面试讲述)\s*[:：]\s*(.+)$/i],
];

function emptyProject(name: string): ProjectInput {
  return {
    name,
    background: '',
    goal: '',
    role: '',
    keyDecisions: '',
    outcome: '',
    evidence: '',
    reflections: '',
    storytellingVersions: '',
    unclassifiedNotes: '',
  };
}

const projectFields: ProjectImportField[] = [
  'name', 'background', 'goal', 'role', 'keyDecisions', 'outcome', 'evidence',
  'reflections', 'storytellingVersions', 'unclassifiedNotes',
];

function emptyFields(project: ProjectInput): Record<ProjectImportField, ProjectImportFieldValue> {
  return Object.fromEntries(projectFields.map((field) => [field, {
    value: project[field] ?? '',
    provenance: field === 'name' ? 'source' : 'ai-suggestion',
    evidence: field === 'name' ? project.name : '',
  }])) as Record<ProjectImportField, ProjectImportFieldValue>;
}

function mapSegment(
  name: string,
  sourceText: string,
  boundaries: { startLine: number; endLine: number } = { startLine: 1, endLine: sourceText.split('\n').length },
): ProjectSegmentPreview {
  const suggested = emptyProject(name);
  const fields = emptyFields(suggested);
  const unmatched: string[] = [];
  for (const line of sourceText.split('\n').map((item) => item.trim()).filter(Boolean)) {
    if (/^#{1,6}\s+/.test(line) || line === name) continue;
    const rule = FIELD_RULES.find(([, pattern]) => pattern.test(line));
    if (rule) {
      const [, pattern] = rule;
      const match = line.match(pattern);
      const key = rule[0];
      const value = `${suggested[key] ? `${suggested[key]}\n` : ''}${match?.[1]?.trim() ?? ''}`;
      suggested[key] = value;
      fields[key] = { value, provenance: 'source', evidence: line };
    } else {
      unmatched.push(line);
    }
  }
  suggested.unclassifiedNotes = unmatched.join('\n');
  fields.unclassifiedNotes = {
    value: suggested.unclassifiedNotes,
    provenance: suggested.unclassifiedNotes ? 'source' : 'ai-suggestion',
    evidence: suggested.unclassifiedNotes,
  };
  return {
    tempId: randomUUID(),
    name,
    sourceText,
    suggested,
    boundaries,
    fields,
    missingFields: projectFields.filter((field) => field !== 'name' && !suggested[field]),
    unusedContent: unmatched.map((content) => ({ content, reason: '未匹配到项目字段' })),
    warnings: unmatched.length ? ['部分内容已放入“待整理内容”'] : [],
  };
}

export function classifyProjectText(text: string): ProjectSegmentPreview[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const heading = /^(?:#{1,6}\s+)(.+)$/gm;
  const matches = [...normalized.matchAll(heading)];
  if (matches.length === 0) return [mapSegment('导入项目', normalized)];
  return matches.slice(0, 30).map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? normalized.length;
    const sourceText = normalized.slice(start, end).trim();
    const startLine = normalized.slice(0, start).split('\n').length;
    return mapSegment(match[1]!.trim(), sourceText, {
      startLine,
      endLine: startLine + sourceText.split('\n').length - 1,
    });
  });
}

export function mergeProjectSegments(
  segments: ProjectSegmentPreview[],
  tempId: string,
): ProjectSegmentPreview[] {
  const index = segments.findIndex((item) => item.tempId === tempId);
  if (index < 0 || index >= segments.length - 1) return segments;
  const current = segments[index]!;
  const next = segments[index + 1]!;
  const merged = mapSegment(current.name, `${current.sourceText}\n\n${next.sourceText}`, {
    startLine: current.boundaries.startLine,
    endLine: next.boundaries.endLine,
  });
  merged.tempId = current.tempId;
  return [...segments.slice(0, index), merged, ...segments.slice(index + 2)];
}

export function splitProjectSegment(
  segments: ProjectSegmentPreview[],
  tempId: string,
  marker: string,
): ProjectSegmentPreview[] {
  const index = segments.findIndex((item) => item.tempId === tempId);
  if (index < 0 || !marker.trim()) return segments;
  const target = segments[index]!;
  const splitAt = target.sourceText.indexOf(marker);
  if (splitAt <= 0) return segments;
  const first = mapSegment(target.name, target.sourceText.slice(0, splitAt).trim());
  first.tempId = target.tempId;
  const second = mapSegment(`${target.name}（补充）`, target.sourceText.slice(splitAt).trim());
  return [...segments.slice(0, index), first, second, ...segments.slice(index + 1)];
}

export function reorderProjectSegments(
  segments: ProjectSegmentPreview[],
  orderedIds: string[],
): ProjectSegmentPreview[] {
  if (
    orderedIds.length !== segments.length
    || new Set(orderedIds).size !== segments.length
  ) return segments;
  const byId = new Map(segments.map((item) => [item.tempId, item]));
  if (orderedIds.some((id) => !byId.has(id))) return segments;
  return orderedIds.map((id) => byId.get(id)!);
}

export function renameProjectSegment(
  segments: ProjectSegmentPreview[],
  tempId: string,
  name: string,
): ProjectSegmentPreview[] {
  return segments.map((item) => item.tempId === tempId
    ? {
      ...item,
      name: name.trim(),
      suggested: { ...item.suggested, name: name.trim() },
      fields: { ...item.fields, name: { value: name.trim(), provenance: 'source', evidence: item.fields.name.evidence } },
    }
    : item);
}
