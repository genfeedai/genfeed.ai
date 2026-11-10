import type { BrandFontActor } from '@api/collections/brands/services/brand-font-assets.service';
import type { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandLogoDownloadService } from '@api/collections/brands/services/brand-logo-download.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BrandKitSlot } from '@genfeedai/contracts';
import { HttpException } from '@nestjs/common';
import sharp from 'sharp';

const { objects } = vi.hoisted(() => ({ objects: new Map<string, Buffer>() }));
vi.mock('@genfeedai/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/storage')>()),
  createStorageProvider: () => ({
    readBytes: async (key: string) => {
      const bytes = objects.get(key);
      if (!bytes) throw new Error('missing');
      return bytes;
    },
  }),
}));

const actor: BrandFontActor = {
  actorId: 'user-1',
  brandId: 'brand-1',
  organizationId: 'org-1',
};
const VECTOR_KEY = 'brand-vectors/org-1/brand-1/logo-svg/v.svg';
const VECTOR = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#0a84ff"/></svg>',
);

describe('BrandLogoDownloadService', () => {
  const rows = new Map<
    string,
    {
      cloudObjectKey: string | null;
      id: string;
      vectorObjectKey: string | null;
    }
  >();
  const prisma = {
    asset: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        rows.get(where.id) ?? null,
    },
    brand: { findFirst: async () => ({ slug: 'Acme Co' }) },
  };
  const brandKitAssets = {
    resolveBrandKitAssets: async () => ({
      logos: [
        { id: 'logo-svg', role: 'logo', slot: BrandKitSlot.LOGO_PRIMARY },
        { id: 'logo-png', role: 'logo', slot: BrandKitSlot.LOGO_ICON },
      ],
      references: [],
    }),
  };
  const service = new BrandLogoDownloadService(
    prisma as unknown as PrismaService,
    brandKitAssets as unknown as BrandKitAssetsService,
  );

  beforeEach(async () => {
    objects.clear();
    rows.clear();
    objects.set(VECTOR_KEY, VECTOR);
    objects.set(
      'logos/logo-png',
      await sharp({
        create: { background: '#000', channels: 4, height: 100, width: 200 },
      })
        .png()
        .toBuffer(),
    );
    rows.set('logo-svg', {
      cloudObjectKey: null,
      id: 'logo-svg',
      vectorObjectKey: VECTOR_KEY,
    });
    rows.set('logo-png', {
      cloudObjectKey: null,
      id: 'logo-png',
      vectorObjectKey: null,
    });
  });

  it('renders a vector logo to exactly the chosen size', async () => {
    const download = await service.download(
      actor,
      BrandKitSlot.LOGO_PRIMARY,
      'png',
      2048,
    );

    expect(download.contentType).toBe('image/png');
    expect(download.fileName).toBe('acme-co-logo-primary-2048.png');
    await expect(sharp(download.bytes).metadata()).resolves.toMatchObject({
      format: 'png',
      height: 1024,
      width: 2048,
    });
  });

  it('serves the SVG original sanitized again', async () => {
    objects.set(
      VECTOR_KEY,
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" onload="alert(1)"><rect width="40" height="20"/></svg>',
      ),
    );

    const download = await service.download(
      actor,
      BrandKitSlot.LOGO_PRIMARY,
      'svg',
      1024,
    );

    expect(download).toEqual({
      bytes: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="40" height="20"><rect width="40" height="20"></rect></svg>',
      ),
      contentType: 'image/svg+xml',
      fileName: 'acme-co-logo-primary.svg',
    });
  });

  it.each([
    ['shrinks a raster logo to the chosen size', 100, 100, 50],
    ['never enlarges a raster logo', 4096, 200, 100],
  ])('%s', async (_case, size, width, height) => {
    const download = await service.download(
      actor,
      BrandKitSlot.LOGO_ICON,
      'webp',
      size,
    );

    expect(download.fileName).toBe(`acme-co-logo-icon-${width}.webp`);
    await expect(sharp(download.bytes).metadata()).resolves.toMatchObject({
      format: 'webp',
      height,
      width,
    });
  });

  it.each([
    ['an SVG of a logo uploaded as a raster', BrandKitSlot.LOGO_ICON, 404],
    ['an empty logo slot', BrandKitSlot.LOGO_DARK, 404],
  ])('refuses %s', async (_case, slot, status) => {
    const error = await service
      .download(actor, slot, 'svg', 1024)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(status);
  });
});
