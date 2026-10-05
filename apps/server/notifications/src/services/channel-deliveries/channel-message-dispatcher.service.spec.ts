import { IngredientCategory } from '@genfeedai/contracts';
import type { IChannelDeliveryRequest } from '@genfeedai/contracts/interfaces';
import {
  ChannelMessageDispatcherService,
  InvalidChannelMessageError,
} from '@notifications/services/channel-deliveries/channel-message-dispatcher.service';

function makeDispatcher() {
  const discord = {
    sendArticleNotification: vi.fn().mockResolvedValue(true),
    sendIngredientNotification: vi.fn().mockResolvedValue(true),
    sendLowCreditsAlert: vi.fn().mockResolvedValue(true),
    sendModelDiscoveryNotification: vi.fn().mockResolvedValue(true),
    sendModelPriceChangeNotification: vi.fn().mockResolvedValue(true),
    sendModelPricingUnavailableNotification: vi.fn().mockResolvedValue(true),
    sendRevenueNotification: vi.fn().mockResolvedValue(true),
    sendStreakNotification: vi.fn().mockResolvedValue(true),
    sendUserCreatedNotification: vi.fn().mockResolvedValue(true),
    sendVercelNotification: vi.fn().mockResolvedValue(true),
  };
  const resend = { sendEmail: vi.fn().mockResolvedValue('email-1') };
  const slack = { sendMessage: vi.fn().mockResolvedValue(true) };
  const telegram = { sendMessage: vi.fn().mockResolvedValue(true) };
  const dispatcher = new ChannelMessageDispatcherService(
    discord as never,
    resend as never,
    slack as never,
    telegram as never,
  );
  return { discord, dispatcher, resend, slack, telegram };
}

function request(
  message: IChannelDeliveryRequest['message'],
  destination: string | null = null,
): IChannelDeliveryRequest {
  return { destination, idempotencyKey: 'delivery/key', message };
}

