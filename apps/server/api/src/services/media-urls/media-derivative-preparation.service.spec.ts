import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { mediaSourceIdentity } from '@api/services/media-urls/media-delivery-policy.util';
import { MediaDerivativePreparationService } from '@api/services/media-urls/media-derivative-preparation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { MediaDeliverySource } from '@genfeedai/contracts/interfaces';
import { MEDIA_DELIVERY_QUEUE } from '@genfeedai/contracts/queue';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from 'axios';

vi.mock('axios', async (original) => original());

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));

const source: MediaDeliverySource = {
  brandId: null,
  category: 'IMAGE',
  fileSize: 100,
  generationCompletedAt: null,
  id: testId('ingredient', 1),
  isPublic: false,
  metadataId: null,
  mimeType: 'image/png',
  organizationId: testId('org', 1),
  s3Key: 'ingredients/images/random-source.png',
  scope: 'USER',
  userId: testId('user', 1),
  version: 1,
};
const data = {
  organizationId: source.organizationId as string,
  ingredientId: source.id,
  sourceIdentity: mediaSourceIdentity(source),
  purpose: 'preview' as const,
};

function filesFailure(status: number, body: unknown): AxiosError<unknown> {
  return new AxiosError(
    `Request failed with status code ${status}`,
    undefined,
    undefined,
    undefined,
    {
      config: { headers: new AxiosHeaders() },
      data: body,
      headers: {},
      status,
      statusText: 'Refused',
    },
  );
}

