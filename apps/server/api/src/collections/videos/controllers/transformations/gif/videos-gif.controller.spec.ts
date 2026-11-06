import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The controller only needs these collaborators as injection tokens; keep
// their heavy modules out of the test.
vi.mock('@api/collections/ingredients/services/ingredients.service', () => ({
  IngredientsService: class {},
}));
vi.mock('@api/collections/metadata/services/metadata.service', () => ({
  MetadataService: class {},
}));
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock('@api/shared/services/shared/shared.service', () => ({
  SharedService: class {},
}));
vi.mock('@api/collections/videos/services/videos.service', () => ({
  VideosService: class {},
}));
// Serialization is out of scope: hand back the ingredient the controller made.
vi.mock(
  '@api/helpers/utils/response/response.util',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >()),
    serializeSingle: (_req: unknown, _serializer: unknown, data: unknown) =>
      data,
  }),
);

import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideosGifController } from '@api/collections/videos/controllers/transformations/gif/videos-gif.controller';
import type { VideosService } from '@api/collections/videos/services/videos.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type { SharedService } from '@api/shared/services/shared/shared.service';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

type Row = Record<string, unknown> & { id: string };

interface GifJob {
  options: Record<string, unknown>;
  settle?: {
    reject: (error: Error) => void;
    resolve: (result: Record<string, unknown>) => void;
  };
  source: string;
  videoId: string;
}

