import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { projectApprovedBrandIdentitySnapshot } from '@api/services/branded-generation-receipts/brand-identity-snapshot-projection.util';
import {
  hashBrandGenerationRulesReviewV1,
  hashBrandIdentitySnapshotV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import type { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { BrandGenerationRulesV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import {
  type BrandOsRevision,
  BrandOsRevisionStatus,
  toPrismaJson,
} from '@genfeedai/prisma';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const actor = { actorId: 'actor', organizationId: 'org', brandId: 'brand' };
const time = '2026-10-02T00:00:00.000Z';
function revision(id = 'A'): BrandOsRevision {
  const generationRules: BrandGenerationRulesV1 = {
    schemaVersion: 1,
    evidence: [],
    facts: [],
    palette: [],
    typography: [],
    mandatory: [],
    avoid: [],
    examples: [],
    assets: [],
  };
  return {
    id,
    organizationId: 'org',
    brandId: 'brand',
    version: id === 'A' ? 1 : 2,
    status: BrandOsRevisionStatus.APPROVED,
    content: toPrismaJson({
      brandId: 'brand',
      organizationId: 'org',
      fields: { label: { currentValue: id, proposedValue: 'Wrong' } },
      generationRules,
    }),
    generationRulesReviewHash:
      hashBrandGenerationRulesReviewV1(generationRules),
    approvedById: 'approver',
    approvedAt: new Date(time),
    sourcePreviewTokenHash: null,
    exportSchemaVersion: '1',
    createdAt: new Date(time),
    updatedAt: new Date(time),
    isDeleted: false,
  };
}
function setup() {
  const trace: string[] = [];
  const tx = {
    organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org' }) },
    brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) },
    member: {
      findFirst: vi.fn().mockResolvedValue({
        role: { key: 'user' },
        brands: [{ id: 'brand' }],
      }),
    },
    $queryRaw: vi.fn().mockImplementation(async () => {
      trace.push('lock');
      return [{ id: 'brand' }];
    }),
    brandOsRevision: {
      findMany: vi.fn().mockImplementation(async () => {
        trace.push('revision');
        return [revision()];
      }),
    },
    asset: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const prisma = {
    $transaction: vi
      .fn()
      .mockImplementation(
        async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
      ),
  };
  const access = new BrandedGenerationReceiptAccessService();
  const authorize = vi.spyOn(access, 'assertBrand');
  const receipts = {
    get: vi.fn(),
    readPrompt: vi.fn(),
    create: vi.fn(),
    recordResolution: vi.fn(),
    resolveForGeneration: vi.fn(),
  };
  const service = new BrandIdentitySnapshotService(
    prisma as unknown as PrismaService,
    access,
    receipts as unknown as BrandedGenerationReceiptsService,
  );
  const noSideEffects = () => {
    expect(receipts.readPrompt).not.toHaveBeenCalled();
    expect(receipts.create).not.toHaveBeenCalled();
    expect(receipts.recordResolution).not.toHaveBeenCalled();
    expect(receipts.resolveForGeneration).not.toHaveBeenCalled();
  };
  return { service, tx, prisma, receipts, authorize, trace, noSideEffects };
}
describe('authenticated immutable identity preview', () => {
  it('queries all fresh asset IDs only in the active tenant/brand scope and reports unavailable bytes without writing', async () => {
    const s = setup();
    const row = revision();
    const content = {
      brandId: 'brand',
      organizationId: 'org',
      fields: { label: { currentValue: 'A' } },
      generationRules: {
        schemaVersion: 1 as const,
        evidence: [{ id: 'e', sourceType: 'manual' as const, label: 'Saved' }],
        facts: [],
        palette: [],
        typography: [],
        mandatory: [],
        avoid: [],
        examples: [],
        assets: [
          {
            id: 'ref',
            assetId: 'asset',
            role: 'logo' as const,
            required: true,
            evidenceIds: ['e'],
            contentHash: `sha256:${'a'.repeat(64)}`,
            mimeType: 'image/png',
          },
        ],
      },
    };
    row.content = toPrismaJson(content);
    row.generationRulesReviewHash = hashBrandGenerationRulesReviewV1(
      content.generationRules,
    );
    s.tx.brandOsRevision.findMany.mockResolvedValue([row]);
    await expect(s.service.preview(actor)).rejects.toThrow(
      'brand_identity_asset_unavailable',
    );
    expect(s.tx.asset.findMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: { in: ['asset'] },
        parentType: 'BRAND',
        parentOrgId: 'org',
        parentBrandId: 'brand',
        isDeleted: false,
      },
      take: 64,
    });
    s.noSideEffects();
  });
  it('reads exactly one reviewed saved approval after a scoped shared brand lock in a bounded transaction with no mutations', async () => {
    const s = setup();
    const result = await s.service.preview(actor);
    expect(result.identity.name).toBe('A');
    expect(result.contentHash).toBe(hashBrandIdentitySnapshotV1(result));
    expect(s.trace).toEqual(['lock', 'revision']);
    expect(s.authorize).toHaveBeenCalledTimes(2);
    expect(s.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    });
    expect(s.tx.$queryRaw.mock.calls[0][0].text).toContain('FOR SHARE');
    expect(s.tx.$queryRaw.mock.calls[0][0].values).toEqual(['brand', 'org']);
    expect(s.tx.brandOsRevision.findMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        organizationId: 'org',
        brandId: 'brand',
        isDeleted: false,
        status: 'APPROVED',
      },
      take: 2,
    });
    expect(s.receipts.get).not.toHaveBeenCalled();
    expect(s.tx.asset.findMany).not.toHaveBeenCalled();
    s.noSideEffects();
  });
  it.each(['organization', 'brand', 'member'] as const)(
    'denies deleted/missing active %s before revision access',
    async (entity) => {
      const s = setup();
      s.tx[entity].findFirst.mockResolvedValue(null);
      await expect(s.service.preview(actor)).rejects.toThrow(
        'receipt_access_denied',
      );
      expect(s.tx.$queryRaw).not.toHaveBeenCalled();
      expect(s.tx.brandOsRevision.findMany).not.toHaveBeenCalled();
      s.noSideEffects();
    },
  );
  it('denies assigned-brand mismatch and rechecks loss of access after waiting for the lock', async () => {
    const s = setup();
    s.tx.member.findFirst.mockResolvedValueOnce({
      role: { key: 'user' },
      brands: [{ id: 'foreign' }],
    });
    await expect(s.service.preview(actor)).rejects.toThrow(
      'receipt_access_denied',
    );
    expect(s.tx.brandOsRevision.findMany).not.toHaveBeenCalled();
    s.tx.member.findFirst
      .mockResolvedValueOnce({
        role: { key: 'user' },
        brands: [{ id: 'brand' }],
      })
      .mockResolvedValueOnce(null);
    await expect(s.service.preview(actor)).rejects.toThrow(
      'receipt_access_denied',
    );
    expect(s.tx.brandOsRevision.findMany).not.toHaveBeenCalled();
    s.noSideEffects();
  });
  it.each([[], [revision(), revision('B')]])(
    'rejects absent or ambiguous current approval %j',
    async (rows) => {
      const s = setup();
      s.tx.brandOsRevision.findMany.mockResolvedValue(rows);
      await expect(s.service.preview(actor)).rejects.toThrow(
        'brand_identity_unavailable',
      );
      s.noSideEffects();
    },
  );
  it.each([
    { organizationId: 'foreign' },
    { brandId: 'foreign' },
    { generationRulesReviewHash: null },
    {
      content: toPrismaJson({
        generationRulesReviewCandidateHash: 'candidate',
        fields: { label: { proposedValue: 'Wrong' } },
      }),
    },
  ])(
    'rejects foreign/malformed/uncertified saved revision %j',
    async (patch) => {
      const s = setup();
      s.tx.brandOsRevision.findMany.mockResolvedValue([
        { ...revision(), ...patch },
      ]);
      await expect(s.service.preview(actor)).rejects.toThrow(
        'brand_identity_integrity_failed',
      );
      s.noSideEffects();
    },
  );
  it('returns pinned historical A unchanged after B approval and source/asset revocation, without current-source revalidation or reuse admission', async () => {
    const s = setup();
    const pinned = projectApprovedBrandIdentitySnapshot(revision(), time);
    pinned.generationRules.evidence = [
      { id: 'e', sourceType: 'manual', label: 'Saved asset' },
    ];
    pinned.generationRules.assets = [
      {
        id: 'asset-ref',
        assetId: 'historical-asset',
        role: 'logo',
        required: true,
        evidenceIds: ['e'],
      },
    ];
    pinned.contentHash = hashBrandIdentitySnapshotV1(pinned);
    s.receipts.get.mockResolvedValue({
      id: 'receipt',
      organizationId: 'org',
      brandId: 'brand',
      snapshot: pinned,
    });
    s.tx.brandOsRevision.findMany.mockResolvedValue([revision('B')]);
    expect((await s.service.preview(actor)).revisionId).toBe('B');
    s.prisma.$transaction.mockClear();
    s.tx.brandOsRevision.findMany.mockClear();
    s.tx.asset.findMany.mockClear();
    s.tx.brandOsRevision.findMany.mockResolvedValue([
      {
        ...revision(),
        status: BrandOsRevisionStatus.SUPERSEDED,
        isDeleted: true,
      },
    ]);
    s.tx.asset.findMany.mockResolvedValue([]);
    const result = await s.service.preview(actor, 'receipt');
    expect(result).toBe(pinned);
    expect(result).toEqual(pinned);
    expect(s.receipts.get).toHaveBeenCalledExactlyOnceWith(actor, 'receipt');
    expect(s.prisma.$transaction).not.toHaveBeenCalled();
    expect(s.tx.brandOsRevision.findMany).not.toHaveBeenCalled();
    expect(s.tx.asset.findMany).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('eligible');
    expect(result).not.toHaveProperty('compliance');
    s.noSideEffects();
  });
  it('preserves a pinned provisional approval label and resolution time without creating a new capture', async () => {
    const s = setup();
    const snapshot = {
      ...projectApprovedBrandIdentitySnapshot(revision(), time),
      approval: 'provisional' as const,
    };
    snapshot.contentHash = hashBrandIdentitySnapshotV1(snapshot);
    s.receipts.get.mockResolvedValue({
      organizationId: 'org',
      brandId: 'brand',
      snapshot,
    });
    expect(await s.service.preview(actor, 'receipt')).toBe(snapshot);
    s.noSideEffects();
  });
  it.each([
    { organizationId: 'foreign' },
    { brandId: 'foreign' },
    {
      snapshot: {
        ...projectApprovedBrandIdentitySnapshot(revision(), time),
        contentHash: `sha256:${'b'.repeat(64)}`,
      },
    },
    {
      snapshot: {
        ...projectApprovedBrandIdentitySnapshot(revision(), time),
        organizationId: 'foreign',
      },
    },
    {
      snapshot: {
        ...projectApprovedBrandIdentitySnapshot(revision(), time),
        brandId: 'foreign',
      },
    },
    { snapshot: { unexpected: 'PRIVATE' } },
  ])(
    'rejects saved receipt/snapshot scope or canonical integrity %j without private prompt access',
    async (patch) => {
      const s = setup();
      s.receipts.get.mockResolvedValue({
        organizationId: 'org',
        brandId: 'brand',
        snapshot: projectApprovedBrandIdentitySnapshot(revision(), time),
        ...patch,
      });
      await expect(s.service.preview(actor, 'receipt')).rejects.toThrow(
        'brand_identity_integrity_failed',
      );
      s.noSideEffects();
    },
  );
  it('reports raw/unresolved snapshots unavailable and preserves existing receipt access/deletion denial', async () => {
    const s = setup();
    s.receipts.get.mockResolvedValue({ snapshot: null });
    await expect(s.service.preview(actor, 'receipt')).rejects.toThrow(
      'brand_identity_snapshot_unavailable',
    );
    const denied = new ForbiddenException('receipt_access_denied');
    s.receipts.get.mockRejectedValueOnce(denied);
    await expect(s.service.preview(actor, 'receipt')).rejects.toBe(denied);
    s.receipts.get.mockRejectedValueOnce(new Error('receipt_not_found'));
    await expect(s.service.preview(actor, 'receipt')).rejects.toThrow(
      'receipt_not_found',
    );
    s.noSideEffects();
  });
  it.each(['', 'x'.repeat(257), 'bad\u0080id'])(
    'rejects malformed authoritative IDs before any source access %j',
    async (id) => {
      const s = setup();
      await expect(
        s.service.preview({ ...actor, actorId: id }),
      ).rejects.toThrow('receipt_query_invalid');
      await expect(s.service.preview(actor, id)).rejects.toThrow(
        'receipt_query_invalid',
      );
      expect(s.prisma.$transaction).not.toHaveBeenCalled();
      expect(s.receipts.get).not.toHaveBeenCalled();
      s.noSideEffects();
    },
  );
});
