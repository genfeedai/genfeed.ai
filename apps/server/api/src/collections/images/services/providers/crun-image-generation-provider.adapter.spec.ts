import { CrunImageGenerationProviderAdapter } from '@api/collections/images/services/providers/crun-image-generation-provider.adapter';

const user = { userId: 'user', organizationId: 'org', brandId: 'brand' };
const dto = {
  model: 'crun/google/nano-banana-pro',
  text: 'Bird',
  outputs: 4,
  crunControls: { contractVersion: 'reviewed' },
  crunQuoteId: 'quote',
};
function fixture() {
  const frozen = {
    quoteId: 'quote',
    brandId: 'brand',
    intentHash: 'a'.repeat(64),
    request: {
      model: 'google/nano-banana-pro',
      input: { prompt: 'Frozen effective prompt', output_format: 'png' },
    },
    snapshot: {
      credits: 0,
      allocatedCredits: [0, 0, 0, 0],
      providerQuote: {
        credentialSource: 'hosted',
        credentialId: null,
        credentialFingerprint: 'b'.repeat(64),
        contractVersion: 'reviewed',
        inputHash: 'c'.repeat(64),
      },
    },
  };
  const preview = {
    preview: vi.fn(),
    consume: vi.fn().mockResolvedValue({ kind: 'fresh', quote: frozen }),
    assertCurrent: vi.fn(),
  };
  const input = {
    normalize: vi.fn().mockReturnValue(dto),
    resolveOutputPersonaId: vi.fn().mockResolvedValue('persona-1'),
  };
  const tasks = {
    prepareTasks: vi.fn().mockImplementation(async (rows) => rows),
    submit: vi.fn().mockResolvedValue({ isSubmitted: true, taskId: 'opaque' }),
    findForIngredient: vi.fn().mockResolvedValue(null),
    failPrepared: vi.fn().mockResolvedValue(undefined),
  };
  const billing = {
    recordSubmissionRejection: vi.fn(),
    abortUnsubmittedOutput: vi.fn(),
    bindOutput: vi.fn(),
    releasePool: vi.fn(),
  };
  const credits = { reserveCredits: vi.fn() };
  let index = 0;
  const shared = {
    createMediaDocuments: vi.fn().mockImplementation(async () => ({
      ingredientData: { id: `ingredient-${index++}` },
    })),
  };
  const prompts = { create: vi.fn().mockResolvedValue({ id: 'prompt' }) };
  const images = { findOne: vi.fn().mockResolvedValue({ id: 'ingredient-0' }) };
  const prisma = {
    ingredient: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const adapter = new CrunImageGenerationProviderAdapter(
    preview as never,
    input as never,
    tasks as never,
    billing as never,
    credits as never,
    shared as never,
    prompts as never,
    images as never,
    prisma as never,
    { open: vi.fn(), recordAccepted: vi.fn() } as never,
  );
  const request = { user, originalUrl: '/images' };
  return {
    adapter,
    preview,
    tasks,
    billing,
    shared,
    prompts,
    credits,
    prisma,
    request,
    frozen,
  };
}
describe('Crun image admission batch', () => {
  it('prepares every bound durable row before the first create and returns all four IDs', async () => {
    const f = fixture();
    const response = await f.adapter.generateQuoted(
      user as never,
      dto as never,
      f.request as never,
    );
    expect(response.data).toMatchObject({
      id: 'ingredient-0',
      attributes: {
        pendingIngredientIds: [
          'ingredient-0',
          'ingredient-1',
          'ingredient-2',
          'ingredient-3',
        ],
      },
    });
    expect(f.preview.consume).toHaveBeenCalledTimes(1);
    expect(f.preview.preview).not.toHaveBeenCalled();
    expect(f.tasks.prepareTasks).toHaveBeenCalledTimes(1);
    const rows = f.tasks.prepareTasks.mock.calls[0][0];
    expect(rows).toHaveLength(4);
    expect(rows.map((row: { outputIndex: number }) => row.outputIndex)).toEqual(
      [0, 1, 2, 3],
    );
    for (const row of rows)
      expect(row).toMatchObject({
        reservationId: null,
        fundingBinding: { kind: 'free' },
        inputMetadata: { intentHash: f.frozen.intentHash },
      });
    expect(f.tasks.submit).toHaveBeenCalledTimes(4);
    expect(f.tasks.prepareTasks.mock.invocationCallOrder[0]).toBeLessThan(
      f.tasks.submit.mock.invocationCallOrder[0],
    );
    expect(f.billing.bindOutput.mock.invocationCallOrder[3]).toBeLessThan(
      f.tasks.submit.mock.invocationCallOrder[0],
    );
    for (const call of f.tasks.submit.mock.calls)
      expect(call[1]).toBe(f.frozen.request);
    for (const call of f.shared.createMediaDocuments.mock.calls)
      expect(call[1]).toMatchObject({
        generationPrompt: 'Frozen effective prompt',
        groupId: 'quote',
        personaId: 'persona-1',
      });
    expect(f.credits.reserveCredits).not.toHaveBeenCalled();
  });
  it('replay returns all IDs without reserving, creating placeholders, prompts or provider tasks', async () => {
    const f = fixture();
    const ingredientIds = [
      'ingredient-0',
      'ingredient-1',
      'ingredient-2',
      'ingredient-3',
    ];
    f.preview.consume.mockResolvedValue({ kind: 'replay', ingredientIds });
    const response = await f.adapter.generateQuoted(
      user as never,
      dto as never,
      f.request as never,
    );
    expect(response.data).toMatchObject({
      attributes: { pendingIngredientIds: ingredientIds },
    });
    expect(f.tasks.prepareTasks).not.toHaveBeenCalled();
    expect(f.tasks.submit).not.toHaveBeenCalled();
    expect(f.shared.createMediaDocuments).not.toHaveBeenCalled();
    expect(f.prompts.create).not.toHaveBeenCalled();
    expect(f.credits.reserveCredits).not.toHaveBeenCalled();
  });
  it('a failed all-row preparation sends no provider create', async () => {
    const f = fixture();
    f.tasks.prepareTasks.mockRejectedValue(new Error('binding rejected'));
    await expect(
      f.adapter.generateQuoted(user as never, dto as never, f.request as never),
    ).rejects.toThrow('binding rejected');
    expect(f.tasks.submit).not.toHaveBeenCalled();
  });
  describe('compensation after a mid-dispatch failure', () => {
    it('a throw creating the second ingredient fails the first and releases the pool', async () => {
      const f = fixture();
      f.shared.createMediaDocuments
        .mockResolvedValueOnce({ ingredientData: { id: 'ingredient-0' } })
        .mockRejectedValueOnce(new Error('create failed'));
      await expect(
        f.adapter.generateQuoted(
          user as never,
          dto as never,
          f.request as never,
        ),
      ).rejects.toThrow('create failed');
      expect(f.billing.abortUnsubmittedOutput.mock.calls).toEqual([
        ['ingredient-0', 'org'],
      ]);
      expect(f.billing.releasePool).toHaveBeenCalledTimes(1);
      expect(f.tasks.prepareTasks).not.toHaveBeenCalled();
      expect(f.tasks.submit).not.toHaveBeenCalled();
    });
    it('a throw during preparation fails every created ingredient and releases the pool', async () => {
      const f = fixture();
      f.tasks.prepareTasks.mockRejectedValue(new Error('binding rejected'));
      await expect(
        f.adapter.generateQuoted(
          user as never,
          dto as never,
          f.request as never,
        ),
      ).rejects.toThrow('binding rejected');
      expect(
        f.billing.abortUnsubmittedOutput.mock.calls.map((call) => call[0]),
      ).toEqual([
        'ingredient-0',
        'ingredient-1',
        'ingredient-2',
        'ingredient-3',
      ]);
      expect(f.billing.releasePool).toHaveBeenCalledTimes(1);
    });
    it('a throw during the second submission fails the remaining prepared tasks and releases the pool', async () => {
      const f = fixture();
      const states = new Map<string, string>();
      f.tasks.prepareTasks.mockImplementation(
        async (rows: { ingredientId: string }[]) =>
          rows.map((row) => {
            states.set(row.ingredientId, 'prepared');
            return {
              ...row,
              id: `task-${row.ingredientId}`,
              state: 'prepared',
            };
          }),
      );
      f.tasks.findForIngredient.mockImplementation(
        async (_org: string, id: string) => ({
          id: `task-${id}`,
          state: states.get(id),
        }),
      );
      f.tasks.submit
        .mockImplementationOnce(async (task: { ingredientId: string }) => {
          states.set(task.ingredientId, 'pending');
          return { isSubmitted: true, taskId: 'opaque' };
        })
        .mockRejectedValueOnce(new Error('provider outage'));
      await expect(
        f.adapter.generateQuoted(
          user as never,
          dto as never,
          f.request as never,
        ),
      ).rejects.toThrow('provider outage');
      expect(f.tasks.failPrepared).toHaveBeenCalledTimes(3);
      expect(
        f.billing.recordSubmissionRejection.mock.calls.map((call) => call[0]),
      ).toEqual(['ingredient-1', 'ingredient-2', 'ingredient-3']);
      expect(f.billing.abortUnsubmittedOutput).not.toHaveBeenCalled();
      expect(f.billing.releasePool).toHaveBeenCalledTimes(1);
    });
    it('does not compensate the success path', async () => {
      const f = fixture();
      await f.adapter.generateQuoted(
        user as never,
        dto as never,
        f.request as never,
      );
      expect(f.tasks.failPrepared).not.toHaveBeenCalled();
      expect(f.billing.abortUnsubmittedOutput).not.toHaveBeenCalled();
      expect(f.billing.recordSubmissionRejection).not.toHaveBeenCalled();
      expect(f.billing.releasePool).toHaveBeenCalledTimes(1);
    });
  });
  it.each(['approvedRemixQuoteId', 'approvedImageQuote'])(
    'rejects approved caller budgets without consuming or funding: %s',
    async (field) => {
      const f = fixture();
      const request = {
        ...f.request,
        ...(field === 'approvedRemixQuoteId'
          ? { approvedRemixQuoteId: 'approved' }
          : { creditsConfig: { approvedImageQuote: { model: dto.model } } }),
      };
      await expect(
        f.adapter.generateQuoted(user as never, dto as never, request as never),
      ).rejects.toMatchObject({
        response: { code: 'CRUN_BILLING_UNSUPPORTED' },
      });
      expect(f.preview.consume).not.toHaveBeenCalled();
      expect(f.tasks.submit).not.toHaveBeenCalled();
      expect(f.shared.createMediaDocuments).not.toHaveBeenCalled();
    },
  );
  it('requires persisted provenance when original differs, before consuming quote', async () => {
    const f = fixture();
    await expect(
      f.adapter.generateQuoted(
        user as never,
        dto as never,
        { ...f.request, generationOriginalPrompt: 'Original idea' } as never,
      ),
    ).rejects.toMatchObject({
      response: { code: 'CRUN_ENHANCEMENT_REQUIRED' },
    });
    expect(f.preview.consume).not.toHaveBeenCalled();
    expect(f.prompts.create).not.toHaveBeenCalled();
  });
});
