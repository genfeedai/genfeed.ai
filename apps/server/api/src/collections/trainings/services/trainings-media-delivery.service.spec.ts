import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { IngredientCategory } from '@genfeedai/contracts';

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    createReadStream: vi.fn(() => ({})),
    createWriteStream: vi.fn(() => ({
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'close') queueMicrotask(callback);
      }),
    })),
    statSync: vi.fn(() => ({ size: 100 })),
    unlinkSync: vi.fn(),
  },
}));
vi.mock('archiver', () => ({
  ZipArchive: class {
    pipe = vi.fn();
    append = vi.fn();
    finalize = vi.fn();
  },
}));

describe('Training source media delivery', () => {
  it('queues canonical keys and mints archive access from its actual upload identity', async () => {
    const organizationId = 'org-training';
    const sources = Array.from({ length: 10 }, (_, index) => ({
      id: `image-${index}`,
      metadata: { extension: 'jpg' },
    }));
    const readSources = vi.fn().mockResolvedValue(
      sources.map((source) => ({
        id: source.id,
        category: IngredientCategory.IMAGE,
        s3Key: `ingredients/images/random-${source.id}%2F?.jpg`,
      })),
    );
    const files = {
      uploadToS3: vi.fn().mockResolvedValue({
        s3Key: 'ingredients/trainings/actual-random-key.zip',
      }),
      getPresignedDownloadUrlForObjectKey: vi
        .fn()
        .mockResolvedValue('https://s3.example/archive?Signature=fresh'),
    };
    const queue = {
      processFile: vi.fn().mockResolvedValue({ jobId: 'source-download' }),
      waitForJob: vi
        .fn()
        .mockResolvedValue({ outputPath: '/tmp/training-source.jpg' }),
    };
    const service = new TrainingsService(
      {} as never,
      {} as never,
      { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      { isAuthorizedMediaDeliveryEnabled: true } as never,
      files as never,
      queue as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { checkMemory: vi.fn() } as never,
      { readSources } as never,
    );
    await expect(
      service.createTrainingZip('training-1', sources, organizationId),
    ).resolves.toBe('https://s3.example/archive?Signature=fresh');
    expect(readSources).toHaveBeenCalledWith(
      organizationId,
      sources.map((source) => source.id),
    );
    expect(queue.processFile).toHaveBeenCalledTimes(10);
    expect(queue.processFile.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        organizationId,
        params: {
          index: 0,
          type: 'trainings',
          sourceStorageKey: 'ingredients/images/random-image-0%2F?.jpg',
        },
      }),
    );
    expect(files.uploadToS3).toHaveBeenCalledWith(
      expect.stringMatching(/^training-1\/[a-f0-9-]{36}\.zip$/),
      'trainings',
      expect.any(Object),
    );
    expect(files.getPresignedDownloadUrlForObjectKey).toHaveBeenCalledWith(
      'ingredients/trainings/actual-random-key.zip',
    );
  });
});
