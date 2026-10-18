import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ReviewInboxController } from '@api/collections/review-inbox/controllers/review-inbox.controller';
import type { ReviewInboxService } from '@api/collections/review-inbox/services/review-inbox.service';
import type { ReviewInboxDecisionService } from '@api/collections/review-inbox/services/review-inbox-decision.service';
import type { IReviewInboxItem } from '@genfeedai/contracts/interfaces';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const user: AuthenticatedUser = {
  brandId: 'brand-1',
  id: 'auth-user',
  organizationId: 'org-1',
  userId: 'user-1',
};

const access = {
  brandIds: undefined,
  canResolveMcpApprovals: false,
  canResolveWorkflowGates: true,
};

const item: IReviewInboxItem = {
  actionSummary:
    'Continue Weekly posts with the output waiting at its review gate',
  approvalId: null,
  brandId: 'brand-1',
  brandLabel: 'Acme',
  estimatedCredits: null,
  executionId: 'exec-1',
  expiresAt: null,
  id: 'workflow_review_gate:exec-1:gate-1',
  isResolvable: true,
  kind: 'workflow_review_gate',
  nodeId: 'gate-1',
  preview: { caption: 'Caption', mediaUrl: null },
  reasons: [],
  requestedAt: '2026-10-01T00:00:00.000Z',
  source: 'workflow',
  sourceLabel: 'Weekly posts',
  status: 'pending',
  toolName: null,
  workflowId: 'wf-1',
};

function buildRequest(): Request {
  return {
    get: vi.fn(),
    headers: {},
    originalUrl: '/v1/review-inbox',
    protocol: 'https',
    query: {},
    url: '/v1/review-inbox',
  } as unknown as Request;
}

describe('ReviewInboxController', () => {
  const reviewInbox = {
    listPending: vi.fn(),
    resolveViewerAccess: vi.fn(),
  };
  const decisions = { decide: vi.fn() };
  let controller: ReviewInboxController;

  beforeEach(() => {
    vi.clearAllMocks();
    reviewInbox.resolveViewerAccess.mockResolvedValue(access);
    reviewInbox.listPending.mockResolvedValue([item]);
    controller = new ReviewInboxController(
      reviewInbox as unknown as ReviewInboxService,
      decisions as unknown as ReviewInboxDecisionService,
    );
  });

  it('lists the selected brand inbox as serialized rows', async () => {
    const response = await controller.list(buildRequest(), user);

    expect(reviewInbox.listPending).toHaveBeenCalledWith(
      { brandId: 'brand-1', organizationId: 'org-1' },
      access,
    );
    expect(response.data).toEqual([
      expect.objectContaining({
        attributes: expect.objectContaining({
          kind: 'workflow_review_gate',
          reasons: [],
          source: 'workflow',
        }),
        id: 'workflow_review_gate:exec-1:gate-1',
        type: 'review-inbox-item',
      }),
    ]);
  });

  it('resolves a decision with the viewer access', async () => {
    decisions.decide.mockResolvedValue({
      decision: 'approve',
      id: item.id,
      itemId: item.id,
      kind: 'workflow_review_gate',
      resolvedAt: '2026-10-02T00:00:00.000Z',
      status: 'approved',
    });

    const response = await controller.decide(buildRequest(), user, {
      decision: 'approve',
      itemId: item.id,
    });

    expect(decisions.decide).toHaveBeenCalledWith(user, access, {
      decision: 'approve',
      itemId: item.id,
    });
    expect(response.data).toMatchObject({
      attributes: { status: 'approved' },
      id: item.id,
      type: 'review-inbox-decision',
    });
  });
});
