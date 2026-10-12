import { NotFoundException } from '@api/exceptions/not-found.exception';
import { sha256Hex } from '@api/services/brand-render-evidence/brand-render-font-file.util';
import {
  type BrandFontScope,
  BrandRenderFontStagingService,
} from '@api/services/brand-render-evidence/brand-render-font-staging.service';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ readBytes: vi.fn() }));
vi.mock('@genfeedai/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/storage')>()),
  createStorageProvider: () => storage,
}));

const scope: BrandFontScope = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  userId: 'user-a',
};
type Typography =
  BrandIdentitySnapshotV1['generationRules']['typography'][number];
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

function fontBytes(seed: number, header = 'wOF2', size = 512): Buffer {
  const bytes = Buffer.alloc(size, seed);
  bytes.write(header, 0, 'ascii');
  return bytes;
}
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
    category: 'FONT',
    isDeleted: false,
    mimeType: 'font/woff2',
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.length,
    cloudObjectKey: `brand-fonts/${scope.organizationId}/${scope.brandId}/${id}/file.woff2`,
    ...overrides,
  };
}
function reference(
  id: string,
  assetId: string,
  bytes: Buffer,
  overrides: Partial<AssetReference> = {},
): AssetReference {
  return {
    assetId,
    contentHash: `sha256:${sha256Hex(bytes)}`,
    evidenceIds: [],
    id,
    mimeType: 'font/woff2',
    required: false,
    role: 'font',
    ...overrides,
  };
}
function rule(
  id: string,
  reference: string,
  overrides: Partial<Typography> = {},
): Typography {
  return {
    availability: 'owned_asset',
    evidenceIds: [],
    family: 'Brand Display',
    fontAssetReferenceId: reference,
    id,
    required: true,
    role: 'heading',
    style: 'normal',
    weight: 700,
    ...overrides,
  };
}
function snapshotOf(
  assets: AssetReference[],
  typography: Typography[],
  overrides: Partial<BrandIdentitySnapshotV1> = {},
): BrandIdentitySnapshotV1 {
  return {
    schemaVersion: 1,
    organizationId: scope.organizationId,
    brandId: scope.brandId,
    revisionId: 'revision-a',
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: '2026-10-12T00:00:00Z',
    contentHash: `sha256:${'0'.repeat(64)}`,
    identity: { name: 'Example Co' },
    voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
    generationRules: {
      schemaVersion: 1,
      evidence: [],
      facts: [],
      palette: [],
      typography,
      mandatory: [],
      avoid: [],
      examples: [],
      assets,
    },
    diagnostics: [],
    ...overrides,
  };
}

/** A prisma stand-in that applies the tenant filter the way the database would. */
function fixture(rows: AssetRow[], snapshot: BrandIdentitySnapshotV1) {
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
  const preview = vi.fn().mockResolvedValue(snapshot);
  const logger = { warn: vi.fn() };
  const service = new BrandRenderFontStagingService(
    { asset: { findMany } } as never,
    { preview } as never,
    logger as never,
  );
  return { findMany, logger, preview, service };
}
function serve(files: Record<string, Buffer>) {
  storage.readBytes.mockImplementation(async (key: string) => {
    const found = files[key];
    if (!found) throw new Error('missing object');
    return found;
  });
}

const regular = fontBytes(1);
const bold = fontBytes(2);
const keyOf = (id: string) =>
  `brand-fonts/${scope.organizationId}/${scope.brandId}/${id}/file.woff2`;

beforeEach(() => storage.readBytes.mockReset());

