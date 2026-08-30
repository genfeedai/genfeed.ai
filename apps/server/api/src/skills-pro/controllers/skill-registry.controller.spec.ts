import { SkillRegistryController } from '@api/skills-pro/controllers/skill-registry.controller';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { isPublicRoute } from '@libs/decorators/public.decorator';
import type { ExecutionContext } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('SkillRegistryController', () => {
  let controller: SkillRegistryController;
  let skillRegistryService: {
    getMetadataRegistry: ReturnType<typeof vi.fn>;
    getStorefrontCatalog: ReturnType<typeof vi.fn>;
  };

  const mockRequest = {
    originalUrl: '/v1/skills-pro/registry',
  } as Request;

  const mockRegistry = {
    bundlePrice: 49,
    skills: [
      {
        category: 'generation',
        description: 'Generate images',
        id: 'image-gen',
        name: 'Image Gen',
        slug: 'image-gen',
        version: '1.0.0',
      },
    ],
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const mockStorefront = {
    bundlePrice: 49,
    skills: [
      {
        category: 'generation',
        description: 'Generate images',
        name: 'Image Gen',
        slug: 'image-gen',
      },
    ],
  };

  beforeEach(async () => {
    skillRegistryService = {
      getMetadataRegistry: vi.fn().mockResolvedValue(mockRegistry),
      getStorefrontCatalog: vi.fn().mockResolvedValue(mockStorefront),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkillRegistryController],
      providers: [
        {
          provide: SkillRegistryService,
          useValue: skillRegistryService,
        },
      ],
    }).compile();

    controller = module.get<SkillRegistryController>(SkillRegistryController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the registry on the global authenticated guard path', () => {
    const handler = SkillRegistryController.prototype.getRegistry;
    const context = {
      getClass: () => SkillRegistryController,
      getHandler: () => handler,
    } as unknown as ExecutionContext;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('registry');
    expect(isPublicRoute(new Reflector(), context)).toBe(false);
  });

  it('exposes the marketing storefront on a distinct public path', () => {
    const handler = SkillRegistryController.prototype.getStorefrontCatalog;
    const context = {
      getClass: () => SkillRegistryController,
      getHandler: () => handler,
    } as unknown as ExecutionContext;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('storefront');
    expect(isPublicRoute(new Reflector(), context)).toBe(true);
  });

  it('serializes only registry metadata and preserves catalogue meta', async () => {
    const result = await controller.getRegistry(mockRequest);

    expect(result).toMatchObject({
      data: [
        {
          attributes: {
            category: 'generation',
            description: 'Generate images',
            name: 'Image Gen',
            slug: 'image-gen',
            version: '1.0.0',
          },
          id: 'image-gen',
          type: 'skills-pro-registry-entry',
        },
      ],
      meta: {
        bundlePrice: 49,
        updatedAt: '2026-01-01T00:00:00Z',
      },
    });
    expect(skillRegistryService.getMetadataRegistry).toHaveBeenCalledOnce();
  });

  it('returns the separately typed public storefront catalogue', async () => {
    await expect(controller.getStorefrontCatalog()).resolves.toEqual(
      mockStorefront,
    );
    expect(skillRegistryService.getStorefrontCatalog).toHaveBeenCalledOnce();
  });

  it('propagates registry source failures', async () => {
    skillRegistryService.getMetadataRegistry.mockRejectedValue(
      new Error('CDN unreachable'),
    );

    await expect(controller.getRegistry(mockRequest)).rejects.toThrow(
      'CDN unreachable',
    );
  });
});
