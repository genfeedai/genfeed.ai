import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImpersonationBanner from './impersonation-banner';

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  stopImpersonating: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('@genfeedai/auth-client', () => ({
  authClient: {
    admin: {
      stopImpersonating: mocks.stopImpersonating,
    },
  },
  useSession: mocks.useSession,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

const originalLocation = window.location;

function mockImpersonatedSession() {
  mocks.useSession.mockReturnValue({
    data: {
      session: { impersonatedBy: 'operator-1' },
      user: { email: 'jane@example.com', name: 'Jane Doe' },
    },
  });
}

describe('ImpersonationBanner', () => {
  const locationAssign = vi.fn();

  beforeEach(() => {
    mocks.loggerError.mockReset();
    mocks.stopImpersonating.mockReset();
    mocks.useSession.mockReset();
    locationAssign.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: locationAssign },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true,
    });
  });

  it('renders nothing without an impersonated session', () => {
    mocks.useSession.mockReturnValue({
      data: {
        session: { impersonatedBy: null },
        user: { email: 'jane@example.com', name: 'Jane Doe' },
      },
    });

    render(<ImpersonationBanner />);

    expect(
      screen.queryByTestId('impersonation-banner'),
    ).not.toBeInTheDocument();
  });

  it('renders nothing while the session is still loading', () => {
    mocks.useSession.mockReturnValue({ data: null });

    render(<ImpersonationBanner />);

    expect(
      screen.queryByTestId('impersonation-banner'),
    ).not.toBeInTheDocument();
  });

  it('names the impersonated user while impersonating', () => {
    mockImpersonatedSession();

    render(<ImpersonationBanner />);

    expect(screen.getByTestId('impersonation-banner')).toBeInTheDocument();
    expect(screen.getByText('Viewing as Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Exit')).toBeInTheDocument();
  });

  it('falls back to the email when the user has no name', () => {
    mocks.useSession.mockReturnValue({
      data: {
        session: { impersonatedBy: 'operator-1' },
        user: { email: 'jane@example.com', name: '' },
      },
    });

    render(<ImpersonationBanner />);

    expect(screen.getByText('Viewing as jane@example.com')).toBeInTheDocument();
  });

  it('stops impersonating and returns to the admin users list on Exit', async () => {
    mockImpersonatedSession();
    mocks.stopImpersonating.mockResolvedValue({ data: {}, error: null });

    render(<ImpersonationBanner />);
    fireEvent.click(screen.getByText('Exit'));

    await waitFor(() => {
      expect(mocks.stopImpersonating).toHaveBeenCalledTimes(1);
      expect(locationAssign).toHaveBeenCalledWith(
        '/admin/administration/users',
      );
    });
  });

  it('keeps the banner and logs when stop impersonating fails', async () => {
    mockImpersonatedSession();
    mocks.stopImpersonating.mockResolvedValue({
      data: null,
      error: { message: 'admin session missing' },
    });

    render(<ImpersonationBanner />);
    fireEvent.click(screen.getByText('Exit'));

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to stop impersonating',
        expect.any(Error),
      );
    });
    expect(locationAssign).not.toHaveBeenCalled();
    expect(screen.getByTestId('impersonation-banner')).toBeInTheDocument();
    expect(
      screen.getByText('Unable to exit impersonation. Try again.'),
    ).toBeInTheDocument();
  });
});
