import { VisualProjectBrandContextService } from '@api/collections/visual-projects/services/visual-project-brand-context.service';
import { brandedGenerationResolutionV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces';
import type { VisualRevision } from '@genfeedai/prisma';
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

function snapshot(revisionId = 'brand-revision'): BrandIdentitySnapshotV1 {
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
      assets: [],
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
  const service = new VisualProjectBrandContextService(
    prisma as never,
    modes as never,
    snapshots as never,
    receipts as never,
    harness as never,
    contentHarness as never,
    skillRuntime as never,
    logger as never,
  );
  return { harness, receipts, service, skillRuntime, snapshots };
}

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
