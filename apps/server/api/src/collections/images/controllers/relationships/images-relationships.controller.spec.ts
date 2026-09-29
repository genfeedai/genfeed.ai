import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { ImagesRelationshipsController } from '@api/collections/images/controllers/relationships/images-relationships.controller';
import { ImagesService } from '@api/collections/images/services/images.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ImagesRelationshipsController', () => {
  let controller: ImagesRelationshipsController;
  let imagesService: ImagesService;

  const imageId = testId('image');

  const mockImage = {
    id: imageId,
    category: 'image',
  };

  const mockRequest = {
    originalUrl: '/api/images',
    params: {},
    query: {},
  } as unknown as Request;

  const mockServices = {
    imagesService: {
      findAll: vi.fn().mockResolvedValue({
        docs: [mockImage],
        limit: 10,
        page: 1,
        pages: 1,
        total: 1,
      }),
    },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImagesRelationshipsController],
      providers: [
        { provide: ImagesService, useValue: mockServices.imagesService },
        { provide: LoggerService, useValue: mockServices.loggerService },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ImagesRelationshipsController>(
      ImagesRelationshipsController,
    );
    imagesService = module.get<ImagesService>(ImagesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findChildren', () => {
    it('should filter by canonical parentId in aggregate pipeline', async () => {
      await controller.findChildren(mockRequest, imageId, {});

      const callArgs = (imagesService.findAll as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const query = callArgs[0] as { where: Record<string, unknown> };
      expect(query.where.parentId).toEqual(imageId);
      expect(query.where).not.toHaveProperty('parent');
    });
  });
});
