import { describe, expect, it } from 'vitest';
import { getNotificationRoute } from '@/hooks/get-notification-route';

describe('getNotificationRoute', () => {
  it('routes content-ready notifications to the ingredient when an id is present', () => {
    expect(
      getNotificationRoute({ contentId: 'ing_1', type: 'content_ready' }),
    ).toEqual({ path: '/ingredient/ing_1' });
    expect(getNotificationRoute({ type: 'content_ready' })).toBeNull();
  });

  it('routes analytics updates and drops approval notifications', () => {
    expect(getNotificationRoute({ type: 'analytics_update' })).toEqual({
      path: '/analytics',
    });
    expect(
      getNotificationRoute({ approvalId: 'appr_1', type: 'approval_request' }),
    ).toBeNull();
    expect(getNotificationRoute({ type: 'approval_reminder' })).toBeNull();
    expect(getNotificationRoute({ type: 'approval_decision' })).toBeNull();
  });

  it('ignores unknown notification types', () => {
    expect(getNotificationRoute({ type: 'unknown' })).toBeNull();
    expect(getNotificationRoute({})).toBeNull();
  });
});
