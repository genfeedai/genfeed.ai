import { CacheClientService } from '@api/services/cache/services/cache-client.service';
import { CacheTagsService } from '@api/services/cache/services/cache-tags.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CacheTagsService', () => {
  let service: CacheTagsService;

  const mockPipeline = {
    del: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
    sAdd: vi.fn().mockReturnThis(),
  };

  const mockRedisClient = {
    del: vi.fn().mockResolvedValue(1),
    multi: vi.fn().mockReturnValue(mockPipeline),
    sMembers: vi.fn().mockResolvedValue([]),
  };

  const mockCacheClientService = {
    instance: mockRedisClient,
  } as unknown as CacheClientService;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPipeline.exec.mockResolvedValue([]);
    mockRedisClient.sMembers.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheTagsService,
        { provide: CacheClientService, useValue: mockCacheClientService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<CacheTagsService>(CacheTagsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should do nothing when tags array is empty', async () => {
    await service.setTags('cache:key', []);
    expect(mockRedisClient.multi).not.toHaveBeenCalled();
  });

  it('should add key to each tag set via pipeline', async () => {
    await service.setTags('posts:123', ['org:abc', 'brand:xyz']);
    expect(mockRedisClient.multi).toHaveBeenCalledOnce();
    expect(mockPipeline.sAdd).toHaveBeenCalledWith('tag:org:abc', 'posts:123');
    expect(mockPipeline.sAdd).toHaveBeenCalledWith(
      'tag:brand:xyz',
      'posts:123',
    );
    expect(mockPipeline.exec).toHaveBeenCalledOnce();
  });

  it('should log error when setTags pipeline fails', async () => {
    mockPipeline.exec.mockRejectedValueOnce(new Error('pipeline error'));
    await service.setTags('key', ['tag1']);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('setTags error'),
      expect.objectContaining({ key: 'key', tags: ['tag1'] }),
    );
  });

  it('should return 0 when tag has no associated keys', async () => {
    mockRedisClient.sMembers.mockResolvedValueOnce([]);
    const count = await service.invalidateByTags(['empty-tag']);
    expect(count).toBe(0);
  });

  it('should delete all keys associated with a tag and the tag set itself', async () => {
    mockRedisClient.sMembers.mockResolvedValueOnce(['key:1', 'key:2']);
    const count = await service.invalidateByTags(['my-tag']);
    expect(count).toBe(2);
    expect(mockPipeline.del).toHaveBeenCalledWith('key:1');
    expect(mockPipeline.del).toHaveBeenCalledWith('key:2');
    expect(mockPipeline.del).toHaveBeenCalledWith('tag:my-tag');
    expect(mockPipeline.exec).toHaveBeenCalledOnce();
  });

  it('should sum counts across multiple tags', async () => {
    mockRedisClient.sMembers
      .mockResolvedValueOnce(['a:1'])
      .mockResolvedValueOnce(['b:1', 'b:2', 'b:3']);
    const count = await service.invalidateByTags(['tag-a', 'tag-b']);
    expect(count).toBe(4);
  });

  it('should log debug when keys were invalidated', async () => {
    mockRedisClient.sMembers.mockResolvedValueOnce(['k1']);
    await service.invalidateByTags(['t1']);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('invalidated 1 keys'),
      expect.objectContaining({ tags: ['t1'] }),
    );
  });

  it('should return 0 and log error when invalidation fails', async () => {
    mockRedisClient.sMembers.mockRejectedValueOnce(new Error('redis down'));
    const count = await service.invalidateByTags(['bad-tag']);
    expect(count).toBe(0);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('invalidateByTags error'),
      expect.objectContaining({ tags: ['bad-tag'] }),
    );
  });
});
