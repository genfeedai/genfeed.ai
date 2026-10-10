import { testMcpApprovalPricing } from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.fixture';
import { McpApprovalPricingService } from '@api/collections/mcp-approvals/services/mcp-approval-pricing.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { ByokService } from '@api/services/byok/byok.service';
import type { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { resolveAgentGenerationDimensions } from '@genfeedai/contracts/constants';
import { describe, expect, it, vi } from 'vitest';

function build(credits = 2) {
  const estimate = vi
    .fn()
    .mockResolvedValue({ credits, isAvailable: true, modelKey: 'selected' });
  const service = new McpApprovalPricingService({
    estimateWithSnapshot: estimate,
  } as unknown as AgentGenerationEstimateService);
  const context: ToolExecutionContext = {
    organizationId: 'org-1',
    userId: 'user-1',
  };
  return { service, estimate, context };
}

describe('MCP approval selected-model pricing', () => {
  it('prepares immutable canonical tariff evidence without caller estimates', async () => {
    const { service, estimate, context } = build();
    const pricing = testMcpApprovalPricing();
    estimate.mockResolvedValue({
      credits: pricing.credits,
      isAvailable: true,
      modelKey: pricing.snapshot.modelKey,
      snapshot: pricing.snapshot,
    });
    await expect(
      service.prepare(
        'generate',
        { type: 'image', model: 'selected-model', maximumCredits: 999 },
        context,
      ),
    ).resolves.toEqual(pricing);
  });

  it('freezes BYOK as a zero Genfeed charge without storing a decrypted key', async () => {
    const { estimate, context } = build();
    const pricing = testMcpApprovalPricing();
    estimate.mockResolvedValue({
      credits: pricing.credits,
      isAvailable: true,
      modelKey: pricing.snapshot.modelKey,
      snapshot: pricing.snapshot,
    });
    const resolveApiKey = vi
      .fn()
      .mockResolvedValue({ apiKey: 'never-store-this-key' });
    const service = new McpApprovalPricingService(
      {
        estimateWithSnapshot: estimate,
      } as unknown as AgentGenerationEstimateService,
      { resolveApiKey } as unknown as ByokService,
    );
    const prepared = await service.prepare(
      'generate',
      { type: 'image', model: 'selected-model' },
      context,
    );
    expect(prepared).toMatchObject({
      credits: 0,
      billingMode: 'byok',
      snapshot: pricing.snapshot,
    });
    expect(JSON.stringify(prepared)).not.toContain('never-store-this-key');
    expect(resolveApiKey).toHaveBeenCalledWith('org-1', 'replicate');
  });

  it('refuses to create consent when the concrete model cannot be quoted', async () => {
    const { service, context } = build();
    await expect(
      service.prepare('generate', { type: 'image' }, context),
    ).rejects.toThrow('quote is unavailable');
  });

  it('preserves nonvisual generation confirmation without changing its billing owner', async () => {
    const { service, estimate, context } = build();
    await expect(
      service.prepare('generate', { type: 'voice', prompt: 'Hello' }, context),
    ).resolves.toBeNull();
    expect(estimate).not.toHaveBeenCalled();
  });
  it('quotes the selected image and concrete Agent output count instead of the image floor', async () => {
    const { service, estimate, context } = build();
    await expect(
      service.quote(
        'generate',
        {
          type: 'image',
          model: 'flux-schnell',
          outputs: 2.6,
          aspectRatio: '9:16',
          maximumCredits: 999,
        },
        context,
      ),
    ).resolves.toMatchObject({ credits: 2 });
    expect(estimate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        organizationId: 'org-1',
        category: 'image',
        modelKey: 'flux-schnell',
        outputs: 3,
        dimensions: resolveAgentGenerationDimensions('9:16'),
      }),
    );
    expect(estimate.mock.calls[0][0]).not.toHaveProperty('maximumCredits');
  });

  it('uses the exact video duration and provider-native resolution for the 64-credit quote', async () => {
    const { service, estimate, context } = build(64);
    await expect(
      service.quote(
        'generate',
        {
          type: 'video',
          model: 'hailuo-fast',
          duration: 6,
          resolution: '768p',
        },
        context,
      ),
    ).resolves.toMatchObject({ credits: 64 });
    expect(estimate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        modelKey: 'hailuo-fast',
        duration: 6,
        resolution: '768p',
        outputs: 1,
      }),
    );
  });

  it('uses trusted context overrides with the same precedence as dispatch', async () => {
    const { service, estimate, context } = build();
    await service.quote(
      'generate',
      {
        type: 'image',
        model: 'caller-model',
        outputs: 8,
        resolution: '4k',
        aspectRatio: '1:1',
      },
      {
        ...context,
        generationSettings: {
          model: 'trusted-model',
          outputs: 2,
          resolution: '1k',
          aspectRatio: '16:9',
        },
      },
    );
    expect(estimate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        modelKey: 'trusted-model',
        outputs: 2,
        resolution: '1k',
        dimensions: resolveAgentGenerationDimensions('16:9'),
      }),
    );
  });

  it.each([
    { type: 'image' },
    { type: 'image', model: 'Auto' },
    { type: 'voice', model: 'voice' },
    { type: 'video', model: 'model', imageUrl: 'https://example.com/a' },
    { type: 'video', model: 'model', videoReferences: ['ingredient-1'] },
  ])('keeps unresolved concrete requests unknown: %j', async (args) => {
    const { service, estimate, context } = build();
    await expect(
      service.quote('generate', args, context),
    ).resolves.toMatchObject({ credits: null, isAvailable: false });
    expect(estimate).not.toHaveBeenCalled();
  });

  it('leaves other tool pricing to its existing owner', async () => {
    const { service, estimate, context } = build();
    await expect(
      service.quote('get_articles', {}, context),
    ).resolves.toBeNull();
    expect(estimate).not.toHaveBeenCalled();
  });
});
