import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CredentialPostingTimesEditor from './CredentialPostingTimesEditor';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const listPostingTimes = vi.fn();
const addPostingTime = vi.fn();
const removePostingTime = vi.fn();

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn(async (getTokenFn: () => Promise<string>) =>
    getTokenFn(),
  ),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: vi.fn(async () => 'token-123'),
  }),
}));

vi.mock('@services/organization/credentials.service', () => ({
  CredentialsService: {
    getInstance: () => ({
      addPostingTime,
      listPostingTimes,
      removePostingTime,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

describe('CredentialPostingTimesEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPostingTimes.mockResolvedValue([
      { hour: 9, minute: 0 },
      { hour: 18, minute: 0 },
    ]);
    addPostingTime.mockResolvedValue([
      { hour: 9, minute: 0 },
      { hour: 13, minute: 0 },
      { hour: 18, minute: 0 },
    ]);
    removePostingTime.mockResolvedValue([{ hour: 18, minute: 0 }]);
  });

  it('loads saved posting times for the credential', async () => {
    render(<CredentialPostingTimesEditor credentialId="credential-1" />);

    expect(await screen.findByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('18:00')).toBeInTheDocument();
    expect(listPostingTimes).toHaveBeenCalledWith(
      'credential-1',
      expect.any(AbortSignal),
    );
  });

  it('renders catalog-backed visible and accessible control labels', async () => {
    render(<CredentialPostingTimesEditor credentialId="credential-1" />);

    await screen.findByText('09:00');

    expect(
      screen.getByRole('button', { name: 'Remove 09:00' }),
    ).toHaveTextContent('Remove');
    expect(screen.getByLabelText('New posting time')).toBeInTheDocument();
    expect(screen.getByText('Add a time')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('adds a posting time and persists it', async () => {
    render(<CredentialPostingTimesEditor credentialId="credential-1" />);

    await screen.findByText('09:00');
    fireEvent.change(screen.getByLabelText('New posting time'), {
      target: { value: '13:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(addPostingTime).toHaveBeenCalledWith('credential-1', {
        hour: 13,
        minute: 0,
      });
    });
    expect(await screen.findByText('13:00')).toBeInTheDocument();
  });

  it('removes a posting time so it is no longer used', async () => {
    render(<CredentialPostingTimesEditor credentialId="credential-1" />);

    await screen.findByText('09:00');
    fireEvent.click(screen.getByRole('button', { name: 'Remove 09:00' }));

    await waitFor(() => {
      expect(removePostingTime).toHaveBeenCalledWith('credential-1', {
        hour: 9,
        minute: 0,
      });
    });
    await waitFor(() => {
      expect(screen.queryByText('09:00')).not.toBeInTheDocument();
    });
  });
});
