const deployment = vi.hoisted(() => ({ selfHosted: false }));
vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();
  return { ...actual, isSelfHostedDeployment: () => deployment.selfHosted };
});

import { IngredientExportService } from '@api/collections/ingredients/services/ingredient-export.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigService } from '@libs/config/config.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
  const config = { cdnUrl: 'https://cdn.example', get: vi.fn() };
  let service: IngredientExportService;

  beforeEach(async () => {
    vi.resetAllMocks();
    deployment.selfHosted = false;
    config.get.mockReturnValue('https://media.example');
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
      ],
    }).compile();
    service = module.get(IngredientExportService);
  });

  it('never exposes an original through the preview endpoint', async () => {
    await expect(service.export('image-1', 'org-1', false)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.ingredient.findFirst).not.toHaveBeenCalled();
  });

  it('scopes source and brand and preserves the source key', async () => {
    const result = await service.export('image-1', 'org-1', true);
    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith({
      where: { id: 'image-1', organizationId: 'org-1', isDeleted: false },
      include: { metadata: true },
    });
    expect(prisma.brand.findFirst).toHaveBeenCalledWith({
      where: { id: 'brand-1', organizationId: 'org-1', isDeleted: false },
    });
    expect(files.watermarkExport).toHaveBeenCalledWith({
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
      const result = await service.export('image-1', 'org-1', true);
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
    const result = await service.export('image-1', 'org-1', true);
    expect(result.url).toBe('https://cdn.example/exports/preview.png');
  });

  it('preserves local storage routing at the explicit self-host public origin', async () => {
    deployment.selfHosted = true;
    files.watermarkExport.mockResolvedValue({
      url: '/local/exports/preview.png',
      storageKey: 'exports/preview.png',
    });
    const result = await service.export('image-1', 'org-1', true);
    expect(result.url).toBe('https://media.example/local/exports/preview.png');
  });

  it('rejects local preview URLs without an explicit browser origin', async () => {
    deployment.selfHosted = true;
    config.get.mockReturnValue(undefined);
    files.watermarkExport.mockResolvedValue({
      url: '/local/exports/preview.png',
      storageKey: 'exports/preview.png',
    });
    await expect(service.export('image-1', 'org-1', true)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects missing original storage without guessing a key', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      ...ingredient,
      s3Key: null,
    });
    await expect(service.export('image-1', 'org-1', true)).rejects.toThrow(
      BadRequestException,
    );
    expect(files.watermarkExport).not.toHaveBeenCalled();
  });

  it('rejects inaccessible sources', async () => {
    prisma.ingredient.findFirst.mockResolvedValue(null);
    await expect(service.export('image-1', 'other-org', true)).rejects.toThrow(
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
    await expect(service.export('image-1', 'org-1', true)).rejects.toThrow(
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

  it('rejects missing watermark configuration', async () => {
    prisma.brand.findFirst.mockResolvedValue({ ...brand, watermarkText: ' ' });
    await expect(service.export('image-1', 'org-1', true)).rejects.toThrow(
      BadRequestException,
    );
    expect(files.watermarkExport).not.toHaveBeenCalled();
  });
});
