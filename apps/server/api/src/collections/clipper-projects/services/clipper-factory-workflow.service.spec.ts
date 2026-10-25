import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import type {
  SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
  SystemWorkflowTerminalFailureHandler,
} from '@api/collections/workflows/system-workflow-runner.service';
import { ClipperFactoryWorkflowService } from './clipper-factory-workflow.service';

describe('ClipperFactoryWorkflowService', () => {
  const actions = new Map<string, SystemWorkflowActionExecutor>();
  const clipperProjects = {
    findOne: vi.fn(),
    patch: vi.fn(),
    reconcileTerminalState: vi.fn(),
    settleInFlightFailure: vi.fn(),
  };
  const terminalFailures = new Map<
    string,
    SystemWorkflowTerminalFailureHandler
  >();
  const clipperResults = { findByProject: vi.fn() };
  const runner = {
    registerAction: vi.fn(
      (actionId: string, executor: SystemWorkflowActionExecutor) => {
        actions.set(actionId, executor);
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
  const service = new ClipperFactoryWorkflowService(
    clipperProjects as unknown as ClipperProjectsService,
    clipperResults as unknown as ClipperResultsService,
    runner as unknown as SystemWorkflowRunnerService,
  );

  beforeEach(() => {
    actions.clear();
    vi.clearAllMocks();
    service.onModuleInit();
  });

  it.each([
    'clipper.generation.plan',
    'clipper.factory.fail',
    'clipper.generation.finalize-child',
  ])('rejects a substituted actor before effects for %s', async (actionId) => {
    const input = {
      highlights: [],
      language: 'en',
      maxClips: 3,
      minViralityScore: 50,
      orgId: 'foreign-org',
      projectId: 'project-1',
      userId: 'user-1',
      youtubeUrl: 'https://youtu.be/abc123def45',
    };
    const executor = actions.get(actionId);
    expect(executor).toBeDefined();
    await expect(
      executor?.({
        context: { organizationId: 'org-1', userId: 'user-1' },
        input:
          actionId === 'clipper.factory.fail'
            ? { job: input }
            : { request: input },
      } as never),
    ).rejects.toThrow('does not match');
    expect(clipperProjects.patch).not.toHaveBeenCalled();
    expect(clipperProjects.reconcileTerminalState).not.toHaveBeenCalled();
    expect(clipperResults.findByProject).not.toHaveBeenCalled();
  });

  it('settles a stuck quick run when its failure workflow also fails', async () => {
    await terminalFailures.get('clipper.factory')?.({
      inputValues: { job: { orgId: 'org-1', projectId: 'project-1' } },
      organizationId: 'org-1',
      workflowError: 'Action contract input validation failed',
    });

    expect(clipperProjects.settleInFlightFailure).toHaveBeenCalledWith(
      'project-1',
      'org-1',
      undefined,
    );
  });

  describe('failure compensation', () => {
    const source = {
      fingerprint: 'sha256:source',
      flow: 'quick',
      kind: 'youtube',
      maxRetries: 3,
      retryCount: 0,
      schemaVersion: 1,
      status: 'completed',
      updatedAt: '2026-10-10T00:00:00.000Z',
    };
    const job = {
      language: 'en',
      maxClips: 3,
      minViralityScore: 50,
      orgId: 'org-1',
      projectId: 'project-1',
      source,
      userId: 'user-1',
      youtubeUrl: 'https://youtu.be/abc123def45',
    };
    const fail = (workflowError: string, input = job) =>
      actions.get('clipper.factory.fail')?.({
        context: { organizationId: 'org-1', userId: 'user-1' },
        input: { job: input, workflowError },
      } as never);

    it('makes a failure before any clip retryable from the transcribed source', async () => {
      clipperProjects.findOne.mockResolvedValue({ source });
      clipperResults.findByProject.mockResolvedValue([]);

      await fail('Nodes failed: detect-highlights: Highlight model timed out');

      expect(clipperProjects.patch).toHaveBeenCalledWith(
        'project-1',
        {
          error: 'Highlight model timed out',
          source: expect.objectContaining({
            failure: {
              code: 'clip_source_processing_failed',
              message: 'Highlight model timed out',
              retryable: true,
            },
            retryCount: 0,
            status: 'failed',
          }),
          status: 'failed',
        },
        [],
        'org-1',
      );
    });

    it('keeps a completed source once clips exist and records the reason', async () => {
      clipperProjects.findOne.mockResolvedValue({ source });
      clipperResults.findByProject.mockResolvedValue([{ id: 'clip-1' }]);

      await fail('Nodes failed: generate: Avatar provider rejected the job');

      expect(clipperProjects.patch).toHaveBeenCalledWith(
        'project-1',
        {
          error: 'Avatar provider rejected the job',
          source,
          status: 'failed',
        },
        [],
        'org-1',
      );
    });

    it('does not overwrite a newer retry from an old failure graph', async () => {
      clipperProjects.findOne.mockResolvedValue({
        source: { ...source, retryCount: 1, status: 'queued' },
      });

      await fail('Old attempt failed');

      expect(clipperProjects.patch).not.toHaveBeenCalled();
    });
  });

  it('plans hook review and one child input per discovered highlight', async () => {
    const plan = actions.get('clipper.generation.plan');
    const result = await plan?.({
      context: { organizationId: 'org-1', userId: 'user-1' } as never,
      input: {
        highlighted: {
          data: {
            avatarId: 'avatar-1',
            avatarProvider: 'heygen',
            language: 'en',
            maxClips: 3,
            minViralityScore: 50,
            orgId: 'org-1',
            projectId: 'project-1',
            userId: 'user-1',
            voiceId: 'voice-1',
            youtubeUrl: 'https://youtube.com/watch?v=abc123def45',
          },
          highlights: [
            {
              clip_type: 'story',
              end_time: 30,
              start_time: 0,
              summary: 'Story',
              tags: [],
              title: 'Story',
              virality_score: 80,
            },
            {
              clip_type: 'hook',
              end_time: 60,
              start_time: 30,
              summary: 'Hook',
              tags: [],
              title: 'Hook',
              virality_score: 90,
            },
          ],
          sourceUrl: 'https://cdn.test/source.mp4',
          transcription: { segments: [], text: 'Transcript' },
        },
      },
      provenance: {
        executionId: 'execution-1',
        workflowId: 'workflow-1',
        workflowLabel: 'Clip Factory',
      },
    } as never);

    expect(result).toMatchObject({
      hookItems: [1],
      hookReviewRequired: true,
      remainingItems: [0],
    });
    expect(clipperProjects.patch).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        status: 'generating',
        workflowExecutionId: 'execution-1',
      }),
      [],
      'org-1',
    );
  });

  it('plans an immutable manual-generation request without a hook gate', async () => {
    const plan = actions.get('clipper.generation.plan');
    const result = await plan?.({
      context: { organizationId: 'org-1', userId: 'user-1' } as never,
      input: {
        request: {
          avatarId: 'avatar-1',
          highlights: [{ clip_type: 'hook' }, { clip_type: 'story' }],
          hookApprovalRequired: false,
          mode: 'avatar',
          orgId: 'org-1',
          projectId: 'project-1',
          provider: 'heygen',
          userId: 'user-1',
          voiceId: 'voice-1',
        },
      },
      provenance: {
        executionId: 'execution-2',
        workflowId: 'workflow-2',
        workflowLabel: 'Clip Generation',
      },
    } as never);

    expect(result).toMatchObject({
      hookItems: [],
      hookReviewRequired: false,
      remainingItems: [0, 1],
    });
  });

  it('reconciles the project when the last child reaches finalization', async () => {
    clipperResults.findByProject.mockResolvedValue([
      { id: 'clip-1', status: 'extracting' },
      { id: 'clip-2', status: 'failed' },
    ]);
    const finalize = actions.get('clipper.generation.finalize-child');

    const result = await finalize?.({
      context: { organizationId: 'org-1', userId: 'user-1' } as never,
      input: {
        failure: {
          error: 'Provider dispatch failed',
          failedNodeId: 'generate-clip',
        },
        originalIndex: 1,
        request: {
          highlights: [{ clip_type: 'hook' }, { clip_type: 'story' }],
          orgId: 'org-1',
          projectId: 'project-1',
          userId: 'user-1',
        },
      },
      provenance: {
        executionId: 'execution-1',
        workflowId: 'workflow-1',
        workflowLabel: 'Generate One Clip',
      },
    } as never);

    expect(result).toMatchObject({
      expectedClipCount: 2,
      observedClipCount: 2,
      originalIndex: 1,
      queuedClipCount: 0,
      reconciled: true,
    });
    expect(clipperProjects.reconcileTerminalState).toHaveBeenCalledWith(
      'project-1',
      'org-1',
    );
  });
});
