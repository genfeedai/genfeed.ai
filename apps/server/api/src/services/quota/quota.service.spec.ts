import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const objectId = () => 'test-object-id';

const makeCredential = (
  platform: CredentialPlatform = CredentialPlatform.TWITTER,
): CredentialDocument =>
  ({
    _id: objectId(),
    platform,
  }) as unknown as CredentialDocument;

const makeOrganization = (): OrganizationDocument =>
  ({
    _id: objectId(),
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

  it('should default dailyLimit to 0 for unsupported platforms', async () => {
    mockOrganizationSettingsService.findOne.mockResolvedValueOnce({});
    mockPostsService.count.mockResolvedValueOnce(0);

    const result = await service.checkQuota(
      makeCredential(CredentialPlatform.LINKEDIN as CredentialPlatform),
      makeOrganization(),
    );

    expect(result.dailyLimit).toBe(0);
    expect(result.allowed).toBe(false);
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
      await service.verifyQuota(makeCredential(), org._id.toString());
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
      service.verifyQuota(makeCredential(), org._id.toString()),
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
      cred._id.toString(),
      org._id.toString(),
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
