import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { AgentArtifactReferenceService } from '@genfeedai/server';
import type { LoggerService } from '@libs/logger/logger.service';
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

  it('uses bounded cursor pagination for room messages', async () => {
    await service.getMessagesByRoom('thread-1', 'org-1', {
      cursor: '2026-06-01T10:00:00.000Z',
      limit: 999,
    });

    expect(agentMessage.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: undefined,
      take: 100,
      where: {
        createdAt: { lt: new Date('2026-06-01T10:00:00.000Z') },
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
});
