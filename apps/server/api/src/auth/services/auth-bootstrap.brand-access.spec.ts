import {
  type AuthBootstrapRequest,
  AuthBootstrapService,
} from '@api/auth/services/auth-bootstrap.service';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { AccessBootstrapCachePayload } from '@api/common/services/access-bootstrap-cache.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ cloud: true }));
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => runtime.cloud,
}));
vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getIsSuperAdmin: () => false,
  getStripeSubscriptionStatus: () => '',
  getSubscriptionTier: () => '',
}));

const request = {
  user: {
    id: 'opaque-user',
    userId: 'opaque-user',
    organizationId: 'org-a',
    brandId: 'brand-a',
  },
  context: {
    userId: 'opaque-user',
    organizationId: 'org-a',
    brandId: 'brand-a',
  },
} as AuthBootstrapRequest;

function fixture() {
  const member = {
    role: { key: MemberRole.USER },
    brands: [{ id: 'brand-a' }],
  };
  const findMember = vi.fn().mockResolvedValue(member);
  const policy = new BrandAccessService({
    member: { findFirst: findMember },
  } as unknown as PrismaService);
  const rows = [
    { id: 'brand-a', label: 'Visible', slug: 'visible' },
    { id: 'brand-b', label: 'Hidden', slug: 'hidden' },
  ];
  const findForOrganization = vi
    .fn()
    .mockImplementation(
      async (_orgId: string, options: { brandIds?: string[] }) =>
        rows.filter(
          (brand) =>
            options.brandIds === undefined ||
            options.brandIds.includes(brand.id),
        ),
    );
  let cache: AccessBootstrapCachePayload | null = null;
  const get = vi.fn().mockImplementation(async () => cache);
  const set = vi
    .fn()
    .mockImplementation(
      async (
        _user: string,
        _org: string,
        payload: AccessBootstrapCachePayload,
      ) => {
        cache = payload;
      },
    );
  const review = vi.fn().mockResolvedValue({
    approvedCount: 0,
    changesRequestedCount: 0,
    pendingCount: 1,
    readyCount: 0,
    recentItems: [],
    rejectedCount: 0,
  });
  type Dependencies = ConstructorParameters<typeof AuthBootstrapService>;
  const service = new AuthBootstrapService(
    { get, set } as unknown as Dependencies[0],
    {
      brandAccessService: policy,
      findForOrganization,
    } as unknown as Dependencies[1],
    {
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
    } as unknown as Dependencies[2],
    { getReviewInboxSummary: review } as unknown as Dependencies[3],
    {
      findOne: vi.fn().mockResolvedValue(member),
    } as unknown as Dependencies[4],
    { findOne: vi.fn().mockResolvedValue({}) } as unknown as Dependencies[5],
    {
      getStreakSummary: vi.fn().mockResolvedValue(null),
    } as unknown as Dependencies[6],
    {
      findOne: vi
        .fn()
        .mockResolvedValue({ id: 'opaque-user', isOnboardingCompleted: true }),
    } as unknown as Dependencies[7],
  );
  return { member, findMember, service, findForOrganization, review, get, set };
}

describe('Cloud bootstrap live brand policy across warmed caches', () => {
  beforeEach(() => {
    runtime.cloud = true;
  });
  it('returns only assigned brands and removes revoked cached current-brand preference', async () => {
    const f = fixture();
    const initial = await f.service.getBootstrap(request);
    expect(initial.brands.map((brand) => brand.id)).toEqual(['brand-a']);
    expect(initial.access.brandId).toBe('brand-a');
    f.member.brands = [];
    const revoked = await f.service.getBootstrap(request);
    expect(revoked.brands).toEqual([]);
    expect(revoked.access.brandId).toBe('');
    expect(JSON.stringify(revoked)).not.toContain('hidden');
    expect(f.findMember).toHaveBeenCalledTimes(2);
    expect(f.findForOrganization).toHaveBeenLastCalledWith('org-a', {
      brandIds: [],
      includeCredentials: true,
    });
  });
  it('rechecks live role downgrade before returning cached owner brand rows', async () => {
    const f = fixture();
    f.member.role.key = MemberRole.OWNER;
    expect((await f.service.getBootstrap(request)).brands).toHaveLength(2);
    f.member.role.key = MemberRole.CREATOR;
    f.member.brands = [];
    const downgraded = await f.service.getBootstrap(request);
    expect(downgraded.brands).toEqual([]);
    expect(downgraded.access.memberRole).toBe(MemberRole.CREATOR);
  });
  it('does not query an undefined brand review scope after warmed overview revocation', async () => {
    const f = fixture();
    await f.service.getOverviewBootstrap(request);
    expect(f.review).toHaveBeenCalledWith('org-a', 'brand-a', 5);
    f.member.brands = [];
    const revoked = await f.service.getOverviewBootstrap(request);
    expect(revoked.reviewInbox.pendingCount).toBe(0);
    expect(revoked.reviewInbox.recentItems).toEqual([]);
    expect(f.review).toHaveBeenCalledOnce();
  });
  it('applies capped API-key effective role before resolving a cached privileged session', async () => {
    const f = fixture();
    f.member.role.key = MemberRole.OWNER;
    f.member.brands = [];
    await f.service.getBootstrap(request);
    const keyUser = {
      id: 'opaque-user',
      userId: 'opaque-user',
      organizationId: 'org-a',
      brandId: 'brand-a',
      isApiKey: true,
      scopes: ['read'],
    };
    const keyRequest = Object.assign({}, request, { user: keyUser });
    const key = await f.service.getBootstrap(keyRequest);
    expect(key.brands).toEqual([]);
    expect(key.access.memberRole).toBe(MemberRole.USER);
    const admin = await f.service.getBootstrap(
      Object.assign({}, keyRequest, {
        user: { ...keyUser, scopes: ['admin'] },
      }),
    );
    expect(admin.brands).toHaveLength(2);
  });
});
