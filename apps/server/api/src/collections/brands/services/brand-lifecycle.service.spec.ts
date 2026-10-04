import { NotFoundException } from '@api/exceptions/not-found.exception';

// Real, schema-derived getModelMeta/PRISMA_MODEL_METADATA plus a working
// `Prisma.sql` tag via the light @genfeedai/prisma/testing subpath — no heavy
// PrismaClient/runtime import required.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { BrandLifecycleService } from '@api/collections/brands/services/brand-lifecycle.service';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import type { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import type { CacheService } from '@api/services/cache/cache.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { ConflictException } from '@nestjs/common';

describe('BrandLifecycleService', () => {
  let service: BrandLifecycleService;
  let delegate: Record<string, ReturnType<typeof vi.fn>>;
  let memberDelegate: Record<string, ReturnType<typeof vi.fn>>;
  let personaDelegate: Record<string, ReturnType<typeof vi.fn>>;
  let personaGrantDelegate: Record<string, ReturnType<typeof vi.fn>>;
  let txQueryRaw: ReturnType<typeof vi.fn>;
  let transactionMock: ReturnType<typeof vi.fn>;
  let learningAccounts: Record<string, ReturnType<typeof vi.fn>>;
  let dependencies: Record<string, ReturnType<typeof vi.fn>>;
  let cacheInvalidationService: {
    invalidate: ReturnType<typeof vi.fn>;
    invalidateByTags: ReturnType<typeof vi.fn>;
  };
  let accessBootstrapCacheService: {
    invalidateForOrganization: ReturnType<typeof vi.fn>;
  };
  let userAccessCacheService: {
    invalidateAll: ReturnType<typeof vi.fn>;
  };
  let loggerService: LoggerService;

  beforeEach(() => {
    delegate = {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    };
    memberDelegate = {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn(),
    };
    personaDelegate = { findMany: vi.fn().mockResolvedValue([]) };
    personaGrantDelegate = { findMany: vi.fn().mockResolvedValue([]) };
    txQueryRaw = vi.fn().mockResolvedValue([{ id: 'locked' }]);
    cacheInvalidationService = {
      invalidate: vi.fn(),
      invalidateByTags: vi.fn(),
    };
    accessBootstrapCacheService = {
      invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
    };
    userAccessCacheService = {
      invalidateAll: vi.fn().mockResolvedValue(undefined),
    };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    // Both remove() and selectBrandForUser() run inside
    // `this.prisma.$transaction`; the fake client's tx callback gets the same
    // `brand`/`member` delegate mocks plus a dedicated `$queryRaw` for the
    // FOR UPDATE lock query, so assertions read naturally against `delegate`/
    // `memberDelegate` regardless of whether the call went through `tx` or
    // the top-level client.
    learningAccounts = {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    dependencies = { findMany: vi.fn().mockResolvedValue([]) };
    const txClient = {
      $queryRaw: txQueryRaw,
      brand: delegate,
      member: memberDelegate,
      persona: personaDelegate,
      personaGrant: personaGrantDelegate,
      contentLearningAccount: learningAccounts,
      contentLearningDependency: dependencies,
    };
    transactionMock = vi.fn(
      async (callback: (tx: typeof txClient) => Promise<unknown>) =>
        callback(txClient),
    );
    const prisma = {
      $transaction: transactionMock,
      brand: delegate,
      member: memberDelegate,
    } as unknown as PrismaService;

    service = new BrandLifecycleService(
      prisma,
      loggerService,
      { invalidateByTags: vi.fn() } as unknown as CacheService,
      cacheInvalidationService as unknown as CacheInvalidationService,
      accessBootstrapCacheService as unknown as AccessBootstrapCacheService,
      userAccessCacheService as unknown as UserAccessCacheService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('selectBrandForUser', () => {
    it('selects a brand using its canonical id, writing only the acting member currentBrandId', async () => {
      const currentBrandId = testId('brand');
      const organizationId = testId('org');
      const userId = 'user_current';

      delegate.findFirst.mockResolvedValue({
        id: currentBrandId,
        isDeleted: false,
        organizationId,
        userId,
      });
      memberDelegate.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.selectBrandForUser(
        currentBrandId,
        userId,
        organizationId,
      );

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: {
          id: currentBrandId,
          isDeleted: false,
          organizationId,
        },
      });
      expect(memberDelegate.updateMany).toHaveBeenCalledWith({
        data: { currentBrandId },
        where: { isDeleted: false, organizationId, userId },
      });
      expect(result).toMatchObject({ id: currentBrandId });
    });

    it('locks the target brand row before validating it, inside one transaction with the member write (#5295)', async () => {
      const currentBrandId = testId('brand');
      const organizationId = testId('org');
      const userId = 'user_current';

      delegate.findFirst.mockResolvedValue({
        id: currentBrandId,
        isDeleted: false,
        organizationId,
      });
      memberDelegate.updateMany.mockResolvedValue({ count: 1 });

      await service.selectBrandForUser(currentBrandId, userId, organizationId);

      // A concurrent remove() targeting the same brand row blocks behind
      // this FOR UPDATE lock (or vice versa) rather than racing the
      // read-then-write below it.
      expect(txQueryRaw).toHaveBeenCalledTimes(1);
    });

    it('throws when the target brand cannot be resolved', async () => {
      delegate.findFirst.mockResolvedValue(null);

      await expect(
        service.selectBrandForUser(
          'brand_missing',
          'user_current',
          'org_current',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(memberDelegate.updateMany).not.toHaveBeenCalled();
    });

    it('throws when the acting user has no matching member row in the organization', async () => {
      const currentBrandId = testId('brand');
      const organizationId = testId('org');
      const userId = 'user_orphan';

      delegate.findFirst.mockResolvedValue({
        id: currentBrandId,
        isDeleted: false,
        organizationId,
      });
      memberDelegate.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.selectBrandForUser(currentBrandId, userId, organizationId),
      ).rejects.toThrow(NotFoundException);
    });

    it('only reassigns the acting member: two members in the same org selecting different brands do not clobber each other', async () => {
      const organizationId = testId('org');
      const brandA = testId('brand', 1);
      const brandB = testId('brand', 2);
      const memberOneUserId = 'user_one';
      const memberTwoUserId = 'user_two';

      delegate.findFirst.mockImplementation(
        async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          isDeleted: false,
          organizationId,
        }),
      );
      memberDelegate.updateMany.mockResolvedValue({ count: 1 });

      await service.selectBrandForUser(brandA, memberOneUserId, organizationId);
      await service.selectBrandForUser(brandB, memberTwoUserId, organizationId);

      expect(memberDelegate.updateMany).toHaveBeenNthCalledWith(1, {
        data: { currentBrandId: brandA },
        where: {
          isDeleted: false,
          organizationId,
          userId: memberOneUserId,
        },
      });
      expect(memberDelegate.updateMany).toHaveBeenNthCalledWith(2, {
        data: { currentBrandId: brandB },
        where: {
          isDeleted: false,
          organizationId,
          userId: memberTwoUserId,
        },
      });
      // Each call is scoped to its own userId — neither write can touch the
      // other member's row, so selecting brandB never clobbers memberOne.
      expect(memberDelegate.updateMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('remove with shared characters (#6040)', () => {
    const brandId = testId('brand', 1);
    const otherBrandId = testId('brand', 2);
    const organizationId = testId('org');

    beforeEach(() => {
      delegate.findFirst.mockResolvedValue({
        id: brandId,
        isDeleted: false,
        organizationId,
      });
      delegate.findMany.mockResolvedValue([
        { id: brandId },
        { id: otherBrandId },
      ]);
      memberDelegate.findMany.mockResolvedValue([]);
      delegate.update.mockResolvedValue({ id: brandId, organizationId });
    });

    const sharedCharacter = (overrides: Record<string, unknown>) => ({
      availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
      availableBrandIds: [brandId, otherBrandId],
      handle: 'anna',
      id: 'persona-1',
      label: 'Anna',
      ...overrides,
    });

    it('refuses to delete a brand that owns a character other brands can use and names it', async () => {
      personaDelegate.findMany.mockResolvedValue([sharedCharacter({})]);

      const error = await service.remove(brandId).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'brand_owns_shared_characters',
        source: {
          characters: [{ handle: 'anna', id: 'persona-1', label: 'Anna' }],
        },
      });
      expect(personaDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            availabilityMode: { not: PersonaAvailabilityMode.OWNING_BRAND },
            brandId,
            isDeleted: false,
            organizationId,
          },
        }),
      );
      expect(delegate.update).not.toHaveBeenCalled();
      expect(memberDelegate.updateMany).not.toHaveBeenCalled();
    });

    it('refuses for a character available to all brands', async () => {
      personaDelegate.findMany.mockResolvedValue([
        sharedCharacter({
          availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
          availableBrandIds: [],
        }),
      ]);

      await expect(service.remove(brandId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('deletes once the character is only available to deleted or the owning brand', async () => {
      personaDelegate.findMany.mockResolvedValue([
        sharedCharacter({ availableBrandIds: [brandId, 'deleted-brand'] }),
      ]);

      await expect(service.remove(brandId)).resolves.toMatchObject({
        id: brandId,
      });
      expect(delegate.update).toHaveBeenCalled();
    });

    it('refuses while a character it owns has an active grant to another organization (#6037)', async () => {
      personaDelegate.findMany.mockResolvedValue([]);
      personaGrantDelegate.findMany.mockResolvedValue([
        { persona: { handle: 'anna', id: 'persona-2', label: 'Anna' } },
      ]);

      const error = await service.remove(brandId).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'brand_owns_shared_characters',
        source: {
          characters: [{ handle: 'anna', id: 'persona-2', label: 'Anna' }],
        },
      });
      expect(personaGrantDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            persona: { brandId, isDeleted: false },
            revokedAt: null,
          },
        }),
      );
      expect(delegate.update).not.toHaveBeenCalled();
    });

    it('takes the organization persona-handle advisory lock before checking shared characters and grants', async () => {
      await service.remove(brandId);

      const lockCall = txQueryRaw.mock.calls.findIndex(
        (call) =>
          (call[0] as string[]).join(' ').includes('hashtextextended') &&
          call[1] === `persona-handle:${organizationId}`,
      );
      expect(lockCall).toBeGreaterThanOrEqual(0);
      const lockOrder = txQueryRaw.mock.invocationCallOrder[lockCall];
      expect(lockOrder).toBeLessThan(
        personaDelegate.findMany.mock.invocationCallOrder[0],
      );
      expect(lockOrder).toBeLessThan(
        personaGrantDelegate.findMany.mock.invocationCallOrder[0],
      );
    });

    it('sees a grant committed by a concurrent sharing transaction once the lock is acquired', async () => {
      // Sharing holds the org lock; the grant becomes visible only when this
      // transaction acquires it, so the re-check under the lock must refuse.
      let sharingCommitted = false;
      txQueryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
        if (strings.join(' ').includes('hashtextextended')) {
          sharingCommitted = true;
        }
        return [{ id: 'locked' }];
      });
      personaGrantDelegate.findMany.mockImplementation(async () =>
        sharingCommitted
          ? [{ persona: { handle: 'anna', id: 'persona-1', label: 'Anna' } }]
          : [],
      );

      await expect(service.remove(brandId)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(delegate.update).not.toHaveBeenCalled();
    });

    it('deletes a brand that owns no shared characters', async () => {
      personaDelegate.findMany.mockResolvedValue([]);

      await expect(service.remove(brandId)).resolves.toMatchObject({
        id: brandId,
      });
    });
  });

  describe('remove', () => {
    it("reassigns affected members to the org's oldest remaining brand before soft-deleting, locking every live brand row and busting each moved member's caches", async () => {
      const brandId = testId('brand', 1);
      const fallbackBrandId = testId('brand', 2);
      const organizationId = testId('org');
      const movedUserOne = 'user_one';
      const movedUserTwo = 'user_two';

      delegate.findFirst.mockResolvedValue({
        id: brandId,
        isDeleted: false,
        organizationId,
      });
      delegate.findMany.mockResolvedValue([
        { id: brandId },
        { id: fallbackBrandId },
      ]);
      memberDelegate.findMany.mockResolvedValueOnce([
        { userId: movedUserOne },
        { userId: movedUserTwo },
      ]);
      memberDelegate.updateMany.mockResolvedValue({ count: 2 });
      delegate.update.mockResolvedValue({ id: brandId, organizationId });

      const result = await service.remove(brandId);

      // Every transactional step runs before anything else, all inside the
      // one $transaction call this test's fake client hands the same tx —
      // including the FOR UPDATE lock query on the org's live brand rows.
      expect(txQueryRaw).toHaveBeenCalledTimes(5);
      expect(txQueryRaw.mock.calls[0][0].join(' ')).toContain(
        'pg_advisory_xact_lock',
      );
      expect(txQueryRaw.mock.calls[1][0].sql).toContain('organizations');
      expect(txQueryRaw.mock.calls[2][0].sql).toContain('brands');
      expect(delegate.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
        where: { isDeleted: false, organizationId },
      });
      expect(memberDelegate.findMany).toHaveBeenCalledWith({
        select: { userId: true },
        where: { currentBrandId: brandId, isDeleted: false, organizationId },
      });
      expect(memberDelegate.updateMany).toHaveBeenCalledWith({
        data: { currentBrandId: fallbackBrandId },
        where: { currentBrandId: brandId, isDeleted: false, organizationId },
      });
      expect(delegate.update).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: { id: brandId, isDeleted: false, organizationId },
      });
      expect(result).toMatchObject({ id: brandId });

      // #5295: every member the delete moved off this brand must have its
      // Better Auth identity / request-context caches busted, not just the
      // acting request's own user.
      expect(userAccessCacheService.invalidateAll).toHaveBeenCalledWith(
        movedUserOne,
      );
      expect(userAccessCacheService.invalidateAll).toHaveBeenCalledWith(
        movedUserTwo,
      );
      expect(userAccessCacheService.invalidateAll).toHaveBeenCalledTimes(2);
    });

    it("refuses to delete an organization's last brand without moving members or writing anything", async () => {
      const brandId = testId('brand');
      const organizationId = testId('org');

      delegate.findFirst.mockResolvedValue({
        id: brandId,
        isDeleted: false,
        organizationId,
      });
      delegate.findMany.mockResolvedValue([{ id: brandId }]);

      const rejection = service.remove(brandId);
      await expect(rejection).rejects.toBeInstanceOf(ConflictException);
      await expect(rejection).rejects.toThrow(
        "Cannot delete an organization's last brand. Create another brand first.",
      );
      expect(memberDelegate.findMany).not.toHaveBeenCalled();
      expect(memberDelegate.updateMany).not.toHaveBeenCalled();
      expect(delegate.update).not.toHaveBeenCalled();
      expect(userAccessCacheService.invalidateAll).not.toHaveBeenCalled();
    });

    it('treats a brand already soft-deleted by a concurrent transaction as not found once the lock clears', async () => {
      const brandId = testId('brand', 1);
      const otherLiveBrandId = testId('brand', 2);
      const organizationId = testId('org');

      delegate.findFirst.mockResolvedValue({
        id: brandId,
        isDeleted: false,
        organizationId,
      });
      delegate.findFirst
        .mockResolvedValueOnce({
          id: brandId,
          isDeleted: false,
          organizationId,
        })
        .mockResolvedValue(null);
      // A concurrent transaction committed the delete of `brandId` while this
      // one was blocked on the FOR UPDATE lock — the post-lock re-read no
      // longer includes it among the org's live brands.
      delegate.findMany.mockResolvedValue([{ id: otherLiveBrandId }]);

      await expect(service.remove(brandId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(memberDelegate.updateMany).not.toHaveBeenCalled();
      expect(delegate.update).not.toHaveBeenCalled();
    });

    it('skips per-member cache invalidation when no member was pointed at the deleted brand', async () => {
      const brandId = testId('brand', 1);
      const fallbackBrandId = testId('brand', 2);
      const organizationId = testId('org');

      delegate.findFirst.mockResolvedValue({
        id: brandId,
        isDeleted: false,
        organizationId,
      });
      delegate.findMany.mockResolvedValue([
        { id: brandId },
        { id: fallbackBrandId },
      ]);
      memberDelegate.findMany.mockResolvedValueOnce([]);
      delegate.update.mockResolvedValue({ id: brandId, organizationId });

      await service.remove(brandId);

      expect(memberDelegate.updateMany).not.toHaveBeenCalled();
      expect(userAccessCacheService.invalidateAll).not.toHaveBeenCalled();
    });

    it('throws NotFound when the brand does not exist at all', async () => {
      delegate.findFirst.mockResolvedValue(null);

      await expect(service.remove('brand_missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(memberDelegate.updateMany).not.toHaveBeenCalled();
      expect(delegate.update).not.toHaveBeenCalled();
    });
    it.each(['dependency', 'revision'])(
      'a %s failure rolls back member reassignment and brand deletion before caches',
      async (failure) => {
        const brand = {
          id: 'brand',
          organizationId: 'org',
          isDeleted: false,
          isActive: true,
        };
        const member = { userId: 'member', currentBrandId: 'brand' };
        delegate.findFirst.mockImplementation(async () => ({ ...brand }));
        delegate.findMany.mockResolvedValue([
          { id: 'brand' },
          { id: 'fallback' },
        ]);
        delegate.update.mockImplementation(async ({ data }) => {
          Object.assign(brand, data);
          return { ...brand };
        });
        memberDelegate.findMany.mockResolvedValue([{ userId: member.userId }]);
        memberDelegate.updateMany.mockImplementation(async ({ data }) => {
          Object.assign(member, data);
          return { count: 1 };
        });
        learningAccounts.findMany.mockResolvedValue([
          {
            id: 'account',
            organizationId: 'org',
            brandId: 'brand',
            credentialId: 'credential',
          },
        ]);
        if (failure === 'dependency')
          dependencies.findMany.mockRejectedValue(
            new Error('dependency failed'),
          );
        else learningAccounts.updateMany.mockResolvedValue({ count: 0 });
        const callback = transactionMock.getMockImplementation();
        if (!callback) throw new Error('Missing transaction fixture');
        transactionMock.mockImplementation(async (...args) => {
          const beforeBrand = { ...brand },
            beforeMember = { ...member };
          try {
            return await Reflect.apply(callback, undefined, args);
          } catch (error) {
            Object.assign(brand, beforeBrand);
            Object.assign(member, beforeMember);
            throw error;
          }
        });
        await expect(service.remove('brand')).rejects.toThrow(
          failure === 'dependency'
            ? 'dependency failed'
            : /account scope changed/,
        );
        expect(memberDelegate.updateMany).toHaveBeenCalledTimes(1);
        expect(delegate.update).toHaveBeenCalledTimes(1);
        expect(brand.isDeleted).toBe(false);
        expect(member.currentBrandId).toBe('brand');
        expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
        expect(
          accessBootstrapCacheService.invalidateForOrganization,
        ).not.toHaveBeenCalled();
        expect(userAccessCacheService.invalidateAll).not.toHaveBeenCalled();
      },
    );
  });
});
