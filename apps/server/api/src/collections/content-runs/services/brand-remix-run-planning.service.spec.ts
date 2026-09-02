import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import type { ResolvedBrandContext } from '@api/collections/content-runs/services/brand-remix-runs.types';
import { BrandRemixSourceResolverService } from '@api/collections/content-runs/services/brand-remix-source-resolver.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientStatus } from '@genfeedai/contracts';
import type { BrandRemixDraft } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const brandContext = {
  brand: {
    agentConfig: { strategy: { goals: ['Grow'] } },
    description: 'Operational content systems.',
    id: 'brand-1',
    label: 'Acme',
    text: 'Turn signals into campaigns.',
  },
  brandKit: { references: [] },
  contextMode: 'brand',
  defaultIdentity: {},
} as unknown as ResolvedBrandContext;

describe('BrandRemixRunPlanningService', () => {
  const prisma = {
    asset: { findMany: vi.fn() },
    ingredient: { findMany: vi.fn() },
  } as unknown as PrismaService;
  const brandsService = {
    findOne: vi.fn(),
    resolveBrandKitAssets: vi.fn(),
  };
  const organizationSettingsService = { findOne: vi.fn() };
  const sourceResolver = {
    assertConnectedCredential: vi.fn(),
    resolveSource: vi.fn(),
  };
  let planning: BrandRemixRunPlanningService;

  beforeEach(() => {
    vi.resetAllMocks();
    planning = new BrandRemixRunPlanningService(
      prisma,
      brandsService as never,
      organizationSettingsService as never,
      sourceResolver as unknown as BrandRemixSourceResolverService,
    );
  });

  it('scopes brand context lookup to the live organization brand', async () => {
    brandsService.findOne.mockResolvedValue(brandContext.brand);
    organizationSettingsService.findOne.mockResolvedValue({
      organizationId: 'org-1',
    });
    brandsService.resolveBrandKitAssets.mockResolvedValue({ references: [] });

    await planning.resolveBrandContext('org-1', 'brand-1');

    expect(brandsService.findOne).toHaveBeenCalledWith(
      {
        id: 'brand-1',
        isActive: true,
        isDeleted: false,
        organizationId: 'org-1',
      },
      'none',
    );
    expect(brandsService.resolveBrandKitAssets).toHaveBeenCalledWith(
      'brand-1',
      'org-1',
    );
  });

  it('blocks strict fidelity when no identity or product reference is present', () => {
    const draft = {
      fidelityMode: 'strict',
      identity: {},
      intent: { objective: 'Create an original brand execution.' },
      output: { aspectRatio: '1:1', count: 1, kind: 'image' },
      references: [],
      reviewRequired: true,
      target: { kind: 'organic', platform: 'instagram' },
    } as BrandRemixDraft;

    const readiness = planning.buildReadiness(brandContext, draft);

    expect(readiness.state).toBe('blocked');
    expect(readiness.issues.map((issue) => issue.code)).toContain(
      'missing_required_reference',
    );
  });

  it('allows strict fidelity when a required reference is present', () => {
    const draft = {
      fidelityMode: 'strict',
      identity: {},
      intent: { objective: 'Create an original brand execution.' },
      output: { aspectRatio: '1:1', count: 1, kind: 'image' },
      references: [{ assetId: 'product-1', role: 'product' }],
      reviewRequired: true,
      target: { kind: 'organic', platform: 'instagram' },
    } as BrandRemixDraft;

    const readiness = planning.buildReadiness(brandContext, draft);

    expect(readiness.issues.map((issue) => issue.code)).not.toContain(
      'missing_required_reference',
    );
    expect(readiness.issues.map((issue) => issue.code)).not.toContain(
      'unsupported_fidelity',
    );
  });

  it('blocks strict fidelity when it has only a style reference', () => {
    const draft = {
      fidelityMode: 'strict',
      identity: {},
      intent: { objective: 'Create an original brand execution.' },
      output: { aspectRatio: '1:1', count: 1, kind: 'image' },
      references: [{ assetId: 'style-1', role: 'style' }],
      reviewRequired: true,
      target: { kind: 'organic', platform: 'instagram' },
    } as BrandRemixDraft;

    const readiness = planning.buildReadiness(brandContext, draft);

    expect(readiness.state).toBe('blocked');
    expect(readiness.issues.map((issue) => issue.code)).toContain(
      'missing_required_reference',
    );
  });

  it('maps persisted reference categories into immutable semantic defaults', () => {
    const draft = planning.defaultDraft(
      {
        ...brandContext,
        brandKit: {
          references: [
            {
              id: 'face-1',
              label: 'Approved identity sheet',
              referenceCategory: 'FACE',
              role: 'reference',
              url: 'https://cdn.example.com/references/face-1',
            },
            {
              id: 'product-1',
              label: 'Matte black bottle with gold cap',
              referenceCategory: 'PRODUCT',
              role: 'reference',
              url: 'https://cdn.example.com/references/product-1',
            },
            {
              id: 'style-1',
              label: 'Warm studio wardrobe',
              referenceCategory: 'STYLE',
              role: 'reference',
              url: 'https://cdn.example.com/references/style-1',
            },
          ],
        },
      } as ResolvedBrandContext,
      {
        recommendedOutputKind: 'image',
        snapshot: {
          capturedAt: '2026-08-26T12:00:00.000Z',
          evidence: [],
          metrics: {},
          pattern: {},
          platform: 'instagram',
          selector: { kind: 'source_post', sourcePostId: 'source-1' },
          sourceId: 'source-1',
          title: 'Source',
        },
      },
    );

    expect(draft.references).toEqual([
      expect.objectContaining({ assetId: 'face-1', role: 'character' }),
      expect.objectContaining({
        assetId: 'product-1',
        description: 'Matte black bottle with gold cap',
        role: 'product',
      }),
      expect.objectContaining({ assetId: 'style-1', role: 'style' }),
    ]);
  });

  it('authorizes draft assets with tenant and brand scope', async () => {
    (prisma.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'ref-1', status: IngredientStatus.GENERATED },
    ]);
    (prisma.asset.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'ref-1' },
    ]);
    const draft = {
      fidelityMode: 'guided',
      identity: {},
      intent: { objective: 'Create an original brand execution.' },
      output: { aspectRatio: '1:1', count: 1, kind: 'image' },
      references: [{ assetId: 'ref-1', role: 'product', source: 'explicit' }],
      reviewRequired: true,
      target: { kind: 'organic', platform: 'instagram' },
    } as BrandRemixDraft;

    await planning.assertDraftAssetsAuthorized('org-1', 'brand-1', draft);

    expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
        }),
      }),
    );
  });

  it('rejects a foreign generated asset without widening tenant scope', async () => {
    (prisma.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      [],
    );

    await expect(
      planning.assertGeneratedAssetsAuthorized('org-1', 'brand-1', ['image-2']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          brandId: 'brand-1',
          id: { in: ['image-2'] },
          isDeleted: false,
          organizationId: 'org-1',
          status: {
            in: [
              IngredientStatus.GENERATED,
              IngredientStatus.UPLOADED,
              IngredientStatus.VALIDATED,
            ],
          },
        },
      }),
    );
  });
});
