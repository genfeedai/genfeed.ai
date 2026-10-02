// @vitest-environment jsdom
'use client';

import { ModalEnum } from '@genfeedai/contracts';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BrandSettingsSkillsPage from './content';

const pushMock = vi.fn();
const getTokenMock = vi.fn();
const resolveAuthTokenMock = vi.fn();
const listSkillsMock = vi.fn();
const forkSkillMock = vi.fn();
const getSkillMock = vi.fn();
const exportSkillMock = vi.fn();
const archiveSkillMock = vi.fn();
const authIdentityMock = {
  userId: 'user-1',
  sessionId: 'session-1',
  isSignedIn: true,
};
const updateSkillMock = vi.fn();
const toggleSkillMock = vi.fn();
const setUseDefaultsMock = vi.fn();
const selectedBrandMock = {
  agentConfig: {
    enabledSkills: [],
  },
  id: 'brand-1',
  label: 'Acme Brand',
  organization: { id: 'org-1', slug: 'acme-org' },
  slug: 'acme-creator',
};
const brandContextMock = {
  brandId: 'brand-1',
  isReady: true,
  refreshBrands: vi.fn(),
  selectedBrand: selectedBrandMock,
};
const routeParamsMock = {
  brandSlug: 'acme-creator',
  orgSlug: 'acme-org',
};

vi.mock(
  '@genfeedai/contexts/user/organization-context/organization-context',
  () => ({
    useRoutedOrganization: () => ({
      status: 'matched',
      isRouteConfirmed: true,
      confirmedOrganizationId: selectedBrandMock.organization.id,
      confirmedOrganizationSlug: routeParamsMock.orgSlug,
    }),
  }),
);

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useParams: () => routeParamsMock,
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    ...authIdentityMock,
    getToken: getTokenMock,
    isLoaded: true,
  }),
}));

