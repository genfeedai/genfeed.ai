import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import {
  admitBreakoutGenerationContinuation,
  type BreakoutGenerationAdmission,
  runWithBreakoutGenerationAdmission,
} from '@api/collections/outliers/services/breakout-generation-admission.util';
import {
  BREAKOUT_VISUAL_QUALITY_KEY,
  type BreakoutQualityBinding,
  readBreakoutVisualEvidence,
} from '@api/collections/outliers/services/breakout-visual-quality.util';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource, CreditReservationStatus } from '@genfeedai/contracts';
import {
  GENERATION_POOL_WORKLOAD_TYPE,
  MEDIA_GENERATION_HOLD_TTL_MS,
} from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';
import { readRecord } from '@genfeedai/utils/data/extract.util';
import { ConflictException, Injectable } from '@nestjs/common';

/** A prompt bound that covers the evaluation template, rubric and the longest caption. */
const EVALUATION_PROMPT_CHARACTERS = 16_000;
const EVALUATION_IMAGE_REFERENCE_CHARACTERS = 2_048;
/** The evaluation model reads a video as this many sampled frames. */
const VIDEO_EVALUATION_FRAMES = 4;

export type BreakoutVisualPart = Readonly<{
  url: string;
  mediaKind: 'image' | 'video';
  durationSeconds: number | null;
}>;
export type BreakoutVisualQualityRequest = Readonly<{
  admission: Readonly<BreakoutGenerationAdmission>;
  binding: Readonly<BreakoutQualityBinding>;
  generationKey: string;
  caption: string;
  parts: readonly BreakoutVisualPart[];
  /** Smallest remaining budget of the output's scope; one evaluation may never exceed it. */
  maximumCredits: number;
}>;

/**
 * The existing visual judge (`EvaluationsOperationsService`: image, or video from sampled
 * frames) run once per attached visual. Each evaluation is its own deterministic component:
 * reserved through the normal credit path before the paid call and settled to the actual
 * charge afterwards. A retained hold means an earlier attempt already ran, so it is never
 * repeated. Never publishes.
 */
