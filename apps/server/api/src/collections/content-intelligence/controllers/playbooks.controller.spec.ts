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
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const organizationId = '550e8400-e29b-41d4-a716-446655440002';
  const brandId = '550e8400-e29b-41d4-a716-446655440003';
  const playbookId = '550e8400-e29b-41d4-a716-446655440004';
  const creatorId = '550e8400-e29b-41d4-a716-446655440005';
  let controller: PlaybooksController;

  const mockUser = {
    id: 'user_123',
    brandId: brandId,
    organizationId: organizationId,
    userId: userId,
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
    id: playbookId,
    organizationId,
    sourceCreators: [creatorId],
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
            organizationId,
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
        playbookId,
      );

      expect(mockPlaybookBuilderService.findOne).toHaveBeenCalled();
      expect(result).toEqual({
        data: expect.objectContaining({
          attributes: expect.objectContaining({
            sourceCreators: [creatorId],
          }),
          id: playbookId,
        }),
      });
    });

    it('should throw when not found', async () => {
      mockPlaybookBuilderService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(mockRequest, mockUser, playbookId),
      ).rejects.toThrow(HttpException);
    });

    it('should throw for an invalid entity ID', async () => {
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
        organizationId,
        userId,
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

      await controller.update(mockRequest, mockUser, playbookId, {
        name: 'Updated',
      } satisfies UpdatePlaybookDto);

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
          playbookId,
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

      await controller.buildInsights(mockRequest, mockUser, playbookId);

      expect(mockPlaybookBuilderService.buildInsights).toHaveBeenCalledWith(
        playbookId,
        organizationId,
      );
    });

    it('should throw when playbook not found', async () => {
      mockPlaybookBuilderService.findOne.mockResolvedValue(null);

      await expect(
        controller.buildInsights(mockRequest, mockUser, playbookId),
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

      await controller.remove(mockRequest, mockUser, playbookId);

      expect(mockPlaybookBuilderService.remove).toHaveBeenCalledWith(
        playbookId,
      );
    });

    it('should throw when playbook not found', async () => {
      mockPlaybookBuilderService.findOne.mockResolvedValue(null);

      await expect(
        controller.remove(mockRequest, mockUser, playbookId),
      ).rejects.toThrow(HttpException);
    });
  });
});
