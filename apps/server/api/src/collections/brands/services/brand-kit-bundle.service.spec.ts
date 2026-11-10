import { createHash } from 'node:crypto';
import type { BrandKitSlotImageWrite } from '@api/collections/brands/interfaces/brand-kit-bundle.interface';
import type {
  BrandFontActor,
  BrandFontAssetsService,
} from '@api/collections/brands/services/brand-font-assets.service';
import type { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandKitBundleService } from '@api/collections/brands/services/brand-kit-bundle.service';
import {
  packBrandKitBundle,
  unpackBrandKitBundle,
} from '@api/collections/brands/utils/brand-kit-bundle.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BrandKitSlot, FontFamily } from '@genfeedai/contracts';
import type { BrandKitBundleManifest } from '@genfeedai/contracts/api-types/contracts/brand-kit-bundle.contract';
import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => new Map<string, Buffer>());

vi.mock('@genfeedai/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/storage')>()),
  createStorageProvider: () => ({
    readBytes: async (key: string) => {
      const bytes = stored.get(key);
      if (!bytes) throw new Error('missing');
      return bytes;
    },
  }),
}));

const ACTOR: BrandFontActor = {
  actorId: 'user-1',
  brandId: 'brand-1',
  organizationId: 'org-1',
};

const FONT_BYTES = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(60, 1)]);
const FONT_SHA = createHash('sha256').update(FONT_BYTES).digest('hex');

let png: Buffer;
let jpeg: Buffer;

beforeAll(async () => {
  const image = sharp({
    create: { background: '#FF6600', channels: 3, height: 4, width: 4 },
  });
  png = await image.clone().png().toBuffer();
  jpeg = await image.clone().jpeg().toBuffer();
});

interface Harness {
  service: BrandKitBundleService;
  brandWrites: unknown[];
  slotWrites: BrandKitSlotImageWrite[];
  fontUploads: string[];
}

function harness(fonts: Array<{ id: string; sha256: string }>): Harness {
  const brandWrites: unknown[] = [];
  const slotWrites: BrandKitSlotImageWrite[] = [];
  const fontUploads: string[] = [];
  const brand = {
    backgroundColor: 'transparent',
    colorPalette: [{ hex: '#00AA00', name: 'Leaf' }],
    fontFamily: FontFamily.INTER_BOLD,
    fontRoles: {
      caption: { fontFamily: FontFamily.POPPINS_BOLD, source: 'preset' },
      heading: {
        assetId: 'font-1',
        contentHash: `sha256:${FONT_SHA}`,
        family: 'Acme Display',
        source: 'upload',
        style: 'normal',
        weight: 700,
      },
    },
    label: 'Acme',
    primaryColor: '#FF6600',
    secondaryColor: '#FFFFFF',
    slug: 'Acme Co',
  };
  const prisma = {
    asset: {
      findMany: async () => [
        { cloudObjectKey: null, id: 'logo-1' },
        { cloudObjectKey: 'banners/custom-key', id: 'banner-1' },
      ],
    },
    brand: {
      findFirst: async () => brand,
      updateMany: async ({ data }: { data: unknown }) => {
        brandWrites.push(data);
        return { count: 1 };
      },
    },
  } as unknown as PrismaService;
  const kitAssets = {
    invalidateBrandAssetCaches: async () => undefined,
    replaceSlotImage: async (write: BrandKitSlotImageWrite) => {
      slotWrites.push(write);
      return `new-${write.slot}`;
    },
    resolveBrandKitAssets: async () => ({
      banners: [
        {
          id: 'banner-1',
          role: 'banner',
          slot: BrandKitSlot.X_HEADER,
          url: 'https://cdn.test/banners/custom-key',
        },
      ],
      logos: [
        {
          id: 'logo-1',
          mimeType: 'image/png',
          role: 'logo',
          slot: BrandKitSlot.LOGO_PRIMARY,
          url: 'https://cdn.test/logos/logo-1',
        },
      ],
      references: [],
    }),
  } as unknown as BrandKitAssetsService;
  const fontService = {
    list: async () => ({
      docs: fonts.map((font) => ({
        displayName: 'Acme Display',
        id: font.id,
        originalFileName: 'acme.woff2',
        sha256: font.sha256,
      })),
      hasMore: false,
      limit: 20,
      nextCursor: null,
    }),
    readFile: async () => FONT_BYTES,
    upload: async (
      _actor: BrandFontActor,
      input: { file: Express.Multer.File },
    ) => {
      fontUploads.push(input.file.originalname);
      return {
        asset: {
          id: 'uploaded-font',
          sha256: createHash('sha256').update(input.file.buffer).digest('hex'),
        },
        created: true,
      };
    },
  } as unknown as BrandFontAssetsService;
  return {
    brandWrites,
    fontUploads,
    service: new BrandKitBundleService(prisma, kitAssets, fontService),
    slotWrites,
  };
}

