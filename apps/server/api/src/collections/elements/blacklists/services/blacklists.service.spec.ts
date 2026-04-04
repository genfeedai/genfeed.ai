import type { CreateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/create-blacklist.dto';
import { ElementsBlacklistsService } from '@api/collections/elements/blacklists/services/blacklists.service';
import { createMockModel } from '@api/shared/testing/mock-model.factory';
import type { LoggerService } from '@libs/logger/logger.service';
import { Types } from 'mongoose';

const mockLoggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as LoggerService;

describe('ElementsBlacklistsService', () => {
  let service: ElementsBlacklistsService;
  let MockModel: ReturnType<typeof createMockModel>;

  beforeEach(() => {
    vi.clearAllMocks();
    MockModel = createMockModel({
      isDeleted: false,
      key: 'test',
      label: 'Test',
    });
    service = new ElementsBlacklistsService(
      MockModel as never,
      mockLoggerService,
    );
  });

  it('should be defined', () => expect(service).toBeDefined());

  describe('create', () => {
    it('should create a blacklist', async () => {
      const dto: CreateElementBlacklistDto = {
        key: 'blocked',
        label: 'Blocked',
      } as never;
      const result = await service.create(dto);
      expect(result).toBeDefined();
    });
    it('should throw when dto is null', async () => {
      await expect(service.create(null as never)).rejects.toThrow();
    });
  });

  describe('findOne', () => {
    it('should return null when not found', async () => {
      vi.mocked(MockModel.findOne).mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      } as never);
      const result = await service.findOne({ _id: new Types.ObjectId() });
      expect(result).toBeNull();
    });
  });

  describe('patch', () => {
    it('should return null when not found', async () => {
      vi.mocked(MockModel.findByIdAndUpdate).mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      } as never);
      const result = await service.patch(
        new Types.ObjectId().toString(),
        {} as never,
      );
      expect(result).toBeNull();
    });
  });
});
