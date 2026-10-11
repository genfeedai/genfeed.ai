import { runWithRequestPrincipal } from '@api/authorization/brand-access/request-principal.context';
import { admitBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-admission.util';
import {
  assertBreakoutPublicationDispatch,
  assertBreakoutPublicationFence,
  isBreakoutPublicationHold,
} from '@api/collections/outliers/services/breakout-publication-fence.util';
import { buildBreakoutResponseExecutionRequest } from '@api/collections/outliers/services/breakout-response-execution-admission.util';
import {
  BREAKOUT_RESPONSE_WORKFLOW_ID,
  BREAKOUT_RESPONSE_WORKFLOW_SOURCE,
} from '@api/collections/outliers/services/breakout-response-execution-workflow-definition';
import {
  buildHiddenSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import {
  MemberRole,
  Platform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import type { PrismaService } from '@libs/prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';

const runtime = vi.hoisted(() => ({ cloud: true }));
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => runtime.cloud,
}));
vi.mock(
  '@api/collections/outliers/services/breakout-publication-admission.util',
  () => ({ admitBreakoutPublication: vi.fn() }),
);

const human = {
  userId: 'user-a',
  organizationId: 'org-a',
  isApiKey: false,
  scopes: [] as string[],
};
const scope = {
  brandId: 'brand-a',
  credentialId: 'credential-a',
  organizationId: 'org-a',
  platform: Platform.TWITTER,
  responseId: 'response-a',
  strategyId: 'strategy-a',
};
const candidate = {
  id: 'post-a',
  organizationId: 'org-a',
  breakoutOutputId: 'output-a',
  targetExecutionState: TargetExecutionState.SCHEDULED,
};

