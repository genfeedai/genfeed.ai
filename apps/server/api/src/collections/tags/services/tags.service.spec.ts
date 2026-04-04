import { Tag } from '@api/collections/tags/schemas/tag.schema';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('TagsService', () => {
  let service: TagsService;
  let model: ReturnType<typeof createMockModel>;

  const createModule = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        {
          provide: getModelToken(Tag.name, DB_CONNECTIONS.CLOUD),
          useValue: model,
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
    service = module.get<TagsService>(TagsService);
  };

  beforeEach(async () => {
    model = vi.fn().mockImplementation(function () {
      return { save: vi.fn().mockResolvedValue({ _id: 'saved-id' }) };
    });
    model.collection = { name: 'tags' };
    model.modelName = 'Tag';
    model.findOne = vi.fn().mockReturnValue({
      exec: vi.fn(),
      populate: vi.fn().mockReturnThis(),
    });
    model.findById = vi.fn().mockReturnValue({
      exec: vi.fn(),
      populate: vi.fn().mockReturnThis(),
    });
    model.countDocuments = vi.fn().mockReturnValue({ exec: vi.fn() });
    model.aggregate = vi.fn().mockReturnValue('agg');
    model.aggregatePaginate = vi.fn();
    model.findByIdAndUpdate = vi.fn().mockReturnValue({
      exec: vi.fn(),
      populate: vi.fn().mockReturnThis(),
    });
    model.updateMany = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    });
    await createModule();
  });

  it('creates a new tag via BaseService.create', async () => {
    const saved = { _id: '2' };
    const saveMock = vi.fn().mockResolvedValue(saved);
    model.mockImplementation(function () {
      return { save: saveMock };
    });

    // BaseService.create calls new model(dto).save() — no prior findOne check
    const result = await service.create({ label: 'test' });

    expect(saveMock).toHaveBeenCalled();
    expect(result).toBe(saved);
  });

  it('finds one tag', async () => {
    const found = { _id: '3' };
    model.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(found) });

    const result = await service.findOne({ ingredient: 'm' });

    expect(model.findOne).toHaveBeenCalledWith({ ingredient: 'm' });
    expect(result).toBe(found);
  });

  it('aggregates and paginates results', async () => {
    model.aggregate = vi.fn().mockReturnValue('agg');
    model.aggregatePaginate = vi.fn().mockResolvedValue('paginated');

    const result = await service.findAll([], { limit: 1 });

    expect(model.aggregate).toHaveBeenCalledWith([]);
    expect(model.aggregatePaginate).toHaveBeenCalledWith('agg', { limit: 1 });
    expect(result).toBe('paginated');
  });

  it('patches a tag', async () => {
    const execMock = vi.fn().mockResolvedValue('patched');
    model.findByIdAndUpdate = vi.fn().mockReturnValue({
      exec: execMock,
      populate: vi.fn().mockReturnValue({ exec: execMock }),
    });

    const result = await service.patch('id', { isDeleted: true });

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'id',
      { $set: { isDeleted: true } },
      { returnDocument: 'after' },
    );
    expect(result).toBe('patched');
  });

  it('patches multiple tags', async () => {
    const execMock = vi.fn().mockResolvedValue({ modifiedCount: 3 });
    model.updateMany = vi.fn().mockReturnValue({ exec: execMock });

    const result = await service.patchAll({ a: 1 }, { b: 2 });

    expect(model.updateMany).toHaveBeenCalledWith({ a: 1 }, { b: 2 });
    // BaseService.patchAll returns { modifiedCount } from the updateMany result
    expect(result).toEqual({ modifiedCount: 3 });
  });

  it('soft deletes a tag', async () => {
    const execMock = vi.fn().mockResolvedValue('removed');
    model.findByIdAndUpdate = vi.fn().mockReturnValue({
      exec: execMock,
      populate: vi.fn().mockReturnValue({ exec: execMock }),
    });

    const result = await service.remove('id');

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'id',
      { isDeleted: true },
      { returnDocument: 'after' },
    );
    expect(result).toBe('removed');
  });
});
