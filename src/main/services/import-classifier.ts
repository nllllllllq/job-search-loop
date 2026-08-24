import { randomUUID } from 'node:crypto';
import type {
  ProjectImportField,
  ProjectImportFieldValue,
  ProjectInput,
  ProjectSegmentPreview,
} from '../../shared/domain';

const projectFields: readonly ProjectImportField[] = [
  'name', 'projectTime', 'background', 'goal', 'role', 'keyDecisions', 'outcome', 'evidence',
  'reflections', 'storytellingVersions', 'unclassifiedNotes',
];

function blankSegment(
  sourceText: string,
  boundaries: { startLine: number; endLine: number },
): ProjectSegmentPreview {
  const suggested: ProjectInput = {
    name: '',
    projectTime: '',
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
  const fields = Object.fromEntries(projectFields.map((field) => [field, {
    value: '',
    provenance: 'ai-suggestion',
    evidence: '',
  }])) as Record<ProjectImportField, ProjectImportFieldValue>;
  return {
    tempId: randomUUID(),
    name: '',
    sourceText,
    suggested,
    boundaries,
    fields,
    missingFields: [...projectFields],
    unusedContent: [],
    warnings: ['新分段的字段需要重新确认'],
  };
}

function lineCount(value: string): number {
  return Math.max(1, value.split(/\r?\n/).length);
}

function splitBoundaries(
  target: ProjectSegmentPreview,
  sourceBeforeMarker: string,
  secondSource: string,
): [{ startLine: number; endLine: number }, { startLine: number; endLine: number }] {
  const markerLine = target.boundaries.startLine
    + (sourceBeforeMarker.match(/\r?\n/g)?.length ?? 0);
  const markerStartsNewLine = /(?:^|\r?\n)\s*$/.test(sourceBeforeMarker);
  const firstEndLine = markerStartsNewLine ? markerLine - 1 : markerLine;
  const secondStartLine = markerStartsNewLine ? markerLine : markerLine + 1;
  return [
    {
      startLine: target.boundaries.startLine,
      endLine: Math.max(target.boundaries.startLine, firstEndLine),
    },
    {
      startLine: secondStartLine,
      endLine: secondStartLine + lineCount(secondSource) - 1,
    },
  ];
}

/**
 * Merging is a review operation over an AI preview, not a second parser pass.
 * Keep the first segment's audited fields and append only raw source metadata.
 */
export function mergeProjectSegments(
  segments: ProjectSegmentPreview[],
  tempId: string,
): ProjectSegmentPreview[] {
  const index = segments.findIndex((item) => item.tempId === tempId);
  if (index < 0 || index >= segments.length - 1) return segments;
  const current = segments[index]!;
  const next = segments[index + 1]!;
  const sourceText = [current.sourceText, next.sourceText]
    .filter((value) => value.length > 0)
    .join('\n\n');
  const merged: ProjectSegmentPreview = {
    ...current,
    sourceText,
    boundaries: {
      startLine: current.boundaries.startLine,
      endLine: next.boundaries.endLine,
    },
    unusedContent: [...current.unusedContent, ...next.unusedContent],
    warnings: [...new Set([...current.warnings, ...next.warnings])],
  };
  return [...segments.slice(0, index), merged, ...segments.slice(index + 2)];
}

/**
 * Splitting only changes raw-source boundaries. The first piece keeps the AI
 * audit unchanged; the new second piece is deliberately blank until AI or the
 * user supplies fields, so no local keyword classifier can invent facts.
 */
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
  const sourceBeforeMarker = target.sourceText.slice(0, splitAt);
  const firstSource = sourceBeforeMarker.trim();
  const secondSource = target.sourceText.slice(splitAt).trim();
  if (!firstSource || !secondSource) return segments;
  const [firstBoundaries, secondBoundaries] = splitBoundaries(
    target,
    sourceBeforeMarker,
    secondSource,
  );
  const first: ProjectSegmentPreview = {
    ...target,
    sourceText: firstSource,
    boundaries: firstBoundaries,
  };
  const second = blankSegment(secondSource, secondBoundaries);
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
