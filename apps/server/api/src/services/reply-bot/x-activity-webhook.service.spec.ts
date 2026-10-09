import { XActivityWebhookService } from '@api/services/reply-bot/x-activity-webhook.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PAYLOAD = {
  for_user_id: 'brand-x-id',
  tweet_create_events: ['comment-1', 'comment-2'].map((id) => ({
    id_str: id,
    in_reply_to_status_id_str: 'parent-1',
    text: 'Thanks for this!',
    user: { id_str: 'reader-1', screen_name: 'reader' },
  })),
};

describe('X activity webhook Messages admission', () => {
  const config = { get: vi.fn() };
  const logger = { log: vi.fn(), warn: vi.fn() };
  const prisma = { credential: { findFirst: vi.fn() } };
  const processor = { enqueue: vi.fn() };
  const access = { canStartWork: vi.fn() };
  let service: XActivityWebhookService;

  beforeEach(() => {
    vi.resetAllMocks();
    config.get.mockReturnValue('true');
    prisma.credential.findFirst.mockResolvedValue({
      id: 'credential-1',
      organizationId: 'resolved-org',
      brandId: 'resolved-brand',
    });
    access.canStartWork.mockResolvedValue(true);
    processor.enqueue.mockResolvedValue(undefined);
    service = new XActivityWebhookService(
      config as never,
      logger as never,
      prisma as never,
      processor as never,
      access as never,
    );
  });

  it('counts disabled or unavailable tenants as ignored without queueing replies', async () => {
    access.canStartWork.mockResolvedValue(false);
    await expect(service.handleEventPayload(PAYLOAD)).resolves.toEqual({
      enqueued: 0,
      ignored: 2,
      mode: 'live',
    });
    expect(access.canStartWork).toHaveBeenCalledTimes(2);
    expect(access.canStartWork).toHaveBeenCalledWith(
      'resolved-org',
      'messages',
    );
    expect(processor.enqueue).not.toHaveBeenCalled();
  });

  it('queues eligible replies under the server-resolved organization and brand', async () => {
    await expect(service.handleEventPayload(PAYLOAD)).resolves.toEqual({
      enqueued: 2,
      ignored: 0,
      mode: 'live',
    });
    expect(access.canStartWork).toHaveBeenCalledTimes(2);
    expect(access.canStartWork).toHaveBeenCalledWith(
      'resolved-org',
      'messages',
    );
    expect(processor.enqueue).toHaveBeenCalledTimes(2);
    expect(processor.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        brandId: 'resolved-brand',
        credentialId: 'credential-1',
        organizationId: 'resolved-org',
        commentId: 'comment-1',
        source: 'xaa',
      }),
    );
  });

  it('rechecks access between candidates and ignores later work after revocation', async () => {
    access.canStartWork
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(service.handleEventPayload(PAYLOAD)).resolves.toEqual({
      enqueued: 1,
      ignored: 1,
      mode: 'live',
    });
    expect(processor.enqueue).toHaveBeenCalledOnce();
  });

  it('does no lookup or admission when webhook intake is globally disabled', async () => {
    config.get.mockReturnValue('false');
    await expect(service.handleEventPayload(PAYLOAD)).resolves.toEqual({
      enqueued: 0,
      ignored: 0,
      mode: 'disabled',
    });
    expect(prisma.credential.findFirst).not.toHaveBeenCalled();
    expect(access.canStartWork).not.toHaveBeenCalled();
    expect(processor.enqueue).not.toHaveBeenCalled();
  });

  it('ignores candidates without a resolved credential without checking another tenant', async () => {
    prisma.credential.findFirst.mockResolvedValue(null);
    await expect(service.handleEventPayload(PAYLOAD)).resolves.toEqual({
      enqueued: 0,
      ignored: 2,
      mode: 'live',
    });
    expect(access.canStartWork).not.toHaveBeenCalled();
    expect(processor.enqueue).not.toHaveBeenCalled();
  });

  it('propagates unexpected queue failures instead of recording them as ignored', async () => {
    const error = new Error('Queue unavailable');
    processor.enqueue.mockRejectedValue(error);
    await expect(service.handleEventPayload(PAYLOAD)).rejects.toBe(error);
    expect(processor.enqueue).toHaveBeenCalledOnce();
  });
});
