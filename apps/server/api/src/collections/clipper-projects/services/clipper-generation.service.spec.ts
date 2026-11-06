import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { ClipperAvatarBillingService } from '@api/collections/clipper-projects/services/clipper-avatar-billing.service';
import type { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import type { SystemWorkflowActionExecutor } from '@api/collections/workflows/system-workflow-runner.service';
import type { AvatarVideoService } from '@api/services/avatar-video/avatar-video.service';
import type { AvatarVideoProvider } from '@api/services/avatar-video/avatar-video-provider.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import {
  type ClipperGenerationInput,
  type ClipperGenerationResult,
  ClipperGenerationService,
} from './clipper-generation.service';
import type { RawCutClipService } from './raw-cut-clip.service';

const request: ClipperGenerationInput = {
  avatarId: 'avatar-1',
  highlights: [
    {
      clip_type: 'hook',
      end_time: 20,
      start_time: 0,
      summary: 'Hook summary',
      tags: ['hook'],
      title: 'Hook',
      virality_score: 90,
    },
    {
      clip_type: 'body',
      end_time: 40,
      start_time: 20,
      summary: 'Body summary',
      tags: ['body'],
      title: 'Body',
      virality_score: 80,
    },
  ],
  hookApprovalRequired: false,
  orgId: 'org-1',
  projectId: 'project-1',
  userId: 'user-1',
  voiceId: 'voice-1',
};

interface ClipRow {
  [key: string]: unknown;
  id: string;
}

/**
 * The workflow runner, clip-result store, avatar provider, raw-cut dispatch,
 * project store and avatar billing behind the generation service. Registered
 * workflows, started runs, clip rows, provider submissions, fundings and
 * project patches are recorded as they happen.
 */
function createHarness() {
  const actions = new Map<string, SystemWorkflowActionExecutor>();
  const workflows: { canonicalId: string }[] = [];
  const startedRuns: unknown[] = [];
  const clips: ClipRow[] = [];
  const submissions: Parameters<AvatarVideoProvider['generateVideo']>[0][] = [];
  const fundings: unknown[] = [];
  const projectPatches: unknown[] = [];
  const state = { execution: null as unknown };
  const runner = {
    registerAction: (
      actionId: string,
      executor: SystemWorkflowActionExecutor,
    ) => {
      actions.set(actionId, executor);
    },
    registerWorkflow: (definition: { canonicalId: string }) => {
      workflows.push(definition);
    },
    startWorkflow: async (run: unknown) => {
      startedRuns.push(run);
      return state.execution;
    },
  };
  const createClip = async (data: Record<string, unknown>) => {
    const row = { ...data, id: `clipper-result-${clips.length + 1}` };
    clips.push(row);
    return { id: row.id };
  };
  const clipperResults = {
    create: createClip,
    createGenerated: createClip,
    patch: async (id: string, data: Record<string, unknown>) => {
      Object.assign(clips.find((row) => row.id === id) ?? {}, data);
      return {};
    },
    transitionProviderTerminal: async () => true,
  };
  const provider: Pick<AvatarVideoProvider, 'generateVideo'> = {
    generateVideo: async (input) => {
      submissions.push(input);
      return { jobId: 'job-1', providerName: 'heygen', status: 'processing' };
    },
  };
  const silent = () => undefined;
  const service = new ClipperGenerationService(
    clipperResults as unknown as ClipperResultsService,
    { getProvider: () => provider } as unknown as AvatarVideoService,
    { dispatchClip: silent } as unknown as RawCutClipService,
    { error: silent, log: silent } as unknown as LoggerService,
    {
      fund: async (funding: unknown) => {
        fundings.push(funding);
        return { release: silent };
      },
    } as unknown as ClipperAvatarBillingService,
    undefined,
    {
      patch: async (...args: unknown[]) => {
        projectPatches.push(args);
        return {};
      },
    } as unknown as ClipperProjectsService,
    { get: () => runner } as unknown as ModuleRef,
  );
  service.onModuleInit();
  const generateOne = async (originalIndex: number, input = request) => {
    const executor = actions.get('clipper.generation.generate-one');
    if (!executor) {
      throw new Error('generate-one action was not registered');
    }
    return executor({
      context: { organizationId: 'org-1', userId: 'user-1' } as never,
      input: { originalIndex, request: input },
      provenance: {
        executionId: 'execution-1',
        workflowId: 'workflow-1',
        workflowLabel: 'Clip Generation',
      },
    });
  };
  return {
    actions,
    clips,
    fundings,
    generateOne,
    projectPatches,
    service,
    startedRuns,
    state,
    submissions,
    workflows,
  };
}

function completedExecution(result: ClipperGenerationResult) {
  const childResults = result.clipperResultIds.map(
    (clipperResultId, index) => ({
      index,
      provenance: {
        executionId: `child-execution-${index}`,
        workflowId: 'clipper.generation.one',
        workflowLabel: 'Generate One Clip',
      },
      result: {
        clipperResultIds: [clipperResultId],
        originalIndex: index,
        providerJobIds: [result.providerJobIds[index] ?? ''],
        queuedClipCount: result.providerJobIds[index] ? 1 : 0,
      },
    }),
  );
  return {
    execution: {
      executionId: 'execution-1',
      nodeResults: [
        {
          creditsUsed: 0,
          nodeId: 'generate-remaining',
          nodeType: 'genfeedAction',
          output: { count: childResults.length, results: childResults },
          retryCount: 0,
          status: 'completed',
        },
      ],
      startedAt: new Date(),
      status: 'COMPLETED',
      totalCreditsUsed: 0,
      workflowId: 'workflow-1',
    },
    provenance: {
      executionId: 'execution-1',
      workflowId: 'workflow-1',
      workflowLabel: 'Clip Generation',
    },
  };
}

