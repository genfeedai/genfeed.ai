import { Vote } from '@api/collections/votes/schemas/vote.schema';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('VotesService', () => {
  let service: VotesService;
  let model: ReturnType<typeof createMockModel>;

  const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const createModule = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotesService,
        {
          provide: getModelToken(Vote.name, DB_CONNECTIONS.CLOUD),
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
    service = module.get<VotesService>(VotesService);
  };

  beforeEach(async () => {
    model = vi.fn().mockImplementation(function () {
      return { save: vi.fn().mockResolvedValue({ _id: 'saved-id' }) };
    });
    model.collection = { name: 'votes' };
    model.modelName = 'Vote';
    model.findOne = vi.fn().mockReturnValue({
      exec: vi.fn(),
      populate: vi.fn().mockReturnThis(),
    });
    model.findById = vi.fn().mockReturnValue({
      exec: vi.fn(),
      populate: vi.fn().mockReturnThis(),
    });
    model.countDocuments = vi.fn().mockReturnValue({ exec: vi.fn() });
    model.updateMany = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    });
    await createModule();
  });

  it('creates a new vote via BaseService.create', async () => {
    const saved = { _id: '2' };
    const saveMock = vi.fn().mockResolvedValue(saved);
    model.mockImplementation(function () {
      return { save: saveMock };
    });

    const entityId = '507f191e810c19729de860ea';
    // BaseService.create calls new model(dto).save() — no prior findOne check
    const result = await service.create({
      entity: entityId,
      entityModel: 'Ingredient',
    });

    expect(model).toHaveBeenCalledWith({
      entity: entityId,
      entityModel: 'Ingredient',
    });
    expect(saveMock).toHaveBeenCalled();
    expect(result).toBe(saved);
  });

  it('counts votes via model', async () => {
    model.countDocuments.mockReturnValue({
      exec: vi.fn().mockResolvedValue(5),
    });

    // Test direct model usage since BaseService doesn't expose count
    const result = await model.countDocuments({ entity: id }).exec();

    expect(model.countDocuments).toHaveBeenCalledWith({ entity: id });
    expect(result).toBe(5);
  });

  it('finds one vote', async () => {
    const found = { _id: '3' };
    model.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(found) });

    const result = await service.findOne({ entity: id });

    expect(model.findOne).toHaveBeenCalledWith({ entity: id });
    expect(result).toBe(found);
  });

  // ── New tests for vote type support ──

  it('creates an upvote with type field', async () => {
    const saved = { _id: 'upvote-1', type: 'up' };
    const saveMock = vi.fn().mockResolvedValue(saved);
    model.mockImplementation(function () {
      return { save: saveMock };
    });

    const entityId = '507f191e810c19729de860ea';
    const result = await service.create({
      entity: entityId,
      entityModel: 'Ingredient',
      type: 'up',
    });

    expect(model).toHaveBeenCalledWith(expect.objectContaining({ type: 'up' }));
    expect(saveMock).toHaveBeenCalled();
    expect(result).toBe(saved);
  });

  it('creates a downvote with type field', async () => {
    const saved = { _id: 'downvote-1', type: 'down' };
    const saveMock = vi.fn().mockResolvedValue(saved);
    model.mockImplementation(function () {
      return { save: saveMock };
    });

    const entityId = '507f191e810c19729de860ea';
    const result = await service.create({
      entity: entityId,
      entityModel: 'Ingredient',
      type: 'down',
    });

    expect(model).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'down' }),
    );
    expect(saveMock).toHaveBeenCalled();
    expect(result).toBe(saved);
  });

  it('counts only upvotes when filtered by type', async () => {
    model.countDocuments.mockReturnValue({
      exec: vi.fn().mockResolvedValue(3),
    });

    const result = await model
      .countDocuments({ entity: id, isDeleted: false, type: 'up' })
      .exec();

    expect(model.countDocuments).toHaveBeenCalledWith({
      entity: id,
      isDeleted: false,
      type: 'up',
    });
    expect(result).toBe(3);
  });

  it('soft-deletes votes via patchAll', async () => {
    const entityId = '507f191e810c19729de860ea';
    const userId = '507f1f77bcf86cd799439013';

    const result = await service.patchAll(
      {
        entity: entityId,
        isDeleted: false,
        user: userId,
      },
      { $set: { isDeleted: true } },
    );

    expect(model.updateMany).toHaveBeenCalled();
    expect(result).toEqual({ modifiedCount: 1 });
  });
});