@Injectable()
export class BreakoutVisualQualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluations: EvaluationsOperationsService,
    private readonly models: ModelsService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly credits: CreditsUtilsService,
  ) {}

  /** First-attempt upper bound of one evaluation; the planner and the hold use this one number. */
  async estimateCredits(
    mediaKind: 'image' | 'video',
    reauthorize: () => Promise<void>,
  ): Promise<number> {
    await reauthorize();
    const model = await this.models.findOne({
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });
    const settings = await this.platformSettings.getFeatureSettings();
    await reauthorize();
    if (!model || !(settings.generationMaxTokens > 0))
      throw new ConflictException('breakout_visual_quality_price_unavailable');
    const references = mediaKind === 'video' ? VIDEO_EVALUATION_FRAMES : 1;
    const quote = calculateEstimatedTextCredits(
      model,
      {
        prompt: 'x'.repeat(EVALUATION_PROMPT_CHARACTERS),
        images: Array.from({ length: references }, () =>
          'x'.repeat(EVALUATION_IMAGE_REFERENCE_CHARACTERS),
        ),
      },
      'x'.repeat(settings.generationMaxTokens * 4),
    );
    if (!Number.isFinite(quote) || quote < 0)
      throw new ConflictException('breakout_visual_quality_price_unavailable');
    return quote;
  }

  async evaluate(request: BreakoutVisualQualityRequest): Promise<void> {
    const { admission, binding, parts } = request;
    const { scope } = admission;
    const evidence = await readBreakoutVisualEvidence(
      this.prisma,
      scope.organizationId,
      binding,
      parts.length,
    );
    await admission.reauthorize(this.prisma);
    for (const [index, part] of parts.entries()) {
      if (evidence.scores[index] !== null) continue;
      await this.evaluatePart(request, part, index);
    }
  }

  private async evaluatePart(
    request: BreakoutVisualQualityRequest,
    part: BreakoutVisualPart,
    index: number,
  ): Promise<void> {
    const { admission, binding } = request;
    const { scope } = admission;
    const component: BreakoutGenerationAdmission = {
      ...admission,
      componentKey: `${request.generationKey}:quality:visual:${index + 1}`,
    };
    const maximum = await this.estimateCredits(part.mediaKind, () =>
      admission.reauthorize(this.prisma),
    );
    if (maximum > request.maximumCredits)
      throw new ConflictException('breakout_quality_budget_unavailable');
    // A hold for this component means an earlier paid attempt already ran: never repeat it.
    const retained = await this.credits.findReservationForWorkload({
      organizationId: scope.organizationId,
      workloadId: component.componentKey,
      workloadType: GENERATION_POOL_WORKLOAD_TYPE,
    });
    await admission.reauthorize(this.prisma);
    if (retained)
      throw new ConflictException('breakout_quality_paid_retry_held');
    let billed = 0;
    let isBilled = false;
    let result: unknown;
    await runWithBreakoutGenerationAdmission(
      this.prisma,
      component,
      async () => {
        await this.prisma.$transaction((tx) =>
          admitBreakoutGenerationContinuation(tx, component, maximum),
        );
        const hold =
          maximum > 0
            ? await this.credits.reserveCredits({
                organizationId: scope.organizationId,
                brandId: scope.brandId,
                actorUserId: admission.actorUserId,
                amount: maximum,
                idempotencyKey: `${GENERATION_POOL_WORKLOAD_TYPE}:${component.componentKey}`,
                workloadId: component.componentKey,
                workloadType: GENERATION_POOL_WORKLOAD_TYPE,
                source: ActivitySource.SCRIPT,
                description: 'Breakout response visual quality evaluation',
                expiresAt: new Date(Date.now() + MEDIA_GENERATION_HOLD_TTL_MS),
              })
            : null;
        if (hold && hold.status !== CreditReservationStatus.RESERVED)
          throw new ConflictException('breakout_quality_hold_not_dispatchable');
        await admission.reauthorize(this.prisma);
        const context = {
          prompt: request.caption,
          platform: scope.platform,
          ...(part.durationSeconds !== null
            ? { durationSeconds: part.durationSeconds }
            : {}),
        };
        const onBilling = (amount: number) => {
          isBilled = true;
          billed += amount;
        };
        result =
          part.mediaKind === 'image'
            ? await this.evaluations.evaluateImage(
                part.url,
                context,
                scope.organizationId,
                onBilling,
              )
            : await this.evaluations.evaluateVideo(
                part.url,
                context,
                scope.organizationId,
                onBilling,
              );
        await admission.reauthorize(this.prisma);
        // The provider answered: the charge is owed. A charge above the hold is a ledger
        // discrepancy that needs reconciliation, never a silent overdraft.
        const actual = isBilled ? billed : maximum;
        if (!Number.isFinite(actual) || actual < 0 || actual > maximum)
          throw new ConflictException(
            'breakout_quality_charge_needs_reconciliation',
          );
        if (hold)
          await this.credits.settleReservation({
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            actorUserId: admission.actorUserId,
            reservationId: hold.id,
            actualAmount: actual,
            source: ActivitySource.SCRIPT,
            description: 'Breakout response visual quality evaluation',
            settlementIdempotencyKey: `${component.componentKey}:settled`,
          });
      },
    );
    const overallScore = readRecord(result).overallScore;
    if (
      typeof overallScore !== 'number' ||
      !Number.isFinite(overallScore) ||
      overallScore < 0 ||
      overallScore > 100
    )
      throw new ConflictException('breakout_quality_policy_unavailable');
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await admission.reauthorize(tx);
      await tx.contentScore.create({
        data: {
          organizationId: scope.organizationId,
          data: {
            [BREAKOUT_VISUAL_QUALITY_KEY]: { ...binding, partIndex: index },
            mediaKind: part.mediaKind,
            overallScore,
            platform: scope.platform,
          } as Prisma.InputJsonValue,
        },
      });
      await admission.reauthorize(tx);
    });
  }
}
