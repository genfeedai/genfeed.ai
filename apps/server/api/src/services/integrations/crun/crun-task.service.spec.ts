import { createHash } from 'node:crypto';
import type { ByokService } from '@api/services/byok/byok.service';
import type { CrunClient } from '@api/services/integrations/crun/crun-client.service';
import { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { CrunGenerationTask } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';

function task(overrides: Partial<CrunGenerationTask> = {}): CrunGenerationTask {
  return {
    id: 'task-1',
    organizationId: 'org-1',
    ingredientId: 'image-1',
    credentialSource: 'hosted',
    credentialId: null,
    credentialFingerprint: createHash('sha256')
      .update('fixture-hosted-key')
      .digest('hex'),
    state: 'pending',
    version: 0,
    isDeleted: false,
    ...overrides,
  } as CrunGenerationTask;
}

describe('Crun durable credential and lease boundaries', () => {
  const lookup = vi.fn();
  const updateMany = vi.fn();
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const transaction = {
    crunGenerationTask: { updateMany, findFirst, findMany },
  };
  const get = vi.fn();
  const createTask = vi.fn();
  const taskInfo = vi.fn();
  const modelFind = vi.fn();
  let service: CrunTaskService;

  beforeEach(() => {
    vi.clearAllMocks();
    lookup.mockResolvedValue(undefined);
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
      { lookupApiKeyWithIdentity: lookup } as unknown as ByokService,
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

  it('retains frozen BYOK identity and never substitutes a hosted key after deletion', async () => {
    const frozen = task({
      credentialSource: 'byok',
      credentialId: 'key-version-1',
      credentialFingerprint: createHash('sha256')
        .update('fixture-byok-key')
        .digest('hex'),
    });
    lookup
      .mockResolvedValueOnce({
        apiKey: 'fixture-byok-key',
        credentialId: 'key-version-1',
      })
      .mockResolvedValueOnce(undefined);
    expect(await service.resolveOriginalCredential(frozen)).toMatchObject({
      credentialSource: 'byok',
      credentialId: 'key-version-1',
    });
    expect(await service.resolveOriginalCredential(frozen)).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('refuses rotated credentials or same plaintext in a new encrypted credential identity', async () => {
    lookup.mockResolvedValue({
      apiKey: 'fixture-byok-key',
      credentialId: 'key-version-2',
    });
    expect(
      await service.resolveOriginalCredential(
        task({
          credentialSource: 'byok',
          credentialId: 'key-version-1',
          credentialFingerprint: createHash('sha256')
            .update('fixture-byok-key')
            .digest('hex'),
        }),
      ),
    ).toBeNull();
    get.mockReturnValue('rotated-platform-key');
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
    expect(
      await service.poll(
        task({
          providerTaskId: 'known',
          deadlineAt: new Date(Date.now() + 60000),
          pollCount: 0,
        }),
      ),
    ).toEqual(info);
    const persisted = updateMany.mock.calls[0][0].data.terminalReceipt;
    expect(persisted).toMatchObject({ credits: '8', mediaCount: 1 });
    expect(JSON.stringify(persisted)).not.toContain('private');
    expect(persisted).not.toHaveProperty('mediaUrls');
  });
  it('bounds consecutive known-task 404s without changing provider identity', async () => {
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
});
