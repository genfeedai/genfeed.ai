// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentAuthClaimPage from './page';

const useAuthMock = vi.fn();
const useSearchParamsMock = vi.fn();
const resolveAuthTokenMock = vi.fn();

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => useAuthMock(),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => resolveAuthTokenMock(...args),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai/v1' },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@ui/layouts/auth/AuthFormLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    asChild,
    children,
    disabled,
    onClick,
  }: {
    asChild?: boolean;
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) =>
    asChild ? (
      children
    ) : (
      <button disabled={disabled} type="button" onClick={onClick}>
        {children}
      </button>
    ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe('AgentAuthClaimPage', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams({ claim_attempt_token: 'a'.repeat(43) }),
    );
    useAuthMock.mockReturnValue({
      getToken: vi.fn(),
      isLoaded: true,
      isSignedIn: true,
    });
    resolveAuthTokenMock.mockResolvedValue('session-token');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('preserves the opaque claim token through sign-in', () => {
    useAuthMock.mockReturnValue({
      getToken: vi.fn(),
      isLoaded: true,
      isSignedIn: false,
    });

    render(<AgentAuthClaimPage />);

    const link = screen.getByRole('link', { name: 'Sign in to continue' });
    expect(link.getAttribute('href')).toContain(
      encodeURIComponent(
        `/agent-auth/claim?claim_attempt_token=${'a'.repeat(43)}`,
      ),
    );
  });

  it('submits the user code with the authenticated session', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          expires_at: '2026-08-13T16:00:00.000Z',
          requested_scopes: ['videos:read', 'images:create'],
          status: 'pending',
        }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ status: 'claimed' }),
        ok: true,
      });

    render(<AgentAuthClaimPage />);
    await screen.findByText('videos:read');
    fireEvent.change(screen.getByLabelText('Six-digit code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Authorize agent' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.genfeed.ai/v1/agent/auth/claim/complete',
        expect.objectContaining({
          body: JSON.stringify({
            claim_attempt_token: 'a'.repeat(43),
            user_code: '123456',
          }),
          headers: expect.objectContaining({
            Authorization: 'Bearer session-token',
          }),
          method: 'POST',
        }),
      );
    });
    expect(screen.getByText('Agent authorized')).toBeInTheDocument();
  });
});
