import { createHash } from 'node:crypto';
import { ImapFlow, type ImapFlowOptions, type MessageStructureObject } from 'imapflow';
import type {
  CanonicalStage,
  EmailConnectionResult,
  EmailSettingsPrivate,
  EmailSyncResult,
  PositionDetail,
  ProcessStage,
} from '../../shared/domain';
import { DEFAULT_PROCESS_STAGES } from '../../shared/defaults';
import type { EmailSyncEventInput, EmailSyncRepository } from '../repositories/email-sync';
import type { PositionsRepository } from '../repositories/positions';
import type { EmailSettingsStore, EmailSyncState } from './email-settings';

export interface EmailInboundMessage {
  uid?: number;
  messageKey: string;
  subject: string;
  sender: string;
  receivedAt: string;
  text: string;
}

interface EmailFetchedMessage extends EmailInboundMessage {
  uid?: number;
}

export interface EmailSyncServiceDependencies {
  events: EmailSyncRepository;
  positions: Pick<PositionsRepository, 'list' | 'getDetail' | 'upsertStage'>;
  settings: EmailSettingsStore;
  fetchMessages?: (
    settings: EmailSettingsPrivate,
    lastUid: number,
  ) => Promise<EmailFetchedMessage[]>;
  now?: () => Date;
}

export interface EmailSyncService {
  syncNow(): Promise<EmailSyncResult>;
  testConnection(): Promise<EmailConnectionResult>;
  listRecent(limit?: number): ReturnType<EmailSyncRepository['listRecent']>;
}

const STAGE_NAMES: Record<CanonicalStage, string> = {
  interested: '感兴趣',
  applied: '已投递',
  assessment: '测评',
  interview: '面试',
  offer: 'Offer',
  rejected: '未通过',
  withdrawn: '已撤回',
};

const RULES: Array<{ stage: CanonicalStage; patterns: RegExp[] }> = [
  {
    stage: 'rejected',
    patterns: [/rejected|reject|declin|not selected|unsuccessful|regret|未通过|拒绝|遗憾|不合适/iu],
  },
  {
    stage: 'offer',
    patterns: [/\boffer\b|正式录用|录用通知|聘用通知|入职邀请/iu],
  },
  {
    stage: 'interview',
    patterns: [/interview|面试|视频面试|现场面试|面谈/iu],
  },
  {
    stage: 'assessment',
    patterns: [/assessment|测试|测评|笔试|在线测验|作业题/iu],
  },
  {
    stage: 'applied',
    patterns: [/application received|application submitted|收到.*申请|申请.*收到|投递成功|已收到.*简历|感谢申请/iu],
  },
];

function classifyStage(text: string): CanonicalStage | null {
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) return rule.stage;
  }
  return null;
}

function normalizeMatch(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

const MAX_BODY_TEXT_BYTES = 200_000;
const MAX_EVENT_TEXT_LENGTH = 500;
const GENERIC_SYNC_ERROR = '邮箱同步失败';

function boundedText(value: string): string {
  return value.slice(0, MAX_EVENT_TEXT_LENGTH);
}

function boundedMessageKey(value: string): string {
  if (value.length <= MAX_EVENT_TEXT_LENGTH) return value;
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 32);
  return `${value.slice(0, MAX_EVENT_TEXT_LENGTH - digest.length - 1)}:${digest}`;
}

function bodyTextParts(structure: MessageStructureObject | undefined): string[] {
  if (!structure) return [];
  if (structure.disposition?.toLocaleLowerCase() === 'attachment') return [];
  if (structure.childNodes?.length) return structure.childNodes.flatMap(bodyTextParts);
  const type = structure.type.toLocaleLowerCase();
  if (
    (type === 'text/plain' || type === 'text/html')
    && structure.disposition?.toLocaleLowerCase() !== 'attachment'
  ) {
    return [structure.part ?? '1'];
  }
  return [];
}

function decodeText(buffer: Buffer, maxBytes: number): string {
  let text = buffer.toString('utf8');
  while (Buffer.byteLength(text, 'utf8') > maxBytes) text = text.slice(0, -1);
  return text;
}

