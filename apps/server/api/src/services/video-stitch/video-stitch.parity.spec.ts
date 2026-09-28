/**
 * #5460 parity: identical clips and options produce the identical merge job
 * and the identical event sequence, whichever surface asked. Each caller's
 * own request mapping feeds the real stitch service over in-memory fakes.
 */
vi.mock('@api/index', () => ({
  scopedWhere: (organizationId: string, where: Record<string, unknown>) => ({
    ...where,
    organizationId,
    isDeleted: false,
  }),
}));
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-store.service',
  () => ({ BrandRemixSceneStoreService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-generation.service',
  () => ({ BrandRemixSceneGenerationService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-billing.service',
  () => ({ BrandRemixSceneBillingService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-run-planning.service',
  () => ({ BrandRemixRunPlanningService: class {} }),
);
vi.mock('@api/collections/musics/services/musics.service', () => ({
  MusicsService: class {},
}));
vi.mock(
  '@api/collections/videos/services/avatar-video-generation.service',
  () => ({ AvatarVideoGenerationService: class {} }),
);
vi.mock(
  '@api/collections/workflows/services/video-qa-continuity-resolver.service',
  () => ({ VideoQaContinuityResolverService: class {} }),
);
vi.mock(
  '@api/collections/workflows/services/workflow-node-continuation.service',
  () => ({ WorkflowNodeContinuationService: class {} }),
);
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock('@api/services/media-urls/media-url.service', () => ({
  MediaUrlService: class {},
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { toStoryboardRunStitchRequest } from '@api/collections/content-runs/services/brand-remix-scene-assembly.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { CreateMergedVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { toManualStitchRequest } from '@api/collections/videos/services/video-merge-orchestration.service';
import { toWorkflowStitchRequest } from '@api/collections/workflows/services/workflow-media-processing-executor-registrar.service';
import { toAutoMergeStitchRequest } from '@api/endpoints/webhooks/services/auto-merge.service';
import { VideoStitchFixture } from '@api/services/video-stitch/video-stitch.fixture';
import type { VideoStitchRequest } from '@api/services/video-stitch/video-stitch.types';
import { IngredientCategory, VideoTransition } from '@genfeedai/contracts';
import type { IVideoMergeSettings } from '@genfeedai/contracts/interfaces';
import {
  createVideoStitchExecutor,
  type VideoStitchTransitionType,
} from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

const CLIPS = ['clip-1', 'clip-2', 'clip-1'];
const USER = {
  brandId: 'brand-1',
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as User;

interface ParityScenario {
  name: string;
  settings: IVideoMergeSettings;
  workflowTransition: VideoStitchTransitionType;
}

const SCENARIOS: ParityScenario[] = [
  { name: 'a plain cut', settings: {}, workflowTransition: 'cut' },
  {
    name: 'a crossfade',
    settings: { transition: VideoTransition.FADE, transitionDuration: 0.5 },
    workflowTransition: 'crossfade',
  },
  {
    name: 'a wipe',
    settings: { transition: VideoTransition.WIPELEFT, transitionDuration: 1 },
    workflowTransition: 'wipe',
  },
];

function newFixture(): VideoStitchFixture {
  const fixture = new VideoStitchFixture();
  fixture.addClip({ id: 'clip-1' });
  fixture.addClip({
    category: 'AVATAR',
    id: 'clip-2',
    s3Key: 'ingredients/avatars/clip-2.mp4',
  });
  return fixture;
}

/** Runs one caller's request and returns what it queued and emitted. */
async function observe(
  build: (fixture: VideoStitchFixture) => Promise<VideoStitchRequest>,
) {
  const fixture = newFixture();
  const handle = await fixture.service.stitch(await build(fixture));
  fixture.completeJob(handle.jobId, `ingredients/videos/${handle.outputId}`);
  await fixture.service.waitForCompletion(handle);
  const [job] = fixture.mergeJobs();
  return {
    events: fixture.eventNames().filter((name) => !name.startsWith('log.')),
    job: {
      id: job?.id,
      ingredientId: job?.ingredientId,
      organizationId: job?.organizationId,
      params: job?.params,
      room: job?.room,
      type: job?.type,
      userId: job?.userId,
      websocketUrl: job?.websocketUrl,
    },
  };
}

function manual(settings: IVideoMergeSettings) {
  return observe(async () =>
    toManualStitchRequest(
      USER,
      {
        category: IngredientCategory.VIDEO,
        ids: CLIPS,
        ...settings,
      } as CreateMergedVideoDto,
      'manual:parity',
    ),
  );
}

function autoMerge(settings: IVideoMergeSettings) {
  return observe(async () => {
    const request = toAutoMergeStitchRequest(
      {
        brandId: 'brand-1',
        mergeSettings: settings,
        organizationId: 'org-1',
        userId: 'user-1',
      } as IngredientDocument,
      'group-1',
      CLIPS,
    );
    if (!request) throw new Error('auto-merge request was refused');
    return request;
  });
}

function workflow(
  transitionType: VideoStitchTransitionType,
  settings: IVideoMergeSettings,
) {
  return observe(async () => {
    let request: VideoStitchRequest | undefined;
    await createVideoStitchExecutor(async (params) => {
      request = toWorkflowStitchRequest(params, 'brand-1', params.videoUrls);
      return {
        jobId: 'captured',
        outputId: 'captured',
        outputVideoUrl: 'captured',
      };
    }).execute({
      context: {
        organizationId: 'org-1',
        runId: 'run-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
        workflowVersionId: 'workflow-1-v1',
      },
      inputs: new Map<string, unknown>([['videos', CLIPS]]),
      node: {
        config: {
          transitionDuration: settings.transitionDuration ?? 0,
          transitionType,
        },
        id: 'stitch',
        inputs: [],
        label: 'Stitch',
        type: 'videoStitch',
      },
    });
    if (!request) throw new Error('workflow request was not built');
    // The workflow node dedupes repeated inputs; parity compares the same
    // ordered sequence every other caller received.
    return { ...request, clipIds: CLIPS };
  });
}

describe('video stitch parity across callers', () => {
  it.each(SCENARIOS)(
    'queues the same merge job and events for $name',
    async ({ settings, workflowTransition }) => {
      const reference = await manual(settings);
      const others = await Promise.all([
        autoMerge(settings),
        workflow(workflowTransition, settings),
      ]);

      expect(reference.job.params).toMatchObject({
        isPersistedOutputOnly: true,
        sourceIds: CLIPS,
        sourceStorageKeys: [
          'ingredients/videos/clip-1.mp4',
          'ingredients/avatars/clip-2.mp4',
          'ingredients/videos/clip-1.mp4',
        ],
        transition: settings.transition ?? VideoTransition.NONE,
      });
      for (const observed of others) {
        expect(observed.job).toEqual(reference.job);
        expect(observed.events).toEqual(reference.events);
      }
      expect(reference.events).toEqual([
        'activity.record',
        'background',
        'metadata.update',
        'video.complete',
        'activity.update',
        'background',
      ]);
    },
  );

  it('adds only its per-clip output to the storyboard run payload', async () => {
    const reference = await manual({});
    const storyboardRun = await observe(async () =>
      toStoryboardRunStitchRequest(
        'org-1',
        'brand-1',
        'run-1',
        'operation-1',
        'user-1',
        CLIPS,
        '9:16',
      ),
    );

    const { height, normalizeClips, width, ...shared } = (storyboardRun.job
      .params ?? {}) as Record<string, unknown>;
    expect({ height, normalizeClips, width }).toEqual({
      height: 1024,
      normalizeClips: true,
      width: 576,
    });
    expect({ ...storyboardRun.job, params: shared }).toEqual(reference.job);
    expect(storyboardRun.events).toEqual(reference.events);
  });
});
