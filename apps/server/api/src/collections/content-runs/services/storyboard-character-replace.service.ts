import { BrandRemixSceneSourceService } from '@api/collections/content-runs/services/brand-remix-scene-source.service';
import { StoryboardRunStoreService } from '@api/collections/content-runs/services/storyboard-run-store.service';
import { StoryboardSourceService } from '@api/collections/content-runs/services/storyboard-source.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  replaceStoryboardCharacterSchema,
  STORYBOARD_CHARACTER_REPLACE_LIMITATIONS,
  STORYBOARD_CHARACTER_REPLACE_MODEL_KEY,
  type StoryboardCharacterReplacement,
  storyboardCharacterReplacementSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-character-replace.contract';
import type { StoryboardRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { readIngredientMediaUrl } from '@libs/media/media-url.util';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { ZodType } from 'zod';

function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestException(
      parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    );
  return parsed.data;
}

function sourceVideoAssetId(config: StoryboardRunConfig): string | undefined {
  const snapshot = config.sourceSnapshot;
  if (snapshot.selector.kind === 'uploaded_video')
    return snapshot.selector.assetId;
  if (
    'media' in snapshot &&
    snapshot.media?.status === 'saved' &&
    snapshot.media.category === 'video'
  )
    return snapshot.media.assetId;
  return undefined;
}

/**
 * Replaces the character on one storyboard shot by calling Higgsfield
 * Genjutsu motion transfer directly. This is not the DoP image-to-video path
 * and it does not reserve or settle credits.
 */
@Injectable()
export class StoryboardCharacterReplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: StoryboardRunStoreService,
    private readonly source: StoryboardSourceService,
    private readonly videos: BrandRemixSceneSourceService,
    private readonly higgsField: HiggsFieldService,
    private readonly mediaUrls: MediaUrlService,
  ) {}

  async replace(
    organizationId: string,
    brandId: string,
    runId: string,
    shotId: string,
    body: unknown,
  ): Promise<StoryboardCharacterReplacement> {
    const input = parseInput(replaceStoryboardCharacterSchema, body);
    const { config } = await this.store.read(organizationId, brandId, runId);
    if (!config.plan)
      throw new ConflictException('This storyboard has no shots yet.');
    const shot = config.plan.shots.find((item) => item.id === shotId);
    if (!shot) throw new NotFoundException('Storyboard shot', shotId);
    const videoAssetId = sourceVideoAssetId(config);
    if (!videoAssetId)
      throw new ConflictException(
        'Character replace needs an owned source video on this storyboard.',
      );
    await this.source.revalidate(
      organizationId,
      brandId,
      config.sourceSnapshot,
    );
    const video = await this.videos.libraryAsset(
      organizationId,
      brandId,
      videoAssetId,
    );
    if (!video.url.startsWith('https://'))
      throw new ConflictException(
        'The source video needs an https address before character replace.',
      );
    const imageUrls = await this.imageUrls(
      organizationId,
      brandId,
      input.imageAssetIds,
    );
    const submitted = await this.higgsField.generateMotionTransfer({
      imageUrls,
      organizationId,
      ...(input.prompt ? { prompt: input.prompt } : {}),
      videoUrl: video.url,
    });
    const replacement = storyboardCharacterReplacementSchema.parse({
      chargedCredits: 0,
      imageAssetIds: input.imageAssetIds,
      limitations: [...STORYBOARD_CHARACTER_REPLACE_LIMITATIONS],
      modelKey: STORYBOARD_CHARACTER_REPLACE_MODEL_KEY,
      ...(input.prompt ? { prompt: input.prompt } : {}),
      requestId: submitted.requestId,
      shotId: shot.id,
      status: submitted.videoUrl ? 'ready' : 'submitted',
      videoAssetId: video.sourceAssetId,
    });
    const characterReplacements = [
      ...(config.characterReplacements ?? []).filter(
        (item) => item.shotId !== shot.id,
      ),
      replacement,
    ].slice(-12);
    await this.store.save(organizationId, brandId, runId, config, {
      ...config,
      characterReplacements,
    });
    return replacement;
  }

  private async imageUrls(
    organizationId: string,
    brandId: string,
    imageAssetIds: readonly string[],
  ): Promise<string[]> {
    const ids = [...new Set(imageAssetIds)];
    const rows = await this.prisma.ingredient.findMany({
      where: scopedWhere(organizationId, {
        brandId,
        category: 'IMAGE' as const,
        id: { in: ids },
        scope: 'USER' as const,
        status: {
          in: ['UPLOADED' as const, 'GENERATED' as const, 'VALIDATED' as const],
        },
      }),
    });
    if (rows.length !== ids.length)
      throw new NotFoundException('Storyboard character image');
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => {
      const row = byId.get(id);
      const url =
        (row ? readIngredientMediaUrl(row) : undefined) ??
        (row?.s3Key ? this.mediaUrls.buildUrl(row.s3Key) : undefined);
      if (!url?.startsWith('https://'))
        throw new ConflictException(
          'Character images must be https images from this brand Library.',
        );
      return url;
    });
  }
}
