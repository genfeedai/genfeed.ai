import type { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { ClipperGenerationService } from '@api/collections/clipper-projects/services/clipper-generation.service';
import type { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import type { ModuleRef } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function createExecution() {
  return {
    id: 'execution-1',
    inputValues: { request },
    metadata: {
      clipperHookReviewAttempt: 1,
      pendingApproval: { nodeId: 'review-hook' },
    },
    nodeResults: [
      {
        nodeId: 'generate-hook',
        nodeType: 'genfeedAction',
        output: {
          count: 1,
          results: [
            {
              index: 0,
              result: {
                clipperResultIds: ['hook-result'],
                originalIndex: 0,
                providerJobIds: ['hook-job'],
                queuedClipCount: 1,
              },
            },
          ],
        },
        status: 'completed',
      },
    ],
    status: 'RUNNING',
    workflowId: 'workflow-1',
  };
}

describe('HookClipApprovalService workflow review gate', () => {
  let clipperGeneration: { generateClips: ReturnType<typeof vi.fn> };
  let clipperProjects: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let clipperResults: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let executions: { findOne: ReturnType<typeof vi.fn> };
  let executor: { submitReviewGateApproval: ReturnType<typeof vi.fn> };
  let service: HookClipApprovalService;

  beforeEach(() => {
    clipperGeneration = { generateClips: vi.fn().mockResolvedValue({}) };
    clipperProjects = {
      findOne: vi.fn().mockResolvedValue({
        id: 'project-1',
        workflowExecutionId: 'execution-1',
      }),
      patch: vi.fn().mockResolvedValue({}),
    };
    clipperResults = {
      findOne: vi.fn().mockResolvedValue({ status: 'completed' }),
      patch: vi.fn().mockResolvedValue({}),
    };
    executions = { findOne: vi.fn().mockResolvedValue(createExecution()) };
    executor = {
      submitReviewGateApproval: vi.fn().mockResolvedValue({
        status: 'approved',
      }),
    };
    const moduleRef = {
      get: vi.fn((token: unknown) =>
        token === WorkflowExecutorService ? executor : executions,
      ),
    };
    service = new HookClipApprovalService(
      clipperResults as unknown as ClipperResultsService,
      clipperGeneration as unknown as ClipperGenerationService,
      clipperProjects as unknown as ClipperProjectsService,
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
    expect(executions.findOne).toHaveBeenCalledWith({
      id: 'execution-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
  });

  it('keeps the UI in hook generation until provider completion', async () => {
    clipperResults.findOne.mockResolvedValue({ status: 'extracting' });

    await expect(service.getStatus('project-1', 'org-1')).resolves.toEqual(
      expect.objectContaining({ state: 'generating_hook' }),
    );
  });

  it('approves the native review gate and never invokes clip generation directly', async () => {
    executions.findOne
      .mockResolvedValueOnce(createExecution())
      .mockResolvedValueOnce({
        ...createExecution(),
        metadata: { clipperHookReviewAttempt: 1 },
        status: 'COMPLETED',
      });

    await expect(
      service.submitDecision({
        action: 'approve',
        organizationId: 'org-1',
        projectId: 'project-1',
        userId: 'reviewer-1',
      }),
    ).resolves.toEqual(expect.objectContaining({ state: 'approved' }));
    expect(executor.submitReviewGateApproval).toHaveBeenCalledWith(
      'workflow-1',
      'execution-1',
      'reviewer-1',
      'org-1',
      'review-hook',
      true,
    );
    expect(clipperGeneration.generateClips).not.toHaveBeenCalled();
  });

  it('rejects the current execution and starts a new workflow for revision', async () => {
    executions.findOne
      .mockResolvedValueOnce(createExecution())
      .mockResolvedValueOnce({
        ...createExecution(),
        id: 'execution-2',
        metadata: {
          clipperHookReviewAttempt: 2,
          clipperHookReviewFeedback: 'Stronger opening',
          clipperHookReviewLastAction: 'request_changes',
          pendingApproval: { nodeId: 'review-hook' },
        },
      });
    clipperProjects.findOne
      .mockResolvedValueOnce({
        id: 'project-1',
        workflowExecutionId: 'execution-1',
      })
      .mockResolvedValueOnce({
        id: 'project-1',
        workflowExecutionId: 'execution-2',
      });

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
      }),
    );
    expect(executor.submitReviewGateApproval).toHaveBeenCalledWith(
      'workflow-1',
      'execution-1',
      'reviewer-1',
      'org-1',
      'review-hook',
      false,
      'Stronger opening',
    );
    expect(clipperGeneration.generateClips).toHaveBeenCalledWith(
      expect.objectContaining({
        highlights: expect.arrayContaining([
          expect.objectContaining({
            summary: expect.stringContaining(
              'Revision guidance: Stronger opening',
            ),
          }),
        ]),
      }),
      {
        attempt: 2,
        feedback: 'Stronger opening',
        lastAction: 'request_changes',
      },
    );
    expect(clipperResults.patch).toHaveBeenCalledWith(
      'hook-result',
      { isDeleted: true },
      [],
      'org-1',
    );
  });
});
