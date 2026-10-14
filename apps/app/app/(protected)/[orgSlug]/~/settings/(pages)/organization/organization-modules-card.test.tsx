import '@testing-library/jest-dom/vitest';
import { MemberRole } from '@genfeedai/contracts';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationModulesCard from './organization-modules-card';

const mocks = vi.hoisted(() => ({
  clearBootstrap: vi.fn(),
  getService: vi.fn(),
  isLoading: false,
  flags: {} as Record<string, boolean>,
  isSuperAdmin: false,
  loggerError: vi.fn(),
  organizationId: 'org-1',
  patchSettings: vi.fn(),
  refresh: vi.fn(),
  role: 'owner',
  settings: { moduleOverrides: {}, hasOrganizationBilling: true } as Record<
    string,
    unknown
  >,
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
  () => ({
    clearClientProtectedBootstrapCache: mocks.clearBootstrap,
  }),
);
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({ useAccessState: () => ({ isSuperAdmin: mocks.isSuperAdmin }) }),
);
vi.mock('@genfeedai/hooks/feature-flags/provider', () => ({
  useFeatureFlagContext: () => ({
    flags: mocks.flags,
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
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/default/~${path}` }),
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));
vi.mock('@ui/card/Card', () => ({
  default: ({ children, label }: { children: ReactNode; label?: string }) => (
    <section>
      <h2>{label}</h2>
      {children}
    </section>
  ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const toggle = (name: string) => screen.getByRole('switch', { name });
const switchNames = () =>
  screen
    .queryAllByRole('switch')
    .map((control) => control.getAttribute('aria-label'));

/** Admin → Flags as the release migration leaves it. */
const RELEASED_FLAGS = {
  release_analytics: true,
  release_discovery: true,
  release_publishing: true,
  release_turbo: true,
};

describe('OrganizationModulesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.flags = RELEASED_FLAGS;
    mocks.isLoading = false;
    mocks.isSuperAdmin = false;
    mocks.organizationId = 'org-1';
    mocks.role = MemberRole.OWNER;
    mocks.settings = {
      moduleOverrides: {},
      hasOrganizationBilling: true,
      isReleasePreviewEnabled: true,
    };
    mocks.patchSettings.mockResolvedValue({});
    mocks.refresh.mockResolvedValue(undefined);
    mocks.getService.mockResolvedValue({ patchSettings: mocks.patchSettings });
  });

  it('shows every module on the Store shelves with the settled defaults', () => {
    render(<OrganizationModulesCard />);
    expect(switchNames()).toHaveLength(11);
    for (const name of [
      'Playground',
      'Storyboard',
      'Publishing',
      'Analytics',
      'Discovery',
    ])
      expect(toggle(name)).toBeChecked();
    for (const name of [
      'Motion',
      'Clips',
      'Turbo',
      'Editor',
      'Automation',
      'Messages',
    ])
      expect(toggle(name)).not.toBeChecked();
    for (const shelf of ['create', 'publish', 'automate'])
      expect(screen.getByTestId(`modules-category-${shelf}`)).toBeVisible();
    expect(screen.getAllByText('Paid plan')).toHaveLength(3);
  });

  it('does not list modules that are unreleased for the organization', () => {
    mocks.settings = {
      moduleOverrides: { automation: true, turbo: true },
      hasOrganizationBilling: true,
    };
    render(<OrganizationModulesCard />);
    expect(switchNames()).toEqual([
      'Playground',
      'Storyboard',
      'Turbo',
      'Publishing',
      'Analytics',
      'Discovery',
    ]);
    expect(screen.queryByText('Not released')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('modules-category-automate'),
    ).not.toBeInTheDocument();
  });

  it('does not list modules switched off for the platform', () => {
    mocks.flags = { ...RELEASED_FLAGS, studio_turbo: false, discovery: false };
    render(<OrganizationModulesCard />);
    expect(
      screen.queryByRole('switch', { name: 'Turbo' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Discovery' }),
    ).not.toBeInTheDocument();
    expect(toggle('Playground')).toBeVisible();
  });

  it('has no release preview control, even for a platform admin', () => {
    mocks.isSuperAdmin = true;
    render(<OrganizationModulesCard />);
    expect(
      screen.queryByRole('switch', { name: 'Release preview' }),
    ).not.toBeInTheDocument();
  });

  it('lets an owner hide Playground; work through the API keeps running', async () => {
    render(<OrganizationModulesCard />);
    expect(
      screen.getByText(/Work through the API and MCP keeps running/),
    ).toBeInTheDocument();
    fireEvent.click(toggle('Playground'));
    await waitFor(() =>
      expect(mocks.patchSettings).toHaveBeenCalledWith('org-1', {
        moduleOverrides: { playground: false },
      }),
    );
  });

  it('preserves explicit self-hosted choices while defaulting other modules on', () => {
    mocks.flags = {};
    mocks.settings = {
      moduleOverrides: { automation: false },
      hasOrganizationBilling: false,
    };
    render(<OrganizationModulesCard />);
    expect(toggle('Automation')).not.toBeChecked();
    for (const name of [
      'Motion',
      'Clips',
      'Turbo',
      'Editor',
      'Messages',
      'Discovery',
    ])
      expect(toggle(name)).toBeChecked();
    expect(screen.queryByText('Paid plan')).not.toBeInTheDocument();
  });

  it.each([MemberRole.ADMIN, MemberRole.OWNER])(
    'lets %s save only the requested override and refresh',
    async (role) => {
      mocks.role = role;
      mocks.settings = {
        moduleOverrides: { analytics: false, messages: true },
        hasOrganizationBilling: true,
        isReleasePreviewEnabled: true,
      };
      render(<OrganizationModulesCard />);
      fireEvent.click(toggle('Motion'));
      await waitFor(() =>
        expect(mocks.patchSettings).toHaveBeenCalledWith('org-1', {
          moduleOverrides: { analytics: false, messages: true, motion: true },
        }),
      );
      await screen.findByText('Module settings saved.');
      expect(mocks.clearBootstrap).toHaveBeenCalledTimes(1);
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
    },
  );

  it.each([undefined, 'true'])(
    'waits for server billing metadata instead of guessing from a client build: %j',
    (hasOrganizationBilling) => {
      mocks.settings = { moduleOverrides: {}, hasOrganizationBilling };
      render(<OrganizationModulesCard />);
      expect(switchNames()).toEqual([]);
      expect(
        screen.getByRole('button', { name: 'Retry loading' }),
      ).toBeEnabled();
      expect(mocks.patchSettings).not.toHaveBeenCalled();
    },
  );

  it('allows keyboard activation through the shared Radix switch', async () => {
    render(<OrganizationModulesCard />);
    toggle('Clips').focus();
    await userEvent.keyboard(' ');
    await waitFor(() =>
      expect(mocks.patchSettings).toHaveBeenCalledWith('org-1', {
        moduleOverrides: { clips: true },
      }),
    );
  });

  it('keeps member settings readable but prevents changes', () => {
    mocks.role = MemberRole.USER;
    render(<OrganizationModulesCard />);
    for (const control of screen.getAllByRole('switch'))
      expect(control).toBeDisabled();
    fireEvent.click(toggle('Motion'));
    expect(mocks.getService).not.toHaveBeenCalled();
    expect(
      screen.getByText('Only owners and admins can change module settings.'),
    ).toBeInTheDocument();
  });

  it('blocks duplicate changes until the server and settings refresh finish', async () => {
    const save = deferred<object>();
    mocks.patchSettings.mockReturnValueOnce(save.promise);
    render(<OrganizationModulesCard />);
    fireEvent.click(toggle('Motion'));
    fireEvent.click(toggle('Motion'));
    fireEvent.click(toggle('Turbo'));
    await waitFor(() => expect(mocks.patchSettings).toHaveBeenCalledTimes(1));
    for (const control of screen.getAllByRole('switch'))
      expect(control).toBeDisabled();
    expect(toggle('Motion')).not.toBeChecked();
    await act(async () => save.resolve({}));
    await screen.findByText('Module settings saved.');
    expect(toggle('Motion')).toBeEnabled();
  });

  it('retains the stored value on rejected writes without invalidating the cache', async () => {
    mocks.patchSettings.mockRejectedValueOnce(new Error('Forbidden'));
    render(<OrganizationModulesCard />);
    fireEvent.click(toggle('Motion'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save module settings. Try again.',
    );
    expect(toggle('Motion')).not.toBeChecked();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.clearBootstrap).not.toHaveBeenCalled();
  });

  it('distinguishes a committed save from a failed refresh', async () => {
    mocks.refresh.mockRejectedValueOnce(new Error('Unavailable'));
    render(<OrganizationModulesCard />);
    fireEvent.click(toggle('Motion'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Module settings were saved. Reload to see the latest values.',
    );
    expect(mocks.patchSettings).toHaveBeenCalledTimes(1);
    expect(mocks.clearBootstrap).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, { motion: 'true' }, { arbitrary: true }])(
    'shows no switches for unavailable or malformed settings: %j',
    async (moduleOverrides) => {
      mocks.settings = {
        moduleOverrides,
        hasOrganizationBilling: true,
        isReleasePreviewEnabled: true,
      };
      render(<OrganizationModulesCard />);
      expect(switchNames()).toEqual([]);
      expect(mocks.getService).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    },
  );

  it('cancels a pending service lookup when the organization changes', async () => {
    const lookup = deferred<{ patchSettings: typeof mocks.patchSettings }>();
    mocks.getService.mockReturnValueOnce(lookup.promise);
    const view = render(<OrganizationModulesCard />);
    fireEvent.click(toggle('Motion'));
    mocks.organizationId = 'org-2';
    view.rerender(<OrganizationModulesCard />);
    await act(async () =>
      lookup.resolve({ patchSettings: mocks.patchSettings }),
    );
    expect(mocks.patchSettings).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(toggle('Motion')).toBeEnabled();
  });

  it('does not refresh the new organization after a late old save', async () => {
    const save = deferred<object>();
    mocks.patchSettings.mockReturnValueOnce(save.promise);
    const view = render(<OrganizationModulesCard />);
    fireEvent.click(toggle('Motion'));
    await waitFor(() => expect(mocks.patchSettings).toHaveBeenCalledTimes(1));
    mocks.organizationId = 'org-2';
    view.rerender(<OrganizationModulesCard />);
    await act(async () => save.resolve({}));
    expect(mocks.clearBootstrap).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(
      screen.queryByText('Module settings saved.'),
    ).not.toBeInTheDocument();
  });

  it('ignores an old retry failure after switching organization', async () => {
    const reload = deferred<void>();
    mocks.settings = {};
    mocks.refresh.mockReturnValueOnce(reload.promise);
    const view = render(<OrganizationModulesCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
    mocks.organizationId = 'org-2';
    mocks.settings = {
      moduleOverrides: {},
      hasOrganizationBilling: true,
      isReleasePreviewEnabled: true,
    };
    view.rerender(<OrganizationModulesCard />);
    await act(async () => reload.reject(new Error('Old request failed')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
