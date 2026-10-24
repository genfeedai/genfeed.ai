import type { McpApprovalPricingEvidence } from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.schema';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { ByokService } from '@api/services/byok/byok.service';
import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import {
  AgentGenerationEstimateService,
  type PreparedAgentGenerationQuote,
} from '@api/services/router/agent-generation-estimate.service';
import { RouterPriority } from '@genfeedai/contracts';
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

const QUOTE_UNAVAILABLE =
  'A model-specific quote is unavailable. Select a supported model and complete its generation settings before requesting approval.';

const UNAVAILABLE_REASON_DETAIL: Partial<
  Record<AgentGenerationQuoteUnavailableReason, string>
> = {
  [AgentGenerationQuoteUnavailableReason.MODEL_UNAVAILABLE]:
    'The model is not enabled for this organization. Pick another key from get_generation_options.',
  [AgentGenerationQuoteUnavailableReason.PRICING_UNRESOLVED]:
    'The model has no reviewed price for these settings. Set resolution or quality explicitly, or pick another model.',
};

/** Why a quote is unavailable, in words that name the input to change. */
function describeUnavailable(quote: PreparedAgentGenerationQuote | null) {
  const detail =
    quote?.unavailableDetail ??
    (quote?.unavailableReason
      ? UNAVAILABLE_REASON_DETAIL[quote.unavailableReason]
      : undefined);
  return detail
    ? `A model-specific quote is unavailable: ${detail}`
    : QUOTE_UNAVAILABLE;
}

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
      throw new BadRequestException(describeUnavailable(quote));
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
      return this.unavailable('Only image and video generation are quoted.');
    }
    const video = args.type === 'video';
    const requested =
      context.generationSettings?.model ??
      this.string(args.model) ??
      context.generationModelOverride;
    const isRouted = !requested || requested === 'auto' || requested === 'Auto';
    const prompt =
      this.string(args.prompt) ??
      this.string(args.description) ??
      this.string(args.text);
    // An automatic route is frozen here: the router picks the model now, the
    // snapshot records it, and the approved execution is pinned to that model
    // rather than routing again.
    if (isRouted && !prompt)
      return this.unavailable(
        'No model was selected and there is no prompt to route from. Pass model with a key from get_generation_options, or a prompt.',
      );
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
    // A video tariff can bill reference media (duration, tokens), and its
    // quantities come only from trusted media resolution, so video requests
    // with any reference input stay unquotable. An image tariff bills the
    // output alone: admission prices an image without its references, so the
    // consent quote is the same figure. Dispatch re-prices the prepared
    // request and rejects a frozen quote that no longer matches.
    if (
      video &&
      (args.references ||
        args.characterHandles ||
        args.videoReferences ||
        args.audioUrl ||
        args.imageUrl ||
        args.endFrame ||
        context.attachmentUrls?.length)
    ) {
      return this.unavailable(
        'Video with reference media cannot be quoted yet. Remove references, characterHandles, imageUrl, endFrame, audioUrl and videoReferences, or generate in Studio.',
      );
    }
    if (!video && (args.videoReferences || args.audioUrl || args.endFrame)) {
      return this.unavailable(
        'videoReferences, audioUrl and endFrame apply to video only; remove them from an image request.',
      );
    }
    return this.estimate.estimateWithSnapshot({
      organizationId: context.organizationId,
      category: args.type,
      ...(isRouted
        ? {
            prioritize: context.generationPriority || RouterPriority.QUALITY,
            prompt,
          }
        : { modelKey: requested }),
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

  private unavailable(unavailableDetail?: string): AgentGenerationQuote {
    return {
      credits: null,
      isAvailable: false,
      modelKey: null,
      ...(unavailableDetail ? { unavailableDetail } : {}),
      unavailableReason:
        AgentGenerationQuoteUnavailableReason.INSUFFICIENT_INPUT,
    };
  }
}
