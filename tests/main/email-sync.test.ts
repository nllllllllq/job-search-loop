// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createTestDatabase } from '../helpers/database';
import { createPositionsRepository } from '../../src/main/repositories/positions';
import {
  createEmailSyncRepository,
} from '../../src/main/repositories/email-sync';
import {
  createEmailSyncService,
  type EmailInboundMessage,
} from '../../src/main/services/email-sync';

const imapMock = vi.hoisted(() => ({
  fetchQueries: [] as Record<string, unknown>[],
  downloadCalls: [] as Array<{ uid: string; part: string | undefined; maxBytes: number | undefined }>,
  items: [] as Array<Record<string, unknown>>,
  bodyParts: new Map<string, Buffer>(),
  searchResult: [1],
}));

vi.mock('imapflow', () => ({
  ImapFlow: class FakeImapFlow {
    async connect() {}
    async mailboxOpen() {}
    async search() {
      return imapMock.searchResult;
    }
    async *fetch(_uids: unknown, query: Record<string, unknown>) {
      imapMock.fetchQueries.push(query);
      for (const item of imapMock.items) yield item;
    }
    async download(uid: string, part?: string, options?: { maxBytes?: number }) {
      imapMock.downloadCalls.push({ uid, part, maxBytes: options?.maxBytes });
      return {
        content: (async function* () {
          yield imapMock.bodyParts.get(part ?? '') ?? Buffer.alloc(0);
        })(),
      };
    }
    async logout() {}
    close() {}
  },
}));

function makeSettings() {
  let state = { lastUid: 0, lastSyncAt: null as string | null, lastError: null as string | null };
  const base = {
    host: 'imap.example.com',
    port: 993,
    secure: true,
    email: 'user@example.com',
    username: 'user@example.com',
    enabled: true,
    intervalMinutes: 15,
    hasPassword: true,
  };
  return {
    save: async () => ({ ...base, ...state }),
    getPrivate: async () => ({ ...base, password: 'secret', ...state }),
    getPublic: async () => ({ ...base, ...state }),
    updateSyncState: async (next: typeof state) => {
      state = next;
      return { ...base, ...state };
    },
    getState: () => state,
  };
}

function resetImapMock() {
  imapMock.fetchQueries.length = 0;
  imapMock.downloadCalls.length = 0;
  imapMock.items = [];
  imapMock.bodyParts = new Map();
  imapMock.searchResult = [1];
}

