import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import CredentialsGuard from '@ui/guards/credentials/CredentialsGuard';

const useBrand = vi.fn();

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrand(),
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    apps: { app: 'https://app.test' },
  },
}));

describe('CredentialsGuard', () => {
  it('shows a loading status while the brand context is not ready', () => {
    useBrand.mockReturnValue({
      isReady: false,
      selectedBrand: null,
    });

    render(
      <CredentialsGuard>
        <p>Protected</p>
      </CredentialsGuard>,
    );

    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('renders the empty-state CTA when no social accounts are connected', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    useBrand.mockReturnValue({
      isReady: true,
      selectedBrand: { credentials: [{ isConnected: false }] },
    });

    render(
      <CredentialsGuard>
        <p>Protected</p>
      </CredentialsGuard>,
    );

    expect(
      screen.getByText('No Social Accounts Connected'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Connect Account' }));
    expect(open).toHaveBeenCalledWith('https://app.test/brands', '_blank');
    open.mockRestore();
  });

  it('renders children once a connected credential exists', () => {
    useBrand.mockReturnValue({
      isReady: true,
      selectedBrand: { credentials: [{ isConnected: true }] },
    });

    render(
      <CredentialsGuard>
        <p>Protected</p>
      </CredentialsGuard>,
    );

    expect(screen.getByText('Protected')).toBeInTheDocument();
    expect(
      screen.queryByText('No Social Accounts Connected'),
    ).not.toBeInTheDocument();
  });
});
