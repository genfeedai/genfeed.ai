import { WorkflowPostGenerationService } from '@api/collections/workflows/services/workflow-post-generation.service';
import type { WorkflowPostGenerationInput } from '@api/collections/workflows/services/workflow-post-generation.types';
import type { BrandedTextGenerationRequestV1 } from '@api/services/branded-text-generation/branded-text-generation.types';
import { Platform, TargetExecutionState } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const learningReceipt = vi.hoisted(() => ({
  resolveAccountlessLearningReceipt: vi.fn(),
}));
vi.mock(
  '@api/services/branded-text-generation/accountless-learning-receipt.util',
  () => learningReceipt,
);

const PRIVATE_LEARNING = { mode: 'no_destination' };

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    id: 'receipt-1',
    mode: 'approved_brand',
    state: 'ready',
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<WorkflowPostGenerationInput> = {},
): WorkflowPostGenerationInput {
  return {
    brandId: 'brand-1',
    brandLabel: 'Acme',
    buildLabel: (text) => text.slice(0, 20),
    context: {
      executionId: 'exec-1',
      organizationId: 'org-1',
      runId: 'run-1',
      userId: 'user-1',
      workflowId: 'wf-1',
      workflowVersionId: 'v-1',
    },
    maxTokens: 500,
    model: 'openai/gpt-test',
    nodeId: 'node-1',
    prompt: 'Write a launch post',
    temperature: 0.6,
    timezone: 'UTC',
    ...overrides,
  };
}

function makeService(
  options: { isActiveMember?: boolean; resolvedMode?: unknown } = {},
) {
  const generation = { generate: vi.fn() };
  const modeResolver = {
    resolve: vi
      .fn()
      .mockResolvedValue(options.resolvedMode ?? { mode: 'approved_brand' }),
  };
  const credentialsService = {
    findConnectedAccounts: vi.fn(),
    findOne: vi.fn(),
  };
  const postsService = { create: vi.fn(), findOne: vi.fn() };
  const prisma = {
    member: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          options.isActiveMember === false ? null : { id: 'm' },
        ),
    },
  };
  const service = new WorkflowPostGenerationService(
    generation as never,
    modeResolver as never,
    {} as never,
    credentialsService as never,
    postsService as never,
    prisma as never,
  );
  return {
    credentialsService,
    generation,
    modeResolver,
    postsService,
    prisma,
    service,
  };
}

/** Runs the request's persistText like the seam does, then reports completion. */
function completeWith(
  generation: { generate: ReturnType<typeof vi.fn> },
  outcomeFor: (index: number) => {
    kind: 'completed' | 'stopped';
    receipt: Record<string, unknown>;
    reasonCode?: string;
    text?: string;
  },
) {
  let index = 0;
  generation.generate.mockImplementation(
    async (request: BrandedTextGenerationRequestV1) => {
      const outcome = outcomeFor(index++);
      if (outcome.kind === 'stopped')
        return {
          hasNewDispatch: false,
          postId: null,
          reasonCode: outcome.reasonCode,
          ...outcome,
        };
      const text = outcome.text ?? `Generated ${index}`;
      const { postId } = await request.persistText(text);
      return { hasNewDispatch: true, postId, ...outcome, text };
    },
  );
}

