import type { CreateElementLensDto } from '@api/collections/elements/lenses/dto/create-lens.dto';
import { ElementsLensesService } from '@api/collections/elements/lenses/services/lenses.service';
import { createMockModel } from '@api/shared/testing/mock-model.factory';
import type { LoggerService } from '@libs/logger/logger.service';

const mockLoggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as LoggerService;

describe('ElementsLensesService', () => {
  let service: ElementsLensesService;
  let MockModel: ReturnType<typeof createMockModel>;

  beforeEach(() => {
    vi.clearAllMocks();
    MockModel = createMockModel({
      isDeleted: false,
      key: 'test',
      label: 'Test',
    });
    service = new ElementsLensesService(MockModel as never, mockLoggerService);
  });

  it('should be defined', () => expect(service).toBeDefined());

  describe('create', () => {
    it('should create a lens', async () => {
      const dto: CreateElementLensDto = { key: 'wide', label: 'Wide' } as never;
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
