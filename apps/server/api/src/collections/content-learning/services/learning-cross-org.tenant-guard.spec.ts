import { ContentLearningAdminController } from '@api/collections/content-learning/controllers/content-learning-admin.controller';
import { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import {
  invalidateLearningDependencySource,
  LearningDependencyService,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import {
  isCrossOrgUnsafe,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import {
  assertTenantScopedQuery,
  TenantIsolationError,
} from '@libs/prisma/tenant-guard';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

/**
 * CLOUD tenant guard over the content-learning surfaces whose derived rows and
 * admin reads belong to organizations other than the request tenant.
 */
const TENANT_MODELS = new Set([
  'ContentLearningAccount',
  'ContentLearningReward',
]);

function guard(model: string, operation: string, args: unknown) {
  assertTenantScopedQuery({
    args,
    isCloud: true,
    model,
    operation,
    tenantModelNames: TENANT_MODELS,
  });
}

describe('content-learning cross-organization paths (CLOUD tenant guard)', () => {
  it('proves the harness: a reward write for another org throws under a tenant', () => {
    expect(() =>
      runWithTenantContext({ organizationId: 'org-a' }, () =>
        guard('ContentLearningReward', 'updateMany', {
          where: { id: 'r', isDeleted: false, organizationId: 'org-b' },
        }),
      ),
    ).toThrow(TenantIsolationError);
  });

  it('invalidates derived rows of another organization without tripping the guard', async () => {
    const rewardUpdate = vi.fn(async (args: unknown) => {
      guard('ContentLearningReward', 'updateMany', args);
      return { count: 1 };
    });
    const tx = {
      contentLearningDependency: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              derivedId: 'reward-1',
              derivedKind: 'reward',
              derivedOrganizationId: 'org-b',
              id: 'edge-1',
              sourceOrganizationId: 'org-b',
            },
          ])
          .mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentLearningReward: { updateMany: rewardUpdate },
    } as unknown as Prisma.TransactionClient;

    await runWithTenantContext({ organizationId: 'org-a' }, () =>
      invalidateLearningDependencySource(tx, 'decision', 'decision-1', 'org-b'),
    );

    expect(rewardUpdate).toHaveBeenCalledTimes(1);
  });

  it('walks dependency pins outside the request tenant', async () => {
    const service = new LearningDependencyService({} as PrismaService);
    let wasCrossOrg = false;
    vi.spyOn(
      service as unknown as { walk: () => Promise<boolean> },
      'walk',
    ).mockImplementation(async () => {
      wasCrossOrg = isCrossOrgUnsafe();
      return true;
    });

    await runWithTenantContext({ organizationId: 'org-a' }, () =>
      service.valid('release', 'release-1', {} as never, null),
    );

    expect(wasCrossOrg).toBe(true);
  });

  it('pauses an account of any organization outside the admin tenant, and 404s on a missing one', async () => {
    const findFirst = vi.fn(async (args: unknown) => {
      guard('ContentLearningAccount', 'findFirst', args);
      return { credentialId: 'cred-1', id: 'acct-1', organizationId: 'org-b' };
    });
    const mutate = vi.fn().mockResolvedValue({ mode: 'paused' });
    const service = new LearningAccountService(
      { contentLearningAccount: { findFirst } } as unknown as PrismaService,
      { mutate } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await runWithTenantContext({ organizationId: 'org-admin' }, () =>
      service.emergencyPause('admin-1', 'acct-1', {
        expectedRevision: 1,
        reason: 'abuse',
        requestId: 'req-1',
      }),
    );
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { actorId: 'admin-1', organizationId: 'org-b' },
      }),
      expect.any(Function),
    );

    findFirst.mockResolvedValueOnce(null as never);
    await expect(
      service.emergencyPause('admin-1', 'missing', {
        expectedRevision: 1,
        reason: 'abuse',
        requestId: 'req-2',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists every organization account for the superadmin inventory', async () => {
    const findMany = vi.fn(async (args: unknown) => {
      guard('ContentLearningAccount', 'findMany', args);
      return [{ id: 'acct-1' }];
    });
    const controller = new ContentLearningAdminController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { contentLearningAccount: { findMany } } as unknown as PrismaService,
    );

    await expect(
      runWithTenantContext({ organizationId: 'org-admin' }, () =>
        controller.accounts({} as never, { limit: 20, page: 1 } as never),
      ),
    ).resolves.toMatchObject({ docs: [{ id: 'acct-1' }] });
  });
});
