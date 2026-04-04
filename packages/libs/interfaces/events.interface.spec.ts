import { NotificationEvent } from '@libs/interfaces/events.interface';

describe('NotificationEvent', () => {
  it('should allow valid notification event structure', () => {
    const event: NotificationEvent = {
      action: 'send',
      organizationId: 'org_456',
      payload: { body: 'Test body', subject: 'Test' },
      retryCount: 0,
      timestamp: new Date(),
      type: 'email',
      userId: 'user_123',
    };

    expect(event.type).toBe('email');
    expect(event.action).toBe('send');
    expect(event.payload).toEqual({ body: 'Test body', subject: 'Test' });
    expect(event.userId).toBe('user_123');
    expect(event.organizationId).toBe('org_456');
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.retryCount).toBe(0);
  });

  it('should allow all notification types', () => {
    const types: NotificationEvent['type'][] = [
      'telegram',
      'discord',
      'email',
      'chatbot',
    ];

    types.forEach((type) => {
      const event: NotificationEvent = {
        action: 'test',
        payload: {},
        type,
      };
      expect(event.type).toBe(type);
    });
  });

  it('should allow optional fields to be undefined', () => {
    const event: NotificationEvent = {
      action: 'send',
      payload: {},
      type: 'email',
    };

    expect(event.userId).toBeUndefined();
    expect(event.organizationId).toBeUndefined();
    expect(event.timestamp).toBeUndefined();
    expect(event.retryCount).toBeUndefined();
  });

  it('should allow flexible payload structure', () => {
    const event1: NotificationEvent = {
      action: 'send',
      payload: { custom: 'data', nested: { value: 123 } },
      type: 'email',
    };

    const event2: NotificationEvent = {
      action: 'send',
      payload: { chatId: '123', message: 'Hello' },
      type: 'telegram',
    };

    expect(event1.payload).toEqual({ custom: 'data', nested: { value: 123 } });
    expect(event2.payload).toEqual({ chatId: '123', message: 'Hello' });
  });
});
