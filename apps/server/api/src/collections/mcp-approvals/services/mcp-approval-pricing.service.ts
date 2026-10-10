import type { McpApprovalPricingEvidence } from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.schema';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { ByokService } from '@api/services/byok/byok.service';
import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import {
  AgentGenerationEstimateService,
  type PreparedAgentGenerationQuote,
} from '@api/services/router/agent-generation-estimate.service';
import {
  DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
  DEFAULT_AGENT_VIDEO_ASPECT_RATIO,
  DEFAULT_AGENT_VIDEO_DURATION_SECONDS,
  resolveAgentGenerationDimensions,
} from '@genfeedai/contracts/constants';
import {
  type AgentGenerationQuote,
  AgentGenerationQuoteUnavailableReason,
} from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

/** Approval prices are read-only quotes of the concrete Agent request. */
@Injectable()
export class McpApprovalPricingService {
  constructor(
    private readonly estimate: AgentGenerationEstimateService,
    @Optional() private readonly byok?: ByokService,
  ) {}

  async prepare(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<McpApprovalPricingEvidence | null> {
    if (
      toolName !== 'generate' ||
      (args.type !== 'image' && args.type !== 'video')
    )
      return null;
    const quote = await this.quote(toolName, args, context);
    if (
      !quote?.isAvailable ||
      !quote.snapshot ||
      !quote.modelKey ||
      quote.snapshot.modelKey !== quote.modelKey ||
      quote.credits !== quote.snapshot.credits
    ) {
      throw new BadRequestException(
        'A model-specific quote is unavailable. Select a supported model and complete its generation settings before requesting approval.',
      );
    }
    const provider = resolveModelByokProvider(
      quote.modelKey,
      quote.snapshot.provider,
    );
    const isByok =
      provider && this.byok
        ? Boolean(
            await this.byok.resolveApiKey(context.organizationId, provider),
          )
        : false;
    const { quotedAt: _quotedAt, ...identity } = quote.snapshot;
    return {
      version: 1,
      credits: isByok ? 0 : quote.snapshot.credits,
      billingMode: isByok ? 'byok' : 'credits',
      pricingHash: quoteSnapshotHash(identity),
      snapshot: quote.snapshot,
    };
  }

  async quote(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<PreparedAgentGenerationQuote | null> {
    if (toolName !== 'generate') return null;
    if (args.type !== 'image' && args.type !== 'video') {
      return this.unavailable();
    }
    const video = args.type === 'video';
    const model =
      context.generationSettings?.model ??
      this.string(args.model) ??
      context.generationModelOverride;
    // An automatic route must be frozen before it can be offered for consent.
    // Do not display a floor as though it were the selected model's quote.
    if (!model || model === 'auto' || model === 'Auto')
      return this.unavailable();
    const aspectRatio =
      context.generationSettings?.aspectRatio ||
      this.string(args.aspectRatio) ||
      (video
        ? DEFAULT_AGENT_VIDEO_ASPECT_RATIO
        : DEFAULT_AGENT_IMAGE_ASPECT_RATIO);
    const dimensions = resolveAgentGenerationDimensions(aspectRatio);
    const rawOutputs = context.generationSettings?.outputs ?? args.outputs;
    const outputs =
      !video && typeof rawOutputs === 'number' && Number.isFinite(rawOutputs)
        ? Math.min(8, Math.max(1, Math.round(rawOutputs)))
        : 1;
    // References need the same trusted media resolution as dispatch. A raw
    // caller URL or persona handle cannot establish its billable quantities.
    if (
      args.references ||
      args.characterHandles ||
      args.videoReferences ||
      args.audioUrl ||
      args.imageUrl ||
      args.endFrame ||
      context.attachmentUrls?.length
    ) {
      return this.unavailable();
    }
    return this.estimate.estimateWithSnapshot({
      organizationId: context.organizationId,
      category: args.type,
      modelKey: model,
      aspectRatio,
      dimensions,
      outputs,
      duration: video
        ? context.generationSettings?.duration ||
          (typeof args.duration === 'number' ? args.duration : undefined) ||
          DEFAULT_AGENT_VIDEO_DURATION_SECONDS
        : undefined,
      resolution: video
        ? this.string(args.resolution)
        : (context.generationSettings?.resolution ??
          this.string(args.resolution)),
    });
  }

  private string(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private unavailable(): AgentGenerationQuote {
    return {
      credits: null,
      isAvailable: false,
      modelKey: null,
      unavailableReason:
        AgentGenerationQuoteUnavailableReason.INSUFFICIENT_INPUT,
    };
  }
}
