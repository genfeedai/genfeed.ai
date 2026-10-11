import { admitBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-admission.util';
import { assertBreakoutPublicationFence } from '@api/collections/outliers/services/breakout-publication-fence.util';
import {
  admitBreakoutPublicationActor,
  reauthorizeBreakoutActor,
} from '@api/collections/outliers/services/breakout-response-execution-admission.util';
import { Platform, TargetExecutionState } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

vi.mock(
  '@api/collections/outliers/services/breakout-publication-admission.util',
  () => ({ admitBreakoutPublication: vi.fn() }),
);
vi.mock(
  '@api/collections/outliers/services/breakout-response-execution-admission.util',
  () => ({
    admitBreakoutPublicationActor: vi.fn(),
    reauthorizeBreakoutActor: vi.fn(),
  }),
);

const admission = {
  initiatingActor: {
    userId: 'user-a',
    organizationId: 'org-a',
    isApiKey: false,
    scopes: [],
  },
  scope: {
    brandId: 'brand-a',
    credentialId: 'credential-a',
    organizationId: 'org-a',
    platform: Platform.TWITTER,
    responseId: 'response-a',
    strategyId: 'strategy-a',
  },
  workflowExecutionId: 'execution-a',
};
const candidate = {
  id: 'post-a',
  organizationId: 'org-a',
  breakoutOutputId: 'output-a',
  targetExecutionState: TargetExecutionState.SCHEDULED,
};

function harness() {
  const post = {
    brandId: 'brand-a',
    credentialId: 'credential-a',
    platform: Platform.TWITTER,
    agentStrategyId: 'strategy-a',
    workflowExecutionId: 'execution-a',
  };
  const findPost = vi.fn(async (): Promise<typeof post | null> => post);
  const findOutput = vi.fn(async () => ({
    responseId: 'response-a',
    brandId: 'brand-a',
    credentialId: 'credential-a',
  }));
  const findResponse = vi.fn(async () => ({ platform: Platform.TWITTER }));
  const tx = {
    post: { findFirst: findPost },
    breakoutResponseOutput: { findFirst: findOutput },
    breakoutResponse: { findFirst: findResponse },
  } as unknown as Prisma.TransactionClient;
  return { tx, post, findPost, findOutput, findResponse };
}

describe('breakout publication fence', () => {
  beforeEach(() => {
    vi.mocked(admitBreakoutPublicationActor)
      .mockReset()
      .mockResolvedValue(admission);
    vi.mocked(reauthorizeBreakoutActor)
      .mockReset()
      .mockResolvedValue(admission.initiatingActor);
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
    expect(admitBreakoutPublicationActor).not.toHaveBeenCalled();
    expect(admitBreakoutPublication).not.toHaveBeenCalled();
  });

  it.each([
    ['schedule', TargetExecutionState.SCHEDULED],
    ['dispatch', TargetExecutionState.PUBLISHING],
  ] as const)(
    'admits the %s phase with the pinned actor and the live reauthorize',
    async (phase, state) => {
      const h = harness();
      await assertBreakoutPublicationFence(h.tx, {
        ...candidate,
        targetExecutionState: state,
      });
      expect(admitBreakoutPublicationActor).toHaveBeenCalledWith(
        h.tx,
        expect.anything(),
        'execution-a',
        'org-a',
      );
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
        workflowExecutionId: 'execution-a',
        phase,
      });
      const other = {} as Prisma.TransactionClient;
      await request.reauthorize(other);
      expect(reauthorizeBreakoutActor).toHaveBeenCalledWith(
        other,
        expect.anything(),
        admission,
      );
    },
  );

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
    expect(admitBreakoutPublicationActor).toHaveBeenCalledWith(
      h.tx,
      expect.anything(),
      'execution-a',
      'org-a',
    );
  });

  it('holds a response whose execution has no bound actor or lost its authority', async () => {
    for (const message of [
      'Breakout execution denied',
      'Brand access denied',
    ]) {
      const h = harness();
      vi.mocked(admitBreakoutPublicationActor).mockRejectedValue(
        new Error(message),
      );
      await expect(
        assertBreakoutPublicationFence(h.tx, candidate),
      ).rejects.toThrow(message);
      expect(admitBreakoutPublication).not.toHaveBeenCalled();
    }
  });

  it('propagates a denial raised while the admission re-reads authority', async () => {
    const h = harness();
    vi.mocked(admitBreakoutPublication).mockImplementation(
      async (_tx, request) => {
        await request.reauthorize(_tx);
        return { scoreId: 'never' };
      },
    );
    vi.mocked(reauthorizeBreakoutActor).mockRejectedValue(
      new Error('Brand access denied'),
    );
    await expect(
      assertBreakoutPublicationFence(h.tx, candidate),
    ).rejects.toThrow('Brand access denied');
  });

  it.each([
    [
      'a missing post',
      (h: ReturnType<typeof harness>) => h.findPost.mockResolvedValue(null),
    ],
    [
      'a post without a strategy',
      (h: ReturnType<typeof harness>) =>
        h.findPost.mockResolvedValue({
          ...h.post,
          agentStrategyId: null as never,
        }),
    ],
    [
      'a post without a pinned execution',
      (h: ReturnType<typeof harness>) =>
        h.findPost.mockResolvedValue({
          ...h.post,
          workflowExecutionId: null as never,
        }),
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
    expect(admitBreakoutPublicationActor).not.toHaveBeenCalled();
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
      vi.mocked(admitBreakoutPublicationActor).mockResolvedValue({
        ...admission,
        scope: { ...admission.scope, ...change },
      });
      await expect(
        assertBreakoutPublicationFence(h.tx, candidate),
      ).rejects.toThrow('Breakout publication held: actor_scope_changed');
      expect(admitBreakoutPublication).not.toHaveBeenCalled();
    },
  );

  it('lets the business admission hold stand', async () => {
    const h = harness();
    vi.mocked(admitBreakoutPublication).mockRejectedValue(
      new Error('Breakout publication held: quota_exhausted'),
    );
    await expect(
      assertBreakoutPublicationFence(h.tx, candidate),
    ).rejects.toThrow('quota_exhausted');
  });
});
