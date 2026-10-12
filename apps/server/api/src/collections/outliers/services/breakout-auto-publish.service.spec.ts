import { BreakoutAutoPublishService } from '@api/collections/outliers/services/breakout-auto-publish.service';
import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
import {
  AgentPublishDecision,
  Platform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/outliers/services/breakout-output-recovery.util',
  () => ({ readBreakoutOutputRecovery: vi.fn() }),
);

const request = {
  outputId: 'output-a',
  reauthorize: vi.fn(async () => undefined),
  responseId: 'response-a',
  scope: {
    brandId: 'brand-a',
    credentialId: 'credential-a',
    organizationId: 'org-a',
    platform: Platform.TWITTER,
  },
  strategyId: 'strategy-a',
};

type Settings = {
  isBreakoutAutoPublishEnabled: boolean;
  isBreakoutResponsesEnabled: boolean;
};
const on: Settings = {
  isBreakoutAutoPublishEnabled: true,
  isBreakoutResponsesEnabled: true,
};

function harness(settings: Settings | null = on) {
  const prisma = {
    organizationSetting: {
      findFirst: vi.fn(async (): Promise<Settings | null> => settings),
    },
    post: {
      findFirst: vi.fn(
        async (): Promise<{
          id: string;
          reviewDecision: string | null;
        } | null> => ({ id: 'post-a', reviewDecision: null }),
      ),
    },
  };
  const posts = { patch: vi.fn(async () => ({})) };
  const policy = {
    resolveForPost: vi.fn(async () => ({
      result: { decision: AgentPublishDecision.PERMITTED, reason: 'ok' },
    })),
  };
  const logger = { warn: vi.fn() };
  const service = Reflect.construct(BreakoutAutoPublishService, [
    prisma,
    posts,
    policy,
    logger,
  ]) as BreakoutAutoPublishService;
  return { logger, policy, posts, prisma, service };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readBreakoutOutputRecovery).mockResolvedValue({
    action: 'requires_admission',
    externalId: null,
    mayRepeatPaidRequest: false,
    outputId: 'output-a',
    postId: 'post-a',
    reason: 'publication_admission_required',
    responseId: 'response-a',
    state: 'draft',
    status: 'available',
  });
});

