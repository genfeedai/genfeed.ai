import { ImagesRelationshipsController } from '@api/collections/images/controllers/relationships/images-relationships.controller';
import { ImagesService } from '@api/collections/images/services/images.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ImagesRelationshipsController', () => {
  let controller: ImagesRelationshipsController;
  let imagesService: ImagesService;

  const mockImage = {
    _id: '507f1f77bcf86cd799439014',
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
      .overrideGuard(ClerkGuard)
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findChildren', () => {
    it('should return child images', async () => {
      const result = await controller.findChildren(
        mockRequest,
        '507f1f77bcf86cd799439014',
        {},
      );

      expect(imagesService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should filter by parent ObjectId in aggregate pipeline', async () => {
      await controller.findChildren(
        mockRequest,
        '507f1f77bcf86cd799439014',
        {},
      );

      const callArgs = (imagesService.findAll as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const query = callArgs[0] as { where: Record<string, unknown> };
      expect(query.where.parent).toEqual('507f1f77bcf86cd799439014');
    });

    it('should include isDeleted filter in pipeline', async () => {
      await controller.findChildren(
        mockRequest,
        '507f1f77bcf86cd799439014',
        {},
      );

      const callArgs = (imagesService.findAll as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const query = callArgs[0] as { where: Record<string, unknown> };
      expect(query.where.isDeleted).toBe(false);
    });

    it('should include orderBy stage in pipeline', async () => {
      await controller.findChildren(
        mockRequest,
        '507f1f77bcf86cd799439014',
        {},
      );

      const callArgs = (imagesService.findAll as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const query = callArgs[0] as { orderBy?: Record<string, unknown> };
      expect(query.orderBy).toBeDefined();
    });

    it('should pass pagination options to findAll', async () => {
      await controller.findChildren(
        mockRequest,
        '507f1f77bcf86cd799439014',
        {},
      );

      const callArgs = (imagesService.findAll as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const options = callArgs[1] as Record<string, unknown>;
      expect(options).toHaveProperty('customLabels');
    });
  });
});
