import { agentReportBindings } from '@api/services/agent-reports/agent-report-binding';
import { AgentReportDeliveryService } from '@api/services/agent-reports/agent-report-delivery.service';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const binding = {
    enabled: true,
    brandId: 'brand',
    userId: 'user',
    remoteUserId: 'remote',
    channelId: 'chat',
  };
  const prisma = {
    agentStrategy: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: 'strategy', brandId: 'brand' }),
    },
    orgIntegration: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'integration',
          encryptedToken: 'encrypted',
          config: { agentReportBindings: [binding] },
        },
      ]),
    },
    post: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: 'post', updatedAt: new Date('2026-09-24'), label: 'Draft' },
        ]),
    },
    batchItem: {
      findFirst: vi.fn().mockResolvedValue({ id: 'item', batchId: 'batch' }),
    },
  };
  const http = {
    post: vi
      .fn()
      .mockReturnValue(of({ data: { ok: true, result: { message_id: 42 } } })),
  };
  const cache = { set: vi.fn().mockResolvedValue(true) };
  const access = { canReview: vi.fn().mockResolvedValue(true) };
  const service = new AgentReportDeliveryService(
    prisma as never,
    { decrypt: () => 'secret' } as never,
    cache as never,
    access as never,
    http as never,
  );
  const input = {
    organizationId: 'org',
    userId: 'user',
    channel: 'telegram',
    idempotencyKey: 'delivery',
    payload: {
      executionId: 'run',
      strategyId: 'strategy',
      summary: '1 draft waiting for review.',
    },
  };
  return { service, prisma, cache, http, access, input, binding };
}
describe('opted-in agent report delivery', () => {
  it('requires explicit enabled and complete binding', () => {
    expect(
      agentReportBindings({
        agentReportBindings: [{ enabled: false }, { enabled: true }],
      }),
    ).toEqual([]);
  });
  it('skips unbound and ambiguous channels without provider calls', async () => {
    const f = fixture();
    f.prisma.orgIntegration.findMany.mockResolvedValue([]);
    expect(await f.service.deliver(f.input)).toEqual({
      status: 'skipped',
      reason: 'agent_report_channel_not_opted_in',
    });
    expect(f.http.post).not.toHaveBeenCalled();
  });
  it('binds each button to user, org, channel and draft version', async () => {
    const f = fixture();
    expect(await f.service.deliver(f.input)).toEqual({
      status: 'delivered',
      providerMessageId: '42',
    });
    expect(f.cache.set).toHaveBeenCalledWith(
      expect.stringMatching(/^agent-report-review:[a-f0-9]{32}$/),
      expect.objectContaining({
        organizationId: 'org',
        binding: f.binding,
        postId: 'post',
        postVersion: '2026-09-24T00:00:00.000Z',
      }),
      { ttl: 86400 },
    );
    expect(f.http.post).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        chat_id: 'chat',
        reply_markup: {
          inline_keyboard: [
            [
              expect.objectContaining({
                callback_data: expect.stringMatching(
                  /^agent-review:[a-f0-9]{32}:approve$/,
                ),
              }),
              expect.objectContaining({
                callback_data: expect.stringMatching(/:reject$/),
              }),
            ],
          ],
        },
      }),
      expect.any(Object),
    );
    expect(f.prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          brandId: 'brand',
          agentStrategyId: 'strategy',
          workflowExecutionId: 'run',
          isDeleted: false,
        }),
      }),
    );
  });
  it('skips revoked access and fails closed when tokens cannot persist', async () => {
    const f = fixture();
    f.access.canReview.mockResolvedValue(false);
    expect(await f.service.deliver(f.input)).toEqual({
      status: 'skipped',
      reason: 'agent_report_access_revoked',
    });
    f.access.canReview.mockResolvedValue(true);
    f.cache.set.mockResolvedValue(false);
    await expect(f.service.deliver(f.input)).rejects.toThrow(
      'storage unavailable',
    );
    expect(f.http.post).not.toHaveBeenCalled();
  });
  it('uses Discord components without mentions and a provider nonce', async () => {
    const f = fixture();
    f.http.post.mockReturnValue(of({ data: { id: 'message' } }));
    expect(await f.service.deliver({ ...f.input, channel: 'discord' })).toEqual(
      { status: 'delivered', providerMessageId: 'message' },
    );
    expect(f.http.post).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/chat/messages',
      expect.objectContaining({
        allowed_mentions: { parse: [] },
        enforce_nonce: true,
        components: [expect.objectContaining({ type: 1 })],
      }),
      expect.any(Object),
    );
  });
  it('sanitizes provider failures before durable retry logging', async () => {
    const f = fixture();
    f.http.post.mockReturnValue(
      throwError(() => new Error('url contains botsecret')),
    );
    await expect(f.service.deliver(f.input)).rejects.toThrow(
      /^Agent report provider request failed$/,
    );
  });
});
