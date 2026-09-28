import type { AddressInfo } from 'node:net';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { FileQueueService as ApiFileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ConfigService as FilesConfigService } from '@files/config/config.service';
import { FilesController } from '@files/controllers/files.controller';
import { FileQueueService as FilesFileQueueService } from '@files/queues/file-queue.service';
import { ImageQueueService } from '@files/queues/image-queue.service';
import { VideoQueueService } from '@files/queues/video-queue.service';
import { YoutubeQueueService } from '@files/queues/youtube-queue.service';
import { HookRemixService } from '@files/services/hook-remix/hook-remix.service';
import type { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * #5460 lost-job recovery depends on how the files service answers for a job
 * it no longer holds. This drives the real FilesController over HTTP and
 * reads it through the real API queue client, so neither side can assume the
 * other's response shape.
 */
describe('files job status over HTTP', () => {
  let app: INestApplication;
  let client: ApiFileQueueService;
  const liveJob = {
    data: { ingredientId: 'output-1' },
    failedReason: undefined,
    getState: vi.fn().mockResolvedValue('active'),
    id: 'stitch-output-1',
    progress: 40,
    returnvalue: undefined,
  };
  const queueWith = (jobs: Record<string, unknown>) => ({
    getJob: vi.fn(async (id: string) => jobs[id] ?? null),
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [
        { provide: FilesConfigService, useValue: { get: () => undefined } },
        { provide: FilesFileQueueService, useValue: queueWith({}) },
        { provide: HookRemixService, useValue: {} },
        { provide: ImageQueueService, useValue: queueWith({}) },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        {
          provide: VideoQueueService,
          useValue: queueWith({ 'stitch-output-1': liveJob }),
        },
        { provide: YoutubeQueueService, useValue: queueWith({}) },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    const { default: realAxios } =
      await vi.importActual<typeof import('axios')>('axios');

    client = new ApiFileQueueService(
      {
        get: (key: string) =>
          key === 'GENFEEDAI_MICROSERVICES_FILES_URL'
            ? `http://127.0.0.1:${port}`
            : undefined,
      } as unknown as ConfigService,
      // Real axios: the suite-wide mock blocks outbound calls, and this client
      // only ever reaches the loopback server above.
      new HttpService(realAxios.create()),
      {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      {} as CredentialsService,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers a missing job with a 404 that the queue client reads as gone', async () => {
    const response = await fetch(
      `${await app.getUrl()}/v1/files/job/stitch-lost`,
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Job not found',
    });

    await expect(client.findJobStatus('stitch-lost')).resolves.toBeNull();
  });

  it('returns the status of a job the files service holds', async () => {
    await expect(
      client.findJobStatus('stitch-output-1'),
    ).resolves.toMatchObject({ jobId: 'stitch-output-1', state: 'active' });
  });
});
