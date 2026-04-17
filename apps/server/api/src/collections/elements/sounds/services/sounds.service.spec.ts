import type { CreateElementSoundDto } from '@api/collections/elements/sounds/dto/create-sound.dto';
import { ElementsSoundsService } from '@api/collections/elements/sounds/services/sounds.service';
import { createMockModel } from '@api/shared/testing/mock-model.factory';
import type { LoggerService } from '@libs/logger/logger.service';

const mockLoggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as LoggerService;

describe('ElementsSoundsService', () => {
  let service: ElementsSoundsService;
  let MockModel: ReturnType<typeof createMockModel>;

  beforeEach(() => {
    vi.clearAllMocks();
    MockModel = createMockModel({
      isDeleted: false,
      key: 'test',
      label: 'Test',
    });
    service = new ElementsSoundsService(MockModel as never, mockLoggerService);
  });

  it('should be defined', () => expect(service).toBeDefined());

  describe('create', () => {
    it('should create a sound', async () => {
      const dto: CreateElementSoundDto = {
        key: 'rain',
        label: 'Rain',
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
      const result = await service.findOne({ _id: 'test-object-id' });
      expect(result).toBeNull();
    });
  });

  describe('patch', () => {
    it('should return null when not found', async () => {
      vi.mocked(MockModel.findByIdAndUpdate).mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      } as never);
      const result = await service.patch('test-object-id', {} as never);
      expect(result).toBeNull();
    });
  });
});
