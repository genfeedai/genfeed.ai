import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OnboardingContentType } from '@api/endpoints/onboarding/dto/generate-preview.dto';
import { OnboardingPreviewService } from '@api/endpoints/onboarding/services/onboarding-preview.service';
import type { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import { FileInputType } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import type { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('OnboardingPreviewService', () => {
  let brandDataMapper: vi.Mocked<Pick<BrandDataMapper, 'buildPreviewPrompt'>>;
  let brandsService: vi.Mocked<Pick<BrandsService, 'findOne' | 'patch'>>;
  let comfyUIService: vi.Mocked<Pick<ComfyUIService, 'generateImage'>>;
  let creditsUtilsService: vi.Mocked<
    Pick<
      CreditsUtilsService,
      'checkOrganizationCreditsAvailable' | 'deductCreditsFromOrganization'
    >
  >;
  let filesClientService: vi.Mocked<
    Pick<FilesClientService, 'getPresignedUploadUrl' | 'uploadToS3'>
  >;
  let loggerService: vi.Mocked<Pick<LoggerService, 'error' | 'log' | 'warn'>>;
  let service: OnboardingPreviewService;

  const user: User = {
    id: 'user-1',
    publicMetadata: {
      organization: 'org-1',
      user: 'user-1',
    },
  };

  beforeEach(() => {
    brandDataMapper = {
      buildPreviewPrompt: vi.fn().mockReturnValue('generated prompt'),
    };
    brandsService = {
      findOne: vi.fn().mockResolvedValue({
        description: 'Content operations platform',
        id: 'brand-1',
        label: 'Genfeed',
        primaryColor: '#000000',
        secondaryColor: '#ffffff',
      } as never),
      patch: vi.fn(),
    };
    comfyUIService = {
      generateImage: vi.fn().mockResolvedValue({
        filename: 'preview.png',
        imageBuffer: Buffer.from('preview'),
      }),
    };
    creditsUtilsService = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
    };
    filesClientService = {
      getPresignedUploadUrl: vi.fn().mockResolvedValue({
        publicUrl: 'https://cdn.genfeed.ai/onboarding/preview.png',
        s3Key: 'onboarding/org-1/preview.png',
        uploadUrl: 'https://uploads.genfeed.ai/onboarding/preview.png',
      }),
      uploadToS3: vi.fn().mockResolvedValue({
        publicUrl: 'https://cdn.genfeed.ai/onboarding/preview.png',
      }),
    };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new OnboardingPreviewService(
      loggerService as unknown as LoggerService,
      brandsService as unknown as BrandsService,
      comfyUIService as unknown as ComfyUIService,
      creditsUtilsService as unknown as CreditsUtilsService,
      filesClientService as unknown as FilesClientService,
      brandDataMapper as unknown as BrandDataMapper,
    );
  });

  it('returns the uploaded preview after charging without patching the brand', async () => {
    const result = await service.generateOnboardingPreview(
      {
        brandId: 'brand-1',
        contentType: OnboardingContentType.SOCIAL,
      },
      user,
    );

    expect(brandsService.findOne).toHaveBeenCalledWith(
      {
        _id: 'brand-1',
        isDeleted: false,
        organization: 'org-1',
      },
      'none',
    );
    expect(brandDataMapper.buildPreviewPrompt).toHaveBeenCalledWith(
      OnboardingContentType.SOCIAL,
      'Genfeed',
      'Content operations platform',
      '#000000',
      '#ffffff',
    );
    expect(comfyUIService.generateImage).toHaveBeenCalledWith(
      MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
      {
        height: 1024,
        prompt: 'generated prompt',
        steps: 4,
        width: 1024,
      },
    );
    expect(filesClientService.getPresignedUploadUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^org-1\/onboarding-preview-\d+$/),
      'onboarding',
      'image/png',
    );
    expect(filesClientService.uploadToS3).toHaveBeenCalledWith(
      expect.stringMatching(/^org-1\/onboarding-preview-\d+$/),
      'onboarding',
      {
        contentType: 'image/png',
        data: expect.any(Buffer),
        type: FileInputType.BUFFER,
      },
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith('org-1', 'user-1', 5, 'Onboarding preview image');
    expect(brandsService.patch).not.toHaveBeenCalled();
    expect(result).toEqual({
      imageUrl: 'https://cdn.genfeed.ai/onboarding/preview.png',
      prompt: 'generated prompt',
    });
  });
});
