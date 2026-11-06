import type { PostsService } from '@api/collections/posts/services/posts.service';
import type { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentPublishDecision,
  Platform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Recovery = Record<string, unknown>;

// The recovery read as the response pipeline reports the output, plus the
// timeline of authorizations and reads the service performs.
const world = vi.hoisted(() => ({
  recovery: {} as Record<string, unknown>,
  timeline: [] as string[],
}));

vi.mock(
  '@api/collections/outliers/services/breakout-output-recovery.util',
  () => ({
    readBreakoutOutputRecovery: async () => {
      world.timeline.push('recovery');
      return world.recovery;
    },
  }),
);

import { BreakoutAutoPublishService } from '@api/collections/outliers/services/breakout-auto-publish.service';

interface PostRow {
  agentStrategyId: string;
  brandId: string;
  breakoutOutputId: string;
  credentialId: string;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  parentId: string | null;
  platform: Platform;
  reviewDecision: string | null;
  scheduledDate?: Date;
  targetExecutionState: TargetExecutionState;
}

interface Verdict {
  decision: AgentPublishDecision;
  reason: string;
}

const SCOPE = {
  brandId: 'brand-a',
  credentialId: 'credential-a',
  organizationId: 'org-a',
  platform: Platform.TWITTER,
};

const READY: Recovery = {
  action: 'requires_admission',
  externalId: null,
  mayRepeatPaidRequest: false,
  outputId: 'output-a',
  postId: 'post-a',
  reason: 'publication_admission_required',
  responseId: 'response-a',
  state: 'draft',
  status: 'available',
};

const ON = {
  isBreakoutAutoPublishEnabled: true,
  isBreakoutResponsesEnabled: true,
};
const PERMITTED: Verdict = {
  decision: AgentPublishDecision.PERMITTED,
  reason: 'ok',
};

const draft = (fields: Partial<PostRow> = {}): PostRow => ({
  agentStrategyId: 'strategy-a',
  brandId: 'brand-a',
  breakoutOutputId: 'output-a',
  credentialId: 'credential-a',
  id: 'post-a',
  isDeleted: false,
  organizationId: 'org-a',
  parentId: null,
  platform: Platform.TWITTER,
  reviewDecision: null,
  targetExecutionState: TargetExecutionState.DRAFT,
  ...fields,
});

describe('BreakoutAutoPublishService (#6526)', () => {
  let settings: Map<string, Record<string, boolean>>;
  let posts: PostRow[];
  // Policy verdicts in the order they are resolved; PERMITTED once exhausted.
  let verdicts: Verdict[];
  let resolvedFor: Record<string, string>[];
  let warnings: [string, Record<string, unknown>][];
  let scheduleFailure: Error | undefined;
  let revokeAtAuthorization: number;
  let service: BreakoutAutoPublishService;

  const post = () => posts.find((row) => row.id === 'post-a');
  const request = () => ({
    outputId: 'output-a',
    reauthorize: async () => {
      world.timeline.push('authorize');
      const count = world.timeline.filter(
        (step) => step === 'authorize',
      ).length;
      if (count === revokeAtAuthorization) throw new Error('revoked');
    },
    responseId: 'response-a',
    scope: SCOPE,
    strategyId: 'strategy-a',
  });

  beforeEach(() => {
    world.recovery = READY;
    world.timeline = [];
    settings = new Map([['org-a', ON]]);
    posts = [draft()];
    verdicts = [];
    resolvedFor = [];
    warnings = [];
    scheduleFailure = undefined;
    revokeAtAuthorization = 0;

    const prisma = {
      organizationSetting: {
        findFirst: async ({ where }: { where: { organizationId: string } }) => {
          world.timeline.push('settings');
          return settings.get(where.organizationId) ?? null;
        },
      },
      post: {
        findFirst: async ({ where }: { where: Partial<PostRow> }) => {
          world.timeline.push('post');
          const row = posts.find((candidate) =>
            Object.entries(where).every(
              ([key, value]) => candidate[key as keyof PostRow] === value,
            ),
          );
          return row
            ? { id: row.id, reviewDecision: row.reviewDecision }
            : null;
        },
      },
    };
    const policy = {
      resolveForPost: async (input: Record<string, string>) => {
        resolvedFor.push(input);
        return { result: verdicts.shift() ?? PERMITTED };
      },
      // A brand with caps: the policy is evaluated again under the lock.
      scheduleWithinPostCaps: async (
        _scope: unknown,
        _preview: unknown,
        evaluate: () => Promise<{ result: Verdict }>,
        schedule: () => Promise<unknown>,
      ) => {
        const decided = await evaluate();
        if (decided.result.decision !== AgentPublishDecision.PERMITTED) {
          return { policy: decided };
        }
        return { policy: decided, scheduled: await schedule() };
      },
    };
    service = new BreakoutAutoPublishService(
      prisma as unknown as PrismaService,
      {
        patch: async (id: string, update: Partial<PostRow>) => {
          if (scheduleFailure) throw scheduleFailure;
          return Object.assign(
            posts.find((row) => row.id === id) as PostRow,
            update,
          );
        },
      } as unknown as PostsService,
      policy as unknown as AutonomousPublishPolicyService,
      {
        warn: (message: string, context: Record<string, unknown>) => {
          warnings.push([message, context]);
        },
      } as unknown as LoggerService,
    );
  });

  it('schedules an untouched, fully checked draft and re-checks the policy under the lock', async () => {
    expect(await service.schedule(request())).toEqual({
      postId: 'post-a',
      status: 'scheduled',
    });

    expect(post()).toMatchObject({
      scheduledDate: expect.any(Date),
      targetExecutionState: TargetExecutionState.SCHEDULED,
    });
    expect(resolvedFor).toEqual([
      { organizationId: 'org-a', postId: 'post-a', strategyId: 'strategy-a' },
      { organizationId: 'org-a', postId: 'post-a', strategyId: 'strategy-a' },
    ]);
  });

  it.each([
    ['soft-deleted', { isDeleted: true }],
    ['in another organization', { organizationId: 'org-b' }],
    ['for another strategy', { agentStrategyId: 'strategy-b' }],
    ['for another output', { breakoutOutputId: 'output-b' }],
    ['on another credential', { credentialId: 'credential-b' }],
    ['a thread reply', { parentId: 'post-root' }],
    [
      'already scheduled',
      { targetExecutionState: TargetExecutionState.SCHEDULED },
    ],
  ])('leaves a draft that is %s for review', async (_case, fields) => {
    posts = [draft(fields)];

    expect(await service.schedule(request())).toEqual({
      reason: 'output_reviewed',
      status: 'review_only',
    });
    expect(post()?.scheduledDate).toBeUndefined();
  });

  it.each([
    [
      'the organization has auto-publish off',
      { ...ON, isBreakoutAutoPublishEnabled: false },
    ],
    [
      'auto-publish is on but breakout responses are off',
      { ...ON, isBreakoutResponsesEnabled: false },
    ],
    ['the organization has no settings row', undefined],
  ])(
    'stays review-only without reading the output when %s',
    async (_case, row) => {
      settings = new Map(row ? [['org-a', row]] : []);

      expect(await service.schedule(request())).toEqual({
        reason: 'org_auto_publish_disabled',
        status: 'review_only',
      });
      expect(world.timeline).toEqual(['authorize', 'settings']);
      expect(resolvedFor).toEqual([]);
      expect(post()?.targetExecutionState).toBe(TargetExecutionState.DRAFT);
    },
  );

  it.each([
    [
      'it waits for a brand review',
      {
        action: 'none',
        reason: 'brand_review_required',
        state: 'awaiting_review',
      },
    ],
    [
      'the quality gate blocked it',
      {
        action: 'none',
        reason: 'platform_quality_blocked',
        state: 'awaiting_review',
      },
    ],
    [
      'its quality evaluation is still pending',
      {
        action: 'reconcile',
        reason: 'quality_evaluation_pending',
        state: 'reconciliation_required',
      },
    ],
    ['it is already scheduled', { action: 'none', state: 'scheduled' }],
    ['it has no post yet', { postId: null }],
    [
      'the recovery is unavailable',
      {
        action: 'reconcile',
        reason: 'artifact_binding_missing',
        status: 'unavailable',
      },
    ],
  ])('stays review-only when %s', async (_case, fields) => {
    world.recovery = { ...READY, ...fields };

    expect(await service.schedule(request())).toEqual({
      reason: 'output_not_ready',
      status: 'review_only',
    });
    expect(post()?.targetExecutionState).toBe(TargetExecutionState.DRAFT);
  });

  it('leaves a draft a person already decided on to that person', async () => {
    posts = [draft({ reviewDecision: 'APPROVED' })];

    expect(await service.schedule(request())).toEqual({
      reason: 'output_reviewed',
      status: 'review_only',
    });
    expect(resolvedFor).toEqual([]);
    expect(post()?.targetExecutionState).toBe(TargetExecutionState.DRAFT);
  });

  it.each([
    [
      'the strategy publish policy denies it',
      [
        {
          decision: AgentPublishDecision.DENIED,
          reason: 'brand_requires_approval',
        },
      ],
      'publish_policy_brand_requires_approval',
    ],
    [
      'the lock shows the last slot is gone',
      [
        PERMITTED,
        { decision: AgentPublishDecision.DENIED, reason: 'weekly_cap' },
      ],
      'publish_policy_weekly_cap',
    ],
  ])(
    'stays review-only and writes nothing when %s',
    async (_case, queued, reason) => {
      verdicts = queued;

      expect(await service.schedule(request())).toEqual({
        reason,
        status: 'review_only',
      });
      expect(post()?.targetExecutionState).toBe(TargetExecutionState.DRAFT);
    },
  );

  it('holds the draft when the actor loses authority while waiting on the lock', async () => {
    // Settings, recovery, post and preview each re-authorize; the fifth runs under the lock.
    revokeAtAuthorization = 5;

    expect(await service.schedule(request())).toEqual({
      reason: 'publication_held',
      status: 'review_only',
    });
    expect(post()?.targetExecutionState).toBe(TargetExecutionState.DRAFT);
  });

  it('keeps the paid draft for review when the publication gate holds the schedule', async () => {
    scheduleFailure = new Error(
      'Breakout publication held: quality_evidence_unavailable',
    );

    expect(await service.schedule(request())).toEqual({
      reason: 'publication_held',
      status: 'review_only',
    });
    expect(warnings).toEqual([
      [
        'Breakout response was not auto-published',
        {
          error: 'Breakout publication held: quality_evidence_unavailable',
          organizationId: 'org-a',
          outputId: 'output-a',
        },
      ],
    ]);
  });

  it('re-reads the setting on every call, so turning it off takes effect at once', async () => {
    await service.schedule(request());
    posts = [draft()];
    settings.set('org-a', { ...ON, isBreakoutAutoPublishEnabled: false });

    expect(await service.schedule(request())).toEqual({
      reason: 'org_auto_publish_disabled',
      status: 'review_only',
    });
    expect(post()?.targetExecutionState).toBe(TargetExecutionState.DRAFT);
  });

  it('denies before any read when the actor lost authority', async () => {
    revokeAtAuthorization = 1;

    await expect(service.schedule(request())).rejects.toThrow('revoked');
    expect(world.timeline).toEqual(['authorize']);
    expect(post()?.targetExecutionState).toBe(TargetExecutionState.DRAFT);
  });
});
