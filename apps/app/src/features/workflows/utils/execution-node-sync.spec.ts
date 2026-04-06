import { ReviewGateStatus, WorkflowNodeStatus } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

import {
  buildExecutionNodePatch,
  buildExecutionNodePatches,
} from './execution-node-sync';

describe('execution-node-sync', () => {
  it('hydrates pending review gate execution output into node data', () => {
    const patch = buildExecutionNodePatch({
      nodeId: 'review-1',
      nodeType: 'reviewGate',
      output: {
        approvalId: 'exec-1',
        approvalStatus: 'pending',
        inputCaption: 'Ready to approve',
        inputMedia: 'https://cdn.example.com/image.jpg',
      },
      status: 'running',
    });

    expect(patch).toEqual({
      nodeId: 'review-1',
      patch: expect.objectContaining({
        approvalId: 'exec-1',
        approvalStatus: ReviewGateStatus.PENDING,
        inputCaption: 'Ready to approve',
        inputMedia: 'https://cdn.example.com/image.jpg',
        inputType: 'image',
        outputCaption: null,
        outputMedia: null,
        status: WorkflowNodeStatus.PROCESSING,
      }),
    });
  });

  it('hydrates approved review gate execution output into node data', () => {
    const patch = buildExecutionNodePatch({
      nodeId: 'review-1',
      nodeType: 'reviewGate',
      output: {
        approvalId: 'exec-1',
        approvalStatus: 'approved',
        approvedAt: '2026-03-31T08:00:00.000Z',
        approvedBy: 'user-1',
        inputCaption: 'Ready to approve',
        inputMedia: 'https://cdn.example.com/video.mp4',
        outputCaption: 'Ready to approve',
      },
      status: 'completed',
    });

    expect(patch).toEqual({
      nodeId: 'review-1',
      patch: expect.objectContaining({
        approvalId: 'exec-1',
        approvalStatus: ReviewGateStatus.APPROVED,
        approvedAt: '2026-03-31T08:00:00.000Z',
        approvedBy: 'user-1',
        inputType: 'video',
        outputCaption: 'Ready to approve',
        outputMedia: 'https://cdn.example.com/video.mp4',
        status: WorkflowNodeStatus.COMPLETE,
      }),
    });
  });

  it('maps rejected review gate output and propagates the rejection reason', () => {
    const patch = buildExecutionNodePatch({
      error: 'Rejected via review gate',
      nodeId: 'review-1',
      nodeType: 'reviewGate',
      output: {
        approvalId: 'exec-1',
        approvalStatus: 'rejected',
        inputCaption: 'Needs changes',
        rejectionReason: 'Rejected via review gate',
      },
      status: 'failed',
    });

    expect(patch).toEqual({
      nodeId: 'review-1',
      patch: expect.objectContaining({
        approvalId: 'exec-1',
        approvalStatus: ReviewGateStatus.REJECTED,
        error: 'Rejected via review gate',
        outputCaption: null,
        outputMedia: null,
        rejectionReason: 'Rejected via review gate',
        status: WorkflowNodeStatus.ERROR,
      }),
    });
  });

  it('builds patches for the full execution payload', () => {
    const patches = buildExecutionNodePatches({
      nodeResults: [
        {
          nodeId: 'node-1',
          nodeType: 'postReply',
          status: 'completed',
        },
        {
          nodeId: 'review-1',
          nodeType: 'reviewGate',
          output: {
            approvalId: 'exec-1',
            approvalStatus: 'pending',
          },
          status: 'running',
        },
      ],
    });

    expect(patches).toHaveLength(2);
    expect(patches[0]).toEqual({
      nodeId: 'node-1',
      patch: {
        error: undefined,
        status: WorkflowNodeStatus.COMPLETE,
      },
    });
  });
});
