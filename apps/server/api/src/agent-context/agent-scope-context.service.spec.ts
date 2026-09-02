import type { ServerLogger, ServerPrisma } from '@api/server.dependencies';
import type { ValidatedAgentScope } from '@genfeedai/interfaces';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { AgentScopeContextService } from './agent-scope-context.service';

type ThreadRow = {
  brandId: string | null;
  contextVersion: number;
  id: string;
  isDeleted: boolean;
  isLegacyBrandFallbackEligible: boolean;
  legacyBrandFallbackCount: number;
  legacyBrandFallbackLastBrandId: string | null;
  legacyBrandFallbackLastSource: string | null;
  organizationId: string;
  scopeChangeProvenance: unknown;
  userId: string;
};

function makeThread(overrides: Partial<ThreadRow> = {}): ThreadRow {
  return {
    brandId: null,
    contextVersion: 3,
    id: 'thread-1',
    isDeleted: false,
    isLegacyBrandFallbackEligible: false,
    legacyBrandFallbackCount: 0,
    legacyBrandFallbackLastBrandId: null,
    legacyBrandFallbackLastSource: null,
    organizationId: 'org-1',
    scopeChangeProvenance: [],
    userId: 'user-1',
    ...overrides,
  };
}

function makeScope(
  overrides: Partial<ValidatedAgentScope> = {},
): ValidatedAgentScope {
  return {
    brandId: 'brand-1',
    contextVersion: 3,
    isLegacyFallback: false,
    isVersionExplicit: true,
    organizationId: 'org-1',
    source: 'explicit',
    threadId: 'thread-1',
    userId: 'user-1',
    ...overrides,
  } as ValidatedAgentScope;
}

