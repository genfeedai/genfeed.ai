import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsApiKeysPage from './content';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (path: string) =>
      `/test-org/~${path.startsWith('/') ? path : `/${path}`}`,
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mocks = vi.hoisted(() => ({
  authedServices: new WeakMap<
    (token: string) => unknown,
    () => Promise<unknown>
  >(),
  createApiKey: vi.fn(),
  desktop: false,
  authEnabled: true,
  sessionId: 'session-1',
  routeSlug: 'test-org',
  confirmedSlug: 'test-org',
  confirmedId: 'org-1',
  confirmed: true,
  status: 'matched',
  tokenWait: null as Promise<void> | null,
  cancelPendingRequests: vi.fn(),
  boundFactory: vi.fn(),
  findAllApiKeys: vi.fn(),
  getApiKeysService: vi.fn(),
  getByokAllProviders: vi.fn(),
  getOrganizationsService: vi.fn(),
  isReady: true,
  isSelfHosted: false,
  loggerError: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  organizationId: 'org-1',
  removeByokProviderKey: vi.fn(),
  revokeApiKey: vi.fn(),
  rotateApiKey: vi.fn(),
  saveByokProviderKey: vi.fn(),
  settingsSubscriptionTier: 'pro',
  validateByokProviderKey: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    isReady: mocks.isReady,
    organizationId: mocks.organizationId,
    settings: { subscriptionTier: mocks.settingsSubscriptionTier },
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const existingService = mocks.authedServices.get(factory);

    if (existingService) {
      return existingService;
    }

    const service = async () => {
      await mocks.tokenWait;
      return factory('test-token');
    };
    mocks.authedServices.set(factory, service);
    return service;
  },
}));

vi.mock('@genfeedai/auth-client', () => ({
  isBetterAuthEnabled: () => mocks.authEnabled,
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    sessionId: mocks.sessionId,
    userId: 'user-1',
    orgId: mocks.confirmedId,
  }),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: mocks.routeSlug }),
}));
vi.mock(
  '@genfeedai/contexts/user/organization-context/organization-context',
  () => ({
    useRoutedOrganization: () => ({
      status: mocks.status,
      isRouteConfirmed: mocks.confirmed,
      confirmedOrganizationId: mocks.confirmedId,
      confirmedOrganizationSlug: mocks.confirmedSlug,
    }),
  }),
);

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationsError,
      success: mocks.notificationsSuccess,
    }),
  },
}));

vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: () => ({
      getByokAllProviders: mocks.getByokAllProviders,
      removeByokProviderKey: mocks.removeByokProviderKey,
      saveByokProviderKey: mocks.saveByokProviderKey,
      validateByokProviderKey: mocks.validateByokProviderKey,
    }),
  },
}));

vi.mock('@services/management/api-keys.service', () => ({
  ApiKeysService: {
    forOrganization: (token: string, organizationId: string) => {
      mocks.boundFactory(token, organizationId);
      return {
        cancelPendingRequests: mocks.cancelPendingRequests,
        createApiKey: mocks.createApiKey,
        findAll: mocks.findAllApiKeys,
        revokeApiKey: mocks.revokeApiKey,
        rotateApiKey: mocks.rotateApiKey,
      };
    },
    getInstance: () => ({
      cancelPendingRequests: mocks.cancelPendingRequests,
      createApiKey: mocks.createApiKey,
      findAll: mocks.findAllApiKeys,
      revokeApiKey: mocks.revokeApiKey,
      rotateApiKey: mocks.rotateApiKey,
    }),
  },
}));

vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="hi-chevron-down" />,
  ChevronRight: () => <span data-testid="hi-chevron-right" />,
  Clipboard: () => <span data-testid="hi-clipboard-document" />,
  Lock: () => <span data-testid="hi-lock-closed" />,
  Plus: () => <span data-testid="hi-plus" />,
  RefreshCw: () => <span data-testid="hi-arrow-path" />,
  Trash2: () => <span data-testid="hi-trash" />,
  TriangleAlert: () => <span data-testid="hi-triangle-alert" />,
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    bodyClassName,
    children,
    className,
    description,
    headerAction,
    label,
    ...props
  }: {
    bodyClassName?: string;
    children: ReactNode;
    className?: string;
    description?: string;
    headerAction?: ReactNode;
    label?: string;
  } & React.HTMLAttributes<HTMLElement>) => (
    <section className={className} {...props}>
      {(label || description || headerAction) && (
        <div>
          {label ? <h3>{label}</h3> : null}
          {description ? <p>{description}</p> : null}
          {headerAction}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  ),
}));

