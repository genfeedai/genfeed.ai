import { CreateBotDto } from '@api/collections/bots/dto/create-bot.dto';
import { UpdateBotDto } from '@api/collections/bots/dto/update-bot.dto';
import { Bot } from '@api/collections/bots/schemas/bot.schema';
import { BotsService } from '@api/collections/bots/services/bots.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BotStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('BotsService', () => {
  let service: BotsService;
  let model: ReturnType<typeof createMockModel>;
  let logger: LoggerService;

  const mockBotId = '507f1f77bcf86cd799439011';
  const mockUserId = '507f1f77bcf86cd799439012';
  const mockOrganizationId = '507f1f77bcf86cd799439013';
  const mockBrandId = '507f1f77bcf86cd799439014';

  const mockBot = {
    _id: mockBotId,
    brand: mockBrandId,
    description: 'Test bot description',
    isDeleted: false,
    name: 'Test Bot',
    organization: mockOrganizationId,
    status: BotStatus.ACTIVE,
    user: mockUserId,
  };

  const mockPopulatedBot = {
    ...mockBot,
    brand: { _id: mockBrandId, platform: 'twitter' },
    organization: { _id: mockOrganizationId, name: 'Test Org' },
    user: { _id: mockUserId, name: 'Test User' },
  };

  beforeEach(async () => {
    const mockModel = vi.fn();

    mockModel.collection = { name: 'bots' };
    mockModel.modelName = 'Bot';
    mockModel.create = vi.fn();
    mockModel.exec = vi.fn();
    mockModel.findById = vi.fn();
    mockModel.findByIdAndUpdate = vi.fn();
    mockModel.findOne = vi.fn();
    mockModel.populate = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotsService,
        { provide: PrismaService, useValue: mockModel },
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

    service = module.get<BotsService>(BotsService);
    model = module.get(PrismaService);
    logger = module.get<LoggerService>(LoggerService);

    logger.debug = vi.fn();

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a bot with default population', async () => {
      const createDto: CreateBotDto = {
        brand: mockBrandId,
        description: 'New bot description',
        label: 'New Bot',
        organization: mockOrganizationId,
        user: mockUserId,
      };

      const savedDoc = {
        ...mockBot,
        ...createDto,
        save: vi.fn().mockResolvedValue(mockBot),
      };

      (model as any).mockImplementationOnce(function () {
        return savedDoc;
      });
      model.findById = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockPopulatedBot),
        }),
      });

      const result = await service.create(createDto);

      expect(result).toEqual(mockPopulatedBot);
    });

    it('should create a bot with custom population', async () => {
      const createDto: CreateBotDto = {
        brand: mockBrandId,
        label: 'New Bot',
        organization: mockOrganizationId,
        user: mockUserId,
      };

      const savedDoc = {
        ...mockBot,
        ...createDto,
        save: vi.fn().mockResolvedValue(mockBot),
      };

      (model as any).mockImplementationOnce(function () {
        return savedDoc;
      });
      model.findById = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockPopulatedBot),
        }),
      });

      const result = await service.create(createDto, [{ path: 'user' }]);

      expect(result).toEqual(mockPopulatedBot);
    });
  });

  describe('patch', () => {
    it('should update a bot with default population', async () => {
      const updateDto: UpdateBotDto = {
        label: 'Updated Bot Name',
        status: BotStatus.PAUSED,
      };

      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi
            .fn()
            .mockResolvedValue({ ...mockPopulatedBot, ...updateDto }),
        }),
      });

      const result = await service.patch(mockBotId.toString(), updateDto);

      expect(result).toEqual({ ...mockPopulatedBot, ...updateDto });
      // BaseService.patch wraps the updateDto in { $set: updateDto } when no $set/$unset keys present
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        mockBotId.toString(),
        { $set: updateDto },
        { returnDocument: 'after' },
      );
    });

    it('should update a bot with custom population', async () => {
      const updateDto: UpdateBotDto = {
        description: 'Updated description',
      };

      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi
            .fn()
            .mockResolvedValue({ ...mockPopulatedBot, ...updateDto }),
        }),
      });

      const result = await service.patch(mockBotId.toString(), updateDto, [
        { path: 'organization' },
      ]);

      expect(result).toEqual({ ...mockPopulatedBot, ...updateDto });
    });
  });

  describe('toggleStatus', () => {
    it('should toggle bot status from ACTIVE to PAUSED', async () => {
      const activeBot = { ...mockBot, status: BotStatus.ACTIVE };

      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(activeBot),
      });

      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi
            .fn()
            .mockResolvedValue({ ...activeBot, status: BotStatus.PAUSED }),
        }),
      });

      const result = await service.toggleStatus(mockBotId.toString());

      expect(result.status).toBe(BotStatus.PAUSED);
      // BaseService.patch wraps in { $set: ... }
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        mockBotId.toString(),
        { $set: { status: BotStatus.PAUSED } },
        { returnDocument: 'after' },
      );
    });

    it('should toggle bot status from PAUSED to ACTIVE', async () => {
      const pausedBot = { ...mockBot, status: BotStatus.PAUSED };

      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(pausedBot),
      });

      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi
            .fn()
            .mockResolvedValue({ ...pausedBot, status: BotStatus.ACTIVE }),
        }),
      });

      const result = await service.toggleStatus(mockBotId.toString());

      expect(result.status).toBe(BotStatus.ACTIVE);
      // BaseService.patch wraps in { $set: ... }
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        mockBotId.toString(),
        { $set: { status: BotStatus.ACTIVE } },
        { returnDocument: 'after' },
      );
    });

    it('should throw NotFoundException when bot not found', async () => {
      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      await expect(service.toggleStatus(mockBotId.toString())).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.toggleStatus(mockBotId.toString())).rejects.toThrow(
        `Bot ${mockBotId.toString()} not found`,
      );
    });

    it('should handle errors during toggle', async () => {
      const error = new Error('Database error');

      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockRejectedValue(error),
      });

      await expect(service.toggleStatus(mockBotId.toString())).rejects.toThrow(
        error,
      );
    });
  });
});
