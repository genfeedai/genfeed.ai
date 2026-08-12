import { describe, expect, it, vi } from 'vitest';
import { ReportDeliveryExecutor } from './report-delivery-executor';

describe('ReportDeliveryExecutor', () => {
  it('delivers in-app notification', async () => {
    const executor = new ReportDeliveryExecutor();
    const notificationSender = vi.fn().mockResolvedValue(undefined);
    executor.setNotificationSender(notificationSender);

    const result = await executor.execute({
      context: { organizationId: 'org', userId: 'user' } as never,
      inputs: new Map([['content', 'Daily digest body']]),
      node: {
        config: { channel: 'notification', subject: 'Digest' },
        id: 'n1',
        type: 'reportDelivery',
      },
    });

    expect(notificationSender).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Daily digest body',
        title: 'Digest',
        userId: 'user',
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        delivered: true,
        destination: 'notification',
      }),
    );
  });

  it('delivers email when channel is email', async () => {
    const executor = new ReportDeliveryExecutor();
    const emailSender = vi.fn().mockResolvedValue(undefined);
    executor.setEmailSender(emailSender);

    const result = await executor.execute({
      context: { organizationId: 'org', userId: 'user' } as never,
      inputs: new Map([['content', 'Report text']]),
      node: {
        config: {
          channel: 'email',
          email: 'ops@example.com',
          subject: 'Report',
        },
        id: 'n1',
        type: 'reportDelivery',
      },
    });

    expect(emailSender).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Report',
        to: 'ops@example.com',
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        delivered: true,
        destination: 'email:ops@example.com',
      }),
    );
  });

  it('fails closed without content', async () => {
    const executor = new ReportDeliveryExecutor();
    executor.setNotificationSender(vi.fn());
    await expect(
      executor.execute({
        context: { organizationId: 'org', userId: 'user' } as never,
        inputs: new Map(),
        node: {
          config: { channel: 'notification' },
          id: 'n1',
          type: 'reportDelivery',
        },
      }),
    ).rejects.toThrow(/content is required/i);
  });

  it('fails closed when the notification sender throws', async () => {
    const executor = new ReportDeliveryExecutor();
    executor.setNotificationSender(
      vi.fn().mockRejectedValue(new Error('notification bus down')),
    );

    await expect(
      executor.execute({
        context: { organizationId: 'org', userId: 'user' } as never,
        inputs: new Map([['content', 'Digest']]),
        node: {
          config: { channel: 'notification', subject: 'Digest' },
          id: 'n1',
          type: 'reportDelivery',
        },
      }),
    ).rejects.toThrow(/notification bus down/);
  });

  it('fails closed when the email sender throws', async () => {
    const executor = new ReportDeliveryExecutor();
    executor.setEmailSender(vi.fn().mockRejectedValue(new Error('smtp 550')));

    await expect(
      executor.execute({
        context: { organizationId: 'org', userId: 'user' } as never,
        inputs: new Map([['content', 'Digest']]),
        node: {
          config: {
            channel: 'email',
            email: 'ops@example.com',
            subject: 'Digest',
          },
          id: 'n1',
          type: 'reportDelivery',
        },
      }),
    ).rejects.toThrow(/smtp 550/);
  });

  it('accepts upstream summary as report content', async () => {
    const executor = new ReportDeliveryExecutor();
    const notificationSender = vi.fn().mockResolvedValue(undefined);
    executor.setNotificationSender(notificationSender);

    const result = await executor.execute({
      context: { organizationId: 'org', userId: 'user' } as never,
      inputs: new Map([['summary', 'Fetched 2 timeline item(s)']]),
      node: {
        config: { channel: 'notification' },
        id: 'n1',
        type: 'reportDelivery',
      },
    });

    expect(notificationSender).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Fetched 2 timeline item(s)',
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({ delivered: true, destination: 'notification' }),
    );
  });
});
