import '@testing-library/jest-dom/vitest';
import { PlatformRole } from '@genfeedai/contracts';
import type { IUser } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import UserDetails from './user-details';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: { getInstance: () => ({ copyToClipboard: vi.fn() }) },
}));

const user = {
  createdAt: '2026-10-17T21:21:00.000Z',
  email: 'jane@example.com',
  handle: 'jane',
  id: 'user-1',
  isOnboardingCompleted: true,
  lastActiveAt: null,
  platformRole: PlatformRole.USER,
  signupAttribution: {
    landingPath: '/muse/x-twitter',
    referrerDomain: 'google.com',
  },
} as unknown as IUser;

describe('UserDetails', () => {
  it('shows the signup source fields the record carries', () => {
    render(<UserDetails user={user} />);

    expect(screen.getByText('google.com')).toBeInTheDocument();
    expect(screen.getByText('/muse/x-twitter')).toBeInTheDocument();
    expect(screen.getByText('jane')).toBeInTheDocument();
  });

  it('reads a dash for fields the record lacks', () => {
    render(<UserDetails user={{ ...user, signupAttribution: null }} />);

    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(3);
  });

  it('labels the platform role', () => {
    render(
      <UserDetails user={{ ...user, platformRole: PlatformRole.SUPERADMIN }} />,
    );

    expect(screen.getByText('Superadmin')).toBeInTheDocument();
  });
});
