import { AdBulkUploadJob } from '@api/collections/ad-bulk-upload-jobs/schemas/ad-bulk-upload-job.schema';
import { AdBulkUploadJobsService } from '@api/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('AdBulkUploadJobsService', () => {
  let service: AdBulkUploadJobsService;

  const jobId = new Types.ObjectId().toString();
  const orgId = new Types.ObjectId().toString();

  interface MockModel {
    create: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
  }

  let modelMock: MockModel;
  let loggerMock: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const makeChainable = (value: unknown) => ({
    exec: vi.fn().mockResolvedValue(value),
    lean: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    modelMock = {
      create: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn(),
      updateOne: vi.fn(),
    };
    loggerMock = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdBulkUploadJobsService,
        {
          provide: getModelToken(AdBulkUploadJob.name, DB_CONNECTIONS.CLOUD),
          useValue: modelMock,
        },
        { provide: LoggerService, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<AdBulkUploadJobsService>(AdBulkUploadJobsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create and return a document', async () => {
      const mockDoc = { _id: new Types.ObjectId(), status: 'pending' };
      modelMock.create.mockResolvedValue(mockDoc);

      const result = await service.create({ status: 'pending' as never });
      expect(result).toEqual(mockDoc);
      expect(modelMock.create).toHaveBeenCalledWith({ status: 'pending' });
    });

    it('should log and rethrow on create failure', async () => {
      modelMock.create.mockRejectedValue(new Error('DB write error'));

      await expect(
        service.create({ status: 'pending' as never }),
      ).rejects.toThrow('DB write error');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return document when found', async () => {
      const mockDoc = { _id: new Types.ObjectId(jobId), status: 'pending' };
      modelMock.findOne.mockReturnValue(makeChainable(mockDoc));

      const result = await service.findById(jobId, orgId);
      expect(result).toEqual(mockDoc);
      expect(modelMock.findOne).toHaveBeenCalledWith({
        _id: new Types.ObjectId(jobId),
        isDeleted: false,
        organization: new Types.ObjectId(orgId),
      });
    });

    it('should return null when document not found', async () => {
      modelMock.findOne.mockReturnValue(makeChainable(null));

      const result = await service.findById(jobId, orgId);
      expect(result).toBeNull();
    });
  });

  describe('findByOrganization', () => {
    it('should return documents for organization', async () => {
      const docs = [
        { _id: new Types.ObjectId() },
        { _id: new Types.ObjectId() },
      ];
      modelMock.find.mockReturnValue(makeChainable(docs));

      const result = await service.findByOrganization(orgId);
      expect(result).toHaveLength(2);
      expect(modelMock.find).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false }),
      );
    });

    it('should filter by status when provided', async () => {
      modelMock.find.mockReturnValue(makeChainable([]));

      await service.findByOrganization(orgId, { status: 'completed' as never });
      expect(modelMock.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' }),
      );
    });

    it('should apply offset and limit params', async () => {
      const chainable = makeChainable([]);
      modelMock.find.mockReturnValue(chainable);

      await service.findByOrganization(orgId, { limit: 10, offset: 20 });
      expect(chainable.skip).toHaveBeenCalledWith(20);
      expect(chainable.limit).toHaveBeenCalledWith(10);
    });

    it('should default to offset 0 and limit 50', async () => {
      const chainable = makeChainable([]);
      modelMock.find.mockReturnValue(chainable);

      await service.findByOrganization(orgId);
      expect(chainable.skip).toHaveBeenCalledWith(0);
      expect(chainable.limit).toHaveBeenCalledWith(50);
    });
  });

  describe('incrementProgress', () => {
    it('should increment completedPermutations', async () => {
      modelMock.updateOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      });

      await service.incrementProgress(jobId, 'completedPermutations');
      expect(modelMock.updateOne).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(jobId) },
        { $inc: { completedPermutations: 1 } },
      );
    });

    it('should increment failedPermutations', async () => {
      modelMock.updateOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({}),
      });

      await service.incrementProgress(jobId, 'failedPermutations');
      expect(modelMock.updateOne).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(jobId) },
        { $inc: { failedPermutations: 1 } },
      );
    });

    it('should throw and log on updateOne failure', async () => {
      modelMock.updateOne.mockReturnValue({
        exec: vi.fn().mockRejectedValue(new Error('DB error')),
      });

      await expect(
        service.incrementProgress(jobId, 'completedPermutations'),
      ).rejects.toThrow('DB error');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('should update job status', async () => {
      modelMock.updateOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({}),
      });

      await service.updateStatus(jobId, 'completed' as never);
      expect(modelMock.updateOne).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(jobId) },
        { $set: { status: 'completed' } },
      );
    });

    it('should throw and log on failure', async () => {
      modelMock.updateOne.mockReturnValue({
        exec: vi.fn().mockRejectedValue(new Error('Write failed')),
      });

      await expect(
        service.updateStatus(jobId, 'failed' as never),
      ).rejects.toThrow('Write failed');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('addError', () => {
    it('should push error to uploadErrors array', async () => {
      modelMock.updateOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({}),
      });

      const err = { index: 0, message: 'Upload failed' };
      await service.addError(jobId, err as never);
      expect(modelMock.updateOne).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(jobId) },
        { $push: { uploadErrors: err } },
      );
    });

    it('should throw and log when push fails', async () => {
      modelMock.updateOne.mockReturnValue({
        exec: vi.fn().mockRejectedValue(new Error('Push failed')),
      });

      await expect(
        service.addError(jobId, { message: 'err' } as never),
      ).rejects.toThrow('Push failed');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });
});
