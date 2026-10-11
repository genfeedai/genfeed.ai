import { randomUUID } from 'node:crypto';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { AgentGenerationInput } from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  ActivitySource,
  CreditReservationStatus,
  ModelCategory,
} from '@genfeedai/contracts';
import {
  GENERATION_POOL_WORKLOAD_TYPE,
  MEDIA_GENERATION_HOLD_TTL_MS,
} from '@genfeedai/contracts/constants';
import {
  IngredientCategory,
  IngredientStatus,
  type PrismaClient,
} from '@genfeedai/prisma';

/** Catalog keys the fake registry offers for each visual category. */
export const ACCEPTANCE_IMAGE_MODEL = 'acceptance/image-model';
export const ACCEPTANCE_VIDEO_MODEL = 'acceptance/video-model';
/** Credits one generated visual costs, quoted and charged. */
export const VISUAL_GENERATION_CREDITS = 5;

export function acceptanceMediaCategory(key: string): ModelCategory {
  return key === ACCEPTANCE_VIDEO_MODEL
    ? ModelCategory.VIDEO
    : ModelCategory.IMAGE;
}

/**
 * Fake image and video providers behind the product's generation gateway. Like the product's
 * own endpoints it creates the durable placeholder first, holds credits through the real credit
 * path under the caller's budget attribution, stores the asset, and settles the hold. Nothing
 * else is faked about the breakout's own steps.
 */
export class FakeMediaGateway {
  readonly calls: Array<{
    componentKey: string;
    kind: 'image' | 'video';
    text: string;
  }> = [];
  /** Runs once the placeholder exists and the hold is placed, before the asset is stored. */
  onProvider?: (index: number) => Promise<void>;
  /** Leaves a placeholder that never completes, as a wait that timed out does. */
  isSilent = false;

  constructor(
    private readonly db: PrismaClient<'query'>,
    private readonly credits: CreditsUtilsService,
  ) {}

  generateImage = (input: AgentGenerationInput) =>
    this.generate('image', input);
  generateVideo = (input: AgentGenerationInput) =>
    this.generate('video', input);

  private async generate(kind: 'image' | 'video', input: AgentGenerationInput) {
    const { body, principal } = input;
    const componentKey = String(body.sourceActionId);
    const index = this.calls.length;
    this.calls.push({ componentKey, kind, text: String(body.text) });
    const placeholder = await this.db.ingredient.create({
      data: {
        brandId: principal.brandId,
        category:
          kind === 'image'
            ? IngredientCategory.IMAGE
            : IngredientCategory.VIDEO,
        organizationId: principal.organizationId,
        sourceActionId: componentKey,
        status: IngredientStatus.PROCESSING,
        userId: principal.userId,
      },
    });
    await input.onPlaceholderCreated?.(placeholder.id);
    const hold = await this.credits.reserveCredits({
      organizationId: principal.organizationId,
      brandId: principal.brandId,
      actorUserId: principal.userId,
      amount: VISUAL_GENERATION_CREDITS,
      idempotencyKey: `${GENERATION_POOL_WORKLOAD_TYPE}:${componentKey}`,
      workloadId: componentKey,
      workloadType: GENERATION_POOL_WORKLOAD_TYPE,
      source: ActivitySource.SCRIPT,
      description: 'Acceptance visual generation',
      expiresAt: new Date(Date.now() + MEDIA_GENERATION_HOLD_TTL_MS),
    });
    if (hold.status !== CreditReservationStatus.RESERVED)
      throw new Error('The visual generation hold was not placed');
    await this.onProvider?.(index);
    if (this.isSilent) return { data: {} };
    await this.db.ingredient.updateMany({
      data: {
        fileSize: 4096,
        generationCompletedAt: new Date(),
        mimeType: kind === 'image' ? 'image/png' : 'video/mp4',
        s3Key: `acceptance/generated/${randomUUID()}`,
        status: IngredientStatus.GENERATED,
        version: 1,
      },
      where: scopedWhere(principal.organizationId, { id: placeholder.id }),
    });
    await this.credits.settleReservation({
      organizationId: principal.organizationId,
      brandId: principal.brandId,
      actorUserId: principal.userId,
      reservationId: hold.id,
      actualAmount: VISUAL_GENERATION_CREDITS,
      source: ActivitySource.SCRIPT,
      description: 'Acceptance visual generation',
      settlementIdempotencyKey: `${componentKey}:settled`,
    });
    return { data: {} };
  }
}

/** Fake visual judge (the product's evaluation endpoint): scores each visual and reports its charge. */
export class FakeVisualJudge {
  readonly calls: Array<{ kind: 'image' | 'video'; url: string }> = [];
  /** Overall score for the nth judgement (0-based); defaults to `score`. */
  scoreFor?: (index: number) => number;
  score = 88;
  /** Credits the judgement reports as billed. */
  billed = 1;

  evaluateImage = (
    url: string,
    _context: unknown,
    _organizationId: string,
    onBilling?: (amount: number) => void,
  ) => this.judge('image', url, onBilling);
  evaluateVideo = (
    url: string,
    _context: unknown,
    _organizationId: string,
    onBilling?: (amount: number) => void,
  ) => this.judge('video', url, onBilling);

  private async judge(
    kind: 'image' | 'video',
    url: string,
    onBilling?: (amount: number) => void,
  ) {
    const index = this.calls.length;
    this.calls.push({ kind, url });
    onBilling?.(this.billed);
    return { overallScore: this.scoreFor?.(index) ?? this.score };
  }
}