/** The generating hidden execution, as persisted, and a post whose delivery restamped its own. */
function harness(options: { actor?: Record<string, unknown> } = {}) {
  const request = buildBreakoutResponseExecutionRequest(
    scope,
    (options.actor ?? human) as typeof human,
  );
  const execution = {
    id: 'exec-gen',
    organizationId: 'org-a',
    userId: human.userId,
    workflowId: 'workflow',
    workflowVersionId: 'pinned',
    workflow: {
      organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      isDeleted: false,
      metadata: {
        sourceType: 'hidden-system-workflow',
        systemWorkflow: buildHiddenSystemWorkflowMetadata({
          canonicalId: BREAKOUT_RESPONSE_WORKFLOW_ID,
        }),
      },
    },
    workflowVersion: {
      organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      workflowId: 'workflow',
    },
    result: {
      inputValues: { request } as Record<string, unknown>,
      metadata: {
        source: BREAKOUT_RESPONSE_WORKFLOW_SOURCE,
        canonicalId: BREAKOUT_RESPONSE_WORKFLOW_ID,
      } as Record<string, unknown>,
    },
  };
  const post = {
    brandId: 'brand-a',
    credentialId: 'credential-a',
    platform: Platform.TWITTER,
    agentStrategyId: 'strategy-a',
    breakoutOutputId: 'output-a' as string | null,
    targetExecutionState: TargetExecutionState.SCHEDULED as string,
    // A delivery restamped the post with its own execution; the fence never reads it.
    workflowExecutionId: 'exec-delivery',
  };
  const output = {
    responseId: 'response-a',
    brandId: 'brand-a',
    credentialId: 'credential-a',
    workflowExecutionId: 'exec-gen' as string | null,
    publicationActor: null as Record<string, unknown> | null,
  };
  const findPost = vi.fn(
    async (args: { where: Record<string, unknown> }): Promise<unknown> =>
      args.where.id === 'post-a' ? post : null,
  );
  const findOutput = vi.fn(async () => output);
  const findResponse = vi.fn(async () => ({ platform: Platform.TWITTER }));
  const findExecution = vi.fn(
    async (args: { where: { id: string; organizationId: string } }) =>
      args.where.id === 'exec-gen' && args.where.organizationId === 'org-a'
        ? execution
        : null,
  );
  const findMember = vi.fn(async () => ({
    role: { key: MemberRole.CREATOR },
    brands: [{ id: 'brand-a' }],
  }));
  const findBrand = vi.fn(async () => ({ id: 'brand-a' }));
  const findKey = vi.fn(async () => ({ scopes: ['posts:schedule'] }));
  const updateOutput = vi.fn(
    async (args: { data: { publicationActor: Record<string, unknown> } }) => {
      output.publicationActor = args.data.publicationActor;
      return { count: 1 };
    },
  );
  const tx = {
    post: { findFirst: findPost },
    breakoutResponseOutput: { findFirst: findOutput, updateMany: updateOutput },
    breakoutResponse: { findFirst: findResponse },
    workflowExecution: { findFirst: findExecution },
    member: { findFirst: findMember },
    brand: { findFirst: findBrand },
    apiKey: { findFirst: findKey },
  } as unknown as Prisma.TransactionClient;
  const prisma = {
    $transaction: vi.fn(
      async (run: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        run(tx),
    ),
  } as unknown as PrismaService;
  return {
    tx,
    prisma,
    post,
    output,
    execution,
    findPost,
    findOutput,
    updateOutput,
    findResponse,
    findExecution,
    findMember,
    findBrand,
    findKey,
  };
}

function keyActor(scopes: string[]) {
  return { ...human, isApiKey: true, apiKeyId: 'key-a', scopes };
}

describe('breakout publication fence', () => {
  beforeEach(() => {
    runtime.cloud = true;
    vi.mocked(admitBreakoutPublication)
      .mockReset()
      .mockResolvedValue({ scoreId: 'score-a' });
  });

  it.each([
    [{ id: 'post-a', organizationId: 'org-a' }],
    [{ id: 'post-a', organizationId: 'org-a', breakoutOutputId: null }],
  ])('does nothing and reads nothing for an ordinary post', async (plain) => {
    const h = harness();
    await assertBreakoutPublicationFence(h.tx, plain);
    expect(h.findPost).not.toHaveBeenCalled();
    expect(h.findExecution).not.toHaveBeenCalled();
    expect(admitBreakoutPublication).not.toHaveBeenCalled();
  });

  describe('admission at schedule time and at dispatch', () => {
    it.each([
      ['schedule', TargetExecutionState.SCHEDULED],
      ['dispatch', TargetExecutionState.PUBLISHING],
    ] as const)(
      'admits the %s phase with the generating execution and a live reauthorize',
      async (phase, state) => {
        const h = harness();
        // The write that enters PUBLISHING starts from a post that is still SCHEDULED.
        h.post.targetExecutionState = TargetExecutionState.SCHEDULED;
        await assertBreakoutPublicationFence(h.tx, {
          ...candidate,
          targetExecutionState: state,
        });
        expect(admitBreakoutPublication).toHaveBeenCalledOnce();
        const [client, request] = vi.mocked(admitBreakoutPublication).mock
          .calls[0];
        expect(client).toBe(h.tx);
        expect(request).toMatchObject({
          scope: {
            organizationId: 'org-a',
            brandId: 'brand-a',
            credentialId: 'credential-a',
            platform: Platform.TWITTER,
            responseId: 'response-a',
            outputId: 'output-a',
          },
          strategyId: 'strategy-a',
          postId: 'post-a',
          workflowExecutionId: 'exec-gen',
          phase,
        });
        h.findMember.mockClear();
        await request.reauthorize(h.tx);
        expect(h.findMember).toHaveBeenCalled();
      },
    );

    it('admits a retry after delivery restamped the post with its own execution', async () => {
      const h = harness();
      expect(h.post.workflowExecutionId).toBe('exec-delivery');
      await assertBreakoutPublicationFence(h.tx, {
        ...candidate,
        targetExecutionState: TargetExecutionState.PUBLISHING,
      });
      expect(h.findExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'exec-gen' }),
        }),
      );
      expect(h.findExecution).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'exec-delivery' }),
        }),
      );
      expect(
        vi.mocked(admitBreakoutPublication).mock.calls[0][1],
      ).toMatchObject({ workflowExecutionId: 'exec-gen' });
    });

    it('reads every row tenant-scoped and undeleted, never from the candidate', async () => {
      const h = harness();
      await assertBreakoutPublicationFence(h.tx, {
        ...candidate,
        brandId: 'forged',
        credentialId: 'forged',
        agentStrategyId: 'forged',
        workflowExecutionId: 'forged',
      });
      for (const read of [h.findPost, h.findOutput, h.findResponse]) {
        expect(read).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              organizationId: 'org-a',
              isDeleted: false,
            }),
          }),
        );
      }
      expect(h.findExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'exec-gen', organizationId: 'org-a', isDeleted: false },
        }),
      );
      expect(
        vi.mocked(admitBreakoutPublication).mock.calls[0][1],
      ).toMatchObject({ strategyId: 'strategy-a' });
    });

    it('lets a post that is already PUBLISHING be recorded or requeued', async () => {
      const h = harness();
      h.post.targetExecutionState = TargetExecutionState.PUBLISHING;
      for (const next of [
        TargetExecutionState.PUBLISHING,
        TargetExecutionState.SCHEDULED,
      ]) {
        await assertBreakoutPublicationFence(h.tx, {
          ...candidate,
          targetExecutionState: next,
        });
      }
      expect(admitBreakoutPublication).not.toHaveBeenCalled();
      expect(h.findExecution).not.toHaveBeenCalled();
    });
  });

  describe('actor authority', () => {
    it('holds a response whose execution carries no bound actor', async () => {
      const h = harness();
      delete (h.execution.result.inputValues.request as Record<string, unknown>)
        .initiatingActor;
      await expect(
        assertBreakoutPublicationFence(h.tx, candidate),
      ).rejects.toThrow('Breakout execution denied');
      expect(admitBreakoutPublication).not.toHaveBeenCalled();
      expect(h.findMember).not.toHaveBeenCalled();
    });

    it('holds a scrubbed execution request', async () => {
      const h = harness();
      h.execution.result.inputValues = {};
      await expect(
        assertBreakoutPublicationFence(h.tx, candidate),
      ).rejects.toThrow('Breakout execution denied');
      expect(admitBreakoutPublication).not.toHaveBeenCalled();
    });

    it('holds a pinned actor of another organization', async () => {
      const h = harness({ actor: { ...human, organizationId: 'org-foreign' } });
      await expect(
        assertBreakoutPublicationFence(h.tx, candidate),
      ).rejects.toThrow('Breakout execution denied');
      expect(admitBreakoutPublication).not.toHaveBeenCalled();
    });

    it('holds an execution that does not exist in the tenant', async () => {
      const h = harness();
      h.output.workflowExecutionId = 'exec-elsewhere';
      await expect(
        assertBreakoutPublicationFence(h.tx, candidate),
      ).rejects.toThrow('Breakout execution denied');
      expect(admitBreakoutPublication).not.toHaveBeenCalled();
    });

    it('holds an actor that lost its brand access or membership', async () => {
      const lostBrand = harness();
      lostBrand.findMember.mockResolvedValue({
        role: { key: MemberRole.CREATOR },
        brands: [],
      });
      lostBrand.findBrand.mockResolvedValue(null as never);
      await expect(
        assertBreakoutPublicationFence(lostBrand.tx, candidate),
      ).rejects.toThrow('Brand access denied');
      const lostSeat = harness();
      lostSeat.findMember.mockResolvedValue(null as never);
      await expect(
        assertBreakoutPublicationFence(lostSeat.tx, candidate),
      ).rejects.toThrow('Brand access denied');
      expect(admitBreakoutPublication).not.toHaveBeenCalled();
    });

    it('holds a revoked or expired API key', async () => {
      const h = harness({ actor: keyActor(['posts:schedule']) });
      h.findKey.mockResolvedValue(null as never);
      await expect(
        assertBreakoutPublicationFence(h.tx, candidate),
      ).rejects.toThrow('Breakout execution denied');
      expect(admitBreakoutPublication).not.toHaveBeenCalled();
    });

    it.each([[['posts:draft']], [['analytics:read', 'posts:approve']], [[]]])(
      'never publishes for a review-only key (%j)',
      async (scopes) => {
        const h = harness({ actor: keyActor(scopes) });
        h.findKey.mockResolvedValue({ scopes } as never);
        await expect(
          assertBreakoutPublicationFence(h.tx, candidate),
        ).rejects.toThrow('Breakout execution denied');
        expect(admitBreakoutPublication).not.toHaveBeenCalled();
      },
    );

    it('publishes for a key that holds posts:schedule', async () => {
      const h = harness({ actor: keyActor(['posts:schedule']) });
      await assertBreakoutPublicationFence(h.tx, candidate);
      expect(admitBreakoutPublication).toHaveBeenCalledOnce();
    });

    it('keeps denying when the key is narrowed during the business reads', async () => {
      const h = harness({ actor: keyActor(['posts:schedule']) });
      vi.mocked(admitBreakoutPublication).mockImplementation(
        async (client, request) => {
          h.findKey.mockResolvedValue({ scopes: ['posts:draft'] } as never);
          await request.reauthorize(client);
          return { scoreId: 'never' };
        },
      );
      await expect(
        assertBreakoutPublicationFence(h.tx, candidate),
      ).rejects.toThrow('Breakout execution denied');
    });

    it('lets a human member publish a response generated for review', async () => {
      const h = harness();
      await assertBreakoutPublicationFence(h.tx, candidate);
      expect(admitBreakoutPublication).toHaveBeenCalledOnce();
    });

    it.each([
      [
        'a child of another workflow',
        (e: ReturnType<typeof harness>['execution']) => {
          e.result.metadata = {
            source: BREAKOUT_RESPONSE_WORKFLOW_SOURCE,
            canonicalId: BREAKOUT_RESPONSE_WORKFLOW_ID,
            parentExecutionId: 'parent',
          };
        },
      ],
      [
        'another producer',
        (e: ReturnType<typeof harness>['execution']) => {
          e.result.metadata = {
            source: 'manual',
            canonicalId: BREAKOUT_RESPONSE_WORKFLOW_ID,
          };
        },
      ],
      [
        'a tenant-owned, unpinned mirror',
        (e: ReturnType<typeof harness>['execution']) => {
          e.workflow.organizationId = 'org-a';
          e.workflowVersion.organizationId = 'org-a';
        },
      ],
      [
        'another workflow',
        (e: ReturnType<typeof harness>['execution']) => {
          e.workflow.metadata = {
            sourceType: 'hidden-system-workflow',
            systemWorkflow: buildHiddenSystemWorkflowMetadata({
              canonicalId: 'knowledge.source.ingest',
            }),
          };
        },
      ],
    ])('holds an execution that is %s', async (_name, mutate) => {
      const h = harness();
      mutate(h.execution);
      await expect(
        assertBreakoutPublicationFence(h.tx, candidate),
      ).rejects.toThrow('Breakout execution denied');
      expect(admitBreakoutPublication).not.toHaveBeenCalled();
    });
  });

  describe('scope and identity', () => {
    it.each([
      [
        'a missing post',
        (h: ReturnType<typeof harness>) => h.findPost.mockResolvedValue(null),
      ],
      [
        'a post without a strategy',
        (h: ReturnType<typeof harness>) =>
          h.findPost.mockResolvedValue({ ...h.post, agentStrategyId: null }),
      ],
      [
        'an output without a generating execution',
        (h: ReturnType<typeof harness>) => {
          h.output.workflowExecutionId = null;
        },
      ],
      [
        'a post of another credential',
        (h: ReturnType<typeof harness>) =>
          h.findPost.mockResolvedValue({ ...h.post, credentialId: 'other' }),
      ],
      [
        'a post of another platform',
        (h: ReturnType<typeof harness>) =>
          h.findPost.mockResolvedValue({
            ...h.post,
            platform: Platform.INSTAGRAM,
          }),
      ],
    ])('holds %s before reading any actor', async (_name, arrange) => {
      const h = harness();
      arrange(h);
      await expect(
        assertBreakoutPublicationFence(h.tx, candidate),
      ).rejects.toThrow(
        'Breakout publication held: publication_state_unavailable',
      );
      expect(h.findExecution).not.toHaveBeenCalled();
    });

    it('holds a candidate that omits its identity', async () => {
      const h = harness();
      await expect(
        assertBreakoutPublicationFence(h.tx, {
          breakoutOutputId: 'output-a',
          organizationId: 'org-a',
        }),
      ).rejects.toThrow('publication_state_unavailable');
      await expect(
        assertBreakoutPublicationFence(h.tx, {
          id: 'post-a',
          organizationId: 'org-a',
          breakoutOutputId: 7,
        }),
      ).rejects.toThrow('publication_state_unavailable');
      expect(h.findPost).not.toHaveBeenCalled();
    });

    it.each([
      ['brand', { brandId: 'other' }],
      ['credential', { credentialId: 'other' }],
      ['response', { responseId: 'other' }],
      ['strategy', { strategyId: 'other' }],
      ['platform', { platform: Platform.INSTAGRAM }],
    ])(
      'holds when the pinned actor scope differs by %s',
      async (_name, change) => {
        const h = harness();
        const request = h.execution.result.inputValues.request as Record<
          string,
          unknown
        >;
        h.execution.result.inputValues.request = { ...request, ...change };
        await expect(
          assertBreakoutPublicationFence(h.tx, candidate),
        ).rejects.toThrow(/actor_scope_changed|denied/);
        expect(admitBreakoutPublication).not.toHaveBeenCalled();
      },
    );

    it('lets the business admission hold stand', async () => {
      const h = harness();
      vi.mocked(admitBreakoutPublication).mockRejectedValue(
        new BusinessLogicException(
          'Breakout publication held: quota_exhausted',
        ),
      );
      await expect(
        assertBreakoutPublicationFence(h.tx, candidate),
      ).rejects.toThrow('quota_exhausted');
    });
  });
});

