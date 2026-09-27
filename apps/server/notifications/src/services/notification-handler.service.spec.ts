import { InvalidChannelMessageError } from '@notifications/services/channel-deliveries/channel-message-dispatcher.service';
import { NotificationHandlerService } from '@notifications/services/notification-handler.service';
import { ResendEmailDeliveryError } from '@notifications/services/resend/resend.service';

type Subscriber = (message: unknown) => void;

async function flush(): Promise<void> {
  for (let iteration = 0; iteration < 10; iteration += 1) {
    await Promise.resolve();
  }
}

function setup() {
  let subscriber: Subscriber | undefined;
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const redis = {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(async (_channel: string, callback: Subscriber) => {
      subscriber = callback;
    }),
  };
  const dispatcher = {
    dispatch: vi
      .fn()
      .mockResolvedValue({ messageId: 'id', status: 'delivered' }),
  };
  const service = new NotificationHandlerService(
    logger as never,
    redis as never,
    dispatcher as never,
  );
  return {
    dispatcher,
    emit: (message: unknown) => subscriber?.(message),
    logger,
    redis,
    service,
  };
}

describe('NotificationHandlerService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to the legacy channel and renders through the dispatcher', async () => {
    const f = setup();
    await f.service.onModuleInit();
    expect(f.redis.subscribe).toHaveBeenCalledWith(
      'notifications',
      expect.any(Function),
    );

    f.emit({
      action: 'send_message',
      payload: { chatId: 'chat-1', message: 'hello' },
      type: 'telegram',
    });
    await flush();

    expect(f.dispatcher.dispatch).toHaveBeenCalledWith({
      destination: null,
      idempotencyKey: expect.stringMatching(/^redis\/telegram\/send_message\//),
      message: {
        action: 'send_message',
        payload: { chatId: 'chat-1', message: 'hello' },
        type: 'telegram',
      },
    });
  });

  it('skips malformed events and unknown event types', async () => {
    const f = setup();
    await f.service.onModuleInit();

    f.emit({ type: 'discord' });
    f.emit({ action: 'send_message', payload: {}, type: 'bot' });
    await flush();

    expect(f.dispatcher.dispatch).not.toHaveBeenCalled();
    expect(f.logger.warn).toHaveBeenCalledTimes(2);
  });

  it('republishes transient failures and stops after three retries', async () => {
    vi.useFakeTimers();
    const f = setup();
    f.dispatcher.dispatch.mockRejectedValue(new Error('discord down'));
    await f.service.onModuleInit();

    const event = {
      action: 'user_notification',
      payload: { id: 'user-1' },
      type: 'discord',
    };
    f.emit(event);
    await flush();
    await vi.runAllTimersAsync();
    expect(f.redis.publish).toHaveBeenCalledWith('notifications', {
      ...event,
      retryCount: 1,
    });

    f.redis.publish.mockClear();
    f.emit({ ...event, retryCount: 3 });
    await flush();
    await vi.runAllTimersAsync();
    expect(f.redis.publish).not.toHaveBeenCalled();
  });

  it('never retries a message the dispatcher rejects as invalid or permanent', async () => {
    vi.useFakeTimers();
    const f = setup();
    await f.service.onModuleInit();

    f.dispatcher.dispatch.mockRejectedValueOnce(
      new InvalidChannelMessageError('Unsupported Discord action'),
    );
    f.emit({ action: 'unknown', payload: {}, type: 'discord' });
    await flush();

    f.dispatcher.dispatch.mockRejectedValueOnce(
      new ResendEmailDeliveryError('rejected', {
        providerCode: null,
        retryable: false,
        statusCode: 422,
      }),
    );
    f.emit({
      action: 'send_email',
      payload: { html: '<p>x</p>', subject: 's', to: 'a@example.com' },
      type: 'email',
    });
    await flush();
    await vi.runAllTimersAsync();

    expect(f.redis.publish).not.toHaveBeenCalled();
    expect(f.logger.error).toHaveBeenCalledTimes(2);
  });
});
