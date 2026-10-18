import { testMcpApprovalPricing } from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.fixture';
import { approvalGenerationConstraint } from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.schema';
import type { McpApprovalPricingService } from '@api/collections/mcp-approvals/services/mcp-approval-pricing.service';
import { AgentCadenceMediaGenerationService } from '@api/services/agent-orchestrator/agent-cadence-media-generation.service';
import type { IAgentGenerationGateway } from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import type { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { ActivitySource } from '@genfeedai/contracts';
import {
  DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
  DEFAULT_AGENT_VIDEO_DURATION_SECONDS,
  resolveAgentGenerationDimensions,
} from '@genfeedai/contracts/constants';
import { AgentGenerationQuoteUnavailableReason } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import { describe, expect, it, vi } from 'vitest';

const scope = {
  brandId: 'brand',
  organizationId: 'organization',
  userId: 'user',
};

function setup() {
  const pricing = testMcpApprovalPricing();
  const estimate = {
    estimate: vi.fn().mockResolvedValue({
      credits: pricing.credits,
      isAvailable: true,
      modelKey: pricing.snapshot.modelKey,
    }),
  };
  const approvals = { prepare: vi.fn().mockResolvedValue(pricing) };
  const gateway = {
    generateImage: vi.fn().mockResolvedValue({
      data: {
        attributes: { cdnUrl: 'https://cdn.genfeed.ai/images/image.png' },
        id: 'image',
      },
    }),
    generateVideo: vi.fn().mockResolvedValue({
      data: {
        attributes: { cdnUrl: 'https://cdn.genfeed.ai/videos/video.mp4' },
        id: 'video',
      },
    }),
  };
  const service = new AgentCadenceMediaGenerationService(
    estimate as unknown as AgentGenerationEstimateService,
    approvals as unknown as McpApprovalPricingService,
    gateway as unknown as IAgentGenerationGateway,
    {
      ingredientsEndpoint: 'https://cdn.genfeed.ai/ingredients',
    } as unknown as ConfigService,
  );
  return { approvals, estimate, gateway, pricing, service };
}

describe('AgentCadenceMediaGenerationService', () => {
  it('freezes the routed model into the approval pricing constraint', async () => {
    const s = setup();
    const quote = await s.service.quote('image', 'Visual for launch', scope);
    expect(s.estimate.estimate).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'image',
        organizationId: 'organization',
        prompt: 'Visual for launch',
      }),
    );
    expect(s.approvals.prepare).toHaveBeenCalledWith(
      'generate',
      { model: s.pricing.snapshot.modelKey, type: 'image' },
      scope,
    );
    expect(quote).toEqual({
      brandId: 'brand',
      constraint: approvalGenerationConstraint(s.pricing),
      credits: s.pricing.credits,
      isAvailable: true,
      kind: 'image',
      modelKey: s.pricing.snapshot.modelKey,
    });
  });

  it('routes video at the default duration it will execute with', async () => {
    const s = setup();
    await s.service.quote('video', 'Teaser', scope);
    expect(s.estimate.estimate).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'video',
        duration: DEFAULT_AGENT_VIDEO_DURATION_SECONDS,
      }),
    );
  });

  it('reports an unquotable route without preparing consent', async () => {
    const s = setup();
    s.estimate.estimate.mockResolvedValue({
      credits: null,
      isAvailable: false,
      modelKey: null,
      unavailableReason:
        AgentGenerationQuoteUnavailableReason.MODEL_UNAVAILABLE,
    });
    const quote = await s.service.quote('image', 'Visual', scope);
    expect(quote).toEqual({
      isAvailable: false,
      reason: expect.stringContaining('MODEL_UNAVAILABLE'),
    });
    expect(s.approvals.prepare).not.toHaveBeenCalled();
  });

  it('reports a model without exact billable evidence as unavailable', async () => {
    const s = setup();
    s.approvals.prepare.mockRejectedValue(new Error('quote is unavailable'));
    const quote = await s.service.quote('image', 'Visual', scope);
    expect(quote.isAvailable).toBe(false);
  });

  it('dispatches the pinned model under the approved quote and waits for the asset', async () => {
    const s = setup();
    const quote = await s.service.quote('image', 'Visual', scope);
    if (!quote.isAvailable) throw new Error('expected a quote');
    const result = await s.service.generate(quote, 'Visual with copy', {
      organizationId: 'organization',
      runId: 'run',
      sourceActionId: 'opportunity:image',
      strategyId: 'strategy',
      userId: 'user',
    });
    const dimensions = resolveAgentGenerationDimensions(
      DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
    );
    expect(s.gateway.generateImage).toHaveBeenCalledWith({
      approvedGenerationQuote: quote.constraint,
      body: {
        agentStrategyId: 'strategy',
        brandId: 'brand',
        height: dimensions.height,
        model: s.pricing.snapshot.modelKey,
        prompt: 'Visual with copy',
        sourceActionId: 'opportunity:image',
        text: 'Visual with copy',
        waitForCompletion: true,
        width: dimensions.width,
        workflowExecutionId: 'run',
      },
      creditsAttribution: {
        description: 'Cadence image generation',
        source: ActivitySource.IMAGE_GENERATION,
      },
      principal: scope,
    });
    expect(result).toEqual({
      ingredientId: 'image',
      isGenerated: true,
      mediaUrl: 'https://cdn.genfeed.ai/images/image.png',
    });
  });

  it('returns a reason instead of throwing when the provider fails', async () => {
    const s = setup();
    s.gateway.generateVideo.mockRejectedValue(new Error('Gateway timeout'));
    const quote = await s.service.quote('video', 'Teaser', scope);
    if (!quote.isAvailable) throw new Error('expected a quote');
    const result = await s.service.generate(quote, 'Teaser', {
      organizationId: 'organization',
      runId: 'run',
      sourceActionId: 'opportunity:video',
      strategyId: 'strategy',
      userId: 'user',
    });
    expect(result).toEqual({
      isGenerated: false,
      reason: expect.stringContaining('Gateway timeout'),
    });
  });
});
