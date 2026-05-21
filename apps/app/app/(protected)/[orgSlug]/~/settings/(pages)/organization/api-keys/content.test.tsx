import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsApiKeysPage from './content';

const mocks = vi.hoisted(() => ({
  desktop: false,
  getByokAllProviders: vi.fn(),
  getOrganizationsService: vi.fn(),
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
  useAuthedService: () => mocks.getOrganizationsService,
}));

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

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <section className={className}>{children}</section>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    asChild,
    children,
    isDisabled,
    onClick,
  }: {
    asChild?: boolean;
    children?: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
  }) => {
    if (asChild) {
      return <>{children}</>;
    }

    const text =
      typeof children === 'string' ? children : children ? 'Icon Button' : '';

    return (
      <button type="button" disabled={isDisabled} onClick={onClick}>
        {text}
      </button>
    );
  },
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

vi.mock('@/lib/desktop/runtime', () => ({
  isDesktopShell: () => mocks.desktop,
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

describe('SettingsApiKeysPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.desktop = false;
    mocks.isReady = true;
    mocks.organizationId = 'org-1';
    mocks.getByokAllProviders.mockResolvedValue(providerStatuses());
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

  it('loads hosted BYOK provider state and explains credit behavior', async () => {
    render(<SettingsApiKeysPage />);

    expect(await screen.findByText('API Keys')).toBeInTheDocument();
    expect(
      screen.getByText(/server-configured providers by default/),
    ).toBeInTheDocument();
    expect(screen.getByText(/no credits are deducted/)).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Replicate')).toBeInTheDocument();
    expect(screen.getByText('r8_****1234')).toBeInTheDocument();

    expect(mocks.getByokAllProviders).toHaveBeenCalledWith('org-1');
  });

  it('validates and saves a provider key, then refreshes provider statuses', async () => {
    render(<SettingsApiKeysPage />);

    await screen.findByText('OpenAI');
    fireEvent.click(screen.getByRole('button', { name: 'Add Key' }));
    fireEvent.change(screen.getByPlaceholderText('Enter API key...'), {
      target: { value: 'sk-test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate & Save' }));

    await waitFor(() => {
      expect(mocks.validateByokProviderKey).toHaveBeenCalledWith(
        'org-1',
        'openai',
        'sk-test',
        undefined,
      );
      expect(mocks.saveByokProviderKey).toHaveBeenCalledWith(
        'org-1',
        'openai',
        'sk-test',
        undefined,
      );
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'OpenAI API key saved',
      );
    });
  });

  it('requires provider secrets, reports invalid keys, and removes connected keys', async () => {
    render(<SettingsApiKeysPage />);

    await screen.findByText('Replicate');
    fireEvent.click(screen.getByRole('button', { name: 'Replace Key' }));
    expect(
      screen.getByRole('button', { name: 'Validate & Save' }),
    ).toBeDisabled();

    const secretInputs = screen.getAllByPlaceholderText(/Enter API/);
    fireEvent.change(secretInputs[0], { target: { value: 'r8-new' } });
    fireEvent.change(secretInputs[1], { target: { value: 'secret-new' } });
    mocks.validateByokProviderKey.mockResolvedValueOnce({
      error: 'Invalid replicate key',
      isValid: false,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate & Save' }));

    await waitFor(() => {
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Invalid replicate key',
      );
      expect(mocks.saveByokProviderKey).not.toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Icon Button' }));

    await waitFor(() => {
      expect(mocks.removeByokProviderKey).toHaveBeenCalledWith(
        'org-1',
        'replicate',
      );
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'Replicate API key removed',
      );
    });
  });

  it('renders desktop local provider settings without waiting for organization readiness', () => {
    mocks.desktop = true;
    mocks.isReady = false;
    mocks.organizationId = '';

    render(<SettingsApiKeysPage />);

    expect(screen.getByText('Desktop providers: card')).toBeInTheDocument();
    expect(screen.getByText('API Keys')).toBeInTheDocument();
    expect(mocks.getByokAllProviders).not.toHaveBeenCalled();
  });

  it('logs provider loading and mutation failures', async () => {
    mocks.getByokAllProviders.mockRejectedValueOnce(new Error('load failed'));
    const { unmount } = render(<SettingsApiKeysPage />);

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to fetch BYOK statuses',
        expect.any(Error),
      );
    });

    unmount();
    mocks.getByokAllProviders.mockResolvedValue(providerStatuses());
    render(<SettingsApiKeysPage />);
    await screen.findByText('Replicate');

    mocks.removeByokProviderKey.mockRejectedValueOnce(
      new Error('remove failed'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Icon Button' }));

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to remove BYOK key',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to remove API key',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Replace Key' }));
    fireEvent.change(screen.getByPlaceholderText('Enter API key...'), {
      target: { value: 'r8-new' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter API secret...'), {
      target: { value: 'secret-new' },
    });
    mocks.validateByokProviderKey.mockRejectedValueOnce(
      new Error('save failed'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Validate & Save' }));

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to save BYOK key',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to save API key',
      );
    });
  });
});
