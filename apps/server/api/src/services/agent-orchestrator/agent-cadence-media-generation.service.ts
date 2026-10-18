import { approvalGenerationConstraint } from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.schema';
import { McpApprovalPricingService } from '@api/collections/mcp-approvals/services/mcp-approval-pricing.service';
import type { ApprovedGenerationQuoteConstraint } from '@api/helpers/utils/credits/generation-credit-cost.util';
import {
  AGENT_GENERATION_GATEWAY,
  type IAgentGenerationGateway,
} from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import {
  readMediaAssetUrl,
  readMediaResponseString,
  readUsableCdnAssetUrl,
  toMediaResponseRecord,
} from '@api/services/agent-orchestrator/tools/agent-media-generation-response-readers';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { ActivitySource, RouterPriority } from '@genfeedai/contracts';
import {
  DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
  DEFAULT_AGENT_VIDEO_ASPECT_RATIO,
  DEFAULT_AGENT_VIDEO_DURATION_SECONDS,
  resolveAgentGenerationDimensions,
} from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { Inject, Injectable } from '@nestjs/common';

export type CadenceMediaKind = 'image' | 'video';

export interface CadenceMediaScope {
  brandId: string;
  organizationId: string;
  runId: string;
  sourceActionId: string;
  strategyId: string;
  userId: string;
}

export type CadenceMediaQuote =
  | {
      isAvailable: true;
      /** The brand whose identity the generation applies. */
      brandId: string;
      constraint: ApprovedGenerationQuoteConstraint;
      /** What the generation will reserve and charge; 0 when the org pays with its own key. */
      credits: number;
      kind: CadenceMediaKind;
      modelKey: string;
    }
  | { isAvailable: false; reason: string };

export type CadenceMediaResult =
  | { isGenerated: true; ingredientId: string; mediaUrl: string }
  | { isGenerated: false; reason: string };

const MAX_MEDIA_PROMPT_LENGTH = 1500;

/**
 * Media for cadence drafts, priced and dispatched through the same machinery
 * an approved agent `generate` call uses: the router picks the model, the
 * approval pricing service freezes its billable quote (BYOK aware), and the
 * generation endpoint reserves and settles credits under that quote. The
 * endpoint refuses dispatch when the actual price or quantities differ, so a
 * cadence run never spends more than the quote it budgeted.
 */
@Injectable()
export class AgentCadenceMediaGenerationService {
  constructor(
    private readonly estimate: AgentGenerationEstimateService,
    private readonly pricing: McpApprovalPricingService,
    @Inject(AGENT_GENERATION_GATEWAY)
    private readonly gateway: IAgentGenerationGateway,
    private readonly configService: ConfigService,
  ) {}

  async quote(
    kind: CadenceMediaKind,
    prompt: string,
    scope: Pick<CadenceMediaScope, 'brandId' | 'organizationId' | 'userId'>,
  ): Promise<CadenceMediaQuote> {
    const routed = await this.estimate.estimate({
      organizationId: scope.organizationId,
      category: kind,
      ...(kind === 'video'
        ? { duration: DEFAULT_AGENT_VIDEO_DURATION_SECONDS }
        : {}),
      prioritize: RouterPriority.QUALITY,
      prompt: this.clampPrompt(prompt),
    });
    if (!routed.isAvailable || !routed.modelKey)
      return {
        isAvailable: false,
        reason: `No authoritative ${kind} quote is available (${routed.unavailableReason ?? 'unpriced model'}); the opportunity is held without provider dispatch.`,
      };
    let evidence: Awaited<ReturnType<McpApprovalPricingService['prepare']>>;
    try {
      evidence = await this.pricing.prepare(
        'generate',
        { model: routed.modelKey, type: kind },
        {
          brandId: scope.brandId,
          organizationId: scope.organizationId,
          userId: scope.userId,
        },
      );
    } catch {
      evidence = null;
    }
    const constraint = approvalGenerationConstraint(evidence);
    if (!evidence || !constraint)
      return {
        isAvailable: false,
        reason: `The ${kind} model ${routed.modelKey} has no exact billable quote; the opportunity is held without provider dispatch.`,
      };
    return {
      brandId: scope.brandId,
      constraint,
      credits: evidence.credits,
      isAvailable: true,
      kind,
      modelKey: routed.modelKey,
    };
  }

  async generate(
    quote: Extract<CadenceMediaQuote, { isAvailable: true }>,
    prompt: string,
    scope: Omit<CadenceMediaScope, 'brandId'>,
  ): Promise<CadenceMediaResult> {
    const isVideo = quote.kind === 'video';
    // The same dimensions, duration and single output the approval quote froze.
    const dimensions = resolveAgentGenerationDimensions(
      isVideo
        ? DEFAULT_AGENT_VIDEO_ASPECT_RATIO
        : DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
    );
    const text = this.clampPrompt(prompt);
    const body: Record<string, unknown> = {
      agentStrategyId: scope.strategyId,
      brandId: quote.brandId,
      height: dimensions.height,
      model: quote.modelKey,
      prompt: text,
      sourceActionId: scope.sourceActionId,
      text,
      // A cadence run is background work: wait so the draft carries the asset
      // its quality gate and reviewer need.
      waitForCompletion: true,
      width: dimensions.width,
      workflowExecutionId: scope.runId,
      ...(isVideo ? { duration: DEFAULT_AGENT_VIDEO_DURATION_SECONDS } : {}),
    };
    const input = {
      approvedGenerationQuote: quote.constraint,
      body,
      creditsAttribution: {
        description: `Cadence ${quote.kind} generation`,
        source: isVideo
          ? ActivitySource.VIDEO_GENERATION
          : ActivitySource.IMAGE_GENERATION,
      },
      principal: {
        brandId: quote.brandId,
        organizationId: scope.organizationId,
        userId: scope.userId,
      },
    };
    let response: Record<string, unknown>;
    try {
      response = toMediaResponseRecord(
        isVideo
          ? await this.gateway.generateVideo(input)
          : await this.gateway.generateImage(input),
      );
    } catch (error: unknown) {
      return {
        isGenerated: false,
        reason: `The ${quote.kind} generation did not complete (${error instanceof Error ? error.message : 'unknown error'}).`,
      };
    }
    const ingredientId = readMediaResponseString(response, 'id');
    const endpoint = this.configService.ingredientsEndpoint;
    const mediaUrl = isVideo
      ? readMediaAssetUrl(response, endpoint)
      : readUsableCdnAssetUrl(response, endpoint);
    if (!ingredientId || !mediaUrl)
      return {
        isGenerated: false,
        reason: `The ${quote.kind} generation returned no usable asset.`,
      };
    return { ingredientId, isGenerated: true, mediaUrl };
  }

  private clampPrompt(prompt: string): string {
    return prompt.trim().slice(0, MAX_MEDIA_PROMPT_LENGTH);
  }
}
