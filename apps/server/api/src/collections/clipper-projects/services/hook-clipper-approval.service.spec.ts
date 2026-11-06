import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type {
  ClipperGenerationInput,
  ClipperGenerationService,
} from '@api/collections/clipper-projects/services/clipper-generation.service';
import type { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import type { ModuleRef } from '@nestjs/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { HookClipApprovalService } from './hook-clipper-approval.service';

const request = {
  highlights: [
    {
      clip_type: 'hook',
      end_time: 20,
      start_time: 0,
      summary: 'Hook summary',
      tags: [],
      title: 'Hook',
      virality_score: 90,
    },
    {
      clip_type: 'body',
      end_time: 40,
      start_time: 20,
      summary: 'Body summary',
      tags: [],
      title: 'Body',
      virality_score: 80,
    },
  ],
  hookApprovalRequired: true,
  orgId: 'org-1',
  projectId: 'project-1',
  userId: 'user-1',
};

interface StoredExecution {
  id: string;
  inputValues: { request: ClipperGenerationInput };
  metadata: Record<string, unknown>;
  nodeResults: Array<Record<string, unknown>>;
  organizationId: string;
  status: string;
  workflowId: string;
}

interface StoredRecord {
  id: string;
  isDeleted: boolean;
  organizationId: string;
  [key: string]: unknown;
}

interface GateDecision {
  approved: boolean;
  executionId: string;
  nodeId: string;
  organizationId: string;
  reason?: string;
  userId: string;
  workflowId: string;
}

function hookDispatch(resultId: string) {
  return {
    nodeId: 'generate-hook',
    nodeType: 'genfeedAction',
    output: {
      count: 1,
      results: [
        {
          index: 0,
          result: {
            clipperResultIds: [resultId],
            originalIndex: 0,
            providerJobIds: [`${resultId}-job`],
            queuedClipCount: 1,
          },
        },
      ],
    },
    status: 'completed',
  };
}

function pendingExecution(
  id: string,
  attempt: number,
  hookResultId: string,
): StoredExecution {
  return {
    id,
    inputValues: { request: request as ClipperGenerationInput },
    metadata: {
      clipperHookReviewAttempt: attempt,
      pendingApproval: { nodeId: 'review-hook' },
    },
    nodeResults: [hookDispatch(hookResultId)],
    organizationId: 'org-1',
    status: 'RUNNING',
    workflowId: 'workflow-1',
  };
}

function matches(
  record: { id: string; isDeleted?: boolean; organizationId: string },
  where: { id: string; isDeleted: boolean; organizationId: string },
): boolean {
  return (
    record.id === where.id &&
    (record.isDeleted ?? false) === where.isDeleted &&
    record.organizationId === where.organizationId
  );
}

describe('HookClipApprovalService workflow review gate', () => {
  let projects: Map<string, StoredRecord>;
  let results: Map<string, StoredRecord>;
  let executions: Map<string, StoredExecution>;
  let decisions: GateDecision[];
  let generations: Array<{
    input: ClipperGenerationInput;
    review: Record<string, unknown>;
  }>;
  let service: HookClipApprovalService;

  beforeEach(() => {
    projects = new Map([
      [
        'project-1',
        {
          id: 'project-1',
          isDeleted: false,
          organizationId: 'org-1',
          status: 'awaiting_review',
          workflowExecutionId: 'execution-1',
        },
      ],
    ]);
    results = new Map([
      [
        'hook-result',
        {
          id: 'hook-result',
          isDeleted: false,
          organizationId: 'org-1',
          projectId: 'project-1',
          status: 'completed',
        },
      ],
    ]);
    executions = new Map([
      ['execution-1', pendingExecution('execution-1', 1, 'hook-result')],
    ]);
    decisions = [];
    generations = [];

    const store = (records: Map<string, StoredRecord>) => ({
      findOne: async (where: {
        id: string;
        isDeleted: boolean;
        organizationId: string;
      }) => {
        const record = records.get(where.id);
        return record && matches(record, where) ? record : null;
      },
      findOneSelect: async (where: {
        id: string;
        isDeleted: boolean;
        organizationId: string;
        projectId?: string;
      }) => {
        const record = records.get(where.id);
        return record &&
          matches(record, where) &&
          (where.projectId === undefined ||
            record.projectId === where.projectId)
          ? record
          : null;
      },
      patch: async (
        id: string,
        update: Record<string, unknown>,
        _populate: unknown[],
        organizationId: string,
      ) => {
        const record = records.get(id);
        if (!record || record.organizationId !== organizationId) {
          throw new Error(`missing ${id}`);
        }
        records.set(id, { ...record, ...update });
        return records.get(id);
      },
    });

    const executor = {
      submitReviewGateApproval: async (
        workflowId: string,
        executionId: string,
        userId: string,
        organizationId: string,
        nodeId: string,
        approved: boolean,
        reason?: string,
      ) => {
        decisions.push({
          approved,
          executionId,
          nodeId,
          organizationId,
          ...(reason ? { reason } : {}),
          userId,
          workflowId,
        });
        const execution = executions.get(executionId) as StoredExecution;
        executions.set(executionId, {
          ...execution,
          metadata: { clipperHookReviewAttempt: 1 },
          status: approved ? 'COMPLETED' : 'FAILED',
        });
        return { status: approved ? 'approved' : 'rejected' };
      },
    };
    const executionsService = {
      findOne: async (where: {
        id: string;
        isDeleted: boolean;
        organizationId: string;
      }) => {
        const execution = executions.get(where.id);
        return execution && matches(execution, where) ? execution : null;
      },
    };
    const clipperGeneration = {
      generateClips: async (
        input: ClipperGenerationInput,
        review: { attempt: number; feedback: string; lastAction: string },
      ) => {
        generations.push({ input, review });
        executions.set('execution-2', {
          ...pendingExecution('execution-2', review.attempt, 'hook-result-2'),
          metadata: {
            clipperHookReviewAttempt: review.attempt,
            clipperHookReviewFeedback: review.feedback,
            clipperHookReviewLastAction: review.lastAction,
            pendingApproval: { nodeId: 'review-hook' },
          },
        });
        results.set('hook-result-2', {
          id: 'hook-result-2',
          isDeleted: false,
          organizationId: 'org-1',
          projectId: 'project-1',
          status: 'extracting',
        });
        const project = projects.get('project-1') as StoredRecord;
        projects.set('project-1', {
          ...project,
          workflowExecutionId: 'execution-2',
        });
        return {};
      },
    };
    const moduleRef = {
      get: (token: unknown) =>
        token === WorkflowExecutorService ? executor : executionsService,
    };

    service = new HookClipApprovalService(
      store(results) as unknown as ClipperResultsService,
      clipperGeneration as unknown as ClipperGenerationService,
      store(projects) as unknown as ClipperProjectsService,
      moduleRef as unknown as ModuleRef,
    );
  });

  it('projects a completed hook and pending workflow gate as awaiting confirmation', async () => {
    await expect(service.getStatus('project-1', 'org-1')).resolves.toEqual({
      attempt: 1,
      hookClipperResultId: 'hook-result',
      remainingClipCount: 1,
      state: 'awaiting_confirmation',
    });
  });

  it('reports nothing to review for another organization', async () => {
    await expect(service.getStatus('project-1', 'org-2')).resolves.toEqual({
      attempt: 0,
      remainingClipCount: 0,
      state: 'not_required',
    });
  });

  it('keeps the UI in hook generation until provider completion', async () => {
    results.set('hook-result', {
      ...(results.get('hook-result') as StoredRecord),
      status: 'extracting',
    });

    await expect(service.getStatus('project-1', 'org-1')).resolves.toEqual(
      expect.objectContaining({ state: 'generating_hook' }),
    );
  });

  it('approves the native review gate and never starts clip generation directly', async () => {
    await expect(
      service.submitDecision({
        action: 'approve',
        organizationId: 'org-1',
        projectId: 'project-1',
        userId: 'reviewer-1',
      }),
    ).resolves.toEqual(expect.objectContaining({ state: 'approved' }));

    expect(decisions).toEqual([
      {
        approved: true,
        executionId: 'execution-1',
        nodeId: 'review-hook',
        organizationId: 'org-1',
        userId: 'reviewer-1',
        workflowId: 'workflow-1',
      },
    ]);
    expect(generations).toEqual([]);
    expect(projects.get('project-1')).toEqual(
      expect.objectContaining({
        clipperHookReviewLastAction: 'approve',
        status: 'generating',
      }),
    );
  });

  it('rejects the current execution and starts a new workflow for revision', async () => {
    await expect(
      service.submitDecision({
        action: 'request_changes',
        feedback: 'Stronger opening',
        organizationId: 'org-1',
        projectId: 'project-1',
        userId: 'reviewer-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        attempt: 2,
        lastAction: 'request_changes',
        state: 'generating_hook',
      }),
    );

    expect(decisions).toEqual([
      {
        approved: false,
        executionId: 'execution-1',
        nodeId: 'review-hook',
        organizationId: 'org-1',
        reason: 'Stronger opening',
        userId: 'reviewer-1',
        workflowId: 'workflow-1',
      },
    ]);
    expect(generations).toEqual([
      {
        input: expect.objectContaining({
          highlights: [
            expect.objectContaining({
              summary: 'Hook summary\nRevision guidance: Stronger opening',
            }),
            expect.objectContaining({ summary: 'Body summary' }),
          ],
        }),
        review: {
          attempt: 2,
          feedback: 'Stronger opening',
          lastAction: 'request_changes',
        },
      },
    ]);
    expect(results.get('hook-result')?.isDeleted).toBe(true);
  });

  it('refuses a decision when no hook is waiting for review', async () => {
    results.set('hook-result', {
      ...(results.get('hook-result') as StoredRecord),
      status: 'extracting',
    });

    await expect(
      service.submitDecision({
        action: 'approve',
        organizationId: 'org-1',
        projectId: 'project-1',
        userId: 'reviewer-1',
      }),
    ).rejects.toThrow('The hook clip is not awaiting an operator decision.');
    expect(decisions).toEqual([]);
  });
});
