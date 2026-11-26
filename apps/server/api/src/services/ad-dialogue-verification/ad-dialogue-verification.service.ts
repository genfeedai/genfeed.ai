import { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { IngredientCategory } from '@genfeedai/contracts';
import {
  AD_DIALOGUE_MAX_WORD_ERROR_RATE,
  diffAdDialogue,
  srtToText,
} from '@genfeedai/contracts/constants/ad-dialogue-diff';
import type { GenerationAdDialogueReceipt } from '@genfeedai/contracts/interfaces/content/generation-harness.interface';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

type HarnessJson = Record<string, unknown> & {
  adDialogue?: GenerationAdDialogueReceipt;
};

function readHarness(value: unknown): HarnessJson | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as HarnessJson)
    : null;
}

/**
 * Checks the finished take of an ad preset with a locked audio reference
 * against the script (#7927). The result is evidence on the output's
 * generation receipt: a take that drifts is marked `needs_review` and left for
 * the member to re-roll through the normal credit flow, and a check that could
 * not run never fails the generation.
 */
@Traced()
@Injectable()
export class AdDialogueVerificationService {
  private readonly context = { service: AdDialogueVerificationService.name };

  constructor(
    private readonly prisma: PrismaService,
    private readonly whisper: WhisperService,
    private readonly costLedger: MediaVendorCostLedgerService,
    private readonly logger: LoggerService,
  ) {}

  /** Only an output whose receipt is still `pending` is transcribed, so a repeated signal costs nothing. */
  async verify(organizationId: string, ingredientId: string): Promise<void> {
    const row = await this.prisma.ingredient.findFirst({
      select: {
        brandId: true,
        generationHarness: true,
        id: true,
        metadata: { select: { duration: true, result: true } },
        s3Key: true,
      },
      where: scopedWhere(organizationId, {
        category: IngredientCategory.VIDEO,
        id: ingredientId,
      }),
    });
    const harness = readHarness(row?.generationHarness);
    const pending = harness?.adDialogue;
    if (!row || !harness || pending?.status !== 'pending') return;

    const result = await this.compare(organizationId, row, pending.script);
    await this.prisma.ingredient.updateMany({
      data: {
        generationHarness: toPrismaJson({ ...harness, adDialogue: result }),
      },
      where: scopedWhere(organizationId, {
        generationHarness: {
          equals: toPrismaJson(harness),
        },
        id: ingredientId,
      }),
    });
  }

  private async compare(
    organizationId: string,
    row: {
      brandId: string | null;
      id: string;
      metadata: { duration: number; result: string } | null;
      s3Key: string | null;
    },
    script: string,
  ): Promise<GenerationAdDialogueReceipt> {
    let srt: string;
    try {
      srt = await this.whisper.generateCaptions(
        row.id,
        { metadata: row.metadata, s3Key: row.s3Key },
        organizationId,
      );
    } catch (error: unknown) {
      this.logger.warn('Ad dialogue transcription failed', {
        ...this.context,
        error,
        ingredientId: row.id,
        organizationId,
      });
      return {
        reasonCode: 'transcription_unavailable',
        script,
        status: 'not_checked',
      };
    }
    await this.recordSpend(organizationId, row);
    const diff = diffAdDialogue(script, srtToText(srt));
    const isMatch = diff.wordErrorRate <= AD_DIALOGUE_MAX_WORD_ERROR_RATE;
    return {
      added: diff.added,
      changed: diff.changed,
      checkedAt: new Date().toISOString(),
      expectedWordCount: diff.expectedWordCount,
      maxWordErrorRate: AD_DIALOGUE_MAX_WORD_ERROR_RATE,
      removed: diff.removed,
      script,
      status: isMatch ? 'matched' : 'needs_review',
      wordErrorRate: diff.wordErrorRate,
    };
  }

  /** Replicate's Whisper reports no per-call price, so the row records the duration for later attribution. */
  private async recordSpend(
    organizationId: string,
    row: {
      brandId: string | null;
      id: string;
      metadata: { duration: number } | null;
    },
  ): Promise<void> {
    try {
      await this.costLedger.record({
        brandId: row.brandId,
        category: 'ad-dialogue-verification-transcription',
        costEvidence: 'unknown',
        ingredientId: row.id,
        isByok: false,
        model: 'openai/whisper',
        organizationId,
        pricingType: 'per-second',
        provider: 'replicate',
        units: row.metadata?.duration ?? 0,
        vendorCostMicros: 0,
      });
    } catch (error: unknown) {
      this.logger.warn('Ad dialogue transcription ledger write failed', {
        ...this.context,
        error,
        ingredientId: row.id,
        organizationId,
      });
    }
  }
}
