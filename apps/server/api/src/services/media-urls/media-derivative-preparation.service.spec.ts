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

  it('does not redownload or render an already ready variant', async () => {
    const { service, prisma, files, queue } = await setup();
    prisma.mediaDeliveryVariant.upsert.mockResolvedValue({
      id: testId('variant', 1),
      state: 'READY',
    });
    prisma.mediaDeliveryVariant.findFirst.mockResolvedValue({ state: 'READY' });
    await service.enqueue(data.organizationId, source.id);
    await service.process(data);
    expect(queue.add).not.toHaveBeenCalled();
    expect(files.watermarkExport).not.toHaveBeenCalled();
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
  });
});
