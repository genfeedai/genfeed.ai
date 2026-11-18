// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apps = vi.hoisted(() => ({ hasAppsBeyondDashboard: false }));

vi.mock('@/components/shell/use-available-rail-apps', () => ({
  useHasAppsBeyondDashboard: () => apps.hasAppsBeyondDashboard,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgSlug: 'acme' }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/~/workspace/overview',
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

import TopbarAppsLink from './TopbarAppsLink';

describe('TopbarAppsLink', () => {
  beforeEach(() => {
    apps.hasAppsBeyondDashboard = false;
  });

  it('is hidden while only the core apps are available', () => {
    render(<TopbarAppsLink orgSlug="acme" />);

    expect(
      screen.queryByRole('link', { name: 'Apps' }),
    ).not.toBeInTheDocument();
  });

  it('links to the Apps page once an app beyond the core is available', () => {
    apps.hasAppsBeyondDashboard = true;

    render(<TopbarAppsLink orgSlug="acme" />);

    expect(screen.getByRole('link', { name: 'Apps' })).toHaveAttribute(
      'href',
      '/acme/~/apps',
    );
  });
});
