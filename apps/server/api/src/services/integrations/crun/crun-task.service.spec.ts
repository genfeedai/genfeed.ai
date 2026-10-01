import { createHash } from 'node:crypto';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import type { ByokService } from '@api/services/byok/byok.service';
import type { CrunClient } from '@api/services/integrations/crun/crun-client.service';
import { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory } from '@genfeedai/contracts';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import type { CrunGenerationTask } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';

function task(overrides: Partial<CrunGenerationTask> = {}): CrunGenerationTask {
  const result = quoteModelBillablePricing(
    billableProfile({
      key: 'crun/google/nano-banana-pro',
      provider: 'crun',
      isFree: true,
      cost: 0,
    }),
    {
      modelKey: 'crun/google/nano-banana-pro',
      provider: 'crun',
      outputs: 1,
      requests: 1,
    },
    1,
    new Date().toISOString(),
  );
  if (result.status !== 'priced') throw new Error('Fixture quote invalid');
  const fingerprint = createHash('sha256')
    .update('fixture-hosted-key')
    .digest('hex');
  return {
    reservationId: null,
    fundingBinding: { kind: 'free' },
    userId: 'user-1',
    modelKey: 'crun/google/nano-banana-pro',
    endpoint: 'google/nano-banana-pro',
    contractVersion: 'version-1',
    inputHash: 'a'.repeat(64),
    quoteSnapshot: {
      ...result.snapshot,
      providerQuote: {
        provider: 'crun',
        estimated: false,
        providerCreditsPerTask: '8',
        quoteHash: 'b'.repeat(64),
        inputHash: 'a'.repeat(64),
        contractVersion: 'version-1',
        creditsPerUsd: '1000',
        acquisitionRateVersion: 'fixture-rate',
        credentialSource: 'hosted',
        credentialId: null,
        credentialFingerprint: fingerprint,
      },
    },
    id: 'task-1',
    organizationId: 'org-1',
    ingredientId: 'image-1',
    credentialSource: 'hosted',
    credentialId: null,
    credentialFingerprint: createHash('sha256')
      .update('fixture-hosted-key')
      .digest('hex'),
    providerTaskId: 'known',
    state: 'pending',
    version: 0,
    isDeleted: false,
    ...overrides,
  } as CrunGenerationTask;
}

