import '@testing-library/jest-dom/vitest';
import { MemberRole } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createContext, type ReactNode, use } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationRailDefaultsCard from './organization-rail-defaults-card';

const mocks = vi.hoisted(() => ({
  clearBootstrap: vi.fn(),
  getService: vi.fn(),
  isLoading: false,
  loggerError: vi.fn(),
  organizationId: 'org-1',
  patchSettings: vi.fn(),
  refresh: vi.fn(),
  role: 'owner',
  settings: {
    defaultHomeAppId: null,
    defaultRailOrder: [],
    hasOrganizationBilling: true,
    isReleasePreviewEnabled: true,
    moduleOverrides: {},
  } as Record<string, unknown>,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: mocks.organizationId }),
}));
vi.mock(
  '@genfeedai/contexts/providers/protected-bootstrap/client-protected-bootstrap',
  () => ({ clearClientProtectedBootstrapCache: mocks.clearBootstrap }),
);
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@genfeedai/hooks/feature-flags/provider', () => ({
  useFeatureFlagContext: () => ({
    flags: {
      release_analytics: true,
      release_discovery: true,
      release_publishing: true,
      release_turbo: true,
    },
    isConfigured: true,
    isReady: true,
  }),
}));
vi.mock('@hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => mocks.role,
}));
vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: () => ({
    isLoading: mocks.isLoading,
    refresh: mocks.refresh,
    settings: mocks.settings,
  }),
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));
vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    'data-testid': testId,
    label,
  }: {
    children: ReactNode;
    'data-testid'?: string;
    label?: string;
  }) => (
    <section data-testid={testId}>
      <h2>{label}</h2>
      {children}
    </section>
  ),
}));
// Radix Select needs pointer APIs jsdom lacks; a context-backed stand-in keeps
// the value and change handler real.
vi.mock('@ui/primitives/select', () => {
  const SelectContext = createContext<(value: string) => void>(() => {});
  return {
    Select: ({
      children,
      onValueChange,
      value,
    }: {
      children?: ReactNode;
      onValueChange?: (value: string) => void;
      value?: string;
    }) => (
      <SelectContext value={onValueChange ?? (() => {})}>
        <div data-testid="select" data-value={value}>
          {children}
        </div>
      </SelectContext>
    ),
    SelectContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
    SelectItem: ({
      children,
      value,
    }: {
      children?: ReactNode;
      value: string;
    }) => {
      const change = use(SelectContext);
      return (
        <button
          data-testid={`home-option-${value}`}
          onClick={() => change(value)}
          type="button"
        >
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
    SelectValue: () => null,
  };
});

const orderedAppIds = () =>
  screen
    .getAllByTestId(/^organization-rail-order-/)
    .map((row) =>
      row.getAttribute('data-testid')?.replace('organization-rail-order-', ''),
    );

describe('OrganizationRailDefaultsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isLoading = false;
    mocks.organizationId = 'org-1';
    mocks.role = MemberRole.OWNER;
    mocks.settings = {
      defaultHomeAppId: null,
      defaultRailOrder: [],
      hasOrganizationBilling: true,
      isReleasePreviewEnabled: true,
      moduleOverrides: {},
    };
    mocks.patchSettings.mockResolvedValue({});
    mocks.refresh.mockResolvedValue(undefined);
    mocks.getService.mockResolvedValue({ patchSettings: mocks.patchSettings });
  });

  it('is for owners and admins only', () => {
    mocks.role = MemberRole.ADMIN;
    const { unmount } = render(<OrganizationRailDefaultsCard />);
    expect(
      screen.getByTestId('organization-rail-defaults'),
    ).toBeInTheDocument();
    unmount();

    mocks.role = MemberRole.USER;
    render(<OrganizationRailDefaultsCard />);
    expect(
      screen.queryByTestId('organization-rail-defaults'),
    ).not.toBeInTheDocument();
  });

  it('lists the core loop first and the standard order when none is saved', () => {
    render(<OrganizationRailDefaultsCard />);
    expect(orderedAppIds().slice(0, 5)).toEqual([
      'workspace',
      'agent',
      'library',
      'publishing',
      'analytics',
    ]);
    expect(screen.getByTestId('select')).toHaveAttribute(
      'data-value',
      'default',
    );
  });

  it('shows the saved order and home app', () => {
    mocks.settings = {
      ...mocks.settings,
      defaultHomeAppId: 'agent',
      defaultRailOrder: ['analytics', 'agent'],
    };
    render(<OrganizationRailDefaultsCard />);
    expect(orderedAppIds().slice(0, 3)).toEqual([
      'analytics',
      'agent',
      'workspace',
    ]);
    expect(screen.getByTestId('select')).toHaveAttribute('data-value', 'agent');
  });

  it('saves the home app, and clears it back to Workspace', async () => {
    render(<OrganizationRailDefaultsCard />);

    fireEvent.click(screen.getByTestId('home-option-library'));
    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenLastCalledWith('org-1', {
        defaultHomeAppId: 'library',
      });
    });
    expect(mocks.clearBootstrap).toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalled();
    expect(await screen.findByText('Rail defaults saved.')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('home-option-default'));
    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenLastCalledWith('org-1', {
        defaultHomeAppId: null,
      });
    });
  });

  it('saves the whole order when an app moves', async () => {
    render(<OrganizationRailDefaultsCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Move Agent up' }));

    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenCalledTimes(1);
    });
    const [organizationId, patch] = mocks.patchSettings.mock.calls[0];
    expect(organizationId).toBe('org-1');
    expect(patch.defaultRailOrder.slice(0, 3)).toEqual([
      'agent',
      'workspace',
      'library',
    ]);
    expect(patch.defaultRailOrder).toHaveLength(orderedAppIds().length);
  });

  it('keeps the first app from moving up and resets only a saved order', async () => {
    render(<OrganizationRailDefaultsCard />);
    expect(
      screen.getByRole('button', { name: 'Move Workspace up' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Reset to standard order' }),
    ).toBeDisabled();
  });

  it('resets a saved order to the standard one', async () => {
    mocks.settings = { ...mocks.settings, defaultRailOrder: ['analytics'] };
    render(<OrganizationRailDefaultsCard />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset to standard order' }),
    );

    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenCalledWith('org-1', {
        defaultRailOrder: [],
      });
    });
  });

  it('reports a failed save without refreshing', async () => {
    mocks.patchSettings.mockRejectedValue(new Error('boom'));
    render(<OrganizationRailDefaultsCard />);

    fireEvent.click(screen.getByTestId('home-option-agent'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save rail defaults. Try again.',
    );
    expect(mocks.loggerError).toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('waits for organization settings to load', () => {
    mocks.isLoading = true;
    render(<OrganizationRailDefaultsCard />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading rail defaults…',
    );
  });
});