describe('ChannelMessageDispatcherService', () => {
  it('delivers actionable trend ingestion alerts through the operator card transport', async () => {
    const { discord, dispatcher } = makeDispatcher();
    const card = {
      color: 0xef4444,
      description:
        'YouTube trends missed two windows; inspect credentials and retry.',
      title: 'Trend ingestion missed two scheduled windows',
    };
    await expect(
      dispatcher.dispatch(
        request({
          action: 'ingestion_health',
          payload: { card },
          type: 'discord',
        }),
      ),
    ).resolves.toEqual({ messageId: 'delivery/key', status: 'delivered' });
    expect(discord.sendStreakNotification).toHaveBeenCalledWith(card);
  });

  it('sends operator Discord alerts and reports delivery', async () => {
    const { discord, dispatcher } = makeDispatcher();

    await expect(
      dispatcher.dispatch(
        request({
          action: 'revenue_notification',
          payload: {
            amountMinor: 4900,
            currency: 'usd',
            organizationId: 'org-1',
            source: 'subscription_invoice',
          },
          type: 'discord',
        }),
      ),
    ).resolves.toEqual({ messageId: 'delivery/key', status: 'delivered' });
    expect(discord.sendRevenueNotification).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 4900 }),
    );
  });

  it('routes provider price changes and pricing outages to the operator models channel', async () => {
    const { discord, dispatcher } = makeDispatcher();
    const change = {
      newPriceUsd: 0.21,
      oldPriceUsd: 0.19,
      unit: 'output' as const,
      variant: 'duration=6 · resolution=768P',
      component: 'video_output_count',
    };

    await expect(
      dispatcher.dispatch(
        request({
          action: 'model_price_change',
          payload: {
            changes: [change],
            modelKey: 'minimax/hailuo-2.3-fast',
            provider: 'replicate',
            sourceUrl: 'https://replicate.com/minimax/hailuo-2.3-fast',
          },
          type: 'discord',
        }),
      ),
    ).resolves.toEqual({ messageId: 'delivery/key', status: 'delivered' });
    expect(discord.sendModelPriceChangeNotification).toHaveBeenCalledWith(
      expect.objectContaining({ changes: [change] }),
    );

    await dispatcher.dispatch(
      request({
        action: 'model_pricing_unavailable',
        payload: {
          modelKey: 'minimax/hailuo-2.3-fast',
          provider: 'replicate',
          reason: 'unmapped_criterion:camera motion',
        },
        type: 'discord',
      }),
    );
    expect(
      discord.sendModelPricingUnavailableNotification,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'unmapped_criterion:camera motion' }),
    );
  });

  it('reports a skip when the Discord channel is not configured', async () => {
    const { discord, dispatcher } = makeDispatcher();
    discord.sendUserCreatedNotification.mockResolvedValue(false);

    await expect(
      dispatcher.dispatch(
        request({
          action: 'user_notification',
          payload: { email: 'new@example.com', id: 'user-1' },
          type: 'discord',
        }),
      ),
    ).resolves.toEqual({
      reason: 'channel_not_configured',
      status: 'skipped',
    });
  });

  it('renders ingredient and streak cards', async () => {
    const { discord, dispatcher } = makeDispatcher();

    await dispatcher.dispatch(
      request({
        action: 'ingredient_notification',
        payload: {
          category: IngredientCategory.VIDEO,
          cdnUrl: 'https://cdn.example.com/v.mp4',
          ingredient: { id: 'ingredient-1', thumbnailUrl: 'https://t' },
        },
        type: 'discord',
      }),
    );
    expect(discord.sendIngredientNotification).toHaveBeenCalledWith(
      IngredientCategory.VIDEO,
      'https://cdn.example.com/v.mp4',
      expect.objectContaining({
        id: 'ingredient-1',
        thumbnailUrl: 'https://t',
      }),
    );

    await dispatcher.dispatch(
      request({
        action: 'streak_milestone',
        payload: { card: { description: 'A 7-day streak', title: 'Streak' } },
        type: 'discord',
      }),
    );
    expect(discord.sendStreakNotification).toHaveBeenCalledWith({
      color: 0xf97316,
      description: 'A 7-day streak',
      title: 'Streak',
    });
  });

  it('rejects unknown or incomplete Discord messages without retrying', async () => {
    const { dispatcher } = makeDispatcher();

    await expect(
      dispatcher.dispatch(
        request({
          action: 'workflow_report',
          payload: {} as never,
          type: 'discord',
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidChannelMessageError);
    await expect(
      dispatcher.dispatch(
        request({
          action: 'revenue_notification',
          payload: { organizationId: 'org-1' } as never,
          type: 'discord',
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidChannelMessageError);
  });

  it('sends Telegram and Slack text to the destination', async () => {
    const { dispatcher, slack, telegram } = makeDispatcher();

    await dispatcher.dispatch(
      request(
        {
          action: 'send_message',
          payload: { chatId: 'ignored', message: 'Trends are in' },
          type: 'telegram',
        },
        'chat-1',
      ),
    );
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      'chat-1',
      'Trends are in',
    );

    await dispatcher.dispatch(
      request({
        action: 'send_message',
        payload: { chatId: 'C123', message: 'Review needed' },
        type: 'slack',
      }),
    );
    expect(slack.sendMessage).toHaveBeenCalledWith('C123', 'Review needed');

    await expect(
      dispatcher.dispatch(
        request({
          action: 'send_message',
          payload: { chatId: 'C123' } as never,
          type: 'slack',
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidChannelMessageError);
  });

  it('sends explicit email with the delivery idempotency key', async () => {
    const { dispatcher, resend } = makeDispatcher();

    await expect(
      dispatcher.dispatch(
        request(
          {
            action: 'send_email',
            payload: {
              html: '<p>Hi</p>',
              subject: 'Invite',
              to: 'invitee@example.com',
            },
            type: 'email',
          },
          'invitee@example.com',
        ),
      ),
    ).resolves.toEqual({ messageId: 'email-1', status: 'delivered' });
    expect(resend.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'delivery/key',
        subject: 'Invite',
        to: 'invitee@example.com',
      }),
    );
  });

  it('renders the review-gate email and skips when Resend is not configured', async () => {
    const { dispatcher, resend } = makeDispatcher();
    resend.sendEmail.mockResolvedValue(null);

    await expect(
      dispatcher.dispatch(
        request({
          action: 'review_gate_pending',
          payload: {
            captionPreview: '<b>caption</b>',
            executionId: 'run-1',
            nodeId: 'node-1',
            reviewUrl: 'https://app.example.com/review',
            to: 'owner@example.com',
            workflowId: 'wf-1',
            workflowLabel: 'Launch',
          },
          type: 'email',
        }),
      ),
    ).resolves.toEqual({
      reason: 'channel_not_configured',
      status: 'skipped',
    });
    const [email] = resend.sendEmail.mock.calls[0];
    expect(email.subject).toBe('Review needed: Launch');
    expect(email.html).toContain('&lt;b&gt;caption&lt;/b&gt;');
    expect(email.to).toBe('owner@example.com');
  });

  it('rejects email without a body or recipient', async () => {
    const { dispatcher } = makeDispatcher();

    await expect(
      dispatcher.dispatch(
        request({
          action: 'send_email',
          payload: { subject: 'x', to: 'a@example.com' } as never,
          type: 'email',
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidChannelMessageError);
    await expect(
      dispatcher.dispatch(
        request({
          action: 'send_email',
          payload: { html: '<p>x</p>', subject: 'x' } as never,
          type: 'email',
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidChannelMessageError);
  });
});