describe('ClipperGenerationService workflow boundary', () => {
  it('registers one atomic generator and the immutable parent workflow', () => {
    const { actions, workflows } = createHarness();

    expect([...actions.keys()]).toEqual(['clipper.generation.generate-one']);
    expect(workflows).toEqual([
      expect.objectContaining({ canonicalId: 'clipper.generation' }),
    ]);
  });

  it('starts the immutable graph with all project state owned by its actions', async () => {
    const { projectPatches, service, startedRuns, state } = createHarness();
    const result: ClipperGenerationResult = {
      clipperResultIds: ['clip-1', 'clip-2'],
      providerJobIds: ['job-1', 'job-2'],
      queuedClipCount: 2,
    };
    state.execution = completedExecution(result);

    await expect(service.generateClips(request)).resolves.toEqual(result);
    expect(startedRuns).toEqual([
      expect.objectContaining({
        actionType: 'clipper.generation',
        canonicalId: 'clipper.generation',
        inputValues: { request, reviewContext: { attempt: 1 } },
        metadata: expect.objectContaining({
          clipperHookReviewAttempt: 1,
          projectId: 'project-1',
        }),
        organizationId: 'org-1',
        source: 'clipper.generation',
        userId: 'user-1',
      }),
    ]);
    expect(projectPatches).toEqual([]);
  });

  it('returns only the hook output while its native review gate is pending', async () => {
    const { service, state } = createHarness();
    const hookResult: ClipperGenerationResult = {
      clipperResultIds: ['hook-result'],
      providerJobIds: ['hook-job'],
      queuedClipCount: 1,
    };
    state.execution = {
      ...completedExecution(hookResult),
      execution: {
        ...completedExecution(hookResult).execution,
        nodeResults: [
          {
            creditsUsed: 0,
            nodeId: 'generate-hook',
            nodeType: 'genfeedAction',
            output: {
              count: 1,
              results: [
                {
                  index: 0,
                  result: { ...hookResult, originalIndex: 0 },
                },
              ],
            },
            retryCount: 0,
            status: 'COMPLETED',
          },
        ],
        status: 'RUNNING',
      },
    };

    await expect(
      service.generateClips({ ...request, hookApprovalRequired: true }),
    ).resolves.toEqual({ ...hookResult, awaitingHookApproval: true });
  });

  it('rejects a substituted tenant before creating or dispatching a clip', async () => {
    const { clips, generateOne, submissions } = createHarness();

    await expect(
      generateOne(0, { ...request, orgId: 'foreign-org' }),
    ).rejects.toThrow('does not match');
    expect(clips).toEqual([]);
    expect(submissions).toEqual([]);
  });

  it('dispatches exactly the highlight selected by the action node', async () => {
    const { clips, generateOne, submissions } = createHarness();

    await generateOne(1);

    expect(submissions).toEqual([
      expect.objectContaining({ script: 'Body. Body summary' }),
    ]);
    expect(clips).toEqual([
      expect.objectContaining({ index: 1, title: 'Body' }),
    ]);
  });

  describe('avatar script', () => {
    async function scriptFor(overrides: Partial<ClipperGenerationInput>) {
      const { generateOne, submissions } = createHarness();
      await generateOne(0, { ...request, ...overrides });
      return submissions[0]?.script;
    }

    it('says the reviewed script, not the clip description', async () => {
      const [hook, body] = request.highlights;
      await expect(
        scriptFor({
          highlights: [{ ...hook, script: ' Ship on Fridays. ' }, body],
        }),
      ).resolves.toBe('Ship on Fridays.');
    });

    it('says the tightened words from the transcript when no script was saved', async () => {
      await expect(
        scriptFor({
          transcriptSegments: [
            { end: 8, start: 0, text: 'Um, we we ship on Fridays.' },
            { end: 18, start: 10, text: 'No exceptions.' },
            { end: 30, start: 25, text: 'Outside the clip.' },
          ],
        }),
      ).resolves.toBe('We ship on Fridays. No exceptions.');
    });
  });

  it('funds each HeyGen clip on its own clip result before the provider submits', async () => {
    const { fundings, generateOne, submissions } = createHarness();

    await generateOne(0);

    expect(submissions[0]?.callbackId).toBe('clipper-result-1');
    const plan = {
      isByok: false,
      selection: { modelKey: 'heygen/avatar' },
    };
    await submissions[0]?.fundSubmission?.(plan);
    expect(fundings).toEqual([
      {
        clipperResultId: 'clipper-result-1',
        organizationId: 'org-1',
        plan,
        script: 'Hook. Hook summary',
        userId: 'user-1',
      },
    ]);
  });
});
