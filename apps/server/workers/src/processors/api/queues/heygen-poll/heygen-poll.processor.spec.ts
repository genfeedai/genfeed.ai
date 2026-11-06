import type { WorkflowNodeContinuationService } from '@api/collections/workflows/services/workflow-node-continuation.service';
import type { WorkflowNodeContinuationCoordinatorService } from '@api/collections/workflows/services/workflow-node-continuation-coordinator.service';
import type { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import type { HeygenAvatarProvider } from '@api/services/avatar-video/providers/heygen-avatar.provider';
import {
  HEYGEN_POLL_MAX_ATTEMPTS,
  type HeygenPollJobData,
} from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';
import { HeygenPollProcessor } from '@workers/processors/api/queues/heygen-poll/heygen-poll.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it } from 'vitest';

interface ProviderStatus {
  duration?: number;
  error?: string;
  jobId?: string;
  status: string;
  videoUrl?: string;
}

interface Ingredient {
  durationSeconds?: number;
  error?: string;
  providerVideoId?: string;
  status: 'failed' | 'processing' | 'ready';
  videoUrl?: string;
}

interface Continuation {
  error?: string;
  organizationId: string;
  providerResult?: Record<string, string>;
  state: 'completed' | 'failed' | 'waiting';
}

type PollRequest = Pick<
  HeygenPollJobData,
  'attempt' | 'continuationId' | 'externalId' | 'organizationId'
>;

const job = (attempt = 1): Job<HeygenPollJobData> =>
  ({
    data: {
      attempt,
      continuationId: 'continuation-1',
      externalId: 'heygen-1',
      ingredientId: 'ingredient-1',
      organizationId: 'org-1',
    },
  }) as Job<HeygenPollJobData>;

describe('HeygenPollProcessor', () => {
  let continuations: Map<string, Continuation>;
  let ingredients: Map<string, Ingredient>;
  let isMediaDown: boolean;
  let pollQueue: PollRequest[];
  let providerStatus: ProviderStatus;
  let processor: HeygenPollProcessor;

  beforeEach(() => {
    continuations = new Map([
      ['continuation-1', { organizationId: 'org-1', state: 'waiting' }],
    ]);
    ingredients = new Map([['ingredient-1', { status: 'processing' }]]);
    isMediaDown = false;
    pollQueue = [];
    providerStatus = { status: 'processing' };

    const settle = (
      identity: { continuationId: string; organizationId: string },
      outcome: Omit<Continuation, 'organizationId'>,
    ) => {
      const continuation = continuations.get(identity.continuationId);
      if (continuation?.organizationId === identity.organizationId) {
        Object.assign(continuation, outcome);
      }
      return 'queued';
    };

    const heygen = {
      getStatus: async (externalId: string) =>
        externalId === 'heygen-1' ? providerStatus : { status: 'unknown' },
    } as unknown as HeygenAvatarProvider;
    const webhooks = {
      handleFailedGenerationForIngredient: async (
        ingredientId: string,
        error: string,
      ) => {
        Object.assign(ingredients.get(ingredientId) ?? {}, {
          error,
          status: 'failed',
        });
      },
      processMediaForIngredient: async (
        ingredientId: string,
        _kind: string,
        videoUrl: string,
        providerVideoId: string,
        _metadata: undefined,
        durationSeconds?: number,
      ) => {
        if (isMediaDown) {
          throw new Error('upload failed');
        }
        Object.assign(ingredients.get(ingredientId) ?? {}, {
          durationSeconds,
          providerVideoId,
          status: 'ready',
          videoUrl,
        });
      },
    } as unknown as WebhooksService;
    const coordinator = {
      completeProviderAction: async (input: {
        identity: { continuationId: string; organizationId: string };
        providerResult: Record<string, string>;
      }) =>
        settle(input.identity, {
          providerResult: input.providerResult,
          state: 'completed',
        }),
      failProviderAction: async (input: {
        error: string;
        identity: { continuationId: string; organizationId: string };
        providerResult: Record<string, string>;
      }) =>
        settle(input.identity, {
          error: input.error,
          providerResult: input.providerResult,
          state: 'failed',
        }),
    } as unknown as WorkflowNodeContinuationCoordinatorService;
    const continuationService = {
      requestHeygenPollAttempt: async (request: PollRequest) => {
        pollQueue.push(request);
      },
    } as unknown as WorkflowNodeContinuationService;
    const logger = {
      error: () => undefined,
      log: () => undefined,
    } as unknown as LoggerService;

    processor = new HeygenPollProcessor(
      logger,
      heygen,
      webhooks,
      coordinator,
      continuationService,
    );
  });

  it.each<[string, ProviderStatus]>([
    ['processing', { status: 'processing' }],
    ['queued', { status: 'queued' }],
    ['unknown', { status: 'unknown' }],
    ['completed without a URL', { status: 'completed' }],
  ])('polls again while the video is %s', async (_case, status) => {
    providerStatus = status;

    await processor.process(job(2));

    expect(pollQueue).toEqual([
      {
        attempt: 3,
        continuationId: 'continuation-1',
        externalId: 'heygen-1',
        organizationId: 'org-1',
      },
    ]);
    expect(ingredients.get('ingredient-1')).toEqual({ status: 'processing' });
    expect(continuations.get('continuation-1')?.state).toBe('waiting');
  });

  it('leaves the generation unresolved for recovery at the polling ceiling', async () => {
    await processor.process(job(HEYGEN_POLL_MAX_ATTEMPTS));

    expect(pollQueue).toEqual([]);
    expect(ingredients.get('ingredient-1')).toEqual({ status: 'processing' });
    expect(continuations.get('continuation-1')?.state).toBe('waiting');
  });

  it('finalizes the ingredient and completes the continuation on a finished video', async () => {
    providerStatus = {
      duration: 12.5,
      jobId: 'heygen-video-1',
      status: 'completed',
      videoUrl: 'https://cdn.heygen.com/video.mp4',
    };

    await processor.process(job());

    expect(ingredients.get('ingredient-1')).toEqual({
      durationSeconds: 12.5,
      providerVideoId: 'heygen-video-1',
      status: 'ready',
      videoUrl: 'https://cdn.heygen.com/video.mp4',
    });
    expect(continuations.get('continuation-1')).toEqual({
      organizationId: 'org-1',
      providerResult: {
        externalId: 'heygen-video-1',
        url: 'https://cdn.heygen.com/video.mp4',
      },
      state: 'completed',
    });
    expect(pollQueue).toEqual([]);
  });

  it.each([
    ['its error', 'Avatar rejected', 'Avatar rejected'],
    [
      'a default message',
      undefined,
      'HeyGen generation failed without error message',
    ],
  ])(
    'fails the ingredient and the continuation with %s',
    async (_case, error, message) => {
      providerStatus = { error, status: 'failed' };

      await processor.process(job());

      expect(ingredients.get('ingredient-1')).toEqual({
        error: message,
        status: 'failed',
      });
      expect(continuations.get('continuation-1')).toEqual({
        error: message,
        organizationId: 'org-1',
        providerResult: { externalId: 'heygen-1' },
        state: 'failed',
      });
    },
  );

  it('keeps the continuation waiting when the finished video cannot be stored', async () => {
    isMediaDown = true;
    providerStatus = {
      jobId: 'heygen-video-1',
      status: 'completed',
      videoUrl: 'https://cdn.heygen.com/video.mp4',
    };

    await expect(processor.process(job())).rejects.toThrow('upload failed');
    expect(continuations.get('continuation-1')?.state).toBe('waiting');
  });
});
