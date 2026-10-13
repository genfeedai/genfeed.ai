import { BrandRenderEvidenceService } from '@api/services/brand-render-evidence/brand-render-evidence.service';
import type { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import realRender from '@api-test/fixtures/brand-render-evidence/visual-code-still.fixture.json';
import type { IVisualSandboxMedia } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const bytes = Buffer.from(realRender.png, 'base64');
const revisionScope = {
  organizationId: 'org-1',
  brandId: 'brand-1',
  userId: 'user-1',
  sourceAssetIds: ['zodiak-regular', 'logo-png'],
  rendererVersion: '4.0.530',
};
const snapshot = {
  revisionId: 'revision-7',
  revisionVersion: 7,
  contentHash: `sha256:${'c'.repeat(64)}`,
};

function setup() {
  const preview = vi.fn().mockResolvedValue(snapshot);
  const findFirst = vi.fn();
  const warn = vi.fn();
  const service = new BrandRenderEvidenceService(
    { ingredient: { findFirst } } as unknown as PrismaService,
    { preview } as unknown as BrandIdentitySnapshotService,
    { warn } as unknown as LoggerService,
  );
  return { service, preview, findFirst, warn };
}
const media = (overrides: Partial<IVisualSandboxMedia> = {}) => ({
  format: 'png' as const,
  width: realRender.width,
  height: realRender.height,
  frame: realRender.frame,
  bytes: realRender.png,
  evidence: structuredClone(realRender.evidence),
  ...overrides,
});
const output = (item: IVisualSandboxMedia, artifactId = 'ingredient-1') => ({
  artifactId,
  storageKey: 'visual-code/org-1/brand-1/revision-1/outputs/0.png',
  bytes,
  media: item,
});

describe('resolveSnapshot', () => {
  it('records the approved revision in effect at render time', async () => {
    const { service, preview } = setup();
    await expect(service.resolveSnapshot(revisionScope)).resolves.toEqual({
      binding: 'approved_at_render',
      ...snapshot,
    });
    expect(preview).toHaveBeenCalledWith({
      actorId: 'user-1',
      organizationId: 'org-1',
      brandId: 'brand-1',
    });
  });

  it.each(['brand_identity_unavailable', 'brand_identity_integrity_failed'])(
    'keeps %s explicit instead of inventing a revision',
    async (code) => {
      const { service, preview } = setup();
      preview.mockRejectedValue(new ConflictException(code));
      await expect(service.resolveSnapshot(revisionScope)).resolves.toEqual({
        binding: 'unavailable',
        reasonCode: code,
      });
    },
  );

  it.each([
    new ForbiddenException(),
    new HttpException('missing', 404),
    new HttpException('who', 401),
  ])(
    'keeps failing when the caller may not see the brand (%s)',
    async (denial) => {
      const { service, preview, warn } = setup();
      preview.mockRejectedValue(denial);
      await expect(service.resolveSnapshot(revisionScope)).rejects.toBe(denial);
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('does not let a failed snapshot lookup stop an export', async () => {
    const { service, preview, warn } = setup();
    for (const failure of [
      new ConflictException('something_else'),
      new Error('connection reset'),
    ]) {
      preview.mockRejectedValue(failure);
      await expect(service.resolveSnapshot(revisionScope)).resolves.toEqual({
        binding: 'unavailable',
        reasonCode: 'brand_identity_lookup_failed',
      });
    }
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'Brand snapshot lookup failed for render evidence',
      expect.objectContaining({ brandId: 'brand-1', organizationId: 'org-1' }),
    );
  });

  it('keeps recognised unavailability quiet', async () => {
    const { service, preview, warn } = setup();
    preview.mockRejectedValue(
      new ConflictException('brand_identity_unavailable'),
    );
    await service.resolveSnapshot(revisionScope);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('forRender', () => {
  it('builds a manifest bound to the output bytes and tenant', async () => {
    const { service } = setup();
    const manifest = await service
      .forRender(revisionScope)
      .manifestFor(output(media()));
    expect(manifest).toMatchObject({
      organizationId: 'org-1',
      brandId: 'brand-1',
      artifact: { id: 'ingredient-1', byteLength: bytes.byteLength },
      brandSnapshot: { binding: 'approved_at_render', revisionVersion: 7 },
    });
  });

  it('leaves a model-style output without a manifest and skips the snapshot', async () => {
    const { service, preview } = setup();
    const { evidence: _evidence, ...item } = media();
    await expect(
      service.forRender(revisionScope).manifestFor(output(item)),
    ).resolves.toBeNull();
    expect(preview).not.toHaveBeenCalled();
  });

  it('drops invalid evidence rather than failing the export, and says why', async () => {
    const { service, warn } = setup();
    await expect(
      service
        .forRender(revisionScope)
        .manifestFor(output(media({ evidence: { schemaVersion: 1 } }))),
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith('Render evidence omitted for an export', {
      artifactId: 'ingredient-1',
      reasonCode: 'observations_invalid',
    });
  });

  it('resolves the snapshot once per render', async () => {
    const { service, preview } = setup();
    const render = service.forRender(revisionScope);
    await render.manifestFor(output(media()));
    await render.manifestFor(output(media(), 'ingredient-2'));
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it('only accepts assets the revision authorised', async () => {
    const { service } = setup();
    const manifest = await service
      .forRender({ ...revisionScope, sourceAssetIds: [] })
      .manifestFor(output(media()));
    expect(manifest?.placedAssets[0]).toMatchObject({
      assetId: null,
      contentHash: null,
    });
    expect(
      manifest?.fonts.find((font) => font.family === 'Zodiak')?.source.kind,
    ).toBe('unknown');
  });

  it('credits a font to its asset when the brand approved that font file', async () => {
    const { service } = setup();
    const manifest = await service
      .forRender({
        ...revisionScope,
        sourceAssetIds: [],
        brandFontAssetIds: ['zodiak-regular'],
      })
      .manifestFor(output(media()));
    expect(
      manifest?.fonts.find((font) => font.family === 'Zodiak')?.source,
    ).toEqual({
      kind: 'asset',
      assetId: 'zodiak-regular',
      contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
  });

  it('does not credit a font to an asset the brand did not approve', async () => {
    const { service } = setup();
    const manifest = await service
      .forRender({
        ...revisionScope,
        sourceAssetIds: [],
        brandFontAssetIds: ['another-brand-font'],
      })
      .manifestFor(output(media()));
    expect(
      manifest?.fonts.find((font) => font.family === 'Zodiak')?.source.kind,
    ).toBe('unknown');
  });
});

describe('read', () => {
  async function stored() {
    const { service, findFirst } = setup();
    const manifest = await service
      .forRender(revisionScope)
      .manifestFor(output(media()));
    findFirst.mockResolvedValue({ providerData: { renderEvidence: manifest } });
    return { service, findFirst, manifest };
  }
  const scope = { organizationId: 'org-1', brandId: 'brand-1' };

  it('queries inside the tenant and brand and skips deleted artifacts', async () => {
    const { service, findFirst } = await stored();
    await service.read(scope, 'ingredient-1', bytes);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'ingredient-1',
        organizationId: 'org-1',
        brandId: 'brand-1',
        isDeleted: false,
      },
      select: { providerData: true },
    });
  });

  it('verifies a stored manifest against the bytes held', async () => {
    const { service, manifest } = await stored();
    await expect(service.read(scope, 'ingredient-1', bytes)).resolves.toEqual({
      status: 'verified',
      manifest,
    });
  });

  it('rejects stale evidence after the artifact bytes changed', async () => {
    const { service } = await stored();
    const regenerated = Buffer.from(bytes);
    regenerated[regenerated.length - 1] ^= 1;
    await expect(
      service.read(scope, 'ingredient-1', regenerated),
    ).resolves.toMatchObject({
      status: 'rejected',
      reasonCode: 'artifact_hash_mismatch',
    });
  });

  it('rejects a manifest stored under another tenant', async () => {
    const { service } = await stored();
    await expect(
      service.read(
        { organizationId: 'org-2', brandId: 'brand-1' },
        'ingredient-1',
        bytes,
      ),
    ).resolves.toMatchObject({ reasonCode: 'scope_mismatch' });
  });

  it('reports a missing artifact or manifest as missing', async () => {
    const { service, findFirst } = setup();
    findFirst.mockResolvedValue(null);
    await expect(
      service.read(scope, 'ingredient-1', bytes),
    ).resolves.toMatchObject({ status: 'missing' });
    findFirst.mockResolvedValue({ providerData: { sourceHash: 'x' } });
    await expect(
      service.read(scope, 'ingredient-1', bytes),
    ).resolves.toMatchObject({ status: 'missing' });
    findFirst.mockResolvedValue({ providerData: null });
    await expect(
      service.read(scope, 'ingredient-1', bytes),
    ).resolves.toMatchObject({ status: 'missing' });
  });
});
