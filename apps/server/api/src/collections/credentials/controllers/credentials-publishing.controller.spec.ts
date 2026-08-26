import { CredentialsPublishingController } from '@api/collections/credentials/controllers/credentials-publishing.controller';
import type { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import type { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import type { CredentialPostingTimesService } from '@api/collections/credentials/services/credential-posting-times.service';
import type { CredentialPublishingOperationsService } from '@api/collections/credentials/services/credential-publishing-operations.service';
import type { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import { testId } from '@helpers/testing/test-id.helper';

describe('CredentialsPublishingController', () => {
  const organizationId = testId('org');
  const brandId = testId('brand');
  const credentialId = testId('credential');
  const userId = testId('user');
  const user = {
    brandId,
    id: testId('session-user'),
    organizationId,
    userId,
  } as never;

  const accountHealthService = {
    assessCredentialHealth: vi.fn(),
    confirmManualOverride: vi.fn(),
    listBrandHealth: vi.fn(),
  };
  const accountPublishingContextService = { resolve: vi.fn() };
  const credentialPostingTimesService = {
    add: vi.fn(),
    findNextSlot: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
    replace: vi.fn(),
  };
  const credentialPublishingOperationsService = {
    getMentions: vi.fn(),
    getQuotaStatus: vi.fn(),
  };
  const credentialPublishingReadinessService = { resolveForBrand: vi.fn() };
  const controller = new CredentialsPublishingController(
    accountHealthService as unknown as AccountHealthService,
    accountPublishingContextService as unknown as AccountPublishingContextService,
    credentialPostingTimesService as unknown as CredentialPostingTimesService,
    credentialPublishingOperationsService as unknown as CredentialPublishingOperationsService,
    credentialPublishingReadinessService as unknown as CredentialPublishingReadinessService,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates brand health and readiness inside the caller organization', async () => {
    const health = [{ credentialId }];
    const readiness = [{ credentialId }];
    accountHealthService.listBrandHealth.mockResolvedValue(health);
    credentialPublishingReadinessService.resolveForBrand.mockResolvedValue(
      readiness,
    );

    await expect(
      controller.listBrandAccountHealth(brandId, user),
    ).resolves.toEqual(health);
    await expect(
      controller.listBrandPublishingReadiness(brandId, user),
    ).resolves.toEqual(readiness);

    expect(accountHealthService.listBrandHealth).toHaveBeenCalledWith(
      organizationId,
      brandId,
    );
    expect(
      credentialPublishingReadinessService.resolveForBrand,
    ).toHaveBeenCalledWith(organizationId, brandId);
  });

  it('preserves posting-time CRUD envelopes and tenant delegation', async () => {
    const initial = [{ hour: 9, minute: 0 }];
    const replacement = [{ hour: 10, minute: 30 }];
    const added = [...replacement, { hour: 18, minute: 0 }];
    credentialPostingTimesService.list.mockResolvedValue(initial);
    credentialPostingTimesService.replace.mockResolvedValue(replacement);
    credentialPostingTimesService.add.mockResolvedValue(added);
    credentialPostingTimesService.remove.mockResolvedValue(replacement);

    await expect(
      controller.listPostingTimes(credentialId, user),
    ).resolves.toEqual({ times: initial });
    await expect(
      controller.replacePostingTimes(
        credentialId,
        { times: replacement },
        user,
      ),
    ).resolves.toEqual({ times: replacement });
    await expect(
      controller.addPostingTime(credentialId, { hour: 18, minute: 0 }, user),
    ).resolves.toEqual({ times: added });
    await expect(
      controller.removePostingTime(credentialId, { hour: 18, minute: 0 }, user),
    ).resolves.toEqual({ times: replacement });

    expect(credentialPostingTimesService.list).toHaveBeenCalledWith(
      organizationId,
      credentialId,
    );
    expect(credentialPostingTimesService.replace).toHaveBeenCalledWith(
      organizationId,
      credentialId,
      replacement,
    );
    expect(credentialPostingTimesService.add).toHaveBeenCalledWith(
      organizationId,
      credentialId,
      { hour: 18, minute: 0 },
    );
    expect(credentialPostingTimesService.remove).toHaveBeenCalledWith(
      organizationId,
      credentialId,
      { hour: 18, minute: 0 },
    );
  });

  it('delegates next-slot lookup with its optional cursor', async () => {
    const result = { found: true, slot: '2026-08-27T08:00:00.000Z' };
    credentialPostingTimesService.findNextSlot.mockResolvedValue(result);

    await expect(
      controller.findNextPostingSlot(
        credentialId,
        { after: '2026-08-26T08:00:00.000Z' },
        user,
      ),
    ).resolves.toEqual(result);
    expect(credentialPostingTimesService.findNextSlot).toHaveBeenCalledWith(
      organizationId,
      credentialId,
      '2026-08-26T08:00:00.000Z',
    );
  });

  it.each([
    ['article', 'article'],
    ['image', 'image'],
    ['newsletter', 'newsletter'],
    ['post', 'post'],
    ['thread', 'thread'],
    ['video', 'video'],
    ['x-article', 'x-article'],
    ['unsupported', 'post'],
    [undefined, 'post'],
  ] as const)('maps publishing surface %s to %s', async (surface, expected) => {
    accountPublishingContextService.resolve.mockResolvedValue({
      surface: expected,
    });

    await controller.getPublishingContext(credentialId, surface, user);

    expect(accountPublishingContextService.resolve).toHaveBeenCalledWith({
      brandId,
      credentialId,
      organizationId,
      surface: expected,
    });
  });

  it('delegates assessment and override with brand and canonical user context', async () => {
    const assessment = { thresholds: { minPublishedPosts: 1 } };
    const override = {
      confirm: true,
      reason: 'operator reviewed guidance',
    } as const;
    accountHealthService.assessCredentialHealth.mockResolvedValue({
      credentialId,
    });
    accountHealthService.confirmManualOverride.mockResolvedValue({
      credentialId,
    });

    await controller.assessAccountHealth(credentialId, assessment, user);
    await controller.overrideAccountHealth(credentialId, override, user);

    expect(accountHealthService.assessCredentialHealth).toHaveBeenCalledWith({
      brandId,
      credentialId,
      organizationId,
      request: assessment,
    });
    expect(accountHealthService.confirmManualOverride).toHaveBeenCalledWith({
      credentialId,
      organizationId,
      request: override,
      userId,
    });
  });

  it('delegates mentions and quota to the bounded operations service', async () => {
    const mentions = { mentions: [{ handle: '@genfeed' }] };
    const quota = {
      data: { attributes: {}, id: credentialId, type: 'quota-status' },
    };
    credentialPublishingOperationsService.getMentions.mockResolvedValue(
      mentions,
    );
    credentialPublishingOperationsService.getQuotaStatus.mockResolvedValue(
      quota,
    );

    await expect(controller.getMentions(user)).resolves.toEqual(mentions);
    await expect(
      controller.getQuotaStatus(credentialId, user),
    ).resolves.toEqual(quota);
    expect(
      credentialPublishingOperationsService.getMentions,
    ).toHaveBeenCalledWith(organizationId);
    expect(
      credentialPublishingOperationsService.getQuotaStatus,
    ).toHaveBeenCalledWith(credentialId, organizationId);
  });
});
