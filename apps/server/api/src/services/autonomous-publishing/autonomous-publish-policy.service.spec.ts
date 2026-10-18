import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { buildAgentReviewActivity } from '@api/services/notifications/workflow-notifications/workflow-outcome-activity';
import {
  AgentAutonomyMode,
  AgentPublishDecision,
  PostCategory,
  ReviewDecision,
} from '@genfeedai/contracts';
import { createDefaultBrandPublishPolicy } from '@genfeedai/contracts/api-types/contracts/brand-publish-policy.contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reviewActivity = { key: 'agent-review-changed' };
vi.mock(
  '@api/services/notifications/workflow-notifications/workflow-outcome-activity',
  () => ({
    buildAgentReviewActivity: vi.fn(async () => reviewActivity),
  }),
);
const activityRecorder = { recordInTransaction: vi.fn() };

describe('AutonomousPublishPolicyService', () => {
  const post = {
    id: 'post-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    agentStrategyId: 'strategy-1',
    personaId: null,
    platform: 'instagram',
    credentialId: 'credential-1',
    description: 'Generated caption',
    updatedAt: new Date('2026-09-24T00:00:00Z'),
  };
  let policies: Record<string, unknown>;
  const db = {
    post: { findFirst: vi.fn() },
    agentStrategy: { findFirst: vi.fn(), updateMany: vi.fn() },
    brand: { findFirst: vi.fn() },
    credential: { findFirst: vi.fn(), findMany: vi.fn() },
    persona: { findFirst: vi.fn() },
    agentPublishAudit: { create: vi.fn() },
    brandOsRevision: { findFirst: vi.fn() },
    ingredient: { findMany: vi.fn() },
    profile: { findMany: vi.fn() },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  };
  const approvedPolicy = (policy = createDefaultBrandPublishPolicy()) => ({
    content: { policy },
  });
  let service: AutonomousPublishPolicyService;
  const decision = (postId = 'post-1') => ({
    organizationId: 'org-1',
    postId,
    userId: 'user-1',
    decision: ReviewDecision.APPROVED,
    previousDecision: ReviewDecision.UNSET,
    generatedCaption: 'Generated caption',
    hasRewriteHistory: false,
  });
  beforeEach(() => {
    vi.resetAllMocks();
    policies = { publishPolicy: { autoPublishEnabled: true } };
    db.post.findFirst.mockResolvedValue(post);
    db.agentStrategy.findFirst.mockImplementation(async () => ({
      id: 'strategy-1',
      brandId: 'brand-1',
      isActive: true,
      config: { autonomyMode: AgentAutonomyMode.SUPERVISED },
      policies,
    }));
    db.agentStrategy.updateMany.mockImplementation(async ({ data }) => {
      policies = data.policies;
      return { count: 1 };
    });
    db.brand.findFirst.mockResolvedValue({
      agentConfig: { autoPublish: { enabled: true } },
    });
    db.credential.findFirst.mockResolvedValue({
      id: 'credential-1',
      platform: 'INSTAGRAM',
    });
    db.brandOsRevision.findFirst.mockResolvedValue(approvedPolicy());
    db.ingredient.findMany.mockResolvedValue([]);
    db.profile.findMany.mockResolvedValue([]);
    db.$executeRaw.mockResolvedValue(0);
    service = new AutonomousPublishPolicyService(
      db as never,
      activityRecorder as never,
    );
  });
  it('keeps supervised drafts denied even with a connected channel', async () => {
    expect(
      (
        await service.resolveForPost({
          organizationId: 'org-1',
          postId: 'post-1',
        })
      ).result.decision,
    ).toBe(AgentPublishDecision.DENIED);
  });
  it('lets a blocking media assessment turn auto-publish into review (#4881)', async () => {
    db.agentStrategy.findFirst.mockResolvedValue({
      id: 'strategy-1',
      isActive: true,
      config: { autonomyMode: AgentAutonomyMode.AUTO_PUBLISH },
      policies,
    });
    const ingredient = {
      findMany: vi.fn().mockResolvedValue([{ id: 'asset-1' }]),
    };
    const assessPublishMedia = vi.fn().mockResolvedValue({
      isBlocking: true,
      isPerceptionPending: false,
      reasons: [
        {
          assetId: 'asset-1',
          code: 'moderation:violence',
          message: 'Moderation flagged violence (91% on frame 2).',
          source: 'moderation',
        },
      ],
      warnings: [],
    });
    const gated = new AutonomousPublishPolicyService(
      { ...db, ingredient } as never,
      activityRecorder as never,
      { assessPublishMedia } as never,
    );

    const policy = await gated.resolveForPost({
      organizationId: 'org-1',
      postId: 'post-1',
    });

    expect(assessPublishMedia).toHaveBeenCalledWith({
      assetIds: ['asset-1'],
      caption: 'Generated caption',
      organizationId: 'org-1',
      platforms: ['instagram'],
    });
    expect(policy.result.decision).toBe(AgentPublishDecision.DENIED);
    expect(policy.result.mediaAssessmentReasons).toEqual([
      'Moderation flagged violence (91% on frame 2).',
    ]);
  });
  it('requires actual brand and strategy opt-ins for explicit auto-publish', async () => {
    db.agentStrategy.findFirst.mockResolvedValue({
      id: 'strategy-1',
      isActive: true,
      config: { autonomyMode: AgentAutonomyMode.AUTO_PUBLISH },
      policies,
    });
    expect(
      (
        await service.resolveForPost({
          organizationId: 'org-1',
          postId: 'post-1',
        })
      ).result.decision,
    ).toBe(AgentPublishDecision.PERMITTED);
    db.brand.findFirst.mockResolvedValue({
      agentConfig: { autoPublish: { enabled: false } },
    });
    expect(
      (
        await service.resolveForPost({
          organizationId: 'org-1',
          postId: 'post-1',
        })
      ).result.decision,
    ).toBe(AgentPublishDecision.DENIED);
  });
  it('rejects foreign or disconnected credentials and scopes every lookup', async () => {
    db.agentStrategy.findFirst.mockResolvedValue({
      id: 'strategy-1',
      isActive: true,
      config: { autonomyMode: AgentAutonomyMode.AUTO_PUBLISH },
      policies,
    });
    db.credential.findFirst.mockResolvedValue(null);
    expect(
      (
        await service.resolveForPost({
          organizationId: 'org-1',
          postId: 'post-1',
        })
      ).result.decision,
    ).toBe(AgentPublishDecision.DENIED);
    expect(db.credential.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'credential-1',
        brandId: 'brand-1',
        organizationId: 'org-1',
        isDeleted: false,
        isConnected: true,
      },
    });
  });
  it('graduates exactly at five distinct pristine approvals, then reverts only that platform', async () => {
    for (let i = 1; i <= 5; i++) {
      db.post.findFirst.mockResolvedValue({ ...post, id: `post-${i}` });
      const result = await service.recordReviewDecision(
        decision(`post-${i}`),
        db as never,
      );
      expect(Boolean(result)).toBe(i === 5);
    }
    expect(
      (
        await service.resolveForPost({
          organizationId: 'org-1',
          postId: 'post-5',
        })
      ).result.decision,
    ).toBe(AgentPublishDecision.PERMITTED);
    const before = JSON.stringify(policies);
    await service.recordReviewDecision(
      { ...decision('post-5'), previousDecision: ReviewDecision.APPROVED },
      db as never,
    );
    expect(JSON.stringify(policies)).toBe(before);
    await service.recordReviewDecision(
      { ...decision('post-5'), decision: ReviewDecision.REQUEST_CHANGES },
      db as never,
    );
    expect(
      (
        await service.resolveForPost({
          organizationId: 'org-1',
          postId: 'post-5',
        })
      ).result.decision,
    ).toBe(AgentPublishDecision.DENIED);
    expect(db.agentPublishAudit.create).toHaveBeenCalledTimes(2);
    expect(buildAgentReviewActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        strategyId: 'strategy-1',
        autoPublishEnabled: false,
      }),
    );
    expect(activityRecorder.recordInTransaction).toHaveBeenCalledWith(
      db,
      reviewActivity,
    );
  });
  it('does not count edited captions or previous change requests as pristine', async () => {
    await service.recordReviewDecision(
      { ...decision(), generatedCaption: 'Earlier caption' },
      db as never,
    );
    expect(policies).toMatchObject({
      publishPolicy: {
        platformStates: {
          instagram: { approvalStreak: 0, autoPublishEnabled: false },
        },
      },
    });
    db.post.findFirst.mockResolvedValue({ ...post, id: 'post-2' });
    await service.recordReviewDecision(
      { ...decision('post-2'), hasRewriteHistory: true },
      db as never,
    );
    expect(policies).toMatchObject({
      publishPolicy: { platformStates: { instagram: { approvalStreak: 0 } } },
    });
  });
  it('retains the global opt-out even after threshold approvals', async () => {
    policies = {
      publishPolicy: {
        autoPublishEnabled: false,
        autoPublishAfterApprovals: 1,
      },
    };
    await service.recordReviewDecision(decision(), db as never);
    expect(policies).toMatchObject({
      publishPolicy: {
        autoPublishEnabled: false,
        platformStates: { instagram: { autoPublishEnabled: false } },
      },
    });
    expect(db.agentPublishAudit.create).not.toHaveBeenCalled();
  });
  it('a rejected platform overrides AUTO_PUBLISH without changing another platform', async () => {
    policies = {
      publishPolicy: {
        autoPublishEnabled: true,
        platformStates: {
          instagram: { approvalStreak: 0, autoPublishEnabled: false },
          twitter: { approvalStreak: 7, autoPublishEnabled: true },
        },
      },
    };
    db.agentStrategy.findFirst.mockResolvedValue({
      id: 'strategy-1',
      isActive: true,
      config: { autonomyMode: AgentAutonomyMode.AUTO_PUBLISH },
      policies,
    });
    expect(
      (
        await service.resolveForPost({
          organizationId: 'org-1',
          postId: 'post-1',
        })
      ).result.decision,
    ).toBe(AgentPublishDecision.DENIED);
    await service.recordReviewDecision(decision(), db as never);
    expect(policies).toMatchObject({
      publishPolicy: {
        platformStates: {
          twitter: { approvalStreak: 7, autoPublishEnabled: true },
        },
      },
    });
  });
  it('a graduated platform immediately loses permission when brand or strategy opts out', async () => {
    policies = {
      publishPolicy: {
        autoPublishEnabled: true,
        platformStates: {
          instagram: { approvalStreak: 5, autoPublishEnabled: true },
        },
      },
    };
    expect(
      (
        await service.resolveForPost({
          organizationId: 'org-1',
          postId: 'post-1',
        })
      ).result.decision,
    ).toBe(AgentPublishDecision.PERMITTED);
    db.brand.findFirst.mockResolvedValue({
      agentConfig: { autoPublish: { enabled: false } },
    });
    expect(
      (
        await service.resolveForPost({
          organizationId: 'org-1',
          postId: 'post-1',
        })
      ).result.decision,
    ).toBe(AgentPublishDecision.DENIED);
    db.brand.findFirst.mockResolvedValue({
      agentConfig: { autoPublish: { enabled: true } },
    });
    policies = {
      publishPolicy: {
        autoPublishEnabled: false,
        platformStates: {
          instagram: { approvalStreak: 5, autoPublishEnabled: true },
        },
      },
    };
    expect(
      (
        await service.resolveForPost({
          organizationId: 'org-1',
          postId: 'post-1',
        })
      ).result.decision,
    ).toBe(AgentPublishDecision.DENIED);
  });

  it('target resolution refuses ambiguous accounts despite a caller permission boolean', async () => {
    db.agentStrategy.findFirst.mockResolvedValue({
      id: 'strategy-1',
      isActive: true,
      config: { autonomyMode: AgentAutonomyMode.AUTO_PUBLISH },
      policies,
    });
    db.credential.findMany.mockResolvedValue([
      { id: 'one', platform: 'INSTAGRAM' },
      { id: 'two', platform: 'INSTAGRAM' },
    ]);
    const input = {
      organizationId: 'org-1',
      brandId: 'brand-1',
      strategyId: 'strategy-1',
      platform: 'instagram',
      channelAllowsAutoPublish: true,
    };
    expect((await service.resolveForTarget(input)).result.decision).toBe(
      AgentPublishDecision.DENIED,
    );
    db.credential.findMany.mockResolvedValue([
      { id: 'one', platform: 'INSTAGRAM' },
    ]);
    expect((await service.resolveForTarget(input)).result.decision).toBe(
      AgentPublishDecision.PERMITTED,
    );
  });

  it('defaults persona autonomy to supervised and respects explicit persona opt-in', async () => {
    db.post.findFirst.mockResolvedValue({
      ...post,
      agentStrategyId: null,
      personaId: 'persona-1',
    });
    db.persona.findFirst.mockResolvedValue({ config: {} });
    expect(
      (
        await service.resolveForPost({
          organizationId: 'org-1',
          postId: 'post-1',
        })
      ).result.decision,
    ).toBe(AgentPublishDecision.DENIED);
    db.persona.findFirst.mockResolvedValue({
      config: { autonomyMode: AgentAutonomyMode.AUTO_PUBLISH },
    });
    expect(
      (
        await service.resolveForPost({
          organizationId: 'org-1',
          postId: 'post-1',
        })
      ).result.decision,
    ).toBe(AgentPublishDecision.PERMITTED);
  });
  describe('brand Policy (#7339)', () => {
    beforeEach(() => {
      db.agentStrategy.findFirst.mockResolvedValue({
        id: 'strategy-1',
        isActive: true,
        config: { autonomyMode: AgentAutonomyMode.AUTO_PUBLISH },
        policies,
      });
    });

    it('judges a draft by the default Policy while the brand has no approved Policy', async () => {
      db.brandOsRevision.findFirst.mockResolvedValue(null);
      const { result } = await service.resolveForPost({
        organizationId: 'org-1',
        postId: 'post-1',
      });
      expect(result.decision).toBe(AgentPublishDecision.PERMITTED);
      expect(result.policyViolations).toBeUndefined();
      expect(db.brandOsRevision.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId: 'brand-1',
            isDeleted: false,
            organizationId: 'org-1',
            status: 'APPROVED',
          }),
        }),
      );
      expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('routes a video draft to review whatever the streak and autonomy mode', async () => {
      db.post.findFirst.mockResolvedValue({
        ...post,
        category: PostCategory.VIDEO,
      });
      const { result } = await service.resolveForPost({
        organizationId: 'org-1',
        postId: 'post-1',
      });
      expect(result.decision).toBe(AgentPublishDecision.DENIED);
      expect(result.policyViolations).toEqual([
        expect.objectContaining({ rule: 'video_always_reviewed' }),
      ]);
    });

    it('treats attached video media as a video draft', async () => {
      db.ingredient.findMany
        .mockResolvedValueOnce([{ id: 'asset-1' }])
        .mockResolvedValueOnce([{ category: 'VIDEO' }]);
      const { result } = await service.resolveForPost({
        organizationId: 'org-1',
        postId: 'post-1',
      });
      expect(result.policyViolations).toEqual([
        expect.objectContaining({ rule: 'video_always_reviewed' }),
      ]);
    });

    it('holds a draft with a banned phrase from the Policy or the brand voice', async () => {
      db.brand.findFirst.mockResolvedValue({
        agentConfig: {
          autoPublish: { enabled: true },
          voice: { bannedPhrases: ['caption'] },
        },
      });
      const { result } = await service.resolveForPost({
        organizationId: 'org-1',
        postId: 'post-1',
      });
      expect(result.decision).toBe(AgentPublishDecision.DENIED);
      expect(result.reason).toContain('Brand Policy requires review');
      expect(result.policyViolations).toEqual([
        expect.objectContaining({ rule: 'banned_phrase' }),
      ]);
    });

    it('holds an unscored draft and permits a scored one above the minimum', async () => {
      db.brandOsRevision.findFirst.mockResolvedValue(
        approvedPolicy({
          ...createDefaultBrandPublishPolicy(),
          minQualityScore: 70,
        }),
      );
      const unscored = await service.resolveForPost({
        organizationId: 'org-1',
        postId: 'post-1',
      });
      expect(unscored.result.policyViolations).toEqual([
        expect.objectContaining({ rule: 'min_quality_score' }),
      ]);
      const scored = await service.resolveForPost({
        organizationId: 'org-1',
        postId: 'post-1',
        qualityScore: 82,
      });
      expect(scored.result.decision).toBe(AgentPublishDecision.PERMITTED);
      expect(scored.result.policyViolations).toBeUndefined();
    });

    it('holds a Policy that needs the judge when no judge is wired', async () => {
      db.brandOsRevision.findFirst.mockResolvedValue(
        approvedPolicy({
          ...createDefaultBrandPublishPolicy(),
          bannedTopics: ['politics'],
        }),
      );
      const { result } = await service.resolveForPost({
        organizationId: 'org-1',
        postId: 'post-1',
      });
      expect(result.policyViolations).toEqual([
        expect.objectContaining({ rule: 'policy_judge_unavailable' }),
      ]);
    });
  });
});
