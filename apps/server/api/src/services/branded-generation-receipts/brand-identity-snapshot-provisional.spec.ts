import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { projectProvisionalBrandIdentitySnapshot } from '@api/services/branded-generation-receipts/brand-identity-snapshot-projection.util';
import { hashBrandIdentitySnapshotV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import type { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import {
  brandGenerationRulesV1Schema,
  brandIdentitySnapshotV1Schema,
} from '@genfeedai/contracts/api-types/contracts';
import {
  buildBrandKitDraftFromBrand,
  buildGenfeedDefaultKitDraft,
} from '@genfeedai/helpers';
import {
  type BrandOsRevision,
  BrandOsRevisionStatus,
  toPrismaJson,
} from '@genfeedai/prisma';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const actor = { actorId: 'actor', brandId: 'brand', organizationId: 'org' };
const time = new Date('2026-10-02T00:00:00.000Z');

function storedJson(value: unknown): BrandOsRevision['content'] {
  return z.json().parse(toPrismaJson(value));
}

function draftRow(
  content: unknown,
  overrides: Partial<BrandOsRevision> = {},
): BrandOsRevision {
  return {
    approvedAt: null,
    approvedById: null,
    brandId: 'brand',
    content: storedJson(content),
    createdAt: time,
    exportSchemaVersion: '1',
    generationRulesReviewHash: null,
    id: 'draft-1',
    isDeleted: false,
    organizationId: 'org',
    sourcePreviewTokenHash: null,
    status: BrandOsRevisionStatus.DRAFT,
    updatedAt: time,
    version: 3,
    ...overrides,
  };
}

function seedContent() {
  return {
    ...buildGenfeedDefaultKitDraft({
      description: 'Anvils',
      id: 'brand',
      label: 'Acme',
      organization: 'org',
    }),
    brandId: 'brand',
    organizationId: 'org',
  };
}

function scanContent() {
  return {
    ...buildBrandKitDraftFromBrand({
      backgroundColor: '#111111',
      fontFamily: 'Inter',
      id: 'brand',
      label: 'Acme',
      primaryColor: '#abcdef',
      secondaryColor: 'blue',
    }),
    brandId: 'brand',
    organizationId: 'org',
  };
}

describe('projectProvisionalBrandIdentitySnapshot', () => {
  it('binds the exact draft revision and never claims approval', () => {
    const snapshot = projectProvisionalBrandIdentitySnapshot(
      draftRow(seedContent()),
      time.toISOString(),
    );
    expect(brandIdentitySnapshotV1Schema.safeParse(snapshot).success).toBe(
      true,
    );
    expect(snapshot).toMatchObject({
      approval: 'provisional',
      brandId: 'brand',
      organizationId: 'org',
      revisionId: 'draft-1',
      revisionVersion: 3,
    });
    expect(snapshot.identity.name).toBe('Acme');
    expect(snapshot.voice.tone).toBe('Bold and punchy');
    expect(hashBrandIdentitySnapshotV1(snapshot)).toBe(snapshot.contentHash);
  });

  it('gives provisional and approved identities different hashes for the same content', () => {
    const provisional = projectProvisionalBrandIdentitySnapshot(
      draftRow(seedContent()),
      time.toISOString(),
    );
    expect(provisional.approval).toBe('provisional');
    expect(provisional.contentHash).not.toBe(
      hashBrandIdentitySnapshotV1({ ...provisional, approval: 'approved' }),
    );
  });

  it('synthesizes non-blocking style rules from fields when a draft has none', () => {
    const snapshot = projectProvisionalBrandIdentitySnapshot(
      draftRow(scanContent()),
      time.toISOString(),
    );
    const rules = snapshot.generationRules;
    expect(brandGenerationRulesV1Schema.safeParse(rules).success).toBe(true);
    expect(rules.palette.map((rule) => [rule.id, rule.color])).toEqual([
      ['palette_primary', '#ABCDEF'],
      ['palette_background', '#111111'],
    ]);
    expect(rules.typography).toHaveLength(1);
    expect(rules.typography[0]).toMatchObject({
      availability: 'unknown',
      family: 'Inter',
    });
    expect(
      [...rules.palette, ...rules.typography].every(
        (rule) => rule.required === false,
      ),
    ).toBe(true);
    expect(rules.facts).toEqual([]);
    expect(rules.assets).toEqual([]);
  });

  it.each([
    ['an approved row', { status: BrandOsRevisionStatus.APPROVED }],
    ['a superseded row', { status: BrandOsRevisionStatus.SUPERSEDED }],
    ['a deleted row', { isDeleted: true }],
    ['another organization', { organizationId: 'other' }],
    ['another brand', { brandId: 'other' }],
  ])('rejects %s', (_label, overrides) => {
    expect(() =>
      projectProvisionalBrandIdentitySnapshot(
        draftRow(seedContent(), overrides),
        time.toISOString(),
      ),
    ).toThrow(ConflictException);
  });

  it('rejects a draft that has no brand name', () => {
    const content = seedContent();
    delete content.fields.label;
    expect(() =>
      projectProvisionalBrandIdentitySnapshot(
        draftRow(content),
        time.toISOString(),
      ),
    ).toThrow('brand_identity_integrity_failed');
  });
});

function setup(rows: BrandOsRevision[]) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'brand' }]),
    asset: { findMany: vi.fn().mockResolvedValue([]) },
    brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) },
    brandOsRevision: {
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          rows.find(
            (row) =>
              row.id === where.id &&
              row.organizationId === where.organizationId &&
              row.brandId === where.brandId &&
              row.status === where.status &&
              row.isDeleted === where.isDeleted,
          ) ?? null,
      ),
    },
    member: {
      findFirst: vi.fn().mockResolvedValue({
        brands: [{ id: 'brand' }],
        role: { key: 'user' },
      }),
    },
    organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org' }) },
  };
  const prisma = {
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const receipts = { get: vi.fn() };
  const service = new BrandIdentitySnapshotService(
    prisma as unknown as PrismaService,
    new BrandedGenerationReceiptAccessService(brandAccessFixture()),
    receipts as unknown as BrandedGenerationReceiptsService,
  );
  return { receipts, service, tx };
}

describe('BrandIdentitySnapshotService.previewProvisional', () => {
  it('captures one explicit draft inside the tenant and brand scope', async () => {
    const { receipts, service, tx } = setup([draftRow(seedContent())]);
    const snapshot = await service.previewProvisional(actor, 'draft-1');
    expect(snapshot.approval).toBe('provisional');
    expect(snapshot.revisionId).toBe('draft-1');
    expect(tx.brandOsRevision.findFirst).toHaveBeenCalledWith({
      where: {
        brandId: 'brand',
        id: 'draft-1',
        isDeleted: false,
        organizationId: 'org',
        status: BrandOsRevisionStatus.DRAFT,
      },
    });
    expect(receipts.get).not.toHaveBeenCalled();
  });

  it.each([
    ['an approved revision', { status: BrandOsRevisionStatus.APPROVED }],
    ['a deleted draft', { isDeleted: true }],
    ['a draft of another brand', { brandId: 'other' }],
  ])('treats %s as unavailable', async (_label, overrides) => {
    const { service } = setup([draftRow(seedContent(), overrides)]);
    await expect(service.previewProvisional(actor, 'draft-1')).rejects.toThrow(
      new ConflictException('brand_identity_unavailable'),
    );
  });

  it('rejects malformed ids before any query', async () => {
    const { service, tx } = setup([]);
    await expect(service.previewProvisional(actor, '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.brandOsRevision.findFirst).not.toHaveBeenCalled();
  });
});
