import '@testing-library/jest-dom/vitest';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './content';
import LoginBetterAuth from './login-better-auth';

const authClientMocks = vi.hoisted(() => ({
  email: vi.fn(),
  getSession: vi.fn(),
  magicLink: vi.fn(),
  social: vi.fn(),
}));

const desktopRuntimeMocks = vi.hoisted(() => ({
  eventOrder: [] as string[],
  completeWithCode: vi.fn(),
  enableOfflineMode: vi.fn(),
  getDesktopBridge: vi.fn(),
  login: vi.fn(),
  onDidChangeSession: vi.fn(),
  unsubscribe: vi.fn(),
}));

const desktopLocalWorkspaceFlagMock = vi.hoisted(() => ({
  isEnabled: true,
  isReady: true,
}));

let desktopSessionChangeCallback: ((session: object | null) => void) | null =
  null;

vi.mock('@genfeedai/auth-client', () => ({
  getSession: authClientMocks.getSession,
  signIn: {
    email: authClientMocks.email,
    magicLink: authClientMocks.magicLink,
    social: authClientMocks.social,
  },
}));

vi.mock('@/lib/desktop/runtime', () => ({
  getDesktopBridge: desktopRuntimeMocks.getDesktopBridge,
}));

vi.mock('@/lib/desktop/use-desktop-local-workspace-flag', () => ({
  useDesktopLocalWorkspaceFlag: () => desktopLocalWorkspaceFlagMock,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('@ui/layouts/auth/AuthFormLayout', () => ({
  default: ({
    children,
    description,
    logoSize,
    title,
  }: {
    children: React.ReactNode;
    description?: React.ReactNode;
    logoSize?: string;
    title?: string;
  }) => (
    <div data-logo-size={logoSize} data-testid="auth-form-layout">
      {title ? (
        <>
          <h1>{title}</h1>
          <p>{description}</p>
        </>
      ) : null}
      {children}
    </div>
  ),
}));

const getEmailInput = () => screen.getByRole('textbox', { name: /^Email/ });
const absoluteCallback = (path: string) => {
  if (path === '/') {
    return `${window.location.origin}/`;
  }

  return `${window.location.origin}/?callbackUrl=${encodeURIComponent(path)}`;
};

describe('LoginPage', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    authClientMocks.email.mockReset();
    authClientMocks.email.mockResolvedValue({});
    authClientMocks.getSession.mockReset();
    authClientMocks.getSession.mockResolvedValue({
      data: { session: { id: 'browser-session' } },
      error: null,
    });
    authClientMocks.magicLink.mockReset();
    authClientMocks.magicLink.mockResolvedValue({});
    authClientMocks.social.mockReset();
    authClientMocks.social.mockResolvedValue({});
    desktopRuntimeMocks.eventOrder.length = 0;
    desktopLocalWorkspaceFlagMock.isEnabled = true;
    desktopLocalWorkspaceFlagMock.isReady = true;
    desktopRuntimeMocks.enableOfflineMode.mockReset();
    desktopRuntimeMocks.enableOfflineMode.mockResolvedValue({});
    desktopRuntimeMocks.completeWithCode.mockReset();
    desktopRuntimeMocks.completeWithCode.mockResolvedValue(undefined);
    desktopRuntimeMocks.getDesktopBridge.mockReset();
    desktopRuntimeMocks.login.mockReset();
    desktopRuntimeMocks.login.mockImplementation(async () => {
      desktopRuntimeMocks.eventOrder.push('login');
    });
    desktopRuntimeMocks.onDidChangeSession.mockReset();
    desktopRuntimeMocks.onDidChangeSession.mockImplementation(
      (callback: (session: object | null) => void) => {
        desktopRuntimeMocks.eventOrder.push('subscribe');
        desktopSessionChangeCallback = callback;
        return desktopRuntimeMocks.unsubscribe;
      },
    );
    desktopRuntimeMocks.unsubscribe.mockReset();
    desktopSessionChangeCallback = null;
    desktopRuntimeMocks.getDesktopBridge.mockReturnValue({
      app: {
        enableOfflineMode: desktopRuntimeMocks.enableOfflineMode,
      },
      auth: {
        completeWithCode: desktopRuntimeMocks.completeWithCode,
        login: desktopRuntimeMocks.login,
        onDidChangeSession: desktopRuntimeMocks.onDidChangeSession,
      },
    });
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', undefined);
    window.history.replaceState({}, '', '/login');
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true,
    });
    vi.unstubAllEnvs();
  });

  it('renders the Better Auth sign-in chooser', () => {
    render(<LoginPage />);

    expect(screen.getByTestId('auth-form-layout')).toBeInTheDocument();
    expect(screen.getByTestId('auth-form-layout')).toHaveAttribute(
      'data-logo-size',
      'compact',
    );
    expect(
      screen.getByRole('heading', { name: 'Welcome back' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /^Email/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Google' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in with GitHub' }),
    ).toBeNull();
    expect(screen.getByRole('link', { name: 'Magic Link' })).toHaveAttribute(
      'href',
      '/login/magic-link',
    );
    expect(
      screen.getByRole('link', {
        name: 'Email / Password',
      }),
    ).toHaveAttribute('href', '/login/password');
    expect(desktopRuntimeMocks.getDesktopBridge).not.toHaveBeenCalled();
  });

  it.each([
    ['accepted', 'Invitation accepted. Sign in to continue'],
    ['already-accepted', 'This invitation was already accepted'],
    ['expired', 'This invitation has expired'],
    ['revoked', 'This invitation was revoked'],
    ['invalid', 'This invitation link is invalid'],
  ])('shows a recoverable %s invitation notice', (outcome, message) => {
    window.history.replaceState({}, '', `/login?invitation=${outcome}`);

    render(<LoginPage />);

    expect(screen.getByText(new RegExp(message, 'i'))).toBeVisible();
    expect(screen.getByRole('link', { name: 'Magic Link' })).toBeVisible();
  });

  it('renders the desktop surface from the server snapshot without a web-form flash', () => {
    window.history.replaceState({}, '', '/login');

    render(<LoginPage isDesktopShell />);

    expect(
      screen.getByRole('heading', { name: 'Connect to Genfeed' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Welcome back' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it.each([
    { ui: <LoginPage />, pathname: '/login' },
    { ui: <LoginBetterAuth mode="password" />, pathname: '/login/password' },
    {
      ui: <LoginBetterAuth mode="magic-link" />,
      pathname: '/login/magic-link',
    },
  ])(
    'renders the desktop sign-in surface for $pathname',
    ({ ui, pathname }) => {
      vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
      window.history.replaceState({}, '', pathname);

      render(ui);

      expect(
        screen.getByRole('heading', { name: 'Connect to Genfeed' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Sign in with Genfeed' }),
      ).toBeEnabled();
      expect(
        screen.getByRole('button', { name: 'Use a local workspace' }),
      ).toBeEnabled();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Password/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Send link' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Google' }),
      ).not.toBeInTheDocument();
    },
  );

  it('keeps local workspace as a coming-soon demand signal when the PostHog flag is off', () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    desktopLocalWorkspaceFlagMock.isEnabled = false;
    desktopLocalWorkspaceFlagMock.isReady = true;
    render(<LoginPage />);

    const localModeButton = screen.getByRole('button', {
      name: 'Use a local workspace — coming soon',
    });
    expect(localModeButton).toBeDisabled();
    fireEvent.click(localModeButton);
    expect(desktopRuntimeMocks.enableOfflineMode).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Local workspace is coming soon. Sign in with Genfeed Cloud.',
      ),
    ).toBeVisible();
  });

  it('starts local mode only after the user selects it', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    const locationAssignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        assign: locationAssignMock,
        origin: originalLocation.origin,
      },
      writable: true,
    });
    render(<LoginPage />);

    expect(desktopRuntimeMocks.enableOfflineMode).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Use a local workspace' }),
    );

    await waitFor(() => {
      expect(desktopRuntimeMocks.enableOfflineMode).toHaveBeenCalledOnce();
    });
    expect(locationAssignMock).toHaveBeenCalledWith(APP_ROUTES.DESKTOP.LOCAL);
  });

  it('subscribes before opening the system browser and can return to idle', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in with Genfeed' }),
    );

    await waitFor(() => {
      expect(desktopRuntimeMocks.login).toHaveBeenCalledOnce();
    });
    expect(desktopRuntimeMocks.eventOrder).toEqual(['subscribe', 'login']);
    expect(screen.getByText('Waiting for the browser...')).toBeVisible();
    expect(
      screen.getByText(/Source checkouts cannot open automatically/i),
    ).toBeVisible();
    expect(screen.getByLabelText('Sign-in code')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Use a local workspace' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(
      screen.getByRole('button', { name: 'Sign in with Genfeed' }),
    ).toBeEnabled();
  });

  it('submits a pasted browser code to the desktop bridge', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in with Genfeed' }),
    );

    await waitFor(() => {
      expect(desktopRuntimeMocks.login).toHaveBeenCalledOnce();
    });

    const codeInput = screen.getByLabelText('Sign-in code');
    fireEvent.change(codeInput, { target: { value: ' desktop-code ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue with code' }));

    await waitFor(() => {
      expect(desktopRuntimeMocks.completeWithCode).toHaveBeenCalledWith(
        'desktop-code',
      );
    });
  });

  it('shows the inner desktop error instead of the Electron IPC wrapper', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    desktopRuntimeMocks.completeWithCode.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'desktop:auth:completeWithCode': Error: Sign-in expired. Click Sign in with Genfeed, then paste the new code from that browser tab.",
      ),
    );
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in with Genfeed' }),
    );
    await waitFor(() => {
      expect(desktopRuntimeMocks.login).toHaveBeenCalledOnce();
    });

    fireEvent.change(screen.getByLabelText('Sign-in code'), {
      target: { value: 'stale-code' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue with code' }));

    expect(
      await screen.findByText(
        'Sign-in expired. Click Sign in with Genfeed, then paste the new code from that browser tab.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(/Error invoking remote method/),
    ).not.toBeInTheDocument();
  });

  it('unsubscribes from desktop session changes on unmount', () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    const { unmount } = render(<LoginPage />);

    expect(desktopRuntimeMocks.onDidChangeSession).toHaveBeenCalledOnce();

    unmount();

    expect(desktopRuntimeMocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it('navigates only after the Better Auth browser session is confirmed', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    window.history.replaceState(
      {},
      '',
      '/login?callbackUrl=%2Fsettings%2Fcredits',
    );
    const locationAssignMock = vi.fn(() => {
      desktopRuntimeMocks.eventOrder.push('navigate');
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        assign: locationAssignMock,
        origin: originalLocation.origin,
        search: originalLocation.search,
      },
      writable: true,
    });
    let resolveSessionConfirmation:
      | ((value: { data: { session: { id: string } }; error: null }) => void)
      | undefined;
    authClientMocks.getSession.mockImplementation(
      () =>
        new Promise<{
          data: { session: { id: string } };
          error: null;
        }>((resolve) => {
          resolveSessionConfirmation = resolve;
        }),
    );
    desktopRuntimeMocks.unsubscribe.mockImplementation(() => {
      desktopRuntimeMocks.eventOrder.push('unsubscribe');
    });
    render(<LoginPage />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in with Genfeed' }),
    );

    act(() => {
      desktopSessionChangeCallback?.({ id: 'desktop-session' });
    });

    expect(locationAssignMock).not.toHaveBeenCalled();

    resolveSessionConfirmation?.({
      data: { session: { id: 'browser-session' } },
      error: null,
    });

    await waitFor(() => {
      expect(locationAssignMock).toHaveBeenCalledWith(
        absoluteCallback('/settings/credits'),
      );
    });
    expect(desktopRuntimeMocks.eventOrder).toEqual([
      'subscribe',
      'login',
      'unsubscribe',
      'navigate',
    ]);
  });

  it('returns to idle with an error when browser session confirmation fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    authClientMocks.getSession.mockResolvedValue({ data: null, error: null });
    render(<LoginPage />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in with Genfeed' }),
    );

    act(() => {
      desktopSessionChangeCallback?.({ id: 'desktop-session' });
    });

    expect(
      await screen.findByText(/browser session could not be confirmed/i),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Sign in with Genfeed' }),
    ).toBeEnabled();
  });

  it('renders a disabled desktop state when the bridge is unavailable', () => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    desktopRuntimeMocks.getDesktopBridge.mockReturnValue(null);

    render(<LoginPage />);

    expect(
      screen.getByRole('button', { name: 'Sign in with Genfeed' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/desktop bridge could not be loaded/i),
    ).toBeVisible();
  });

  it('preserves callbackUrl across chooser links', () => {
    window.history.replaceState(
      {},
      '',
      '/login?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );

    render(<LoginPage />);

    expect(screen.getByRole('link', { name: 'Magic Link' })).toHaveAttribute(
      'href',
      '/login/magic-link?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );
    expect(
      screen.getByRole('link', {
        name: 'Email / Password',
      }),
    ).toHaveAttribute(
      'href',
      '/login/password?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );
  });

  it('starts Google sign-in with the default callback URL', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Google' }));

    await waitFor(() => {
      expect(authClientMocks.social).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/'),
        provider: 'google',
      });
    });
  });

  it('preserves callbackUrl when starting Google sign-in', async () => {
    window.history.replaceState({}, '', '/login?return_to=%2Fonboarding');

    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Google' }));

    await waitFor(() => {
      expect(authClientMocks.social).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/onboarding'),
        provider: 'google',
      });
    });
  });

  it('renders the magic-link page form', () => {
    render(<LoginBetterAuth mode="magic-link" />);

    expect(
      screen.getByRole('heading', { name: 'Sign in with a magic link' }),
    ).toBeInTheDocument();
    expect(getEmailInput()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send link' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveClass(
      'h-10',
      'w-full',
    );
  });

  it('sends a magic-link sign-in with the default callback URL', async () => {
    render(<LoginBetterAuth mode="magic-link" />);

    fireEvent.change(getEmailInput(), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));

    await waitFor(() => {
      expect(authClientMocks.magicLink).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/'),
        email: 'user@example.com',
      });
    });
    expect(screen.getByText('Check your email')).toBeInTheDocument();
  });

  it('preserves callbackUrl when requesting a magic link', async () => {
    window.history.replaceState(
      {},
      '',
      '/login/magic-link?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );

    render(<LoginBetterAuth mode="magic-link" />);

    fireEvent.change(getEmailInput(), {
      target: { value: 'cli@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));

    await waitFor(() => {
      expect(authClientMocks.magicLink).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/oauth/cli?port=4321'),
        email: 'cli@example.com',
      });
    });
  });

  it('submits the email password page form', async () => {
    render(<LoginBetterAuth mode="password" />);

    fireEvent.change(getEmailInput(), {
      target: { value: 'saved@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(authClientMocks.email).toHaveBeenCalledWith({
        callbackURL: absoluteCallback('/'),
        email: 'saved@example.com',
        password: 'correct horse battery staple',
      });
    });
  });

  it('links password sign-in users to forgot password with callbackUrl preserved', () => {
    window.history.replaceState(
      {},
      '',
      '/login/password?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );

    render(<LoginBetterAuth mode="password" />);

    expect(
      screen.getByRole('link', { name: 'Forgot password?' }),
    ).toHaveAttribute(
      'href',
      '/forgot-password?callbackUrl=%2Foauth%2Fcli%3Fport%3D4321',
    );
  });
});