async function readTextPart(
  client: ImapFlow,
  uid: number,
  part: string,
  maxBytes: number,
): Promise<string> {
  if (maxBytes <= 0) return '';
  const downloaded = await client.download(String(uid), part, {
    uid: true,
    maxBytes,
  });
  if (!downloaded.content) return '';
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of downloaded.content) {
    if (total >= maxBytes) break;
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const bounded = chunk.subarray(0, maxBytes - total);
    chunks.push(bounded);
    total += bounded.length;
  }
  return decodeText(Buffer.concat(chunks), maxBytes);
}

const STAGE_ORDER: CanonicalStage[] = [
  'interested',
  ...DEFAULT_PROCESS_STAGES.map((stage) => stage.canonicalStage),
  'rejected',
  'withdrawn',
];

function stageOrder(canonicalStage: CanonicalStage): number {
  return STAGE_ORDER.indexOf(canonicalStage);
}

function localDate(value: string, now: Date): string {
  const parsed = new Date(value);
  const date = Number.isNaN(parsed.valueOf()) ? now : parsed;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function stageDateInput(stage: CanonicalStage, date: string): Pick<ProcessStage, 'actualDate' | 'expectedDate'> {
  return stage === 'assessment' || stage === 'interview'
    ? { actualDate: null, expectedDate: date }
    : { actualDate: date, expectedDate: null };
}

async function fetchViaImap(
  settings: EmailSettingsPrivate,
  lastUid: number,
): Promise<EmailFetchedMessage[]> {
  const options: ImapFlowOptions = {
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.username, pass: settings.password },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    emitLogs: false,
  };
  const client = new ImapFlow(options);
  try {
    await client.connect();
    await client.mailboxOpen('INBOX', { readOnly: true });
    const range = lastUid > 0
      ? await client.search({ uid: `${lastUid + 1}:*` }, { uid: true })
      : await client.search({ since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000) }, { uid: true });
    const uids = (range === false ? [] : [...range]).sort((left, right) => left - right).slice(0, 50);
    if (uids.length === 0) return [];
    const messages: EmailFetchedMessage[] = [];
    for await (const item of client.fetch(uids, {
      uid: true,
      envelope: true,
      internalDate: true,
      bodyStructure: true,
    }, { uid: true })) {
      const receivedDate = new Date(item.internalDate ?? item.envelope?.date ?? new Date());
      const receivedAt = Number.isNaN(receivedDate.valueOf()) ? new Date().toISOString() : receivedDate.toISOString();
      const subject = item.envelope?.subject ?? '';
      const sender = item.envelope?.from?.map((address) => address.address ?? '').filter(Boolean).join(', ') ?? '';
      let text = '';
      let remaining = MAX_BODY_TEXT_BYTES;
      for (const part of bodyTextParts(item.bodyStructure)) {
        if (remaining <= 0) break;
        const partText = await readTextPart(client, item.uid, part, remaining);
        const partBytes = Buffer.byteLength(partText, 'utf8');
        if (partBytes > remaining) {
          text += decodeText(Buffer.from(partText, 'utf8').subarray(0, remaining), remaining);
          remaining = 0;
        } else {
          text += partText;
          remaining -= partBytes;
        }
      }
      messages.push({
        uid: item.uid,
        messageKey: item.envelope?.messageId ?? `${item.uid}:${receivedAt}:${subject}`,
        subject,
        sender,
        receivedAt,
        text,
      });
    }
    return messages;
  } finally {
    await client.logout().catch(() => client.close());
  }
}

function result(state: EmailSyncState, counts: Pick<EmailSyncResult, 'processed' | 'applied' | 'pending' | 'skipped'>): EmailSyncResult {
  return { ...counts, ...state };
}

