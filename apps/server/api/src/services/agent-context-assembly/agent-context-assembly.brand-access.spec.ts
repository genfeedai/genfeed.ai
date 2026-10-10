import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import type { AssembleContextParams } from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));

function fixture() {
  const member = {
    role: { key: MemberRole.USER },
    roleKey: MemberRole.OWNER,
    brands: [{ id: 'brand-a' }],
  };
  const findMember = vi.fn().mockImplementation(async () => member);
  const findBrand = vi.fn().mockImplementation(async ({ where }) => {
    const predicate = where.AND[0];
    return !predicate.id || predicate.id.in.includes('brand-a')
      ? { id: 'brand-a' }
      : null;
  });
  const policy = new BrandAccessService({
    member: { findFirst: findMember },
    brand: { findFirst: findBrand },
  } as unknown as PrismaService);
  const stored = new Map<string, unknown>();
  const getOrSet = vi.fn(
    async (key: string, factory: () => Promise<unknown>) => {
      if (!stored.has(key)) stored.set(key, await factory());
      return stored.get(key);
    },
  );
  const brands = {
    brandAccessService: policy,
    findOne: vi.fn().mockResolvedValue({
      id: 'brand-a',
      label: 'Authorized identity',
      organizationId: 'org-a',
    }),
    resolveBrandKitAssets: vi
      .fn()
      .mockResolvedValue({ logo: null, banner: null, references: [] }),
  };
  const memory = { getInsights: vi.fn().mockResolvedValue([]) };
  const retrieval = {
    retrieveBrandKnowledge: vi.fn().mockResolvedValue([]),
    retrieveBrandContentMemory: vi.fn().mockResolvedValue([]),
    retrieveOrgAndPersonalContentMemory: vi.fn().mockResolvedValue([]),
  };
  const performance = { getTopPatternsForBrand: vi.fn().mockResolvedValue([]) };
  const recentPosts = vi.fn().mockResolvedValue([]);
  const service = new AgentContextAssemblyService(
    brands as never,
    memory as never,
    retrieval as never,
    {
      findOne: vi.fn().mockResolvedValue({ currentBrandId: 'brand-a' }),
    } as never,
    { post: { findMany: recentPosts } } as never,
    { generateKey: (...parts: string[]) => parts.join(':'), getOrSet } as never,
    { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    performance as never,
    { findOne: vi.fn().mockResolvedValue(null) } as never,
    undefined as never,
  );
  return {
    member,
    findMember,
    service,
    stored,
    getOrSet,
    brands,
    memory,
    retrieval,
    performance,
    recentPosts,
  };
}
const params: AssembleContextParams = {
  userId: 'actor',
  organizationId: 'org-a',
  brandId: 'brand-a',
  layers: {
    brandMemory: false,
    brandKnowledge: false,
    recentPosts: false,
    ragContext: false,
    performancePatterns: false,
  },
};

describe('context assembly fresh authorization before cached layers', () => {
  it('denies immediately after assignment revocation while the warm identity remains cached', async () => {
    const f = fixture();
    await f.service.assembleContext(params);
    await f.service.assembleContext(params);
    expect(f.brands.findOne).toHaveBeenCalledTimes(1);
    expect(f.findMember).toHaveBeenCalledTimes(2);
    const key = 'brand-ctx:org-a:brand-a';
    expect(f.stored.has(key)).toBe(true);
    const reads = f.getOrSet.mock.calls.length;
    f.member.brands = [];
    await expect(
      f.service.assembleContext({ ...params, query: 'preview retrieval' }),
    ).rejects.toThrow(ForbiddenException);
    expect(f.getOrSet).toHaveBeenCalledTimes(reads);
    expect(f.stored.has(key)).toBe(true);
    expect(f.memory.getInsights).not.toHaveBeenCalled();
    expect(f.retrieval.retrieveBrandKnowledge).not.toHaveBeenCalled();
    expect(f.retrieval.retrieveBrandContentMemory).not.toHaveBeenCalled();
    expect(f.performance.getTopPatternsForBrand).not.toHaveBeenCalled();
    expect(f.recentPosts).not.toHaveBeenCalled();
  });

  it('uses canonical live role before a previously warmed owner context', async () => {
    const f = fixture();
    f.member.role.key = MemberRole.OWNER;
    f.member.brands = [];
    await f.service.assembleContext(params);
    const reads = f.getOrSet.mock.calls.length;
    f.member.role.key = MemberRole.USER;
    await expect(f.service.assembleContext(params)).rejects.toThrow(
      ForbiddenException,
    );
    expect(f.member.roleKey).toBe(MemberRole.OWNER);
    expect(f.getOrSet).toHaveBeenCalledTimes(reads);
  });

  it('does not turn currentBrandId into a grant for an empty member or capped owner key', async () => {
    const f = fixture();
    f.member.brands = [];
    expect(
      await f.service.assembleContext({ ...params, brandId: undefined }),
    ).toBeNull();
    expect(f.getOrSet).not.toHaveBeenCalled();
    f.member.role.key = MemberRole.OWNER;
    await expect(
      f.service.assembleContext({ ...params, isApiKey: true, scopes: [] }),
    ).rejects.toThrow(ForbiddenException);
    expect(f.getOrSet).not.toHaveBeenCalled();
  });
});
