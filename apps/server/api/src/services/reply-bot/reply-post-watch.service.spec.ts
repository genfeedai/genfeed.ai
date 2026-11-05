import {
  buildReplyPostWatchWorkflowDefinition,
  REPLY_INGESTION_ACTION_IDS,
} from '@api/services/reply-bot/reply-ingestion-workflow-definition';
import { ReplyPostWatchService } from '@api/services/reply-bot/reply-post-watch.service';
import { Platform } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

type Constructor = ConstructorParameters<typeof ReplyPostWatchService>;

interface QueuedJob {
  attempt: unknown;
  delayMs: number;
  jobId: string;
  platform: unknown;
  source: unknown;
}

/**
 * The service against a workflow registry and a queue that keep what they are
 * given: the registered graph and action ids, and every queued watch job.
 */
function serviceWithRegistry() {
  const workflows: string[] = [];
  const actions: string[] = [];
  const queued: QueuedJob[] = [];
  const workflowRunner = {
    registerAction: (actionId: string) => {
      actions.push(actionId);
    },
    registerWorkflow: (definition: { canonicalId: string }) => {
      workflows.push(definition.canonicalId);
    },
  };
  const workflowQueue = {
    queueSystemWorkflow: async (
      payload: {
        inputValues: { request: { attempt: unknown; platform: unknown } };
        source: unknown;
      },
      jobId: string,
      options: { delayMs: number },
    ) => {
      queued.push({
        attempt: payload.inputValues.request.attempt,
        delayMs: options.delayMs,
        jobId,
        platform: payload.inputValues.request.platform,
        source: payload.source,
      });
      return jobId;
    },
  };
  const service = new ReplyPostWatchService(
    {} as Constructor[0],
    {} as Constructor[1],
    workflowRunner as unknown as Constructor[2],
    workflowQueue as unknown as Constructor[3],
  );
  return { actions, queued, service, workflows };
}

const MINUTE = 60_000;

describe('ReplyPostWatchService workflow boundary', () => {
  it('registers the post-watch graph and its fetch and finalize actions', () => {
    const { actions, service, workflows } = serviceWithRegistry();

    service.onModuleInit();

    expect(workflows).toEqual([
      buildReplyPostWatchWorkflowDefinition().canonicalId,
    ]);
    expect(actions).toEqual([
      REPLY_INGESTION_ACTION_IDS.FETCH_POST_WATCH,
      REPLY_INGESTION_ACTION_IDS.FINALIZE_POST_WATCH,
    ]);
  });

  it('queues the full watch series, from two minutes to a day after publish', async () => {
    const { queued, service } = serviceWithRegistry();

    await expect(
      service.schedulePostWatch({
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: Platform.YOUTUBE,
        postId: 'video-1',
      }),
    ).resolves.toEqual({ scheduled: 7 });

    // The job id carries the watch identity so a redelivered series replaces
    // its own attempt instead of queueing a duplicate watch.
    expect(
      queued.map(({ attempt, delayMs, jobId }) => [attempt, delayMs, jobId]),
    ).toEqual([
      [0, 2 * MINUTE, 'reply-post-watch-org-1-youtube-video-1-0'],
      [1, 10 * MINUTE, 'reply-post-watch-org-1-youtube-video-1-1'],
      [2, 30 * MINUTE, 'reply-post-watch-org-1-youtube-video-1-2'],
      [3, 120 * MINUTE, 'reply-post-watch-org-1-youtube-video-1-3'],
      [4, 360 * MINUTE, 'reply-post-watch-org-1-youtube-video-1-4'],
      [5, 720 * MINUTE, 'reply-post-watch-org-1-youtube-video-1-5'],
      [6, 1440 * MINUTE, 'reply-post-watch-org-1-youtube-video-1-6'],
    ]);
    expect(new Set(queued.map((job) => job.source))).toEqual(
      new Set(['reply-post-watch-series']),
    );
  });

  it.each([
    [undefined, Platform.TWITTER],
    ['twitter' as const, Platform.TWITTER],
    ['youtube' as const, Platform.YOUTUBE],
  ])('watches platform %j as %s', async (platform, expected) => {
    const { queued, service } = serviceWithRegistry();

    await service.schedulePostWatch({
      brandId: 'brand-1',
      organizationId: 'org-1',
      platform,
      postId: 'post-1',
    });

    expect(new Set(queued.map((job) => job.platform))).toEqual(
      new Set([expected]),
    );
  });
});
