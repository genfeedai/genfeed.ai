import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const objectId = () => 'test-object-id';

const makeCredential = (
  platform: string = CredentialPlatform.TWITTER,
): CredentialDocument =>
  ({
    id: objectId(),
    platform,
  }) as unknown as CredentialDocument;

const makeOrganization = (): OrganizationDocument =>
  ({
    id: objectId(),
  }) as unknown as OrganizationDocument;

describe('QuotaService', () => {
  let service: QuotaService;

  const mockPostsService = { count: vi.fn().mockResolvedValue(0) };
  const mockCredentialsService = { findOne: vi.fn() };
  const mockOrganizationsService = { findOne: vi.fn() };
  const mockOrganizationSettingsService = { findOne: vi.fn() };
  const mockModuleRef = {
    get: vi.fn().mockReturnValue(mockPostsService),
  };
  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaService,
        { provide: CredentialsService, useValue: mockCredentialsService },
        { provide: OrganizationsService, useValue: mockOrganizationsService },
        {
          provide: OrganizationSettingsService,
          useValue: mockOrganizationSettingsService,
        },
        { provide: ModuleRef, useValue: mockModuleRef },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<QuotaService>(QuotaService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw NOT_FOUND when organization settings missing', async () => {
    mockOrganizationSettingsService.findOne.mockResolvedValue(null);
    const cred = makeCredential();
    const org = makeOrganization();
    await expect(service.checkQuota(cred, org)).rejects.toThrow(HttpException);
  });

  it('counts posts by domain platform for a Prisma INSTAGRAM credential', async () => {
    mockOrganizationSettingsService.findOne.mockResolvedValueOnce({
      quotaInstagram: 8,
    });
    mockPostsService.count.mockResolvedValueOnce(3);

    const result = await service.checkQuota(
      makeCredential('INSTAGRAM'),
      makeOrganization(),
    );

    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(3);
    expect(result.dailyLimit).toBe(8);
    expect(result.platform).toBe(CredentialPlatform.INSTAGRAM);
    expect(mockPostsService.count).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        platform: CredentialPlatform.INSTAGRAM,
      }),
    );
    expect(mockPostsService.count.mock.calls[0]?.[1].platform).toBe(
      'instagram',
    );
  });

  it('should return allowed=true when current count < daily limit', async () => {
    mockOrganizationSettingsService.findOne.mockResolvedValueOnce({
      quotaTwitter: 10,
    });
    mockPostsService.count.mockResolvedValueOnce(5);

    const result = await service.checkQuota(
      makeCredential(CredentialPlatform.TWITTER),
      makeOrganization(),
    );

    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(5);
    expect(result.dailyLimit).toBe(10);
    expect(result.platform).toBe(CredentialPlatform.TWITTER);
  });

  it('should return allowed=false when current count >= daily limit', async () => {
    mockOrganizationSettingsService.findOne.mockResolvedValueOnce({
      quotaYoutube: 3,
    });
    mockPostsService.count.mockResolvedValueOnce(3);

    const result = await service.checkQuota(
      makeCredential(CredentialPlatform.YOUTUBE),
      makeOrganization(),
    );

    expect(result.allowed).toBe(false);
    expect(result.currentCount).toBe(3);
    expect(result.dailyLimit).toBe(3);
  });

  it.each([
    CredentialPlatform.LINKEDIN,
    CredentialPlatform.THREADS,
    CredentialPlatform.FACEBOOK,
  ])(
    'treats unmapped platform %s as unmetered without counting posts',
    async (platform) => {
      mockOrganizationSettingsService.findOne.mockResolvedValueOnce({
        quotaTwitter: 5,
      });

      const result = await service.checkQuota(
        makeCredential(platform),
        makeOrganization(),
      );

      expect(result).toEqual({
        allowed: true,
        currentCount: 0,
        dailyLimit: 0,
        platform,
      });
      expect(mockPostsService.count).not.toHaveBeenCalled();
    },
  );

  it('treats a configured limit of 0 as unmetered without counting posts', async () => {
    mockOrganizationSettingsService.findOne.mockResolvedValueOnce({
      quotaTwitter: 0,
    });

    const result = await service.checkQuota(
      makeCredential(CredentialPlatform.TWITTER),
      makeOrganization(),
    );

    expect(result).toEqual({
      allowed: true,
      currentCount: 0,
      dailyLimit: 0,
      platform: CredentialPlatform.TWITTER,
    });
    expect(mockPostsService.count).not.toHaveBeenCalled();
  });

  it('treats a missing limit on a mapped platform as unmetered', async () => {
    mockOrganizationSettingsService.findOne.mockResolvedValueOnce({});

    const result = await service.checkQuota(
      makeCredential(CredentialPlatform.YOUTUBE),
      makeOrganization(),
    );

    expect(result.allowed).toBe(true);
    expect(result.dailyLimit).toBe(0);
    expect(mockPostsService.count).not.toHaveBeenCalled();
  });

  it('enforces a raised X cap (48/day)', async () => {
    mockOrganizationSettingsService.findOne.mockResolvedValueOnce({
      quotaTwitter: 48,
    });
    mockPostsService.count.mockResolvedValueOnce(47);

    const allowedResult = await service.checkQuota(
      makeCredential('TWITTER'),
      makeOrganization(),
    );
    expect(allowedResult.allowed).toBe(true);
    expect(allowedResult.dailyLimit).toBe(48);

    mockOrganizationSettingsService.findOne.mockResolvedValueOnce({
      quotaTwitter: 48,
    });
    mockPostsService.count.mockResolvedValueOnce(48);

    const blockedResult = await service.checkQuota(
      makeCredential('TWITTER'),
      makeOrganization(),
    );
    expect(blockedResult.allowed).toBe(false);
    expect(blockedResult.currentCount).toBe(48);
  });

  it('should not block publishing on unmapped platforms in verifyQuota', async () => {
    const org = makeOrganization();
    mockOrganizationsService.findOne.mockResolvedValueOnce(org);
    mockOrganizationSettingsService.findOne.mockResolvedValueOnce({});

    await expect(
      service.verifyQuota(
        makeCredential(CredentialPlatform.LINKEDIN),
        org.id.toString(),
      ),
    ).resolves.toBeUndefined();
  });

  it('should map each platform to its settings field', async () => {
    const platforms = [
      { key: 'quotaYoutube', platform: CredentialPlatform.YOUTUBE },
      { key: 'quotaTiktok', platform: CredentialPlatform.TIKTOK },
      { key: 'quotaInstagram', platform: CredentialPlatform.INSTAGRAM },
      { key: 'quotaTwitter', platform: CredentialPlatform.TWITTER },
    ] as const;

    for (const { key, platform } of platforms) {
      mockOrganizationSettingsService.findOne.mockResolvedValueOnce({
        [key]: 99,
      });
      mockPostsService.count.mockResolvedValueOnce(0);
      const result = await service.checkQuota(
        makeCredential(platform),
        makeOrganization(),
      );
      expect(result.dailyLimit).toBe(99);
    }
  });

  it('should throw NOT_FOUND when organization does not exist in verifyQuota', async () => {
    mockOrganizationsService.findOne.mockResolvedValueOnce(null);
    const cred = makeCredential();
    await expect(
      service.verifyQuota(cred, objectId().toString()),
    ).rejects.toThrow(HttpException);
  });

  it('should throw TOO_MANY_REQUESTS when quota exceeded', async () => {
    const org = makeOrganization();
    mockOrganizationsService.findOne.mockResolvedValueOnce(org);
    mockOrganizationSettingsService.findOne.mockResolvedValueOnce({
      quotaTwitter: 5,
    });
    mockPostsService.count.mockResolvedValueOnce(5);

    try {
      await service.verifyQuota(makeCredential(), org.id.toString());
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });

  it('should resolve without error when quota is available', async () => {
    const org = makeOrganization();
    mockOrganizationsService.findOne.mockResolvedValueOnce(org);
    mockOrganizationSettingsService.findOne.mockResolvedValueOnce({
      quotaTwitter: 10,
    });
    mockPostsService.count.mockResolvedValueOnce(3);

    await expect(
      service.verifyQuota(makeCredential(), org.id.toString()),
    ).resolves.toBeUndefined();
  });

  it('should return null when credential not found in getQuotaStatus', async () => {
    mockCredentialsService.findOne.mockResolvedValueOnce(null);
    mockOrganizationsService.findOne.mockResolvedValueOnce(makeOrganization());

    const result = await service.getQuotaStatus(
      objectId().toString(),
      objectId().toString(),
    );
    expect(result).toBeNull();
  });

  it('should return null when organization not found in getQuotaStatus', async () => {
    mockCredentialsService.findOne.mockResolvedValueOnce(makeCredential());
    mockOrganizationsService.findOne.mockResolvedValueOnce(null);

    const result = await service.getQuotaStatus(
      objectId().toString(),
      objectId().toString(),
    );
    expect(result).toBeNull();
  });

  it('should return quota check result when both credential and org exist', async () => {
    const cred = makeCredential();
    const org = makeOrganization();
    mockCredentialsService.findOne.mockResolvedValueOnce(cred);
    mockOrganizationsService.findOne.mockResolvedValueOnce(org);
    mockOrganizationSettingsService.findOne.mockResolvedValueOnce({
      quotaTwitter: 20,
    });
    mockPostsService.count.mockResolvedValueOnce(8);

    const result = await service.getQuotaStatus(
      cred.id.toString(),
      org.id.toString(),
    );
    expect(result).not.toBeNull();
    expect(result?.currentCount).toBe(8);
    expect(result?.dailyLimit).toBe(20);
    expect(result?.allowed).toBe(true);
  });

  it('should return null and log error when an exception occurs in getQuotaStatus', async () => {
    mockCredentialsService.findOne.mockRejectedValueOnce(new Error('db down'));

    const result = await service.getQuotaStatus(
      objectId().toString(),
      objectId().toString(),
    );
    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
