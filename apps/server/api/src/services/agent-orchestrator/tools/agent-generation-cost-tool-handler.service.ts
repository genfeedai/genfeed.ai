import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import {
  AgentGenerationQuoteUnavailableReason,
  type AgentToolResult,
} from '@genfeedai/contracts/interfaces';
import type { StudioGenerationCostEstimate } from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import {
  buildStudioGenerationQuoteRequest,
  isAutoStudioModelKey,
} from '@genfeedai/pricing';
import { BadRequestException, Injectable } from '@nestjs/common';

function readOptionalString(
  value: unknown,
): { ok: true; value?: string } | { ok: false } {
  if (value === undefined) return { ok: true };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  return { ok: true, value: trimmed.length > 0 ? trimmed : undefined };
}

function readOptionalNumber(
  value: unknown,
): { ok: true; value?: number } | { ok: false } {
  if (value === undefined) return { ok: true };
  if (typeof value !== 'number') return { ok: false };
  return { ok: true, value };
}

function readFiniteBalance(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

/**
 * Read-only Studio estimate plus the credits-bar balance.
 * Prices nothing itself: the estimate is the server quote admission charges
 * (`AgentGenerationEstimateService`) and the balance is the wallet.
 */
@Injectable()
export class AgentGenerationCostToolHandler {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly estimateService: AgentGenerationEstimateService,
  ) {}

  async execute(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const balance = await this.readBalance(ctx.organizationId);
    const type =
      params.type === 'image' ||
      params.type === 'image-edit' ||
      params.type === 'video'
        ? params.type
        : null;
    const modelKey = readOptionalString(params.modelKey);
    const aspectRatio = readOptionalString(params.aspectRatio);
    const resolution = readOptionalString(params.resolution);
    const duration = readOptionalNumber(params.duration);
    const outputs = readOptionalNumber(params.outputs);
    if (
      !type ||
      !modelKey.ok ||
      !aspectRatio.ok ||
      !resolution.ok ||
      !duration.ok ||
      !outputs.ok
    ) {
      return this.result(balance, {
        credits: null,
        status: 'unavailable',
        unavailableReason:
          AgentGenerationQuoteUnavailableReason.INSUFFICIENT_INPUT,
      });
    }

    // Auto never prices here: the model, and so the quote, is not chosen yet.
    if (isAutoStudioModelKey(modelKey.value)) {
      return this.result(balance, { credits: null, status: 'auto' });
    }

    const request = buildStudioGenerationQuoteRequest({
      aspectRatio: aspectRatio.value,
      duration: duration.value,
      modelKey: modelKey.value,
      outputs: outputs.value,
      resolution: resolution.value,
      type,
    });
    if (!request) {
      return this.result(balance, {
        credits: null,
        status: 'unavailable',
        unavailableReason:
          AgentGenerationQuoteUnavailableReason.INSUFFICIENT_INPUT,
      });
    }

    try {
      const quote = await this.estimateService.estimate({
        ...request,
        organizationId: ctx.organizationId,
      });
      return this.result(
        balance,
        quote.isAvailable && quote.credits !== null
          ? { credits: quote.credits, status: 'estimated' }
          : {
              credits: null,
              status: 'unavailable',
              unavailableReason: quote.unavailableReason,
            },
      );
    } catch (error: unknown) {
      // Invalid output counts reject; the tool still answers with the balance.
      if (error instanceof BadRequestException) {
        return this.result(balance, {
          credits: null,
          status: 'unavailable',
          unavailableReason:
            AgentGenerationQuoteUnavailableReason.MISSING_SETTING,
        });
      }
      throw error;
    }
  }

  private async readBalance(organizationId: string): Promise<number | null> {
    try {
      return readFiniteBalance(
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        ),
      );
    } catch {
      return null;
    }
  }

  private result(
    balance: number | null,
    estimate: StudioGenerationCostEstimate,
  ): AgentToolResult {
    return {
      creditsUsed: 0,
      data: { balance, estimate },
      success: true,
    };
  }
}
