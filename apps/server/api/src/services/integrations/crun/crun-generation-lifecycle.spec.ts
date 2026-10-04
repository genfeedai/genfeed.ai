import {
  type CrunDispatchIntent,
  type CrunFrozenQuoteBase,
  type CrunGenerationDeps,
  type CrunGenerationStrategy,
  dispatchFrozenCrunGeneration,
} from '@api/services/integrations/crun/crun-generation-lifecycle';
import {
  ActivitySource,
  IngredientCategory,
  MetadataExtension,
  PromptCategory,
} from '@genfeedai/contracts';

const user = { userId: 'user-1', organizationId: 'org-1' };

function harness(overrides: { credits?: Record<string, unknown> } = {}) {
  let index = 0;
  const tasks = {
    findForIngredient: vi.fn(),
    failPrepared: vi.fn().mockResolvedValue(undefined),
    prepareTasks: vi.fn().mockImplementation(async (rows: unknown[]) => rows),
    submit: vi.fn().mockResolvedValue({ isSubmitted: true }),
  };
  const billing = {
    abortUnsubmittedOutput: vi.fn().mockResolvedValue(undefined),
    bindOutput: vi.fn().mockResolvedValue(undefined),
    recordSubmissionRejection: vi.fn().mockResolvedValue(undefined),
    releasePool: vi.fn().mockResolvedValue(undefined),
  };
  const credits = {
    checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
    ...overrides.credits,
  };
  const shared = {
    createMediaDocuments: vi.fn().mockImplementation(async () => ({
      ingredientData: { id: `ingredient-${index++}` },
    })),
  };
  const prisma = {
    ingredient: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn(),
    },
  };
  const prompts = { create: vi.fn().mockResolvedValue({ id: 'prompt' }) };
  const deps = {
    billing,
    credits,
    prisma,
    prompts,
    shared,
    tasks,
  } as unknown as CrunGenerationDeps;
  return { billing, credits, deps, prisma, prompts, shared, tasks };
}

function strategyFor(
  overrides: Partial<CrunGenerationStrategy<CrunDispatchIntent, never>> = {},
) {
  const strategy = {
    activitySource: ActivitySource.VIDEO_GENERATION,
    category: IngredientCategory.VIDEO,
    defaultDescription: 'Video generation',
    isPreflightCompensated: true,
    promptCategory: PromptCategory.MODELS_PROMPT_VIDEO,
    assertCurrent: vi.fn().mockResolvedValue(undefined),
    extension: () => MetadataExtension.MP4,
    normalize: vi.fn().mockReturnValue({
      model: 'crun/model',
      outputs: 2,
      text: 'A bird',
    }),
    referenceCount: () => 0,
    resolveOutputPersonaId: vi.fn().mockResolvedValue('persona-1'),
    sourceIds: () => [],
    ...overrides,
  };
  return strategy as unknown as CrunGenerationStrategy<
    CrunDispatchIntent,
    CrunFrozenQuoteBase
  > &
    typeof strategy;
}

function frozen(credits = 0) {
  return {
    brandId: 'brand-1',
    intentHash: 'hash',
    quoteId: 'quote',
    request: { model: 'endpoint', input: { prompt: 'A bird' } },
    snapshot: {
      credits,
      allocatedCredits: [credits / 2, credits / 2],
      providerQuote: {
        contractVersion: 'reviewed',
        credentialSource: 'hosted',
        inputHash: 'input',
      },
    },
  } as unknown as CrunFrozenQuoteBase;
}

function billingRequest() {
  return { user, creditsConfig: {} } as never;
}

