import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreatorScraperService } from '@api/collections/content-intelligence/services/creator-scraper.service';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { type PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import type {
  DarkroomIngestFailure,
  DarkroomIngestResult,
} from '@api/endpoints/admin/darkroom/interfaces/darkroom-ingest.interface';
import { DarkroomCharacterService } from '@api/endpoints/admin/darkroom/services/darkroom-character.service';
import { DarkroomTrainingService } from '@api/endpoints/admin/darkroom/services/darkroom-training.service';
import { DarkroomValueReader } from '@api/endpoints/admin/darkroom/services/darkroom-value-reader.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import {
  ContentIntelligencePlatform,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Owns darkroom training-data ingestion: manual dataset uploads and the
 * automated scrape-and-ingest pipeline from a persona's enabled sources.
 */
@Injectable()
export class DarkroomIngestService {
  constructor(
    private readonly characterService: DarkroomCharacterService,
    private readonly personasService: PersonasService,
    private readonly brandsService: BrandsService,
    private readonly ingredientsService: IngredientsService,
    private readonly creatorScraperService: CreatorScraperService,
    private readonly filesClientService: FilesClientService,
    private readonly darkroomTrainingService: DarkroomTrainingService,
  ) {}

  async uploadDataset(
    organizationId: string,
    slug: string,
    files: Array<{ buffer: Buffer; mimetype: string; originalname: string }>,
    captions?: Array<{ filenameStem: string; caption: string }>,
  ): Promise<DarkroomIngestResult> {
    await this.characterService.requirePersonaBySlug(slug, organizationId);

    const captionMap = new Map(
      (captions ?? []).map((entry) => [
        entry.filenameStem.toLowerCase(),
        entry,
      ]),
    );
    const s3Keys: string[] = [];
    let uploadedCount = 0;
    let failedCount = 0;
    const failed: Array<{ filename: string; error: string }> = [];

    for (const file of files) {
      const filename = file.originalname;
      const stem = filename.replace(/\.[^.]+$/, '').toLowerCase();
      const imageKey = `darkroom/datasets/${slug}/${filename}`;

      try {
        await this.filesClientService.uploadToS3(imageKey, 'images', {
          contentType: file.mimetype,
          data: file.buffer,
          type: FileInputType.BUFFER,
        });
        s3Keys.push(imageKey);

        const caption = captionMap.get(stem);
        if (caption) {
          const captionKey = `darkroom/datasets/${slug}/${caption.filenameStem}.txt`;
          await this.filesClientService.uploadToS3(captionKey, 'images', {
            contentType: 'text/plain',
            data: Buffer.from(caption.caption, 'utf8'),
            type: FileInputType.BUFFER,
          });
          s3Keys.push(captionKey);
        }

        uploadedCount++;
      } catch (error: unknown) {
        failedCount++;
        failed.push({
          error: getErrorMessage(error),
          filename,
        });
      }
    }

    if (s3Keys.length > 0) {
      await this.darkroomTrainingService.syncDataset(slug, s3Keys);
    }

    return { failed, failedCount, uploadedCount };
  }

  async ingestTrainingDataForCharacter(
    organizationId: string,
    userId: string,
    slug: string,
  ): Promise<DarkroomIngestResult> {
    const persona = await this.characterService.requirePersonaBySlug(
      slug,
      organizationId,
    );

    return this.ingestTrainingDataForPersonaDocument(
      organizationId,
      userId,
      persona,
    );
  }

  async ingestTrainingDataForAllEnabledCharacters(
    organizationId: string,
    userId: string,
  ): Promise<DarkroomIngestResult> {
    const personas = await this.personasService.findAllByOrganization(
      organizationId,
      {
        isDarkroomCharacter: true,
      },
    );

    let uploadedCount = 0;
    let failedCount = 0;
    const failed: DarkroomIngestFailure[] = [];

    for (const persona of personas) {
      const brandId = DarkroomValueReader.readReferenceId(persona.brand);

      if (!brandId) {
        continue;
      }

      const brand = await this.brandsService.findOne(
        {
          _id: brandId,
          isDeleted: false,
          organization: organizationId,
        },
        'none',
      );

      if (!brand?.isDarkroomEnabled) {
        continue;
      }

      const result = await this.ingestTrainingDataForPersonaDocument(
        organizationId,
        userId,
        persona,
      );

      uploadedCount += result.uploadedCount;
      failedCount += result.failedCount;
      failed.push(...result.failed);
    }

    return {
      failed,
      failedCount,
      uploadedCount,
    };
  }

  private async ingestTrainingDataForPersonaDocument(
    organizationId: string,
    userId: string,
    persona: PersonaDocument,
  ): Promise<DarkroomIngestResult> {
    const enabledSources =
      DarkroomValueReader.getEnabledDarkroomSources(persona);

    if (enabledSources.length === 0) {
      return {
        failed: [],
        failedCount: 0,
        uploadedCount: 0,
      };
    }

    const userObjectId = ObjectIdUtil.toObjectId(userId);
    const organizationObjectId = ObjectIdUtil.toObjectId(organizationId);
    const brandId = DarkroomValueReader.readReferenceId(persona.brand);
    const brandObjectId = brandId ? ObjectIdUtil.toObjectId(brandId) : null;

    if (!userObjectId || !organizationObjectId || !brandObjectId) {
      throw new BadRequestException('Invalid darkroom ingest context');
    }

    let uploadedCount = 0;
    let failedCount = 0;
    const failed: DarkroomIngestFailure[] = [];

    for (const source of enabledSources) {
      try {
        const result = await this.scrapeSourcePosts(
          source.platform,
          source.handle,
        );
        const mediaPosts = result.posts.filter((post) => post.mediaUrl);

        for (const post of mediaPosts) {
          if (!post.mediaUrl) {
            continue;
          }

          const existing = await this.ingredientsService.findOne({
            brand: brandObjectId,
            category:
              post.mediaType === 'video'
                ? IngredientCategory.VIDEO
                : IngredientCategory.IMAGE,
            cdnUrl: post.mediaUrl,
            generationSource: `darkroom-ingest:${source.platform}`,
            isDeleted: false,
            organization: organizationObjectId,
            persona: persona._id,
          });

          if (existing) {
            continue;
          }

          const created = await this.createDarkroomIngestAsset({
            brandId: brandObjectId,
            mediaType: post.mediaType,
            organizationId: organizationObjectId,
            persona,
            postId: post.id,
            sourcePlatform: source.platform,
            sourceUrl: post.mediaUrl,
            text: post.text,
            userId: userObjectId,
          });

          if (created) {
            uploadedCount++;
          }
        }

        source.lastIngestedAt = new Date();
      } catch (error: unknown) {
        failedCount++;
        failed.push({
          error: getErrorMessage(error),
          filename: `${persona.slug ?? persona._id.toString()}:${source.platform}:${source.handle}`,
        });
      }
    }

    await this.personasService.patch(persona._id.toString(), {
      darkroomSources: persona.darkroomSources,
    } as Parameters<PersonasService['patch']>[1]);

    return {
      failed,
      failedCount,
      uploadedCount,
    };
  }

  private async createDarkroomIngestAsset(params: {
    organizationId: string;
    brandId: string;
    userId: string;
    persona: PersonaDocument;
    sourcePlatform: ContentIntelligencePlatform;
    postId: string;
    sourceUrl: string;
    text: string;
    mediaType?: 'image' | 'video';
  }): Promise<IngredientDocument | null> {
    const category =
      params.mediaType === 'video'
        ? IngredientCategory.VIDEO
        : IngredientCategory.IMAGE;

    const ingredient = await this.ingredientsService.create({
      brand: params.brandId,
      category,
      cdnUrl: params.sourceUrl,
      ...DarkroomValueReader.getDefaultDarkroomModerationState(),
      generationPrompt: params.text || undefined,
      generationSource: `darkroom-ingest:${params.sourcePlatform}`,
      organization: params.organizationId,
      persona: params.persona._id,
      personaSlug: params.persona.slug,
      s3Key: `${params.sourcePlatform}:${params.postId}`,
      status: IngredientStatus.GENERATED,
      text: params.text || undefined,
      user: params.userId,
    } as Parameters<IngredientsService['create']>[0]);

    const uploadMeta = await this.filesClientService.uploadToS3(
      ingredient._id.toString(),
      category === IngredientCategory.VIDEO ? 'videos' : 'images',
      {
        type: FileInputType.URL,
        url: params.sourceUrl,
      },
    );

    return this.ingredientsService.patch(ingredient._id.toString(), {
      cdnUrl: params.sourceUrl,
      s3Key: uploadMeta.s3Key ?? ingredient.s3Key,
      status: IngredientStatus.GENERATED,
    } as Parameters<IngredientsService['patch']>[1]);
  }

  private async scrapeSourcePosts(
    platform: ContentIntelligencePlatform,
    handle: string,
  ) {
    if (
      platform !== ContentIntelligencePlatform.INSTAGRAM &&
      platform !== ContentIntelligencePlatform.TIKTOK
    ) {
      throw new BadRequestException(
        `Darkroom auto-ingest does not support ${platform} yet`,
      );
    }

    return this.creatorScraperService.scrapeByPlatform(platform, handle, 24);
  }
}
