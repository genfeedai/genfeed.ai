import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { toContentRunJsonValue } from '@api/collections/content-runs/utils/content-run-data.util';
import type { OnboardingMissingMedia } from '@api/endpoints/onboarding/onboarding.interfaces';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { readUsableCdnAssetUrl } from '@api/services/agent-orchestrator/tools/agent-media-generation-response-readers';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentRunStatus } from '@genfeedai/contracts';
import { ONBOARDING_MAX_MEDIA_RETRIES } from '@genfeedai/contracts/constants';
import type {
  IOnboardingDraftRun,
  IOnboardingFirstDraftsResult,
} from '@genfeedai/contracts/interfaces';
import type { ContentRun } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { ConflictException, Injectable } from '@nestjs/common';
import { z } from 'zod';

const resultSchema = z.object({
  drafts: z.array(
    z.object({
      isProvisional: z.boolean(),
      platform: z.enum(['twitter', 'instagram', 'tiktok', 'linkedin']),
      postId: z.string(),
      receiptId: z.string(),
      requestKey: z.string(),
      text: z.string(),
    }),
  ),
  imageIngredientId: z.string().nullable(),
  imageUrl: z.string().nullable(),
  requestKey: z.string().nullable(),
  status: z.enum(['ready', 'partial', 'unavailable']),
  videoIngredientId: z.string().nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  videoStatus: z.enum(['pending', 'ready', 'failed']).optional(),
});
const legacyArtifactSchema = z.object({
  artifact: z.object({ kind: z.literal('post'), id: z.string() }),
});
const configSchema = z.object({
  surface: z.literal('onboarding'),
  mediaRetries: z.number().int().min(0).default(0),
  result: resultSchema.nullable(),
});

