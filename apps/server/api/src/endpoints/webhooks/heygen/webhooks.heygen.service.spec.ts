import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { ClipperAvatarBillingService } from '@api/collections/clipper-projects/services/clipper-avatar-billing.service';
import type { ClipperLibraryLinkService } from '@api/collections/clipper-projects/services/clipper-library-link.service';
import type { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { WorkflowNodeContinuationService } from '@api/collections/workflows/services/workflow-node-continuation.service';
import type { WorkflowNodeContinuationCoordinatorService } from '@api/collections/workflows/services/workflow-node-continuation-coordinator.service';
import { HeygenWebhookService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.service';
import type { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import type { MicroservicesService } from '@api/services/microservices/microservices.service';
import type { HeygenWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

interface Continuation {
  error?: string;
  identity: { ingredientId: string; organizationId: string };
  outcome: 'completed' | 'failed';
  providerResult: Record<string, unknown>;
}

interface MediaProcessed {
  durationSeconds?: number;
  externalId?: string;
  ingredientId: string;
  kind: string;
  url: string;
}

const CLIP_URL = 'https://cdn.heygen.com/clip.mp4';
const AVATAR_URL = 'https://cdn.heygen.com/avatar.mp4';
const FAILURE = { code: 'TIMEOUT', message: 'Generation timed out' };

// The log prefix carries the traced caller name, which varies by runtime.
const logged = (message: string) =>
  expect.stringMatching(new RegExp(`^HeygenWebhookService .*${message}$`));

const byFields = (where: Row) => (row: Row) =>
  Object.entries(where).every(([key, value]) => row[key] === value);

describe('HeygenWebhookService', () => {
  // The rows a callback can target and every effect it can have.
  let clipResults: Row[];
  let metadata: Row[];
  let ingredients: Row[];
  let continuationTargets: Row[];
  let notifications: { body: Row; eventType: string; provider: string }[];
  let clipHolds: {
    clipperResultId: string;
    outcome: string;
    seconds?: number;
  }[];
  let libraryLinks: Row[];
  let reconciledProjects: [string, string | undefined][];
  let mediaProcessed: MediaProcessed[];
  let failedGenerations: [string, string][];
  let continuations: Continuation[];
  let warnings: string[];
  let errors: string[];
  let isNotifierDown: boolean;
  let isMetadataStoreDown: boolean;
  let service: HeygenWebhookService;

  const table = (rows: () => Row[]) => ({
    findOne: async (where: Row) => {
      if (isMetadataStoreDown && rows() === metadata) {
        throw new Error('Database connection lost');
      }
      const found = rows().find(byFields(where));
      return found ? { ...found } : null;
    },
    patch: async (id: string, data: Row) => {
      const found = rows().find((row) => row.id === id);
      if (!found) throw new Error(`Row ${id} not found`);
      return Object.assign(found, data);
    },
  });

  beforeEach(() => {
    clipResults = [];
    metadata = [];
    ingredients = [];
    continuationTargets = [];
    notifications = [];
    clipHolds = [];
    libraryLinks = [];
    reconciledProjects = [];
    mediaProcessed = [];
    failedGenerations = [];
    continuations = [];
    warnings = [];
    errors = [];
    isNotifierDown = false;
    isMetadataStoreDown = false;

    service = new HeygenWebhookService(
      {
        release: async (clipperResultId: string) => {
          clipHolds.push({ clipperResultId, outcome: 'released' });
        },
        settle: async (
          clipperResultId: string,
          _organizationId: string,
          seconds?: number,
        ) => {
          clipHolds.push({ clipperResultId, outcome: 'settled', seconds });
        },
      } as unknown as ClipperAvatarBillingService,
      {
        linkReadyClip: async (link: Row) => {
          libraryLinks.push(link);
        },
      } as unknown as ClipperLibraryLinkService,
      {
        reconcileTerminalState: async (
          projectId: string,
          organizationId?: string,
        ) => {
          reconciledProjects.push([projectId, organizationId]);
        },
      } as unknown as ClipperProjectsService,
      table(() => clipResults) as unknown as ClipperResultsService,
      table(() => ingredients) as unknown as IngredientsService,
      {
        error: (message: string) => {
          errors.push(message);
        },
        log: () => undefined,
        warn: (message: string) => {
          warnings.push(message);
        },
      } as unknown as LoggerService,
      table(() => metadata) as unknown as MetadataService,
      {
        notifyWebhook: async (
          provider: string,
          eventType: string,
          body: Row,
        ) => {
          if (isNotifierDown) {
            throw new Error('Request failed with status code 404');
          }
          notifications.push({ body, eventType, provider });
        },
      } as unknown as MicroservicesService,
      {
        handleFailedGenerationForIngredient: async (
          ingredientId: string,
          error: string,
        ) => {
          failedGenerations.push([ingredientId, error]);
        },
        processMediaForIngredient: async (
          ingredientId: string,
          kind: string,
          url: string,
          externalId?: string,
          _unused?: unknown,
          durationSeconds?: number,
        ) => {
          mediaProcessed.push({
            durationSeconds,
            externalId,
            ingredientId,
            kind,
            url,
          });
        },
      } as unknown as WebhooksService,
      {
        completeProviderAction: async (
          action: Omit<Continuation, 'outcome'>,
        ) => {
          continuations.push({ ...action, outcome: 'completed' });
          return 'queued';
        },
        failProviderAction: async (action: Omit<Continuation, 'outcome'>) => {
          continuations.push({ ...action, outcome: 'failed' });
          return 'queued';
        },
      } as unknown as WorkflowNodeContinuationCoordinatorService,
      {
        findIngredientCallbackTarget: async ({
          ingredientId,
        }: {
          ingredientId: string;
        }) =>
          continuationTargets.find(
            (target) => target.ingredientId === ingredientId,
          ) ?? null,
      } as unknown as WorkflowNodeContinuationService,
    );
  });

  // An avatar render whose callback id is the metadata row.
  const seedRender = (ingredient: Row = {}) => {
    metadata.push({ id: 'metadata-1' });
    ingredients.push({
      id: 'ingredient-1',
      metadataId: 'metadata-1',
      organizationId: 'org-1',
      ...ingredient,
    });
  };
  const seedClip = (fields: Row = {}) => {
    clipResults.push({
      id: 'clip-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      status: 'processing',
      ...fields,
    });
  };
  const metadataRow = () => metadata[0];
  const clip = () => clipResults[0];

  describe('request validation', () => {
    it.each([
      ['an array', []],
      ['null', null],
      ['a string', 'invalid'],
      ['a number', 42],
      ['a boolean', false],
    ])('rejects %s body before notifying anyone', async (_case, body) => {
      await expect(
        service.handleCallback(body as unknown as HeygenWebhookPayload),
      ).rejects.toThrow(BadRequestException);

      expect(notifications).toEqual([]);
    });

    it('notifies listeners and stops when the event names no callback id', async () => {
      seedRender();

      await service.handleCallback({ event_data: {}, event_type: 'x' });

      expect(notifications).toEqual([
        expect.objectContaining({ eventType: 'x', provider: 'heygen' }),
      ]);
      expect(warnings).toEqual([logged('no callback_id provided')]);
      expect(metadataRow()).toEqual({ id: 'metadata-1' });
    });
  });

  describe('listener notification', () => {
    it.each([
      ['the event type', 'video_completed', 'video_completed'],
      ['"unknown" without one', undefined, 'unknown'],
    ])('forwards the callback under %s', async (_case, eventType, notified) => {
      seedRender();

      await service.handleCallback({
        callback_id: 'metadata-1',
        event_data: {},
        event_type: eventType,
      });

      expect(notifications).toEqual([
        {
          body: expect.objectContaining({
            callback_id: 'metadata-1',
            metadata: expect.objectContaining({ callbackId: 'metadata-1' }),
          }),
          eventType: notified,
          provider: 'heygen',
        },
      ]);
    });

    it('still finalizes the render when the notification call fails', async () => {
      seedRender();
      isNotifierDown = true;

      await service.handleCallback({
        callback_id: 'metadata-1',
        event_data: { video_id: 'video-1' },
        event_type: 'video_completed',
      });

      expect(warnings).toEqual([logged('notification failed, continuing')]);
      expect(metadataRow()).toMatchObject({ externalId: 'video-1' });
    });
  });

  describe('avatar renders', () => {
    it.each([
      ['the metadata id', 'metadata-1'],
      ['the ingredient id', 'ingredient-1'],
    ])(
      'finalizes a successful render addressed by %s',
      async (_case, callbackId) => {
        seedRender();

        await service.handleCallback({
          callback_id: callbackId,
          event_data: {
            duration: 12.5,
            url: AVATAR_URL,
            video_id: 'provider-video-42',
          },
          event_type: 'avatar_video.success',
        });

        expect(mediaProcessed).toEqual([
          {
            durationSeconds: 12.5,
            externalId: 'provider-video-42',
            ingredientId: 'ingredient-1',
            kind: 'avatar',
            url: AVATAR_URL,
          },
        ]);
        expect(metadataRow()).toEqual({
          externalId: 'provider-video-42',
          id: 'metadata-1',
          result: AVATAR_URL,
        });
        expect(continuations).toEqual([
          {
            identity: { ingredientId: 'ingredient-1', organizationId: 'org-1' },
            outcome: 'completed',
            provider: 'heygen',
            providerResult: {
              externalId: 'provider-video-42',
              url: AVATAR_URL,
            },
          },
        ]);
      },
    );

    it.each([
      ['no duration', {}],
      ['a zero duration', { duration: 0 }],
      ['a non-finite duration', { duration: Number.POSITIVE_INFINITY }],
    ])(
      'settles a render at its estimate when HeyGen reports %s',
      async (_case, duration) => {
        seedRender();

        await service.handleCallback({
          callback_id: 'metadata-1',
          event_data: { url: AVATAR_URL, ...duration },
          event_type: 'avatar_video.success',
        });

        expect(mediaProcessed).toEqual([
          expect.objectContaining({ durationSeconds: undefined }),
        ]);
      },
    );

    it.each([
      'avatar_video.fail',
      'avatar_video.failed',
      'avatar_video.failure',
    ])(
      'fails the generation and its workflow step on %s',
      async (eventType) => {
        seedRender();

        await service.handleCallback({
          callback_id: 'metadata-1',
          event_data: { ...FAILURE, video_id: 'provider-video-9' },
          event_type: eventType,
        });

        const error = JSON.stringify({
          ...FAILURE,
          video_id: 'provider-video-9',
        });
        expect(failedGenerations).toEqual([['ingredient-1', error]]);
        expect(metadataRow()).toEqual({
          error,
          externalId: 'provider-video-9',
          id: 'metadata-1',
          result: error,
        });
        expect(continuations).toEqual([
          {
            error,
            identity: { ingredientId: 'ingredient-1', organizationId: 'org-1' },
            outcome: 'failed',
            provider: 'heygen',
            providerResult: { externalId: 'provider-video-9' },
          },
        ]);
        expect(mediaProcessed).toEqual([]);
      },
    );

    it.each([
      [
        'a video url on a non-avatar event',
        {
          event_data: { video_url: AVATAR_URL },
          event_type: 'video_completed',
        },
        AVATAR_URL,
      ],
      [
        'the raw event data otherwise',
        { event_data: { status: 'ready' }, event_type: 'avatar_created' },
        JSON.stringify({ status: 'ready' }),
      ],
    ])('stores %s as the result only', async (_case, event, result) => {
      seedRender();

      await service.handleCallback({ callback_id: 'metadata-1', ...event });

      expect(metadataRow()).toEqual({ id: 'metadata-1', result });
      expect(mediaProcessed).toEqual([]);
      expect(failedGenerations).toEqual([]);
      expect(continuations).toEqual([]);
    });

    it('finalizes without workflow continuation when the ingredient has no organization', async () => {
      seedRender({ organizationId: undefined });

      await service.handleCallback({
        callback_id: 'metadata-1',
        event_data: { url: AVATAR_URL },
        event_type: 'avatar_video.success',
      });

      expect(mediaProcessed).toHaveLength(1);
      expect(continuations).toEqual([]);
    });

    it('refuses a callback from a HeyGen video that does not own the ingredient', async () => {
      seedRender();
      continuationTargets.push({
        externalId: 'provider-video-original',
        ingredientId: 'ingredient-1',
      });

      await expect(
        service.handleCallback({
          callback_id: 'metadata-1',
          event_data: { url: AVATAR_URL, video_id: 'provider-video-other' },
          event_type: 'avatar_video.success',
        }),
      ).rejects.toThrow(
        'HeyGen callback provider-video-other does not own ingredient ingredient-1',
      );
      expect(metadataRow()).toEqual({ id: 'metadata-1' });
      expect(mediaProcessed).toEqual([]);
      expect(continuations).toEqual([]);
    });

    it('accepts the callback from the HeyGen video that owns the ingredient', async () => {
      seedRender();
      continuationTargets.push({
        externalId: 'provider-video-42',
        ingredientId: 'ingredient-1',
      });

      await service.handleCallback({
        callback_id: 'metadata-1',
        event_data: { url: AVATAR_URL, video_id: 'provider-video-42' },
        event_type: 'avatar_video.success',
      });

      expect(continuations).toEqual([
        expect.objectContaining({ outcome: 'completed' }),
      ]);
    });

    it.each([
      ['no metadata or ingredient matches', () => undefined],
      [
        'the metadata has no ingredient',
        () => {
          metadata.push({ id: 'metadata-1' });
        },
      ],
    ])('skips the callback when %s', async (_case, seed) => {
      seed();

      await service.handleCallback({
        callback_id: 'metadata-1',
        event_data: { url: AVATAR_URL },
        event_type: 'avatar_video.success',
      });

      expect(warnings).toEqual([logged('callback target not found')]);
      expect(mediaProcessed).toEqual([]);
    });

    it('logs and rethrows when the metadata store is down', async () => {
      seedRender();
      isMetadataStoreDown = true;

      await expect(
        service.handleCallback({
          callback_id: 'metadata-1',
          event_data: {},
          event_type: 'video_completed',
        }),
      ).rejects.toThrow('Database connection lost');
      expect(errors).toEqual([logged('failed')]);
    });
  });

  describe('clipper clips', () => {
    it.each([
      ['the reported duration', { duration: 7.4 }, 7.4],
      ['its estimate without a duration', {}, undefined],
    ])(
      'completes a clip, settles its hold at %s, links it and reconciles the project',
      async (_case, duration, seconds) => {
        seedClip();

        await service.handleCallback({
          event_data: {
            callback_id: 'clip-1',
            url: CLIP_URL,
            video_id: 'provider-job-1',
            ...duration,
          },
          event_type: 'avatar_video.success',
        });

        expect(clip()).toMatchObject({
          providerJobId: 'provider-job-1',
          status: 'completed',
          videoUrl: CLIP_URL,
        });
        expect(clipHolds).toEqual([
          { clipperResultId: 'clip-1', outcome: 'settled', seconds },
        ]);
        expect(libraryLinks).toEqual([
          { clipperResultId: 'clip-1', organizationId: 'org-1' },
        ]);
        expect(reconciledProjects).toEqual([['project-1', 'org-1']]);
      },
    );

    it('fails a clip, returns its hold and reconciles the project', async () => {
      seedClip();

      await service.handleCallback({
        event_data: { callback_id: 'clip-1', video_id: 'provider-job-1' },
        event_type: 'avatar_video.failed',
      });

      expect(clip()).toMatchObject({
        providerJobId: 'provider-job-1',
        status: 'failed',
      });
      expect(clipHolds).toEqual([
        { clipperResultId: 'clip-1', outcome: 'released' },
      ]);
      expect(libraryLinks).toEqual([]);
      expect(reconciledProjects).toEqual([['project-1', 'org-1']]);
    });

    it.each([
      ['a successful', { url: CLIP_URL }, 'avatar_video.success', 'completed'],
      ['a failed', {}, 'avatar_video.failed', 'failed'],
    ])(
      'records %s clip without billing when the clip has no organization',
      async (_case, eventData, eventType, status) => {
        seedClip({ organizationId: undefined });

        await service.handleCallback({
          event_data: { callback_id: 'clip-1', ...eventData },
          event_type: eventType,
        });

        expect(clip()?.status).toBe(status);
        expect(clipHolds).toEqual([]);
        expect(libraryLinks).toEqual([]);
        expect(reconciledProjects).toEqual([['project-1', undefined]]);
      },
    );

    it('leaves a clip untouched on a non-terminal event', async () => {
      seedClip();

      await service.handleCallback({
        event_data: { callback_id: 'clip-1' },
        event_type: 'avatar_video.processing',
      });

      expect(clip()?.status).toBe('processing');
      expect(clipHolds).toEqual([]);
      expect(reconciledProjects).toEqual([]);
    });

    it('skips a clip result that has lost its project', async () => {
      seedClip({ projectId: undefined });

      await service.handleCallback({
        event_data: { callback_id: 'clip-1', url: CLIP_URL },
        event_type: 'avatar_video.success',
      });

      expect(warnings).toEqual([logged('clip result missing project id')]);
      expect(clip()?.status).toBe('processing');
      expect(clipHolds).toEqual([]);
    });
  });
});
