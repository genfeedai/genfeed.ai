import { ContentSchedulesController } from '@api/collections/content-schedules/controllers/content-schedules.controller';
import { ContentSchedulesService } from '@api/collections/content-schedules/services/content-schedules.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn().mockReturnValue({
    organization: '507f1f77bcf86cd799439012',
    user: '507f1f77bcf86cd799439011',
  }),
}));

describe('ContentSchedulesController', () => {
  let controller: ContentSchedulesController;
  let service: {
    createForBrand: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    listByBrand: ReturnType<typeof vi.fn>;
    removeForBrand: ReturnType<typeof vi.fn>;
    updateForBrand: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockReq = {} as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentSchedulesController],
      providers: [
        {
          provide: ContentSchedulesService,
          useValue: {
            createForBrand: vi
              .fn()
              .mockResolvedValue({ _id: 's-1', name: 'test' }),
            getById: vi.fn().mockResolvedValue({ _id: 's-1', name: 'test' }),
            listByBrand: vi.fn().mockResolvedValue([]),
            removeForBrand: vi
              .fn()
              .mockResolvedValue({ _id: 's-1', isDeleted: true }),
            updateForBrand: vi
              .fn()
              .mockResolvedValue({ _id: 's-1', name: 'updated' }),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ContentSchedulesController);
    service = module.get(ContentSchedulesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('lists schedules for org and brand', async () => {
      await controller.list(mockReq, mockUser, 'brand-1', {});

      expect(service.listByBrand).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        'brand-1',
        undefined,
      );
    });

    it('passes isEnabled filter from query', async () => {
      await controller.list(mockReq, mockUser, 'brand-1', {
        isEnabled: true,
      });

      expect(service.listByBrand).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        'brand-1',
        true,
      );
    });
  });

  describe('getOne', () => {
    it('returns a single schedule', async () => {
      await controller.getOne(mockReq, mockUser, 'brand-1', 'schedule-1');

      expect(service.getById).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        'brand-1',
        'schedule-1',
      );
    });

    it('propagates NotFoundException from service', async () => {
      service.getById.mockRejectedValue(
        new NotFoundException('ContentSchedule', 'bad-id'),
      );

      await expect(
        controller.getOne(mockReq, mockUser, 'brand-1', 'bad-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a schedule for the brand', async () => {
      const dto = {
        cronExpression: '*/5 * * * *',
        name: 'test',
        skillSlugs: ['content-writing'],
      };
      await controller.create(mockReq, mockUser, 'brand-1', dto);

      expect(service.createForBrand).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        'brand-1',
        dto,
      );
    });
  });

  describe('update', () => {
    it('updates a schedule', async () => {
      const dto = { name: 'updated' };
      await controller.update(mockReq, mockUser, 'brand-1', 'schedule-1', dto);

      expect(service.updateForBrand).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        'brand-1',
        'schedule-1',
        dto,
      );
    });

    it('propagates NotFoundException when schedule not found', async () => {
      service.updateForBrand.mockRejectedValue(
        new NotFoundException('ContentSchedule', 'bad-id'),
      );

      await expect(
        controller.update(mockReq, mockUser, 'brand-1', 'bad-id', {
          name: 'x',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft-deletes a schedule', async () => {
      await controller.remove(mockReq, mockUser, 'brand-1', 'schedule-1');

      expect(service.removeForBrand).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        'brand-1',
        'schedule-1',
      );
    });

    it('propagates error when schedule not found for deletion', async () => {
      service.removeForBrand.mockRejectedValue(
        new NotFoundException('ContentSchedule', 'bad-id'),
      );

      await expect(
        controller.remove(mockReq, mockUser, 'brand-1', 'bad-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
