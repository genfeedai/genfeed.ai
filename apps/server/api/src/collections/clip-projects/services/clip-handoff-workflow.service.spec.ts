import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { ClipLibraryLinkService } from '@api/collections/clip-projects/services/clip-library-link.service';
import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import type {
  SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';
import { ClipHandoffWorkflowService } from './clip-handoff-workflow.service';

function createHarness() {
  const actions = new Map<string, SystemWorkflowActionExecutor>();
  const runner = {
    registerAction: vi.fn(
      (actionId: string, executor: SystemWorkflowActionExecutor) => {
        actions.set(actionId, executor);
      },
    ),
    registerWorkflow: vi.fn(),
    runWorkflow: vi.fn().mockResolvedValue({ result: { id: 'result-1' } }),
  };
  const clipLibrary = { linkReadyClip: vi.fn() };
  const clipProjects = {
    findOne: vi.fn().mockResolvedValue({ id: 'project-1' }),
    reconcileTerminalState: vi.fn().mockResolvedValue({ id: 'project-1' }),
  };
  const clipResults = {
    findProjectResultForHandoff: vi.fn().mockResolvedValue({
      duration: 10,
      id: 'clip-1',
      ingredientId: 'ingredient-1',
      readiness: { readyActions: ['edit', 'publish'] },
      status: 'completed',
      summary: 'Summary',
      title: 'Title',
      videoUrl: 'https://cdn.test/clip.mp4',
    }),
  };
  const editors = { create: vi.fn().mockResolvedValue({ id: 'editor-1' }) };
  const service = new ClipHandoffWorkflowService(
    clipLibrary as unknown as ClipLibraryLinkService,
    clipProjects as unknown as ClipProjectsService,
    clipResults as unknown as ClipResultsService,
    editors as unknown as EditorProjectsService,
    { log: vi.fn() } as unknown as LoggerService,
    runner as unknown as SystemWorkflowRunnerService,
  );
  service.onModuleInit();
  return {
    actions,
    clipLibrary,
    clipProjects,
    clipResults,
    editors,
    runner,
    service,
  };
}

const actionRequest = {
  context: { organizationId: 'org-1', userId: 'user-1' } as never,
  input: { clipResultId: 'clip-1', projectId: 'project-1' },
  provenance: {
    executionId: 'execution-1',
    workflowId: 'workflow-1',
    workflowLabel: 'Clip Handoff',
  },
};

describe('ClipHandoffWorkflowService', () => {
  it('registers every handoff operation as an action node', () => {
    const { actions } = createHarness();

    expect([...actions.keys()]).toEqual([
      'clip.handoff.create-editor',
      'clip.handoff.prepare-publish',
      'clip.handoff.link-library',
    ]);
  });

  it('routes the controller-facing methods through system workflows', async () => {
    const { runner, service } = createHarness();

    await service.createEditorHandoff(
      { clipResultId: 'clip-1', projectId: 'project-1' },
      { organizationId: 'org-1', userId: 'user-1' },
    );

    expect(runner.runWorkflow).toHaveBeenCalledWith({
      actionType: 'clip.handoff.create-editor',
      canonicalId: 'clip.handoff.editor',
      inputValues: { clipResultId: 'clip-1', projectId: 'project-1' },
      organizationId: 'org-1',
      source: 'clip-project-handoff',
      userId: 'user-1',
    });
  });

  it('creates editor state only inside the editor action', async () => {
    const { actions, editors } = createHarness();
    const action = actions.get('clip.handoff.create-editor');
    if (!action) {
      throw new Error('Editor handoff action was not registered');
    }

    await expect(action(actionRequest)).resolves.toEqual({
      clipProjectId: 'project-1',
      clipResultId: 'clip-1',
      editorPath: '/studio/edit/editor-1',
      editorProjectId: 'editor-1',
      videoUrl: 'https://cdn.test/clip.mp4',
    });
    expect(editors.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
  });

  it('builds the publish handoff only inside the publish action', async () => {
    const { actions } = createHarness();
    const action = actions.get('clip.handoff.prepare-publish');
    if (!action) {
      throw new Error('Publish handoff action was not registered');
    }

    await expect(action(actionRequest)).resolves.toEqual(
      expect.objectContaining({
        clipProjectId: 'project-1',
        clipResultId: 'clip-1',
        payload: expect.objectContaining({
          confirmBeforePublish: true,
          platforms: ['instagram'],
          schedule: 'immediate',
        }),
      }),
    );
  });

  it('rejects publish inside the action when readiness does not allow it', async () => {
    const { actions, clipResults } = createHarness();
    clipResults.findProjectResultForHandoff.mockResolvedValue({
      id: 'clip-1',
      readiness: { readyActions: ['download'] },
      status: 'completed',
      videoUrl: 'https://cdn.test/clip.mp4',
    });
    const action = actions.get('clip.handoff.prepare-publish');
    if (!action) {
      throw new Error('Publish handoff action was not registered');
    }

    await expect(action(actionRequest)).rejects.toThrow(
      'not ready for publish handoff',
    );
  });

  it('requires a Library ingredient inside the editor action', async () => {
    const { actions, clipResults, editors } = createHarness();
    clipResults.findProjectResultForHandoff.mockResolvedValue({
      id: 'clip-1',
      readiness: { readyActions: ['edit'] },
      status: 'completed',
      videoUrl: 'https://cdn.test/clip.mp4',
    });
    const action = actions.get('clip.handoff.create-editor');
    if (!action) {
      throw new Error('Editor handoff action was not registered');
    }

    await expect(action(actionRequest)).rejects.toThrow(
      'not linked to a Library asset',
    );
    expect(editors.create).not.toHaveBeenCalled();
  });

  it('links the completed clip only inside the Library action', async () => {
    const { actions, clipLibrary } = createHarness();
    clipLibrary.linkReadyClip.mockResolvedValue({
      clipResultId: 'clip-1',
      ingredientId: 'ingredient-1',
      status: 'linked',
    });
    const action = actions.get('clip.handoff.link-library');
    if (!action) {
      throw new Error('Library handoff action was not registered');
    }

    await expect(action(actionRequest)).resolves.toEqual({
      clipResultId: 'clip-1',
      ingredientId: 'ingredient-1',
      status: 'linked',
    });
    expect(clipLibrary.linkReadyClip).toHaveBeenCalledWith({
      clipResultId: 'clip-1',
      organizationId: 'org-1',
    });
  });
});
