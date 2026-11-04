import { ActivityKey } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import common from '../../../messages/en/common.json';
import NotificationInboxPanel from './NotificationInboxPanel';

vi.unmock('next-intl');
vi.mock('@/components/shell/use-notification-inbox', () => ({
  useNotificationInbox: () => ({
    count: { data: { unreadCount: 1 } },
    history: {
      data: {
        pages: [
          {
            items: [
              {
                id: 'music-failure',
                topic: 'generation.status',
                occurredAt: '2026-11-04T09:00:00Z',
                readAt: null,
                outcome: 'failed',
                sourceHref: '/acme/brand/library/music',
                failure: null,
                activity: {
                  key: ActivityKey.MUSIC_FAILED,
                  value: JSON.stringify({
                    error: 'Provider timed out: private-diagnostic',
                  }),
                },
              },
            ],
          },
        ],
      },
    },
    read: { mutate: vi.fn() },
  }),
}));

describe('global notification messages', () => {
  it('renders a readable failure with only the shared shell catalog loaded', () => {
    const onError = vi.fn();
    render(
      <NextIntlClientProvider
        locale="en"
        timeZone="UTC"
        messages={{ common }}
        onError={onError}
      >
        <NotificationInboxPanel isActive />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByText('The provider timed out. Try again.'),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Failed to generate music/ }),
    ).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Notifications' }),
    ).not.toHaveTextContent('private-diagnostic');
    expect(onError).not.toHaveBeenCalled();
  });
});
