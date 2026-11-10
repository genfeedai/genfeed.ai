// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  isSignedIn: true,
  user: null as {
    firstName?: string | null;
    fullName?: string | null;
    imageUrl?: string | null;
    lastName?: string | null;
    primaryEmailAddress?: { emailAddress: string } | null;
  } | null,
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ isSignedIn: auth.isSignedIn }),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: () => ({ user: auth.user }),
}));

const orgScope = vi.hoisted(() => ({
  orgSlug: 'acme' as string | undefined,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (href: string) => `/${orgScope.orgSlug}/~${href}`,
    orgSlug: orgScope.orgSlug,
  }),
}));

const route = vi.hoisted(() => ({ pathname: '/acme/~/workspace/overview' }));

vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    children: ReactNode;
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

vi.mock('@ui/primitives/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import RailAccount from './RailAccount';

describe('RailAccount', () => {
  beforeEach(() => {
    orgScope.orgSlug = 'acme';
    route.pathname = '/acme/~/workspace/overview';
    auth.isSignedIn = true;
    auth.user = {
      fullName: 'Vincent Tellier',
      imageUrl: null,
      primaryEmailAddress: { emailAddress: 'vincent@genfeed.ai' },
    };
  });

  it('shows Help and only the avatar, never the name or email', () => {
    render(<RailAccount />);

    expect(screen.getByTestId('app-rail-help')).toHaveAttribute(
      'href',
      '/settings/help',
    );
    expect(
      screen.getByRole('button', { name: 'Open account menu' }),
    ).toHaveTextContent('V');
    expect(screen.queryByText('Vincent Tellier')).not.toBeInTheDocument();
    expect(screen.queryByText('vincent@genfeed.ai')).not.toBeInTheDocument();
  });

  it('opens Connectors from the rail and marks it current on every section', () => {
    const { rerender } = render(<RailAccount />);

    const link = screen.getByRole('link', { name: 'Connectors' });
    expect(link).toHaveAttribute('href', '/acme/~/connectors/agents');
    expect(link).not.toHaveAttribute('aria-current');

    route.pathname = '/acme/~/connectors/api-keys';
    rerender(<RailAccount />);

    expect(screen.getByRole('link', { name: 'Connectors' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('pins Settings above Help and links it to the organization settings', () => {
    render(<RailAccount />);

    const settings = screen.getByRole('link', { name: 'Settings' });
    expect(settings).toHaveAttribute('href', '/acme/~/settings/general');
    expect(settings).not.toHaveAttribute('aria-current');
    expect(
      settings.compareDocumentPosition(screen.getByTestId('app-rail-help')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('marks Settings current on a settings page', () => {
    route.pathname = '/acme/~/settings/brands';

    render(<RailAccount />);

    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('has no Settings link without an organization', () => {
    orgScope.orgSlug = undefined;

    render(<RailAccount />);

    expect(
      screen.queryByRole('link', { name: 'Settings' }),
    ).not.toBeInTheDocument();
  });

  it('keeps Help but drops the avatar when signed out', () => {
    auth.isSignedIn = false;
    auth.user = null;

    render(<RailAccount />);

    expect(screen.getByTestId('app-rail-help')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open account menu' }),
    ).not.toBeInTheDocument();
  });
});
