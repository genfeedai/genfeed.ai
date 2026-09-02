import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type {
  SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { ClipFactoryWorkflowService } from './clip-factory-workflow.service';

describe('ClipFactoryWorkflowService', () => {
  const actions = new Map<string, SystemWorkflowActionExecutor>();
  const clipProjects = { patch: vi.fn(), reconcileTerminalState: vi.fn() };
  const clipResults = { findByProject: vi.fn() };
  const runner = {
    registerAction: vi.fn(
      (actionId: string, executor: SystemWorkflowActionExecutor) => {
        actions.set(actionId, executor);
      },
    ),
    registerWorkflow: vi.fn(),
  };
  const service = new ClipFactoryWorkflowService(
    clipProjects as unknown as ClipProjectsService,
    clipResults as unknown as ClipResultsService,
    runner as unknown as SystemWorkflowRunnerService,
  );

  beforeEach(() => {
    actions.clear();
    vi.clearAllMocks();
    service.onModuleInit();
  });

  it('plans hook review and one child input per discovered highlight', async () => {
    const plan = actions.get('clip.generation.plan');
    const result = await plan?.({
      context: {} as never,
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
    expect(clipProjects.patch).toHaveBeenCalledWith(
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
    const plan = actions.get('clip.generation.plan');
    const result = await plan?.({
      context: {} as never,
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
    clipResults.findByProject.mockResolvedValue([
      { id: 'clip-1', status: 'extracting' },
      { id: 'clip-2', status: 'failed' },
    ]);
    const finalize = actions.get('clip.generation.finalize-child');

    const result = await finalize?.({
      context: {} as never,
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
    expect(clipProjects.reconcileTerminalState).toHaveBeenCalledWith(
      'project-1',
      'org-1',
    );
  });
});
