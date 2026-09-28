import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type {
  SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import type { PublicClipToolStoreService } from '@api/services/public-clip-tool/public-clip-tool-store.service';
import type { WhisperService } from '@api/services/whisper/whisper.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { ClipAnalysisWorkflowService } from './clip-analysis-workflow.service';
import type { ClipHighlightDetector } from './clip-highlight-detector.service';

describe('ClipAnalysisWorkflowService', () => {
  const actions = new Map<string, SystemWorkflowActionExecutor>();
  const clipProjects = { patch: vi.fn() };
  const http = { get: vi.fn(), post: vi.fn() };
  const runner = {
    registerAction: vi.fn(
      (actionId: string, executor: SystemWorkflowActionExecutor) => {
        actions.set(actionId, executor);
      },
    ),
    registerWorkflow: vi.fn(),
  };
  const service = new ClipAnalysisWorkflowService(
    { error: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
    clipProjects as unknown as ClipProjectsService,
    { transcribeUrl: vi.fn() } as unknown as WhisperService,
    http as unknown as HttpService,
    {
      get: vi.fn(),
      isDevelopment: true,
    } as unknown as ConfigService,
    { detectHighlights: vi.fn() } as unknown as ClipHighlightDetector,
    {
      patchByWorkerProjectId: vi.fn(),
    } as unknown as PublicClipToolStoreService,
    runner as unknown as SystemWorkflowRunnerService,
  );

  beforeEach(() => {
    actions.clear();
    vi.clearAllMocks();
    service.onModuleInit();
  });

  it('registers one executor for every analysis action', () => {
    expect([...actions.keys()]).toEqual([
      'clip.analysis.prepare-source',
      'clip.analysis.transcribe',
      'clip.analysis.detect-highlights',
      'clip.analysis.extract-reference-frames',
      'clip.analysis.persist',
      'clip.analysis.fail',
    ]);
  });

  it('projects workflow failure onto the owned clip project', async () => {
    const fail = actions.get('clip.analysis.fail');
    expect(fail).toBeDefined();

    await fail?.({
      context: {
        brandId: undefined,
        executionId: 'execution-1',
        nodeId: 'fail-analysis',
        organizationId: 'org-1',
        runId: 'execution-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
      },
      input: {
        job: {
          language: 'en',
          maxClips: 3,
          minViralityScore: 50,
          orgId: 'org-1',
          projectId: 'project-1',
          userId: 'user-1',
          youtubeUrl: 'https://youtube.com/watch?v=abc123def45',
        },
        workflowError: 'transcription unavailable',
      },
      provenance: {
        executionId: 'execution-1',
        workflowId: 'workflow-1',
        workflowLabel: 'Clip Analysis',
      },
    } as never);

    expect(clipProjects.patch).toHaveBeenCalledWith(
      'project-1',
      { error: 'transcription unavailable', status: 'failed' },
      [],
      'org-1',
    );
  });

  it.each([
    [
      'a stored source by its storage key',
      {
        contentType: 'video/mp4',
        mediaUrl: 'https://cdn.genfeed.ai/ingredients/videos/video-1',
        storageKey: 'ingredients/videos/video-1',
      },
      { s3Key: 'ingredients/videos/video-1', timestamps: [15] },
    ],
    [
      'a YouTube source by its URL',
      undefined,
      {
        inputPath: 'https://www.youtube.com/watch?v=abc123def45',
        timestamps: [15],
      },
    ],
  ])(
    'asks the files service for reference frames from %s',
    async (_label, sourceArtifact, params) => {
      http.post.mockReturnValue(of({ data: {} }));
      const extract = actions.get('clip.analysis.extract-reference-frames');

      const result = (await extract?.({
        input: {
          highlighted: {
            data: {
              orgId: 'org-1',
              projectId: 'project-1',
              source: { contentType: 'video/mp4', kind: 'library' },
              userId: 'user-1',
            },
            highlights: [
              {
                clip_type: 'hook',
                end_time: 20,
                id: 'h1',
                start_time: 10,
                summary: 'Hook',
                tags: [],
                title: 'Hook',
                virality_score: 90,
              },
            ],
            ...(sourceArtifact ? { sourceArtifact } : {}),
            sourceUrl: 'https://www.youtube.com/watch?v=abc123def45',
          },
        },
      } as never)) as { referenceFrames: { status: string } };

      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('/v1/files/process/video'),
        expect.objectContaining({
          organizationId: 'org-1',
          params,
          type: 'extract-reference-frames',
        }),
        expect.anything(),
      );
      expect(result.referenceFrames.status).toBe('unavailable');
    },
  );

  it('asks the files service to store a remote source while extracting audio', async () => {
    http.post.mockReturnValue(of({ data: {} }));
    const prepare = actions.get('clip.analysis.prepare-source');

    await expect(
      prepare?.({
        input: {
          job: {
            orgId: 'org-1',
            projectId: 'project-1',
            source: {
              artifact: {
                contentType: 'video/mp4',
                mediaUrl: 'https://media.argil.test/videos/library-video.mp4',
              },
              contentType: 'video/mp4',
              kind: 'library',
            },
            userId: 'user-1',
            youtubeUrl: 'https://media.argil.test/videos/library-video.mp4',
          },
        },
      } as never),
    ).rejects.toThrow(/jobId/);

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('/v1/files/process/video'),
      expect.objectContaining({
        params: {
          inputPath: 'https://media.argil.test/videos/library-video.mp4',
          materializeSource: true,
        },
        type: 'video-to-audio',
      }),
      expect.anything(),
    );
  });
});
