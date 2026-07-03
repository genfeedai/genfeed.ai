import type { AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';

import { AgentMemoriesService } from './agent-memories.service';

describe('AgentMemoriesService', () => {
  let service: AgentMemoriesService;
  let agentMemoryDelegate: {
    findMany: ReturnType<typeof vi.fn>;
  };

  const orgId = 'org-1';
  const userId = 'user-1';
  const brandId = 'brand-1';

  beforeEach(() => {
    agentMemoryDelegate = {
      findMany: vi.fn(),
    };

    service = new AgentMemoriesService(
      { agentMemory: agentMemoryDelegate } as unknown as PrismaService,
      {
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
