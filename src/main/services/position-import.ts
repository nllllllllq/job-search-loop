import type { PositionImportPreview, PositionInput } from '../../shared/domain';

type FieldKey = 'company' | 'title' | 'location';

const FIELD_PATTERNS: Record<FieldKey, RegExp[]> = {
  company: [/^(?:公司|企业|company|employer)\s*[:：]\s*(.+)$/i],
  title: [/^(?:岗位|职位|岗位名称|职位名称|job title|position)\s*[:：]\s*(.+)$/i],
  location: [/^(?:地点|位置|工作地点|城市|location)\s*[:：]\s*(.+)$/i],
};

function pickField(lines: string[], key: FieldKey): { value: string; confidence: number } {
  for (const line of lines.slice(0, 30)) {
    for (const pattern of FIELD_PATTERNS[key]) {
      const match = line.match(pattern);
      if (match?.[1]?.trim()) return { value: match[1].trim().slice(0, 200), confidence: 0.95 };
    }
  }
  const candidates = lines.slice(0, 12);
  const patterns: Record<FieldKey, RegExp> = {
    company: /(?:有限公司|公司|集团|科技|studio|inc\.?|ltd\.?)/i,
    title: /(?:产品经理|工程师|设计师|分析师|运营|开发|研究员|顾问|负责人|manager|engineer|designer|analyst)/i,
    location: /(?:北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|远程|remote|hybrid)/i,
  };
  const heuristic = candidates.find((line) => (
    line.length <= 120
    && patterns[key].test(line)
    && !(key === 'company' && /(?:岗位职责|职位描述|关于公司)/.test(line))
  ));
  if (heuristic) {
    const value = heuristic
      .split(/[|｜·]/)
      .map((part) => part.trim())
      .find((part) => patterns[key].test(part)) ?? heuristic;
    return { value: value.slice(0, 200), confidence: 0.65 };
  }
  return { value: '', confidence: 0.25 };
}

export function previewPositionFromText(text: string): Omit<PositionImportPreview, 'sessionId'> {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const rawJd = normalized.slice(0, 100_000);
  const lines = rawJd.split('\n').map((line) => line.trim()).filter(Boolean);
  const company = pickField(lines, 'company');
  const title = pickField(lines, 'title');
  const location = pickField(lines, 'location');
  const warnings: string[] = [];
  if (!company.value) warnings.push('未能可靠识别公司，请手动补充');
  if (!title.value) warnings.push('未能可靠识别岗位名称，请手动补充');
  if (!location.value) warnings.push('未能可靠识别工作地点');
  if (rawJd.length < 80) warnings.push('识别到的 JD 较短，请确认内容是否完整');
  if (normalized.length > rawJd.length) warnings.push('识别文本超过 100,000 字，已保留前 100,000 字');

  const suggested: PositionInput = {
    company: company.value,
    title: title.value,
    location: location.value,
    interest: 3,
    rawJd,
  };
  return {
    sourceSummary: `${lines.length} 行文本`,
    suggested,
    confidence: {
      company: company.confidence,
      title: title.confidence,
      location: location.confidence,
      rawJd: rawJd.length >= 80 ? 0.9 : 0.55,
    },
    warnings,
  };
}
