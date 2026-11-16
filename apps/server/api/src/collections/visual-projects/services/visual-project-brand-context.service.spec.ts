import { VisualProjectBrandContextService } from '@api/collections/visual-projects/services/visual-project-brand-context.service';
import { brandedGenerationResolutionV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces';
import type { VisualRevision } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const hash = `sha256:${'b'.repeat(64)}`;
const revision = {
  id: 'visual-revision',
  organizationId: 'org',
  brandId: 'brand',
  userId: 'user',
  modelKey: 'anthropic/model',
  prompt: 'A launch card',
  rendererVersion: '4.0.530',
} as unknown as VisualRevision;

const logoReference = {
  assetId: 'brand-logo',
  evidenceIds: ['e1'],
  id: 'logo-reference',
  mimeType: 'image/png',
  required: true,
  role: 'logo' as const,
};

function snapshot(
  revisionId = 'brand-revision',
  assets: BrandIdentitySnapshotV1['generationRules']['assets'] = [],
): BrandIdentitySnapshotV1 {
  return {
    schemaVersion: 1,
    organizationId: 'org',
    brandId: 'brand',
    revisionId,
    revisionVersion: 2,
    approval: 'approved',
    resolvedAt: '2026-11-15T00:00:00.000Z',
    contentHash: hash,
    identity: { name: 'Kelder' },
    voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
    generationRules: {
      schemaVersion: 1,
      evidence: [{ id: 'e1', sourceType: 'manual', label: 'Owner' }],
      facts: [],
      mandatory: [],
      avoid: [],
      palette: [
        {
          id: 'p1',
          color: '#112233',
          usage: 'Primary',
          required: true,
          evidenceIds: ['e1'],
        },
      ],
      typography: [],
      assets,
      examples: [],
    },
    diagnostics: [],
  };
}

function fixture(options: { pinned?: BrandIdentitySnapshotV1 } = {}) {
  const prisma = {
    brandedGenerationReceipt: {
      findFirst: vi.fn().mockResolvedValue(
        options.pinned
          ? {
              projection: {
                snapshot: options.pinned,
                mode: 'approved_brand',
              },
            }
          : null,
      ),
    },
  };
  const modes = {
    resolve: vi.fn().mockResolvedValue({ mode: 'approved_brand' }),
  };
  const snapshots = {
    preview: vi.fn().mockResolvedValue(snapshot()),
    previewProvisional: vi.fn(),
  };
  const receipts = {
    create: vi.fn().mockResolvedValue({
      receipt: { id: 'receipt', state: 'created', revision: 0 },
    }),
    recordResolution: vi.fn().mockResolvedValue({}),
  };
  const harness = {
    resolveBrief: vi.fn().mockResolvedValue({
      appliedPacks: ['brand-fidelity'],
      systemDirectives: ['Keep the logo clear'],
      styleDirectives: [],
      guardrails: [],
      evaluationCriteria: [],
      sources: [],
    }),
  };
  const contentHarness = {
    listLoadedPackVersions: vi
      .fn()
      .mockResolvedValue([{ id: 'brand-fidelity', version: '1.2.0' }]),
  };
  const skillRuntime = {
    resolveActiveSkills: vi.fn().mockResolvedValue([
      {
        slug: 'model-selector',
        instructions: 'Pick the model',
        versionId: 'skill-version',
        contentHash: hash,
      },
    ]),
    buildSkillPromptSections: vi.fn().mockReturnValue('SKILL: Pick the model'),
  };
  const logger = { warn: vi.fn() };
  const logoStaging = {
    approvedLogos: vi.fn().mockResolvedValue([]),
    stage: vi.fn().mockResolvedValue({ assets: [], totalBytes: 0 }),
  };
  const service = new VisualProjectBrandContextService(
    prisma as never,
    modes as never,
    snapshots as never,
    receipts as never,
    harness as never,
    contentHarness as never,
    skillRuntime as never,
    logoStaging as never,
    logger as never,
  );
  return { harness, logoStaging, receipts, service, skillRuntime, snapshots };
}

describe('Motion brand logo', () => {
  const staged = {
    assetId: 'brand-logo',
    isRequired: true,
    mimeType: 'image/png' as const,
  };

  it('marks a logo the renderer will stage as staged', async () => {
    const { logoStaging, service, snapshots } = fixture();
    snapshots.preview.mockResolvedValue(
      snapshot('brand-revision', [logoReference]),
    );
    logoStaging.approvedLogos.mockResolvedValue([staged]);
    const context = await service.resolve(revision, ['library-image']);
    expect(context.logo).toEqual([
      {
        assetId: 'brand-logo',
        role: 'logo',
        isRequired: true,
        mimeType: 'image/png',
        isStaged: true,
      },
    ]);
  });

  it('leaves a logo the renderer cannot stage marked as not staged', async () => {
    const { service, snapshots } = fixture();
    snapshots.preview.mockResolvedValue(
      snapshot('brand-revision', [logoReference]),
    );
    const context = await service.resolve(revision, []);
    expect(context.logo.map((logo) => logo.isStaged)).toEqual([false]);
  });

  it('reserves the slots the source assets use, so the sandbox limit holds', async () => {
    const { logoStaging, service } = fixture();
    const sources = Array.from({ length: 10 }, (_, index) => `source-${index}`);
    await service.resolve(revision, sources);
    expect(logoStaging.approvedLogos.mock.calls[0]?.[2]).toBe(2);
  });

  it('stages the logo of the snapshot the revision was authored against', async () => {
    const pinned = snapshot('pinned-revision', [logoReference]);
    const { logoStaging, service, snapshots } = fixture({ pinned });
    logoStaging.approvedLogos.mockImplementation(
      async (_scope: unknown, from: BrandIdentitySnapshotV1) =>
        from.revisionId === 'pinned-revision' ? [staged] : [],
    );
    expect(await service.stagedLogos(revision, [])).toEqual([staged]);
    expect(snapshots.preview).not.toHaveBeenCalled();
  });

  it('stages no logo for a brand without an approved identity', async () => {
    const { logoStaging, service, snapshots } = fixture();
    snapshots.preview.mockRejectedValue(
      new ConflictException('brand_identity_unavailable'),
    );
    expect(await service.stagedLogos(revision, [])).toEqual([]);
    expect(logoStaging.approvedLogos).not.toHaveBeenCalled();
  });
});

describe('Motion inspection brief', () => {
  const staged = {
    assetId: 'brand-logo',
    isRequired: true,
    mimeType: 'image/png' as const,
  };

  it('carries the approved palette and the staged required logo', async () => {
    const { logoStaging, service } = fixture();
    logoStaging.approvedLogos.mockResolvedValue([staged]);
    logoStaging.stage.mockResolvedValue({
      assets: [{ id: 'brand-logo', mime: 'image/png', bytes: 'bG9nbw==' }],
      totalBytes: 4,
    });
    expect(await service.inspectionBrief(revision, [])).toEqual({
      paletteRoles: [{ role: 'Primary', color: '#112233', isRequired: true }],
      requiredLogo: {
        assetId: 'brand-logo',
        mime: 'image/png',
        bytes: 'bG9nbw==',
      },
    });
  });

  it('asks for no logo when the logo is optional or cannot be read', async () => {
    const { logoStaging, service } = fixture();
    logoStaging.approvedLogos.mockResolvedValue([
      { ...staged, isRequired: false },
    ]);
    expect(
      (await service.inspectionBrief(revision, []))?.requiredLogo,
    ).toBeNull();
    logoStaging.approvedLogos.mockResolvedValue([staged]);
    logoStaging.stage.mockRejectedValue(new Error('storage down'));
    expect(
      (await service.inspectionBrief(revision, []))?.requiredLogo,
    ).toBeNull();
  });

  it('has no brief for a brand without an approved identity', async () => {
    const { service, snapshots } = fixture();
    snapshots.preview.mockRejectedValue(
      new ConflictException('brand_identity_unavailable'),
    );
    expect(await service.inspectionBrief(revision, [])).toBeNull();
  });
});

describe('Motion brand context', () => {
  it('reads the approved revision, the media brief and the video skills', async () => {
    const { harness, service, skillRuntime } = fixture();
    const context = await service.resolve(revision, []);
    expect(context.revision).toEqual({ id: 'brand-revision', version: 2 });
    expect(context.paletteRoles).toEqual([
      { role: 'Primary', color: '#112233', isRequired: true },
    ]);
    expect(context.harnessBrief).toContain('Keep the logo clear');
    expect(context.skills).toBe('SKILL: Pick the model');
    expect(harness.resolveBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        brandRevisionId: 'brand-revision',
        contentType: 'video',
        surface: 'media',
      }),
    );
    expect(skillRuntime.resolveActiveSkills).toHaveBeenCalledWith(
      'org',
      'brand',
      undefined,
      { actorUserId: 'user', modality: 'video' },
    );
  });

  it('stores a receipt naming the revision, the pack and the skill that applied', async () => {
    const { receipts, service } = fixture();
    await service.resolve(revision, []);
    expect(receipts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestKey: 'visual-revision',
        contentType: 'video',
        mode: 'approved_brand',
      }),
      expect.objectContaining({ actorId: 'user' }),
    );
    const resolution = brandedGenerationResolutionV1Schema.parse(
      receipts.recordResolution.mock.calls[0][3],
    );
    expect(resolution.snapshot?.revisionId).toBe('brand-revision');
    expect(
      resolution.layers.map((layer) => [layer.kind, layer.id, layer.status]),
    ).toEqual([
      ['identity', 'brand-revision', 'applied'],
      ['pack', 'brand-fidelity', 'applied'],
      ['skill', 'skill-version', 'applied'],
    ]);
  });

  it('keeps a repair on the brand revision the first call used', async () => {
    const { receipts, service, snapshots } = fixture({
      pinned: snapshot('first-revision'),
    });
    const context = await service.resolve(revision, []);
    expect(context.revision.id).toBe('first-revision');
    expect(snapshots.preview).not.toHaveBeenCalled();
    expect(receipts.create).not.toHaveBeenCalled();
  });

  it('records an unavailable brief and keeps authoring', async () => {
    const { harness, receipts, service } = fixture();
    harness.resolveBrief.mockRejectedValue(new Error('down'));
    const context = await service.resolve(revision, []);
    expect(context.harnessBrief).toBe('');
    const layers = receipts.recordResolution.mock.calls[0][3].layers;
    expect(layers).toContainEqual(
      expect.objectContaining({
        kind: 'pack',
        status: 'unavailable',
        reasonCode: 'pack_context_unavailable',
      }),
    );
  });

  it('records unavailable skills and keeps authoring', async () => {
    const { receipts, service, skillRuntime } = fixture();
    skillRuntime.resolveActiveSkills.mockRejectedValue(new Error('down'));
    const context = await service.resolve(revision, []);
    expect(context.skills).toBe('');
    const layers = receipts.recordResolution.mock.calls[0][3].layers;
    expect(layers).toContainEqual(
      expect.objectContaining({
        kind: 'skill',
        status: 'unavailable',
        reasonCode: 'skill_context_unavailable',
      }),
    );
  });
});