describe('breakout publication by the member who schedules it', () => {
  const scheduler = {
    userId: 'user-b',
    organizationId: 'org-a',
    isApiKey: false,
    scopes: [] as string[],
  };
  const target = { organizationId: 'org-a', postId: 'post-a' };

  /** A draft that a review-only key generated. */
  function reviewOnlyDraft() {
    const h = harness({ actor: keyActor(['posts:draft']) });
    h.findKey.mockResolvedValue({ scopes: ['posts:draft'] } as never);
    return h;
  }

  function scheduleAs(
    principal: typeof scheduler | undefined,
    h: ReturnType<typeof harness>,
  ) {
    return runWithRequestPrincipal(principal, () =>
      assertBreakoutPublicationFence(h.tx, candidate),
    );
  }

  beforeEach(() => {
    runtime.cloud = true;
    vi.mocked(admitBreakoutPublication)
      .mockReset()
      .mockResolvedValue({ scoreId: 'score-a' });
  });

  it('publishes a review-only key draft once a member with brand access schedules it', async () => {
    const h = reviewOnlyDraft();
    await scheduleAs(scheduler, h);
    expect(admitBreakoutPublication).toHaveBeenCalledOnce();
    expect(h.findMember).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-b' }),
      }),
    );
    // The generating key is not the authority and is never consulted for scopes.
    expect(h.findKey).not.toHaveBeenCalled();
    expect(h.updateOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          publicationActor: expect.objectContaining({ userId: 'user-b' }),
        },
        where: expect.objectContaining({
          id: 'output-a',
          organizationId: 'org-a',
          isDeleted: false,
        }),
      }),
    );
  });

  it('publishes for a key that holds posts:schedule, whatever generated the draft', async () => {
    const h = reviewOnlyDraft();
    h.findKey.mockResolvedValue({ scopes: ['posts:schedule'] } as never);
    await scheduleAs(
      {
        ...scheduler,
        isApiKey: true,
        apiKeyId: 'key-b',
        scopes: ['posts:schedule'],
      },
      h,
    );
    expect(admitBreakoutPublication).toHaveBeenCalledOnce();
  });

  it('holds a member without access to the brand', async () => {
    const h = reviewOnlyDraft();
    h.findMember.mockResolvedValue({
      role: { key: MemberRole.CREATOR },
      brands: [],
    });
    h.findBrand.mockResolvedValue(null as never);
    await expect(scheduleAs(scheduler, h)).rejects.toThrow(
      'Brand access denied',
    );
    expect(admitBreakoutPublication).not.toHaveBeenCalled();
    expect(h.updateOutput).not.toHaveBeenCalled();
  });

  it('holds a non-member', async () => {
    const h = reviewOnlyDraft();
    h.findMember.mockResolvedValue(null as never);
    await expect(scheduleAs(scheduler, h)).rejects.toThrow(
      'Brand access denied',
    );
    expect(h.updateOutput).not.toHaveBeenCalled();
  });

  it('holds a review-only key that schedules, even for a draft a member generated', async () => {
    const h = harness();
    h.findKey.mockResolvedValue({ scopes: ['posts:draft'] } as never);
    await expect(
      scheduleAs(
        {
          ...scheduler,
          isApiKey: true,
          apiKeyId: 'key-b',
          scopes: ['posts:draft'],
        },
        h,
      ),
    ).rejects.toThrow('Breakout execution denied');
    expect(admitBreakoutPublication).not.toHaveBeenCalled();
    expect(h.updateOutput).not.toHaveBeenCalled();
  });

  it('holds a principal of another organization', async () => {
    const h = reviewOnlyDraft();
    await expect(
      scheduleAs({ ...scheduler, organizationId: 'org-foreign' }, h),
    ).rejects.toThrow('Breakout execution denied');
    expect(admitBreakoutPublication).not.toHaveBeenCalled();
  });

  it('keeps a system path with no requesting user held for a review-only draft', async () => {
    const h = reviewOnlyDraft();
    await expect(scheduleAs(undefined, h)).rejects.toThrow(
      'Breakout execution denied',
    );
    expect(admitBreakoutPublication).not.toHaveBeenCalled();
    expect(h.updateOutput).not.toHaveBeenCalled();
  });

  describe('at dispatch, with no request', () => {
    async function scheduledByMember() {
      const h = reviewOnlyDraft();
      await scheduleAs(scheduler, h);
      h.post.targetExecutionState = TargetExecutionState.PUBLISHING;
      vi.mocked(admitBreakoutPublication).mockClear();
      h.findMember.mockClear();
      h.findKey.mockClear();
      return h;
    }

    it('re-checks the member who scheduled it, not the generating key', async () => {
      const h = await scheduledByMember();
      await assertBreakoutPublicationDispatch(h.prisma, target);
      expect(admitBreakoutPublication).toHaveBeenCalledOnce();
      expect(h.findMember).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-b' }),
        }),
      );
      expect(h.findKey).not.toHaveBeenCalled();
    });

    it('holds once the membership was revoked between schedule and dispatch', async () => {
      const h = await scheduledByMember();
      h.findMember.mockResolvedValue(null as never);
      await expect(
        assertBreakoutPublicationDispatch(h.prisma, target),
      ).rejects.toThrow('Brand access denied');
      expect(admitBreakoutPublication).not.toHaveBeenCalled();
    });

    it('holds once the member lost the brand between schedule and dispatch', async () => {
      const h = await scheduledByMember();
      h.findMember.mockResolvedValue({
        role: { key: MemberRole.CREATOR },
        brands: [],
      });
      h.findBrand.mockResolvedValue(null as never);
      await expect(
        assertBreakoutPublicationDispatch(h.prisma, target),
      ).rejects.toThrow('Brand access denied');
    });

    it('holds an output whose persisted scheduler is malformed', async () => {
      const h = await scheduledByMember();
      h.output.publicationActor = { userId: 'user-b' };
      await expect(
        assertBreakoutPublicationDispatch(h.prisma, target),
      ).rejects.toThrow('Breakout execution denied');
    });

    it('holds a persisted scheduler of another organization', async () => {
      const h = await scheduledByMember();
      h.output.publicationActor = {
        ...scheduler,
        organizationId: 'org-foreign',
      };
      await expect(
        assertBreakoutPublicationDispatch(h.prisma, target),
      ).rejects.toThrow('Breakout execution denied');
    });

    it('stays held for a review-only draft nobody scheduled', async () => {
      const h = reviewOnlyDraft();
      h.post.targetExecutionState = TargetExecutionState.PUBLISHING;
      await expect(
        assertBreakoutPublicationDispatch(h.prisma, target),
      ).rejects.toThrow('Breakout execution denied');
    });
  });
});

