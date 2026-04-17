import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { createMockModel } from '@api/shared/testing/mock-model.factory';
import { IngredientStatus } from '@genfeedai/enums';
import { type Ingredient } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('IngredientsService', () => {
  let service: IngredientsService;
  let model: ReturnType<typeof createMockModel>;

  const mockIngredient = {
    _id: 'test-id',
    brand: 'test-object-id',
    metadata: 'metadata-id',
    organization: 'test-object-id',
    save: vi.fn().mockResolvedValue({ _id: 'test-id' }),
    title: 'Test Ingredient',
    user: 'test-object-id',
  };

  beforeEach(async () => {
    const mockModel = vi.fn().mockImplementation(() => mockIngredient);
    mockModel.findOne = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(mockIngredient),
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockIngredient),
      }),
    });
    mockModel.findById = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(mockIngredient),
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockIngredient),
      }),
    });
    mockModel.aggregate = vi.fn().mockReturnValue('aggregation');
    mockModel.aggregatePaginate = vi.fn().mockResolvedValue({
      docs: [mockIngredient],
      limit: 10,
      page: 1,
      totalDocs: 1,
      totalPages: 1,
    });
    mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(mockIngredient),
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockIngredient),
      }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientsService,
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

    service = module.get<IngredientsService>(IngredientsService);
    model = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an ingredient successfully', async () => {
      const createDto: CreateIngredientDto = {
        brand: 'test-object-id',
        status: 'pending',
      };

      const result = await service.create(createDto);

      expect(result).toBeDefined();
      expect(result._id).toBe('test-id');
    });

    it('should handle creation errors', async () => {
      const createDto: CreateIngredientDto = {
        brand: 'test-object-id',
        status: 'pending',
      };

      const error = new Error('Creation failed');
      mockIngredient.save.mockRejectedValue(error);

      await expect(service.create(createDto)).rejects.toThrow(
        'Creation failed',
      );
    });
  });

  describe('findLatest', () => {
    it('should find latest ingredients', async () => {
      const params = { user: 'user-id' };

      model.aggregate.mockReturnValue('aggregation');
      model.aggregatePaginate.mockResolvedValue({
        docs: [mockIngredient],
        totalDocs: 1,
      });

      const result = await service.findLatest(params);

      expect(model.aggregate).toHaveBeenCalled();
      expect(model.aggregatePaginate).toHaveBeenCalledWith('aggregation', {
        limit: 10,
      });
      expect(result).toBeDefined();
    });
  });

  describe('patch', () => {
    it('should update an ingredient successfully', async () => {
      const id = 'test-id';
      const updateDto: UpdateIngredientDto = {
        isDeleted: false,
        status: IngredientStatus.GENERATED,
      };

      const result = await service.patch(id, updateDto);

      expect(result).toBeDefined();
      expect(result._id).toBe('test-id');
    });

    it('should handle update errors', async () => {
      const id = 'test-id';
      const updateDto: UpdateIngredientDto = {
        isDeleted: false,
        status: IngredientStatus.GENERATED,
      };

      const error = new Error('Update failed');
      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockRejectedValue(error),
        populate: vi.fn().mockReturnValue({
          exec: vi.fn().mockRejectedValue(error),
        }),
      });

      await expect(service.patch(id, updateDto)).rejects.toThrow(
        'Update failed',
      );
    });
  });

  describe('findOne', () => {
    it('should find one ingredient', async () => {
      const params = { _id: 'test-id' };

      const result = await service.findOne(params);

      expect(model.findOne).toHaveBeenCalledWith(params);
      expect(result).toBeDefined();
      expect(result?._id).toBe('test-id');
    });
  });

  describe('findAll', () => {
    it('should find all ingredients with pagination', async () => {
      const aggregate: PipelineStage[] = [{ $match: { user: 'user-id' } }];
      const options = { limit: 10, page: 1 };

      const result = await service.findAll(aggregate, options);

      expect(model.aggregate).toHaveBeenCalledWith(aggregate);
      expect(model.aggregatePaginate).toHaveBeenCalledWith(
        'aggregation',
        options,
      );
      expect(result).toBeDefined();
      expect(result.docs).toHaveLength(1);
    });
  });
});
