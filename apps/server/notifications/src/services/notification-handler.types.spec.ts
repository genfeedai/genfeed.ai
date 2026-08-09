import { isNotificationEvent } from '@notifications/services/notification-handler.types';

describe('isNotificationEvent', () => {
  it('accepts a well-formed notification event', () => {
    expect(
      isNotificationEvent({
        action: 'send_email',
        payload: { to: 'a@b.c' },
        type: 'email',
      }),
    ).toBe(true);
  });

  it('rejects primitives and null', () => {
    expect(isNotificationEvent(null)).toBe(false);
    expect(isNotificationEvent(undefined)).toBe(false);
    expect(isNotificationEvent('event')).toBe(false);
    expect(isNotificationEvent(42)).toBe(false);
  });

  it('rejects objects missing required fields', () => {
    expect(isNotificationEvent({})).toBe(false);
    expect(isNotificationEvent({ action: 'a', type: 'email' })).toBe(false);
    expect(
      isNotificationEvent({ action: 'a', payload: null, type: 'email' }),
    ).toBe(false);
    expect(
      isNotificationEvent({
        action: 'a',
        payload: 'not-object',
        type: 'email',
      }),
    ).toBe(false);
    expect(isNotificationEvent({ action: 1, payload: {}, type: 'email' })).toBe(
      false,
    );
    expect(isNotificationEvent({ action: 'a', payload: {}, type: 7 })).toBe(
      false,
    );
  });
});
