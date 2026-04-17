import { ContentSchedule } from '@api/collections/content-schedules/schemas/content-schedule.schema';
import { ContentSchedulesService } from '@api/collections/content-schedules/services/content-schedules.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

describe('ContentSchedulesService', () => {
  const orgId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();
  const scheduleId = new Types.ObjectId().toString();

  let service: ContentSchedulesService;
  let model: {
    create: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const modelMock = {
      create: vi.fn(),
      find: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        lean: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
      }),
      findOneAndUpdate: vi.fn(),
      updateOne: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentSchedulesService,
        {
          provide: getModelToken(ContentSchedule.name, DB_CONNECTIONS.CLOUD),
          useValue: modelMock,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get(ContentSchedulesService);
    model = module.get(
      getModelToken(ContentSchedule.name, DB_CONNECTIONS.CLOUD),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createForBrand', () => {
    it('creates a schedule with computed nextRunAt', async () => {
      model.create.mockResolvedValue({
        _id: scheduleId,
        cronExpression: '*/5 * * * *',
        name: 'Every 5 min',
      });

      const result = await service.createForBrand(orgId, brandId, {
        cronExpression: '*/5 * * * *',
        name: 'Every 5 min',
        skillSlugs: ['content-writing'],
      });

      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: expect.any(Types.ObjectId),
          cronExpression: '*/5 * * * *',
          isDeleted: false,
          isEnabled: true,
          name: 'Every 5 min',
          nextRunAt: expect.any(Date),
          organization: expect.any(Types.ObjectId),
          skillSlugs: ['content-writing'],
        }),
      );
      expect(result._id).toBe(scheduleId);
    });

    it('defaults isEnabled to true when not provided', async () => {
      model.create.mockResolvedValue({ _id: scheduleId });

      await service.createForBrand(orgId, brandId, {
        cronExpression: '0 9 * * *',
        name: 'Daily',
        skillSlugs: ['writing'],
      });

      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({ isEnabled: true }),
      );
    });

    it('uses provided timezone for nextRunAt calculation', async () => {
      model.create.mockResolvedValue({ _id: scheduleId });

      await service.createForBrand(orgId, brandId, {
        cronExpression: '0 9 * * *',
        name: 'Daily',
        skillSlugs: ['writing'],
        timezone: 'America/New_York',
      });

      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({ timezone: 'America/New_York' }),
      );
    });
  });

  describe('listByBrand', () => {
    it('queries schedules scoped to org and brand', async () => {
      const findChain = {
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
      };
      model.find.mockReturnValue(findChain);

      await service.listByBrand(orgId, brandId);

      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: expect.any(Types.ObjectId),
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
        }),
      );
    });

    it('includes isEnabled filter when provided', async () => {
      const findChain = {
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
      };
      model.find.mockReturnValue(findChain);

      await service.listByBrand(orgId, brandId, true);

      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({ isEnabled: true }),
      );
    });
  });

  describe('getById', () => {
    it('returns the schedule when found', async () => {
      const doc = { _id: scheduleId, name: 'Test' };
      const findOneChain = {
        exec: vi.fn().mockResolvedValue(doc),
        lean: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
      };
      model.findOne.mockReturnValue(findOneChain);

      const result = await service.getById(orgId, brandId, scheduleId);
      expect(result).toEqual(doc);
    });

    it('throws NotFoundException when schedule not found', async () => {
      const findOneChain = {
        exec: vi.fn().mockResolvedValue(null),
        lean: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
      };
      model.findOne.mockReturnValue(findOneChain);

      await expect(service.getById(orgId, brandId, scheduleId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeForBrand', () => {
    it('soft-deletes a schedule', async () => {
      model.findOneAndUpdate.mockResolvedValue({
        _id: scheduleId,
        isDeleted: true,
      });

      const result = await service.removeForBrand(orgId, brandId, scheduleId);

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(Types.ObjectId),
          brand: expect.any(Types.ObjectId),
          isDeleted: false,
        }),
        { $set: { isDeleted: true } },
        { new: true },
      );
      expect(result.isDeleted).toBe(true);
    });

    it('throws NotFoundException when schedule to remove not found', async () => {
      model.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.removeForBrand(orgId, brandId, scheduleId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getActiveSchedules', () => {
    it('queries enabled, non-deleted schedules due for run', async () => {
      const now = new Date();
      model.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });

      await service.getActiveSchedules(now);

      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
          isEnabled: true,
          nextRunAt: { $lte: now },
          organization: { $exists: true },
        }),
      );
    });
  });

  describe('markScheduleRan', () => {
    it('updates lastRunAt and nextRunAt', async () => {
      model.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const nextRunAt = new Date('2026-04-01');
      const lastRunAt = new Date('2026-03-07');

      await service.markScheduleRan(scheduleId, orgId, nextRunAt, lastRunAt);

      expect(model.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(Types.ObjectId),
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
        }),
        {
          $set: { lastRunAt, nextRunAt },
        },
      );
    });
  });

  describe('calculateNextRunAt', () => {
    it('returns a future Date for valid cron', () => {
      const now = new Date('2026-03-07T12:00:00Z');
      const result = service.calculateNextRunAt('0 * * * *', 'UTC', now);

      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThan(now.getTime());
    });

    it('handles different timezones', () => {
      const now = new Date('2026-03-07T12:00:00Z');
      const utcResult = service.calculateNextRunAt('0 9 * * *', 'UTC', now);
      const nyResult = service.calculateNextRunAt(
        '0 9 * * *',
        'America/New_York',
        now,
      );

      // Different timezones should yield different absolute times
      expect(utcResult.getTime()).not.toBe(nyResult.getTime());
    });
  });
});
