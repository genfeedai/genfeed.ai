import type { OrganizationModulePreferenceGateProps } from '@genfeedai/props/guards/organization-module-preference-gate.props';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationModulePreferenceGate from './OrganizationModulePreferenceGate';

const state = vi.hoisted(() => ({
  organizationId: 'org-1',
  settingsLoading: false,
  settings: { hasOrganizationBilling: true, moduleOverrides: {} } as Record<
    string,
    unknown
  > | null,
  refreshSettings: vi.fn(),
  created: vi.fn(),
  disposed: vi.fn(),
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => state,
}));
vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/acme/~${path}` }),
}));
vi.mock('next-intl', async () => {
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  return {
    useTranslations: createTranslateFromCatalog({
      common: {
        settings: {
          organizationModules: {
            disabledTitle: '{module} is disabled',
            disabledHelp:
              'An owner or admin can enable this module. Existing projects remain readable and exportable.',
            manageModules: 'Organization modules',
            loading: 'Loading module settings…',
            unavailable: 'Module settings are unavailable.',
            retry: 'Retry loading',
            loadFailed: 'Could not load module settings. Try again.',
            modules: {
              batch: { label: 'Batch' },
              clips: { label: 'Clips' },
              editor: { label: 'Editor' },
              motion: { label: 'Motion' },
            },
          },
        },
      },
    }),
  };
});
function CreationForm() {
  useEffect(() => {
    state.created();
    return () => {
      state.disposed();
    };
  }, []);
  return <span>Create a project</span>;
}
function view(
  moduleId: OrganizationModulePreferenceGateProps['moduleId'] = 'batch',
) {
  return (
    <OrganizationModulePreferenceGate moduleId={moduleId}>
      <CreationForm />
    </OrganizationModulePreferenceGate>
  );
}
beforeEach(() => {
  state.organizationId = 'org-1';
  state.settingsLoading = false;
  state.settings = { hasOrganizationBilling: true, moduleOverrides: {} };
  state.refreshSettings.mockReset();
  state.created.mockClear();
  state.disposed.mockClear();
});
describe('credit-based module creation gate', () => {
  it.each(['batch', 'clips', 'editor', 'motion'] as const)(
    'does not mount %s creation under cloud defaults',
    (moduleId) => {
      render(view(moduleId));
      expect(state.created).not.toHaveBeenCalled();
      expect(screen.queryByText('Create a project')).not.toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Organization modules' }),
      ).toHaveAttribute('href', '/acme/~/settings/general');
    },
  );
  it('mounts enabled credit-based work without subscription or balance signals', () => {
    state.settings = {
      hasOrganizationBilling: true,
      moduleOverrides: { batch: true },
    };
    render(view());
    expect(state.created).toHaveBeenCalledTimes(1);
  });
  it('keeps Playground credit-based and fixed', () => {
    render(view('playground'));
    expect(state.created).toHaveBeenCalledTimes(1);
  });
  it('uses explicit self-hosted runtime defaults', () => {
    state.settings = { hasOrganizationBilling: false, moduleOverrides: {} };
    render(view('editor'));
    expect(state.created).toHaveBeenCalledTimes(1);
  });
  it.each([
    null,
    {},
    { hasOrganizationBilling: 'true', moduleOverrides: {} },
    { hasOrganizationBilling: true, moduleOverrides: { batch: 'true' } },
  ])('does not mount creation from unknown settings: %j', (settings) => {
    state.settings = settings;
    render(view());
    expect(state.created).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Retry loading' }),
    ).toBeInTheDocument();
  });
  it('waits for settings loading and organization scope before mounting', () => {
    state.settings = {
      hasOrganizationBilling: true,
      moduleOverrides: { batch: true },
    };
    state.settingsLoading = true;
    const { rerender } = render(view());
    expect(state.created).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Retry loading' }),
    ).toBeDisabled();
    state.settingsLoading = false;
    state.organizationId = '';
    rerender(view());
    expect(state.created).not.toHaveBeenCalled();
    state.organizationId = 'org-1';
    rerender(view());
    expect(state.created).toHaveBeenCalledTimes(1);
  });
  it('removes the creation view when the enabled preference is revoked', () => {
    state.settings = {
      hasOrganizationBilling: true,
      moduleOverrides: { batch: true },
    };
    const { rerender } = render(view());
    state.settings = {
      hasOrganizationBilling: true,
      moduleOverrides: { batch: false },
    };
    rerender(view());
    expect(state.disposed).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Create a project')).not.toBeInTheDocument();
  });
  it('joins repeated retry clicks and reports failed reloads without opening creation', async () => {
    state.settings = null;
    let reject: ((failure: Error) => void) | undefined;
    state.refreshSettings.mockImplementation(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    render(view());
    const button = screen.getByRole('button', { name: 'Retry loading' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(state.refreshSettings).toHaveBeenCalledTimes(1);
    await act(async () => {
      reject?.(new Error('Unavailable'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load module settings',
    );
    expect(button).toBeEnabled();
    expect(state.created).not.toHaveBeenCalled();
  });
  it('discards a late retry failure after switching organization', async () => {
    state.settings = null;
    let reject: ((failure: Error) => void) | undefined;
    state.refreshSettings.mockImplementation(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
    state.organizationId = 'org-2';
    state.settings = { hasOrganizationBilling: false, moduleOverrides: {} };
    rerender(view());
    await act(async () => {
      reject?.(new Error('Old org failure'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(state.created).toHaveBeenCalledTimes(1);
  });
});
