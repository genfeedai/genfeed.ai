import { ConfigService } from '@api/config/config.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FileQueueService } from '@api/services/file-queue/file-queue.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { CreditTransactionsService } from '@credits/services/credit-transactions.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Types } from 'mongoose';
import { of } from 'rxjs';
import { vi } from 'vitest';

export const mockLoggerService = (): Partial<LoggerService> => ({
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  verbose: vi.fn(),
  warn: vi.fn(),
});

export const mockConfigService = (
  config: Record<string, unknown> = {},
): Partial<ConfigService> => ({
  get: vi.fn((key: string) => config[key]),
  getNumber: vi.fn((key: string) => Number(config[key])),
});

export const mockCacheService = (): Partial<CacheService> => ({
  clear: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(false),
  generateKey: vi.fn((...args: string[]) => args.join(':')),
  get: vi.fn().mockResolvedValue(null),
  getTtl: vi.fn().mockResolvedValue(-1),
  invalidateByTags: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(true),
});

export const mockRepository = <T = any>() => ({
  aggregate: vi.fn().mockResolvedValue([]),
  count: vi.fn().mockResolvedValue(0),
  countDocuments: vi.fn().mockResolvedValue(0),
  create: vi.fn((data: T) => data),
  delete: vi.fn().mockResolvedValue({ acknowledged: true }),
  exec: vi.fn().mockResolvedValue(null),
  find: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  findByIdAndDelete: vi.fn().mockResolvedValue(null),
  findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  findOne: vi.fn().mockResolvedValue(null),
  findOneAndUpdate: vi.fn().mockResolvedValue(null),
  lean: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  populate: vi.fn().mockReturnThis(),
  save: vi.fn((data: T) => Promise.resolve({ ...data, _id: 'mock-id' })),
  skip: vi.fn().mockReturnThis(),
  sort: vi.fn().mockReturnThis(),
  update: vi.fn().mockResolvedValue({ acknowledged: true }),
});

export const mockModel = <T = any>() => {
  const mock = mockRepository<T>();
  return {
    ...mock,
    aggregatePaginate: vi.fn().mockResolvedValue({
      docs: [],
      hasNextPage: false,
      hasPrevPage: false,
      limit: 10,
      page: 1,
      totalDocs: 0,
      totalPages: 0,
    }),
    new: vi.fn((data: T) => ({
      ...data,
      save: vi.fn().mockResolvedValue({ ...data, _id: 'mock-id' }),
      toObject: vi.fn(() => data),
    })),
  };
};

export const mockRequest = (overrides: unknown = {}) => ({
  body: {},
  headers: {},
  params: {},
  query: {},
  user: { email: 'test@example.com', id: 'user-id' },
  ...overrides,
});

export const mockResponse = () => {
  const res: unknown = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.sendStatus = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
};

export const mockNext = vi.fn();

export const mockClerkService = (): Partial<ClerkService> => ({
  getUser: vi.fn().mockResolvedValue({
    emailAddresses: [{ emailAddress: 'test@example.com' }],
    id: 'clerk-user-id',
    publicMetadata: {
      organization: 'org-id',
      user: 'user-id',
    },
  }),
  updateUser: vi.fn().mockResolvedValue({}),
  updateUserPrivateMetadata: vi.fn().mockResolvedValue({}),
  updateUserPublicMetadata: vi.fn().mockResolvedValue({}),
});

export const mockFileQueueService = (): Partial<FileQueueService> => ({
  getJobStatus: vi.fn().mockResolvedValue({
    progress: 100,
    status: 'completed',
  }),
  processFile: vi.fn().mockResolvedValue({
    ingredientId: 'test-ingredient-id',
    jobId: 'test-file-job-id',
    status: 'completed',
    type: 'test-file-type',
  }),
  processVideo: vi.fn().mockResolvedValue({
    ingredientId: 'test-ingredient-id',
    jobId: 'test-job-id',
    status: 'completed',
    type: 'test-type',
  }),
  waitForJob: vi.fn().mockResolvedValue({
    s3Key: 'test-key',
    success: true,
    url: 'https://example.com/result.mp4',
  }),
});

export const mockCreditTransactionsService =
  (): Partial<CreditTransactionsService> => ({
    createTransactionEntry: vi.fn().mockResolvedValue({
      _id: new Types.ObjectId(),
      amount: 100,
      balanceAfter: 100,
      balanceBefore: 0,
      createdAt: new Date(),
      description: 'Credit purchase',
      organization: new Types.ObjectId(),
      source: 'stripe',
      type: 'purchase',
    }),
    getExpiredCredits: vi.fn().mockResolvedValue([]),
    getOrganizationTransactions: vi.fn().mockResolvedValue([]),
    getTransactionsByType: vi.fn().mockResolvedValue([]),
    markCreditsAsExpired: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
  });

export const mockHttpService = (): Partial<HttpService> => ({
  delete: vi.fn().mockReturnValue(
    of({
      config: {},
      data: {},
      headers: {},
      status: 200,
      statusText: 'OK',
    }),
  ),
  get: vi.fn().mockReturnValue(
    of({
      config: {},
      data: {},
      headers: {},
      status: 200,
      statusText: 'OK',
    }),
  ),
  patch: vi.fn().mockReturnValue(
    of({
      config: {},
      data: {},
      headers: {},
      status: 200,
      statusText: 'OK',
    }),
  ),
  post: vi.fn().mockReturnValue(
    of({
      config: {},
      data: {},
      headers: {},
      status: 200,
      statusText: 'OK',
    }),
  ),
  put: vi.fn().mockReturnValue(
    of({
      config: {},
      data: {},
      headers: {},
      status: 200,
      statusText: 'OK',
    }),
  ),
});

export const mockPublicMetadata = (): unknown => ({
  email: 'test@example.com',
  isOwner: true,
  organization: new Types.ObjectId().toString(),
  user: new Types.ObjectId().toString(),
});

export const mockPaginatedResult = <T = any>(docs: T[] = []) => ({
  docs,
  hasNextPage: false,
  hasPrevPage: false,
  limit: 10,
  nextPage: null,
  page: 1,
  pagingCounter: 1,
  prevPage: null,
  totalDocs: docs.length,
  totalPages: Math.ceil(docs.length / 10) || 1,
});

export const createMockObjectId = () => new Types.ObjectId();

export const mockAsyncIterator = <T>(items: T[]) => {
  let index = 0;
  return {
    async *[Symbol.asyncIterator]() {
      while (index < items.length) {
        yield await Promise.resolve(items[index++]);
      }
    },
  };
};

export const mockFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File => ({
  buffer: Buffer.from('test'),
  destination: '/tmp',
  encoding: '7bit',
  fieldname: 'file',
  filename: 'test.jpg',
  mimetype: 'image/jpeg',
  originalname: 'test.jpg',
  path: '/tmp/test.jpg',
  size: 1024,
  stream: null,
  ...overrides,
});
