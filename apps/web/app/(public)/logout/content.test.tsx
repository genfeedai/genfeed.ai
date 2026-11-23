import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LogoutPage from './content';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  clearBootRecord: vi.fn(),
  clearPersistedQueryCache: vi.fn().mockResolvedValue(undefined),
  resetAnalytics: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@genfeedai/auth-client', () => ({
  getSession: vi.fn(),
  signIn: { email: vi.fn(), magicLink: vi.fn(), social: vi.fn() },
  signOut: mocks.signOut,
}));

vi.mock('@/lib/analytics', () => ({
  resetAnalytics: mocks.resetAnalytics,
}));

vi.mock('@/lib/boot-record/boot-record', () => ({
  clearBootRecord: mocks.clearBootRecord,
}));

vi.mock('@/lib/query-cache/persisted-query-cache', () => ({
  clearPersistedQueryCache: mocks.clearPersistedQueryCache,
}));

vi.mock('@app/(public)/login/login-better-auth', () => ({
  default: ({
    isActionsDisabled,
    notice,
  }: {
    isActionsDisabled?: boolean;
    notice?: React.ReactNode;
  }) => (
    <div>
      {notice}
      <button disabled={isActionsDisabled} type="button">
        Sign in
      </button>
    </div>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('LogoutPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('shows the sign-in page at once and unlocks it when sign-out answers', async () => {
    const request = deferred<{ error: null }>();
    mocks.signOut.mockReturnValueOnce(request.promise);

    render(<LogoutPage />);

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    expect(screen.queryByText(/Signing out/)).not.toBeInTheDocument();

    await act(async () => {
      request.resolve({ error: null });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    });
  });

  it('clears the device and analytics before the request answers', () => {
    mocks.signOut.mockReturnValueOnce(new Promise(() => {}));

    render(<LogoutPage />);

    expect(mocks.resetAnalytics).toHaveBeenCalledOnce();
    expect(mocks.clearBootRecord).toHaveBeenCalledOnce();
    expect(mocks.clearPersistedQueryCache).toHaveBeenCalledOnce();
  });

  it('retries once, then tells the user and keeps the actions locked', async () => {
    mocks.signOut.mockRejectedValue(new Error('API unavailable'));

    render(<LogoutPage />);

    expect(
      await screen.findByText('loginForm.signOutFailed'),
    ).toBeInTheDocument();
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });

  it('treats an error result as a failure and unlocks after a successful retry', async () => {
    mocks.signOut.mockResolvedValue({ data: null, error: { status: 503 } });

    render(<LogoutPage />);

    const retryButton = await screen.findByRole('button', {
      name: 'loginForm.signOutRetry',
    });
    mocks.signOut.mockResolvedValue({ data: { success: true }, error: null });
    await act(async () => {
      retryButton.click();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    });
    expect(
      screen.queryByText('loginForm.signOutFailed'),
    ).not.toBeInTheDocument();
  });
});
