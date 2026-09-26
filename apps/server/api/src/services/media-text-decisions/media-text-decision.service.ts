import { hasPendingArtefacts } from '@api/services/media-perception/media-perception.record';
import { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import {
  captionSubjectKey,
  MEDIA_TEXT_DECISION_TIMEOUT_MS,
  resolveMediaTextGateSettings,
} from '@api/services/media-text-decisions/media-text-decision.settings';
import { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  MEDIA_TEXT_ASSET_SUBJECT,
  MEDIA_TEXT_DECISION_POINTS,
  MEDIA_TEXT_DECISION_QUESTIONS,
  type MediaTextDecision,
  type MediaTextDecisionName,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  IMediaPerception,
  IMediaPerceptionCandidate,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

/** Transcript text sent to the decision provider. */
const MAX_TRANSCRIPT_CHARS = 4_000;
/** Captions judged per asset per job. */
const MAX_CAPTIONS_PER_ASSET = 10;
/** Posts edited this recently are swept for caption consistency. */
export const CAPTION_SWEEP_WINDOW_MS = 30 * 60 * 1000;

export type MediaTextDecisionOutcome = 'decided' | 'skipped';

/** Per subject: persisted, nothing to do, or a question went unanswered. */
type SubjectOutcome = 'decided' | 'none' | 'unanswered';

/**
 * Artefact statuses the asset-level questions cannot be judged over: still
 * running, or terminally failed (the text was never seen, so a decision over
 * what remains would be a guess).
 */
const UNJUDGEABLE_STATUSES = ['failed', 'pending'];

/**
 * A question went unanswered (provider failure or timeout). Thrown after the
 * job so BullMQ's backoff paces the retry instead of the two-minute sweep.
 */
export class MediaTextDecisionUnansweredError extends Error {
  constructor(ingredientId: string) {
    super(`Text decisions unanswered for asset ${ingredientId}`);
    this.name = 'MediaTextDecisionUnansweredError';
  }
}

function hasUnjudgeableText(perception: IMediaPerception): boolean {
  return [
    perception.descriptionStatus,
    perception.ocrStatus,
    perception.transcriptStatus,
  ].some((status) => UNJUDGEABLE_STATUSES.includes(status));
}

type DecisionContext = {
  brandId: string | null;
  organizationId: string;
};

/**
 * Typed text decisions on perception output (#4882).
 *
 * Runs in the media-gates worker job after perception and reads persisted
 * artefacts only:
 * - asset subject: `isBrandSafe` and `isOnBrand` over the transcript, OCR
 *   text and scene description, judged against the brand;
 * - caption subjects: `isCaptionConsistent` for each caption the asset is
 *   posted with, judged against the scene description.
 *
 * A provider that is unbound behaves as `off`. A provider failure persists
 * nothing for that subject — never a guess, and never a row that reads as
 * decided — and throws once the job is done, so the queue's backoff paces
 * the retry while a live assessment keeps reporting the asset as unchecked.
 * Pending perception skips the job; a failed transcript, OCR or description
 * leaves the asset undecided for good (review while `live`), since judging
 * the remaining text alone would pass what was never read.
 */
@Injectable()
export class MediaTextDecisionService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaPerceptionService: MediaPerceptionService,
    private readonly typedDecisionService: TypedDecisionService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  get isActive(): boolean {
    return resolveMediaTextGateSettings(this.configService).mode !== 'off';
  }

  async evaluate(
    job: IMediaPerceptionCandidate,
  ): Promise<MediaTextDecisionOutcome> {
    if (
      !this.isActive ||
      !(await this.typedDecisionService.isProviderBound())
    ) {
      return 'skipped';
    }
    const ingredient = await this.prisma.ingredient.findFirst({
      select: {
        brand: { select: { description: true, label: true } },
        brandId: true,
      },
      where: scopedWhere(job.organizationId, { id: job.ingredientId }),
    });
    const perception = await this.mediaPerceptionService.getForAsset(
      job.organizationId,
      job.ingredientId,
    );
    if (!ingredient || !perception || hasPendingArtefacts(perception)) {
      return 'skipped';
    }

    const context: DecisionContext = {
      brandId: ingredient.brandId ?? null,
      organizationId: job.organizationId,
    };
    const asset = hasUnjudgeableText(perception)
      ? 'none'
      : await this.decideAsset(job, perception, context, {
          description: ingredient.brand?.description ?? null,
          name: ingredient.brand?.label ?? null,
        });
    const captions = await this.decideCaptions(job, perception, context);
    if (asset === 'unanswered' || captions === 'unanswered') {
      throw new MediaTextDecisionUnansweredError(job.ingredientId);
    }
    return asset === 'decided' || captions === 'decided'
      ? 'decided'
      : 'skipped';
  }

  /**
   * Assets with settled perception and no asset-level decision yet, plus
   * assets on recently edited posts (captions change after perception).
   * Cross-tenant discovery; each job re-reads under its own organization.
   */
  async findUndecidedAssets(
    since: Date,
    limit: number,
    now = new Date(),
  ): Promise<IMediaPerceptionCandidate[]> {
    if (!this.isActive) {
      return [];
    }
    const [undecided, recentlyPosted] = await Promise.all([
      this.prisma.ingredient.findMany({
        orderBy: { updatedAt: 'desc' },
        select: { id: true, organizationId: true },
        take: limit,
        where: {
          isDeleted: false,
          // Only perceptions the asset questions can be judged over: nothing
          // pending, no text artefact failed.
          mediaPerceptions: {
            some: {
              descriptionStatus: { notIn: UNJUDGEABLE_STATUSES },
              framesStatus: { not: 'pending' },
              isDeleted: false,
              ocrStatus: { notIn: UNJUDGEABLE_STATUSES },
              transcriptStatus: { notIn: UNJUDGEABLE_STATUSES },
              updatedAt: { gte: since },
            },
          },
          mediaTextDecisions: {
            none: { isDeleted: false, subjectKey: MEDIA_TEXT_ASSET_SUBJECT },
          },
          organizationId: { not: null },
        },
      }),
      this.prisma.ingredient.findMany({
        orderBy: { updatedAt: 'desc' },
        select: { id: true, organizationId: true },
        take: limit,
        where: {
          isDeleted: false,
          mediaPerceptions: {
            some: { descriptionStatus: 'ready', isDeleted: false },
          },
          organizationId: { not: null },
          postIngredients: {
            some: {
              isDeleted: false,
              updatedAt: {
                gte: new Date(now.getTime() - CAPTION_SWEEP_WINDOW_MS),
              },
            },
          },
        },
      }),
    ]);
    const seen = new Set<string>();
    return [...undecided, ...recentlyPosted].flatMap((row) => {
      if (!row.organizationId || seen.has(row.id)) {
        return [];
      }
      seen.add(row.id);
      return [{ ingredientId: row.id, organizationId: row.organizationId }];
    });
  }

  private async decideAsset(
    job: IMediaPerceptionCandidate,
    perception: IMediaPerception,
    context: DecisionContext,
    brand: { description: string | null; name: string | null },
  ): Promise<SubjectOutcome> {
    if (
      await this.hasRecord(job, MEDIA_TEXT_ASSET_SUBJECT, perception.assetHash)
    ) {
      return 'none';
    }
    const transcript =
      perception.transcript?.text.trim().slice(0, MAX_TRANSCRIPT_CHARS) ?? '';
    const onScreenText = perception.ocr
      .map((entry) => entry.text.trim())
      .filter((text) => text.length > 0)
      .join('\n');
    const description = perception.description;
    const decisions: MediaTextDecision[] = [];
    if (transcript || onScreenText || description) {
      const source = transcript ? 'transcript' : 'description';
      const state = {
        brand,
        contentWarnings: description?.contentWarnings ?? [],
        onScreenText,
        sceneSummary: description?.summary ?? null,
        transcript,
      };
      // On-brand needs a brand to judge against; without a description the
      // question has no answer, so it is not asked.
      const names = brand.description?.trim()
        ? (['isBrandSafe', 'isOnBrand'] as const)
        : (['isBrandSafe'] as const);
      for (const name of names) {
        const decision = await this.decide(name, state, context, source);
        if (!decision) {
          return 'unanswered';
        }
        decisions.push(decision);
      }
    }
    await this.persist(
      job,
      MEDIA_TEXT_ASSET_SUBJECT,
      perception.assetHash,
      decisions,
    );
    return 'decided';
  }

  private async decideCaptions(
    job: IMediaPerceptionCandidate,
    perception: IMediaPerception,
    context: DecisionContext,
  ): Promise<SubjectOutcome> {
    const description = perception.description;
    if (!description) {
      return 'none';
    }
    const posts = await this.prisma.post.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { description: true },
      take: MAX_CAPTIONS_PER_ASSET,
      where: scopedWhere(job.organizationId, {
        ingredients: { some: { id: job.ingredientId } },
      }),
    });
    const captions = Array.from(
      new Set(
        posts
          .map((post) => post.description.trim())
          .filter((caption) => caption.length > 0),
      ),
    );
    let outcome: SubjectOutcome = 'none';
    for (const caption of captions) {
      const subjectKey = captionSubjectKey(caption);
      if (await this.hasRecord(job, subjectKey, perception.assetHash)) {
        continue;
      }
      const decision = await this.decide(
        'isCaptionConsistent',
        {
          caption,
          sceneSummary: description.summary,
          subjects: description.subjects,
          textOnScreen: description.textOnScreen,
        },
        context,
        'description',
      );
      if (!decision) {
        return 'unanswered';
      }
      await this.persist(job, subjectKey, perception.assetHash, [decision]);
      outcome = 'decided';
    }
    return outcome;
  }

  private async decide(
    name: MediaTextDecisionName,
    state: Record<string, unknown>,
    context: DecisionContext,
    source: MediaTextDecision['source'],
  ): Promise<MediaTextDecision | null> {
    const settings = resolveMediaTextGateSettings(this.configService);
    const answer = await this.typedDecisionService.decide(
      { question: MEDIA_TEXT_DECISION_QUESTIONS[name], state },
      {
        brandId: context.brandId ?? undefined,
        decisionPoint: MEDIA_TEXT_DECISION_POINTS[name],
        mode: settings.mode,
        organizationId: context.organizationId,
        timeoutMs: MEDIA_TEXT_DECISION_TIMEOUT_MS,
      },
    );
    if (!answer) {
      this.logger.warn(`${this.constructorName} no answer for ${name}`, {
        organizationId: context.organizationId,
      });
      return null;
    }
    return {
      confidence: answer.confidence,
      name,
      source,
      value: answer.value,
    };
  }

  private async hasRecord(
    job: IMediaPerceptionCandidate,
    subjectKey: string,
    assetHash: string,
  ): Promise<boolean> {
    const row = await this.prisma.mediaTextDecision.findFirst({
      select: { id: true },
      where: scopedWhere(job.organizationId, {
        assetHash,
        ingredientId: job.ingredientId,
        subjectKey,
      }),
    });
    return Boolean(row);
  }

  private async persist(
    job: IMediaPerceptionCandidate,
    subjectKey: string,
    assetHash: string,
    decisions: MediaTextDecision[],
  ): Promise<void> {
    const data = {
      assetHash,
      decisions: decisions as unknown as Prisma.InputJsonValue,
      isDeleted: false,
      mode: resolveMediaTextGateSettings(this.configService).mode,
    };
    // tenant-scope-ignore: unique-key upsert; organizationId is part of the key, and a tombstoned row is revived (isDeleted reset) rather than colliding with it.
    await this.prisma.mediaTextDecision.upsert({
      create: {
        ...data,
        ingredientId: job.ingredientId,
        organizationId: job.organizationId,
        subjectKey,
      },
      update: data,
      where: {
        organizationId_ingredientId_subjectKey: {
          ingredientId: job.ingredientId,
          organizationId: job.organizationId,
          subjectKey,
        },
      },
    });
  }
}
