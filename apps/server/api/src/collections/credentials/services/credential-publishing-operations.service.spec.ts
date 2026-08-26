import { CredentialPublishingOperationsService } from '@api/collections/credentials/services/credential-publishing-operations.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { QuotaService } from '@api/services/quota/quota.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('CredentialPublishingOperationsService', () => {
  const organizationId = testId('org');
  const credentialId = testId('credential');
  const credentialsService = {
    find: vi.fn(),
    findOne: vi.fn(),
  };
  const organizationsService = { findOne: vi.fn() };
  const quotaService = { checkQuota: vi.fn() };
  const service = new CredentialPublishingOperationsService(
    credentialsService as unknown as CredentialsService,
    organizationsService as unknown as OrganizationsService,
    quotaService as unknown as QuotaService,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('queries connected organization credentials and maps deduplicated mention fallbacks', async () => {
    credentialsService.find.mockResolvedValue([
      {
        externalAvatar: undefined,
        externalHandle: '@genfeed',
        externalName: undefined,
        id: { toString: () => credentialId },
        platform: 'TWITTER',
      },
      {
        externalAvatar: 'https://cdn.example/avatar.png',
        externalHandle: '@genfeed',
        externalName: 'Duplicate',
        id: testId('duplicate'),
        platform: 'TWITTER',
      },
      {
        externalHandle: null,
        id: testId('missing-handle'),
        platform: 'INSTAGRAM',
      },
      {
        externalAvatar: 'https://cdn.example/instagram.png',
        externalHandle: '@genfeed',
        externalName: 'Genfeed Instagram',
        id: testId('instagram'),
        platform: 'INSTAGRAM',
      },
    ]);

    await expect(service.getMentions(organizationId)).resolves.toEqual({
      mentions: [
        {
          avatar: null,
          handle: '@genfeed',
          id: credentialId,
          name: '@genfeed',
          platform: CredentialPlatform.TWITTER,
        },
        {
          avatar: 'https://cdn.example/instagram.png',
          handle: '@genfeed',
          id: testId('instagram'),
          name: 'Genfeed Instagram',
          platform: CredentialPlatform.INSTAGRAM,
        },
      ],
    });
    expect(credentialsService.find).toHaveBeenCalledWith({
      isConnected: true,
      organizationId,
    });
  });

  it('preserves the exact unknown-platform 400 response', async () => {
    credentialsService.find.mockResolvedValue([
      {
        externalHandle: '@unknown',
        id: credentialId,
        platform: 'UNKNOWN_NETWORK',
      },
    ]);

    const promise = service.getMentions(organizationId);

    await expect(promise).rejects.toMatchObject({
      response: {
        detail: 'Unknown credential platform: UNKNOWN_NETWORK',
        title: 'Unknown credential platform',
      },
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('uses the tenant-scoped credential and organization to return the quota JSON:API envelope', async () => {
    const credential = { id: { toString: () => credentialId } };
    const organization = { id: organizationId };
    const quotaStatus = { limit: 500, remaining: 100 };
    credentialsService.findOne.mockResolvedValue(credential);
    organizationsService.findOne.mockResolvedValue(organization);
    quotaService.checkQuota.mockResolvedValue(quotaStatus);

    await expect(
      service.getQuotaStatus(credentialId, organizationId),
    ).resolves.toEqual({
      data: {
        attributes: quotaStatus,
        id: credentialId,
        type: 'quota-status',
      },
    });
    expect(credentialsService.findOne).toHaveBeenCalledWith({
      id: credentialId,
      organizationId,
    });
    expect(organizationsService.findOne).toHaveBeenCalledWith({
      id: organizationId,
    });
    expect(quotaService.checkQuota).toHaveBeenCalledWith(
      credential,
      organization,
    );
  });

  it.each([
    ['credential', null, { id: organizationId }, 'Credential not found'],
    ['organization', { id: credentialId }, null, 'Organization not found'],
  ] as const)(
    'returns the exact %s quota 404 payload',
    async (_missing, credential, organization, message) => {
      credentialsService.findOne.mockResolvedValue(credential);
      organizationsService.findOne.mockResolvedValue(organization);

      try {
        await service.getQuotaStatus(credentialId, organizationId);
        expect.unreachable('Expected getQuotaStatus to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect((error as HttpException).getResponse()).toEqual({
          detail: message,
          title: message,
        });
      }
    },
  );
});