@Injectable()
export class OnboardingDraftRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private configFor(
    result: IOnboardingFirstDraftsResult | null,
    mediaRetries = 0,
  ) {
    return toContentRunJsonValue({
      surface: 'onboarding',
      mediaRetries,
      brief: { angle: 'First posts' },
      variants: (result?.drafts ?? []).map((draft) => ({
        id: draft.postId,
        platform: draft.platform,
        content: draft.text,
        status: 'draft',
        type:
          draft.platform === 'tiktok'
            ? 'video'
            : result?.imageIngredientId
              ? 'image'
              : 'text',
        assetIds:
          draft.platform === 'tiktok'
            ? result?.videoIngredientId
              ? [result.videoIngredientId]
              : []
            : result?.imageIngredientId
              ? [result.imageIngredientId]
              : [],
        metadata: { source: 'onboarding', receiptId: draft.receiptId },
      })),
      result,
    });
  }

  async latest(
    user: AuthenticatedUser,
    brandId: string,
  ): Promise<IOnboardingDraftRun | null> {
    const row = await this.findLatestRow(user, brandId);
    if (!row) return this.recoverLegacy(user, brandId);
    return this.project(user, brandId, row);
  }

  private findLatestRow(user: AuthenticatedUser, brandId: string) {
    return this.prisma.contentRun.findFirst({
      where: {
        organizationId: String(user.organizationId),
        brandId,
        isDeleted: false,
        config: { path: ['surface'], equals: 'onboarding' },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** The run as the client sees it: media state is read from the assets themselves. */
  private async project(
    user: AuthenticatedUser,
    brandId: string,
    row: ContentRun,
  ): Promise<IOnboardingDraftRun> {
    const config = configSchema.parse(row.config);
    let isImageProcessing = false;
    if (config.result?.imageIngredientId) {
      const image = await this.prisma.ingredient.findFirst({
        where: {
          id: config.result.imageIngredientId,
          organizationId: String(user.organizationId),
          brandId,
          isDeleted: false,
        },
        select: { s3Key: true, status: true },
      });
      isImageProcessing = image?.status === 'PROCESSING';
      config.result.imageUrl =
        image && ['GENERATED', 'UPLOADED', 'VALIDATED'].includes(image.status)
          ? (readUsableCdnAssetUrl(image, this.config.ingredientsEndpoint) ??
            null)
          : null;
    }
    if (config.result?.videoIngredientId) {
      const video = await this.prisma.ingredient.findFirst({
        where: {
          id: config.result.videoIngredientId,
          organizationId: String(user.organizationId),
          brandId,
          isDeleted: false,
        },
        select: { s3Key: true, status: true },
      });
      if (video) {
        const ready = ['GENERATED', 'UPLOADED', 'VALIDATED'].includes(
          video.status,
        );
        config.result.videoUrl = ready
          ? (readUsableCdnAssetUrl(video, this.config.ingredientsEndpoint) ??
            null)
          : null;
        config.result.videoStatus =
          ready && config.result.videoUrl
            ? 'ready'
            : video.status === 'PROCESSING'
              ? 'pending'
              : 'failed';
      } else {
        config.result.videoUrl = null;
        config.result.videoStatus = 'failed';
      }
    }
    if (config.result)
      await this.attachReadyAssets(user, brandId, row.id, config.result);
    const verdicts = await this.readVerdicts(user, brandId, config.result);
    return {
      id: row.id,
      mediaRetriesRemaining: Math.max(
        0,
        ONBOARDING_MAX_MEDIA_RETRIES - config.mediaRetries,
      ),
      result: config.result,
      verdicts,
      status:
        (row.status === ContentRunStatus.COMPLETED ||
          row.status === 'complete') &&
        !isImageProcessing &&
        config.result?.videoStatus !== 'pending'
          ? 'complete'
          : row.status === ContentRunStatus.FAILED ||
              row.status === 'interrupted' ||
              Date.now() - row.updatedAt.getTime() > 10 * 60_000
            ? 'interrupted'
            : 'running',
    };
  }

  private async readVerdicts(
    user: AuthenticatedUser,
    brandId: string,
    result: IOnboardingFirstDraftsResult | null,
  ): Promise<IOnboardingDraftRun['verdicts']> {
    const feedback = await this.prisma.brandedGenerationFeedback.findMany({
      where: {
        organizationId: String(user.organizationId),
        brandId,
        isDeleted: false,
        actorId: String(user.id),
        receiptId: {
          in: result?.drafts.map((draft) => draft.receiptId) ?? [],
        },
      },
      select: { receiptId: true, rating: true },
    });
    const verdicts: IOnboardingDraftRun['verdicts'] = {};
    for (const draft of result?.drafts ?? []) {
      const rating = feedback.find(
        (entry) => entry.receiptId === draft.receiptId,
      )?.rating;
      if (rating === 'up' || rating === 'down') verdicts[draft.postId] = rating;
    }
    return verdicts;
  }

  private async recoverLegacy(
    user: AuthenticatedUser,
    brandId: string,
  ): Promise<IOnboardingDraftRun | null> {
    const organizationId = String(user.organizationId);
    const receipts = await this.prisma.brandedGenerationReceipt.findMany({
      where: {
        organizationId,
        brandId,
        isDeleted: false,
        surface: 'onboarding',
      },
      orderBy: { createdAt: 'desc' },
      take: 32,
      select: { id: true, requestKey: true, state: true, projection: true },
    });
    if (!receipts.length) return null;
    const boundReceipts = receipts.map((receipt) => {
      const parsed = legacyArtifactSchema.safeParse(receipt.projection);
      return {
        ...receipt,
        postId: parsed.success ? parsed.data.artifact.id : null,
      };
    });
    const posts = await this.prisma.post.findMany({
      where: {
        organizationId,
        brandId,
        isDeleted: false,
        OR: [
          {
            brandedReceiptId: {
              in: boundReceipts.map((receipt) => receipt.id),
            },
          },
          {
            id: {
              in: boundReceipts.flatMap((receipt) =>
                receipt.postId ? [receipt.postId] : [],
              ),
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        platform: true,
        description: true,
        brandedReceiptId: true,
      },
    });
    const drafts: IOnboardingFirstDraftsResult['drafts'] = [];
    for (const post of posts) {
      const platform = post.platform;
      if (
        platform !== 'twitter' &&
        platform !== 'instagram' &&
        platform !== 'tiktok' &&
        platform !== 'linkedin'
      )
        continue;
      if (drafts.some((draft) => draft.platform === platform)) continue;
      const receipt = boundReceipts.find(
        (item) => item.id === post.brandedReceiptId || item.postId === post.id,
      );
      if (!receipt) continue;
      drafts.push({
        postId: post.id,
        text: post.description,
        platform,
        receiptId: receipt.id,
        requestKey: receipt.requestKey,
        isProvisional: receipt.state !== 'ready',
      });
    }
    const result: IOnboardingFirstDraftsResult = {
      drafts,
      imageIngredientId: null,
      imageUrl: null,
      requestKey:
        drafts.find((draft) => draft.platform === 'twitter')?.requestKey ??
        null,
      status: drafts.length ? 'partial' : 'unavailable',
      videoStatus: 'failed',
    };
    const id =
      'onboarding-legacy-' +
      createHash('sha256')
        .update(JSON.stringify([organizationId, brandId]))
        .digest('hex');
    await this.prisma.contentRun.createMany({
      data: [
        {
          id,
          organizationId,
          brandId,
          status: ContentRunStatus.COMPLETED,
          config: this.configFor(result),
        },
      ],
      skipDuplicates: true,
    });
    return {
      id,
      mediaRetriesRemaining: ONBOARDING_MAX_MEDIA_RETRIES,
      status: 'complete',
      result,
      verdicts: await this.readVerdicts(user, brandId, result),
    };
  }

  private async attachReadyAssets(
    user: AuthenticatedUser,
    brandId: string,
    runId: string,
    result: IOnboardingFirstDraftsResult,
  ): Promise<void> {
    const organizationId = String(user.organizationId);
    for (const draft of result.drafts) {
      const ingredientId =
        draft.platform === 'tiktok'
          ? result.videoIngredientId
          : result.imageIngredientId;
      if (!ingredientId) continue;
      const ingredient = await this.prisma.ingredient.findFirst({
        where: {
          id: ingredientId,
          organizationId,
          brandId,
          isDeleted: false,
          status: { in: ['GENERATED', 'UPLOADED', 'VALIDATED'] },
        },
        select: { id: true },
      });
      if (!ingredient) continue;
      const post = await this.prisma.post.updateMany({
        where: {
          id: draft.postId,
          organizationId,
          brandId,
          isDeleted: false,
          status: 'draft',
          description: draft.text,
          contentRunId: null,
          ingredientLinks: { none: {} },
        },
        data: {
          contentRunId: runId,
          category: draft.platform === 'tiktok' ? 'VIDEO' : 'IMAGE',
        },
      });
      if (post.count)
        await this.prisma.postIngredient.createMany({
          data: [
            {
              postId: draft.postId,
              ingredientId,
              organizationId,
              position: 0,
            },
          ],
          skipDuplicates: true,
        });
    }
  }

  /**
   * Regenerates the image or video a finished run is missing, once per call and
   * at most ONBOARDING_MAX_MEDIA_RETRIES times per run. The text drafts and any
   * media that came back are never touched. The run row is claimed by comparing
   * the `updatedAt` just read, so two tabs cannot both start the same retry.
   */
  async retryMedia(
    user: AuthenticatedUser,
    brandId: string,
    generate: (
      missing: OnboardingMissingMedia,
      result: IOnboardingFirstDraftsResult,
      save: (result: IOnboardingFirstDraftsResult) => Promise<void>,
    ) => Promise<IOnboardingFirstDraftsResult>,
  ): Promise<IOnboardingFirstDraftsResult> {
    const organizationId = String(user.organizationId);
    const row = await this.findLatestRow(user, brandId);
    if (!row) throw new NotFoundException('Onboarding run');
    const run = await this.project(user, brandId, row);
    const result = run.result;
    if (!result?.drafts.length)
      throw new ConflictException('There are no saved drafts to add media to.');
    if (run.status === 'running')
      throw new ConflictException('Your media is still being created.');
    const missing: OnboardingMissingMedia = {
      image:
        !result.imageUrl &&
        result.drafts.some((draft) => draft.platform !== 'tiktok'),
      video:
        !result.videoUrl &&
        result.drafts.some((draft) => draft.platform === 'tiktok'),
    };
    if (!missing.image && !missing.video) return result;
    if (!run.mediaRetriesRemaining)
      throw new ConflictException(
        'This run has used all of its media retries.',
      );

    const mediaRetries =
      ONBOARDING_MAX_MEDIA_RETRIES - run.mediaRetriesRemaining + 1;
    const next = structuredClone(result);
    if (missing.image) {
      next.imageIngredientId = null;
      next.imageUrl = null;
    }
    if (missing.video) {
      next.videoIngredientId = null;
      next.videoUrl = null;
      next.videoStatus = 'pending';
    }
    const claimed = await this.prisma.contentRun.updateMany({
      where: {
        id: row.id,
        organizationId,
        brandId,
        isDeleted: false,
        updatedAt: row.updatedAt,
      },
      data: {
        status: ContentRunStatus.RUNNING,
        config: this.configFor(next, mediaRetries),
      },
    });
    if (!claimed.count)
      throw new ConflictException('Your media is still being created.');

    let saved = next;
    const save = async (current: IOnboardingFirstDraftsResult) => {
      saved = current;
      await this.prisma.contentRun.updateMany({
        where: { id: row.id, organizationId, brandId, isDeleted: false },
        data: { config: this.configFor(current, mediaRetries) },
      });
      await this.attachReadyAssets(user, brandId, row.id, current);
    };
    // A retry that ends without media is a finished run, not an interrupted
    // one: the drafts are intact and a retry may remain.
    const finish = async (current: IOnboardingFirstDraftsResult) => {
      if (current.videoStatus === 'pending' && !current.videoUrl)
        current.videoStatus = 'failed';
      await save(current);
      await this.prisma.contentRun.updateMany({
        where: { id: row.id, organizationId, brandId, isDeleted: false },
        data: { status: ContentRunStatus.COMPLETED },
      });
    };
    try {
      const finished = await generate(missing, next, save);
      await finish(finished);
      return finished;
    } catch (error) {
      await finish(saved);
      throw error;
    }
  }

  async execute(
    user: AuthenticatedUser,
    brandId: string,
    previousRequestKey: string | undefined,
    generate: (
      save: (result: IOnboardingFirstDraftsResult) => Promise<void>,
    ) => Promise<IOnboardingFirstDraftsResult>,
  ): Promise<IOnboardingFirstDraftsResult> {
    const organizationId = String(user.organizationId);
    const id = `onboarding-${createHash('sha256')
      .update(
        JSON.stringify([
          organizationId,
          brandId,
          previousRequestKey ?? 'first',
        ]),
      )
      .digest('hex')}`;
    const where = { id, organizationId, brandId, isDeleted: false };
    // A unique durable reservation prevents refreshes and concurrent tabs from
    // spending again. An interrupted request is recovered, never auto-retried.
    const created = await this.prisma.contentRun.createMany({
      data: [
        {
          id,
          organizationId,
          brandId,
          status: ContentRunStatus.RUNNING,
          config: this.configFor(null),
        },
      ],
      skipDuplicates: true,
    });
    if (!created.count) {
      const existing = await this.prisma.contentRun.findFirst({ where });
      const config = configSchema.safeParse(existing?.config);
      if (
        (existing?.status === ContentRunStatus.COMPLETED ||
          existing?.status === 'complete') &&
        config.success &&
        config.data.result
      )
        return config.data.result;
      throw new ConflictException(
        'Recover the saved onboarding run before starting another.',
      );
    }
    let saved: IOnboardingFirstDraftsResult | null = null;
    const save = async (result: IOnboardingFirstDraftsResult) => {
      saved = result;
      await this.prisma.contentRun.updateMany({
        where: { id, organizationId, brandId, isDeleted: false },
        data: {
          config: this.configFor(result),
        },
      });
      await this.attachReadyAssets(user, brandId, id, result);
    };
    try {
      const result = await generate(save);
      await save(result);
      await this.prisma.contentRun.updateMany({
        where: { id, organizationId, brandId, isDeleted: false },
        data: { status: ContentRunStatus.COMPLETED },
      });
      return result;
    } catch (error) {
      await this.prisma.contentRun.updateMany({
        where: { id, organizationId, brandId, isDeleted: false },
        data: {
          status: ContentRunStatus.FAILED,
          config: this.configFor(saved),
        },
      });
      throw error;
    }
  }
}