const user = {
  brandId: 'brand-user',
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as User;
const req = { originalUrl: '/api/videos' } as Request;

// The upload chain runs detached from the request; let it finish.
const settle = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

describe('VideosGifController', () => {
  let errors: string[];
  let ingredients: Row[];
  let isAuthorizedDelivery: boolean;
  let grants: Map<string, string>;
  let jobs: Map<string, GifJob>;
  let metadata: Map<string, Row>;
  let uploads: Map<string, string>;
  let videos: Row[];
  let controller: VideosGifController;

  const video = (fields: Partial<Row> = {}): Row => ({
    brandId: 'brand-video',
    id: 'video-1',
    isDeleted: false,
    organizationId: 'org-1',
    ...fields,
  });
  const gif = () => ingredients.find((row) => row.parentId === 'video-1');

  beforeEach(() => {
    errors = [];
    ingredients = [];
    isAuthorizedDelivery = false;
    grants = new Map();
    jobs = new Map();
    metadata = new Map();
    uploads = new Map();
    videos = [video()];

    const config = {
      get ingredientsEndpoint() {
        return 'https://api.example.com/ingredients';
      },
      get isAuthorizedMediaDeliveryEnabled() {
        return isAuthorizedDelivery;
      },
    } as unknown as ConfigService;
    // The file queue: a GIF job runs until the test finishes or fails it.
    const queue = {
      createGif: async (
        videoId: string,
        source: string,
        options: Record<string, unknown>,
      ) => {
        const jobId = `job-${jobs.size + 1}`;
        jobs.set(jobId, { options, source, videoId });
        return { jobId };
      },
      waitForJob: (jobId: string) =>
        new Promise((resolve, reject) => {
          const job = jobs.get(jobId);
          if (job) {
            job.settle = { reject, resolve };
          }
        }),
    } as unknown as FileQueueService;
    const files = {
      uploadToS3: async (
        key: string,
        folder: string,
        file: { path: string },
      ) => {
        uploads.set(`${folder}/${key}`, file.path);
        return { s3Key: `ingredients/${folder}/${key}.gif` };
      },
    } as unknown as FilesClientService;
    const ingredientsService = {
      patch: async (id: string, data: Row) =>
        Object.assign(ingredients.find((row) => row.id === id) ?? {}, data),
    } as unknown as IngredientsService;
    const metadataService = {
      patch: async (id: string, data: Row) => {
        Object.assign(metadata.get(id) ?? {}, data);
      },
    } as unknown as MetadataService;
    const shared = {
      createMediaDocuments: async (_user: User, data: Row) => {
        const ingredientData = { ...data, id: `gif-${ingredients.length + 1}` };
        const metadataData = { id: `metadata-${metadata.size + 1}` };
        ingredients.push(ingredientData);
        metadata.set(metadataData.id, metadataData);
        return { ingredientData, metadataData };
      },
    } as unknown as SharedService;
    const videosService = {
      findOne: async (where: Row) =>
        videos.find((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ) ?? null,
    } as unknown as VideosService;
    const authorizedUrls = {
      issueServerPublish: async (_organizationId: string, ids: string[]) =>
        new Map(
          ids.flatMap((id) => {
            const url = grants.get(id);
            return url ? [[id, url] as const] : [];
          }),
        ),
    } as unknown as AuthorizedMediaUrlService;
    const logger = {
      error: (message: string) => {
        errors.push(message);
      },
    } as unknown as LoggerService;

    controller = new VideosGifController(
      config,
      queue,
      files,
      ingredientsService,
      logger,
      metadataService,
      shared,
      videosService,
      authorizedUrls,
    );
  });

  it('queues a 480px 10fps GIF of an own video and answers with the processing GIF', async () => {
    const created = await controller.createGif(req, user, 'video-1');

    expect(jobs.get('job-1')).toMatchObject({
      options: { fps: 10, width: 480 },
      source: 'https://api.example.com/ingredients/videos/video-1',
      videoId: 'video-1',
    });
    expect(created).toEqual({
      brandId: 'brand-video',
      category: IngredientCategory.GIF,
      extension: MetadataExtension.GIF,
      externalId: 'job-1',
      externalProvider: 'video-to-gif',
      id: 'gif-1',
      label: expect.any(String),
      origin: expect.anything(),
      parentId: 'video-1',
      scope: AssetScope.USER,
      status: IngredientStatus.PROCESSING,
    });
  });

  it('files the GIF under the user brand when the video has none', async () => {
    videos = [video({ brandId: null })];

    await controller.createGif(req, user, 'video-1');

    expect(gif()?.brandId).toBe('brand-user');
  });

  it('uploads the finished GIF and marks it generated', async () => {
    await controller.createGif(req, user, 'video-1');

    jobs.get('job-1')?.settle?.resolve({
      height: 270,
      outputPath: '/tmp/video-1.gif',
      width: 480,
    });
    await settle();

    expect(uploads).toEqual(new Map([['gifs/gif-1', '/tmp/video-1.gif']]));
    expect(gif()).toMatchObject({
      s3Key: 'ingredients/gifs/gif-1.gif',
      status: IngredientStatus.GENERATED,
    });
    expect(metadata.get('metadata-1')).toMatchObject({
      height: 270,
      width: 480,
    });
  });

  it('logs a failed GIF job and leaves the GIF processing', async () => {
    await controller.createGif(req, user, 'video-1');

    jobs.get('job-1')?.settle?.reject(new Error('ffmpeg crashed'));
    await settle();

    expect(gif()?.status).toBe(IngredientStatus.PROCESSING);
    expect(uploads.size).toBe(0);
    expect(errors).toEqual(['error uploading video']);
  });

  it.each([
    ['another organization', { organizationId: 'org-2' }],
    ['a deleted video', { isDeleted: true }],
  ])('answers 404 for %s and queues nothing', async (_case, fields) => {
    videos = [video(fields)];

    await expect(
      controller.createGif(req, user, 'video-1'),
    ).rejects.toMatchObject({
      response: {
        detail: "VideosGifController video-1 doesn't exist",
        title: 'VideosGifController not found',
      },
      status: HttpStatus.NOT_FOUND,
    });
    expect(jobs.size).toBe(0);
    expect(ingredients).toEqual([]);
  });

  it('reads the source from a fresh authorized URL when authorized delivery is on', async () => {
    isAuthorizedDelivery = true;
    grants.set('video-1', 'https://authorized.test/source?signature=grant');

    await controller.createGif(req, user, 'video-1');

    expect(jobs.get('job-1')?.source).toBe(
      'https://authorized.test/source?signature=grant',
    );
  });

  it('queues nothing when the source has no authorized URL', async () => {
    isAuthorizedDelivery = true;

    await expect(controller.createGif(req, user, 'video-1')).rejects.toThrow(
      'The source video has no authorized media URL',
    );
    expect(jobs.size).toBe(0);
    expect(ingredients).toEqual([]);
  });
});
