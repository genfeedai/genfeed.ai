import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { HttpException } from '@nestjs/common';
import type { Request } from 'express';

vi.mock('@api/collections/ingredients/services/ingredients.service', () => ({
  IngredientsService: class {},
}));
vi.mock('@api/collections/metadata/services/metadata.service', () => ({
  MetadataService: class {},
}));
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock(
  '@api/services/notifications/publisher/notifications-publisher.service',
  () => ({ NotificationsPublisherService: class {} }),
);
vi.mock('@api/shared/services/shared/shared.service', () => ({
  SharedService: class {},
}));
vi.mock('@api/collections/videos/services/videos.service', () => ({
  VideosService: class {},
}));

import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideosEffectsController } from '@api/collections/videos/controllers/transformations/effects/videos-effects.controller';
import type { VideosService } from '@api/collections/videos/services/videos.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { SharedService } from '@api/shared/services/shared/shared.service';
import {
  IngredientStatus,
  TransformationCategory,
  WebSocketEventType,
} from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

const mockRequest = {
  originalUrl: '/api/videos',
  params: {},
  query: {},
} as unknown as Request;

const brandId = testId('brand');
const organizationId = testId('org');
const userId = testId('user');
const videoId = testId('video');

const mockUser = {
  brandId,
  id: 'user_123',
  organizationId,
  userId,
} as unknown as User;

// A path that cannot exist, so the mirror cleanup takes its warning branch.
const OUTPUT_PATH = '/nonexistent-genfeed-test/video.mp4';

interface Harness {
  controller: VideosEffectsController;
  createdMedia: Array<Record<string, unknown>>;
  errors: string[];
  failures: string[];
  ingredientPatches: Array<{ id: string; update: Record<string, unknown> }>;
  issuedUrls: Array<{ ids: string[]; organizationId: string }>;
  jobs: Array<Record<string, unknown>>;
  published: Array<{ eventType: string; id: string }>;
}

function makeHarness(options: {
  authorizedUrl?: string | Error;
  failMediaCreation?: boolean;
  videos?: Array<{
    brandId: string;
    id: string;
    organizationId: string;
    userId: string;
  }>;
}): Harness {
  const videos = options.videos ?? [
    { brandId, id: videoId, organizationId, userId },
  ];
  const harness: Omit<Harness, 'controller'> = {
    createdMedia: [],
    errors: [],
    failures: [],
    ingredientPatches: [],
    issuedUrls: [],
    jobs: [],
    published: [],
  };

  const configService = {
    ingredientsEndpoint: 'https://api.example.com',
    isAuthorizedMediaDeliveryEnabled: options.authorizedUrl !== undefined,
  };
  const authorizedMediaUrls = {
    issueServerPublish: async (organization: string, ids: string[]) => {
      harness.issuedUrls.push({ ids, organizationId: organization });
      if (options.authorizedUrl instanceof Error) {
        throw options.authorizedUrl;
      }
      return new Map([[videoId, options.authorizedUrl]]);
    },
  };
  const fileQueueService = {
    processVideo: async (job: Record<string, unknown>) => {
      harness.jobs.push(job);
      return { jobId: `job-${harness.jobs.length}` };
    },
    waitForJob: async () => ({ outputPath: OUTPUT_PATH }),
  };
  const filesClientService = {
    uploadToS3: async (id: string) => ({ s3Key: `videos/${id}.mp4` }),
  };
  const ingredientsService = {
    patch: async (id: string, update: Record<string, unknown>) => {
      harness.ingredientPatches.push({ id, update });
    },
  };
  const loggerService = {
    error: (message: string) => {
      harness.errors.push(message);
    },
    log: () => {},
    warn: () => {},
  };
  const sharedService = {
    createMediaDocuments: async (
      _user: User,
      input: Record<string, unknown>,
    ) => {
      if (options.failMediaCreation) {
        throw new Error('DB error');
      }
      harness.createdMedia.push(input);
      const n = harness.createdMedia.length;
      return {
        ingredientData: { id: `ingredient-${n}` },
        metadataData: { id: `metadata-${n}` },
      };
    },
  };
  const videosService = {
    findOne: async (where: { id: string; userId: string }) =>
      videos.find(
        (video) => video.id === where.id && video.userId === where.userId,
      ) ?? null,
  };
  const websocketService = {
    publishMediaFailed: async (url: string) => {
      harness.failures.push(url);
    },
    publishVideoComplete: async (
      _url: string,
      event: { eventType: string; id: string },
    ) => {
      harness.published.push({ eventType: event.eventType, id: event.id });
    },
  };

  const controller = new VideosEffectsController(
    configService as unknown as ConfigService,
    fileQueueService as unknown as FileQueueService,
    filesClientService as unknown as FilesClientService,
    ingredientsService as unknown as IngredientsService,
    loggerService as unknown as LoggerService,
    { patch: async () => undefined } as unknown as MetadataService,
    sharedService as unknown as SharedService,
    videosService as unknown as VideosService,
    websocketService as unknown as NotificationsPublisherService,
    authorizedMediaUrls as unknown as AuthorizedMediaUrlService,
  );
  return { ...harness, controller };
}

