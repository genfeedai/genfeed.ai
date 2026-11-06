import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import type { AssembleContextParams } from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { delegateFindOneSelect } from '@api-test/mocks/service.mocks';
import { MemberRole } from '@genfeedai/contracts';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));

type Ctor = ConstructorParameters<typeof AgentContextAssemblyService>;

function fixture() {
  // The live membership row the access policy reads on every request.
  const member = {
    brands: [{ id: 'brand-a' }],
    role: { key: MemberRole.USER },
    roleKey: MemberRole.OWNER,
  };
  // Everything the assembler touched: the brand identity load, the cache,
  // and each enrichment layer.
  const touched: string[] = [];
  const cache = new Map<string, unknown>();
  const touch =
    <T>(name: string, value: T) =>
    async () => {
      touched.push(name);
      return value;
    };

  const policy = new BrandAccessService({
    apiKey: { findFirst: async () => ({ scopes: [] }) },
    brand: {
      findFirst: async ({
        where,
      }: {
        where: { AND: Array<{ id?: { in: string[] } }> };
      }) => {
        const predicate = where.AND[0];
        return !predicate?.id || predicate.id.in.includes('brand-a')
          ? { id: 'brand-a' }
          : null;
      },
    },
    member: { findFirst: async () => member },
  } as unknown as PrismaService);

  const service = new AgentContextAssemblyService(
    ...([
      {
        brandAccessService: policy,
        findOne: touch('brand-identity', {
          id: 'brand-a',
          label: 'Authorized identity',
          organizationId: 'org-a',
        }),
        findOneSelect: delegateFindOneSelect(),
        resolveBrandKitAssets: async () => ({
          banner: null,
          logo: null,
          references: [],
        }),
      },
      { getInsights: touch('brand-memory', []) },
      {
        retrieveBrandContentMemory: touch('content-memory', []),
        retrieveBrandKnowledge: touch('brand-knowledge', []),
        retrieveOrgAndPersonalContentMemory: touch('org-memory', []),
      },
      {
        findOne: async () => ({ currentBrandId: 'brand-a' }),
        findOneSelect: delegateFindOneSelect(),
      },
      { post: { findMany: touch('recent-posts', []) } },
      {
        generateKey: (...parts: string[]) => parts.join(':'),
        getOrSet: async (key: string, factory: () => Promise<unknown>) => {
          touched.push(`cache:${key}`);
          if (!cache.has(key)) cache.set(key, await factory());
          return cache.get(key);
        },
      },
      { debug: () => {}, error: () => {}, log: () => {}, warn: () => {} },
      { getTopPatternsForBrand: touch('performance', []) },
      {
        findOne: async () => null,
        findOneSelect: delegateFindOneSelect(),
      },
      undefined,
    ] as unknown as Ctor),
  );
  return { cache, member, service, touched };
}

const params: AssembleContextParams = {
  brandId: 'brand-a',
  layers: {
    brandKnowledge: false,
    brandMemory: false,
    performancePatterns: false,
    ragContext: false,
    recentPosts: false,
  },
  organizationId: 'org-a',
  userId: 'actor',
};

describe('context assembly fresh authorization before cached layers', () => {
  it('denies immediately after assignment revocation while the warm identity remains cached', async () => {
    const f = fixture();
    await f.service.assembleContext(params);
    await f.service.assembleContext(params);
    expect(f.touched.filter((entry) => entry === 'brand-identity')).toEqual([
      'brand-identity',
    ]);
    expect(f.cache.has('brand-ctx:org-a:brand-a')).toBe(true);
    f.touched.length = 0;

    f.member.brands = [];

    await expect(
      f.service.assembleContext({ ...params, query: 'preview retrieval' }),
    ).rejects.toThrow(ForbiddenException);
    expect(f.touched).toEqual([]);
    expect(f.cache.has('brand-ctx:org-a:brand-a')).toBe(true);
  });

  it('uses the canonical live role before a previously warmed owner context', async () => {
    const f = fixture();
    f.member.role.key = MemberRole.OWNER;
    f.member.brands = [];
    await f.service.assembleContext(params);
    f.touched.length = 0;

    f.member.role.key = MemberRole.USER;

    await expect(f.service.assembleContext(params)).rejects.toThrow(
      ForbiddenException,
    );
    expect(f.member.roleKey).toBe(MemberRole.OWNER);
    expect(f.touched).toEqual([]);
  });

  it('does not turn currentBrandId into a grant for an empty member', async () => {
    const f = fixture();
    f.member.brands = [];

    await expect(
      f.service.assembleContext({ ...params, brandId: undefined }),
    ).resolves.toBeNull();
    expect(f.touched).toEqual([]);
  });

  it('does not turn currentBrandId into a grant for a capped owner key', async () => {
    const f = fixture();
    f.member.brands = [];
    f.member.role.key = MemberRole.OWNER;

    await expect(
      f.service.assembleContext({
        ...params,
        apiKeyId: 'key-a',
        isApiKey: true,
        scopes: [],
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(f.touched).toEqual([]);
  });
});
