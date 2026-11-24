import { IngredientCategory } from '@genfeedai/contracts';
import type {
  IChannelDeliveryRequest,
  ModelScanReport,
} from '@genfeedai/contracts/interfaces';
import {
  ChannelMessageDispatcherService,
  InvalidChannelMessageError,
} from '@notifications/services/channel-deliveries/channel-message-dispatcher.service';

function makeDispatcher() {
  const discord = {
    sendArticleNotification: vi.fn().mockResolvedValue(true),
    sendBillingEventNotification: vi.fn().mockResolvedValue(true),
    sendIngredientNotification: vi.fn().mockResolvedValue(true),
    sendLowCreditsAlert: vi.fn().mockResolvedValue(true),
    sendModelScanNotification: vi.fn().mockResolvedValue(true),
    sendPostPublishedNotification: vi.fn().mockResolvedValue(true),
    sendRevenueNotification: vi.fn().mockResolvedValue(true),
    sendAlertNotification: vi.fn().mockResolvedValue(true),
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
  it('delivers actionable trend ingestion alerts to the alerts channel', async () => {
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
    expect(discord.sendAlertNotification).toHaveBeenCalledWith(card);
    expect(discord.sendStreakNotification).not.toHaveBeenCalled();
  });

  it('delivers a published-post card to the posts channel service', async () => {
    const { discord, dispatcher } = makeDispatcher();
    const payload = {
      brandLabel: 'Shayla',
      caption: 'Studio day',
      platform: 'instagram',
      postId: 'post-1',
      url: 'https://www.instagram.com/p/abc/',
    };

    await expect(
      dispatcher.dispatch(
        request({ action: 'post_published', payload, type: 'discord' }),
      ),
    ).resolves.toEqual({ messageId: 'delivery/key', status: 'delivered' });
    expect(discord.sendPostPublishedNotification).toHaveBeenCalledWith(payload);
  });

  it('rejects a published-post card without its post', async () => {
    const { dispatcher } = makeDispatcher();

    await expect(
      dispatcher.dispatch(
        request({
          action: 'post_published',
          payload: { caption: 'x' } as never,
          type: 'discord',
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidChannelMessageError);
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

  it('renders a billing event as a billing card', async () => {
    const { discord, dispatcher } = makeDispatcher();

    await expect(
      dispatcher.dispatch(
        request({
          action: 'billing_event',
          payload: {
            kind: 'payment_failed',
            organizationId: 'org-1',
          },
          type: 'discord',
        }),
      ),
    ).resolves.toEqual({ messageId: 'delivery/key', status: 'delivered' });
    expect(discord.sendBillingEventNotification).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'payment_failed' }),
    );
  });

  it('rejects a billing event of a kind it cannot render', async () => {
    const { dispatcher } = makeDispatcher();

    await expect(
      dispatcher.dispatch(
        request({
          action: 'billing_event',
          payload: { kind: 'upgrade', organizationId: 'org-1' } as never,
          type: 'discord',
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidChannelMessageError);
  });

  it('routes a model scan report to the operator models channel', async () => {
    const { discord, dispatcher } = makeDispatcher();
    const report: ModelScanReport = {
      dataErrors: [],
      delisted: [],
      newDrafts: [],
      priceChanges: [],
      provider: 'fal',
      removedByProvider: [
        {
          modelKey: 'fal-ai/runway-gen3',
          reason: 'API returned 404',
          sourceUrl: null,
        },
      ],
      startedAt: '2026-11-15T07:00:00.000Z',
      totals: {
        drifted: 0,
        draftsCreated: 0,
        errors: 0,
        newModelsFound: 0,
        polled: 1,
        quarantined: 0,
        synchronized: 0,
      },
      unreadable: [],
    };

    await expect(
      dispatcher.dispatch(
        request({ action: 'model_scan', payload: report, type: 'discord' }),
      ),
    ).resolves.toEqual({ messageId: 'delivery/key', status: 'delivered' });
    expect(discord.sendModelScanNotification).toHaveBeenCalledWith(report);
  });

  it('no longer renders the per-model discovery and price cards', async () => {
    const { dispatcher } = makeDispatcher();

    await expect(
      dispatcher.dispatch(
        request({
          action: 'model_price_change',
          payload: {} as never,
          type: 'discord',
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidChannelMessageError);
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
      undefined,
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

  it('passes the account behind an ingredient to the Discord service', async () => {
    const { discord, dispatcher } = makeDispatcher();

    await dispatcher.dispatch(
      request({
        action: 'ingredient_notification',
        payload: {
          category: IngredientCategory.VIDEO,
          cdnUrl: 'https://cdn.example.com/v.mp4',
          ingredient: {
            id: 'ingredient-3',
            owner: {
              creditBalance: 13,
              organizationLabel: 'Acme',
              userEmail: 'owner@example.com',
            },
          },
        },
        type: 'discord',
      }),
    );

    expect(discord.sendIngredientNotification).toHaveBeenCalledWith(
      IngredientCategory.VIDEO,
      'https://cdn.example.com/v.mp4',
      expect.objectContaining({
        owner: {
          creditBalance: 13,
          organizationLabel: 'Acme',
          userEmail: 'owner@example.com',
        },
      }),
      undefined,
    );
  });

  it('passes the storyboard context of a still to the Discord service', async () => {
    const { discord, dispatcher } = makeDispatcher();

    await dispatcher.dispatch(
      request({
        action: 'ingredient_notification',
        payload: {
          category: IngredientCategory.IMAGE,
          cdnUrl: 'https://cdn.example.com/i.png',
          ingredient: { id: 'ingredient-2' },
          storyboard: {
            layoutPath: '/org/brand/storyboard/run-1',
            runId: 'run-1',
            title: 'Steam shots',
          },
        },
        type: 'discord',
      }),
    );

    expect(discord.sendIngredientNotification).toHaveBeenCalledWith(
      IngredientCategory.IMAGE,
      'https://cdn.example.com/i.png',
      expect.objectContaining({ id: 'ingredient-2' }),
      {
        layoutPath: '/org/brand/storyboard/run-1',
        runId: 'run-1',
        title: 'Steam shots',
      },
    );
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