describe('AgentScopeContextService', () => {
  const threadFindFirst = vi.fn();
  const threadUpdateMany = vi.fn();
  const messageFindFirst = vi.fn();
  const brandFindFirst = vi.fn();

  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;

  const prisma = {
    agentMessage: { findFirst: messageFindFirst },
    agentThread: { findFirst: threadFindFirst, updateMany: threadUpdateMany },
    brand: { findFirst: brandFindFirst },
  } as unknown as Pick<ServerPrisma, 'agentMessage' | 'agentThread' | 'brand'>;

  let service: AgentScopeContextService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentScopeContextService(prisma, logger);
    threadFindFirst.mockResolvedValue(null);
    threadUpdateMany.mockResolvedValue({ count: 1 });
    messageFindFirst.mockResolvedValue(null);
    brandFindFirst.mockResolvedValue({ id: 'brand-1' });
  });

  describe('assertBrandAuthorized', () => {
    it('scopes the brand lookup to the organization and soft-delete flag', async () => {
      await service.assertBrandAuthorized('brand-1', 'org-1');

      expect(brandFindFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
      });
    });

    it('rejects a brand that is not in the organization', async () => {
      brandFindFirst.mockResolvedValueOnce(null);

      await expect(
        service.assertBrandAuthorized('brand-x', 'org-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('prepareForTurn (new thread)', () => {
    it('seeds a version-1 scope with no brand', async () => {
      const result = await service.prepareForTurn({
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(result.initialBrandId).toBeUndefined();
      expect(result.initialScopeFields).toEqual({
        contextVersion: 1,
        isLegacyBrandFallbackEligible: false,
        scopeChangeProvenance: [],
      });
    });

    it('seeds a provenance entry when a brand is requested', async () => {
      const result = await service.prepareForTurn({
        organizationId: 'org-1',
        requestedBrandId: 'brand-1',
        userId: 'user-1',
      });

      expect(result.initialBrandId).toBe('brand-1');
      expect(result.initialScopeFields.brandId).toBe('brand-1');
      expect(result.initialScopeFields.contextVersion).toBe(1);
      const provenance = result.initialScopeFields
        .scopeChangeProvenance as Array<Record<string, unknown>>;
      expect(provenance).toHaveLength(1);
      expect(provenance[0]).toMatchObject({
        actorUserId: 'user-1',
        brandId: 'brand-1',
        fromContextVersion: 0,
        previousBrandId: null,
        source: 'thread_created',
        toContextVersion: 1,
      });
    });

    it('treats a whitespace-only brand id as absent', async () => {
      const result = await service.prepareForTurn({
        organizationId: 'org-1',
        requestedBrandId: '   ',
        userId: 'user-1',
      });

      expect(result.initialBrandId).toBeUndefined();
      expect(brandFindFirst).not.toHaveBeenCalled();
    });

    it('falls back to the policy brand when none is requested', async () => {
      const result = await service.prepareForTurn({
        organizationId: 'org-1',
        policyBrandId: 'brand-policy',
        userId: 'user-1',
      });

      expect(result.initialBrandId).toBe('brand-policy');
    });

    it('rejects a requested brand that conflicts with the execution policy', async () => {
      await expect(
        service.prepareForTurn({
          organizationId: 'org-1',
          policyBrandId: 'brand-policy',
          requestedBrandId: 'brand-other',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a requested brand outside the organization', async () => {
      brandFindFirst.mockResolvedValueOnce(null);

      await expect(
        service.prepareForTurn({
          organizationId: 'org-1',
          requestedBrandId: 'brand-x',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('prepareForTurn (existing thread)', () => {
    it('throws a 404 when the thread id does not resolve', async () => {
      await expect(
        service.prepareForTurn({
          organizationId: 'org-1',
          threadId: 'missing',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('scopes the thread lookup by org, thread and user', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ brandId: 'brand-1' }));

      await service.prepareForTurn({
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(threadFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'thread-1',
            isDeleted: false,
            organizationId: 'org-1',
            userId: 'user-1',
          },
        }),
      );
    });

    it('returns the explicit thread scope', async () => {
      threadFindFirst.mockResolvedValue(
        makeThread({
          brandId: 'brand-1',
          scopeChangeProvenance: [{ id: 'prov-1' }, { id: 'prov-2' }],
        }),
      );

      const result = await service.prepareForTurn({
        expectedContextVersion: 3,
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(result.existingScope).toEqual({
        brandId: 'brand-1',
        contextVersion: 3,
        isLegacyFallback: false,
        isVersionExplicit: true,
        organizationId: 'org-1',
        provenanceId: 'prov-2',
        source: 'explicit',
        threadId: 'thread-1',
        userId: 'user-1',
      });
      expect(result.initialScopeFields).toEqual({});
    });

    it('marks the scope as version-implicit when no expected version is given', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ brandId: 'brand-1' }));

      const result = await service.prepareForTurn({
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(result.existingScope?.isVersionExplicit).toBe(false);
    });

    it('conflicts when the expected context version is stale', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ contextVersion: 5 }));

      await expect(
        service.prepareForTurn({
          expectedContextVersion: 3,
          organizationId: 'org-1',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(logger.log).toHaveBeenCalledWith(
        'conversation_shell_stale_context_blocked',
        expect.objectContaining({ outcome: 'blocked' }),
      );
    });

    it('conflicts when the requested brand disagrees with the thread brand', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ brandId: 'brand-1' }));

      await expect(
        service.prepareForTurn({
          organizationId: 'org-1',
          requestedBrandId: 'brand-2',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('accepts an explicitly null requested brand on an unbranded thread', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ brandId: null }));

      const result = await service.prepareForTurn({
        organizationId: 'org-1',
        requestedBrandId: null,
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(result.existingScope?.brandId).toBeUndefined();
    });

    it('rejects a thread brand outside the execution policy', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ brandId: 'brand-1' }));

      await expect(
        service.prepareForTurn({
          organizationId: 'org-1',
          policyBrandId: 'brand-policy',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns an unbranded explicit scope for an ineligible legacy thread', async () => {
      threadFindFirst.mockResolvedValue(
        makeThread({ brandId: null, isLegacyBrandFallbackEligible: false }),
      );

      const result = await service.prepareForTurn({
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(result.existingScope?.brandId).toBeUndefined();
      expect(result.existingScope?.isLegacyFallback).toBe(false);
      expect(logger.log).toHaveBeenCalledWith(
        'agent_context_compatibility_read',
        expect.objectContaining({
          resolution: 'current',
          source: 'explicit_thread_scope',
        }),
      );
    });
  });

  describe('prepareForTurn (legacy brand fallback)', () => {
    const legacyThread = makeThread({
      brandId: null,
      isLegacyBrandFallbackEligible: true,
    });

    it('resolves the fallback brand from the execution policy', async () => {
      threadFindFirst.mockResolvedValue(legacyThread);

      const result = await service.prepareForTurn({
        organizationId: 'org-1',
        policyBrandId: 'brand-policy',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(result.existingScope).toMatchObject({
        brandId: 'brand-policy',
        isLegacyFallback: true,
        source: 'legacy_execution_policy',
      });
    });

    it('resolves the fallback brand from the latest branded message', async () => {
      threadFindFirst.mockResolvedValue(legacyThread);
      messageFindFirst.mockResolvedValue({ brandId: 'brand-msg' });

      const result = await service.prepareForTurn({
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(messageFindFirst).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        select: { brandId: true },
        where: {
          brandId: { not: null },
          isDeleted: false,
          organizationId: 'org-1',
          threadId: 'thread-1',
        },
      });
      expect(result.existingScope).toMatchObject({
        brandId: 'brand-msg',
        source: 'legacy_message_history',
      });
    });

    it('falls back to organization-only when no brand can be inferred', async () => {
      threadFindFirst.mockResolvedValue(legacyThread);

      const result = await service.prepareForTurn({
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(result.existingScope).toMatchObject({
        brandId: undefined,
        isLegacyFallback: true,
        source: 'legacy_organization_only',
      });
    });

    it('increments the fallback counter under a guarded conditional update', async () => {
      threadFindFirst.mockResolvedValue(legacyThread);

      await service.prepareForTurn({
        organizationId: 'org-1',
        policyBrandId: 'brand-policy',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(threadUpdateMany).toHaveBeenCalledWith({
        data: {
          legacyBrandFallbackCount: { increment: 1 },
          legacyBrandFallbackLastBrandId: 'brand-policy',
          legacyBrandFallbackLastSource: 'legacy_execution_policy',
          legacyBrandFallbackLastUsedAt: expect.any(Date),
        },
        where: {
          brandId: null,
          contextVersion: 3,
          id: 'thread-1',
          isDeleted: false,
          isLegacyBrandFallbackEligible: true,
          legacyBrandFallbackCount: { lt: 20 },
          organizationId: 'org-1',
          userId: 'user-1',
        },
      });
    });

    it('refuses once the compatibility budget is exhausted', async () => {
      threadFindFirst.mockResolvedValue(
        makeThread({
          brandId: null,
          isLegacyBrandFallbackEligible: true,
          legacyBrandFallbackCount: 20,
        }),
      );

      await expect(
        service.prepareForTurn({
          organizationId: 'org-1',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      ).rejects.toMatchObject({
        response: { code: 'legacy_agent_context_upgrade_required' },
      });
    });

    it('refuses when the guarded counter update loses a race', async () => {
      threadFindFirst.mockResolvedValue(legacyThread);
      threadUpdateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.prepareForTurn({
          organizationId: 'org-1',
          policyBrandId: 'brand-policy',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      ).rejects.toMatchObject({
        response: { code: 'legacy_agent_context_upgrade_required' },
      });
    });
  });

  describe('resolveCreatedThreadScope', () => {
    it('throws a 404 when the created thread cannot be read back', async () => {
      await expect(
        service.resolveCreatedThreadScope({
          organizationId: 'org-1',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('returns a thread_created scope that is always version-explicit', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ brandId: 'brand-1' }));

      const scope = await service.resolveCreatedThreadScope({
        brandId: 'brand-1',
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(scope).toMatchObject({
        brandId: 'brand-1',
        isVersionExplicit: true,
        source: 'thread_created',
      });
    });

    it('conflicts when the persisted brand differs from the requested one', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ brandId: 'brand-other' }));

      await expect(
        service.resolveCreatedThreadScope({
          brandId: 'brand-1',
          organizationId: 'org-1',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('mutateBrandScope', () => {
    it('throws a 404 for an unknown thread', async () => {
      await expect(
        service.mutateBrandScope({
          brandId: 'brand-1',
          expectedContextVersion: 3,
          organizationId: 'org-1',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('conflicts on a stale expected version without writing', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ contextVersion: 9 }));

      await expect(
        service.mutateBrandScope({
          brandId: 'brand-1',
          expectedContextVersion: 3,
          organizationId: 'org-1',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(threadUpdateMany).not.toHaveBeenCalled();
    });

    it('rejects a brand outside the organization', async () => {
      threadFindFirst.mockResolvedValue(makeThread());
      brandFindFirst.mockResolvedValueOnce(null);

      await expect(
        service.mutateBrandScope({
          brandId: 'brand-x',
          expectedContextVersion: 3,
          organizationId: 'org-1',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('short-circuits when the brand is already correct', async () => {
      const unchanged = makeThread({ brandId: 'brand-1' });
      threadFindFirst.mockResolvedValue(unchanged);

      const result = await service.mutateBrandScope({
        brandId: 'brand-1',
        expectedContextVersion: 3,
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(threadUpdateMany).not.toHaveBeenCalled();
      expect(result).toBe(unchanged);
    });

    it('throws a 404 when the unchanged read-back disappears', async () => {
      threadFindFirst
        .mockResolvedValueOnce(makeThread({ brandId: 'brand-1' }))
        .mockResolvedValueOnce(null);

      await expect(
        service.mutateBrandScope({
          brandId: 'brand-1',
          expectedContextVersion: 3,
          organizationId: 'org-1',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('still rewrites a legacy-eligible thread whose brand already matches', async () => {
      threadFindFirst.mockResolvedValue(
        makeThread({ brandId: 'brand-1', isLegacyBrandFallbackEligible: true }),
      );

      await service.mutateBrandScope({
        brandId: 'brand-1',
        expectedContextVersion: 3,
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(threadUpdateMany).toHaveBeenCalled();
    });

    it('bumps the version, clears legacy eligibility and appends provenance', async () => {
      threadFindFirst.mockResolvedValue(
        makeThread({
          brandId: 'brand-old',
          scopeChangeProvenance: [{ id: 'prov-0' }],
        }),
      );

      await service.mutateBrandScope({
        brandId: 'brand-1',
        expectedContextVersion: 3,
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      const call = threadUpdateMany.mock.calls[0][0];
      expect(call.data.brandId).toBe('brand-1');
      expect(call.data.contextVersion).toEqual({ increment: 1 });
      expect(call.data.isLegacyBrandFallbackEligible).toBe(false);
      expect(call.data.scopeChangeProvenance).toEqual([
        { id: 'prov-0' },
        expect.objectContaining({
          brandId: 'brand-1',
          fromContextVersion: 3,
          previousBrandId: 'brand-old',
          source: 'thread_context_api',
          toContextVersion: 4,
        }),
      ]);
      expect(call.where).toEqual({
        contextVersion: 3,
        id: 'thread-1',
        isDeleted: false,
        organizationId: 'org-1',
        userId: 'user-1',
      });
    });

    it('clears the brand when null is supplied', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ brandId: 'brand-old' }));

      await service.mutateBrandScope({
        brandId: null,
        expectedContextVersion: 3,
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(threadUpdateMany.mock.calls[0][0].data.brandId).toBeNull();
      expect(brandFindFirst).not.toHaveBeenCalled();
    });

    it('caps the provenance trail at 50 entries', async () => {
      threadFindFirst.mockResolvedValue(
        makeThread({
          brandId: 'brand-old',
          scopeChangeProvenance: Array.from({ length: 60 }, (_, i) => ({
            id: `prov-${i}`,
          })),
        }),
      );

      await service.mutateBrandScope({
        brandId: 'brand-1',
        expectedContextVersion: 3,
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(
        threadUpdateMany.mock.calls[0][0].data.scopeChangeProvenance,
      ).toHaveLength(50);
    });

    it('ignores malformed provenance entries', async () => {
      threadFindFirst.mockResolvedValue(
        makeThread({
          brandId: 'brand-old',
          scopeChangeProvenance: 'not-an-array',
        }),
      );

      await service.mutateBrandScope({
        brandId: 'brand-1',
        expectedContextVersion: 3,
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(
        threadUpdateMany.mock.calls[0][0].data.scopeChangeProvenance,
      ).toHaveLength(1);
    });

    it('conflicts when the optimistic update matches no rows', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ brandId: 'brand-old' }));
      threadUpdateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.mutateBrandScope({
          brandId: 'brand-1',
          expectedContextVersion: 3,
          organizationId: 'org-1',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws a 404 when the losing update finds the thread gone', async () => {
      threadFindFirst
        .mockResolvedValueOnce(makeThread({ brandId: 'brand-old' }))
        .mockResolvedValueOnce(null);
      threadUpdateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.mutateBrandScope({
          brandId: 'brand-1',
          expectedContextVersion: 3,
          organizationId: 'org-1',
          threadId: 'thread-1',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('logs a successful scope correction', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ brandId: 'brand-old' }));

      await service.mutateBrandScope({
        brandId: 'brand-1',
        expectedContextVersion: 3,
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      });

      expect(logger.log).toHaveBeenCalledWith(
        'conversation_shell_scope_correction',
        expect.objectContaining({
          organizationId: 'org-1',
          outcome: 'success',
          source: 'thread_context_api',
        }),
      );
    });
  });

  describe('assertResourceBrand', () => {
    it('rejects when the validated scope carries no brand', () => {
      expect(() =>
        service.assertResourceBrand(
          makeScope({ brandId: undefined }),
          'brand-1',
          'a post',
        ),
      ).toThrow(BadRequestException);
      expect(logger.log).toHaveBeenCalledWith(
        'conversation_shell_scope_violation_blocked',
        expect.objectContaining({ reason: 'missing_brand' }),
      );
    });

    it('rejects a resource belonging to another brand', () => {
      expect(() =>
        service.assertResourceBrand(makeScope(), 'brand-other', 'a post'),
      ).toThrow(ForbiddenException);
      expect(logger.log).toHaveBeenCalledWith(
        'conversation_shell_scope_violation_blocked',
        expect.objectContaining({ reason: 'brand_mismatch' }),
      );
    });

    it('rejects a resource with no brand at all', () => {
      expect(() =>
        service.assertResourceBrand(makeScope(), null, 'a post'),
      ).toThrow(ForbiddenException);
    });

    it('accepts a resource inside the validated brand scope', () => {
      expect(() =>
        service.assertResourceBrand(makeScope(), 'brand-1', 'a post'),
      ).not.toThrow();
    });
  });

  describe('assertConsequentialBoundary', () => {
    it('requires an explicit context version', async () => {
      await expect(
        service.assertConsequentialBoundary(
          makeScope({ isVersionExplicit: false }),
          'publish',
        ),
      ).rejects.toMatchObject({
        response: { code: 'agent_context_version_required' },
      });

      expect(logger.log).toHaveBeenCalledWith(
        'conversation_shell_consequential_attempt',
        expect.objectContaining({
          boundary: 'publish',
          contextStatus: 'missing_version',
          outcome: 'blocked',
        }),
      );
    });

    it('exempts a thread_created scope from the explicit-version rule', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ brandId: 'brand-1' }));

      await expect(
        service.assertConsequentialBoundary(
          makeScope({ isVersionExplicit: false, source: 'thread_created' }),
          'tool',
        ),
      ).resolves.toBeUndefined();
    });

    it('exempts a legacy fallback scope from the explicit-version rule', async () => {
      threadFindFirst.mockResolvedValue(
        makeThread({
          brandId: null,
          legacyBrandFallbackLastBrandId: 'brand-1',
          legacyBrandFallbackLastSource: 'legacy_execution_policy',
        }),
      );

      await expect(
        service.assertConsequentialBoundary(
          makeScope({
            isLegacyFallback: true,
            isVersionExplicit: false,
            source: 'legacy_execution_policy',
          }),
          'workflow',
        ),
      ).resolves.toBeUndefined();
    });

    it('allows a boundary whose scope still matches the thread', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ brandId: 'brand-1' }));

      await service.assertConsequentialBoundary(makeScope(), 'publish');

      expect(logger.log).toHaveBeenCalledWith(
        'conversation_shell_consequential_attempt',
        expect.objectContaining({
          contextStatus: 'current',
          outcome: 'allowed',
        }),
      );
    });

    it('blocks when the thread is no longer readable', async () => {
      await expect(
        service.assertConsequentialBoundary(makeScope(), 'publish'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(logger.log).toHaveBeenCalledWith(
        'conversation_shell_consequential_attempt',
        expect.objectContaining({ contextStatus: 'unauthorized_scope' }),
      );
    });

    it('blocks a stale context version', async () => {
      threadFindFirst.mockResolvedValue(
        makeThread({ brandId: 'brand-1', contextVersion: 9 }),
      );

      await expect(
        service.assertConsequentialBoundary(makeScope(), 'tool'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(logger.log).toHaveBeenCalledWith(
        'conversation_shell_consequential_attempt',
        expect.objectContaining({ contextStatus: 'stale' }),
      );
    });

    it('blocks when the thread brand drifted from the scope', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ brandId: 'brand-other' }));

      await expect(
        service.assertConsequentialBoundary(makeScope(), 'tool'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('blocks a legacy fallback whose recorded brand drifted', async () => {
      threadFindFirst.mockResolvedValue(
        makeThread({
          brandId: null,
          legacyBrandFallbackLastBrandId: 'brand-other',
          legacyBrandFallbackLastSource: 'legacy_execution_policy',
        }),
      );

      await expect(
        service.assertConsequentialBoundary(
          makeScope({
            isLegacyFallback: true,
            source: 'legacy_execution_policy',
          }),
          'workflow',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('blocks when the scoped brand is no longer authorized', async () => {
      threadFindFirst.mockResolvedValue(makeThread({ brandId: 'brand-1' }));
      brandFindFirst.mockResolvedValueOnce(null);

      await expect(
        service.assertConsequentialBoundary(makeScope(), 'publish'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('classifies an unexpected failure as blocked_unknown', async () => {
      threadFindFirst.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.assertConsequentialBoundary(makeScope(), 'publish'),
      ).rejects.toThrow('db down');

      expect(logger.log).toHaveBeenCalledWith(
        'conversation_shell_consequential_attempt',
        expect.objectContaining({ contextStatus: 'blocked_unknown' }),
      );
    });
  });

  it('operates without a logger', async () => {
    const bare = new AgentScopeContextService(prisma);
    threadFindFirst.mockResolvedValue(makeThread({ contextVersion: 9 }));

    await expect(
      bare.prepareForTurn({
        expectedContextVersion: 3,
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
