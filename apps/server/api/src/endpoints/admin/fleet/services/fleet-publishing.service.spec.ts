import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AdminFleetPublishingService } from '@api/endpoints/admin/fleet/services/fleet-publishing.service';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { DarkroomReviewStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AdminFleetPublishingService', () => {
  let service: AdminFleetPublishingService;
  let ingredientsService: Record<string, ReturnType<typeof vi.fn>>;
  let instagramService: Record<string, ReturnType<typeof vi.fn>>;
  let twitterService: Record<string, ReturnType<typeof vi.fn>>;

  const approvedAsset = {
    _id: { toString: () => 'asset-1' },
    cdnUrl: 'https://cdn/asset-1.jpg',
    reviewStatus: DarkroomReviewStatus.APPROVED,
  };

  beforeEach(async () => {
    ingredientsService = { findOne: vi.fn() };
    instagramService = {
      uploadImage: vi.fn().mockResolvedValue({ mediaId: 'ig-1' }),
    };
    twitterService = { uploadMedia: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminFleetPublishingService,
        { provide: IngredientsService, useValue: ingredientsService },
        { provide: InstagramService, useValue: instagramService },
        { provide: TwitterService, useValue: twitterService },
        { provide: FacebookService, useValue: { uploadImage: vi.fn() } },
        { provide: CredentialsService, useValue: { findOne: vi.fn() } },
        { provide: LoggerService, useValue: { error: vi.fn(), log: vi.fn() } },
      ],
    }).compile();

    service = module.get(AdminFleetPublishingService);
  });

  it('throws NotFound when the asset is not in the organization', async () => {
    ingredientsService.findOne.mockResolvedValue(null);

    await expect(
      service.publishAsset('asset-1', 'org-1', 'brand-1', ['instagram']),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses to publish an asset that is not approved', async () => {
    ingredientsService.findOne.mockResolvedValue({
      ...approvedAsset,
      reviewStatus: DarkroomReviewStatus.PENDING,
    });

    await expect(
      service.publishAsset('asset-1', 'org-1', 'brand-1', ['instagram']),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to publish an approved asset with no CDN url', async () => {
    ingredientsService.findOne.mockResolvedValue({
      ...approvedAsset,
      cdnUrl: undefined,
    });

    await expect(
      service.publishAsset('asset-1', 'org-1', 'brand-1', ['instagram']),
    ).rejects.toThrow(BadRequestException);
  });

  it('publishes to Instagram and reports success', async () => {
    ingredientsService.findOne.mockResolvedValue(approvedAsset);

    const result = await service.publishAsset(
      'asset-1',
      'org-1',
      'brand-1',
      ['instagram'],
      'caption',
    );

    expect(instagramService.uploadImage).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      approvedAsset.cdnUrl,
      'caption',
    );
    expect(result.success).toBe(true);
    expect(result.results.instagram).toEqual({ id: 'ig-1', success: true });
  });

  it('marks an unsupported platform as failed without failing the whole call', async () => {
    ingredientsService.findOne.mockResolvedValue(approvedAsset);

    const result = await service.publishAsset('asset-1', 'org-1', 'brand-1', [
      'myspace',
    ]);

    expect(result.success).toBe(false);
    expect(result.results.myspace.success).toBe(false);
    expect(result.results.myspace.error).toContain('Unsupported platform');
  });
});
