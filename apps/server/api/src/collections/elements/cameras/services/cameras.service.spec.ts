import type { CreateElementCameraDto } from '@api/collections/elements/cameras/dto/create-camera.dto';
import { ElementsCamerasService } from '@api/collections/elements/cameras/services/cameras.service';
import { createMockModel } from '@api/shared/testing/mock-model.factory';
import type { LoggerService } from '@libs/logger/logger.service';

const mockLoggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as LoggerService;

describe('ElementsCamerasService', () => {
  let service: ElementsCamerasService;
  let MockModel: ReturnType<typeof createMockModel>;

  beforeEach(() => {
    vi.clearAllMocks();
    MockModel = createMockModel({
      isDeleted: false,
      key: 'test',
      label: 'Test',
    });
    service = new ElementsCamerasService(MockModel as never, mockLoggerService);
  });

  it('should be defined', () => expect(service).toBeDefined());

  describe('create', () => {
    it('should create a camera', async () => {
      const dto: CreateElementCameraDto = {
        key: 'dslr',
        label: 'DSLR',
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