function resolveButtonLabel(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) {
    return children
      .map(resolveButtonLabel)
      .filter((label) => label !== 'Icon Button')
      .join(' ');
  }
  if (children != null) return 'Icon Button';
  return '';
}

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    asChild,
    children,
    className: _className,
    isDisabled,
    onClick,
    variant: _variant,
    ...buttonProps
  }: {
    asChild?: boolean;
    children?: ReactNode;
    className?: string;
    isDisabled?: boolean;
    onClick?: () => void;
    variant?: unknown;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
    if (asChild) {
      return <>{children}</>;
    }

    return (
      <button
        type="button"
        disabled={isDisabled}
        onClick={onClick}
        {...buttonProps}
      >
        {resolveButtonLabel(children)}
      </button>
    );
  },
}));

vi.mock('@ui/primitives/checkbox', () => ({
  Checkbox: ({
    isChecked,
    label,
    onCheckedChange,
  }: {
    isChecked?: boolean;
    label?: ReactNode;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <label>
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
      />
      {label}
    </label>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('@/components/desktop/DesktopLocalProviderSettings', () => ({
  default: ({ variant }: { variant?: string }) => (
    <div>Desktop providers: {variant}</div>
  ),
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isDesktopClient: () => mocks.desktop,
  isSelfHostedDeployment: () => mocks.isSelfHosted,
}));

function providerStatuses() {
  return [
    {
      description: 'Hosted OpenAI fallback remains available.',
      docsUrl: 'https://platform.openai.com',
      hasKey: false,
      isEnabled: false,
      label: 'OpenAI',
      provider: 'openai',
      requiresSecret: false,
    },
    {
      description: 'Replicate model access.',
      docsUrl: 'https://replicate.com',
      hasKey: true,
      isEnabled: true,
      label: 'Replicate',
      maskedKey: 'r8_****1234',
      provider: 'replicate',
      requiresSecret: true,
    },
  ];
}

function productApiKeys() {
  return [
    {
      id: 'key-1',
      label: 'MCP Key',
      lastUsedAt: null,
      scopes: ['videos:read', 'analytics:read'],
    },
  ];
}

describe('SettingsApiKeysPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.desktop = false;
    mocks.authEnabled = true;
    mocks.sessionId = 'session-1';
    mocks.routeSlug = mocks.confirmedSlug = 'test-org';
    mocks.confirmedId = 'org-1';
    mocks.confirmed = true;
    mocks.status = 'matched';
    mocks.tokenWait = null;
    mocks.isReady = true;
    mocks.isSelfHosted = false;
    mocks.organizationId = 'org-1';
    mocks.settingsSubscriptionTier = 'pro';
    mocks.getByokAllProviders.mockResolvedValue(providerStatuses());
    mocks.findAllApiKeys.mockResolvedValue(productApiKeys());
    mocks.createApiKey.mockResolvedValue({
      id: 'key-2',
      key: 'gf_test_created',
      label: 'MCP Server',
      scopes: ['videos:read'],
    });
    mocks.revokeApiKey.mockResolvedValue({
      id: 'key-1',
      isRevoked: true,
      label: 'MCP Key',
    });
    mocks.rotateApiKey.mockResolvedValue({
      id: 'key-3',
      key: 'gf_test_rotated',
      label: 'MCP Key',
      scopes: ['videos:read'],
    });
    mocks.getApiKeysService.mockResolvedValue({
      createApiKey: mocks.createApiKey,
      findAll: mocks.findAllApiKeys,
      revokeApiKey: mocks.revokeApiKey,
      rotateApiKey: mocks.rotateApiKey,
    });
    mocks.getOrganizationsService.mockResolvedValue({
      getByokAllProviders: mocks.getByokAllProviders,
      removeByokProviderKey: mocks.removeByokProviderKey,
      saveByokProviderKey: mocks.saveByokProviderKey,
      validateByokProviderKey: mocks.validateByokProviderKey,
    });
    mocks.removeByokProviderKey.mockResolvedValue({});
    mocks.saveByokProviderKey.mockResolvedValue({});
    mocks.validateByokProviderKey.mockResolvedValue({ isValid: true });
  });

  it.each(['selected', 'slug', 'confirmation', 'status'])(
    'blocks a %s mismatch and loads after reconciliation',
    async (mismatch) => {
      if (mismatch === 'selected') mocks.organizationId = 'org-other';
      if (mismatch === 'slug') mocks.routeSlug = 'other';
      if (mismatch === 'confirmation') mocks.confirmed = false;
      if (mismatch === 'status') mocks.status = 'reconciling';
      const view = render(<SettingsApiKeysPage />);
      await act(async () => {});
      expect(mocks.findAllApiKeys).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('button', { name: 'Create Key' }),
      ).not.toBeInTheDocument();
      mocks.organizationId = 'org-1';
      mocks.routeSlug = 'test-org';
      mocks.confirmed = true;
      mocks.status = 'matched';
      view.rerender(<SettingsApiKeysPage />);
      await screen.findByText('MCP Key');
      expect(mocks.boundFactory).toHaveBeenCalledWith('test-token', 'org-1');
    },
  );

  it('only bypasses confirmation for keyless self-hosting', async () => {
    mocks.isSelfHosted = true;
    mocks.confirmed = false;
    const view = render(<SettingsApiKeysPage />);
    await act(async () => {});
    expect(mocks.findAllApiKeys).not.toHaveBeenCalled();
    mocks.authEnabled = false;
    view.rerender(<SettingsApiKeysPage />);
    await screen.findByText('MCP Key');
    expect(mocks.boundFactory).not.toHaveBeenCalled();
  });

  it.each(['loaded', 'deferred'])(
    'does not cancel shared keyless services after %s acquisition and unmount',
    async (phase) => {
      mocks.isSelfHosted = true;
      mocks.authEnabled = false;
      mocks.confirmed = false;
      const token = deferred<void>();
      if (phase === 'deferred') mocks.tokenWait = token.promise;
      const view = render(<SettingsApiKeysPage />);
      if (phase === 'loaded') await screen.findByText('MCP Key');
      view.unmount();
      if (phase === 'deferred') await act(async () => token.resolve());
      expect(mocks.cancelPendingRequests).not.toHaveBeenCalled();
      expect(mocks.notificationsError).not.toHaveBeenCalled();
      expect(mocks.findAllApiKeys).toHaveBeenCalledTimes(
        phase === 'loaded' ? 1 : 0,
      );
    },
  );

  it('does not dispatch after deferred token acquisition outlives the scope', async () => {
    const token = deferred<void>();
    mocks.tokenWait = token.promise;
    const view = render(<SettingsApiKeysPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Key' }));
    mocks.confirmed = false;
    view.rerender(<SettingsApiKeysPage />);
    await act(async () => token.resolve());
    expect(mocks.findAllApiKeys).not.toHaveBeenCalled();
    expect(mocks.createApiKey).not.toHaveBeenCalled();
    expect(mocks.notificationsError).not.toHaveBeenCalled();
  });

  it.each(['initial', 'refresh'])(
    'ignores stale %s results through A to B to A',
    async (kind) => {
      const pending = deferred<unknown[]>();
      if (kind === 'initial')
        mocks.findAllApiKeys.mockReturnValueOnce(pending.promise);
      const view = render(<SettingsApiKeysPage />);
      if (kind === 'refresh') {
        await screen.findByText('MCP Key');
        mocks.findAllApiKeys.mockReturnValueOnce(pending.promise);
        fireEvent.click(
          screen.getByRole('button', { name: 'Refresh Genfeed API keys' }),
        );
      }
      await waitFor(() => expect(mocks.findAllApiKeys).toHaveBeenCalled());
      mocks.organizationId = mocks.confirmedId = 'org-2';
      mocks.routeSlug = mocks.confirmedSlug = 'second';
      view.rerender(<SettingsApiKeysPage />);
      await screen.findByText('MCP Key');
      mocks.organizationId = mocks.confirmedId = 'org-1';
      mocks.routeSlug = mocks.confirmedSlug = 'test-org';
      view.rerender(<SettingsApiKeysPage />);
      await screen.findByText('MCP Key');
      await act(async () =>
        pending.resolve([{ id: 'stale', label: 'STALE SECRET' }]),
      );
      expect(screen.queryByText('STALE SECRET')).not.toBeInTheDocument();
      expect(mocks.notificationsError).not.toHaveBeenCalled();
    },
  );

  it.each(['Create Key', 'Rotate', 'Revoke'])(
    'makes %s continuations inert after switching, including rejection',
    async (action) => {
      const pending = deferred<unknown>();
      const method =
        action === 'Create Key'
          ? mocks.createApiKey
          : action === 'Rotate'
            ? mocks.rotateApiKey
            : mocks.revokeApiKey;
      method.mockReturnValueOnce(pending.promise);
      const view = render(<SettingsApiKeysPage />);
      await screen.findByText('MCP Key');
      fireEvent.click(screen.getByRole('button', { name: action }));
      await waitFor(() => expect(method).toHaveBeenCalled());
      mocks.organizationId = mocks.confirmedId = 'org-2';
      mocks.routeSlug = mocks.confirmedSlug = 'second';
      view.rerender(<SettingsApiKeysPage />);
      await screen.findByText('MCP Key');
      const fetchCount = mocks.findAllApiKeys.mock.calls.length;
      await act(async () =>
        pending.resolve({ id: 'old', key: 'STALE SECRET' }),
      );
      expect(mocks.findAllApiKeys).toHaveBeenCalledTimes(fetchCount);
      expect(screen.queryByText('STALE SECRET')).not.toBeInTheDocument();
      expect(mocks.notificationsSuccess).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: action })).toBeEnabled();
      const failure = deferred<unknown>();
      method.mockReturnValueOnce(failure.promise);
      fireEvent.click(screen.getByRole('button', { name: action }));
      await waitFor(() => expect(method).toHaveBeenCalledTimes(2));
      view.unmount();
      await act(async () => failure.reject(new Error('old scope failed')));
      expect(mocks.notificationsError).not.toHaveBeenCalled();
    },
  );

  it.each(['Create Key', 'Rotate', 'Revoke'])(
    'does not dispatch %s after token resolution following identity replacement',
    async (action) => {
      const view = render(<SettingsApiKeysPage />);
      await screen.findByText('MCP Key');
      const pending = deferred<void>();
      mocks.tokenWait = pending.promise;
      fireEvent.click(screen.getByRole('button', { name: action }));
      mocks.sessionId = 'session-2';
      mocks.tokenWait = null;
      view.rerender(<SettingsApiKeysPage />);
      await screen.findByText('MCP Key');
      await act(async () => pending.resolve());
      expect(mocks.createApiKey).not.toHaveBeenCalled();
      expect(mocks.rotateApiKey).not.toHaveBeenCalled();
      expect(mocks.revokeApiKey).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: action })).toBeEnabled();
    },
  );

  it.each(['Create Key', 'Rotate', 'Revoke'])(
    'ignores %s completion after A to B to A without clearing new busy state',
    async (action) => {
      const method =
        action === 'Create Key'
          ? mocks.createApiKey
          : action === 'Rotate'
            ? mocks.rotateApiKey
            : mocks.revokeApiKey;
      const old = deferred<unknown>();
      method.mockReturnValueOnce(old.promise);
      const view = render(<SettingsApiKeysPage />);
      await screen.findByText('MCP Key');
      fireEvent.click(screen.getByRole('button', { name: action }));
      await waitFor(() => expect(method).toHaveBeenCalledTimes(1));
      mocks.organizationId = mocks.confirmedId = 'org-2';
      mocks.routeSlug = mocks.confirmedSlug = 'second';
      view.rerender(<SettingsApiKeysPage />);
      await screen.findByText('MCP Key');
      mocks.organizationId = mocks.confirmedId = 'org-1';
      mocks.routeSlug = mocks.confirmedSlug = 'test-org';
      view.rerender(<SettingsApiKeysPage />);
      await screen.findByText('MCP Key');
      const current = deferred<unknown>();
      method.mockReturnValueOnce(current.promise);
      fireEvent.click(screen.getByRole('button', { name: action }));
      await waitFor(() => expect(method).toHaveBeenCalledTimes(2));
      await act(async () => old.resolve({ id: 'old', key: 'STALE SECRET' }));
      expect(screen.queryByText('STALE SECRET')).not.toBeInTheDocument();
      expect(mocks.notificationsSuccess).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', {
          name: action === 'Create Key' ? 'Creating...' : action,
        }),
      ).toBeDisabled();
      view.unmount();
      await act(async () =>
        current.resolve({ id: 'current', key: 'UNMOUNTED SECRET' }),
      );
      expect(mocks.notificationsSuccess).not.toHaveBeenCalled();
    },
  );

  it.each(['initial', 'refresh'])(
    'suppresses stale %s errors after identity replacement',
    async (kind) => {
      const pending = deferred<unknown[]>();
      if (kind === 'initial')
        mocks.findAllApiKeys.mockReturnValueOnce(pending.promise);
      const view = render(<SettingsApiKeysPage />);
      if (kind === 'refresh') {
        await screen.findByText('MCP Key');
        mocks.findAllApiKeys.mockReturnValueOnce(pending.promise);
        fireEvent.click(
          screen.getByRole('button', { name: 'Refresh Genfeed API keys' }),
        );
      }
      await waitFor(() =>
        expect(mocks.findAllApiKeys).toHaveBeenCalledTimes(
          kind === 'initial' ? 1 : 2,
        ),
      );
      mocks.sessionId = 'session-2';
      view.rerender(<SettingsApiKeysPage />);
      await screen.findByText('MCP Key');
      await act(async () => pending.reject(new Error('stale request failed')));
      expect(
        screen.queryByText("Couldn't load API keys"),
      ).not.toBeInTheDocument();
      expect(mocks.notificationsError).not.toHaveBeenCalled();
      expect(mocks.loggerError).not.toHaveBeenCalled();
    },
  );

  it.each(['initial', 'Create Key', 'Rotate', 'Revoke'])(
    'silently handles dispatch cancellation during %s before React reconciliation',
    async (operation) => {
      const cancellation = { isCancelled: true, silent: true };
      if (operation === 'initial')
        mocks.findAllApiKeys.mockRejectedValueOnce(cancellation);
      const view = render(<SettingsApiKeysPage />);
      if (operation !== 'initial') {
        await screen.findByText('MCP Key');
        const method =
          operation === 'Create Key'
            ? mocks.createApiKey
            : operation === 'Rotate'
              ? mocks.rotateApiKey
              : mocks.revokeApiKey;
        method.mockRejectedValueOnce(cancellation);
        fireEvent.click(screen.getByRole('button', { name: operation }));
        await waitFor(() => expect(method).toHaveBeenCalled());
      }
      await act(async () => {});
      expect(mocks.notificationsError).not.toHaveBeenCalled();
      expect(mocks.loggerError).not.toHaveBeenCalled();
      expect(
        screen.queryByText("Couldn't load API keys"),
      ).not.toBeInTheDocument();
      view.unmount();
    },
  );

  it('loads Genfeed API keys without provider tabs', async () => {
    render(<SettingsApiKeysPage />);

    expect(await screen.findByText('API keys')).toBeInTheDocument();
    expect(await screen.findByText('MCP Key')).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Genfeed keys' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Provider keys' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('OpenAI')).not.toBeInTheDocument();
    expect(mocks.findAllApiKeys).toHaveBeenCalledWith(
      { limit: 100 },
      expect.any(AbortSignal),
    );
  });

  it('switches scope presets and reflects the active preset', async () => {
    render(<SettingsApiKeysPage />);

    await screen.findByText('MCP Key');

    const mcp = screen.getByRole('button', { name: 'MCP' });
    const read = screen.getByRole('button', { name: 'Read' });
    const content = screen.getByRole('button', { name: 'Content' });

    expect(mcp).toHaveAttribute('aria-pressed', 'true');
    expect(read).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(read);
    expect(read).toHaveAttribute('aria-pressed', 'true');
    expect(mcp).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(content);
    expect(content).toHaveAttribute('aria-pressed', 'true');
    expect(read).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not let a stale list overwrite a key created during the initial load', async () => {
    let resolveInitialLoad: (value: unknown[]) => void = () => undefined;
    mocks.findAllApiKeys
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveInitialLoad = resolve;
          }),
      )
      .mockResolvedValueOnce([
        {
          id: 'key-2',
          label: 'Created During Load',
          lastUsedAt: null,
          scopes: ['videos:read'],
        },
      ]);

    render(<SettingsApiKeysPage />);

    expect(await screen.findByText('Loading keys...')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create Key' }));

    await waitFor(() => {
      expect(mocks.createApiKey).toHaveBeenCalled();
    });
    expect(await screen.findByText('gf_test_created')).toBeInTheDocument();
    expect(await screen.findByText('Created During Load')).toBeInTheDocument();

    resolveInitialLoad([]);

    await waitFor(() => {
      expect(screen.getByText('Created During Load')).toBeInTheDocument();
    });
    expect(
      screen.queryByText('No active Genfeed API keys.'),
    ).not.toBeInTheDocument();
  });

  it('creates a key from an empty list using the default name', async () => {
    mocks.findAllApiKeys.mockResolvedValue([]);
    render(<SettingsApiKeysPage />);

    expect(
      await screen.findByText('No active Genfeed API keys.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create Key' }));

    await waitFor(() => {
      expect(mocks.createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'MCP Server',
          scopes: expect.arrayContaining(['videos:read', 'analytics:read']),
        }),
      );
    });
    expect(screen.getByText('gf_test_created')).toBeInTheDocument();
  });

  it('creates a Genfeed API key and shows the plain key once', async () => {
    render(<SettingsApiKeysPage />);

    await screen.findByText('MCP Key');
    fireEvent.change(screen.getByPlaceholderText('MCP Server'), {
      target: { value: 'Automation MCP' },
    });
    fireEvent.change(screen.getByPlaceholderText('Used by local MCP server'), {
      target: { value: 'Used by CI' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Key' }));

    await waitFor(() => {
      expect(mocks.createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Used by CI',
          label: 'Automation MCP',
          scopes: expect.arrayContaining(['videos:read', 'analytics:read']),
        }),
      );
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'API key created',
      );
    });

    expect(screen.getByText('gf_test_created')).toBeInTheDocument();
  });

  it('keeps Create Key enabled while the key list is loading', async () => {
    mocks.findAllApiKeys.mockImplementation(() => new Promise(() => undefined));
    render(<SettingsApiKeysPage />);

    expect(await screen.findByText('Loading keys...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Key' })).toBeEnabled();
  });

  it('enables Create Key when the Pro org has no keys', async () => {
    mocks.findAllApiKeys.mockResolvedValue([]);
    render(<SettingsApiKeysPage />);

    expect(
      await screen.findByText('No active Genfeed API keys.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Key' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Refresh Genfeed API keys' }),
    ).toBeEnabled();
  });

  it('shows list-load error UI without disabling Create Key', async () => {
    mocks.findAllApiKeys.mockRejectedValue(new Error('keys unavailable'));
    render(<SettingsApiKeysPage />);

    expect(
      await screen.findByText("Couldn't load API keys"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Failed to load API keys. You can still create a new key, or refresh the list.',
      ),
    ).toBeInTheDocument();
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to load API keys',
    );
    expect(screen.getByRole('button', { name: 'Create Key' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Refresh Genfeed API keys' }),
    ).toBeEnabled();
  });

  it('locks the API keys page for free-tier organizations', async () => {
    mocks.settingsSubscriptionTier = 'free';
    render(<SettingsApiKeysPage />);

    expect(
      await screen.findByText('Unlock API keys with Pro'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/API access is included on paid plans/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Upgrade to Pro/i }),
    ).toHaveAttribute(
      'href',
      expect.stringContaining('/settings/subscription'),
    );
    expect(
      screen.queryByRole('button', { name: 'Create Key' }),
    ).not.toBeInTheDocument();
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });

  it('rotates and revokes Genfeed API keys', async () => {
    render(<SettingsApiKeysPage />);

    await screen.findByText('MCP Key');
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));

    await waitFor(() => {
      expect(mocks.rotateApiKey).toHaveBeenCalledWith('key-1');
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'API key rotated',
      );
    });
    expect(screen.getByText('gf_test_rotated')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(mocks.revokeApiKey).toHaveBeenCalledWith('key-1');
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'API key revoked',
      );
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
