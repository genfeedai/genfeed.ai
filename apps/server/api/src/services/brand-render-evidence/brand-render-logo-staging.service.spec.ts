import { createHash } from 'node:crypto';
import {
  type BrandLogoScope,
  BrandRenderLogoStagingService,
} from '@api/services/brand-render-evidence/brand-render-logo-staging.service';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ readBytes: vi.fn() }));
vi.mock('@genfeedai/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/storage')>()),
  createStorageProvider: () => storage,
}));

const scope: BrandLogoScope = { organizationId: 'org-a', brandId: 'brand-a' };
type AssetReference =
  BrandIdentitySnapshotV1['generationRules']['assets'][number];
interface AssetRow {
  id: string;
  parentType: string;
  parentOrgId: string | null;
  parentBrandId: string | null;
  category: string;
  isDeleted: boolean;
  mimeType: string | null;
  sha256: string | null;
  sizeBytes: number | null;
  cloudObjectKey: string | null;
}

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function pngBytes(seed: number): Buffer {
  const bytes = Buffer.alloc(64, seed);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  return bytes;
}
function jpegBytes(seed: number): Buffer {
  const bytes = Buffer.alloc(64, seed);
  bytes.set([255, 216]);
  bytes.set([255, 217], 62);
  return bytes;
}
const keyOf = (id: string) =>
  `brand-logos/${scope.organizationId}/${scope.brandId}/${id}/file`;
function rowFor(
  id: string,
  bytes: Buffer,
  overrides: Partial<AssetRow> = {},
): AssetRow {
  return {
    id,
    parentType: 'BRAND',
    parentOrgId: scope.organizationId,
    parentBrandId: scope.brandId,
    category: 'LOGO',
    isDeleted: false,
    mimeType: 'image/png',
    sha256: sha(bytes),
    sizeBytes: bytes.length,
    cloudObjectKey: keyOf(id),
    ...overrides,
  };
}
function reference(
  assetId: string,
  overrides: Partial<AssetReference> = {},
): AssetReference {
  return {
    assetId,
    evidenceIds: [],
    id: `ref-${assetId}`,
    mimeType: 'image/png',
    required: false,
    role: 'logo',
    ...overrides,
  };
}
function snapshotOf(assets: AssetReference[]): BrandIdentitySnapshotV1 {
  return {
    schemaVersion: 1,
    organizationId: scope.organizationId,
    brandId: scope.brandId,
    revisionId: 'revision-a',
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: '2026-11-15T00:00:00Z',
    contentHash: `sha256:${'0'.repeat(64)}`,
    identity: { name: 'Example Co' },
    voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
    generationRules: {
      schemaVersion: 1,
      evidence: [],
      facts: [],
      palette: [],
      typography: [],
      mandatory: [],
      avoid: [],
      examples: [],
      assets,
    },
    diagnostics: [],
  };
}
/** A prisma stand-in that applies the tenant filter the way the database would. */
function fixture(rows: AssetRow[]) {
  const findMany = vi.fn(
    async ({
      where,
    }: {
      where: Record<string, unknown> & { id: { in: string[] } };
    }) =>
      rows.filter(
        (row) =>
          where.id.in.includes(row.id) &&
          row.parentType === where.parentType &&
          row.parentOrgId === where.parentOrgId &&
          row.parentBrandId === where.parentBrandId &&
          row.category === where.category &&
          row.isDeleted === where.isDeleted,
      ),
  );
  const logger = { warn: vi.fn() };
  const service = new BrandRenderLogoStagingService(
    { asset: { findMany } } as never,
    logger as never,
  );
  return { logger, service };
}
function serve(files: Record<string, Buffer>) {
  storage.readBytes.mockImplementation(async (key: string) => {
    const found = files[key];
    if (!found) throw new Error(`missing object ${key}`);
    return found;
  });
}

beforeEach(() => {
  storage.readBytes.mockReset();
});

