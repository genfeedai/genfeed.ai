import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationPublishingCapsCard from './organization-publishing-caps-card';

const mocks = vi.hoisted(() => ({
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  organizationId: 'org-1',
  settings: {} as Record<string, number | string>,
  updateSettings: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/acme${path}` }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    organizationId: mocks.organizationId,
  }),
}));

vi.mock('@/hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: () => ({
    settings: mocks.settings,
    updateSettings: mocks.updateSettings,
  }),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationsError,
      success: mocks.notificationsSuccess,
    }),
  },
}));

/** One arrow press: the value moves on key down, and commits when the key comes up. */
function nudge(slider: HTMLElement) {
  fireEvent.keyDown(slider, { code: 'ArrowRight', key: 'ArrowRight' });
  fireEvent.keyUp(slider, { code: 'ArrowRight', key: 'ArrowRight' });
}

function useSettings(tier: string, caps: Record<string, number> = {}) {
  mocks.settings = {
    publishingQuotaTier: tier,
    quotaInstagram: 5,
    quotaTiktok: 1,
    quotaTwitter: 15,
    quotaYoutube: 5,
    ...caps,
  };
}

describe('OrganizationPublishingCapsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettings('plan');
    mocks.updateSettings
      .mockReset()
      .mockImplementation(async (key: string, value: number) => {
        mocks.settings = { ...mocks.settings, [key]: value };
      });
  });

  it('shows a slider per platform at the owner cap, with the plan ceiling beside it', () => {
    render(<OrganizationPublishingCapsCard />);

    expect(screen.getByText('Daily publishing caps')).toBeInTheDocument();
    const x = screen.getByRole('slider', { name: 'X' });
    expect(x).toHaveAttribute('aria-valuetext', '15');
    expect(x).toHaveAttribute('max', '25');
    expect(screen.getByRole('slider', { name: 'Instagram' })).toHaveAttribute(
      'max',
      '15',
    );
    expect(screen.getByRole('slider', { name: 'TikTok' })).toHaveAttribute(
      'max',
      '10',
    );
    expect(screen.getByText('15 / day')).toBeInTheDocument();
    expect(screen.getAllByText(/^Up to \d+ on your plan\.$/)).toHaveLength(4);
  });

  it('locks every slider at 1 a day before the first payment', () => {
    useSettings('trial');
    render(<OrganizationPublishingCapsCard />);

    for (const name of ['X', 'Instagram', 'YouTube', 'TikTok']) {
      expect(screen.getByRole('slider', { name })).toHaveAttribute(
        'aria-valuetext',
        '1',
      );
      expect(screen.getByRole('slider', { name })).toHaveAttribute(
        'data-disabled',
      );
    }
    expect(screen.getAllByText('1 / day')).toHaveLength(4);
    expect(
      screen.getByText(/Your first payment, credits or a plan, unlocks/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Choose a plan')).not.toBeInTheDocument();
  });

  it('caps a credit buyer at 5 and offers the plan', () => {
    useSettings('credits');
    render(<OrganizationPublishingCapsCard />);

    const x = screen.getByRole('slider', { name: 'X' });
    expect(x).toHaveAttribute('max', '5');
    // The saved cap of 15 is held to what credits allow.
    expect(x).toHaveAttribute('aria-valuetext', '5');
    expect(
      screen.getAllByText('Up to 5 with credits. A plan raises it to 25.')
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Choose a plan' })).toHaveAttribute(
      'href',
      '/acme/settings/subscription',
    );
  });

  it('lets a deployment without billing go to 0, shown as no cap', () => {
    useSettings('unmetered', { quotaTwitter: 0 });
    render(<OrganizationPublishingCapsCard />);

    expect(screen.getByRole('slider', { name: 'X' })).toHaveAttribute(
      'min',
      '0',
    );
    expect(screen.getByText('No cap')).toBeInTheDocument();
  });

  it('saves a slider move once, on commit, and says so', async () => {
    render(<OrganizationPublishingCapsCard />);

    const tiktok = screen.getByRole('slider', { name: 'TikTok' });
    nudge(tiktok);

    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenCalledWith('quotaTiktok', 2);
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'Publishing caps saved',
      );
    });
  });

  it('tells the owner when a save fails and keeps the move on screen', async () => {
    mocks.updateSettings.mockRejectedValueOnce(new Error('boom'));
    render(<OrganizationPublishingCapsCard />);

    nudge(screen.getByRole('slider', { name: 'TikTok' }));

    await waitFor(() =>
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to save publishing caps',
      ),
    );
    expect(screen.getByRole('slider', { name: 'TikTok' })).toHaveAttribute(
      'aria-valuetext',
      '2',
    );
  });
});
