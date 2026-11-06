import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import type { MemoryMonitorService } from '@api/helpers/memory/monitor/memory-monitor.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import type { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

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

type QueuedFile = { organizationId: string; params: Record<string, unknown> };

describe('Training source media delivery', () => {
  it('queues canonical keys and mints archive access from its actual upload identity', async () => {
    const organizationId = 'org-training';
    const sources = Array.from({ length: 10 }, (_, index) => ({
      id: `image-${index}`,
      metadata: { extension: 'jpg' },
    }));
    const sourceReads: { ids: string[]; organizationId: string }[] = [];
    const queued: QueuedFile[] = [];
    const uploads: { folder: string; key: string }[] = [];
    const presignedKeys: string[] = [];
    const authorizedMedia = {
      readSources: async (organization: string, ids: string[]) => {
        sourceReads.push({ ids, organizationId: organization });
        return ids.map((id) => ({
          category: IngredientCategory.IMAGE,
          id,
          s3Key: `ingredients/images/random-${id}%2F?.jpg`,
        }));
      },
    };
    const files = {
      getPresignedDownloadUrlForObjectKey: async (key: string) => {
        presignedKeys.push(key);
        return 'https://s3.example/archive?Signature=fresh';
      },
      uploadToS3: async (key: string, folder: string) => {
        uploads.push({ folder, key });
        return { s3Key: 'ingredients/trainings/actual-random-key.zip' };
      },
    };
    const queue = {
      processFile: async (job: QueuedFile) => {
        queued.push(job);
        return { jobId: `source-download-${queued.length}` };
      },
      waitForJob: async () => ({ outputPath: '/tmp/training-source.jpg' }),
    };
    const silent = () => undefined;
    const unused = {};
    const service = new TrainingsService(
      unused as unknown as PlatformSettingsService,
      unused as unknown as PrismaService,
      { error: silent, log: silent, warn: silent } as unknown as LoggerService,
      { isAuthorizedMediaDeliveryEnabled: true } as unknown as ConfigService,
      files as unknown as FilesClientService,
      queue as unknown as FileQueueService,
      unused as unknown as IngredientsService,
      unused as unknown as ModelsService,
      unused as unknown as ReplicateService,
      unused as unknown as NotificationsPublisherService,
      { checkMemory: silent } as unknown as MemoryMonitorService,
      authorizedMedia as unknown as AuthorizedMediaUrlService,
    );

    await expect(
      service.createTrainingZip('training-1', sources, organizationId),
    ).resolves.toBe('https://s3.example/archive?Signature=fresh');

    expect(sourceReads).toEqual([
      {
        ids: [
          'image-0',
          'image-1',
          'image-2',
          'image-3',
          'image-4',
          'image-5',
          'image-6',
          'image-7',
          'image-8',
          'image-9',
        ],
        organizationId,
      },
    ]);
    expect(queued).toHaveLength(10);
    expect(queued[0]).toEqual(
      expect.objectContaining({
        organizationId,
        params: {
          index: 0,
          sourceStorageKey: 'ingredients/images/random-image-0%2F?.jpg',
          type: 'trainings',
        },
      }),
    );
    expect(uploads).toEqual([
      {
        folder: 'trainings',
        key: expect.stringMatching(/^training-1\/[a-f0-9-]{36}\.zip$/),
      },
    ]);
    expect(presignedKeys).toEqual([
      'ingredients/trainings/actual-random-key.zip',
    ]);
  });
});