export function createEmailSyncService({
  events,
  positions,
  settings,
  fetchMessages = fetchViaImap,
  now = () => new Date(),
}: EmailSyncServiceDependencies): EmailSyncService {
  const applyMessage = async (message: EmailFetchedMessage, receivedDate: string): Promise<'applied' | 'pending' | 'skipped'> => {
    const rawMessageKey = message.messageKey.trim() || `${message.uid ?? ''}:${message.receivedAt}:${message.subject}` || 'unknown';
    const persisted = {
      messageKey: boundedMessageKey(rawMessageKey),
      subject: boundedText(message.subject),
      sender: boundedText(message.sender),
    };
    if (events.getByMessageKey(persisted.messageKey) !== null) return 'skipped';
    const searchable = `${message.subject}\n${message.sender}\n${message.text}`;
    const canonicalStage = classifyStage(searchable);
    const candidates = positions.list().filter((position) => {
      const normalized = normalizeMatch(searchable);
      const company = normalizeMatch(position.company);
      const title = normalizeMatch(position.title);
      return company.length > 0 && title.length > 0
        && normalized.includes(company)
        && normalized.includes(title);
    });
    let event: EmailSyncEventInput;
    if (canonicalStage === null) {
      event = {
        ...persisted,
        receivedAt: message.receivedAt,
        status: 'pending',
        positionId: null,
        canonicalStage: null,
        reason: '未识别招聘状态',
      };
    } else if (candidates.length !== 1) {
      event = {
        ...persisted,
        receivedAt: message.receivedAt,
        status: 'pending',
        positionId: null,
        canonicalStage,
        reason: candidates.length === 0 ? '未能唯一匹配岗位' : '匹配到多个岗位',
      };
    } else {
      const position = candidates[0]!;
      const detail: PositionDetail = positions.getDetail(position.id);
      const existing = detail.stages.find((stage) => stage.canonicalStage === canonicalStage);
      const dateInput = stageDateInput(canonicalStage, receivedDate);
      const stage = existing ?? {
        positionId: position.id,
        name: STAGE_NAMES[canonicalStage],
        canonicalStage,
        actualDate: dateInput.actualDate,
        expectedDate: dateInput.expectedDate,
        feedback: '',
        notes: '',
        orderIndex: detail.stages.filter((candidate) => stageOrder(candidate.canonicalStage) < stageOrder(canonicalStage)).length,
      };
      positions.upsertStage({
        ...stage,
        ...dateInput,
        ...(existing && (canonicalStage === 'assessment' || canonicalStage === 'interview')
          ? { actualDate: existing.actualDate }
          : {}),
        ...(existing ? { id: existing.id } : {}),
      });
      event = {
        ...persisted,
        receivedAt: message.receivedAt,
        status: 'applied',
        positionId: position.id,
        canonicalStage,
        reason: '自动匹配并写入流程',
      };
    }
    events.record(event);
    return event.status;
  };

  const runSync = async (): Promise<EmailSyncResult> => {
    const startedAt = now().toISOString();
    let current: EmailSettingsPrivate | null = null;
    try {
      const privateSettings = await settings.getPrivate();
      current = privateSettings;
      const publicSettings = await settings.getPublic();
      const messages = await fetchMessages(privateSettings, publicSettings.lastUid);
      let applied = 0;
      let pending = 0;
      let skipped = 0;
      let lastUid = publicSettings.lastUid;
      for (const message of messages) {
        const status = await applyMessage(message, localDate(message.receivedAt, now()));
        if (status === 'applied') applied += 1;
        else if (status === 'pending') pending += 1;
        else skipped += 1;
        if (message.uid !== undefined) lastUid = Math.max(lastUid, message.uid);
      }
      const state = { lastUid, lastSyncAt: startedAt, lastError: null };
      await settings.updateSyncState(state);
      return result(state, { processed: messages.length, applied, pending, skipped });
    } catch {
      const state = {
        lastUid: current?.lastUid ?? 0,
        lastSyncAt: startedAt,
        lastError: GENERIC_SYNC_ERROR,
      };
      await settings.updateSyncState(state).catch(() => undefined);
      return result(state, { processed: 0, applied: 0, pending: 0, skipped: 0 });
    }
  };

  let inFlight: Promise<EmailSyncResult> | null = null;

  return {
    syncNow() {
      if (inFlight === null) {
        inFlight = runSync().finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },

    async testConnection() {
      const privateSettings = await settings.getPrivate();
      const client = new ImapFlow({
        host: privateSettings.host,
        port: privateSettings.port,
        secure: privateSettings.secure,
        auth: { user: privateSettings.username, pass: privateSettings.password },
        logger: false,
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
        emitLogs: false,
      });
      try {
        await client.connect();
        return { ok: true, message: '连接成功，可以同步邮件' };
      } finally {
        await client.logout().catch(() => client.close());
      }
    },

    listRecent(limit = 50) {
      return events.listRecent(limit);
    },
  };
}
