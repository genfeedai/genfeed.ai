import type { AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { KnowledgeMemoryScope } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import { AgentMemoriesService } from './agent-memories.service';

const billingMock = vi.hoisted(() => ({ isEnabled: false }));

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: () => billingMock.isEnabled,
}));

describe('AgentMemoriesService', () => {
  let service: AgentMemoriesService;
  let agentMemoryDelegate: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let contextEntryDelegate: {
    updateMany: ReturnType<typeof vi.fn>;
  };
  let skillDelegate: {
    create: ReturnType<typeof vi.fn>;
  };

  const orgId = 'org-1';
  const userId = 'user-1';
  const brandId = 'brand-1';

  beforeEach(() => {
    billingMock.isEnabled = false;
    agentMemoryDelegate = {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    };
    contextEntryDelegate = {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    skillDelegate = {
      create: vi.fn(),
    };

    service = new AgentMemoriesService(
      {
        agentMemory: agentMemoryDelegate,
        contextEntry: contextEntryDelegate,
        skill: skillDelegate,
      } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  it('ranks generation feedback by platform, content type, confidence, recency, and performance relevance', async () => {
    const now = Date.now();
    agentMemoryDelegate.findMany.mockResolvedValue([
      buildMemory({
        brandId,
        confidence: 0.92,
        content:
          'Launch posts win when the first line names the customer pain.',
        contentType: 'post',
        createdAt: new Date(now - 2 * 86_400_000),
        id: 'winner-memory',
        importance: 0.8,
        kind: 'winner',
        performanceSnapshot: { isWinner: true },
        platform: 'linkedin',
        summary: 'Lead with customer pain before the product claim.',
        tags: ['launch', 'hook'],
      }),
      buildMemory({
        confidence: 0.95,
        content: 'Old generic writing advice.',
        contentType: 'generic',
        createdAt: new Date(now - 120 * 86_400_000),
        id: 'generic-memory',
        importance: 0.9,
        kind: 'instruction',
        platform: 'twitter',
      }),
    ]);

    const result = await service.getFeedbackMemoriesForGeneration(
      userId,
      orgId,
      {
        brandId,
        contentType: 'post',
        platform: 'linkedin',
        query: 'Write a LinkedIn launch post with a sharp hook',
      },
    );

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('winner-memory');
    expect(result[0].generationInfluence.score).toBeGreaterThan(
      result[1].generationInfluence.score,
    );
    expect(result[0].generationInfluence.rankingFactors).toMatchObject({
      contentType: 7,
      performance: 5,
      platform: 8,
    });
    expect(result[0].generationInfluence.reasons).toEqual(
      expect.arrayContaining([
        'Matches the requested platform linkedin',
        'Matches requested content type post',
        'Prior winning pattern',
        'Performance snapshot marks this as a winner',
      ]),
    );
    expect(result[0].generationInfluence.matchedPromptTerms).toEqual(
      expect.arrayContaining(['linkedin', 'launch', 'post', 'hook']),
    );
  });

  it('returns an empty list when no feedback memory exists', async () => {
    agentMemoryDelegate.findMany.mockResolvedValue([]);

    await expect(
      service.getFeedbackMemoriesForGeneration(userId, orgId, {
        query: 'Generate a post from scratch',
      }),
    ).resolves.toEqual([]);
  });

  it("lists a user's live memories with tenant and soft-delete filters", async () => {
    agentMemoryDelegate.findMany.mockResolvedValue([]);

    await service.listForUser(userId, orgId);

    expect(agentMemoryDelegate.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 100,
      where: {
        isDeleted: false,
        organizationId: orgId,
        userId,
      },
    });
  });

  it('omits personal memories from the org-wide listing', async () => {
    billingMock.isEnabled = true;
    agentMemoryDelegate.findMany.mockResolvedValue([]);

    await service.listForOrganization(orgId);

    expect(agentMemoryDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isDeleted: false,
          organizationId: orgId,
          scope: {
            in: [KnowledgeMemoryScope.BRAND, KnowledgeMemoryScope.ORG],
          },
        },
      }),
    );
  });

  it('refuses org-wide listing when organization billing is off', async () => {
    await expect(service.listForOrganization(orgId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(agentMemoryDelegate.findMany).not.toHaveBeenCalled();
  });

  it('maps legacy user and campaign scopes onto personal and brand', async () => {
    agentMemoryDelegate.create.mockResolvedValue({ id: 'memory-1' });

    await service.createMemory(userId, orgId, {
      content: 'Personal preference',
      scope: 'user' as never,
    });
    await service.createMemory(userId, orgId, {
      brandId,
      content: 'Campaign pattern',
      scope: 'campaign' as never,
    });

    expect(agentMemoryDelegate.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          scope: KnowledgeMemoryScope.PERSONAL,
        }),
      }),
    );
    expect(agentMemoryDelegate.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          brandId,
          scope: KnowledgeMemoryScope.BRAND,
        }),
      }),
    );
  });

  it('rejects unknown scopes and brand writes without a brandId', async () => {
    await expect(
      service.createMemory(userId, orgId, {
        content: 'Invalid',
        scope: 'team' as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.createMemory(userId, orgId, {
        content: 'Brand without brand',
        scope: KnowledgeMemoryScope.BRAND,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(agentMemoryDelegate.create).not.toHaveBeenCalled();
  });

  it('refuses org-wide writes without billing and persists them when billing is on', async () => {
    await expect(
      service.createMemory(userId, orgId, {
        content: 'Shared pattern',
        scope: KnowledgeMemoryScope.ORG,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    billingMock.isEnabled = true;
    agentMemoryDelegate.create.mockResolvedValue({ id: 'org-memory' });

    await service.createMemory(userId, orgId, {
      content: 'Shared pattern',
      scope: KnowledgeMemoryScope.ORG,
    });

    expect(agentMemoryDelegate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isDeleted: false,
          scope: KnowledgeMemoryScope.ORG,
        }),
      }),
    );
  });

  it('loads campaign memories by campaignId, not a retired campaign scope', async () => {
    agentMemoryDelegate.findMany.mockResolvedValue([]);

    await service.getCampaignMemories('campaign-1', orgId);

    expect(agentMemoryDelegate.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 100,
      where: {
        campaignId: 'campaign-1',
        isDeleted: false,
        organizationId: orgId,
      },
    });
  });

  it("retrieves generation memory across personal, brand, and org scopes without other users' personal entries", async () => {
    billingMock.isEnabled = true;
    agentMemoryDelegate.findMany.mockResolvedValue([]);

    await service.getFeedbackMemoriesForGeneration(userId, orgId, {
      brandId,
      query: 'launch post',
    });

    expect(agentMemoryDelegate.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 200,
      where: {
        isDeleted: false,
        organizationId: orgId,
        OR: [
          { scope: KnowledgeMemoryScope.PERSONAL, userId },
          { brandId, scope: KnowledgeMemoryScope.BRAND },
          { scope: KnowledgeMemoryScope.ORG },
        ],
      },
    });
  });

  it('soft-deletes a user memory instead of hard-deleting it', async () => {
    agentMemoryDelegate.findFirst.mockResolvedValue({ id: 'memory-1' });
    agentMemoryDelegate.update.mockResolvedValue({
      id: 'memory-1',
      isDeleted: true,
    });

    await service.removeMemory('memory-1', userId, orgId);

    expect(agentMemoryDelegate.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'memory-1',
        isDeleted: false,
        organizationId: orgId,
        userId,
      },
    });
    expect(agentMemoryDelegate.update).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: { id: 'memory-1' },
    });
  });

  it('archives org-visible memory and refuses personal rows', async () => {
    billingMock.isEnabled = true;
    agentMemoryDelegate.findFirst.mockResolvedValue({ id: 'brand-memory' });
    agentMemoryDelegate.update.mockResolvedValue({
      id: 'brand-memory',
      isDeleted: true,
    });

    await service.archiveMemory('brand-memory', orgId);

    expect(agentMemoryDelegate.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'brand-memory',
        isDeleted: false,
        organizationId: orgId,
        scope: {
          in: [KnowledgeMemoryScope.BRAND, KnowledgeMemoryScope.ORG],
        },
      },
    });
    expect(contextEntryDelegate.updateMany).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: {
        isDeleted: false,
        organizationId: orgId,
        OR: [
          {
            data: {
              equals: 'brand-memory',
              path: ['metadata', 'sourceId'],
            },
          },
        ],
      },
    });
  });

  it('promotes a memory into a skill exactly once', async () => {
    billingMock.isEnabled = true;
    agentMemoryDelegate.findFirst.mockResolvedValue({
      content: 'Lead with the pain',
      id: 'memory-1',
      summary: 'Pain-first hooks',
    });
    skillDelegate.create.mockResolvedValue({ id: 'skill-1' });
    agentMemoryDelegate.update.mockResolvedValue({
      id: 'memory-1',
      promotedSkillId: 'skill-1',
    });

    await service.promoteMemory('memory-1', orgId, userId);

    expect(skillDelegate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          label: 'Pain-first hooks',
          organizationId: orgId,
        }),
      }),
    );
    expect(agentMemoryDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          promotedByUserId: userId,
          promotedSkillId: 'skill-1',
        }),
        where: { id: 'memory-1' },
      }),
    );

    agentMemoryDelegate.findFirst.mockResolvedValue({
      id: 'memory-1',
      promotedSkillId: 'skill-1',
    });
    await expect(
      service.promoteMemory('memory-1', orgId, userId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects promotion without writing', async () => {
    billingMock.isEnabled = true;
    agentMemoryDelegate.findFirst.mockResolvedValue({ id: 'memory-1' });

    await expect(
      service.rejectMemoryPromotion('memory-1', orgId),
    ).resolves.toEqual({ id: 'memory-1' });
    expect(skillDelegate.create).not.toHaveBeenCalled();
    expect(agentMemoryDelegate.update).not.toHaveBeenCalled();
  });

  function buildMemory(
    overrides: Partial<AgentMemoryDocument>,
  ): AgentMemoryDocument {
    return {
      _id: overrides.id ?? 'memory-1',
      content: '',
      createdAt: new Date(),
      id: overrides.id ?? 'memory-1',
      organization: orgId,
      organizationId: orgId,
      updatedAt: new Date(),
      user: userId,
      userId,
      ...overrides,
    } as AgentMemoryDocument;
  }
});