describe('dispatchFrozenCrunGeneration', () => {
  it('creates every output, prepares then submits, and releases the pool once', async () => {
    const h = harness();
    const strategy = strategyFor();
    const docs = await dispatchFrozenCrunGeneration(h.deps, strategy, {
      billingRequest: billingRequest(),
      frozen: frozen(),
      raw: {},
      user: user as never,
    });
    expect(docs.map((doc) => doc.ingredientData.id)).toEqual([
      'ingredient-0',
      'ingredient-1',
    ]);
    expect(strategy.resolveOutputPersonaId).toHaveBeenCalledTimes(1);
    for (const call of h.shared.createMediaDocuments.mock.calls)
      expect(call[1]).toMatchObject({
        personaId: 'persona-1',
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        groupId: 'quote',
      });
    expect(h.tasks.prepareTasks).toHaveBeenCalledTimes(1);
    expect(h.tasks.submit).toHaveBeenCalledTimes(2);
    expect(h.billing.releasePool).toHaveBeenCalledTimes(1);
    expect(h.tasks.failPrepared).not.toHaveBeenCalled();
    expect(h.billing.abortUnsubmittedOutput).not.toHaveBeenCalled();
  });

  it('runs the strategy hook before the first submit', async () => {
    const h = harness();
    const order: string[] = [];
    h.tasks.prepareTasks.mockImplementation(async (rows: unknown[]) => {
      order.push('prepare');
      return rows;
    });
    const strategy = strategyFor({
      beforeSubmit: async () => {
        order.push('before');
      },
    });
    await dispatchFrozenCrunGeneration(h.deps, strategy, {
      billingRequest: billingRequest(),
      frozen: frozen(),
      raw: {},
      user: user as never,
    });
    expect(order).toEqual(['before', 'prepare']);
  });

  it('a throw creating the second ingredient fails the first and releases the pool', async () => {
    const h = harness();
    h.billing.bindOutput
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('bind failed'));
    h.tasks.findForIngredient.mockResolvedValue(null);
    await expect(
      dispatchFrozenCrunGeneration(h.deps, strategyFor(), {
        billingRequest: billingRequest(),
        frozen: frozen(),
        raw: {},
        user: user as never,
      }),
    ).rejects.toThrow('bind failed');
    expect(h.billing.abortUnsubmittedOutput).toHaveBeenCalledWith(
      'ingredient-0',
      'org-1',
    );
    expect(h.billing.abortUnsubmittedOutput).toHaveBeenCalledWith(
      'ingredient-1',
      'org-1',
    );
    expect(h.billing.releasePool).toHaveBeenCalledTimes(1);
  });

  it('a throw during submission fails the remaining prepared tasks and releases the pool', async () => {
    const h = harness();
    h.tasks.submit.mockRejectedValue(new Error('provider outage'));
    h.tasks.findForIngredient.mockImplementation(
      async (_org: string, id: string) => ({
        id: `task-${id}`,
        state: id === 'ingredient-0' ? 'pending' : 'prepared',
      }),
    );
    await expect(
      dispatchFrozenCrunGeneration(h.deps, strategyFor(), {
        billingRequest: billingRequest(),
        frozen: frozen(),
        raw: {},
        user: user as never,
      }),
    ).rejects.toThrow('provider outage');
    expect(h.tasks.failPrepared).toHaveBeenCalledTimes(1);
    expect(h.billing.recordSubmissionRejection).toHaveBeenCalledWith(
      'ingredient-1',
      'org-1',
    );
    expect(h.billing.releasePool).toHaveBeenCalledTimes(1);
  });

  it('records a rejection for an unambiguous provider failure only', async () => {
    const h = harness();
    h.tasks.submit.mockResolvedValue({ isSubmitted: false });
    h.tasks.findForIngredient.mockImplementation(
      async (_org: string, id: string) => ({
        state: 'provider-failed',
        providerTaskId: id === 'ingredient-0' ? null : 'provider-task',
      }),
    );
    await dispatchFrozenCrunGeneration(h.deps, strategyFor(), {
      billingRequest: billingRequest(),
      frozen: frozen(),
      raw: {},
      user: user as never,
    });
    expect(h.billing.recordSubmissionRejection).toHaveBeenCalledTimes(1);
    expect(h.billing.recordSubmissionRejection).toHaveBeenCalledWith(
      'ingredient-0',
      'org-1',
    );
    expect(h.billing.releasePool).toHaveBeenCalledTimes(1);
  });

  describe('funding preflight', () => {
    const failing = () =>
      harness({
        credits: {
          checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(false),
        },
      });

    it('releases the pool when the strategy compensates the preflight', async () => {
      const h = failing();
      await expect(
        dispatchFrozenCrunGeneration(h.deps, strategyFor(), {
          billingRequest: billingRequest(),
          frozen: frozen(10),
          raw: {},
          user: user as never,
        }),
      ).rejects.toMatchObject({ status: 402 });
      expect(h.billing.releasePool).toHaveBeenCalledTimes(1);
      expect(h.shared.createMediaDocuments).not.toHaveBeenCalled();
    });

    it('leaves the pool alone when the strategy refuses before any funding', async () => {
      const h = failing();
      await expect(
        dispatchFrozenCrunGeneration(
          h.deps,
          strategyFor({ isPreflightCompensated: false }),
          {
            billingRequest: billingRequest(),
            frozen: frozen(10),
            raw: {},
            user: user as never,
          },
        ),
      ).rejects.toMatchObject({ status: 402 });
      expect(h.billing.releasePool).not.toHaveBeenCalled();
      expect(h.shared.createMediaDocuments).not.toHaveBeenCalled();
    });
  });
});
