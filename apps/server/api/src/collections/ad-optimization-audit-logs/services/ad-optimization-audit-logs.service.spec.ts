import { AdOptimizationAuditLogsService } from '@api/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type AdOptimizationAuditLog } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('AdOptimizationAuditLogsService', () => {
  const orgId = 'test-object-id'.toString();

  let service: AdOptimizationAuditLogsService;
  let auditLogModel: {
    create: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const buildFindChain = (returnValue: unknown) => ({
    exec: vi.fn().mockResolvedValue(returnValue),
    lean: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    const modelMock = {
      create: vi.fn(),
      find: vi.fn(),
    };

    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdOptimizationAuditLogsService,
        { provide: PrismaService, useValue: modelMock },
        {
          provide: LoggerService,
          useValue: logger,
        },
      ],
    }).compile();

    service = module.get(AdOptimizationAuditLogsService);
    auditLogModel = module.get(PrismaService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an audit log document and return it', async () => {
      const data: Partial<AdOptimizationAuditLog> = {
        runId: 'run_001',
      } as Partial<AdOptimizationAuditLog>;

      const createdDoc = { _id: 'test-object-id', runId: 'run_001' };
      auditLogModel.create.mockResolvedValue(createdDoc);

      const result = await service.create(data);

      expect(auditLogModel.create).toHaveBeenCalledWith(data);
      expect(result).toEqual(createdDoc);
    });

    it('should log success after creation', async () => {
      const data = { runId: 'run_002' } as Partial<AdOptimizationAuditLog>;
      auditLogModel.create.mockResolvedValue({ _id: 'test-object-id' });

      await service.create(data);

      expect(logger.log).toHaveBeenCalled();
    });

    it('should log error and rethrow when create fails', async () => {
      const data = { runId: 'run_error' } as Partial<AdOptimizationAuditLog>;
      const dbError = new Error('DB write failed');
      auditLogModel.create.mockRejectedValue(dbError);

      await expect(service.create(data)).rejects.toThrow('DB write failed');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should propagate the original error class (not wrap it)', async () => {
      class CustomDbError extends Error {}
      const customError = new CustomDbError('custom');
      auditLogModel.create.mockRejectedValue(customError);

      await expect(
        service.create({} as Partial<AdOptimizationAuditLog>),
      ).rejects.toBeInstanceOf(CustomDbError);
    });
  });

  describe('findByOrganization', () => {
    it('should query with isDeleted:false and org ObjectId, sorted by runDate desc', async () => {
      const mockDocs = [{ _id: 'test-object-id', runId: 'run_1' }];
      auditLogModel.find.mockReturnValue(buildFindChain(mockDocs));

      const result = await service.findByOrganization(orgId);

      expect(auditLogModel.find).toHaveBeenCalledWith({
        isDeleted: false,
        organization: expect.any(string),
      });
      expect(result).toEqual(mockDocs);
    });

    it('should return empty array when no logs exist', async () => {
      auditLogModel.find.mockReturnValue(buildFindChain([]));

      const result = await service.findByOrganization(orgId);

      expect(result).toEqual([]);
    });

    it('should apply limit and offset when params are provided', async () => {
      const chain = buildFindChain([]);
      auditLogModel.find.mockReturnValue(chain);

      await service.findByOrganization(orgId, { limit: 10, offset: 20 });

      expect(chain.skip).toHaveBeenCalledWith(20);
      expect(chain.limit).toHaveBeenCalledWith(10);
    });

    it('should use default limit 50 and offset 0 when params are omitted', async () => {
      const chain = buildFindChain([]);
      auditLogModel.find.mockReturnValue(chain);

      await service.findByOrganization(orgId);

      expect(chain.skip).toHaveBeenCalledWith(0);
      expect(chain.limit).toHaveBeenCalledWith(50);
    });

    it('should use default limit 50 and offset 0 when params object has no fields', async () => {
      const chain = buildFindChain([]);
      auditLogModel.find.mockReturnValue(chain);

      await service.findByOrganization(orgId, {});

      expect(chain.skip).toHaveBeenCalledWith(0);
      expect(chain.limit).toHaveBeenCalledWith(50);
    });

    it('should call sort with runDate: -1', async () => {
      const chain = buildFindChain([]);
      auditLogModel.find.mockReturnValue(chain);

      await service.findByOrganization(orgId);

      expect(chain.sort).toHaveBeenCalledWith({ runDate: -1 });
    });

    it('should call lean() to return plain objects', async () => {
      const chain = buildFindChain([]);
      auditLogModel.find.mockReturnValue(chain);

      await service.findByOrganization(orgId);

      expect(chain.lean).toHaveBeenCalled();
    });
  });
});
