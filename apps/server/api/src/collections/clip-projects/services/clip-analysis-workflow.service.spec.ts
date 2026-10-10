import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type {
  SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
  SystemWorkflowTerminalFailureHandler,
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
  const clipProjects = {
    findOne: vi.fn(),
    patch: vi.fn(),
    settleInFlightFailure: vi.fn(),
  };
  const terminalFailures = new Map<
    string,
    SystemWorkflowTerminalFailureHandler
  >();
  const http = { get: vi.fn(), post: vi.fn() };
  const whisper = { transcribeUrl: vi.fn() };
  const runner = {
    registerAction: vi.fn(
      (actionId: string, executor: SystemWorkflowActionExecutor) => {
        actions.set(actionId, (request) =>
          executor({
            ...request,
            context: {
              executionId: 'execution-1',
              ...request.context,
              organizationId: request.context?.organizationId ?? 'org-1',
              userId: request.context?.userId ?? 'user-1',
              runId: request.context?.runId ?? 'execution-1',
              workflowId: request.context?.workflowId ?? 'workflow-1',
              workflowVersionId:
                request.context?.workflowVersionId ?? 'version-1',
            },
          }),
        );
      },
    ),
    terminalFailures: {
      register: vi.fn(
        (
          canonicalId: string,
          handler: SystemWorkflowTerminalFailureHandler,
        ) => {
          terminalFailures.set(canonicalId, handler);
        },
      ),
    },
    registerWorkflow: vi.fn(),
  };
  const service = new ClipAnalysisWorkflowService(
    { error: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
    clipProjects as unknown as ClipProjectsService,
    whisper as unknown as WhisperService,
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
    clipProjects.findOne.mockReset();
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

  describe('last-resort terminal failure', () => {
    const source = { fingerprint: 'sha256:source', retryCount: 2 };

    it('settles the owned project from the queued job identifiers', async () => {
      await terminalFailures.get('clip.analysis')?.({
        inputValues: {
          job: { orgId: 'org-1', projectId: 'project-1', source },
        },
        organizationId: 'org-1',
        workflowError: 'Action contract input validation failed',
      });

      expect(clipProjects.settleInFlightFailure).toHaveBeenCalledWith(
        'project-1',
        'org-1',
        source,
      );
    });

    it('refuses a job from another tenant', async () => {
      await expect(
        terminalFailures.get('clip.analysis')?.({
          inputValues: { job: { orgId: 'org-2', projectId: 'project-1' } },
          organizationId: 'org-1',
          workflowError: 'failed',
        }),
      ).rejects.toThrow('no project for its tenant');
      expect(clipProjects.settleInFlightFailure).not.toHaveBeenCalled();
    });
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
              ingredientId: 'library-video-1',
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
        // A Library asset is shared between projects, so its stored copy and
        // audio are keyed by this project, never by the shared ingredient.
        ingredientId: 'project-1',
        params: {
          inputPath: 'https://media.argil.test/videos/library-video.mp4',
          materializeSource: true,
        },
        type: 'video-to-audio',
      }),
      expect.anything(),
    );
  });
  it('keeps the files service reason when audio extraction fails', async () => {
    http.post.mockReturnValue(of({ data: { jobId: 'job-7' } }));
    http.get.mockReturnValue(
      of({
        data: {
          failedReason: 'Source video is unreadable',
          jobId: 'job-7',
          state: 'failed',
        },
      }),
    );

    await expect(
      actions.get('clip.analysis.prepare-source')?.({
        input: {
          job: {
            orgId: 'org-1',
            projectId: 'project-1',
            userId: 'user-1',
            youtubeUrl: 'https://www.youtube.com/watch?v=abc123def45',
          },
        },
      } as never),
    ).rejects.toThrow(
      'Audio extraction job job-7 failed: Source video is unreadable',
    );
  });
  it.each([
    ['clip.analysis.prepare-source', 'job'],
    ['clip.analysis.transcribe', 'prepared'],
    ['clip.analysis.detect-highlights', 'transcribed'],
    ['clip.analysis.extract-reference-frames', 'highlighted'],
    ['clip.analysis.persist', 'referenced'],
    ['clip.analysis.fail', 'job'],
  ])(
    'refuses forged organization or actor before effects for %s',
    async (actionId, field) => {
      for (const actor of [
        { orgId: 'foreign-org', userId: 'user-1' },
        { orgId: 'org-1', userId: 'foreign-user' },
      ]) {
        const data = { ...actor, projectId: 'project-1' };
        await expect(
          actions.get(actionId)?.({
            input: { [field]: field === 'job' ? data : { data } },
          } as never),
        ).rejects.toThrow('does not match its execution actor');
      }
      expect(clipProjects.findOne).not.toHaveBeenCalled();
      expect(clipProjects.patch).not.toHaveBeenCalled();
      expect(http.post).not.toHaveBeenCalled();
      expect(http.get).not.toHaveBeenCalled();
      expect(whisper.transcribeUrl).not.toHaveBeenCalled();
    },
  );

  it('reuses a persisted transcript on a downstream retry without extracting or transcribing again', async () => {
    const transcription = {
      duration: 25,
      language: 'en',
      segments: [{ start: 0, end: 25, text: 'Persisted source transcript.' }],
      srt: '1\n00:00:00,000 --> 00:00:25,000\nPersisted source transcript.',
      text: 'Persisted source transcript.',
    };
    clipProjects.findOne.mockResolvedValue({
      analysisTranscription: {
        requestedLanguage: 'en',
        sourceFingerprint: 'sha256:source',
        transcription,
      },
    });
    const prepared = await actions.get('clip.analysis.prepare-source')?.({
      input: {
        job: {
          language: 'en',
          orgId: 'org-1',
          projectId: 'project-1',
          source: {
            fingerprint: 'sha256:source',
            kind: 'youtube',
            retryCount: 1,
          },
          userId: 'user-1',
          youtubeUrl: 'https://www.youtube.com/watch?v=abc123def45',
        },
      },
    } as never);
    const result = await actions.get('clip.analysis.transcribe')?.({
      input: { prepared },
    } as never);
    expect(result).toMatchObject({ transcription });
    expect(clipProjects.findOne).toHaveBeenCalledWith({
      id: 'project-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(http.post).not.toHaveBeenCalled();
    expect(whisper.transcribeUrl).not.toHaveBeenCalled();
  });

  it.each(['direct', 'wrapped'] as const)(
    'reads %s Files status while preserving the YouTube URL',
    async (shape) => {
      http.post.mockReturnValue(of({ data: { jobId: 'audio-1' } }));
      const status = {
        data: {
          id: 'clip-audio-project-1',
          params: { youtubeUrl: 'https://www.youtube.com/watch?v=abc123def45' },
        },
        state: 'completed',
        result: {
          url: 'https://cdn.test/audio.mp3',
          sourceUrl: 'https://cdn.test/source.mp4',
          sourceS3Key: 'videos/source.mp4',
          sourceDurationSeconds: 25,
        },
      };
      http.get.mockReturnValue(
        of({ data: shape === 'direct' ? status : { data: status } }),
      );
      await actions.get('clip.analysis.prepare-source')?.({
        input: {
          job: {
            language: 'en',
            orgId: 'org-1',
            projectId: 'project-1',
            userId: 'user-1',
            youtubeUrl: 'https://www.youtube.com/watch?v=abc123def45',
            source: {
              fingerprint: 'sha256:source',
              kind: 'youtube',
              retryCount: 0,
            },
          },
        },
      } as never);
      const artifactWrite = clipProjects.patch.mock.calls.find(
        (call) => call[1]?.sourceVideoS3Key,
      );
      expect(artifactWrite?.[1]).toMatchObject({
        sourceVideoS3Key: 'videos/source.mp4',
        source: { artifact: { mediaUrl: 'https://cdn.test/source.mp4' } },
      });
      expect(artifactWrite?.[1]).not.toHaveProperty('sourceVideoUrl');
    },
  );

  it.each(['completed', 'failed'] as const)(
    'reads reference Files %s state outside request data',
    async (state) => {
      http.post.mockReturnValue(of({ data: { jobId: 'frames-1' } }));
      http.get.mockReturnValue(
        of({
          data: {
            data: {
              id: 'clip-reference-frames-project-1',
              params: { timestamps: [15] },
            },
            state,
            result: {
              referenceFrames: {
                schemaVersion: 1,
                status: 'unavailable',
                candidates: [],
                diagnostics: [
                  {
                    code: 'actual-files-result',
                    message: 'No frame',
                    severity: 'warning',
                  },
                ],
                selectedCandidateId: null,
              },
            },
          },
        }),
      );
      const result = await actions.get(
        'clip.analysis.extract-reference-frames',
      )?.({
        input: {
          highlighted: {
            data: { orgId: 'org-1', projectId: 'project-1', userId: 'user-1' },
            sourceUrl: 'https://www.youtube.com/watch?v=abc123def45',
            highlights: [
              {
                id: 'h1',
                start_time: 10,
                end_time: 20,
                title: 'Hook',
                summary: 'Hook',
                tags: [],
                clip_type: 'hook',
                virality_score: 90,
              },
            ],
          },
        },
      } as never);
      expect(result).toMatchObject({
        referenceFrames: {
          diagnostics: [
            expect.objectContaining({
              code:
                state === 'completed'
                  ? 'actual-files-result'
                  : 'clip_reference_extraction_failed',
            }),
          ],
        },
      });
      expect(http.get).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves the materialized source when failure compensation uses the original job payload', async () => {
    const source = {
      fingerprint: 'sha256:source',
      kind: 'youtube',
      retryCount: 0,
      artifact: {
        mediaUrl: 'https://cdn.test/source.mp4',
        storageKey: 'videos/source.mp4',
      },
    };
    clipProjects.findOne.mockResolvedValue({ source });
    await actions.get('clip.analysis.fail')?.({
      input: {
        job: {
          orgId: 'org-1',
          userId: 'user-1',
          projectId: 'project-1',
          source: {
            fingerprint: 'sha256:source',
            kind: 'youtube',
            retryCount: 0,
          },
        },
        workflowError: 'Highlights unavailable',
      },
    } as never);
    expect(clipProjects.patch).toHaveBeenCalledWith(
      'project-1',
      {
        source: expect.objectContaining({
          artifact: source.artifact,
          status: 'failed',
        }),
      },
      [],
      'org-1',
    );
  });

  it('shows the creator the failure reason without the internal step name', async () => {
    const source = {
      fingerprint: 'sha256:source',
      kind: 'library',
      retryCount: 0,
    };
    clipProjects.findOne.mockResolvedValue({ source });
    await actions.get('clip.analysis.fail')?.({
      input: {
        job: {
          orgId: 'org-1',
          userId: 'user-1',
          projectId: 'project-1',
          source,
        },
        workflowError:
          'Nodes failed: prepare-source: Audio extraction job 7 failed: Source video is unreadable',
      },
    } as never);
    expect(clipProjects.patch).toHaveBeenCalledWith(
      'project-1',
      {
        error: 'Audio extraction job 7 failed: Source video is unreadable',
        status: 'failed',
      },
      [],
      'org-1',
    );
    expect(clipProjects.patch).toHaveBeenCalledWith(
      'project-1',
      {
        source: expect.objectContaining({
          failure: {
            code: 'clip_source_processing_failed',
            message:
              'Audio extraction job 7 failed: Source video is unreadable',
            retryable: true,
          },
          status: 'failed',
        }),
      },
      [],
      'org-1',
    );
  });

  it('does not overwrite a newer retry from an old failure graph', async () => {
    clipProjects.findOne.mockResolvedValue({
      source: {
        fingerprint: 'sha256:source',
        retryCount: 1,
      },
    });
    await actions.get('clip.analysis.fail')?.({
      input: {
        job: {
          orgId: 'org-1',
          userId: 'user-1',
          projectId: 'project-1',
          source: {
            fingerprint: 'sha256:source',
            retryCount: 0,
          },
        },
        workflowError: 'Old attempt failed',
      },
    } as never);
    expect(clipProjects.patch).not.toHaveBeenCalled();
  });
  it.each([0, 1])(
    'projects a legacy source failure only before any retry (%s)',
    async (retryCount) => {
      clipProjects.findOne.mockResolvedValue({
        source: { fingerprint: 'sha256:source', kind: 'youtube', retryCount },
      });
      await actions.get('clip.analysis.fail')?.({
        input: {
          job: { orgId: 'org-1', userId: 'user-1', projectId: 'project-1' },
          workflowError: 'Audio acquisition failed',
        },
      } as never);
      if (retryCount === 0) {
        expect(clipProjects.patch).toHaveBeenCalledWith(
          'project-1',
          {
            source: expect.objectContaining({
              status: 'failed',
              retryCount: 0,
            }),
          },
          [],
          'org-1',
        );
      } else expect(clipProjects.patch).not.toHaveBeenCalled();
    },
  );
});
