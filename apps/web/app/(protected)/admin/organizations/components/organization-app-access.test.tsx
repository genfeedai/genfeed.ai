import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationAppAccess from './organization-app-access';

const messages: Record<string, string> = {
  accessColumn: 'Access',
  appColumn: 'App',
  appsTitle: 'Apps',
  earlyAccess: 'Early access',
  releasedForEveryone: 'Released for everyone',
  analyticsPagesGroup: 'Analytics pages',
  'items.analytics_brands': 'Brands',
  'items.analytics_streaks': 'Streaks',
  'items.campaigns': 'Campaigns',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => messages[key] ?? key,
}));

const platformFlags = vi.hoisted(() => ({
  flags: {} as Record<string, boolean>,
}));

vi.mock('@/lib/platform-flags/use-platform-flags', () => ({
  usePlatformFlags: () => ({
    flags: platformFlags.flags,
    isReady: true,
    isUnavailable: false,
  }),
}));

function renderAccess(
  overrides: Partial<Parameters<typeof OrganizationAppAccess>[0]> = {},
) {
  const onChange = vi.fn().mockResolvedValue(undefined);
  render(
    <OrganizationAppAccess
      hasOrganizationBilling
      isReleasePreviewEnabled={false}
      moduleOverrides={{}}
      releasedItemIds={[]}
      onChange={onChange}
      {...overrides}
    />,
  );
  return { onChange };
}

describe('OrganizationAppAccess', () => {
  beforeEach(() => {
    platformFlags.flags = {};
  });

  it('lists every app once with readable names and a single switch', () => {
    renderAccess();

    expect(screen.getAllByRole('switch')).toHaveLength(19);
    expect(screen.getByRole('switch', { name: 'Motion' })).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Campaigns' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Brands' })).toBeInTheDocument();
    expect(screen.getByText('Analytics pages')).toBeInTheDocument();
  });

  it('turns an unreleased app on by releasing it and showing it', async () => {
    const { onChange } = renderAccess({ releasedItemIds: ['turbo'] });

    expect(screen.getByRole('switch', { name: 'Motion' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('switch', { name: 'Motion' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        moduleOverrides: { motion: true },
        releasedItemIds: ['turbo', 'motion'],
      }),
    );
  });

  it('shows an app released for everyone as on and only hides it when turned off', async () => {
    platformFlags.flags = { release_publishing: true };
    const { onChange } = renderAccess();

    expect(screen.getByRole('switch', { name: 'Publishing' })).toBeChecked();
    expect(screen.getByText('Released for everyone')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch', { name: 'Publishing' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        moduleOverrides: { publishing: false },
      }),
    );
  });

  it('keeps Playground on by default and hides it with an override', async () => {
    const { onChange } = renderAccess({
      moduleOverrides: { storyboard: false },
    });

    expect(screen.getByRole('switch', { name: 'Playground' })).toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Storyboard' }),
    ).not.toBeChecked();

    await userEvent.click(screen.getByRole('switch', { name: 'Playground' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        moduleOverrides: { playground: false, storyboard: false },
      }),
    );
  });

  it('grants and revokes a release-only item', async () => {
    const { onChange } = renderAccess({
      releasedItemIds: ['analytics_streaks'],
    });

    await userEvent.click(screen.getByRole('switch', { name: 'Brands' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        releasedItemIds: ['analytics_brands', 'analytics_streaks'],
      }),
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Streaks' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({ releasedItemIds: [] }),
    );
  });

  it('locks an item released for everyone', () => {
    platformFlags.flags = { release_campaigns: true };
    renderAccess();

    expect(screen.getByRole('switch', { name: 'Campaigns' })).toBeDisabled();
  });
});
