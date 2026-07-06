import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AdminFleetValueReader } from '@api/endpoints/admin/fleet/services/fleet-value-reader.util';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import {
  CredentialPlatform,
  DarkroomReviewStatus as DarkroomReviewStatusEnum,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Owns publishing approved fleet assets out to social platforms.
 */
@Injectable()
export class AdminFleetPublishingService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly instagramService: InstagramService,
    private readonly twitterService: TwitterService,
    private readonly facebookService: FacebookService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Publish an approved asset to social platforms.
   */
  async publishAsset(
    ingredientId: string,
    organizationId: string,
    brandId: string,
    platforms: string[],
    caption?: string,
  ): Promise<{
    success: boolean;
    results: Record<string, { success: boolean; id?: string; error?: string }>;
  }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      brandId,
      ingredientId,
      organizationId,
      platforms,
    });

    // Verify ingredient exists and is approved
    const ingredient = await this.ingredientsService.findOne({
      _id: ingredientId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!ingredient) {
      throw new NotFoundException({
        message: `Asset "${ingredientId}" not found in organization "${organizationId}"`,
      });
    }

    if (
      !AdminFleetValueReader.hasReviewStatus(
        ingredient.reviewStatus,
        DarkroomReviewStatusEnum.APPROVED,
      )
    ) {
      throw new BadRequestException(
        `Asset must be approved before publishing (current status: ${ingredient.reviewStatus})`,
      );
    }

    if (!ingredient.cdnUrl) {
      throw new BadRequestException(
        'Asset must have a CDN URL to be published',
      );
    }

    const results: Record<
      string,
      { success: boolean; id?: string; error?: string }
    > = {};

    // Publish to each platform
    for (const platform of platforms) {
      try {
        let platformId: string;

        switch (platform.toLowerCase()) {
          case 'instagram': {
            const igResult = await this.instagramService.uploadImage(
              organizationId,
              brandId,
              ingredient.cdnUrl,
              caption || '',
            );
            platformId = igResult.mediaId;
            results.instagram = { id: platformId, success: true };
            break;
          }

          case 'twitter':
            platformId = await this.twitterService.uploadMedia(
              organizationId,
              brandId,
              ingredient.cdnUrl,
              caption || '',
              'image/jpeg',
            );
            results.twitter = { id: platformId, success: true };
            break;

          case 'facebook': {
            // Facebook requires pageId and pageAccessToken
            const fbCredential = await this.credentialsService.findOne({
              brand: EntityIdUtil.toValidId(brandId)!,
              isDeleted: false,
              organization: EntityIdUtil.toValidId(organizationId)!,
              platform: CredentialPlatform.FACEBOOK,
            });

            if (!fbCredential?.accessToken || !fbCredential?.externalId) {
              throw new Error('Facebook credential not found');
            }

            const decryptedToken = EncryptionUtil.decrypt(
              fbCredential.accessToken,
            );

            platformId = await this.facebookService.uploadImage(
              fbCredential.externalId,
              decryptedToken,
              ingredient.cdnUrl,
              caption || '',
            );
            results.facebook = { id: platformId, success: true };
            break;
          }

          default:
            results[platform] = {
              error: `Unsupported platform: ${platform}`,
              success: false,
            };
        }
      } catch (error: unknown) {
        this.loggerService.error(caller, {
          error: getErrorMessage(error),
          ingredientId,
          platform,
        });
        results[platform] = {
          error: getErrorMessage(error),
          success: false,
        };
      }
    }

    const allSuccessful = Object.values(results).every((r) => r.success);

    return {
      results,
      success: allSuccessful,
    };
  }
}