async function setup() {
  const prisma = {
    mediaDeliveryVariant: {
      upsert: vi
        .fn()
        .mockResolvedValue({ id: testId('variant', 1), state: 'PENDING' }),
      findFirst: vi.fn().mockResolvedValue({ state: 'PENDING' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const config = {
    isAuthorizedMediaDeliveryEnabled: true,
    isAuthorizedMediaPreparationEnabled: false,
  };
  const issuer = {
    hasPublicPermission: vi.fn().mockResolvedValue(false),
    readPublicSources: vi.fn().mockResolvedValue([source]),
    readSources: vi.fn().mockResolvedValue([source]),
  };
  const files = {
    watermarkExport: vi
      .fn()
      .mockResolvedValue({ storageKey: 'exports/watermarked/prepared.png' }),
    copyInS3: vi.fn(),
  };
  const queue = { add: vi.fn() };
  const module = await Test.createTestingModule({
    providers: [
      MediaDerivativePreparationService,
      { provide: ConfigService, useValue: config },
      { provide: PrismaService, useValue: prisma },
      { provide: AuthorizedMediaUrlService, useValue: issuer },
      { provide: FilesClientService, useValue: files },
      { provide: getQueueToken(MEDIA_DELIVERY_QUEUE), useValue: queue },
    ],
  }).compile();
  return {
    service: module.get(MediaDerivativePreparationService),
    prisma,
    issuer,
    files,
    queue,
    config,
  };
}

describe('protected derivative preparation', () => {
  it('does no queue or rendering work before activation', async () => {
    const { service, config, prisma, queue, files } = await setup();
    config.isAuthorizedMediaDeliveryEnabled = false;
    await service.enqueue(data.organizationId, source.id);
    await service.process(data);
    expect(prisma.mediaDeliveryVariant.upsert).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(files.watermarkExport).not.toHaveBeenCalled();
  });
  it('supports explicit prewarming before delivery activation', async () => {
    const { service, config, queue } = await setup();
    config.isAuthorizedMediaDeliveryEnabled = false;
    config.isAuthorizedMediaPreparationEnabled = true;
    await service.enqueue(data.organizationId, source.id);
    expect(queue.add).toHaveBeenCalledOnce();
  });

  it('recovers a pending public variant after a failed enqueue using the same durable job identity', async () => {
    const { service, issuer, prisma, queue } = await setup();
    issuer.hasPublicPermission.mockResolvedValue(true);
    prisma.mediaDeliveryVariant.findFirst.mockResolvedValue({
      state: 'PENDING',
    });
    await service.enqueuePublicMissing([source.id], 'public-share');
    expect(queue.add).toHaveBeenCalledOnce();
    prisma.mediaDeliveryVariant.findFirst.mockResolvedValue({
      state: 'FAILED',
    });
    await service.enqueuePublicMissing([source.id], 'public-share');
    expect(queue.add).toHaveBeenCalledOnce();
  });

  it('deduplicates durable source/policy identity and performs no rendering at enqueue', async () => {
    const { service, prisma, queue, files } = await setup();
    await service.enqueue(data.organizationId, source.id);
    expect(prisma.mediaDeliveryVariant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceIdentity: data.sourceIdentity,
          policyVersion: 1,
          purpose: 'preview',
          sourceKey: source.s3Key,
        }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'prepare',
      data,
      expect.objectContaining({
        jobId: `media-delivery-${testId('variant', 1)}`,
      }),
    );
    expect(files.watermarkExport).not.toHaveBeenCalled();
  });

  it('queues a failed preview again on request, but not within the cooldown', async () => {
    const { service, prisma, queue } = await setup();
    prisma.mediaDeliveryVariant.upsert.mockResolvedValue({
      id: testId('variant', 1),
      state: 'FAILED',
      updatedAt: new Date(Date.now() - 5_000),
    });
    await service.enqueue(data.organizationId, source.id);
    expect(queue.add).not.toHaveBeenCalled();

    prisma.mediaDeliveryVariant.upsert.mockResolvedValue({
      id: testId('variant', 1),
      state: 'FAILED',
      updatedAt: new Date(Date.now() - 120_000),
    });
    await service.enqueue(data.organizationId, source.id);
    expect(queue.add).toHaveBeenCalledOnce();
  });

  it.each(['READY', 'UNSUPPORTED'])(
    'does not enqueue, reopen or render an unchanged %s variant',
    async (state) => {
      const { service, prisma, files, queue } = await setup();
      prisma.mediaDeliveryVariant.upsert.mockResolvedValue({
        id: testId('variant', 1),
        state,
      });
      prisma.mediaDeliveryVariant.findFirst.mockResolvedValue({ state });
      await service.enqueue(data.organizationId, source.id);
      await service.process(data);
      await service.enqueue(data.organizationId, source.id);
      await service.process(data);
      expect(queue.add).not.toHaveBeenCalled();
      expect(files.watermarkExport).not.toHaveBeenCalled();
      expect(prisma.mediaDeliveryVariant.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    { message: 'Unsupported media dimensions' },
    'Unsupported media dimensions',
  ])(
    'keeps an explicit unsupported-dimensions refusal terminal',
    async (body) => {
      const { service, prisma, files, queue } = await setup();
      files.watermarkExport.mockRejectedValue(filesFailure(400, body));

      await expect(service.process(data)).resolves.toBeUndefined();
      expect(prisma.mediaDeliveryVariant.updateMany).toHaveBeenLastCalledWith({
        data: {
          failureCode: 'UNSUPPORTED_DIMENSIONS',
          state: 'UNSUPPORTED',
          storageKey: null,
        },
        where: {
          ingredientId: source.id,
          isDeleted: false,
          organizationId: data.organizationId,
          policyVersion: 1,
          purpose: 'preview',
          sourceIdentity: data.sourceIdentity,
        },
      });
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(files.copyInS3).not.toHaveBeenCalled();

      prisma.mediaDeliveryVariant.upsert.mockResolvedValue({
        id: testId('variant', 1),
        state: 'UNSUPPORTED',
      });
      prisma.mediaDeliveryVariant.findFirst.mockResolvedValue({
        state: 'UNSUPPORTED',
      });
      const writes = prisma.mediaDeliveryVariant.updateMany.mock.calls.length;
      for (let access = 0; access < 2; access += 1) {
        await service.enqueue(data.organizationId, source.id);
        await service.process(data);
      }
      expect(queue.add).not.toHaveBeenCalled();
      expect(files.watermarkExport).toHaveBeenCalledOnce();
      expect(prisma.mediaDeliveryVariant.updateMany).toHaveBeenCalledTimes(
        writes,
      );
    },
  );

  it('allows a new source identity after an unsupported variant', async () => {
    const { service, issuer, prisma, queue } = await setup();
    prisma.mediaDeliveryVariant.upsert.mockResolvedValueOnce({
      id: testId('variant', 1),
      state: 'UNSUPPORTED',
    });
    await service.enqueue(data.organizationId, source.id);
    expect(queue.add).not.toHaveBeenCalled();

    const revised = { ...source, version: 2 };
    issuer.readSources.mockResolvedValue([revised]);
    await service.enqueue(data.organizationId, source.id);
    expect(queue.add).toHaveBeenCalledWith(
      'prepare',
      { ...data, sourceIdentity: mediaSourceIdentity(revised) },
      expect.any(Object),
    );
  });

  it.each([
    filesFailure(400, { message: 'Invalid stored object key' }),
    filesFailure(400, {
      message: 'Unsupported media dimensions: extra detail',
    }),
    filesFailure(400, { message: ['Unsupported media dimensions'] }),
    filesFailure(401, { message: 'Unauthorized' }),
    filesFailure(403, { message: 'Forbidden' }),
    filesFailure(404, { message: 'Stored object not found' }),
    filesFailure(429, { message: 'Watermark rendering is busy' }),
    filesFailure(500, { message: 'Unsupported media dimensions' }),
    filesFailure(503, { message: 'Renderer unavailable' }),
    new AxiosError('Connection reset', 'ECONNRESET'),
    new Error('Unsupported media dimensions'),
  ])('preserves failure handling for other errors: %s', async (error) => {
    const { service, prisma, files } = await setup();
    files.watermarkExport.mockRejectedValue(error);
    await expect(service.process(data)).rejects.toBe(error);
    expect(prisma.mediaDeliveryVariant.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          failureCode: 'PREPARATION_FAILED',
          state: 'FAILED',
          storageKey: null,
        },
      }),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ tags: { queue: 'media-delivery' } }),
    );
  });

  it('does not classify a storage-copy error as a renderer refusal', async () => {
    const { service, issuer, prisma, files } = await setup();
    issuer.hasPublicPermission.mockResolvedValue(true);
    const error = filesFailure(400, {
      message: 'Unsupported media dimensions',
    });
    files.copyInS3.mockRejectedValue(error);
    await expect(
      service.process({ ...data, purpose: 'public-share' }),
    ).rejects.toBe(error);
    expect(prisma.mediaDeliveryVariant.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          failureCode: 'PREPARATION_FAILED',
          state: 'FAILED',
          storageKey: null,
        },
      }),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ tags: { queue: 'media-delivery' } }),
    );
  });

  it('reuses an existing protected preview for public derivatives without another original download', async () => {
    const { service, issuer, prisma, files } = await setup();
    issuer.hasPublicPermission.mockResolvedValue(true);
    prisma.mediaDeliveryVariant.findFirst
      .mockResolvedValueOnce({ state: 'PENDING' })
      .mockResolvedValueOnce({
        state: 'READY',
        storageKey: 'exports/watermarked/cached.png',
      });
    await service.process({ ...data, purpose: 'public-share' });
    expect(files.watermarkExport).not.toHaveBeenCalled();
    expect(files.copyInS3).toHaveBeenCalledWith(
      'exports/watermarked/cached.png',
      `public/media/${data.organizationId}/public-share/${data.sourceIdentity}.png`,
    );
  });

  it('renders a platform-protected separate object and stores only canonical variant identity', async () => {
    const { service, prisma, files } = await setup();
    await service.process(data);
    expect(files.watermarkExport).toHaveBeenCalledWith({
      category: 'images',
      storageKey: source.s3Key,
      layers: [{ text: 'Genfeed.ai', position: 'bottom-right', opacity: 0.85 }],
    });
    expect(prisma.mediaDeliveryVariant.updateMany).toHaveBeenLastCalledWith({
      data: {
        failureCode: null,
        state: 'READY',
        storageKey: 'exports/watermarked/prepared.png',
      },
      where: {
        ingredientId: source.id,
        isDeleted: false,
        organizationId: data.organizationId,
        policyVersion: 1,
        purpose: 'preview',
        sourceIdentity: data.sourceIdentity,
      },
    });
  });

  it('rechecks source revision/permission after delay and never substitutes original bytes', async () => {
    const { service, issuer, files } = await setup();
    issuer.readSources.mockResolvedValue([{ ...source, version: 2 }]);
    await service.process(data);
    expect(files.watermarkExport).not.toHaveBeenCalled();
    issuer.readSources.mockResolvedValue([source]);
    await service.process({ ...data, purpose: 'public-share' });
    expect(files.watermarkExport).not.toHaveBeenCalled();
  });

  it('fails closed when preparation fails or the renderer returns an original', async () => {
    const { service, prisma, files } = await setup();
    files.watermarkExport.mockResolvedValue({
      storageKey: source.s3Key as string,
    });
    await expect(service.process(data)).rejects.toThrow(
      'invalid protected variant',
    );
    expect(prisma.mediaDeliveryVariant.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          failureCode: 'PREPARATION_FAILED',
          state: 'FAILED',
          storageKey: null,
        },
      }),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('invalid protected variant'),
      }),
      expect.objectContaining({
        extra: expect.objectContaining({ ingredientId: source.id }),
        tags: { queue: 'media-delivery' },
      }),
    );
  });

  it('reports the files service status and reason when a render is refused', async () => {
    const { service, files } = await setup();
    files.watermarkExport.mockRejectedValue(
      new AxiosError(
        'Request failed with status code 400',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        {
          config: {} as InternalAxiosRequestConfig,
          data: { message: 'Source object is not a supported image' },
          headers: {},
          status: 400,
          statusText: 'Bad Request',
        },
      ),
    );
    await expect(service.process(data)).rejects.toThrow('status code 400');
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          filesReason: 'Source object is not a supported image',
          filesStatus: 400,
          ingredientId: source.id,
        }),
      }),
    );
  });

  it('scopes every variant bulk write to the job organization and live rows', async () => {
    const { service, prisma, files } = await setup();
    await service.process(data);
    files.watermarkExport.mockResolvedValue({
      storageKey: source.s3Key as string,
    });
    await expect(service.process(data)).rejects.toThrow();
    const calls = prisma.mediaDeliveryVariant.updateMany.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const [args] of calls) {
      expect(args.where).toMatchObject({
        isDeleted: false,
        organizationId: data.organizationId,
      });
    }
  });
});