describe('VideosEffectsController', () => {
  it('reverses a video into a new generated ingredient and announces it', async () => {
    const harness = makeHarness({});

    await expect(
      harness.controller.reverseVideo(mockRequest, mockUser, videoId),
    ).resolves.toMatchObject({ data: { id: 'ingredient-1' } });

    expect(harness.createdMedia).toEqual([
      expect.objectContaining({
        brandId,
        organizationId,
        parentId: videoId,
        status: IngredientStatus.PROCESSING,
      }),
    ]);
    expect(harness.jobs).toEqual([
      expect.objectContaining({
        ingredientId: 'ingredient-1',
        params: { inputPath: `https://api.example.com/videos/${videoId}` },
        room: 'user:user_123',
        type: 'reverse-video',
        userId,
      }),
    ]);
    await vi.waitFor(() =>
      expect(harness.published).toEqual([
        { eventType: WebSocketEventType.VIDEO_REVERSED, id: 'ingredient-1' },
      ]),
    );
    expect(harness.ingredientPatches).toEqual([
      {
        id: 'ingredient-1',
        update: {
          s3Key: 'videos/ingredient-1.mp4',
          status: IngredientStatus.GENERATED,
          transformations: [TransformationCategory.REVERSED],
        },
      },
    ]);
  });

  it('mirrors a video into a new generated ingredient and announces it', async () => {
    const harness = makeHarness({});

    await expect(
      harness.controller.mirrorVideo(mockRequest, mockUser, videoId),
    ).resolves.toMatchObject({ data: { id: 'ingredient-1' } });

    expect(harness.jobs).toEqual([
      expect.objectContaining({ type: 'mirror-video' }),
    ]);
    await vi.waitFor(() =>
      expect(harness.published).toEqual([
        { eventType: WebSocketEventType.VIDEO_MIRRORED, id: 'ingredient-1' },
      ]),
    );
    expect(harness.ingredientPatches[0]?.update).toMatchObject({
      status: IngredientStatus.GENERATED,
      transformations: [TransformationCategory.MIRRORED],
    });
  });

  it('uses the freshly authorized source URL when media delivery is activated', async () => {
    const harness = makeHarness({
      authorizedUrl: 'https://authorized.test/random-source?signature=grant',
    });

    await harness.controller.reverseVideo(mockRequest, mockUser, videoId);

    expect(harness.issuedUrls).toEqual([{ ids: [videoId], organizationId }]);
    expect(harness.jobs[0]?.params).toEqual({
      inputPath: 'https://authorized.test/random-source?signature=grant',
    });
  });

  it('rejects an issuer scope denial before queueing a transformation', async () => {
    const harness = makeHarness({
      authorizedUrl: new Error('Scoped media unavailable'),
    });

    await expect(
      harness.controller.reverseVideo(mockRequest, mockUser, videoId),
    ).rejects.toThrow('Scoped media unavailable');
    expect(harness.jobs).toEqual([]);
  });

  it.each([
    ['reverseVideo', 'an unknown video', 'nonexistent'],
    ['mirrorVideo', 'an unknown video', 'nonexistent'],
    ['reverseVideo', "another user's video", videoId],
  ] as const)('%s returns not found for %s', async (method, _label, id) => {
    const harness = makeHarness({
      videos: [
        {
          brandId,
          id: videoId,
          organizationId,
          userId: testId('user', 2),
        },
      ],
    });

    await expect(
      harness.controller[method](mockRequest, mockUser, id),
    ).rejects.toThrow(HttpException);
    expect(harness.createdMedia).toEqual([]);
    expect(harness.jobs).toEqual([]);
  });

  it('logs and rethrows when the mirror ingredient cannot be created', async () => {
    const harness = makeHarness({ failMediaCreation: true });

    await expect(
      harness.controller.mirrorVideo(mockRequest, mockUser, videoId),
    ).rejects.toThrow('DB error');
    expect(harness.errors).toContainEqual(
      expect.stringMatching(/^VideosEffectsController .* failed$/),
    );
    expect(harness.jobs).toEqual([]);
  });
});