vi.mock('@hooks/data/skills/use-brand-enabled-skills', () => ({
  useBrandEnabledSkills: () => ({
    enabledSlugs: [],
    isLoading: false,
    isUsingDefaults: false,
    pendingSlugs: new Set(),
    setUseDefaults: setUseDefaultsMock,
    toggleSkill: toggleSkillMock,
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandContextMock,
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandContextMock,
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => resolveAuthTokenMock(...args),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('common.settings.skills');

  return { useTranslations: () => translate };
});

vi.mock('@services/content/skills.service', async () => {
  const actual = await vi.importActual<
    typeof import('@services/content/skills.service')
  >('@services/content/skills.service');

  return {
    ...actual,
    SkillsService: {
      forOrganization: () => ({
        forkSkill: forkSkillMock,
        getSkill: getSkillMock,
        exportSkill: exportSkillMock,
        archiveSkill: archiveSkillMock,
        listSkills: listSkillsMock,
        updateSkill: updateSkillMock,
      }),
    },
  };
});

describe('BrandSettingsSkillsPage', () => {
  afterEach(() => {
    closeModal(ModalEnum.SKILL);
  });

  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: true,
        removeEventListener: vi.fn(),
      }),
    });
    Object.assign(routeParamsMock, {
      brandSlug: 'acme-creator',
      orgSlug: 'acme-org',
    });
    Object.assign(selectedBrandMock, {
      id: 'brand-1',
      label: 'Acme Brand',
      organization: { id: 'org-1', slug: 'acme-org' },
      slug: 'acme-creator',
    });
    brandContextMock.brandId = 'brand-1';
    getTokenMock.mockResolvedValue('authProvider-token');
    resolveAuthTokenMock.mockResolvedValue('api-token');
    listSkillsMock.mockResolvedValue([
      {
        channels: ['youtube', 'linkedin'],
        defaultInstructions: 'Base instructions',
        description: 'Sets up long-form creator scripts.',
        canEdit: false,
        canFork: true,
        id: 'skill-1',
        isBuiltIn: true,
        isEnabled: true,
        modalities: ['text'],
        name: 'YouTube Script Setup',
        organization: null,
        requiredProviders: ['openai'],
        slug: 'youtube-script-setup',
        source: 'built_in',
        status: 'published',
        workflowStage: 'creation',
      },
      {
        baseSkill: 'skill-1',
        channels: ['youtube'],
        defaultInstructions: 'Variant instructions',
        description: 'Brand-tuned variant.',
        canEdit: true,
        canFork: true,
        id: 'variant-1',
        isBuiltIn: false,
        isEnabled: true,
        modalities: ['text'],
        name: 'YouTube Script Setup Custom',
        organization: 'org-1',
        requiredProviders: ['openai'],
        slug: 'youtube-script-setup-custom',
        source: 'custom',
        status: 'draft',
        workflowStage: 'creation',
      },
    ]);
    forkSkillMock.mockResolvedValue({ id: 'fork-1' });
    Object.assign(authIdentityMock, {
      userId: 'user-1',
      sessionId: 'session-1',
      isSignedIn: true,
    });
    updateSkillMock.mockResolvedValue({});
  });

  it('renders the brand skill table and opens the detail sheet on row click', async () => {
    render(<BrandSettingsSkillsPage />);

    await waitFor(() => {
      expect(listSkillsMock).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('YouTube Script Setup')).toBeVisible();
    expect(screen.getByText(/built in/i)).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Enable YouTube Script Setup' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Use default skills' }));
    expect(setUseDefaultsMock).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByText('YouTube Script Setup'));

    expect(
      await screen.findByRole('textbox', { name: 'Name' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Default instructions' }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /open sample prompt/i }),
    );

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        '/acme-org/acme-creator/agent/new?prompt=Help%20me%20explore%20a%20small%20youtube%20example%20for%20the%20skill%20named%20YouTube%20Script%20Setup.',
      );
    });
  });

  it('filters skills by source using the subbar select', async () => {
    render(<BrandSettingsSkillsPage />);

    await waitFor(() => {
      expect(listSkillsMock).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('YouTube Script Setup')).toBeVisible();

    expect(
      screen.getByRole('combobox', { name: /filter skills by source/i }),
    ).toBeInTheDocument();
  });

  it('clears the previous organization catalog while a new scope loads and fails', async () => {
    const { rerender } = render(<BrandSettingsSkillsPage />);

    expect(
      (await screen.findAllByText('YouTube Script Setup'))[0],
    ).toBeVisible();

    let rejectNextCatalog: ((reason?: unknown) => void) | undefined;
    listSkillsMock.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectNextCatalog = reject;
      }),
    );
    Object.assign(routeParamsMock, {
      brandSlug: 'beta-brand',
      orgSlug: 'beta-org',
    });
    Object.assign(selectedBrandMock, {
      id: 'brand-2',
      label: 'Beta Brand',
      organization: { id: 'org-2', slug: 'beta-org' },
      slug: 'beta-brand',
    });
    brandContextMock.brandId = 'brand-2';

    rerender(<BrandSettingsSkillsPage />);

    await waitFor(() => {
      expect(listSkillsMock).toHaveBeenCalledTimes(2);
      expect(screen.queryAllByText('YouTube Script Setup')).toHaveLength(0);
    });

    rejectNextCatalog?.(new Error('catalog unavailable'));

    expect(
      await screen.findByText(/failed to load the agent skill catalog/i),
    ).toBeVisible();
    expect(screen.queryAllByText('YouTube Script Setup')).toHaveLength(0);
  });
  it('saves a personal skill with exact sparse changes, omits oversized unchanged instructions and locks duplicate clicks', async () => {
    const personal = {
      id: 'personal-1',
      name: 'Personal',
      description: 'Description',
      defaultInstructions: 'x'.repeat(17000),
      systemPromptTemplate: 'y'.repeat(17000),
      organization: null,
      canEdit: true,
      canFork: true,
      channels: ['youtube'],
      modalities: ['text'],
      source: 'custom',
      workflowStage: 'creation',
      slug: 'personal',
    };
    listSkillsMock.mockResolvedValue([personal]);
    getSkillMock.mockResolvedValue({ ...personal, name: ' Personal ' });
    let resolveSave: ((value: unknown) => void) | undefined;
    updateSkillMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    render(<BrandSettingsSkillsPage />);
    fireEvent.click(await screen.findByText('Personal'));
    const save = screen.getByRole('button', { name: 'Save skill' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: ' Personal ' },
    });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(updateSkillMock).toHaveBeenCalledTimes(1));
    expect(updateSkillMock).toHaveBeenCalledWith('personal-1', {
      name: ' Personal ',
    });
    resolveSave?.({ id: personal.id });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save skill' })).toBeDisabled(),
    );
  });
  it('hydrates the fork from its own returned capabilities and never copies a source draft', async () => {
    getSkillMock.mockResolvedValue({
      id: 'fork-1',
      name: 'Fresh fork',
      description: 'Own definition',
      canEdit: true,
      canFork: false,
      organization: null,
      channels: [],
      modalities: ['text'],
      workflowStage: 'creation',
      slug: 'fresh-fork',
      source: 'custom',
      category: 'content',
      isBuiltIn: false,
      isEnabled: true,
      requiredProviders: [],
      status: 'draft',
      defaultInstructions: 'Fresh fork instructions',
      systemPromptTemplate: '',
    });
    render(<BrandSettingsSkillsPage />);
    fireEvent.click(await screen.findByText('YouTube Script Setup'));
    fireEvent.click(screen.getByRole('button', { name: 'Fork' }));
    await waitFor(() => expect(getSkillMock).toHaveBeenCalledWith('fork-1'));
    expect(await screen.findByDisplayValue('Fresh fork')).toBeEnabled();
    expect(
      screen.getByRole('textbox', { name: 'Default instructions' }),
    ).toHaveValue('Fresh fork instructions');
    expect(
      screen.queryByRole('button', { name: 'Fork' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save skill' })).toBeDisabled();
    expect(forkSkillMock).toHaveBeenCalledWith('skill-1');
  });
  it('reports a created fork whose hydration fails and prevents repeating the POST', async () => {
    getSkillMock.mockRejectedValue(new Error('read failed'));
    render(<BrandSettingsSkillsPage />);
    fireEvent.click(await screen.findByText('YouTube Script Setup'));
    fireEvent.click(screen.getByRole('button', { name: 'Fork' }));
    expect(
      await screen.findByText(
        'The fork was created, but its details could not be loaded. Refresh the catalog.',
      ),
    ).toBeVisible();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'The fork was created, but its details could not be loaded. Refresh the catalog.',
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: 'Fork' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fork' }));
    expect(forkSkillMock).toHaveBeenCalledTimes(1);
  });
  it('does not dispatch a mutation when a deferred token resolves after session change', async () => {
    const { rerender } = render(<BrandSettingsSkillsPage />);
    fireEvent.click(await screen.findByText('YouTube Script Setup'));
    let resolveToken: ((value: string) => void) | undefined;
    resolveAuthTokenMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveToken = resolve;
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fork' }));
    authIdentityMock.sessionId = 'session-2';
    rerender(<BrandSettingsSkillsPage />);
    resolveToken?.('old-token');
    await waitFor(() => expect(listSkillsMock).toHaveBeenCalledTimes(2));
    expect(forkSkillMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('textbox', { name: 'Name' }),
    ).not.toBeInTheDocument();
  });

  it.each(['save', 'fork', 'export', 'archive'])(
    'does not dispatch %s after token resolves for a different selection',
    async (operation) => {
      const first = {
        id: 'first',
        name: 'First',
        description: 'Definition',
        canEdit: true,
        canFork: true,
        canExport: true,
        organization: null,
        channels: [],
        modalities: ['text'],
        workflowStage: 'creation',
        slug: 'first',
        source: 'custom',
      };
      const second = { ...first, id: 'second', name: 'Second', slug: 'second' };
      listSkillsMock.mockResolvedValue([first, second]);
      render(<BrandSettingsSkillsPage />);
      fireEvent.click(await screen.findByText('First'));
      if (operation === 'save')
        fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
          target: { value: 'Edited' },
        });
      let resolveToken: ((value: string) => void) | undefined;
      resolveAuthTokenMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveToken = resolve;
        }),
      );
      const labels = {
        save: 'Save skill',
        fork: 'Fork',
        export: 'Export',
        archive: 'Uninstall',
      };
      fireEvent.click(
        screen.getByRole('button', {
          name: labels[operation as keyof typeof labels],
        }),
      );
      // Selecting another catalog row invalidates the operation synchronously.
      fireEvent.click(screen.getByText('Second'));
      await act(async () => {
        resolveToken?.('old-token');
      });
      expect(updateSkillMock).not.toHaveBeenCalled();
      expect(forkSkillMock).not.toHaveBeenCalled();
      expect(exportSkillMock).not.toHaveBeenCalled();
      expect(archiveSkillMock).not.toHaveBeenCalled();
    },
  );
  it('does not download a stale export after session replacement', async () => {
    const editable = {
      id: 'exportable',
      name: 'Exportable',
      description: 'Definition',
      canEdit: true,
      canExport: true,
      channels: [],
      modalities: ['text'],
      workflowStage: 'creation',
      slug: 'exportable',
      source: 'custom',
    };
    listSkillsMock.mockResolvedValue([editable]);
    let resolveExport: ((value: unknown) => void) | undefined;
    exportSkillMock.mockReturnValue(
      new Promise((resolve) => {
        resolveExport = resolve;
      }),
    );
    const createUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createUrl,
    });
    const { rerender } = render(<BrandSettingsSkillsPage />);
    fireEvent.click(await screen.findByText('Exportable'));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(exportSkillMock).toHaveBeenCalledTimes(1));
    authIdentityMock.sessionId = 'session-new';
    rerender(<BrandSettingsSkillsPage />);
    await act(async () => {
      resolveExport?.({ name: 'private-export' });
    });
    expect(createUrl).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
  it.each([false, undefined])(
    'fails closed for organization edit capability %s',
    async (canEdit) => {
      listSkillsMock.mockResolvedValue([
        {
          id: 'denied',
          name: 'Denied',
          description: 'Definition',
          organization: 'org-1',
          canEdit,
          channels: [],
          modalities: ['text'],
          workflowStage: 'creation',
          slug: 'denied',
          source: 'custom',
        },
      ]);
      render(<BrandSettingsSkillsPage />);
      fireEvent.click(await screen.findByText('Denied'));
      expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
      expect(
        screen.queryByRole('button', { name: 'Save skill' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Fork' }),
      ).not.toBeInTheDocument();
    },
  );
  it.each(['save', 'fork'])(
    'ignores a delayed %s result after organization replacement without hydration or stale errors',
    async (operation) => {
      const editable = {
        id: 'editable',
        name: 'Editable',
        description: 'Definition',
        canEdit: true,
        canFork: true,
        channels: [],
        modalities: ['text'],
        workflowStage: 'creation',
        slug: 'editable',
        source: 'custom',
      };
      listSkillsMock.mockResolvedValue([editable]);
      let resolveMutation: ((value: unknown) => void) | undefined;
      const pending = new Promise((resolve) => {
        resolveMutation = resolve;
      });
      if (operation === 'save') updateSkillMock.mockReturnValue(pending);
      else forkSkillMock.mockReturnValue(pending);
      const { rerender } = render(<BrandSettingsSkillsPage />);
      fireEvent.click(await screen.findByText('Editable'));
      if (operation === 'save')
        fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
          target: { value: 'Edited' },
        });
      fireEvent.click(
        screen.getByRole('button', {
          name: operation === 'save' ? 'Save skill' : 'Fork',
        }),
      );
      await waitFor(() =>
        expect(
          operation === 'save' ? updateSkillMock : forkSkillMock,
        ).toHaveBeenCalledTimes(1),
      );
      listSkillsMock.mockResolvedValue([]);
      Object.assign(routeParamsMock, {
        brandSlug: 'beta-brand',
        orgSlug: 'beta-org',
      });
      Object.assign(selectedBrandMock, {
        id: 'brand-2',
        slug: 'beta-brand',
        organization: { id: 'org-2', slug: 'beta-org' },
      });
      brandContextMock.brandId = 'brand-2';
      rerender(<BrandSettingsSkillsPage />);
      await act(async () => {
        resolveMutation?.({ id: 'stale-fork' });
      });
      expect(getSkillMock).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('textbox', { name: 'Name' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Failed to (update|fork)/),
      ).not.toBeInTheDocument();
      expect(pushMock).not.toHaveBeenCalled();
    },
  );
  it('ignores a delayed catalog from the previous authenticated session', async () => {
    let resolveCatalog: ((value: unknown) => void) | undefined;
    listSkillsMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCatalog = resolve;
      }),
    );
    const { rerender } = render(<BrandSettingsSkillsPage />);
    await waitFor(() => expect(listSkillsMock).toHaveBeenCalledTimes(1));
    authIdentityMock.sessionId = 'replacement-session';
    listSkillsMock.mockResolvedValue([]);
    rerender(<BrandSettingsSkillsPage />);
    await waitFor(() => expect(listSkillsMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolveCatalog?.([
        {
          id: 'private-old',
          name: 'Old private catalog',
          channels: [],
          modalities: [],
          description: '',
          source: 'custom',
          workflowStage: 'creation',
        },
      ]);
    });
    expect(screen.queryByText('Old private catalog')).not.toBeInTheDocument();
  });
});