describe('approved brand logos', () => {
  const logo = pngBytes(1);

  it('names the raster logos the approved revision lets a video use', async () => {
    const { service } = fixture([rowFor('logo-a', logo)]);
    expect(
      await service.approvedLogos(
        scope,
        snapshotOf([reference('logo-a', { required: true })]),
        5,
      ),
    ).toEqual([{ assetId: 'logo-a', isRequired: true, mimeType: 'image/png' }]);
  });

  it('leaves out logos for other media kinds and formats the renderer cannot load', async () => {
    const { service } = fixture([
      rowFor('logo-image-only', logo),
      rowFor('logo-svg', logo, { mimeType: 'image/svg+xml' }),
      rowFor('logo-webp', logo, { mimeType: 'image/webp' }),
    ]);
    expect(
      await service.approvedLogos(
        scope,
        snapshotOf([
          reference('logo-image-only', { appliesToMediaKinds: ['image'] }),
          reference('logo-svg', { mimeType: 'image/svg+xml' }),
          reference('logo-webp', { mimeType: 'image/webp' }),
        ]),
        5,
      ),
    ).toEqual([]);
  });

  it('leaves out a logo owned by another brand or whose file differs from the approval', async () => {
    const { service, logger } = fixture([
      rowFor('logo-other', logo, { parentBrandId: 'brand-b' }),
      rowFor('logo-changed', logo, { sha256: sha(pngBytes(9)) }),
      rowFor('logo-ok', logo),
    ]);
    const approved = await service.approvedLogos(
      scope,
      snapshotOf([
        reference('logo-other'),
        reference('logo-changed', { contentHash: `sha256:${sha(logo)}` }),
        reference('logo-ok', { contentHash: `sha256:${sha(logo)}` }),
      ]),
      5,
    );
    expect(approved.map((entry) => entry.assetId)).toEqual(['logo-ok']);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('keeps required logos first and no more than the free sandbox slots', async () => {
    const { service } = fixture([
      rowFor('logo-a', logo),
      rowFor('logo-b', logo),
      rowFor('logo-c', logo),
    ]);
    const approved = await service.approvedLogos(
      scope,
      snapshotOf([
        reference('logo-a'),
        reference('logo-b'),
        reference('logo-c', { required: true }),
      ]),
      2,
    );
    expect(approved.map((entry) => entry.assetId)).toEqual([
      'logo-c',
      'logo-a',
    ]);
  });

  it('names no logo when the sandbox has no free slot or the snapshot is another brand', async () => {
    const { service } = fixture([rowFor('logo-a', logo)]);
    const snapshot = snapshotOf([reference('logo-a')]);
    expect(await service.approvedLogos(scope, snapshot, 0)).toEqual([]);
    expect(
      await service.approvedLogos(
        { ...scope, brandId: 'brand-b' },
        snapshot,
        5,
      ),
    ).toEqual([]);
  });

  it('does not name a logo that a source asset already occupies', async () => {
    const { service } = fixture([rowFor('logo-a', logo)]);
    expect(
      await service.approvedLogos(scope, snapshotOf([reference('logo-a')]), 5, [
        'logo-a',
      ]),
    ).toEqual([]);
  });
});

describe('brand logo staging', () => {
  const png = pngBytes(1);
  const jpeg = jpegBytes(2);

  it('reads the approved logo files for the renderer under their asset ids', async () => {
    const { service } = fixture([
      rowFor('logo-png', png),
      rowFor('logo-jpg', jpeg, { mimeType: 'image/jpeg' }),
    ]);
    serve({ [keyOf('logo-png')]: png, [keyOf('logo-jpg')]: jpeg });
    const staged = await service.stage(scope, [
      { assetId: 'logo-png', isRequired: true, mimeType: 'image/png' },
      { assetId: 'logo-jpg', isRequired: false, mimeType: 'image/jpeg' },
    ]);
    expect(staged).toEqual({
      assets: [
        { id: 'logo-png', mime: 'image/png', bytes: png.toString('base64') },
        { id: 'logo-jpg', mime: 'image/jpeg', bytes: jpeg.toString('base64') },
      ],
      totalBytes: png.length + jpeg.length,
    });
  });

  it('stages nothing without reading storage when no logo is approved', async () => {
    const { service } = fixture([]);
    expect(await service.stage(scope, [])).toEqual({
      assets: [],
      totalBytes: 0,
    });
    expect(storage.readBytes).not.toHaveBeenCalled();
  });

  it('refuses a file whose bytes differ from the approved hash', async () => {
    const { service } = fixture([rowFor('logo-a', png)]);
    serve({ [keyOf('logo-a')]: pngBytes(7) });
    await expect(
      service.stage(scope, [
        { assetId: 'logo-a', isRequired: true, mimeType: 'image/png' },
      ]),
    ).rejects.toThrow('visual_brand_logo_unavailable');
  });

  it('refuses a file that is not the image its type says', async () => {
    const notPng = Buffer.alloc(64, 3);
    const { service } = fixture([rowFor('logo-a', notPng)]);
    serve({ [keyOf('logo-a')]: notPng });
    await expect(
      service.stage(scope, [
        { assetId: 'logo-a', isRequired: true, mimeType: 'image/png' },
      ]),
    ).rejects.toThrow('visual_brand_logo_unavailable');
  });

  it('refuses a logo whose asset belongs to another brand', async () => {
    const { service } = fixture([
      rowFor('logo-a', png, { parentBrandId: 'brand-b' }),
    ]);
    serve({ [keyOf('logo-a')]: png });
    await expect(
      service.stage(scope, [
        { assetId: 'logo-a', isRequired: true, mimeType: 'image/png' },
      ]),
    ).rejects.toThrow('visual_brand_logo_unavailable');
  });
});