describe('breakout publication dispatch fence', () => {
  beforeEach(() => {
    runtime.cloud = true;
    vi.mocked(admitBreakoutPublication)
      .mockReset()
      .mockResolvedValue({ scoreId: 'score-a' });
  });

  const target = { organizationId: 'org-a', postId: 'post-a' };

  it('passes an ordinary post without any breakout read', async () => {
    const h = harness();
    h.post.breakoutOutputId = null;
    await assertBreakoutPublicationDispatch(h.prisma, target);
    expect(admitBreakoutPublication).not.toHaveBeenCalled();
    expect(h.findExecution).not.toHaveBeenCalled();
  });

  it('reads the link from the database, not from the caller', async () => {
    const h = harness();
    h.post.targetExecutionState = TargetExecutionState.PUBLISHING;
    await assertBreakoutPublicationDispatch(h.prisma, target);
    expect(h.findPost).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'post-a',
          organizationId: 'org-a',
          isDeleted: false,
        }),
      }),
    );
  });

  it('re-admits a PUBLISHING post in the dispatch phase', async () => {
    const h = harness();
    h.post.targetExecutionState = TargetExecutionState.PUBLISHING;
    await assertBreakoutPublicationDispatch(h.prisma, target);
    expect(admitBreakoutPublication).toHaveBeenCalledOnce();
    expect(vi.mocked(admitBreakoutPublication).mock.calls[0][1]).toMatchObject({
      phase: 'dispatch',
      postId: 'post-a',
      workflowExecutionId: 'exec-gen',
    });
  });

  it('holds when the actor lost its authority since scheduling', async () => {
    const h = harness({ actor: keyActor(['posts:schedule']) });
    h.post.targetExecutionState = TargetExecutionState.PUBLISHING;
    h.findKey.mockResolvedValue(null as never);
    const error = await assertBreakoutPublicationDispatch(
      h.prisma,
      target,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(isBreakoutPublicationHold(error)).toBe(true);
    expect(admitBreakoutPublication).not.toHaveBeenCalled();
  });

  it('holds a post that vanished', async () => {
    const h = harness();
    h.findPost.mockResolvedValue(null);
    await expect(
      assertBreakoutPublicationDispatch(h.prisma, target),
    ).rejects.toThrow('publication_state_unavailable');
  });

  it('classifies holds apart from infrastructure failures', () => {
    expect(
      isBreakoutPublicationHold(
        new BusinessLogicException('Breakout publication held: x'),
      ),
    ).toBe(true);
    expect(isBreakoutPublicationHold(new ForbiddenException())).toBe(true);
    expect(isBreakoutPublicationHold(new Error('connection reset'))).toBe(
      false,
    );
  });
});
