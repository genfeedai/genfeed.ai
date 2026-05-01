import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import {
  ActivityKey,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@workers/config/config.service';

/**
 * Type for ingredient results loaded with metadata.
 */
interface IngredientWithMetadataDoc {
  _id: string;
  category: IngredientCategory;
  metadata:
    | string
    | {
        _id?: string;
        id?: string;
        width?: number | null;
        height?: number | null;
      };
  metadataDoc?: {
    _id: string;
  };
  metadataId?: string;
}

/**
 * Cron service for handling ingredient processing timeouts
 * Checks for ingredients stuck in PROCESSING status for more than 30 minutes
 * and marks them as FAILED
 */
@Injectable()
export class CronIngredientsService {
  private readonly constructorName: string = String(this.constructor.name);

  // Lock keys for distributed locking (prevents race conditions across instances)
  private static readonly LOCK_KEY_STUCK_INGREDIENTS = 'cron:ingredients:stuck';
  private static readonly LOCK_KEY_METADATA_REFRESH =
    'cron:ingredients:metadata';
  // Lock TTL: 10 minutes (should be longer than max expected execution time)
  private static readonly LOCK_TTL_SECONDS = 600;

  // Category → processing/failed activity key mapping
  private static readonly CATEGORY_ACTIVITY_KEYS: Record<
    string,
    { processing: ActivityKey; failed: ActivityKey }
  > = {
    [IngredientCategory.IMAGE]: {
      failed: ActivityKey.IMAGE_FAILED,
      processing: ActivityKey.IMAGE_PROCESSING,
    },
    [IngredientCategory.MUSIC]: {
      failed: ActivityKey.MUSIC_FAILED,
      processing: ActivityKey.MUSIC_PROCESSING,
    },
    [IngredientCategory.VIDEO]: {
      failed: ActivityKey.VIDEO_FAILED,
      processing: ActivityKey.VIDEO_PROCESSING,
    },
  };

  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly ingredientsService: IngredientsService,
    private readonly metadataService: MetadataService,
    private readonly filesClientService: FilesClientService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Check for stuck processing ingredients every hour
   * Finds ingredients with PROCESSING status created more than 30 minutes ago
   * and marks them as FAILED
   *
   * Uses distributed locking to prevent race conditions across multiple instances
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkStuckProcessingIngredients() {
    const context = `${this.constructorName} checkStuckProcessingIngredients`;

    // Use distributed lock to prevent concurrent execution across instances
    const acquired = await this.cacheService.acquireLock(
      CronIngredientsService.LOCK_KEY_STUCK_INGREDIENTS,
      CronIngredientsService.LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      return this.logger.debug(
        'Ingredient timeout check already running (lock held), skipping this cycle',
        context,
      );
    }

    const startTime = Date.now();

    try {
      this.logger.log('Checking for stuck processing ingredients', context);

      // Calculate the cutoff time: 30 minutes ago
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      const stuckIngredients = await this.ingredientsService.findAll(
        {
          where: {
            createdAt: { lt: thirtyMinutesAgo },
            isDeleted: false,
            status: IngredientStatus.PROCESSING,
          },
        },
        {
          limit: 100, // Process max 100 ingredients per cycle to avoid overload
          pagination: false,
        },
      );

      const stuckCount = stuckIngredients.docs?.length || 0;

      if (stuckCount === 0) {
        this.logger.debug('No stuck processing ingredients found', context);
        return;
      }

      this.logger.log(`Found ${stuckCount} stuck processing ingredients`, {
        context,
        count: stuckCount,
      });

      // Update all stuck ingredients to FAILED status using service
      const result = await this.ingredientsService.patchAll(
        {
          OR: [
            {
              id: {
                in: stuckIngredients.docs.map((ing: unknown) =>
                  String(ing._id),
                ),
              },
            },
            {
              mongoId: {
                in: stuckIngredients.docs.map((ing: unknown) =>
                  String(ing._id),
                ),
              },
            },
          ],
          isDeleted: false,
          status: IngredientStatus.PROCESSING, // Double-check status hasn't changed
        },
        {
          status: IngredientStatus.FAILED,
        },
      );

      const duration = Date.now() - startTime;
      this.logger.log(
        `Ingredient timeout check completed in ${duration}ms. Marked ${result.modifiedCount} ingredients as FAILED`,
        {
          context,
          duration,
          found: stuckCount,
          updated: result.modifiedCount,
        },
      );

      // Log individual ingredient IDs for debugging
      if (result.modifiedCount > 0 && stuckIngredients.docs) {
        this.logger.debug(
          `Marked ingredients as FAILED: ${stuckIngredients.docs
            .slice(0, 10)
            .map((ing: unknown) => ing._id.toString())
            .join(', ')}${stuckCount > 10 ? '...' : ''}`,
          context,
        );
      }

      // Update corresponding activity records from _PROCESSING to _FAILED
      let activitiesUpdated = 0;
      for (const ingredient of stuckIngredients.docs) {
        try {
          const ing = ingredient as unknown as {
            _id: string;
            category: IngredientCategory;
            user: string;
          };
          const ingredientId = ing._id.toString();
          const keys =
            CronIngredientsService.CATEGORY_ACTIVITY_KEYS[ing.category];

          if (!keys || !ing.user) {
            continue;
          }

          const existingActivity = await this.activitiesService.findOne({
            OR: [
              { value: { contains: ingredientId } },
              { value: ingredientId },
            ],
            isDeleted: false,
            key: keys.processing,
            user: ing.user,
          });

          if (!existingActivity) {
            continue;
          }

          let parsedValue: Record<string, unknown> = {};
          try {
            parsedValue =
              typeof existingActivity.value === 'string'
                ? JSON.parse(existingActivity.value)
                : existingActivity.value;
          } catch {
            parsedValue = { ingredientId: existingActivity.value };
          }

          await this.activitiesService.patch(existingActivity._id.toString(), {
            key: keys.failed,
            value: JSON.stringify({
              ...parsedValue,
              error: 'Processing timed out',
              ingredientId,
            }),
          });
          activitiesUpdated++;
        } catch (error: unknown) {
          this.logger.error(
            `Failed to update activity for ingredient ${(ingredient as { _id: string })._id}`,
            error,
            context,
          );
        }
      }

      if (activitiesUpdated > 0) {
        this.logger.log(
          `Updated ${activitiesUpdated} activity records from PROCESSING to FAILED`,
          context,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        'Ingredient timeout check cycle failed',
        error,
        context,
      );
    } finally {
      await this.cacheService.releaseLock(
        CronIngredientsService.LOCK_KEY_STUCK_INGREDIENTS,
      );
    }
  }

  /**
   * Manual trigger for testing (not scheduled)
   */
  async triggerTimeoutCheck(): Promise<{
    found: number;
    updated: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} triggered manually`);

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const stuckIngredients = await this.ingredientsService.findAll(
      {
        where: {
          createdAt: { lt: thirtyMinutesAgo },
          isDeleted: false,
          status: IngredientStatus.PROCESSING,
        },
      },
      {
        limit: 100,
        pagination: false,
      },
    );

    const stuckCount = stuckIngredients.docs?.length || 0;

    if (stuckCount === 0) {
      return { found: 0, updated: 0 };
    }

    const result = await this.ingredientsService.patchAll(
      {
        OR: [
          {
            id: {
              in: stuckIngredients.docs.map((ing: unknown) => String(ing._id)),
            },
          },
          {
            mongoId: {
              in: stuckIngredients.docs.map((ing: unknown) => String(ing._id)),
            },
          },
        ],
        isDeleted: false,
        status: IngredientStatus.PROCESSING,
      },
      {
        status: IngredientStatus.FAILED,
      },
    );

    return {
      found: stuckCount,
      updated: result.modifiedCount,
    };
  }

  /**
   * Refresh metadata for completed videos and images with missing or zero width/height
   * Runs every 6 hours to ensure completed assets have proper metadata dimensions
   *
   * Uses distributed locking to prevent race conditions across multiple instances
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async refreshMissingMetadataDimensions() {
    const context = `${this.constructorName} refreshMissingMetadataDimensions`;

    // Use distributed lock to prevent concurrent execution across instances
    const acquired = await this.cacheService.acquireLock(
      CronIngredientsService.LOCK_KEY_METADATA_REFRESH,
      CronIngredientsService.LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      return this.logger.debug(
        'Metadata refresh already running (lock held), skipping this cycle',
        context,
      );
    }

    const startTime = Date.now();

    try {
      this.logger.log(
        'Checking for completed ingredients with missing dimensions',
        context,
      );

      // Find completed videos and images with missing or zero width/height in metadata
      const ingredientsNeedingRefresh = await this.ingredientsService.findAll(
        {
          include: { metadata: true },
          where: {
            category: {
              in: [IngredientCategory.VIDEO, IngredientCategory.IMAGE],
            },
            isDeleted: false,
            metadataId: { not: null },
            status: IngredientStatus.GENERATED,
          },
        },
        {
          limit: 50, // Process max 50 ingredients per cycle to avoid overload
          pagination: false,
        },
      );

      ingredientsNeedingRefresh.docs = ingredientsNeedingRefresh.docs.filter(
        (ingredient: IngredientWithMetadataDoc) => {
          const metadata =
            typeof ingredient.metadata === 'object'
              ? ingredient.metadata
              : undefined;

          return (
            !metadata ||
            metadata.width === undefined ||
            metadata.width === null ||
            metadata.width <= 0 ||
            metadata.height === undefined ||
            metadata.height === null ||
            metadata.height <= 0
          );
        },
      );

      const foundCount = ingredientsNeedingRefresh.docs?.length || 0;

      if (foundCount === 0) {
        this.logger.debug(
          'No ingredients with missing dimensions found',
          context,
        );
        return;
      }

      this.logger.log(
        `Found ${foundCount} completed ingredients with missing dimensions`,
        {
          context,
          count: foundCount,
        },
      );

      let successCount = 0;
      let errorCount = 0;

      // Process each ingredient
      const docs =
        (
          ingredientsNeedingRefresh as unknown as {
            docs?: IngredientWithMetadataDoc[];
          }
        ).docs || [];

      for (const ingredient of docs) {
        try {
          const ingredientId = ingredient._id.toString();
          const ingredientUrl = `${this.configService.ingredientsEndpoint}/${ingredient.category}s/${ingredientId}`;

          // Extract metadata from the file URL
          const uploadMeta =
            await this.filesClientService.extractMetadataFromUrl(ingredientUrl);

          // Only update if we got valid dimensions
          if (
            uploadMeta.width &&
            uploadMeta.width > 0 &&
            uploadMeta.height &&
            uploadMeta.height > 0
          ) {
            const metadataId =
              ingredient.metadataDoc?._id ??
              (typeof ingredient.metadata === 'object'
                ? (ingredient.metadata.id ?? ingredient.metadata._id)
                : (ingredient.metadataId ?? ingredient.metadata));

            if (!metadataId) {
              this.logger.warn(
                `Skipping ingredient ${ingredientId} without metadata id`,
                context,
              );
              errorCount++;
              continue;
            }

            const updateData: Partial<Record<string, unknown>> = {
              height: uploadMeta.height,
              width: uploadMeta.width,
            };

            // Update size for both videos and images
            if (uploadMeta.size !== undefined) {
              updateData.size = uploadMeta.size;
            }

            // Only update duration and hasAudio for videos (not images)
            if (ingredient.category === IngredientCategory.VIDEO) {
              if (
                uploadMeta.duration !== undefined &&
                uploadMeta.duration > 0
              ) {
                updateData.duration = uploadMeta.duration;
              }

              // Use hasAudio from extractMetadataFromUrl (which checks for audio streams)
              if (uploadMeta.hasAudio !== undefined) {
                updateData.hasAudio = uploadMeta.hasAudio;
              }
            }

            await this.metadataService.patch(metadataId, updateData);
            successCount++;

            this.logger.debug(
              `Refreshed metadata for ingredient ${ingredientId}: ${uploadMeta.width}x${uploadMeta.height}`,
              context,
            );
          } else {
            this.logger.warn(
              `Could not extract valid dimensions for ingredient ${ingredientId}`,
              {
                context,
                ingredientId,
                uploadMeta,
              },
            );
            errorCount++;
          }
        } catch (error: unknown) {
          errorCount++;
          this.logger.error(
            `Failed to refresh metadata for ingredient ${ingredient._id}`,
            error,
            context,
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Metadata refresh completed in ${duration}ms. Processed ${foundCount} ingredients: ${successCount} succeeded, ${errorCount} failed`,
        {
          context,
          duration,
          failed: errorCount,
          found: foundCount,
          succeeded: successCount,
        },
      );
    } catch (error: unknown) {
      this.logger.error('Metadata refresh cycle failed', error, context);
    } finally {
      await this.cacheService.releaseLock(
        CronIngredientsService.LOCK_KEY_METADATA_REFRESH,
      );
    }
  }

  /**
   * Manual trigger for testing metadata refresh (not scheduled)
   * Note: This will fail if the cron is already running (lock held)
   */
  async triggerMetadataRefresh(): Promise<{
    found: number;
    succeeded: number;
    failed: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} triggered manually`);

    // Call the method directly - it will handle locking internally
    await this.refreshMissingMetadataDimensions();
    // Return counts would need to be tracked differently for manual trigger
    return { failed: 0, found: 0, succeeded: 0 };
  }
}
