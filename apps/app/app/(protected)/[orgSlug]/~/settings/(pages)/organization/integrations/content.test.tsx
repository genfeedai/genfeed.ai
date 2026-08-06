import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsIntegrationsPage from './content';

const mocks = vi.hoisted(() => ({
  authedServices: new WeakMap<
    (token: string) => unknown,
    () => Promise<unknown>
  >(),
  desktop: false,
  getByokAllProviders: vi.fn(),
  isReady: true,
  loggerError: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  organizationId: 'org-1',
  removeByokProviderKey: vi.fn(),
  saveByokProviderKey: vi.fn(),
  validateByokProviderKey: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    isReady: mocks.isReady,
    organizationId: mocks.organizationId,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const existingService = mocks.authedServices.get(factory);
    if (existingService) {
      return existingService;
    }
    const service = async () => factory('test-token');
    mocks.authedServices.set(factory, service);
    return service;
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
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

vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="hi-chevron-down" />,
  ChevronRight: () => <span data-testid="hi-chevron-right" />,
  Clipboard: () => <span data-testid="hi-clipboard-document" />,
  Plus: () => <span data-testid="hi-plus" />,
  RefreshCw: () => <span data-testid="hi-arrow-path" />,
  Trash2: () => <span data-testid="hi-trash" />,
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => (
    <div className={className} data-testid="card">
      {children}
    </div>
  ),
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isDesktopClient: () => mocks.desktop,
  isSelfHostedDeployment: () => false,
}));

vi.mock('@/components/desktop/DesktopLocalProviderSettings', () => ({
  default: ({ variant }: { variant: string }) => (
    <div>Desktop providers: {variant}</div>
  ),
}));

function providerStatuses() {
  return [
    {
      docsUrl: 'https://platform.openai.com/api-keys',
      hasKey: false,
      isEnabled: false,
      isValid: false,
      label: 'OpenAI',
      maskedKey: null,
      provider: 'openai',
      requiresSecret: false,
    },
    {
      docsUrl: 'https://replicate.com/account/api-tokens',
      hasKey: true,
      isEnabled: true,
      isValid: true,
      label: 'Replicate',
      maskedKey: 'r8_****1234',
      provider: 'replicate',
      requiresSecret: true,
    },
  ];
}

describe('SettingsIntegrationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.desktop = false;
    mocks.isReady = true;
    mocks.organizationId = 'org-1';
    mocks.getByokAllProviders.mockResolvedValue(providerStatuses());
    mocks.removeByokProviderKey.mockResolvedValue({});
    mocks.saveByokProviderKey.mockResolvedValue({});
    mocks.validateByokProviderKey.mockResolvedValue({ isValid: true });
  });

  it('loads hosted BYOK provider state and explains credit behavior', async () => {
    render(<SettingsIntegrationsPage />);

    expect(
      await screen.findByText(/server-configured providers by default/),
    ).toBeInTheDocument();
    expect(screen.getByText(/do not deduct credits/)).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Replicate')).toBeInTheDocument();
    expect(screen.getByText('r8_****1234')).toBeInTheDocument();
    expect(mocks.getByokAllProviders).toHaveBeenCalledWith('org-1');
  });

  it('validates and saves a provider key, then refreshes provider statuses', async () => {
    render(<SettingsIntegrationsPage />);

    await screen.findByText('OpenAI');
    fireEvent.click(screen.getByRole('button', { name: 'Add Key' }));
    fireEvent.change(screen.getByPlaceholderText('Enter API key...'), {
      target: { value: 'sk-test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate & Save' }));

    await waitFor(() => {
      expect(mocks.validateByokProviderKey).toHaveBeenCalled();
      expect(mocks.saveByokProviderKey).toHaveBeenCalled();
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'OpenAI API key saved',
      );
    });
  });

  it('renders desktop local provider settings without waiting for organization readiness', () => {
    mocks.desktop = true;
    mocks.isReady = false;
    mocks.organizationId = '';

    render(<SettingsIntegrationsPage />);

    expect(screen.getByText('Desktop providers: card')).toBeInTheDocument();
    expect(mocks.getByokAllProviders).not.toHaveBeenCalled();
  });
});