describe('email sync', () => {
  it('matches a recruitment message, writes the fixed-rule date, and audits it once', async () => {
    const db = createTestDatabase();

    try {
      const positions = createPositionsRepository(db);
      const position = positions.create({
        company: '远山科技',
        title: '产品经理',
        interest: 5,
        rawJd: '负责产品规划',
      });
      const events = createEmailSyncRepository(db);
      const messages: EmailInboundMessage[] = [{
        messageKey: '<message-1@example.com>',
        subject: '远山科技 产品经理 面试通知',
        sender: 'hr@example.com',
        receivedAt: '2026-08-12T01:02:03.000Z',
        text: '邀请参加面试',
      }];
      let syncState = { lastUid: 0, lastSyncAt: null as string | null, lastError: null as string | null };
      const service = createEmailSyncService({
        events,
        positions,
        settings: {
          save: async () => ({
            host: 'imap.example.com',
            port: 993,
            secure: true,
            email: 'user@example.com',
            username: 'user@example.com',
            enabled: true,
            intervalMinutes: 15,
            hasPassword: true,
            ...syncState,
          }),
          getPrivate: async () => ({
            host: 'imap.example.com',
            port: 993,
            secure: true,
            email: 'user@example.com',
            username: 'user@example.com',
            password: 'secret',
            enabled: true,
            intervalMinutes: 15,
            hasPassword: true,
            ...syncState,
          }),
          getPublic: async () => ({
            host: 'imap.example.com',
            port: 993,
            secure: true,
            email: 'user@example.com',
            username: 'user@example.com',
            enabled: true,
            intervalMinutes: 15,
            hasPassword: true,
            ...syncState,
          }),
          updateSyncState: async (next) => {
            syncState = next;
            return {
              host: 'imap.example.com',
              port: 993,
              secure: true,
              email: 'user@example.com',
              username: 'user@example.com',
              enabled: true,
              intervalMinutes: 15,
              hasPassword: true,
              ...syncState,
            };
          },
        },
        fetchMessages: async () => messages,
      });

      await expect(service.syncNow()).resolves.toMatchObject({ applied: 1, pending: 0 });
      expect(positions.listStages(position.id).find((stage) => stage.canonicalStage === 'interview'))
        .toMatchObject({ actualDate: null, expectedDate: '2026-08-12' });
      expect(events.listRecent(10)).toHaveLength(1);
      await expect(service.syncNow()).resolves.toMatchObject({ applied: 0, pending: 0 });
      expect(events.listRecent(10)).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('treats an empty injected mailbox as a successful no-op', async () => {
    const db = createTestDatabase();

    try {
      const positions = createPositionsRepository(db);
      const events = createEmailSyncRepository(db);
      const state = { lastUid: 0, lastSyncAt: null as string | null, lastError: null as string | null };
      const settings = {
        save: async () => ({
          host: 'imap.example.com', port: 993, secure: true, email: 'user@example.com',
          username: 'user@example.com', enabled: true, intervalMinutes: 15,
          hasPassword: true, ...state,
        }),
        getPrivate: async () => ({
          host: 'imap.example.com', port: 993, secure: true, email: 'user@example.com',
          username: 'user@example.com', password: 'secret', enabled: true, intervalMinutes: 15,
          hasPassword: true, ...state,
        }),
        getPublic: async () => ({
          host: 'imap.example.com', port: 993, secure: true, email: 'user@example.com',
          username: 'user@example.com', enabled: true, intervalMinutes: 15,
          hasPassword: true, ...state,
        }),
        updateSyncState: async (next: typeof state) => {
          Object.assign(state, next);
          return {
            host: 'imap.example.com', port: 993, secure: true, email: 'user@example.com',
            username: 'user@example.com', enabled: true, intervalMinutes: 15,
            hasPassword: true, ...state,
          };
        },
      };
      const service = createEmailSyncService({
        events,
        positions,
        settings,
        fetchMessages: async () => [],
      });

      await expect(service.syncNow()).resolves.toMatchObject({
        processed: 0,
        applied: 0,
        pending: 0,
        skipped: 0,
        lastError: null,
      });
    } finally {
      db.close();
    }
  });

  it('serializes concurrent sync calls within one service instance', async () => {
    const settings = makeSettings();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let fetchCalls = 0;
    const service = createEmailSyncService({
      events: {
        getByMessageKey: () => null,
        record: (input) => ({ ...input, id: 'event', createdAt: new Date().toISOString() }),
        listRecent: () => [],
      },
      positions: { list: () => [], getDetail: () => { throw new Error('unused'); }, upsertStage: () => { throw new Error('unused'); } },
      settings,
      fetchMessages: async () => {
        fetchCalls += 1;
        await gate;
        return [];
      },
    });

    const first = service.syncNow();
    const second = service.syncNow();
    expect(second).toBe(first);
    release();
    await Promise.all([first, second]);
    expect(fetchCalls).toBe(1);
  });

  it('uses only non-attachment text body parts and caps downloaded text', async () => {
    resetImapMock();
    imapMock.items = [{
      uid: 1,
      internalDate: new Date('2026-08-12T01:02:03.000Z'),
      envelope: {
        messageId: '<body-1@example.com>',
        subject: 'Acme Product interview',
        from: [{ address: 'hr@example.com' }],
      },
      bodyStructure: {
        type: 'multipart/mixed',
        childNodes: [
          { part: '1', type: 'text/plain', disposition: 'inline' },
          { part: '2', type: 'application/pdf', disposition: 'attachment' },
          { part: '3', type: 'text/html', disposition: 'inline' },
        ],
      },
    }];
    imapMock.bodyParts.set('1', Buffer.from('Acme Product interview'));
    imapMock.bodyParts.set('3', Buffer.alloc(300_000, 'x'));
    const settings = makeSettings();
    const recorded: Array<Record<string, unknown>> = [];
    const service = createEmailSyncService({
      events: {
        getByMessageKey: () => null,
        record: (input) => {
          recorded.push(input as unknown as Record<string, unknown>);
          return { ...input, id: 'event', createdAt: new Date().toISOString() };
        },
        listRecent: () => [],
      },
      positions: {
        list: () => [],
        getDetail: () => { throw new Error('unused'); },
        upsertStage: () => { throw new Error('unused'); },
      },
      settings,
    });

    await service.syncNow();
    expect(imapMock.fetchQueries[0]).toMatchObject({ uid: true, envelope: true, internalDate: true, bodyStructure: true });
    expect(imapMock.fetchQueries[0]).not.toHaveProperty('source');
    expect(imapMock.fetchQueries[0]).not.toHaveProperty('bodyParts');
    expect(imapMock.downloadCalls.map(({ part }) => part)).toEqual(['1', '3']);
    expect(imapMock.downloadCalls[0]?.maxBytes).toBe(200_000);
    expect(imapMock.downloadCalls[1]?.maxBytes).toBe(200_000 - Buffer.byteLength('Acme Product interview'));
    expect(recorded[0]?.subject).toBe('Acme Product interview');
  });

  it('does not descend into a multipart attachment body', async () => {
    resetImapMock();
    imapMock.items = [{
      uid: 1,
      internalDate: new Date('2026-08-12T01:02:03.000Z'),
      envelope: { messageId: '<attachment@example.com>', subject: 'unknown', from: [] },
      bodyStructure: {
        type: 'multipart/mixed',
        childNodes: [{
          part: '1',
          type: 'multipart/alternative',
          disposition: 'attachment',
          childNodes: [{ part: '1.1', type: 'text/plain' }],
        }],
      },
    }];
    const service = createEmailSyncService({
      events: { getByMessageKey: () => null, record: (input) => ({ ...input, id: 'event', createdAt: new Date().toISOString() }), listRecent: () => [] },
      positions: { list: () => [], getDetail: () => { throw new Error('unused'); }, upsertStage: () => { throw new Error('unused'); } },
      settings: makeSettings(),
    });

    await service.syncNow();
    expect(imapMock.downloadCalls).toHaveLength(0);
  });

  it('processes the earliest 50 UIDs and advances only through them', async () => {
    resetImapMock();
    imapMock.searchResult = Array.from({ length: 51 }, (_, index) => index + 1);
    imapMock.items = Array.from({ length: 50 }, (_, index) => ({
      uid: index + 1,
      internalDate: new Date('2026-08-12T01:02:03.000Z'),
      envelope: { messageId: `<uid-${index + 1}@example.com>`, subject: 'unknown', from: [] },
      bodyStructure: { type: 'text/plain' },
    }));
    const service = createEmailSyncService({
      events: { getByMessageKey: () => null, record: (input) => ({ ...input, id: 'event', createdAt: new Date().toISOString() }), listRecent: () => [] },
      positions: { list: () => [], getDetail: () => { throw new Error('unused'); }, upsertStage: () => { throw new Error('unused'); } },
      settings: makeSettings(),
    });

    const result = await service.syncNow();
    expect(result.processed).toBe(50);
    expect(result.lastUid).toBe(50);
  });

  it('updates a dated canonical stage instead of appending a duplicate', async () => {
    const db = createTestDatabase();
    try {
      const positions = createPositionsRepository(db);
      const position = positions.create({ company: 'Acme', title: 'Product', interest: 3, rawJd: 'jd', initialStage: 'interview', initialDate: '2026-08-01' });
      const existing = positions.listStages(position.id).find((stage) => stage.canonicalStage === 'interview')!;
      positions.upsertStage({ ...existing, actualDate: '2026-08-05' });
      const events = createEmailSyncRepository(db);
      const service = createEmailSyncService({ events, positions, settings: makeSettings(), fetchMessages: async () => [{ messageKey: 'dated', subject: 'Acme Product interview', sender: 'hr@example.com', receivedAt: '2026-08-12T00:00:00.000Z', text: 'interview' }] });

      await service.syncNow();
      const stages = positions.listStages(position.id).filter((stage) => stage.canonicalStage === 'interview');
      expect(stages).toHaveLength(1);
      expect(stages[0]?.id).toBe(existing.id);
      expect(stages[0]?.actualDate).toBe('2026-08-05');
      expect(stages[0]?.expectedDate).toBe('2026-08-12');
    } finally {
      db.close();
    }
  });

  it('inserts a missing lower stage at standard order without regressing current stage', async () => {
    const db = createTestDatabase();
    try {
      const positions = createPositionsRepository(db);
      const position = positions.create({ company: 'Acme', title: 'Product', interest: 3, rawJd: 'jd', initialStage: 'interview', initialDate: '2026-08-01' });
      const applied = positions.listStages(position.id).find((stage) => stage.canonicalStage === 'applied')!;
      positions.removeStage(position.id, applied.id);
      const events = createEmailSyncRepository(db);
      const service = createEmailSyncService({ events, positions, settings: makeSettings(), fetchMessages: async () => [{ messageKey: 'lower', subject: 'Acme Product application submitted', sender: 'hr@example.com', receivedAt: '2026-08-12T00:00:00.000Z', text: '' }] });

      await service.syncNow();
      expect(positions.listStages(position.id).map((stage) => stage.canonicalStage)).toEqual(['applied', 'assessment', 'interview', 'offer']);
      expect(positions.get(position.id).currentStage).toBe('interview');
    } finally {
      db.close();
    }
  });

  it('requires non-empty normalized company and title for a match', async () => {
    const recorded: Array<Record<string, unknown>> = [];
    const service = createEmailSyncService({
      events: {
        getByMessageKey: () => null,
        record: (input) => {
          recorded.push(input as unknown as Record<string, unknown>);
          return { ...input, id: 'event', createdAt: new Date().toISOString() };
        },
        listRecent: () => [],
      },
      positions: {
        list: () => [{ id: 'position', company: '!!!', title: '???', location: '', interest: 3, currentStage: null, finalResult: null, updatedAt: new Date().toISOString() }],
        getDetail: () => { throw new Error('must not match'); },
        upsertStage: () => { throw new Error('must not match'); },
      },
      settings: makeSettings(),
      fetchMessages: async () => [{ messageKey: 'empty-match', subject: 'interview', sender: 'hr@example.com', receivedAt: '2026-08-12T00:00:00.000Z', text: '' }],
    });

    await expect(service.syncNow()).resolves.toMatchObject({ applied: 0, pending: 1 });
    expect(recorded[0]?.positionId).toBeNull();
  });

  it('does not classify a mixed interview or offer message as rejected for a thank-you phrase', async () => {
    const recorded: Array<Record<string, unknown>> = [];
    const service = createEmailSyncService({
      events: {
        getByMessageKey: () => null,
        record: (input) => {
          recorded.push(input as unknown as Record<string, unknown>);
          return { ...input, id: 'event', createdAt: new Date().toISOString() };
        },
        listRecent: () => [],
      },
      positions: { list: () => [], getDetail: () => { throw new Error('unused'); }, upsertStage: () => { throw new Error('unused'); } },
      settings: makeSettings(),
      fetchMessages: async () => [{ messageKey: 'thank-you', subject: 'Acme interview 感谢参与', sender: 'hr@example.com', receivedAt: '2026-08-12T00:00:00.000Z', text: '' }],
    });

    await service.syncNow();
    expect(recorded[0]?.canonicalStage).toBe('interview');
    expect(recorded[0]?.canonicalStage).not.toBe('rejected');
  });

  it('persists only bounded event fields and a stable generic error', async () => {
    const recorded: Array<Record<string, unknown>> = [];
    let fail = true;
    const settings = makeSettings();
    const service = createEmailSyncService({
      events: {
        getByMessageKey: () => null,
        record: (input) => {
          recorded.push(input as unknown as Record<string, unknown>);
          return { ...input, id: 'event', createdAt: new Date().toISOString() };
        },
        listRecent: () => [],
      },
      positions: { list: () => [], getDetail: () => { throw new Error('unused'); }, upsertStage: () => { throw new Error('unused'); } },
      settings: {
        ...settings,
        getPrivate: async () => {
          if (fail) throw new Error('provider secret detail');
          return settings.getPrivate();
        },
      },
      fetchMessages: async () => [{ messageKey: 'k'.repeat(700), subject: 's'.repeat(700), sender: 'r'.repeat(700), receivedAt: '2026-08-12T00:00:00.000Z', text: '' }],
    });

    await service.syncNow();
    expect(settings.getState().lastError).toBe('邮箱同步失败');
    fail = false;
    await service.syncNow();
    expect(recorded[0]?.messageKey).toHaveLength(500);
    expect(recorded[0]?.subject).toHaveLength(500);
    expect(recorded[0]?.sender).toHaveLength(500);
  });
});
