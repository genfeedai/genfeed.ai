import '@testing-library/jest-dom/vitest';
import { PlatformRole } from '@genfeedai/contracts';
import type { IUser } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const actions = vi.hoisted(() => ({ profile: vi.fn(), reset: vi.fn() }));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    updateAdminProfile: actions.profile,
    resetOnboarding: actions.reset,
  }),
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
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('cancels edits without writing and discards the draft on reopen', () => {
    render(<UserDetails user={user} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.change(screen.getByLabelText('First name'), {
      target: { value: 'Draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(actions.profile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    expect(screen.getByLabelText('First name')).toHaveValue('');
  });

  it('preserves a legacy full name when opening the profile editor', () => {
    render(
      <UserDetails
        user={{
          ...user,
          firstName: null,
          lastName: null,
          name: 'Jane Example',
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    expect(screen.getByLabelText('First name')).toHaveValue('Jane Example');
  });

  it('saves the profile and publishes the returned record to the parent', async () => {
    const updated = {
      ...user,
      firstName: 'Jane',
      lastName: 'Example',
      handle: 'jane-new',
    };
    actions.profile.mockResolvedValue(updated);
    const onUpdated = vi.fn();
    render(<UserDetails user={user} onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.change(screen.getByLabelText('First name'), {
      target: { value: 'Jane' },
    });
    fireEvent.change(screen.getByLabelText('Last name'), {
      target: { value: 'Example' },
    });
    fireEvent.change(screen.getByLabelText('Handle'), {
      target: { value: 'jane-new' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
    expect(actions.profile).toHaveBeenCalledWith(user.id, {
      firstName: 'Jane',
      lastName: 'Example',
      handle: 'jane-new',
    });
    expect(screen.getByText('Jane Example')).toBeInTheDocument();
  });

  it('retains the draft when saving fails so the operator can retry', async () => {
    actions.profile.mockRejectedValue(new Error('Network unavailable'));
    render(<UserDetails user={user} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.change(screen.getByLabelText('First name'), {
      target: { value: 'Draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('First name')).toHaveValue('Draft');
  });

  it('requires confirmation before resetting and never completes onboarding', async () => {
    actions.reset.mockResolvedValue({
      ...user,
      isOnboardingCompleted: false,
      onboardingStartedAt: null,
      onboardingCompletedAt: null,
      onboardingType: null,
      onboardingStepsCompleted: [],
    });
    render(<UserDetails user={user} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset onboarding' }));
    expect(actions.reset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(actions.reset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset onboarding' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reset' }));
    await waitFor(() =>
      expect(actions.reset).toHaveBeenCalledExactlyOnceWith(user.id),
    );
    expect(await screen.findByText('In progress')).toBeInTheDocument();
    expect(actions.profile).not.toHaveBeenCalled();
  });

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
