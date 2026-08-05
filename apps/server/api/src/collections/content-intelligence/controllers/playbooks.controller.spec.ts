vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (
      _req: unknown,
      serializer: { serialize(data: unknown): unknown },
      result: { docs?: unknown[] } | unknown[],
    ) => {
      const docs = Array.isArray(result) ? result : (result.docs ?? []);
      return { data: docs.map((doc) => serializer.serialize(doc)) };
    },
  ),
  serializeSingle: vi.fn(
    (
      _req: unknown,
      serializer: { serialize(data: unknown): unknown },
      data: unknown,
    ) => ({ data: serializer.serialize(data) }),
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PlaybooksController } from '@api/collections/content-intelligence/controllers/playbooks.controller';
import type {
  CreatePlaybookDto,
  UpdatePlaybookDto,
} from '@api/collections/content-intelligence/dto/create-playbook.dto';
import { PlaybookBuilderService } from '@api/collections/content-intelligence/services/playbook-builder.service';
import { ContentIntelligencePlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PlaybooksController', () => {
  let controller: PlaybooksController;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/content-intelligence/playbooks',
    query: {},
  } as Request;

  const mockPlaybook = {
    data: {
      name: 'Test Playbook',
      platform: ContentIntelligencePlatform.TWITTER,
    },
    id: '507f1f77bcf86cd799439015',
    organizationId: '507f1f77bcf86cd799439012',
    sourceCreators: ['507f1f77bcf86cd799439016'],
  };

  const mockPlaybookBuilderService = {
    buildInsights: vi.fn(),
    createPlaybook: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(),
    updatePlaybook: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlaybooksController],
      providers: [
        {
          provide: PlaybookBuilderService,
          useValue: mockPlaybookBuilderService,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PlaybooksController>(PlaybooksController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return playbooks for organization', async () => {
      mockPlaybookBuilderService.findAll.mockResolvedValue({
        docs: [mockPlaybook],
      });

      await controller.findAll(mockRequest, mockUser);

      expect(mockPlaybookBuilderService.findAll).toHaveBeenCalledWith(
        {
          include: { sourceCreators: { select: { id: true } } },
          orderBy: { createdAt: -1 },
          where: {
            isDeleted: false,
            organizationId: '507f1f77bcf86cd799439012',
          },
        },
        expect.objectContaining({ limit: 100, page: 1 }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a playbook', async () => {
      mockPlaybookBuilderService.findOne.mockResolvedValue(mockPlaybook);

      const result = await controller.findOne(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439015',
      );

      expect(mockPlaybookBuilderService.findOne).toHaveBeenCalled();
      expect(result).toEqual({
        data: expect.objectContaining({
          attributes: expect.objectContaining({
            sourceCreators: ['507f1f77bcf86cd799439016'],
          }),
          id: '507f1f77bcf86cd799439015',
        }),
      });
    });

    it('should throw when not found', async () => {
      mockPlaybookBuilderService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(mockRequest, mockUser, '507f1f77bcf86cd799439015'),
      ).rejects.toThrow(HttpException);
    });

    it('should throw for invalid ObjectId', async () => {
      await expect(
        controller.findOne(mockRequest, mockUser, 'invalid'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('create', () => {
    it('should create a playbook', async () => {
      mockPlaybookBuilderService.createPlaybook.mockResolvedValue(mockPlaybook);

      await controller.create(mockRequest, mockUser, {
        name: 'New Playbook',
        platform: ContentIntelligencePlatform.TWITTER,
      } satisfies CreatePlaybookDto);

      expect(mockPlaybookBuilderService.createPlaybook).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439011',
        expect.any(Object),
      );
    });
  });

  describe('update', () => {
    it('should update a playbook', async () => {
      mockPlaybookBuilderService.findOne.mockResolvedValue(mockPlaybook);
      mockPlaybookBuilderService.updatePlaybook.mockResolvedValue({
        ...mockPlaybook,
        data: { ...mockPlaybook.data, name: 'Updated' },
      });

      await controller.update(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439015',
        { name: 'Updated' } satisfies UpdatePlaybookDto,
      );

      expect(mockPlaybookBuilderService.updatePlaybook).toHaveBeenCalledWith(
        mockPlaybook,
        { name: 'Updated' },
      );
    });

    it('should throw when playbook not found', async () => {
      mockPlaybookBuilderService.findOne.mockResolvedValue(null);

      await expect(
        controller.update(
          mockRequest,
          mockUser,
          '507f1f77bcf86cd799439015',
          {} satisfies UpdatePlaybookDto,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('buildInsights', () => {
    it('should build insights for a playbook', async () => {
      mockPlaybookBuilderService.findOne.mockResolvedValue(mockPlaybook);
      mockPlaybookBuilderService.buildInsights.mockResolvedValue({
        ...mockPlaybook,
        insights: ['insight1'],
      });

      await controller.buildInsights(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439015',
      );

      expect(mockPlaybookBuilderService.buildInsights).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439015',
        '507f1f77bcf86cd799439012',
      );
    });

    it('should throw when playbook not found', async () => {
      mockPlaybookBuilderService.findOne.mockResolvedValue(null);

      await expect(
        controller.buildInsights(
          mockRequest,
          mockUser,
          '507f1f77bcf86cd799439015',
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('should remove a playbook', async () => {
      mockPlaybookBuilderService.findOne.mockResolvedValue(mockPlaybook);
      mockPlaybookBuilderService.remove.mockResolvedValue({
        ...mockPlaybook,
        isDeleted: true,
      });

      await controller.remove(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439015',
      );

      expect(mockPlaybookBuilderService.remove).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439015',
      );
    });

    it('should throw when playbook not found', async () => {
      mockPlaybookBuilderService.findOne.mockResolvedValue(null);

      await expect(
        controller.remove(mockRequest, mockUser, '507f1f77bcf86cd799439015'),
      ).rejects.toThrow(HttpException);
    });
  });
});
