import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { ClipperLibraryLinkService } from '@api/collections/clipper-projects/services/clipper-library-link.service';
import type { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import type { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import type {
  SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it } from 'vitest';
import { ClipperHandoffWorkflowService } from './clipper-handoff-workflow.service';

interface HandoffClip {
  duration?: number;
  id: string;
  ingredientId?: string;
  readiness: { readyActions: string[] };
  status: string;
  summary?: string;
  title?: string;
  videoUrl: string;
}

const readyClip: HandoffClip = {
  duration: 10,
  id: 'clip-1',
  ingredientId: 'ingredient-1',
  readiness: { readyActions: ['edit', 'publish'] },
  status: 'completed',
  summary: 'Summary',
  title: 'Title',
  videoUrl: 'https://cdn.test/clip.mp4',
};

/**
 * Every collaborator touch lands in `touched`, in order; created editor
 * projects, Library links and system workflow runs are kept as rows.
 */
function createHarness(clip: HandoffClip = readyClip) {
  const actions = new Map<string, SystemWorkflowActionExecutor>();
  const touched: string[] = [];
  const editorProjects: Record<string, unknown>[] = [];
  const libraryLinks: Record<string, unknown>[] = [];
  const workflowRuns: Record<string, unknown>[] = [];
  const runner = {
    registerAction: (
      actionId: string,
      executor: SystemWorkflowActionExecutor,
    ) => {
      actions.set(actionId, executor);
    },
    registerWorkflow: () => undefined,
    runWorkflow: async (run: Record<string, unknown>) => {
      workflowRuns.push(run);
      return { result: { id: 'result-1' } };
    },
  };
  const clipperLibrary = {
    linkReadyClip: async (input: Record<string, unknown>) => {
      touched.push('library.linkReadyClip');
      libraryLinks.push(input);
      return {
        clipperResultId: input.clipperResultId,
        ingredientId: clip.ingredientId,
        status: 'linked',
      };
    },
  };
  const clipperProjects = {
    findOne: async () => {
      touched.push('projects.findOne');
      return { id: 'project-1' };
    },
    reconcileTerminalState: async () => ({ id: 'project-1' }),
  };
  const clipperResults = {
    findProjectResultForHandoff: async () => {
      touched.push('results.findProjectResultForHandoff');
      return clip;
    },
  };
  const editors = {
    create: async (input: Record<string, unknown>) => {
      touched.push('editors.create');
      editorProjects.push(input);
      return { id: `editor-${editorProjects.length}` };
    },
  };
  const service = new ClipperHandoffWorkflowService(
    clipperLibrary as unknown as ClipperLibraryLinkService,
    clipperProjects as unknown as ClipperProjectsService,
    clipperResults as unknown as ClipperResultsService,
    editors as unknown as EditorProjectsService,
    { log: () => undefined } as unknown as LoggerService,
    runner as unknown as SystemWorkflowRunnerService,
  );
  service.onModuleInit();
  const action = (actionId: string) => {
    const executor = actions.get(actionId);
    if (!executor) throw new Error(`${actionId} was not registered`);
    return executor;
  };
  return {
    action,
    actions,
    editorProjects,
    libraryLinks,
    service,
    touched,
    workflowRuns,
  };
}

const actionRequest = {
  context: { organizationId: 'org-1', userId: 'user-1' } as never,
  input: { clipperResultId: 'clip-1', projectId: 'project-1' },
  provenance: {
    executionId: 'execution-1',
    workflowId: 'workflow-1',
    workflowLabel: 'Clip Handoff',
  },
};

describe('ClipperHandoffWorkflowService', () => {
  it.each([
    'clipper.handoff.create-editor',
    'clipper.handoff.prepare-publish',
    'clipper.handoff.link-library',
  ])(
    'rejects a forged tenant before any handoff lookup for %s',
    async (actionId) => {
      const { action, touched } = createHarness();

      await expect(
        action(actionId)({
          ...actionRequest,
          input: { ...actionRequest.input, organizationId: 'foreign-org' },
        }),
      ).rejects.toThrow('does not match');
      expect(touched).toEqual([]);
    },
  );

  it('registers every handoff operation as an action node', () => {
    const { actions } = createHarness();

    expect([...actions.keys()]).toEqual([
      'clipper.handoff.create-editor',
      'clipper.handoff.prepare-publish',
      'clipper.handoff.link-library',
    ]);
  });

  it('routes the controller-facing methods through system workflows', async () => {
    const { service, touched, workflowRuns } = createHarness();

    await service.createEditorHandoff(
      { clipperResultId: 'clip-1', projectId: 'project-1' },
      { organizationId: 'org-1', userId: 'user-1' },
    );

    expect(workflowRuns).toEqual([
      {
        actionType: 'clipper.handoff.create-editor',
        canonicalId: 'clipper.handoff.editor',
        inputValues: { clipperResultId: 'clip-1', projectId: 'project-1' },
        organizationId: 'org-1',
        source: 'clipper-project-handoff',
        userId: 'user-1',
      },
    ]);
    // The controller-facing method itself creates nothing.
    expect(touched).toEqual([]);
  });

  it('creates editor state only inside the editor action', async () => {
    const { action, editorProjects } = createHarness();

    await expect(
      action('clipper.handoff.create-editor')(actionRequest),
    ).resolves.toEqual({
      clipperProjectId: 'project-1',
      clipperResultId: 'clip-1',
      editorPath: '/editor/editor-1',
      editorProjectId: 'editor-1',
      videoUrl: 'https://cdn.test/clip.mp4',
    });
    expect(editorProjects).toEqual([
      expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
    ]);
  });

  it('builds the publish handoff only inside the publish action', async () => {
    const { action, editorProjects, libraryLinks } = createHarness();

    await expect(
      action('clipper.handoff.prepare-publish')(actionRequest),
    ).resolves.toEqual(
      expect.objectContaining({
        clipperProjectId: 'project-1',
        clipperResultId: 'clip-1',
        payload: expect.objectContaining({
          confirmBeforePublish: true,
          platforms: ['instagram'],
          schedule: 'immediate',
        }),
      }),
    );
    expect(editorProjects).toEqual([]);
    expect(libraryLinks).toEqual([]);
  });

  it('rejects publish inside the action when readiness does not allow it', async () => {
    const { action } = createHarness({
      id: 'clip-1',
      readiness: { readyActions: ['download'] },
      status: 'completed',
      videoUrl: 'https://cdn.test/clip.mp4',
    });

    await expect(
      action('clipper.handoff.prepare-publish')(actionRequest),
    ).rejects.toThrow('not ready for publish handoff');
  });

  it('requires a Library ingredient inside the editor action', async () => {
    const { action, editorProjects } = createHarness({
      id: 'clip-1',
      readiness: { readyActions: ['edit'] },
      status: 'completed',
      videoUrl: 'https://cdn.test/clip.mp4',
    });

    await expect(
      action('clipper.handoff.create-editor')(actionRequest),
    ).rejects.toThrow('not linked to a Library asset');
    expect(editorProjects).toEqual([]);
  });

  it('links the completed clip only inside the Library action', async () => {
    const { action, libraryLinks } = createHarness();

    await expect(
      action('clipper.handoff.link-library')(actionRequest),
    ).resolves.toEqual({
      clipperResultId: 'clip-1',
      ingredientId: 'ingredient-1',
      status: 'linked',
    });
    expect(libraryLinks).toEqual([
      { clipperResultId: 'clip-1', organizationId: 'org-1' },
    ]);
  });
});
