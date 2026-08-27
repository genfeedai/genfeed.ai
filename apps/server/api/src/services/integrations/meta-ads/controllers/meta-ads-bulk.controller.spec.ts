vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((val: string) => `decrypted:${val}`) },
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { MetaAdsBulkController } from '@api/services/integrations/meta-ads/controllers/meta-ads-bulk.controller';
import { AdBulkUploadService } from '@api/services/integrations/meta-ads/services/ad-bulk-upload.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { AdBulkUploadJobsService } from '@server/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';

describe('MetaAdsBulkController credential resolution', () => {
  let controller: MetaAdsBulkController;
  let credentialsService: { findOne: ReturnType<typeof vi.fn> };
  let adBulkUploadService: { createBulkUpload: ReturnType<typeof vi.fn> };

  const organizationId = testId('org');
  const credentialId = testId('credential');

  const mockUser = {
    organizationId,
    userId: testId('user'),
  } as unknown as User;

  const body = {
    adAccountId: 'act_123',
    adSetId: 'adset_1',
    bodyCopies: ['Body'],
    campaignId: 'camp_1',
    creativeSource: 'library',
    credentialId,
    headlines: ['Headline'],
    images: ['image-1'],
    linkUrl: 'https://example.com',
    videos: [],
  } as never;

  beforeEach(async () => {
    vi.clearAllMocks();

    credentialsService = {
      findOne: vi.fn().mockResolvedValue({
        accessToken: 'encrypted_fb_token',
        id: credentialId,
        platform: CredentialPlatform.FACEBOOK,
      }),
    };

    adBulkUploadService = {
      createBulkUpload: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaAdsBulkController,
        { provide: AdBulkUploadJobsService, useValue: {} },
        { provide: AdBulkUploadService, useValue: adBulkUploadService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: LoggerService, useValue: { error: vi.fn(), log: vi.fn() } },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(MetaAdsBulkController);
  });

  it('resolves the exact credential the caller named', async () => {
    await controller.createBulkUpload(mockUser, body);

    // Matching only on organization + platform would let the job persist one
    // credentialId while spending through a different account's token.
    expect(credentialsService.findOne).toHaveBeenCalledWith({
      id: credentialId,
      isConnected: true,
      isDeleted: false,
      organizationId,
      platform: CredentialPlatform.FACEBOOK,
    });
    expect(adBulkUploadService.createBulkUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'decrypted:encrypted_fb_token',
        credentialId,
      }),
    );
  });

  it('queues no work when the named credential cannot be resolved', async () => {
    credentialsService.findOne.mockResolvedValue(null);

    await expect(controller.createBulkUpload(mockUser, body)).rejects.toThrow(
      NotFoundException,
    );

    expect(adBulkUploadService.createBulkUpload).not.toHaveBeenCalled();
  });
});