const IMPORT_MANIFEST: BrandKitBundleManifest = {
  banners: [
    {
      file: 'banners/x_header.png',
      mimeType: 'image/png',
      slot: BrandKitSlot.X_HEADER,
    },
  ],
  brand: { label: 'Source brand' },
  colors: { primary: '#123456' },
  exportedAt: '2026-11-09T10:00:00.000Z',
  fontRoles: {
    heading: {
      family: 'Acme Display',
      file: 'fonts/font-1.woff2',
      source: 'upload',
      style: 'italic',
      weight: 800,
    },
  },
  fonts: [{ file: 'fonts/font-1.woff2', name: 'Acme Display' }],
  format: 'genfeed.brand-kit',
  logos: [
    {
      file: 'logos/logo_primary.png',
      mimeType: 'image/png',
      slot: BrandKitSlot.LOGO_PRIMARY,
    },
    {
      file: 'logos/logo_icon.png',
      mimeType: 'image/png',
      slot: BrandKitSlot.LOGO_ICON,
    },
  ],
  palette: [{ hex: '#123456', name: 'Ink' }],
  version: 1,
};

describe('BrandKitBundleService', () => {
  beforeEach(() => {
    stored.clear();
    stored.set('logos/logo-1', png);
    stored.set('banners/custom-key', jpeg);
  });

  it('exports every kit file with a manifest that names them', async () => {
    const { service } = harness([{ id: 'font-1', sha256: FONT_SHA }]);

    const download = await service.exportBundle(ACTOR);
    const { manifest, files } = unpackBrandKitBundle(download.bytes);

    expect(download.fileName).toBe('acme-co-brand-kit.zip');
    expect(manifest).toMatchObject({
      banners: [
        {
          file: 'banners/x_header.jpg',
          mimeType: 'image/jpeg',
          slot: BrandKitSlot.X_HEADER,
        },
      ],
      colors: {
        background: 'transparent',
        primary: '#FF6600',
        secondary: '#FFFFFF',
      },
      fontFamily: FontFamily.INTER_BOLD,
      fontRoles: {
        caption: { fontFamily: FontFamily.POPPINS_BOLD, source: 'preset' },
        heading: {
          family: 'Acme Display',
          file: 'fonts/font-1.woff2',
          source: 'upload',
          style: 'normal',
          weight: 700,
        },
      },
      fonts: [{ file: 'fonts/font-1.woff2', name: 'Acme Display' }],
      logos: [
        {
          file: 'logos/logo_primary.png',
          mimeType: 'image/png',
          slot: BrandKitSlot.LOGO_PRIMARY,
        },
      ],
      palette: [{ hex: '#00AA00', name: 'Leaf' }],
    });
    expect([...files.keys()].sort()).toEqual([
      'banners/x_header.jpg',
      'fonts/font-1.woff2',
      'logos/logo_primary.png',
    ]);
  });

  it('leaves an unreadable image out of the ZIP and the manifest', async () => {
    stored.delete('banners/custom-key');
    const { service } = harness([]);

    const { manifest, files } = unpackBrandKitBundle(
      (await service.exportBundle(ACTOR)).bytes,
    );

    expect(manifest.banners).toEqual([]);
    expect(manifest.fontRoles).toEqual({
      caption: { fontFamily: FontFamily.POPPINS_BOLD, source: 'preset' },
    });
    expect([...files.keys()]).toEqual(['logos/logo_primary.png']);
  });

  it('imports images into their slots and points font roles at the new font', async () => {
    const { service, slotWrites, brandWrites, fontUploads } = harness([]);
    const zip = packBrandKitBundle(
      IMPORT_MANIFEST,
      new Map([
        ['logos/logo_primary.png', png],
        ['logos/logo_icon.png', Buffer.from('not an image')],
        ['banners/x_header.png', jpeg],
        ['fonts/font-1.woff2', FONT_BYTES],
      ]),
    );

    const result = await service.importBundle(ACTOR, zip);

    expect(result).toEqual({
      banners: [BrandKitSlot.X_HEADER],
      fontCount: 1,
      hasColors: true,
      hasFontRoles: true,
      hasPalette: true,
      logos: [BrandKitSlot.LOGO_PRIMARY],
      skipped: [{ file: 'logos/logo_icon.png', reason: 'unsupported_image' }],
    });
    expect(
      slotWrites.map(({ slot, mimeType, brandId }) => ({
        brandId,
        mimeType,
        slot,
      })),
    ).toEqual([
      {
        brandId: 'brand-1',
        mimeType: 'image/png',
        slot: BrandKitSlot.LOGO_PRIMARY,
      },
      {
        brandId: 'brand-1',
        mimeType: 'image/jpeg',
        slot: BrandKitSlot.X_HEADER,
      },
    ]);
    expect(fontUploads).toEqual(['font-1.woff2']);
    expect(brandWrites).toEqual([
      {
        colorPalette: [{ hex: '#123456', name: 'Ink' }],
        fontRoles: {
          heading: {
            assetId: 'uploaded-font',
            contentHash: `sha256:${FONT_SHA}`,
            family: 'Acme Display',
            source: 'upload',
            style: 'italic',
            weight: 800,
          },
        },
        primaryColor: '#123456',
      },
    ]);
  });

  it('reuses a font the brand already has instead of uploading it again', async () => {
    const { service, fontUploads, brandWrites } = harness([
      { id: 'existing-font', sha256: FONT_SHA },
    ]);
    const zip = packBrandKitBundle(
      { ...IMPORT_MANIFEST, banners: [], logos: [] },
      new Map([['fonts/font-1.woff2', FONT_BYTES]]),
    );

    await service.importBundle(ACTOR, zip);

    expect(fontUploads).toEqual([]);
    expect(brandWrites).toMatchObject([
      { fontRoles: { heading: { assetId: 'existing-font' } } },
    ]);
  });
});
