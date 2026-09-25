import { AgentBrandContextToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-context-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { IAgentBrandContextSnapshot } from '@genfeedai/contracts/interfaces';
import { describe, expect, it, vi } from 'vitest';

const SNAPSHOT: IAgentBrandContextSnapshot = {
  brandId: 'brand-1',
  brandName: 'Acme',
  budget: {
    capChars: 6000,
    isTrimmed: false,
    trimmedSections: [],
    untrimmedChars: 120,
    usedChars: 120,
  },
  generatedAt: '2026-09-25T10:00:00.000Z',
  id: 'brand-1',
  layerStatus: [
    {
      editTarget: 'profile',
      isEmpty: false,
      isInjected: true,
      key: 'identity',
    },
    { editTarget: 'voice', isEmpty: true, isInjected: false, key: 'voice' },
  ],
  layers: {
    identity: { name: 'Acme' },
    knowledge: [],
    patterns: [],
    performanceInsights: [],
    prompting: { conversationStarters: [], seeds: [] },
    recentPosts: [],
  },
  layersUsed: ['brandIdentity'],
  memories: [
    {
      id: 'memory-1',
      isOwnedByRequester: true,
      kind: 'preference',
      scope: 'personal',
      summary: 'Prefers short hooks',
    },
  ],
  memoryPrompt: 'Saved memory to consider: ...',
  model: { creditsPerRound: 3, key: 'model-a' },
  query: '',
  skills: [{ isBuiltIn: true, name: 'Hooks', slug: 'hooks' }],
  systemPrompt: 'You are the GenFeed AI assistant\n\n## Brand: Acme',
};

const CONTEXT: ToolExecutionContext = {
  organizationId: 'org-1',
  userId: 'user-1',
  validatedScope: {
    brandId: 'brand-1',
  } as ToolExecutionContext['validatedScope'],
};

function createHandler() {
  const buildSnapshot = vi.fn().mockResolvedValue(SNAPSHOT);
  return {
    buildSnapshot,
    handler: new AgentBrandContextToolHandler({ buildSnapshot } as never),
  };
}

describe('AgentBrandContextToolHandler', () => {
  it('builds the snapshot for the validated thread brand and requester', async () => {
    const { buildSnapshot, handler } = createHandler();

    const result = await handler.execute(
      'get_brand_context',
      { query: 'launch week' },
      CONTEXT,
    );

    expect(buildSnapshot).toHaveBeenCalledWith({
      brandId: 'brand-1',
      organizationId: 'org-1',
      query: 'launch week',
      userId: 'user-1',
    });
    expect(result).toMatchObject({
      creditsUsed: 0,
      data: {
        brandName: 'Acme',
        gaps: [{ editIn: 'voice', layer: 'voice' }],
        model: { creditsPerRound: 3, key: 'model-a' },
        settingsPath: '/settings/agent-context',
        systemPrompt: SNAPSHOT.systemPrompt,
      },
      success: true,
    });
  });

  it('omits the prompt text when includeSystemPrompt is false', async () => {
    const { handler } = createHandler();

    const result = await handler.execute(
      'get_brand_context',
      { includeSystemPrompt: false },
      CONTEXT,
    );

    expect(result.data).not.toHaveProperty('systemPrompt');
    expect(result.data).not.toHaveProperty('memoryPrompt');
  });

  it('fails closed without a brand', async () => {
    const { buildSnapshot, handler } = createHandler();

    const result = await handler.execute(
      'get_brand_context',
      {},
      { organizationId: 'org-1', userId: 'user-1' },
    );

    expect(result.success).toBe(false);
    expect(buildSnapshot).not.toHaveBeenCalled();
  });
});
