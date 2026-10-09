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
  billing: true,
  clearBootstrap: vi.fn(),
  getService: vi.fn(),
  isLoading: false,
  loggerError: vi.fn(),
  organizationId: 'org-1',
  patchSettings: vi.fn(),
  refresh: vi.fn(),
  role: 'owner',
  settings: { moduleOverrides: {} } as Record<string, unknown>,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: mocks.organizationId }),
}));
vi.mock('@genfeedai/config/license', () => ({
  hasOrganizationBillingHint: () => mocks.billing,
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

describe('OrganizationModulesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.billing = true;
    mocks.isLoading = false;
    mocks.organizationId = 'org-1';
    mocks.role = MemberRole.OWNER;
    mocks.settings = { moduleOverrides: {} };
    mocks.patchSettings.mockResolvedValue({});
    mocks.refresh.mockResolvedValue(undefined);
    mocks.getService.mockResolvedValue({ patchSettings: mocks.patchSettings });
  });

  it('shows the settled defaults with immutable credit-based tools', () => {
    render(<OrganizationModulesCard />);
    expect(screen.getAllByRole('switch')).toHaveLength(9);
    for (const name of ['Publishing', 'Analytics', 'Discovery'])
      expect(toggle(name)).toBeChecked();
    for (const name of [
      'Motion',
      'Clips',
      'Batch',
      'Editor',
      'Automation',
      'Messages',
    ])
      expect(toggle(name)).not.toBeChecked();
    for (const name of ['Playground', 'Storyboard']) {
      expect(screen.getByText(name)).toBeInTheDocument();
      expect(screen.queryByRole('switch', { name })).not.toBeInTheDocument();
    }
    expect(screen.getAllByText('Always on')).toHaveLength(2);
    expect(screen.getAllByText('Paid plan')).toHaveLength(3);
  });

  it('preserves explicit self-hosted choices while defaulting other modules on', () => {
    mocks.billing = false;
    mocks.settings = { moduleOverrides: { automation: false } };
    render(<OrganizationModulesCard />);
    expect(toggle('Automation')).not.toBeChecked();
    for (const name of [
      'Motion',
      'Clips',
      'Batch',
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
    fireEvent.click(toggle('Batch'));
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
    'disables unavailable or malformed settings without granting defaults: %j',
    async (moduleOverrides) => {
      mocks.settings = { moduleOverrides };
      render(<OrganizationModulesCard />);
      for (const control of screen.getAllByRole('switch'))
        expect(control).toBeDisabled();
      fireEvent.click(toggle('Motion'));
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
    mocks.settings = { moduleOverrides: {} };
    view.rerender(<OrganizationModulesCard />);
    await act(async () => reload.reject(new Error('Old request failed')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
