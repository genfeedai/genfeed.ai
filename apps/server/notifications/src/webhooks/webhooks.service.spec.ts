import type { EventsService } from '@libs/events/events.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { WebhookNotification } from '@notifications/shared/interfaces/webhooks.interface';
import { WebhooksService } from '@notifications/webhooks/webhooks.service';

describe('WebhooksService (Notifications)', () => {
  let emitted: Array<{ data: Record<string, unknown>; event: string }>;
  let isBusDown: boolean;
  let errors: string[];
  let service: WebhooksService;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-06T12:00:00.000Z') });
    emitted = [];
    isBusDown = false;
    errors = [];

    service = new WebhooksService(
      {
        error: (message: string) => {
          errors.push(message);
        },
        log: () => {},
      } as unknown as LoggerService,
      {
        emit: async (event: string, data: Record<string, unknown>) => {
          if (isBusDown) {
            throw new Error('bus down');
          }
          emitted.push({ data, event });
        },
      } as unknown as EventsService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('handleWebhookNotification', () => {
    it('broadcasts the webhook and fans it out to the owning user', async () => {
      await service.handleWebhookNotification({
        data: { amount: 100 },
        event: 'payment.success',
        metadata: { userId: 'user-123' },
        service: 'stripe',
      } satisfies WebhookNotification);

      const eventData = {
        data: { amount: 100 },
        event: 'payment.success',
        metadata: { userId: 'user-123' },
        service: 'stripe',
        status: 'received',
        timestamp: '2026-11-06T12:00:00.000Z',
        type: 'webhook.stripe.payment.success',
      };
      expect(emitted).toEqual([
        { data: eventData, event: 'webhook.notification' },
        { data: eventData, event: 'user.user-123.webhook' },
      ]);
    });

    it('only broadcasts when no user owns the webhook', async () => {
      await service.handleWebhookNotification({
        data: {},
        event: 'ping',
        service: 'stripe',
      } satisfies WebhookNotification);

      expect(emitted.map(({ event }) => event)).toEqual([
        'webhook.notification',
      ]);
    });

    it('preserves an explicit notification status', async () => {
      await service.handleWebhookNotification({
        data: {},
        event: 'ping',
        service: 'stripe',
        status: 'completed',
      } satisfies WebhookNotification);

      expect(emitted[0]?.data.status).toBe('completed');
    });

    it('logs and rethrows when the event bus is down', async () => {
      isBusDown = true;

      await expect(
        service.handleWebhookNotification({
          data: {},
          event: 'ping',
          service: 'stripe',
        }),
      ).rejects.toThrow('bus down');

      expect(errors).toEqual([
        expect.stringMatching(/^WebhooksService .* failed$/),
      ]);
    });
  });

  describe('getWebhookStatus', () => {
    it('returns a pending status snapshot', () => {
      expect(service.getWebhookStatus('stripe', 'evt-1')).toEqual({
        id: 'evt-1',
        service: 'stripe',
        status: 'pending',
        timestamp: '2026-11-06T12:00:00.000Z',
      });
    });
  });
});
