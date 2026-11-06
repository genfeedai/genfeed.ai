import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsPublishingController } from '@api/collections/credentials/controllers/credentials-publishing.controller';
import type { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import type { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import type { CredentialPostingTimesService } from '@api/collections/credentials/services/credential-posting-times.service';
import type { CredentialPublishingOperationsService } from '@api/collections/credentials/services/credential-publishing-operations.service';
import type { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import { testId } from '@helpers/testing/test-id.helper';

interface PostingTime {
  hour: number;
  minute: number;
}

describe('CredentialsPublishingController', () => {
  const organizationId = testId('org');
  const otherOrganizationId = testId('org', 2);
  const brandId = testId('brand');
  const credentialId = testId('credential');
  const userId = testId('user');
  const sessionUser = (organization: string) =>
    ({
      brandId,
      id: testId('session-user'),
      organizationId: organization,
      userId,
    }) as unknown as User;
  const user = sessionUser(organizationId);

  let postingTimes: Map<string, PostingTime[]>;
  let controller: CredentialsPublishingController;

  const sameTime = (a: PostingTime, b: PostingTime) =>
    a.hour === b.hour && a.minute === b.minute;

  beforeEach(() => {
    // Posting times live per organization and credential, so a read from
    // another organization sees an empty schedule.
    postingTimes = new Map();
    const timesFor = (organization: string, credential: string) =>
      postingTimes.get(`${organization}:${credential}`) ?? [];
    const store = (
      organization: string,
      credential: string,
      times: PostingTime[],
    ) => {
      postingTimes.set(`${organization}:${credential}`, times);
      return times;
    };

    const accountHealthService = {
      assessCredentialHealth: async (input: Record<string, unknown>) => ({
        assessed: input,
      }),
      confirmManualOverride: async (input: Record<string, unknown>) => ({
        overridden: input,
      }),
      listBrandHealth: async (organization: string, brand: string) => [
        { credentialId, scope: `${organization}/${brand}` },
      ],
    };
    const accountPublishingContextService = {
      resolve: async (input: Record<string, unknown>) => input,
    };
    const credentialPostingTimesService = {
      add: async (
        organization: string,
        credential: string,
        time: PostingTime,
      ) =>
        store(organization, credential, [
          ...timesFor(organization, credential),
          time,
        ]),
      findNextSlot: async (
        organization: string,
        credential: string,
        after?: string,
      ) => ({
        after: after ?? null,
        found: timesFor(organization, credential).length > 0,
      }),
      list: async (organization: string, credential: string) =>
        timesFor(organization, credential),
      remove: async (
        organization: string,
        credential: string,
        time: PostingTime,
      ) =>
        store(
          organization,
          credential,
          timesFor(organization, credential).filter(
            (current) => !sameTime(current, time),
          ),
        ),
      replace: async (
        organization: string,
        credential: string,
        times: PostingTime[],
      ) => store(organization, credential, times),
    };
    const credentialPublishingOperationsService = {
      getMentions: async (organization: string) => ({
        mentions: [{ handle: '@genfeed', organizationId: organization }],
      }),
      getQuotaStatus: async (credential: string, organization: string) => ({
        data: {
          attributes: { organizationId: organization },
          id: credential,
          type: 'quota-status',
        },
      }),
    };
    const credentialPublishingReadinessService = {
      resolveForBrand: async (organization: string, brand: string) => [
        { credentialId, scope: `${organization}/${brand}` },
      ],
    };

    controller = new CredentialsPublishingController(
      accountHealthService as unknown as AccountHealthService,
      accountPublishingContextService as unknown as AccountPublishingContextService,
      credentialPostingTimesService as unknown as CredentialPostingTimesService,
      credentialPublishingOperationsService as unknown as CredentialPublishingOperationsService,
      credentialPublishingReadinessService as unknown as CredentialPublishingReadinessService,
    );
  });

  it('reads brand health and readiness inside the caller organization', async () => {
    await expect(
      controller.listBrandAccountHealth(brandId, user),
    ).resolves.toEqual([
      { credentialId, scope: `${organizationId}/${brandId}` },
    ]);
    await expect(
      controller.listBrandPublishingReadiness(brandId, user),
    ).resolves.toEqual([
      { credentialId, scope: `${organizationId}/${brandId}` },
    ]);
  });

  it('keeps the posting-time envelopes through a replace, add and remove', async () => {
    await expect(
      controller.listPostingTimes(credentialId, user),
    ).resolves.toEqual({ times: [] });
    await expect(
      controller.replacePostingTimes(
        credentialId,
        { times: [{ hour: 10, minute: 30 }] },
        user,
      ),
    ).resolves.toEqual({ times: [{ hour: 10, minute: 30 }] });
    await expect(
      controller.addPostingTime(credentialId, { hour: 18, minute: 0 }, user),
    ).resolves.toEqual({
      times: [
        { hour: 10, minute: 30 },
        { hour: 18, minute: 0 },
      ],
    });
    await expect(
      controller.removePostingTime(credentialId, { hour: 18, minute: 0 }, user),
    ).resolves.toEqual({ times: [{ hour: 10, minute: 30 }] });
    await expect(
      controller.listPostingTimes(credentialId, user),
    ).resolves.toEqual({ times: [{ hour: 10, minute: 30 }] });
  });

  it('does not show posting times to another organization', async () => {
    await controller.replacePostingTimes(
      credentialId,
      { times: [{ hour: 9, minute: 0 }] },
      user,
    );

    await expect(
      controller.listPostingTimes(
        credentialId,
        sessionUser(otherOrganizationId),
      ),
    ).resolves.toEqual({ times: [] });
    await expect(
      controller.findNextPostingSlot(
        credentialId,
        {},
        sessionUser(otherOrganizationId),
      ),
    ).resolves.toEqual({ after: null, found: false });
  });

  it('finds the next slot after the optional cursor', async () => {
    await controller.replacePostingTimes(
      credentialId,
      { times: [{ hour: 8, minute: 0 }] },
      user,
    );

    await expect(
      controller.findNextPostingSlot(
        credentialId,
        { after: '2026-08-26T08:00:00.000Z' },
        user,
      ),
    ).resolves.toEqual({ after: '2026-08-26T08:00:00.000Z', found: true });
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
    await expect(
      controller.getPublishingContext(credentialId, surface, user),
    ).resolves.toEqual({
      brandId,
      credentialId,
      organizationId,
      surface: expected,
    });
  });

  it('assesses and overrides with brand and canonical user context', async () => {
    const assessment = { thresholds: { minPublishedPosts: 1 } };
    const override = {
      confirm: true,
      reason: 'operator reviewed guidance',
    } as const;

    await expect(
      controller.assessAccountHealth(credentialId, assessment, user),
    ).resolves.toEqual({
      assessed: {
        brandId,
        credentialId,
        organizationId,
        request: assessment,
      },
    });
    await expect(
      controller.overrideAccountHealth(credentialId, override, user),
    ).resolves.toEqual({
      overridden: {
        credentialId,
        organizationId,
        request: override,
        userId,
      },
    });
  });

  it('reads mentions and quota inside the caller organization', async () => {
    await expect(controller.getMentions(user)).resolves.toEqual({
      mentions: [{ handle: '@genfeed', organizationId }],
    });
    await expect(
      controller.getQuotaStatus(credentialId, user),
    ).resolves.toEqual({
      data: {
        attributes: { organizationId },
        id: credentialId,
        type: 'quota-status',
      },
    });
  });
});