describe('BreakoutAutoPublishService (#6526)', () => {
  it('schedules an untouched, fully checked draft through the shared scheduling write', async () => {
    const h = harness();
    expect(await h.service.schedule(request)).toEqual({
      postId: 'post-a',
      status: 'scheduled',
    });
    expect(h.posts.patch).toHaveBeenCalledWith('post-a', {
      scheduledDate: expect.any(Date),
      targetExecutionState: TargetExecutionState.SCHEDULED,
    });
    expect(h.policy.resolveForPost).toHaveBeenCalledWith({
      organizationId: 'org-a',
      postId: 'post-a',
      strategyId: 'strategy-a',
    });
  });

  it('only looks at a tenant-scoped, undeleted draft of this very output and strategy', async () => {
    const h = harness();
    await h.service.schedule(request);
    expect(h.prisma.post.findFirst).toHaveBeenCalledWith({
      select: { id: true, reviewDecision: true },
      where: expect.objectContaining({
        agentStrategyId: 'strategy-a',
        brandId: 'brand-a',
        breakoutOutputId: 'output-a',
        credentialId: 'credential-a',
        id: 'post-a',
        isDeleted: false,
        organizationId: 'org-a',
        parentId: null,
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    });
  });

  it.each([
    [
      'the organization has auto-publish off',
      { ...on, isBreakoutAutoPublishEnabled: false },
    ],
    [
      'auto-publish is on but breakout responses are off',
      { ...on, isBreakoutResponsesEnabled: false },
    ],
    ['the organization has no settings row', null],
  ])('stays review-only when %s', async (_name, settings) => {
    const h = harness(settings);
    expect(await h.service.schedule(request)).toEqual({
      reason: 'org_auto_publish_disabled',
      status: 'review_only',
    });
    expect(h.posts.patch).not.toHaveBeenCalled();
    expect(h.policy.resolveForPost).not.toHaveBeenCalled();
    expect(readBreakoutOutputRecovery).not.toHaveBeenCalled();
  });

  it.each([
    [
      'it waits for a brand review (receipt not ready and passed, factual coverage unknown)',
      {
        reason: 'brand_review_required',
        state: 'awaiting_review',
        action: 'none',
      },
    ],
    [
      'the quality gate blocked it',
      {
        reason: 'platform_quality_blocked',
        state: 'awaiting_review',
        action: 'none',
      },
    ],
    [
      'its quality evaluation is still pending',
      {
        reason: 'quality_evaluation_pending',
        state: 'reconciliation_required',
        action: 'reconcile',
      },
    ],
    [
      'it is already scheduled',
      {
        reason: 'publication_admission_required',
        state: 'scheduled',
        action: 'none',
      },
    ],
  ])('stays review-only when %s', async (_name, recovery) => {
    vi.mocked(readBreakoutOutputRecovery).mockResolvedValue({
      externalId: null,
      mayRepeatPaidRequest: false,
      outputId: 'output-a',
      postId: 'post-a',
      responseId: 'response-a',
      status: 'available',
      ...recovery,
    } as Awaited<ReturnType<typeof readBreakoutOutputRecovery>>);
    const h = harness();
    expect(await h.service.schedule(request)).toEqual({
      reason: 'output_not_ready',
      status: 'review_only',
    });
    expect(h.posts.patch).not.toHaveBeenCalled();
  });

  it('stays review-only when the recovery is unavailable', async () => {
    vi.mocked(readBreakoutOutputRecovery).mockResolvedValue({
      action: 'reconcile',
      mayRepeatPaidRequest: false,
      reason: 'artifact_binding_missing',
      status: 'unavailable',
    } as unknown as Awaited<ReturnType<typeof readBreakoutOutputRecovery>>);
    const h = harness();
    expect(await h.service.schedule(request)).toMatchObject({
      status: 'review_only',
    });
    expect(h.posts.patch).not.toHaveBeenCalled();
  });

  it('leaves a draft a person already decided on to that person', async () => {
    const h = harness();
    h.prisma.post.findFirst.mockResolvedValue({
      id: 'post-a',
      reviewDecision: 'APPROVED',
    });
    expect(await h.service.schedule(request)).toEqual({
      reason: 'output_reviewed',
      status: 'review_only',
    });
    expect(h.posts.patch).not.toHaveBeenCalled();
  });

  it('stays review-only when the draft is gone or changed', async () => {
    const h = harness();
    h.prisma.post.findFirst.mockResolvedValue(null);
    expect(await h.service.schedule(request)).toMatchObject({
      status: 'review_only',
    });
    expect(h.posts.patch).not.toHaveBeenCalled();
  });

  it('stays review-only when the strategy publish policy denies it', async () => {
    const h = harness();
    h.policy.resolveForPost.mockResolvedValue({
      result: {
        decision: AgentPublishDecision.DENIED,
        reason: 'brand_requires_approval',
      },
    });
    expect(await h.service.schedule(request)).toEqual({
      reason: 'publish_policy_brand_requires_approval',
      status: 'review_only',
    });
    expect(h.posts.patch).not.toHaveBeenCalled();
  });

  it('keeps the paid draft for review when the publication gate holds the schedule', async () => {
    const h = harness();
    h.posts.patch.mockRejectedValue(
      new Error('Breakout publication held: quality_evidence_unavailable'),
    );
    expect(await h.service.schedule(request)).toEqual({
      reason: 'publication_held',
      status: 'review_only',
    });
    expect(h.logger.warn).toHaveBeenCalledWith(
      'Breakout response was not auto-published',
      expect.objectContaining({ outputId: 'output-a' }),
    );
  });

  it('re-reads the setting on every call, so turning it off takes effect at once', async () => {
    const h = harness();
    await h.service.schedule(request);
    h.prisma.organizationSetting.findFirst.mockResolvedValueOnce({
      ...on,
      isBreakoutAutoPublishEnabled: false,
    });
    expect(await h.service.schedule(request)).toMatchObject({
      status: 'review_only',
    });
    expect(h.posts.patch).toHaveBeenCalledTimes(1);
  });

  it('denies before any read when the actor lost authority', async () => {
    const h = harness();
    vi.mocked(request.reauthorize).mockRejectedValueOnce(new Error('revoked'));
    await expect(h.service.schedule(request)).rejects.toThrow('revoked');
    expect(h.prisma.organizationSetting.findFirst).not.toHaveBeenCalled();
    expect(h.posts.patch).not.toHaveBeenCalled();
  });
});
