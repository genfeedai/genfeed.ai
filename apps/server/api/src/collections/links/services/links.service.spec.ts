import { Link } from '@api/collections/links/schemas/link.schema';
import { LinksService } from '@api/collections/links/services/links.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('LinksService', () => {
  let service: LinksService;
  let model: ReturnType<typeof createMockModel>;

  const createModule = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinksService,
        { provide: PrismaService, useValue: model },
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
    service = module.get<LinksService>(LinksService);
  };

  beforeEach(async () => {
    model = vi.fn().mockImplementation(function () {
      return { save: vi.fn().mockResolvedValue({ _id: 'saved-id' }) };
    });
    model.collection = { name: 'links' };
    model.modelName = 'Link';
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

  it('returns existing link if found', async () => {
    const link = { _id: '1' };
    model.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(link) });

    const result = await service.findOne({
      brand: 'a',
      type: CredentialPlatform.YOUTUBE,
    });

    expect(model.findOne).toHaveBeenCalled();
    expect(result).toBe(link);
  });

  it('creates a new link when not existing', async () => {
    model.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    const saved = { _id: '2' };
    const saveMock = vi.fn().mockResolvedValue(saved);
    model.mockImplementation(function () {
      return { save: saveMock };
    });

    const result = await service.create({
      brand: 'a',
      type: CredentialPlatform.YOUTUBE,
    });

    expect(saveMock).toHaveBeenCalled();
    expect(result).toBe(saved);
  });

  it('finds one link', async () => {
    const found = { _id: '3' };
    model.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(found) });

    const result = await service.findOne({ brand: 'a' });

    expect(model.findOne).toHaveBeenCalledWith({ brand: 'a' });
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

  it('patches a link', async () => {
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

  it('patches multiple links', async () => {
    const execMock = vi.fn().mockResolvedValue({ modifiedCount: 5 });
    model.updateMany = vi.fn().mockReturnValue({ exec: execMock });

    const result = await service.patchAll({ a: 1 }, { b: 2 });

    expect(model.updateMany).toHaveBeenCalledWith({ a: 1 }, { b: 2 });
    expect(result).toEqual({ modifiedCount: 5 });
  });

  it('soft deletes a link', async () => {
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
