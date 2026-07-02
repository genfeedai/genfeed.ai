import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { GeneratePreviewDto } from '@api/endpoints/onboarding/dto/generate-preview.dto';
import { BrandDataMapper } from '@api/endpoints/onboarding/services/brand-data.mapper';
import { withOnboardingErrorHandling } from '@api/endpoints/onboarding/services/onboarding-error.util';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import { FileInputType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/** Credits cost for generating an onboarding preview image */
const ONBOARDING_PREVIEW_CREDIT_COST = 5;

/**
 * OnboardingPreviewService
 *
 * Owns the onboarding preview-generation pipeline: brand fetch → credit
 * check → prompt build → ComfyUI generation → S3 upload → credit deduction
 * → brand patch.
 */
@Injectable()
export class OnboardingPreviewService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly comfyUIService: ComfyUIService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly filesClientService: FilesClientService,
    private readonly brandDataMapper: BrandDataMapper,
  ) {}

  /**
   * Generate an AI preview image during onboarding
   * Uses ComfyUI to generate an image based on brand data and content type
   */
  async generateOnboardingPreview(
    dto: GeneratePreviewDto,
    user: User,
  ): Promise<{ imageUrl: string; prompt: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, {
      brandId: dto.brandId,
      contentType: dto.contentType,
    });

    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization?.toString();
    const userId = publicMetadata.user?.toString();

    if (!organizationId || !userId) {
      throw new HttpException(
        {
          detail: 'Missing organization or user context',
          title: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return withOnboardingErrorHandling(
      this.loggerService,
      caller,
      {
        detail: 'Failed to generate preview',
        hasHttpExceptionPassthrough: true,
        isErrorMessageUsed: true,
        title: 'Preview Generation Failed',
      },
      async () => {
        // 1. Fetch brand data
        const brand = await this.brandsService.findOne(
          {
            _id: dto.brandId,
            isDeleted: false,
            organization: organizationId,
          },
          'none',
        );

        if (!brand) {
          throw new HttpException(
            { detail: 'Brand not found', title: 'Not Found' },
            HttpStatus.NOT_FOUND,
          );
        }

        // 2. Check credits availability
        const hasCredits =
          await this.creditsUtilsService.checkOrganizationCreditsAvailable(
            organizationId,
            ONBOARDING_PREVIEW_CREDIT_COST,
          );

        if (!hasCredits) {
          throw new HttpException(
            {
              detail: 'Insufficient credits for preview generation',
              title: 'Insufficient Credits',
            },
            HttpStatus.PAYMENT_REQUIRED,
          );
        }

        // 3. Build prompt based on content type
        const prompt = this.brandDataMapper.buildPreviewPrompt(
          dto.contentType,
          brand.label || '',
          brand.description || '',
          brand.primaryColor || '',
          brand.secondaryColor || '',
        );

        // 4. Generate image via ComfyUI
        this.loggerService.log(`${caller} generating image via ComfyUI`, {
          contentType: dto.contentType,
        });

        const { imageBuffer } = await this.comfyUIService.generateImage(
          MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
          {
            height: 1024,
            prompt,
            steps: 4,
            width: 1024,
          },
        );

        // 5. Upload to S3
        const uploadKey = `${organizationId}/onboarding-preview-${Date.now()}`;
        const { publicUrl } =
          await this.filesClientService.getPresignedUploadUrl(
            uploadKey,
            'onboarding',
            'image/png',
          );

        await this.filesClientService.uploadToS3(uploadKey, 'onboarding', {
          contentType: 'image/png',
          data: imageBuffer,
          type: FileInputType.BUFFER,
        });

        // 6. Deduct credits
        await this.creditsUtilsService.deductCreditsFromOrganization(
          organizationId,
          userId,
          ONBOARDING_PREVIEW_CREDIT_COST,
          'Onboarding preview image',
        );

        // 7. Save preview URL to brand
        await this.brandsService.patch(brand._id, {
          // @ts-expect-error onboardingPreviewUrl is valid
          onboardingPreviewUrl: publicUrl,
        });

        this.loggerService.log(`${caller} completed`, {
          brandId: dto.brandId,
          imageUrl: publicUrl,
        });

        return { imageUrl: publicUrl, prompt };
      },
    );
  }
}