describe('Crun durable credential and lease boundaries', () => {
  const lookup = vi.fn();
  const retained = vi.fn();
  const updateMany = vi.fn();
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const transaction = {
    crunGenerationTask: { updateMany, findFirst, findMany },
    ingredient: {
      findFirst: vi.fn().mockResolvedValue({
        category: IngredientCategory.IMAGE,
        generationBilling: null,
      }),
    },
  };
  const get = vi.fn();
  const createTask = vi.fn();
  const taskInfo = vi.fn();
  const modelFind = vi.fn();
  let service: CrunTaskService;

  beforeEach(() => {
    vi.clearAllMocks();
    transaction.ingredient.findFirst.mockResolvedValue({
      category: IngredientCategory.IMAGE,
      generationBilling: null,
    });
    lookup.mockResolvedValue(undefined);
    retained.mockResolvedValue(undefined);
    findFirst.mockResolvedValue(task());
    get.mockImplementation((key: string) =>
      key === 'CRUN_API_KEY' ? 'fixture-hosted-key' : 'false',
    );
    service = new CrunTaskService(
      {
        ...transaction,
        model: { findFirst: modelFind },
        $transaction: async (callback: (tx: typeof transaction) => unknown) =>
          callback(transaction),
      } as unknown as PrismaService,
      {
        lookupApiKey: lookup,
        lookupRetainedCrunApiKey: retained,
      } as unknown as ByokService,
      { get } as unknown as ConfigService,
      { createTask, taskInfo } as unknown as CrunClient,
    );
  });

  it('drains accepted hosted tasks when new admission is disabled', async () => {
    expect(service.isAdmissionEnabled()).toBe(false);
    expect(await service.resolveOriginalCredential(task())).toMatchObject({
      credentialSource: 'hosted',
      credentialId: null,
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('drains retained disabled/re-encrypted BYOK plaintext while new submission stays blocked', async () => {
    const frozen = task({
      credentialSource: 'byok',
      credentialId: null,
      credentialFingerprint: createHash('sha256')
        .update('fixture-byok-key')
        .digest('hex'),
    });
    findFirst.mockResolvedValue(frozen);
    retained.mockResolvedValue({ apiKey: 'fixture-byok-key' });
    expect(await service.resolveOriginalCredential(frozen)).toMatchObject({
      credentialSource: 'byok',
      credentialId: null,
    });
    expect(await service.resolveSubmissionCredential(frozen)).toBeNull();
    expect(lookup).toHaveBeenCalledWith('org-1', 'crun');
    expect(get).not.toHaveBeenCalled();
  });
  it.each(['deleted', 'rotated', 'unreadable'])(
    'recovers %s retained key without hosted fallback',
    async (cause) => {
      const frozen = task({
        credentialSource: 'byok',
        credentialId: null,
        credentialFingerprint: createHash('sha256')
          .update('fixture-byok-key')
          .digest('hex'),
      });
      findFirst.mockResolvedValue(frozen);
      if (cause === 'unreadable')
        retained.mockRejectedValue(new Error('fixture decrypt failure'));
      else
        retained.mockResolvedValue(
          cause === 'rotated' ? { apiKey: 'rotated-key' } : undefined,
        );
      expect(await service.resolveOriginalCredential(frozen)).toBeNull();
      expect(get).not.toHaveBeenCalled();
    },
  );
  it.each(['prepared', 'submitting', 'finalized'])(
    'denies retained bypass in %s state',
    async (state) => {
      const frozen = task({ state });
      findFirst.mockResolvedValue(frozen);
      expect(await service.resolveOriginalCredential(frozen)).toBeNull();
      expect(retained).not.toHaveBeenCalled();
    },
  );
  it('denies wrong durable identity, missing task ID, and rotated hosted key', async () => {
    findFirst.mockResolvedValue(null);
    expect(await service.resolveOriginalCredential(task())).toBeNull();
    findFirst.mockResolvedValue(task({ credentialFingerprint: 'foreign' }));
    expect(await service.resolveOriginalCredential(task())).toBeNull();
    findFirst.mockResolvedValue(task({ providerTaskId: null }));
    expect(await service.resolveOriginalCredential(task())).toBeNull();
    findFirst.mockResolvedValue(task());
    get.mockReturnValue('rotated-key');
    expect(await service.resolveOriginalCredential(task())).toBeNull();
  });
  it('re-enters the task tenant for receipt lookups', async () => {
    await service.findForIngredient('org-1', 'image-1');
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        ingredientId: 'image-1',
        isDeleted: false,
      },
    });
  });

  it('claims bounded due rows transactionally through 60-second versioned leases', async () => {
    const now = new Date('2026-10-01T00:00:00Z');
    findMany.mockResolvedValue([
      task(),
      task({ id: 'task-2', organizationId: 'org-2' }),
    ]);
    updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const claimed = await service.claimDue(now);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      version: 1,
      leaseUntil: new Date(now.getTime() + 60000),
    });
    expect(findMany.mock.calls[0][0]).toMatchObject({
      take: 100,
      where: { isDeleted: false, nextPollAt: { lte: now } },
    });
    expect(updateMany.mock.calls[0][0].where).toMatchObject({
      id: 'task-1',
      organizationId: 'org-1',
      isDeleted: false,
      version: 0,
    });
    expect(updateMany.mock.calls[1][0].where.organizationId).toBe('org-2');
  });

  it('records cancellation intent without pretending to cancel or releasing funding', async () => {
    const now = new Date();
    await service.requestCancellation('org-1', 'image-1', now);
    expect(updateMany).toHaveBeenCalledWith({
      data: { cancelRequestedAt: now },
      where: {
        organizationId: 'org-1',
        ingredientId: 'image-1',
        isDeleted: false,
        state: { not: 'finalized' },
      },
    });
  });
  it('atomic prepared claim precedes the one request and acceptance persistence', async () => {
    get.mockImplementation((key: string) =>
      key === 'CRUN_ENABLED' ? 'true' : 'fixture-hosted-key',
    );
    modelFind.mockResolvedValue({ id: 'model-1' });
    updateMany.mockResolvedValue({ count: 1 });
    createTask.mockImplementation(async () => {
      expect(updateMany.mock.calls[0][0].data.state).toBe('submitting');
      return { isValid: true, data: { taskId: 'opaque-ID' } };
    });
    const prepared = task({
      state: 'prepared',
      endpoint: 'google/nano-banana-pro',
    });
    findFirst.mockResolvedValue(prepared);
    expect(
      await service.submit(prepared, {
        model: prepared.endpoint,
        input: { prompt: 'fixture' },
      }),
    ).toEqual({ isSubmitted: true, taskId: 'opaque-ID' });
    expect(updateMany.mock.calls[1][0].data).toMatchObject({
      providerTaskId: 'opaque-ID',
      state: 'pending',
    });
    updateMany.mockResolvedValueOnce({ count: 0 });
    await service.submit(prepared, {
      model: prepared.endpoint,
      input: { prompt: 'fixture' },
    });
    expect(createTask).toHaveBeenCalledTimes(1);
  });
  it('recovers submitting-without-ID after restart without CreateTask', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue(
      task({ state: 'submitting', providerTaskId: null }),
    );
    await service.poll(task({ state: 'submitting', providerTaskId: null }));
    expect(updateMany.mock.calls[0][0].data).toMatchObject({
      state: 'recovery-required',
      recoveryCode: 'CRUN_ACCEPTANCE_AMBIGUOUS',
    });
    expect(createTask).not.toHaveBeenCalled();
    expect(taskInfo).not.toHaveBeenCalled();
  });
  it('keeps sanitized receipt durable while media URLs remain ephemeral', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const info = {
      taskId: 'known',
      provider: 'google',
      modelVersion: 'upstream-v1',
      status: 'success',
      credits: '8',
      createdAtSeconds: 1,
      mediaCount: 1,
      mediaUrls: ['https://fixture.test/image?private=secret'],
      recoveryCode: null,
    };
    taskInfo.mockResolvedValue({ isValid: true, data: info });
    findFirst.mockResolvedValue(task({ providerTaskId: 'known' }));
    expect(
      await service.poll(
        task({
          providerTaskId: 'known',
          deadlineAt: new Date(Date.now() + 60000),
          pollCount: 0,
        }),
      ),
    ).toMatchObject({ info, task: { providerTaskId: 'known' } });
    const persisted = updateMany.mock.calls[0][0].data.terminalReceipt;
    expect(persisted).toMatchObject({ credits: '8', mediaCount: 1 });
    expect(JSON.stringify(persisted)).not.toContain('private');
    expect(persisted).not.toHaveProperty('mediaUrls');
  });
  it('bounds consecutive known-task 404s without changing provider identity', async () => {
    findFirst.mockResolvedValue(task({ providerTaskId: 'known' }));
    updateMany.mockResolvedValue({ count: 1 });
    taskInfo.mockResolvedValue({
      isValid: false,
      reasonCode: 'CRUN_TASK_NOT_FOUND',
      disposition: 'deferred',
      retryAfterMs: 30000,
    });
    await service.poll(
      task({
        providerTaskId: 'known',
        deadlineAt: new Date(Date.now() + 60000),
        pollCount: 2,
        failureCode: 'CRUN_TASK_NOT_FOUND_2',
      }),
    );
    expect(updateMany.mock.calls[0][0].data).toMatchObject({
      state: 'recovery-required',
      recoveryCode: 'CRUN_TASK_NOT_FOUND',
    });
    expect(createTask).not.toHaveBeenCalled();
  });
  it('caps a long status Retry-After at the frozen polling deadline', async () => {
    const now = new Date();
    const deadlineAt = new Date(now.getTime() + 45000);
    const claimed = task({ providerTaskId: 'known', deadlineAt, pollCount: 0 });
    findFirst.mockResolvedValue(claimed);
    updateMany.mockResolvedValue({ count: 1 });
    taskInfo.mockResolvedValue({
      isValid: false,
      disposition: 'deferred',
      reasonCode: 'CRUN_RATE_LIMITED',
      retryAfterMs: 3600000,
    });
    await service.poll(claimed, now);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextPollAt: deadlineAt,
          leaseUntil: null,
        }),
      }),
    );
    expect(createTask).not.toHaveBeenCalled();
  });
});
