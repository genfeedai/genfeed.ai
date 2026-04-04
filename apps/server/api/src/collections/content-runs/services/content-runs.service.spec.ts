import { ContentRun } from '@api/collections/content-runs/schemas/content-run.schema';
import {
  ContentRunsService,
  type CreateContentRunInput,
} from '@api/collections/content-runs/services/content-runs.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ContentRunSource, ContentRunStatus } from '@genfeedai/enums';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

describe('ContentRunsService', () => {
  const orgId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();
  const runId = new Types.ObjectId().toString();

  let service: ContentRunsService;

  const mockModel = {
    create: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentRunsService,
        {
          provide: getModelToken(ContentRun.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get(ContentRunsService);
  });

  describe('createRun', () => {
    const input: CreateContentRunInput = {
      brand: brandId,
      creditsUsed: 10,
      input: { prompt: 'Write a post about AI' },
      organization: orgId,
      skillSlug: 'content-writing',
      source: ContentRunSource.HOSTED,
      status: ContentRunStatus.PENDING,
    };

    it('creates a run with ObjectId-converted brand and org', async () => {
      mockModel.create.mockResolvedValue({ _id: runId, ...input });

      await service.createRun(input);

      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: expect.any(Types.ObjectId),
          creditsUsed: 10,
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
          skillSlug: 'content-writing',
        }),
      );
    });

    it('preserves input data in the created document', async () => {
      mockModel.create.mockResolvedValue({ _id: runId, ...input });

      const result = await service.createRun(input);

      expect(result.skillSlug).toBe('content-writing');
      expect(result.creditsUsed).toBe(10);
    });
  });

  describe('patchRun', () => {
    it('patches a run scoped to org', async () => {
      mockModel.findOneAndUpdate.mockResolvedValue({
        _id: runId,
        status: ContentRunStatus.COMPLETED,
      });

      const result = await service.patchRun(orgId, runId, {
        duration: 5000,
        status: ContentRunStatus.COMPLETED,
      });

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(Types.ObjectId),
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
        }),
        { $set: { duration: 5000, status: ContentRunStatus.COMPLETED } },
        { new: true },
      );
      expect(result.status).toBe(ContentRunStatus.COMPLETED);
    });

    it('throws NotFoundException when run not found', async () => {
      mockModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.patchRun(orgId, runId, {
          error: 'timeout',
          status: ContentRunStatus.FAILED,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('patches with error information on failure', async () => {
      mockModel.findOneAndUpdate.mockResolvedValue({
        _id: runId,
        error: 'Provider timeout',
        status: ContentRunStatus.FAILED,
      });

      const result = await service.patchRun(orgId, runId, {
        error: 'Provider timeout',
        status: ContentRunStatus.FAILED,
      });

      expect(result.error).toBe('Provider timeout');
    });
  });

  describe('listByBrand', () => {
    it('lists runs scoped to org and brand', async () => {
      mockModel.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
        sort: vi.fn().mockReturnThis(),
      });

      await service.listByBrand(orgId, brandId);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: expect.any(Types.ObjectId),
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
        }),
      );
    });

    it('adds skillSlug filter when provided', async () => {
      mockModel.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
        sort: vi.fn().mockReturnThis(),
      });

      await service.listByBrand(orgId, brandId, 'content-writing');

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          skillSlug: 'content-writing',
        }),
      );
    });

    it('adds status filter when provided', async () => {
      mockModel.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
        sort: vi.fn().mockReturnThis(),
      });

      await service.listByBrand(
        orgId,
        brandId,
        undefined,
        ContentRunStatus.COMPLETED,
      );

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ContentRunStatus.COMPLETED,
        }),
      );
    });

    it('does not include skillSlug/status when not provided', async () => {
      mockModel.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
        sort: vi.fn().mockReturnThis(),
      });

      await service.listByBrand(orgId, brandId);

      const query = mockModel.find.mock.calls[0][0];
      expect(query).not.toHaveProperty('skillSlug');
      expect(query).not.toHaveProperty('status');
    });

    it('sorts results by createdAt descending', async () => {
      const sortMock = vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      });
      mockModel.find.mockReturnValue({ sort: sortMock });

      await service.listByBrand(orgId, brandId);

      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
    });
  });

  describe('getRunById', () => {
    it('finds a run by id scoped to org', async () => {
      mockModel.findOne.mockResolvedValue({
        _id: runId,
        status: ContentRunStatus.COMPLETED,
      });

      const result = await service.getRunById(orgId, runId);

      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(Types.ObjectId),
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
        }),
      );
      expect(result?.status).toBe(ContentRunStatus.COMPLETED);
    });

    it('returns null when run not found', async () => {
      mockModel.findOne.mockResolvedValue(null);

      const result = await service.getRunById(orgId, runId);
      expect(result).toBeNull();
    });
  });
});
