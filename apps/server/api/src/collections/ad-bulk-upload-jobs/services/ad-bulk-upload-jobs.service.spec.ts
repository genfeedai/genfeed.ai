import type { ServerLogger, ServerPrisma } from '@api/server.dependencies';
import { AdBulkUploadJobsService } from './ad-bulk-upload-jobs.service';

const NOW = new Date('2026-08-01T00:00:00.000Z');

function makeRow(
  data: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return {
    brandId: 'brand-1',
    createdAt: NOW,
    credentialId: 'cred-1',
    data,
    id: 'job-1',
    isDeleted: false,
    organizationId: 'org-1',
    updatedAt: NOW,
    ...overrides,
  };
}

describe('AdBulkUploadJobsService', () => {
  const create = vi.fn();
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const findUnique = vi.fn();
  const update = vi.fn();
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;
  const prisma = {
    adBulkUploadJob: { create, findFirst, findMany, findUnique, update },
  } as unknown as Pick<ServerPrisma, 'adBulkUploadJob'>;
  const service = new AdBulkUploadJobsService(prisma, logger);

  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue({});
  });

  describe('create', () => {
    it('lifts relation ids to columns and packs the rest into the JSON column', async () => {
      create.mockImplementation((args: { data: { data: unknown } }) =>
        makeRow(args.data.data as Record<string, unknown>),
      );

      const job = await service.create({
        brandId: 'brand-1',
        credentialId: 'cred-1',
        organizationId: 'org-1',
        status: 'pending',
        totalPermutations: 4,
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          brandId: 'brand-1',
          credentialId: 'cred-1',
          data: { status: 'pending', totalPermutations: 4 },
          organizationId: 'org-1',
        },
      });
      expect(job.totalPermutations).toBe(4);
      expect(job.organizationId).toBe('org-1');
      expect(job.brandId).toBe('brand-1');
      expect(job.credentialId).toBe('cred-1');
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('created bulk upload job job-1'),
      );
    });

    it('drops undefined values from the JSON payload', async () => {
      create.mockImplementation((args: { data: { data: unknown } }) =>
        makeRow(args.data.data as Record<string, unknown>),
      );

      await service.create({
        organizationId: 'org-1',
        status: undefined,
        totalPermutations: 2,
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({ data: { totalPermutations: 2 } }),
      });
    });

    it('leaves non-string relation ids off the columns', async () => {
      create.mockImplementation((args: { data: { data: unknown } }) =>
        makeRow(args.data.data as Record<string, unknown>, {
          brandId: null,
          credentialId: null,
        }),
      );

      const job = await service.create({
        brandId: 42,
        credentialId: null,
        organizationId: 'org-1',
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          brandId: undefined,
          credentialId: undefined,
        }),
      });
      expect(job.brandId).toBeNull();
      expect(job.credentialId).toBeNull();
    });

    it('rejects a payload without a tenant id', async () => {
      await expect(service.create({ organizationId: '' })).rejects.toThrowError(
        'Ad bulk upload job requires organizationId',
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('logs and rethrows persistence failures', async () => {
      const dbError = new Error('insert failed');
      create.mockRejectedValue(dbError);

      await expect(
        service.create({ organizationId: 'org-1' }),
      ).rejects.toThrowError(dbError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        dbError,
      );
    });
  });

  describe('findById', () => {
    it('scopes the lookup to the tenant', async () => {
      findFirst.mockResolvedValue(null);

      await expect(service.findById('job-1', 'org-1')).resolves.toBeNull();
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'job-1', isDeleted: false, organizationId: 'org-1' },
      });
    });

    it('normalises counters and status defaults', async () => {
      findFirst.mockResolvedValue(makeRow({}));

      const job = await service.findById('job-1', 'org-1');

      expect(job).toMatchObject({
        completedPermutations: 0,
        failedPermutations: 0,
        status: 'pending',
        totalPermutations: 0,
        uploadErrors: [],
      });
    });

    it('falls back to pending for an unrecognised status', async () => {
      findFirst.mockResolvedValue(makeRow({ status: 'exploded' }));

      const job = await service.findById('job-1', 'org-1');

      expect(job?.status).toBe('pending');
    });

    it.each([
      ['pending'],
      ['processing'],
      ['completed'],
      ['failed'],
      ['cancelled'],
      ['partial'],
    ])('preserves the known status %s', async (status) => {
      findFirst.mockResolvedValue(makeRow({ status }));

      const job = await service.findById('job-1', 'org-1');

      expect(job?.status).toBe(status);
    });

    it('treats a non-object JSON column as empty', async () => {
      findFirst.mockResolvedValue(makeRow([] as unknown as never));

      const job = await service.findById('job-1', 'org-1');

      expect(job?.data).toEqual({});
      expect(job?.status).toBe('pending');
    });

    it('keeps only well-formed upload errors', async () => {
      findFirst.mockResolvedValue(
        makeRow({
          uploadErrors: [
            {
              message: 'bad creative',
              permutationIndex: 2,
              timestamp: '2026-07-01T00:00:00.000Z',
            },
            { message: 'missing index' },
            { permutationIndex: 3 },
            'not-an-object',
          ],
        }),
      );

      const job = await service.findById('job-1', 'org-1');

      expect(job?.uploadErrors).toEqual([
        {
          message: 'bad creative',
          permutationIndex: 2,
          timestamp: '2026-07-01T00:00:00.000Z',
        },
      ]);
    });

    it('backfills a timestamp for an error that carries none', async () => {
      findFirst.mockResolvedValue(
        makeRow({
          uploadErrors: [{ message: 'boom', permutationIndex: 0 }],
        }),
      );

      const job = await service.findById('job-1', 'org-1');

      expect(job?.uploadErrors?.[0].timestamp).toEqual(expect.any(String));
    });

    it('preserves a Date timestamp on an upload error', async () => {
      findFirst.mockResolvedValue(
        makeRow({
          uploadErrors: [
            { message: 'boom', permutationIndex: 0, timestamp: NOW },
          ],
        }),
      );

      const job = await service.findById('job-1', 'org-1');

      expect(job?.uploadErrors?.[0].timestamp).toEqual(NOW);
    });

    it('yields an empty error list when the column holds a non-array', async () => {
      findFirst.mockResolvedValue(makeRow({ uploadErrors: 'nope' }));

      const job = await service.findById('job-1', 'org-1');

      expect(job?.uploadErrors).toEqual([]);
    });
  });

  describe('findByOrganization', () => {
    beforeEach(() => {
      findMany.mockResolvedValue([
        makeRow({ status: 'pending' }, { id: 'job-1' }),
        makeRow({ status: 'completed' }, { id: 'job-2' }),
        makeRow({ status: 'pending' }, { id: 'job-3' }),
      ]);
    });

    it('scopes the query to the tenant and orders newest first', async () => {
      await service.findByOrganization('org-1');

      expect(findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 50,
        where: { isDeleted: false, organizationId: 'org-1' },
      });
    });

    it('filters by status before pagination', async () => {
      findMany.mockResolvedValue([
        makeRow({ status: 'pending' }, { id: 'job-1' }),
        makeRow({ status: 'pending' }, { id: 'job-3' }),
      ]);
      const jobs = await service.findByOrganization('org-1', {
        status: 'pending',
      });

      expect(jobs.map((job) => job.id)).toEqual(['job-1', 'job-3']);
      expect(findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 50,
        where: {
          data: { equals: 'pending', path: ['status'] },
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('applies offset and limit in the persistence query', async () => {
      findMany.mockResolvedValue([
        makeRow({ status: 'completed' }, { id: 'job-2' }),
      ]);
      const jobs = await service.findByOrganization('org-1', {
        limit: 1,
        offset: 1,
      });

      expect(jobs.map((job) => job.id)).toEqual(['job-2']);
      expect(findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        skip: 1,
        take: 1,
        where: { isDeleted: false, organizationId: 'org-1' },
      });
    });
  });

  describe('incrementProgress', () => {
    it('starts the counter at 1 when the job has none', async () => {
      findUnique.mockResolvedValue(makeRow({}));

      await service.incrementProgress('job-1', 'completedPermutations');

      expect(update).toHaveBeenCalledWith({
        data: { data: { completedPermutations: 1 } },
        where: { id: 'job-1' },
      });
    });

    it('increments an existing counter', async () => {
      findUnique.mockResolvedValue(makeRow({ failedPermutations: 3 }));

      await service.incrementProgress('job-1', 'failedPermutations');

      expect(update).toHaveBeenCalledWith({
        data: { data: { failedPermutations: 4 } },
        where: { id: 'job-1' },
      });
    });

    it('writes a fresh counter when the job row is missing', async () => {
      findUnique.mockResolvedValue(null);

      await service.incrementProgress('job-1', 'completedPermutations');

      expect(update).toHaveBeenCalledWith({
        data: { data: { completedPermutations: 1 } },
        where: { id: 'job-1' },
      });
    });

    it('logs and rethrows write failures', async () => {
      const dbError = new Error('update failed');
      findUnique.mockResolvedValue(makeRow({}));
      update.mockRejectedValue(dbError);

      await expect(
        service.incrementProgress('job-1', 'completedPermutations'),
      ).rejects.toThrowError(dbError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed for job job-1'),
        dbError,
      );
    });
  });

  describe('updateStatus', () => {
    it('merges the new status into the existing JSON column', async () => {
      findUnique.mockResolvedValue(makeRow({ totalPermutations: 5 }));

      await service.updateStatus('job-1', 'completed');

      expect(update).toHaveBeenCalledWith({
        data: { data: { status: 'completed', totalPermutations: 5 } },
        where: { id: 'job-1' },
      });
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('updated job job-1 status to completed'),
      );
    });

    it('logs and rethrows write failures', async () => {
      const dbError = new Error('update failed');
      findUnique.mockRejectedValue(dbError);

      await expect(
        service.updateStatus('job-1', 'failed'),
      ).rejects.toThrowError(dbError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed for job job-1'),
        dbError,
      );
    });
  });

  describe('addError', () => {
    it('appends to the existing error list and serialises a Date timestamp', async () => {
      findUnique.mockResolvedValue(
        makeRow({
          uploadErrors: [
            {
              message: 'first',
              permutationIndex: 0,
              timestamp: '2026-07-01T00:00:00.000Z',
            },
          ],
        }),
      );

      await service.addError('job-1', {
        message: 'second',
        permutationIndex: 1,
        timestamp: NOW,
      });

      expect(update).toHaveBeenCalledWith({
        data: {
          data: {
            uploadErrors: [
              {
                message: 'first',
                permutationIndex: 0,
                timestamp: '2026-07-01T00:00:00.000Z',
              },
              {
                message: 'second',
                permutationIndex: 1,
                timestamp: '2026-08-01T00:00:00.000Z',
              },
            ],
          },
        },
        where: { id: 'job-1' },
      });
    });

    it('keeps a string timestamp as-is', async () => {
      findUnique.mockResolvedValue(makeRow({}));

      await service.addError('job-1', {
        message: 'boom',
        permutationIndex: 0,
        timestamp: '2026-07-15T10:00:00.000Z',
      });

      expect(update).toHaveBeenCalledWith({
        data: {
          data: {
            uploadErrors: [
              {
                message: 'boom',
                permutationIndex: 0,
                timestamp: '2026-07-15T10:00:00.000Z',
              },
            ],
          },
        },
        where: { id: 'job-1' },
      });
    });

    it('logs and rethrows write failures', async () => {
      const dbError = new Error('update failed');
      findUnique.mockResolvedValue(makeRow({}));
      update.mockRejectedValue(dbError);

      await expect(
        service.addError('job-1', {
          message: 'boom',
          permutationIndex: 0,
          timestamp: NOW,
        }),
      ).rejects.toThrowError(dbError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed for job job-1'),
        dbError,
      );
    });
  });
});