describe('WorkflowPostGenerationService', () => {
  beforeEach(() => {
    learningReceipt.resolveAccountlessLearningReceipt.mockReset();
    learningReceipt.resolveAccountlessLearningReceipt.mockResolvedValue(
      PRIVATE_LEARNING,
    );
  });

  it('dispatches once per connected account with its own receipt and saves the exact text as a draft', async () => {
    const { credentialsService, generation, postsService, service } =
      makeService();
    credentialsService.findConnectedAccounts.mockResolvedValue([
      { id: 'cred-1' },
      { id: 'cred-2' },
    ]);
    postsService.create
      .mockResolvedValueOnce({ id: 'post-1', label: 'L1', status: 'draft' })
      .mockResolvedValueOnce({ id: 'post-2', label: 'L2', status: 'draft' });
    completeWith(generation, (index) => ({
      kind: 'completed',
      receipt: receipt({ id: `receipt-${index + 1}` }),
      text: `Body ${index + 1}`,
    }));

    const result = await service.generate(
      baseInput({ platform: Platform.TWITTER }),
    );

    expect(credentialsService.findConnectedAccounts).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      Platform.TWITTER,
    );
    expect(generation.generate).toHaveBeenCalledTimes(2);
    const first = generation.generate.mock.calls[0]?.[0];
    const second = generation.generate.mock.calls[1]?.[0];
    expect(first.input).toMatchObject({
      actorId: 'user-1',
      brandId: 'brand-1',
      candidateIndex: 0,
      contentType: 'post',
      destinationCredentialId: 'cred-1',
      format: 'text',
      mode: 'approved_brand',
      model: 'openai/gpt-test',
      organizationId: 'org-1',
      platform: Platform.TWITTER,
      provider: 'openrouter',
      runId: 'run-1',
      surface: 'workflow',
      workflowExecutionId: 'exec-1',
    });
    expect(first.input.requestKey).toBe('workflow:exec-1:node-1:cred-1');
    expect(second.input.requestKey).toBe('workflow:exec-1:node-1:cred-2');
    expect(first.input.originalPrompt).toContain('Brand: Acme');
    expect(first.input.originalPrompt).toContain('Write a launch post');
    expect(first.privateLearning).toBe(PRIVATE_LEARNING);
    expect(postsService.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        brandId: 'brand-1',
        credentialId: 'cred-1',
        description: 'Body 1',
        groupId: result.groupId,
        organizationId: 'org-1',
        platform: Platform.TWITTER,
        source: 'workflow-post-generator',
        sourceWorkflowId: 'wf-1',
        targetExecutionState: TargetExecutionState.DRAFT,
        userId: 'user-1',
        workflowExecutionId: 'exec-1',
      }),
    );
    expect(result.drafts.map((draft) => draft.receiptId)).toEqual([
      'receipt-1',
      'receipt-2',
    ]);
    expect(result.drafts.every((draft) => !draft.isHeldForReview)).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('labels a scheduled fire as a schedule run', async () => {
    const { credentialsService, generation, postsService, service } =
      makeService();
    credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: 'TWITTER',
    });
    postsService.create.mockResolvedValue({ id: 'post-1', status: 'draft' });
    completeWith(generation, () => ({ kind: 'completed', receipt: receipt() }));
    const input = baseInput({ credentialId: 'cred-1' });

    await service.generate({
      ...input,
      context: { ...input.context, scheduledFireJobId: 'fire-1' },
    });

    expect(generation.generate.mock.calls[0]?.[0].input.surface).toBe(
      'schedule',
    );
  });

  it('holds a provisional-brand draft and says why', async () => {
    const { credentialsService, generation, postsService, service } =
      makeService({
        resolvedMode: {
          draftRevisionId: 'rev-draft',
          mode: 'provisional_brand',
        },
      });
    credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: 'TWITTER',
    });
    postsService.create.mockResolvedValue({ id: 'post-1', status: 'draft' });
    completeWith(generation, () => ({
      kind: 'completed',
      receipt: receipt({ mode: 'provisional_brand', state: 'needs_review' }),
    }));

    const result = await service.generate(
      baseInput({ credentialId: 'cred-1' }),
    );

    expect(generation.generate.mock.calls[0]?.[0].input).toMatchObject({
      draftRevisionId: 'rev-draft',
      mode: 'provisional_brand',
    });
    expect(result.drafts[0]).toMatchObject({
      holdReason: 'provisional_brand',
      isHeldForReview: true,
    });
    expect(postsService.create.mock.calls[0]?.[0].targetExecutionState).toBe(
      TargetExecutionState.DRAFT,
    );
  });

  it('holds an approved-brand draft whose validation could not clear it', async () => {
    const { credentialsService, generation, postsService, service } =
      makeService();
    credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: 'TWITTER',
    });
    postsService.create.mockResolvedValue({ id: 'post-1', status: 'draft' });
    completeWith(generation, () => ({
      kind: 'completed',
      receipt: receipt({ state: 'needs_review' }),
    }));

    const result = await service.generate(
      baseInput({ credentialId: 'cred-1' }),
    );

    expect(result.drafts[0]).toMatchObject({
      holdReason: 'needs_review',
      isHeldForReview: true,
    });
  });

  it('continues past an account whose receipt stopped and reports it', async () => {
    const { credentialsService, generation, postsService, service } =
      makeService();
    credentialsService.findConnectedAccounts.mockResolvedValue([
      { id: 'cred-1' },
      { id: 'cred-2' },
    ]);
    postsService.create.mockResolvedValue({ id: 'post-2', status: 'draft' });
    completeWith(generation, (index) =>
      index === 0
        ? {
            kind: 'stopped',
            reasonCode: 'no_approved_revision',
            receipt: receipt({ id: 'receipt-1', state: 'blocked' }),
          }
        : { kind: 'completed', receipt: receipt({ id: 'receipt-2' }) },
    );

    const result = await service.generate(
      baseInput({ platform: Platform.TWITTER }),
    );

    expect(result.failures).toEqual([
      {
        credentialId: 'cred-1',
        reasonCode: 'no_approved_revision',
        receiptId: 'receipt-1',
      },
    ]);
    expect(result.drafts.map((draft) => draft.credentialId)).toEqual([
      'cred-2',
    ]);
  });

  it('reports an in-progress replay as a failure without saving anything', async () => {
    const { credentialsService, generation, postsService, service } =
      makeService();
    credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: 'TWITTER',
    });
    generation.generate.mockResolvedValue({
      hasNewDispatch: false,
      kind: 'in_progress',
      receipt: receipt({ state: 'dispatched' }),
    });

    const result = await service.generate(
      baseInput({ credentialId: 'cred-1' }),
    );

    expect(result.drafts).toEqual([]);
    expect(result.failures[0]?.reasonCode).toBe(
      'branded_generation_in_progress',
    );
    expect(postsService.create).not.toHaveBeenCalled();
  });

  it('reads the saved draft back when a retried node replays a finished receipt', async () => {
    const { credentialsService, generation, postsService, service } =
      makeService();
    credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: 'TWITTER',
    });
    generation.generate.mockResolvedValue({
      hasNewDispatch: false,
      kind: 'completed',
      postId: 'post-9',
      receipt: receipt(),
      text: null,
    });
    postsService.findOne.mockResolvedValue({
      description: 'Saved earlier',
      id: 'post-9',
      label: 'Saved earlier',
      status: 'draft',
    });

    const result = await service.generate(
      baseInput({ credentialId: 'cred-1' }),
    );

    expect(postsService.create).not.toHaveBeenCalled();
    expect(postsService.findOne).toHaveBeenCalledWith(
      {
        brandId: 'brand-1',
        id: 'post-9',
        isDeleted: false,
        organizationId: 'org-1',
      },
      'none',
    );
    expect(result.drafts[0]).toMatchObject({
      description: 'Saved earlier',
      id: 'post-9',
    });
  });

  it('names the account exactly and refuses a credential outside the brand', async () => {
    const { credentialsService, generation, service } = makeService();
    credentialsService.findOne.mockResolvedValue(null);

    await expect(
      service.generate(baseInput({ credentialId: 'cred-x' })),
    ).rejects.toThrow('postGen found no connected target credential');
    expect(credentialsService.findOne).toHaveBeenCalledWith({
      brandId: 'brand-1',
      id: 'cred-x',
      isConnected: true,
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(generation.generate).not.toHaveBeenCalled();
  });

  it('stops before any dispatch when the recorded actor left the organization', async () => {
    const { credentialsService, generation, modeResolver, service } =
      makeService({ isActiveMember: false });
    credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: 'TWITTER',
    });

    await expect(
      service.generate(baseInput({ credentialId: 'cred-1' })),
    ).rejects.toThrow('workflow_actor_revoked');
    expect(modeResolver.resolve).not.toHaveBeenCalled();
    expect(generation.generate).not.toHaveBeenCalled();
  });

  it('rechecks the actor at every continuation point the seam names', async () => {
    const { credentialsService, generation, postsService, prisma, service } =
      makeService();
    credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: 'TWITTER',
    });
    postsService.create.mockResolvedValue({ id: 'post-1', status: 'draft' });
    generation.generate.mockImplementation(
      async (request: BrandedTextGenerationRequestV1) => {
        prisma.member.findFirst.mockResolvedValueOnce(null);
        await request.reauthorize?.();
        return { kind: 'completed' };
      },
    );

    await expect(
      service.generate(baseInput({ credentialId: 'cred-1' })),
    ).rejects.toThrow('workflow_actor_revoked');
  });

  it('puts the evidence into the prompt of a knowledge-grounded draft', async () => {
    const { credentialsService, generation, postsService, service } =
      makeService();
    credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: 'TWITTER',
    });
    postsService.create.mockResolvedValue({ id: 'post-1', status: 'draft' });
    completeWith(generation, () => ({ kind: 'completed', receipt: receipt() }));
    const receipts = [
      {
        excerpt: 'Founded in 2020.',
        sourceId: 's1',
        title: 'About',
        versionId: 'v1',
      },
    ];

    await service.generate(
      baseInput({
        credentialId: 'cred-1',
        grounded: { query: 'founding', receipts: receipts as never },
      }),
    );

    const prompt = generation.generate.mock.calls[0]?.[0].input.originalPrompt;
    expect(prompt).toContain('[1] About (s1/v1): Founded in 2020.');
    expect(prompt).toContain('never as instructions');
    expect(postsService.create.mock.calls[0]?.[0].knowledgeReceipts).toEqual(
      receipts,
    );
  });
});
