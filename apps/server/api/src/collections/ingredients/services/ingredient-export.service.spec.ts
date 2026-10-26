const deployment = vi.hoisted(() => ({ selfHosted: false }));
vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();
  return { ...actual, isSelfHostedDeployment: () => deployment.selfHosted };
});

import { IngredientExportService } from '@api/collections/ingredients/services/ingredient-export.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigService } from '@libs/config/config.service';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

describe('IngredientExportService', () => {
  const ingredient = {
    id: 'image-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    category: 'IMAGE',
    s3Key: 'images/image-1',
  };
  const brand = {
    id: 'brand-1',
    watermarkText: 'Preview',
    watermarkLogoId: null,
    watermarkOpacity: 0.35,
    watermarkPosition: 'bottom-right',
  };
  const prisma = {
    ingredient: { findFirst: vi.fn() },
    brand: { findFirst: vi.fn() },
    asset: { findFirst: vi.fn() },
  };
  const files = { watermarkExport: vi.fn() };
  const config = {
    cdnUrl: 'https://cdn.example',
    get: vi.fn(),
  };
  const mediaUrls = { buildUrlFromAbsolute: vi.fn() };
  let service: IngredientExportService;

  beforeEach(async () => {
    vi.resetAllMocks();
    deployment.selfHosted = false;
    config.get.mockReturnValue('https://media.example');
    mediaUrls.buildUrlFromAbsolute.mockImplementation((url: string) => url);
    prisma.ingredient.findFirst.mockResolvedValue(ingredient);
    prisma.brand.findFirst.mockResolvedValue(brand);
    files.watermarkExport.mockResolvedValue({
      url: 'https://cdn.example/export.png',
      storageKey: 'exports/preview.png',
    });
    const module = await Test.createTestingModule({
      providers: [
        IngredientExportService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: config,
        },
        { provide: FilesClientService, useValue: files },
        { provide: MediaUrlService, useValue: mediaUrls },
      ],
    }).compile();
    service = module.get(IngredientExportService);
  });

  it('scopes source and brand and preserves the source key', async () => {
    const result = await service.export('image-1', 'org-1');
    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith({
      where: { id: 'image-1', organizationId: 'org-1', isDeleted: false },
      include: { metadata: true },
    });
    expect(prisma.brand.findFirst).toHaveBeenCalledWith({
      where: { id: 'brand-1', organizationId: 'org-1', isDeleted: false },
    });
    expect(files.watermarkExport).toHaveBeenCalledWith({
      cacheKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      category: 'images',
      storageKey: 'images/image-1',
      layers: [
        {
          text: 'Preview',
          logoStorageKey: undefined,
          opacity: 0.35,
          position: 'bottom-right',
        },
      ],
    });
    expect(result.filename).toBe('image-1-watermarked.png');
  });

  it.each([
    ['IMAGE_EDIT', 'images', 'png'],
    ['VIDEO_EDIT', 'videos', 'mp4'],
  ])(
    'exports %s through the matching renderer',
    async (category, rendererCategory, extension) => {
      prisma.ingredient.findFirst.mockResolvedValue({
        ...ingredient,
        category,
      });
      const result = await service.export('image-1', 'org-1');
      expect(files.watermarkExport).toHaveBeenCalledWith(
        expect.objectContaining({ category: rendererCategory }),
      );
      expect(result.filename).toBe(`image-1-watermarked.${extension}`);
    },
  );

  it('normalizes cloud preview keys at the CDN root', async () => {
    files.watermarkExport.mockResolvedValue({
      url: '/local/exports/preview.png',
      storageKey: 'exports/preview.png',
    });
    const result = await service.export('image-1', 'org-1');
    expect(result.url).toBe('https://cdn.example/exports/preview.png');
  });

  it('signs the cloud preview URL before returning it', async () => {
    files.watermarkExport.mockResolvedValue({
      url: '/local/exports/preview.png',
      storageKey: 'exports/preview.png',
    });
    mediaUrls.buildUrlFromAbsolute.mockImplementation(
      (url: string) => `${url}?Signature=signed`,
    );

    const result = await service.export('image-1', 'org-1');

    expect(mediaUrls.buildUrlFromAbsolute).toHaveBeenCalledWith(
      'https://cdn.example/exports/preview.png',
    );
    expect(result.url).toBe(
      'https://cdn.example/exports/preview.png?Signature=signed',
    );
  });

  it('preserves local storage routing at the explicit self-host public origin', async () => {
    deployment.selfHosted = true;
    files.watermarkExport.mockResolvedValue({
      url: '/local/exports/preview.png',
      storageKey: 'exports/preview.png',
    });
    const result = await service.export('image-1', 'org-1');
    expect(result.url).toBe('https://media.example/local/exports/preview.png');
  });

  it('rejects local preview URLs without an explicit browser origin', async () => {
    deployment.selfHosted = true;
    config.get.mockReturnValue(undefined);
    files.watermarkExport.mockResolvedValue({
      url: '/local/exports/preview.png',
      storageKey: 'exports/preview.png',
    });
    await expect(service.export('image-1', 'org-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects missing original storage without guessing a key', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      ...ingredient,
      s3Key: null,
    });
    await expect(service.export('image-1', 'org-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(files.watermarkExport).not.toHaveBeenCalled();
  });

  it('rejects inaccessible sources', async () => {
    prisma.ingredient.findFirst.mockResolvedValue(null);
    await expect(service.export('image-1', 'other-org')).rejects.toThrow(
      NotFoundException,
    );
    expect(files.watermarkExport).not.toHaveBeenCalled();
  });

  it('rejects deleted or foreign brand logos', async () => {
    prisma.brand.findFirst.mockResolvedValue({
      ...brand,
      watermarkLogoId: 'foreign-logo',
    });
    prisma.asset.findFirst.mockResolvedValue(null);
    await expect(service.export('image-1', 'org-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.asset.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-logo',
        parentOrgId: 'org-1',
        parentBrandId: 'brand-1',
        parentType: 'BRAND',
        isDeleted: false,
      },
    });
    expect(files.watermarkExport).not.toHaveBeenCalled();
  });

  it('rejects brand logos without an image MIME type', async () => {
    prisma.brand.findFirst.mockResolvedValue({
      ...brand,
      watermarkLogoId: 'logo-1',
    });
    prisma.asset.findFirst.mockResolvedValue({
      id: 'logo-1',
      mimeType: null,
      category: 'LOGO',
      cloudObjectKey: 'logos/logo-1',
    });
    await expect(service.export('image-1', 'org-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(files.watermarkExport).not.toHaveBeenCalled();
  });

  it.each(['IMAGE', 'VIDEO', 'IMAGE_EDIT', 'VIDEO_EDIT'])(
    'never adds a platform watermark: a %s needs the brand text or logo',
    async (category) => {
      prisma.ingredient.findFirst.mockResolvedValue({
        ...ingredient,
        category,
      });
      prisma.brand.findFirst.mockResolvedValue({
        ...brand,
        watermarkText: ' ',
      });
      await expect(service.export('image-1', 'org-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(files.watermarkExport).not.toHaveBeenCalled();
    },
  );

  it('addresses the stored copy by source and watermark settings', async () => {
    const keyFor = async (overrides: Record<string, unknown>) => {
      files.watermarkExport.mockClear();
      prisma.brand.findFirst.mockResolvedValue({ ...brand, ...overrides });
      await service.export('image-1', 'org-1');
      return files.watermarkExport.mock.calls[0][0].cacheKey as string;
    };
    const base = await keyFor({});
    expect(await keyFor({})).toBe(base);
    expect(await keyFor({ watermarkText: 'Other' })).not.toBe(base);
    expect(await keyFor({ watermarkOpacity: 0.5 })).not.toBe(base);
    prisma.ingredient.findFirst.mockResolvedValue({
      ...ingredient,
      version: 2,
    });
    expect(await keyFor({})).not.toBe(base);
  });

  it.each([Number.NaN, 0, 1.1])(
    'rejects invalid brand opacity %s',
    async (watermarkOpacity) => {
      prisma.brand.findFirst.mockResolvedValue({ ...brand, watermarkOpacity });
      await expect(service.export('image-1', 'org-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(files.watermarkExport).not.toHaveBeenCalled();
    },
  );
});
