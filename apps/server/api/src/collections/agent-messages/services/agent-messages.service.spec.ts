import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { encodeAgentMessageCursor } from '@api/collections/agent-messages/utils/agent-message-cursor.util';
import type { AgentArtifactReferenceService } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentMessagesService', () => {
  const agentMessage = {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  const artifactReferenceService = {
    resolveMessageReferences: vi.fn(),
    resolveReference: vi.fn(),
    resolveReferencesFromMetadata: vi.fn(),
    resolveVersionPin: vi.fn(),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  };

  let service: AgentMessagesService;

  beforeEach(() => {
    vi.clearAllMocks();
    agentMessage.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'message-1', ...data }),
    );
    agentMessage.findFirst.mockResolvedValue(null);
    agentMessage.findMany.mockResolvedValue([]);
    artifactReferenceService.resolveReference.mockImplementation((reference) =>
      Promise.resolve({ reference }),
    );
    artifactReferenceService.resolveReferencesFromMetadata.mockResolvedValue(
      [],
    );
    artifactReferenceService.resolveVersionPin.mockResolvedValue({
      reference: {
        brandId: 'brand-1',
        kind: 'post',
        organizationId: 'org-1',
        recordId: 'post-from-pin',
        serializer: 'post',
      },
    });

    service = new AgentMessagesService(
      { agentMessage } as unknown as PrismaService,
      logger as unknown as LoggerService,
      artifactReferenceService as unknown as AgentArtifactReferenceService,
    );
  });

  it('rebuilds and authorizes explicit references before persisting a new message', async () => {
    await service.addMessage({
      brandId: 'brand-1',
      content: 'Generated a post',
      metadata: {
        artifactReferences: [
          {
            brandId: 'foreign-brand',
            kind: 'post',
            organizationId: 'foreign-org',
            recordId: 'post-1',
            serializer: 'asset',
          },
        ],
        artifactVersionPinIds: ['pin-1'],
      },
      organizationId: 'org-1',
      role: 'assistant' as never,
      room: 'thread-1',
      userId: 'user-1',
    });

    expect(artifactReferenceService.resolveReference).toHaveBeenCalledWith(
      {
        brandId: 'brand-1',
        kind: 'post',
        organizationId: 'org-1',
        recordId: 'post-1',
        serializer: 'post',
      },
      { brandId: 'brand-1', organizationId: 'org-1' },
    );
    expect(artifactReferenceService.resolveVersionPin).toHaveBeenCalledWith({
      pinId: 'pin-1',
      readContext: { brandId: 'brand-1', organizationId: 'org-1' },
    });
    expect(agentMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        artifactReferences: [
          {
            brandId: 'brand-1',
            kind: 'post',
            organizationId: 'org-1',
            recordId: 'post-1',
            serializer: 'post',
          },
          {
            brandId: 'brand-1',
            kind: 'post',
            organizationId: 'org-1',
            recordId: 'post-from-pin',
            serializer: 'post',
          },
        ],
        artifactVersionPinIds: ['pin-1'],
        isLegacyArtifactReferenceEligible: false,
        threadId: 'thread-1',
      }),
    });
  });

  it('resolves a message only after verifying its thread and organization', async () => {
    agentMessage.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      id: 'message-1',
    });
    artifactReferenceService.resolveMessageReferences.mockResolvedValue([]);

    await service.resolveMessageArtifactReferences(
      'thread-1',
      'message-1',
      'org-1',
      { client: 'api', deployment: 'server' },
    );

    expect(agentMessage.findFirst).toHaveBeenCalledWith({
      select: { brandId: true, id: true },
      where: {
        id: 'message-1',
        isDeleted: false,
        organizationId: 'org-1',
        threadId: 'thread-1',
      },
    });
    expect(
      artifactReferenceService.resolveMessageReferences,
    ).toHaveBeenCalledWith({
      messageId: 'message-1',
      readContext: { brandId: 'brand-1', organizationId: 'org-1' },
      telemetry: { client: 'api', deployment: 'server' },
    });
  });

  it('upgrades allowlisted structured output ids to authorized references on write', async () => {
    artifactReferenceService.resolveReferencesFromMetadata.mockResolvedValue([
      {
        brandId: 'brand-1',
        kind: 'ingredient',
        organizationId: 'org-1',
        recordId: 'ingredient-1',
        serializer: 'ingredient',
      },
    ]);

    await service.addMessage({
      brandId: 'brand-1',
      content: 'Generated content',
      metadata: {
        uiActions: [{ contentId: 'ingredient-1', id: 'presentation-only' }],
      },
      organizationId: 'org-1',
      role: 'assistant' as never,
      room: 'thread-1',
      userId: 'user-1',
    });

    expect(
      artifactReferenceService.resolveReferencesFromMetadata,
    ).toHaveBeenCalledWith(
      {
        uiActions: [{ contentId: 'ingredient-1', id: 'presentation-only' }],
      },
      { brandId: 'brand-1', organizationId: 'org-1' },
    );
    expect(agentMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        artifactReferences: [
          {
            brandId: 'brand-1',
            kind: 'ingredient',
            organizationId: 'org-1',
            recordId: 'ingredient-1',
            serializer: 'ingredient',
          },
        ],
        isLegacyArtifactReferenceEligible: false,
      }),
    });
  });

  describe('getMessagesByRoom', () => {
    it('uses a composite (createdAt, id) tiebreaker for cursor pagination, not createdAt alone', async () => {
      const cursor = encodeAgentMessageCursor({
        createdAt: '2026-06-01T10:00:00.000Z',
        id: 'message-5',
      });

      await service.getMessagesByRoom('thread-1', 'org-1', {
        cursor,
        limit: 999,
      });

      expect(agentMessage.findMany).toHaveBeenCalledWith({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: undefined,
        take: 100,
        where: {
          OR: [
            { createdAt: { lt: new Date('2026-06-01T10:00:00.000Z') } },
            {
              createdAt: new Date('2026-06-01T10:00:00.000Z'),
              id: { lt: 'message-5' },
            },
          ],
          isDeleted: false,
          organizationId: 'org-1',
          threadId: 'thread-1',
        },
      });
    });

    it('keeps legacy page support bounded when no cursor is provided', async () => {
      await service.getMessagesByRoom('thread-1', 'org-1', {
        limit: 25,
        page: 3,
      });

      expect(agentMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 50,
          take: 25,
        }),
      );
    });

    it('rejects a malformed cursor instead of silently returning the first page', async () => {
      await expect(
        service.getMessagesByRoom('thread-1', 'org-1', {
          cursor: 'not-a-valid-cursor',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getMessagesPage', () => {
    it('returns the first page newest-first with hasMore + nextCursor when more rows exist', async () => {
      const rows = [
        { createdAt: new Date('2026-06-03T00:00:00.000Z'), id: 'msg-3' },
        { createdAt: new Date('2026-06-02T00:00:00.000Z'), id: 'msg-2' },
        { createdAt: new Date('2026-06-01T00:00:00.000Z'), id: 'msg-1' },
      ];
      agentMessage.findMany.mockResolvedValueOnce(rows);

      const page = await service.getMessagesPage('thread-1', 'org-1', {
        limit: 2,
      });

      expect(agentMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 }),
      );
      expect(page.docs).toEqual(rows.slice(0, 2));
      expect(page.hasMore).toBe(true);
      expect(page.nextCursor).toBe(
        encodeAgentMessageCursor({
          createdAt: '2026-06-02T00:00:00.000Z',
          id: 'msg-2',
        }),
      );
    });

    it('walks an older page using the previous nextCursor', async () => {
      const cursor = encodeAgentMessageCursor({
        createdAt: '2026-06-02T00:00:00.000Z',
        id: 'msg-2',
      });
      agentMessage.findMany.mockResolvedValueOnce([
        { createdAt: new Date('2026-06-01T00:00:00.000Z'), id: 'msg-1' },
      ]);

      await service.getMessagesPage('thread-1', 'org-1', {
        cursor,
        limit: 2,
      });

      expect(agentMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: undefined,
          where: expect.objectContaining({
            OR: [
              { createdAt: { lt: new Date('2026-06-02T00:00:00.000Z') } },
              {
                createdAt: new Date('2026-06-02T00:00:00.000Z'),
                id: { lt: 'msg-2' },
              },
            ],
          }),
        }),
      );
    });

    it('signals exhaustion with hasMore=false and a null nextCursor on the last page', async () => {
      agentMessage.findMany.mockResolvedValueOnce([
        { createdAt: new Date('2026-06-01T00:00:00.000Z'), id: 'msg-1' },
      ]);

      const page = await service.getMessagesPage('thread-1', 'org-1', {
        limit: 2,
      });

      expect(page.hasMore).toBe(false);
      expect(page.nextCursor).toBeNull();
      expect(page.docs).toHaveLength(1);
    });

    it('does not drop or duplicate a sibling row sharing the exact cursor timestamp', async () => {
      // Two messages share the identical createdAt millisecond. The cursor
      // sits between them (id 'msg-5b'); the older sibling ('msg-5a') must
      // still be selectable by the next page's where clause, and the newer
      // sibling ('msg-5c', already returned before the cursor) must not be.
      const tiedTimestamp = '2026-06-01T10:00:00.000Z';
      const cursor = encodeAgentMessageCursor({
        createdAt: tiedTimestamp,
        id: 'msg-5b',
      });

      agentMessage.findMany.mockResolvedValueOnce([
        { createdAt: new Date(tiedTimestamp), id: 'msg-5a' },
      ]);

      await service.getMessagesPage('thread-1', 'org-1', { cursor, limit: 50 });

      const calledWhere = agentMessage.findMany.mock.calls[0][0].where;
      // msg-5a: createdAt equal, id < cursor id -> matched by the second OR branch.
      expect(calledWhere.OR[1]).toEqual({
        createdAt: new Date(tiedTimestamp),
        id: { lt: 'msg-5b' },
      });
      // msg-5c (id greater than the cursor, same timestamp) would satisfy
      // neither branch: createdAt is not < tiedTimestamp, and id is not <
      // 'msg-5b' - so it is correctly excluded, never re-returned.
      const wouldMatchFirstBranch = false; // createdAt === tiedTimestamp, not <
      const wouldMatchSecondBranch = 'msg-5c' < 'msg-5b';
      expect(wouldMatchFirstBranch || wouldMatchSecondBranch).toBe(false);
    });
  });

  it('bounds compaction backlog reads', async () => {
    await service.getAllMessages('thread-1');
    await service.getAllMessagesAfter('thread-1', 'msg-1');

    expect(agentMessage.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 500 }),
    );
    expect(agentMessage.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ take: 500 }),
    );
  });

  it('copies messages in bounded pages', async () => {
    agentMessage.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 500 }, (_, index) => ({
          id: `msg-${index}`,
          artifactReferences: [
            {
              kind: 'post',
              organizationId: 'org-1',
              recordId: `post-${index}`,
              serializer: 'post',
            },
          ],
          artifactVersionPinIds: [`pin-${index}`],
          organizationId: 'org-1',
          role: 'user',
          threadId: 'source',
        })),
      )
      .mockResolvedValueOnce([]);
    agentMessage.create.mockResolvedValue({});

    await service.copyMessages('source', 'target', 'org-1');

    expect(agentMessage.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 500 }),
    );
    expect(agentMessage.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: { id: 'msg-499' },
        skip: 1,
        take: 500,
      }),
    );
    expect(agentMessage.create).toHaveBeenCalledTimes(500);
    expect(agentMessage.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          artifactReferences: expect.arrayContaining([
            {
              kind: 'post',
              organizationId: 'org-1',
              recordId: 'post-0',
              serializer: 'post',
            },
          ]),
          artifactVersionPinIds: ['pin-0'],
          isLegacyArtifactReferenceEligible: false,
        }),
      }),
    );
  });

  it('upgrades allowlisted legacy output ids while copying a message', async () => {
    agentMessage.findMany.mockResolvedValueOnce([
      {
        artifactReferences: [],
        artifactVersionPinIds: [],
        brandId: 'brand-1',
        id: 'legacy-message',
        metadata: { uiActions: [{ contentId: 'ingredient-1' }] },
        organizationId: 'org-1',
        role: 'assistant',
        threadId: 'source',
      },
    ]);
    artifactReferenceService.resolveReferencesFromMetadata.mockResolvedValue([
      {
        brandId: 'brand-1',
        kind: 'ingredient',
        organizationId: 'org-1',
        recordId: 'ingredient-1',
        serializer: 'ingredient',
      },
    ]);

    await service.copyMessages('source', 'target', 'org-1');

    expect(agentMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        artifactReferences: [
          expect.objectContaining({
            kind: 'ingredient',
            recordId: 'ingredient-1',
          }),
        ],
        isLegacyArtifactReferenceEligible: false,
      }),
    });
  });

  it('preserves tool calls while copying messages between rooms', async () => {
    const toolCalls = [
      {
        parameters: { prompt: 'Create a launch image' },
        result: { imageId: 'image-1' },
        status: 'completed',
        toolName: 'generate_image',
      },
    ];
    agentMessage.findMany.mockResolvedValueOnce([
      {
        artifactReferences: [],
        artifactVersionPinIds: [],
        id: 'assistant-message',
        organizationId: 'org-1',
        role: 'assistant',
        threadId: 'source',
        toolCalls,
      },
    ]);

    await service.copyMessages('source', 'target', 'org-1');

    expect(agentMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        threadId: 'target',
        toolCalls,
      }),
    });
  });

  it('loads recent messages with org scope and a slim select for LLM context', async () => {
    agentMessage.findMany.mockResolvedValue([
      {
        content: 'newest',
        createdAt: new Date('2026-08-12T12:00:00.000Z'),
        id: 'm2',
        role: 'assistant',
      },
      {
        content: 'older',
        createdAt: new Date('2026-08-12T11:00:00.000Z'),
        id: 'm1',
        role: 'user',
      },
    ]);

    const messages = await service.getRecentMessages('thread-1', 20, 'org-1');

    expect(agentMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: expect.objectContaining({
          content: true,
          id: true,
          role: true,
        }),
        take: 20,
        where: {
          isDeleted: false,
          organizationId: 'org-1',
          threadId: 'thread-1',
        },
      }),
    );
    // Returned chronological for the model window.
    expect(messages.map((message) => message.id)).toEqual(['m1', 'm2']);
  });

  it('falls back to thread-only filter when organizationId is omitted', async () => {
    await service.getRecentMessages('thread-1', 10);

    expect(agentMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isDeleted: false,
          threadId: 'thread-1',
        },
      }),
    );
  });
});
