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

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (href: string) => `/acme/~${href}` }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
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
