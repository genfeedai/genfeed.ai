import { Types } from 'mongoose';

/**
 * Creates a mock Mongoose model that works with BaseService.
 * Supports both `new Model()` constructor calls and static methods.
 */
export function createMockModel(defaults: Record<string, unknown> = {}) {
  const savedDoc = {
    _id: new Types.ObjectId(),
    ...defaults,
    populate: vi.fn().mockReturnThis(),
    save: vi.fn().mockResolvedValue({
      _id: new Types.ObjectId(),
      ...defaults,
    }),
    toObject: vi.fn().mockReturnValue(defaults),
  };

  // Create a constructor function so `new model()` works
  function MockModel(data: Record<string, unknown>) {
    return {
      ...savedDoc,
      ...data,
      save: vi.fn().mockResolvedValue({
        _id: savedDoc._id,
        ...data,
      }),
    };
  }

  // Static methods
  MockModel.aggregate = vi.fn().mockReturnValue([]);
  MockModel.aggregatePaginate = vi.fn().mockResolvedValue({
    docs: [],
    hasNextPage: false,
    hasPrevPage: false,
    limit: 10,
    page: 1,
    totalDocs: 0,
    totalPages: 1,
  });
  MockModel.collection = { name: 'test-collection' };
  MockModel.create = vi.fn().mockResolvedValue(savedDoc);
  MockModel.deleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 });
  MockModel.find = vi.fn().mockReturnValue({
    exec: vi.fn().mockResolvedValue([]),
    populate: vi.fn().mockReturnThis(),
  });
  MockModel.findById = vi.fn().mockReturnValue({
    exec: vi.fn().mockResolvedValue(null),
    populate: vi.fn().mockReturnThis(),
  });
  MockModel.findByIdAndDelete = vi.fn().mockResolvedValue(null);
  MockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
    exec: vi.fn().mockResolvedValue(null),
    populate: vi.fn().mockReturnThis(),
  });
  MockModel.findOne = vi.fn().mockReturnValue({
    exec: vi.fn().mockResolvedValue(null),
    populate: vi.fn().mockReturnThis(),
  });
  MockModel.modelName = 'TestModel';
  MockModel.prototype.save = vi.fn().mockResolvedValue(savedDoc);
  MockModel.save = vi.fn().mockResolvedValue(savedDoc);
  MockModel.updateMany = vi.fn().mockResolvedValue({ modifiedCount: 0 });

  return MockModel;
}