describe('approved brand fonts', () => {
  it('stages the fonts the approved revision owns, with the faces to declare', async () => {
    const { service, preview, findMany } = fixture(
      [rowFor('asset-bold', bold), rowFor('asset-regular', regular)],
      snapshotOf(
        [
          reference('ref-bold', 'asset-bold', bold),
          reference('ref-regular', 'asset-regular', regular),
        ],
        [
          rule('heading', 'ref-bold'),
          rule('body', 'ref-regular', {
            family: 'Brand Text',
            role: 'body',
            weight: 400,
          }),
        ],
      ),
    );
    serve({
      [keyOf('asset-bold')]: bold,
      [keyOf('asset-regular')]: regular,
    });

    const staged = await service.stage(scope);

    expect(preview).toHaveBeenCalledWith({
      actorId: 'user-a',
      organizationId: 'org-a',
      brandId: 'brand-a',
    });
    expect(staged.assets).toEqual([
      {
        id: 'asset-bold',
        mime: 'font/woff2',
        bytes: bold.toString('base64'),
        faces: [{ family: 'Brand Display', style: 'normal', weight: 700 }],
      },
      {
        id: 'asset-regular',
        mime: 'font/woff2',
        bytes: regular.toString('base64'),
        faces: [{ family: 'Brand Text', style: 'normal', weight: 400 }],
      },
    ]);
    expect(staged.totalBytes).toBe(bold.length + regular.length);
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      parentType: 'BRAND',
      parentOrgId: 'org-a',
      parentBrandId: 'brand-a',
      category: 'FONT',
      isDeleted: false,
    });
  });

  it('declares every face a file owns once, and merges rules that share a file', async () => {
    const { service } = fixture(
      [rowFor('asset-regular', regular)],
      snapshotOf(
        [
          reference('ref-a', 'asset-regular', regular),
          reference('ref-b', 'asset-regular', regular),
        ],
        [
          rule('heading', 'ref-a'),
          rule('heading-again', 'ref-b'),
          rule('caption', 'ref-b', { weight: 300 }),
        ],
      ),
    );
    const fonts = await service.approvedFonts(scope);
    expect(fonts).toHaveLength(1);
    expect(fonts[0].faces).toEqual([
      { family: 'Brand Display', style: 'normal', weight: 700 },
      { family: 'Brand Display', style: 'normal', weight: 300 },
    ]);
  });

  it('does not stage a font file no typography rule owns, or one a rule cannot use', async () => {
    const { service, findMany } = fixture(
      [rowFor('asset-regular', regular)],
      snapshotOf(
        [reference('ref-a', 'asset-regular', regular)],
        [
          rule('runtime', 'ref-a', {
            availability: 'verified_runtime',
            fontAssetReferenceId: undefined,
            runtimeFontId: 'inter',
          }),
          rule('hostile', 'ref-a', { family: 'a;}</style>' }),
        ],
      ),
    );
    expect(await service.stage(scope)).toEqual({ assets: [], totalBytes: 0 });
    expect(findMany).not.toHaveBeenCalled();
    expect(storage.readBytes).not.toHaveBeenCalled();
  });

  it('stages nothing for a brand without an approved identity', async () => {
    const { service, preview, findMany } = fixture([], snapshotOf([], []));
    preview.mockRejectedValue(
      new ConflictException('brand_identity_unavailable'),
    );
    expect(await service.stage(scope)).toEqual({ assets: [], totalBytes: 0 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('logs and renders without fonts when the identity cannot be resolved for another reason', async () => {
    const { service, preview, logger } = fixture([], snapshotOf([], []));
    preview.mockRejectedValue(new Error('database unavailable'));
    expect(await service.approvedFonts(scope)).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('stages at most the render limit, in a stable order', async () => {
    const files = Array.from({ length: 10 }, (_, index) => ({
      id: `asset-${String(9 - index)}`,
      bytes: fontBytes(index + 1),
    }));
    const { service, logger } = fixture(
      files.map((file) => rowFor(file.id, file.bytes)),
      snapshotOf(
        files.map((file) => reference(`ref-${file.id}`, file.id, file.bytes)),
        files.map((file) =>
          rule(`rule-${file.id}`, `ref-${file.id}`, { family: file.id }),
        ),
      ),
    );
    const fonts = await service.approvedFonts(scope);
    expect(fonts.map((font) => font.assetId)).toEqual(
      Array.from({ length: 8 }, (_, index) => `asset-${index}`),
    );
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('tenant isolation', () => {
  it('denies a caller who cannot access the brand, before any file is read', async () => {
    for (const denied of [
      new ForbiddenException(),
      new NotFoundException('Brand'),
    ]) {
      const { service, preview, findMany } = fixture(
        [rowFor('asset-regular', regular)],
        snapshotOf([], []),
      );
      preview.mockRejectedValue(denied);
      await expect(service.stage(scope)).rejects.toBe(denied);
      await expect(service.approvedFonts(scope)).rejects.toBe(denied);
      expect(findMany).not.toHaveBeenCalled();
      expect(storage.readBytes).not.toHaveBeenCalled();
    }
  });

  it('never reads another organization or brand font a revision names', async () => {
    for (const foreign of [
      { parentOrgId: 'org-b' },
      { parentBrandId: 'brand-b' },
      { parentType: 'ORGANIZATION' },
      { category: 'LOGO' },
      { isDeleted: true },
    ]) {
      const { service } = fixture(
        [rowFor('asset-regular', regular, foreign)],
        snapshotOf(
          [reference('ref-a', 'asset-regular', regular)],
          [rule('heading', 'ref-a')],
        ),
      );
      serve({ [keyOf('asset-regular')]: regular });
      await expect(service.stage(scope)).rejects.toThrow(
        'visual_brand_font_unavailable',
      );
      expect(storage.readBytes).not.toHaveBeenCalled();
    }
  });

  it('refuses an identity that belongs to another tenant', async () => {
    for (const mismatch of [
      { organizationId: 'org-b' },
      { brandId: 'brand-b' },
    ]) {
      const { service } = fixture(
        [rowFor('asset-regular', regular)],
        snapshotOf(
          [reference('ref-a', 'asset-regular', regular)],
          [rule('heading', 'ref-a')],
          mismatch,
        ),
      );
      await expect(service.stage(scope)).rejects.toThrow(
        'visual_brand_font_unavailable',
      );
      expect(storage.readBytes).not.toHaveBeenCalled();
    }
  });
});

describe('rejected font files', () => {
  async function stageWith(
    row: Partial<AssetRow>,
    served: Buffer | null = regular,
    approved: Partial<AssetReference> = {},
  ) {
    const { service } = fixture(
      [rowFor('asset-regular', regular, row)],
      snapshotOf(
        [reference('ref-a', 'asset-regular', regular, approved)],
        [rule('heading', 'ref-a')],
      ),
    );
    serve(
      served ? { [row.cloudObjectKey ?? keyOf('asset-regular')]: served } : {},
    );
    return service.stage(scope);
  }

  it('rejects bytes whose hash differs from the approved one', async () => {
    const tampered = Buffer.from(regular);
    tampered[200] ^= 1;
    await expect(stageWith({}, tampered)).rejects.toThrow(
      'visual_brand_font_hash_mismatch',
    );
  });

  it('rejects a stored record whose hash differs from the approved one', async () => {
    await expect(
      stageWith({ sha256: sha256Hex(bold) }, regular),
    ).rejects.toThrow('visual_brand_font_unavailable');
    await expect(
      stageWith({}, regular, { contentHash: `sha256:${sha256Hex(bold)}` }),
    ).rejects.toThrow('visual_brand_font_unavailable');
  });

  it('rejects a format the renderer does not load', async () => {
    await expect(
      stageWith({ mimeType: 'font/eot' }, regular, { mimeType: 'font/eot' }),
    ).rejects.toThrow('visual_brand_font_unavailable');
    await expect(
      stageWith({ mimeType: 'application/octet-stream' }),
    ).rejects.toThrow('visual_brand_font_unavailable');
  });

  it('rejects a file that is not the format it is recorded as', async () => {
    const text = Buffer.concat([
      Buffer.from('<svg xmlns="x">'),
      Buffer.alloc(256, 32),
    ]);
    await expect(
      stageWith({ sha256: sha256Hex(text), sizeBytes: text.length }, text, {
        contentHash: `sha256:${sha256Hex(text)}`,
      }),
    ).rejects.toThrow('visual_brand_font_signature_mismatch');
  });

  it('rejects an oversized or undersized record without reading the file', async () => {
    for (const sizeBytes of [4 * 1024 * 1024 + 1, 47, null]) {
      storage.readBytes.mockClear();
      await expect(stageWith({ sizeBytes })).rejects.toThrow(
        'visual_brand_font_unavailable',
      );
      expect(storage.readBytes).not.toHaveBeenCalled();
    }
  });

  it('rejects a file larger than its record says', async () => {
    const larger = fontBytes(1, 'wOF2', 1024);
    await expect(stageWith({}, larger, {})).rejects.toThrow(
      'visual_brand_font_size_invalid',
    );
  });

  it('rejects a font that cannot be read, or whose object key is unsafe', async () => {
    await expect(stageWith({}, null)).rejects.toThrow(
      'visual_brand_font_unavailable',
    );
    await expect(
      stageWith({ cloudObjectKey: '../../etc/passwd' }),
    ).rejects.toThrow('visual_brand_font_unavailable');
    await expect(stageWith({ cloudObjectKey: null })).rejects.toThrow(
      'visual_brand_font_unavailable',
    );
  });

  it('is an unprocessable request, never a server error', async () => {
    await expect(stageWith({ sha256: null })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});
