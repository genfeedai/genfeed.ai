import type { AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { fitBrandContextToBudgetWithReport } from '@api/services/agent-context-assembly/brand-context-budget.util';
import type { AssembledBrandContext } from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';
import { AgentBrandContextSnapshotService } from '@api/services/agent-orchestrator/agent-brand-context-snapshot.service';
import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import { KnowledgeMemoryScope } from '@genfeedai/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const BRAND_ID = 'brand-1';

function memory(
  overrides: Partial<AgentMemoryDocument> & { id: string },
): AgentMemoryDocument {
  return {
    brandId: null,
    campaignId: null,
    confidence: 0.5,
    content: `content ${overrides.id}`,
    contentType: 'generic',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    importance: 0.5,
    isDeleted: false,
    kind: 'preference',
    metadata: null,
    organizationId: ORG_ID,
    performanceSnapshot: null,
    platform: null,
    promotedAt: null,
    promotedByUserId: null,
    promotedSkillId: null,
    scope: KnowledgeMemoryScope.PERSONAL,
    sourceContentId: null,
    sourceMessageId: null,
    sourceType: null,
    sourceUrl: null,
    summary: `summary ${overrides.id}`,
    tags: [],
    type: null,
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    userId: USER_ID,
    ...overrides,
  };
}

const BRAND_CONTEXT: AssembledBrandContext = {
  assembledAt: new Date('2026-09-25T00:00:00.000Z'),
  brandDescription: 'Systems for founders',
  brandId: BRAND_ID,
  brandName: 'Acme',
  layersUsed: ['brandIdentity', 'brandGuidance', 'brandMemory'],
  memoryInsights: [
    { category: 'timing', confidence: 0.8, insight: 'Evenings win' },
  ],
  persona: 'Be a sharp operator',
  promptGuidelines: 'Never promise results',
  strategy: { goals: ['awareness'], platforms: ['linkedin'] },
  voice: { style: 'plain', tone: 'confident' },
};

// Exactly the four higher-priority sections (identity, guidelines, voice,
// custom instructions) fit; the lowest-priority performance section drops.
const TEST_BUDGET = 156;

/**
 * Renders the brand-context block the way the real assembler shapes it and
 * fits it with the real budget reporter, so the chat path (`buildSystemPrompt`)
 * and the snapshot's report (`renderSystemPrompt`) come from one renderer.
 */
function renderBrandContext(
  basePrompt: string,
  context: AssembledBrandContext,
  options: { maxBrandContextLength?: number } = {},
) {
  const sections = [
    `\n\n## Brand: ${context.brandName}\n${context.brandDescription ?? ''}`,
    context.promptGuidelines
      ? `\n## Brand Guidelines\n${context.promptGuidelines}`
      : '',
    context.voice ? `\n## Brand Voice\n- Tone: ${context.voice.tone}` : '',
    context.persona ? `\n## Custom Instructions\n${context.persona}` : '',
    context.memoryInsights?.length
      ? `\n## Performance Insights\n${context.memoryInsights
          .map((insight) => `- [${insight.category}] ${insight.insight}`)
          .join('\n')}`
      : '',
  ];
  const brandContext = fitBrandContextToBudgetWithReport(
    sections,
    options.maxBrandContextLength ?? TEST_BUDGET,
  );
  return {
    basePrompt,
    brandContext,
    prompt: [basePrompt, brandContext.text].filter(Boolean).join('\n\n'),
  };
}

function createHarness(options?: {
  brand?: Record<string, unknown> | null;
  memories?: AgentMemoryDocument[];
}) {
  const getFeedbackMemoriesForGeneration = vi
    .fn()
    .mockResolvedValue(options?.memories ?? []);
  const assembleContext = vi.fn().mockResolvedValue(BRAND_CONTEXT);
  const renderSystemPrompt = vi.fn(renderBrandContext);
  const buildSystemPrompt = vi.fn(
    (
      basePrompt: string,
      context: AssembledBrandContext,
      options?: { maxBrandContextLength?: number },
    ) => renderBrandContext(basePrompt, context, options).prompt,
  );
  const contextAssembly = {
    assembleContext,
    buildSystemPrompt,
    renderSystemPrompt,
  };
  const registry = {
    getDefaultModelKey: vi.fn().mockResolvedValue('default-model'),
    getRoundCredits: vi.fn().mockResolvedValue(3),
    listSelectable: vi
      .fn()
      .mockResolvedValue([{ key: 'default-model', label: 'Default Model' }]),
    resolveModelKey: vi.fn().mockResolvedValue('default-model'),
  };
  const modelAccess = {
    enforceModel: vi.fn(
      async (_organizationId: string, model: string) => model,
    ),
  };
  const contextService = new AgentOrchestratorContextService(
    registry as never,
    {} as never,
    { findOne: vi.fn().mockResolvedValue(null) } as never,
    {
      prepareForTurn: vi.fn(
        async (params: { requestedBrandId?: string | null }) => ({
          existingScope: undefined,
          initialBrandId: params.requestedBrandId ?? undefined,
          initialScopeFields: {},
        }),
      ),
    } as never,
    { getFeedbackMemoriesForGeneration } as never,
    {} as never,
    contextAssembly as never,
    {
      findOne: vi.fn().mockResolvedValue({ agentReplyStyle: undefined }),
    } as never,
    { findOneById: vi.fn() } as never,
    modelAccess as never,
  );
  const brandsService = {
    findOne: vi.fn().mockResolvedValue(
      options?.brand === undefined
        ? {
            agentConfig: {
              prompting: {
                conversationStarters: [
                  {
                    id: 'starter-1',
                    intent: 'create',
                    label: 'Launch post',
                    prompt: 'Draft a launch post',
                    topic: 'launches',
                  },
                ],
                seeds: [],
              },
              strategy: { topics: ['ops', 'hiring'] },
            },
            description: 'Systems for founders',
            id: BRAND_ID,
            label: 'Acme',
          }
        : options.brand,
    ),
  };
  const service = new AgentBrandContextSnapshotService(
    brandsService as never,
    contextService,
    contextAssembly as never,
    registry as never,
  );
  return {
    brandsService,
    buildSystemPrompt,
    contextService,
    getFeedbackMemoriesForGeneration,
    service,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AgentBrandContextSnapshotService', () => {
  it('looks the brand up inside the caller organization and 404s outside it', async () => {
    const { brandsService, contextService, service } = createHarness({
      brand: null,
    });
    const resolveTurnContext = vi.spyOn(contextService, 'resolveTurnContext');

    await expect(
      service.buildSnapshot({
        brandId: BRAND_ID,
        organizationId: ORG_ID,
        userId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: BRAND_ID,
      isDeleted: false,
      organizationId: ORG_ID,
    });
    expect(resolveTurnContext).not.toHaveBeenCalled();
  });

  it('ranks memories for the requesting user and never exposes another user personal memory', async () => {
    const { getFeedbackMemoriesForGeneration, service } = createHarness({
      memories: [
        memory({ id: 'mine' }),
        memory({ id: 'theirs', userId: OTHER_USER_ID }),
        memory({
          brandId: BRAND_ID,
          id: 'brand-shared',
          scope: KnowledgeMemoryScope.BRAND,
          userId: OTHER_USER_ID,
        }),
      ],
    });

    const snapshot = await service.buildSnapshot({
      brandId: BRAND_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(getFeedbackMemoriesForGeneration).toHaveBeenCalledWith(
      USER_ID,
      ORG_ID,
      expect.objectContaining({ brandId: BRAND_ID, query: '' }),
    );
    expect(snapshot.memories.map((entry) => entry.id)).toEqual([
      'mine',
      'brand-shared',
    ]);
    expect(
      snapshot.memories.find((entry) => entry.id === 'mine')
        ?.isOwnedByRequester,
    ).toBe(true);
    expect(
      snapshot.memories.find((entry) => entry.id === 'brand-shared')
        ?.isOwnedByRequester,
    ).toBe(false);
    expect(snapshot.memoryPrompt).toContain('summary mine');
    expect(snapshot.memoryPrompt).not.toContain('summary theirs');
  });

  it('renders the same system prompt the chat turn builds, through the shared resolveTurnContext', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T10:00:00.000Z'));
    const { contextService, service } = createHarness();
    const resolveTurnContext = vi.spyOn(contextService, 'resolveTurnContext');

    const snapshot = await service.buildSnapshot({
      brandId: BRAND_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
    });
    const chatTurn = await contextService.resolveSystemPromptAndModel(
      { brandId: BRAND_ID, content: '', source: 'agent' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(resolveTurnContext).toHaveBeenCalledTimes(2);
    expect(resolveTurnContext.mock.calls[0]).toEqual(
      resolveTurnContext.mock.calls[1],
    );
    expect(snapshot.systemPrompt).toBe(
      contextService.renderSystemPrompt(chatTurn.systemPrompt),
    );
    expect(snapshot.systemPrompt).toContain('## Brand: Acme');
    expect(snapshot.systemPrompt).not.toContain('{{date}}');
    expect(snapshot.model).toEqual({
      creditsPerRound: 3,
      key: 'default-model',
      label: 'Default Model',
    });
  });

  it('reports layers, stored-only data, and what the budget trimmed', async () => {
    const { service } = createHarness();

    const snapshot = await service.buildSnapshot({
      brandId: BRAND_ID,
      organizationId: ORG_ID,
      query: '  launch week  ',
      userId: USER_ID,
    });

    expect(snapshot.query).toBe('launch week');
    expect(snapshot.layers.strategy?.topics).toEqual(['ops', 'hiring']);
    expect(snapshot.layers.prompting.conversationStarters).toHaveLength(1);
    expect(snapshot.layers.performanceInsights).toEqual([
      { category: 'timing', confidence: 0.8, insight: 'Evenings win' },
    ]);

    const status = Object.fromEntries(
      snapshot.layerStatus.map((entry) => [entry.key, entry]),
    );
    expect(status.identity).toMatchObject({ isEmpty: false, isInjected: true });
    expect(status.knowledge).toMatchObject({
      editTarget: 'knowledge',
      isEmpty: true,
      isInjected: false,
    });
    // Stored on the brand but not rendered into the prompt.
    expect(status.prompting).toMatchObject({
      editTarget: 'voice',
      isEmpty: false,
      isInjected: false,
    });

    expect(snapshot.budget.capChars).toBe(TEST_BUDGET);
    expect(snapshot.budget.isTrimmed).toBe(true);
    expect(snapshot.budget.usedChars).toBeLessThanOrEqual(TEST_BUDGET);
    expect(snapshot.budget.untrimmedChars).toBeGreaterThan(TEST_BUDGET);
    // Performance history is trimmed before brand voice and guidelines.
    expect(snapshot.budget.trimmedSections).toContainEqual(
      expect.objectContaining({
        header: '## Performance Insights',
        isDropped: true,
        keptChars: 0,
      }),
    );
    expect(
      snapshot.budget.trimmedSections.map((section) => section.header),
    ).not.toContain('## Brand Voice');
  });
});
