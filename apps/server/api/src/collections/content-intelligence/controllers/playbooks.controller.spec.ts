vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import { PlaybooksController } from '@api/collections/content-intelligence/controllers/playbooks.controller';
import { PlaybookBuilderService } from '@api/collections/content-intelligence/services/playbook-builder.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

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
    _id: new Types.ObjectId('507f1f77bcf86cd799439015'),
    name: 'Test Playbook',
    organization: new Types.ObjectId('507f1f77bcf86cd799439012'),
  };

  const mockPlaybookBuilderService = {
    buildInsights: vi.fn(),
    createPlaybook: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
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

      expect(mockPlaybookBuilderService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a playbook', async () => {
      mockPlaybookBuilderService.findOne.mockResolvedValue(mockPlaybook);

      await controller.findOne(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439015',
      );

      expect(mockPlaybookBuilderService.findOne).toHaveBeenCalled();
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
        platform: 'twitter',
      } as any);

      expect(mockPlaybookBuilderService.createPlaybook).toHaveBeenCalledWith(
        new Types.ObjectId('507f1f77bcf86cd799439012'),
        new Types.ObjectId('507f1f77bcf86cd799439011'),
        expect.any(Object),
      );
    });
  });

  describe('update', () => {
    it('should update a playbook', async () => {
      mockPlaybookBuilderService.findOne.mockResolvedValue(mockPlaybook);
      mockPlaybookBuilderService.patch.mockResolvedValue({
        ...mockPlaybook,
        name: 'Updated',
      });

      await controller.update(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439015',
        { name: 'Updated' } as any,
      );

      expect(mockPlaybookBuilderService.patch).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439015',
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
          {} as any,
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
