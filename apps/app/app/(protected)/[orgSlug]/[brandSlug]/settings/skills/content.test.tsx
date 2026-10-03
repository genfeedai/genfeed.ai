// @vitest-environment jsdom
'use client';

import { ModalEnum } from '@genfeedai/contracts';
import {
  closeModal,
  openModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import type { Skill } from '@services/content/skills.service';
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
const importSkillMock = vi.fn();
const acquireSkillsServiceMock = vi.fn();
const getSkillMock = vi.fn();
const listSkillVersionsMock = vi.fn();
const getSkillVersionMock = vi.fn();
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
      forOrganization: (token: string, organizationId: string) => {
        acquireSkillsServiceMock(token, organizationId);
        return {
          importSkill: importSkillMock,
          forkSkill: forkSkillMock,
          getSkill: getSkillMock,
          listSkillVersions: listSkillVersionsMock,
          getSkillVersion: getSkillVersionMock,
          exportSkill: exportSkillMock,
          archiveSkill: archiveSkillMock,
          listSkills: listSkillsMock,
          updateSkill: updateSkillMock,
        };
      },
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

  function importedFixture(overrides: Partial<Skill> = {}): Skill {
    return {
      id: 'import-1',
      category: 'content',
      channels: ['general'],
      description: 'Original import',
      isBuiltIn: false,
      isEnabled: true,
      modalities: ['text'],
      name: 'Imported personal skill',
      organization: null,
      requiredProviders: [],
      slug: 'private-upload',
      source: 'imported',
      status: 'draft',
      workflowStage: 'creation',
      canEdit: true,
      canExport: true,
      canFork: true,
      canRead: true,
      canShare: true,
      canPublish: false,
      canUse: true,
      defaultInstructions: 'x'.repeat(45000),
      systemPromptTemplate: 'y'.repeat(45000),
      ...overrides,
    };
  }
  function importFile(
    name = 'SKILL.md',
    content = '---\nname: Imported\ndescription: Original\n---\nInstructions',
  ): File {
    const bytes = new TextEncoder().encode(content);
    const file = new File([bytes], name);
    Object.defineProperty(file, 'arrayBuffer', {
      configurable: true,
      value: async () => bytes.slice().buffer,
    });
    return file;
  }
  async function prepareImport(files: File[] = [importFile()]) {
    fireEvent.click(
      await screen.findByRole('button', { name: 'Import package' }),
    );
    fireEvent.change(screen.getByLabelText('Package files'), {
      target: { files },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Skill slug' }), {
      target: { value: 'Private-Upload' },
    });
  }
  function pending<T>() {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve: (value: T) => resolve(value) };
  }
  function changeImportScope(change: string) {
    if (change === 'actor') authIdentityMock.userId = 'replacement-user';
    if (change === 'session')
      authIdentityMock.sessionId = 'replacement-session';
    if (change === 'organization') {
      selectedBrandMock.organization = { id: 'org-2', slug: 'other-org' };
      routeParamsMock.orgSlug = 'other-org';
    }
    if (change === 'brand') {
      selectedBrandMock.id = 'brand-2';
      selectedBrandMock.slug = 'other-brand';
      brandContextMock.brandId = 'brand-2';
      routeParamsMock.brandSlug = 'other-brand';
    }
    if (change === 'signout') authIdentityMock.isSignedIn = false;
  }
  it.each(['files', 'zip'])(
    'imports %s, reads that same ID and preserves long unchanged instructions in a metadata-only save',
    async (format) => {
      importSkillMock.mockResolvedValue(
        importedFixture({
          canEdit: false,
          canShare: false,
          name: 'Unhydrated response',
        }),
      );
      getSkillMock.mockResolvedValue(importedFixture());
      render(<BrandSettingsSkillsPage />);
      await prepareImport(
        format === 'zip' ? [importFile('package.zip', 'PK')] : [importFile()],
      );
      fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
      await waitFor(() =>
        expect(getSkillMock).toHaveBeenCalledWith('import-1'),
      );
      expect(importSkillMock).toHaveBeenCalledWith({
        slug: 'private-upload',
        package:
          format === 'zip'
            ? { format: 'zip', archiveBase64: 'UEs=' }
            : {
                format: 'files',
                files: [
                  {
                    path: 'SKILL.md',
                    content:
                      '---\nname: Imported\ndescription: Original\n---\nInstructions',
                  },
                ],
              },
      });
      expect(acquireSkillsServiceMock).toHaveBeenLastCalledWith(
        'api-token',
        'org-1',
      );
      const name = await screen.findByRole('textbox', { name: 'Name' });
      expect(name).toHaveValue('Imported personal skill');
      fireEvent.change(name, { target: { value: 'Renamed personal import' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save skill' }));
      await waitFor(() =>
        expect(updateSkillMock).toHaveBeenCalledWith('import-1', {
          name: 'Renamed personal import',
        }),
      );
      expect(setUseDefaultsMock).not.toHaveBeenCalled();
      expect(toggleSkillMock).not.toHaveBeenCalled();
      expect(forkSkillMock).not.toHaveBeenCalled();
    },
  );
  it('keeps a completed import locked after its detail is closed until explicit recovery', async () => {
    importSkillMock.mockResolvedValue(importedFixture());
    getSkillMock.mockResolvedValue(importedFixture());
    render(<BrandSettingsSkillsPage />);
    await prepareImport();
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    await screen.findByRole('textbox', { name: 'Name' });
    await act(async () => {
      closeModal(ModalEnum.SKILL);
    });
    expect(
      screen.getByRole('button', { name: 'Import package' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Refresh imported skills' }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Import package' }));
    expect(importSkillMock).toHaveBeenCalledTimes(1);
  });
  it('synchronously latches duplicate submissions until explicit recovery after readback failure', async () => {
    const created = pending<Skill>();
    importSkillMock.mockReturnValue(created.promise);
    getSkillMock.mockRejectedValue(new Error('PRIVATE_RAW_FAILURE'));
    render(<BrandSettingsSkillsPage />);
    await prepareImport();
    const form = screen.getByRole('form', { name: 'Import skill' });
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(importSkillMock).toHaveBeenCalledTimes(1));
    await act(async () => created.resolve(importedFixture()));
    expect(
      await screen.findByText(
        'The skill was imported, but its details could not be loaded. Refresh the catalog.',
      ),
    ).toBeVisible();
    fireEvent.submit(form);
    expect(importSkillMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('PRIVATE_RAW_FAILURE')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh imported skills' }),
    );
    await waitFor(() => expect(listSkillsMock).toHaveBeenCalledTimes(2));
    await prepareImport();
    importSkillMock.mockResolvedValue(importedFixture());
    getSkillMock.mockResolvedValue(importedFixture());
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    await waitFor(() => expect(importSkillMock).toHaveBeenCalledTimes(2));
  });
  it('keeps fixed recovery available when a failed request opens the error-debug modal', async () => {
    importSkillMock.mockImplementationOnce(async () => {
      openModal(ModalEnum.ERROR_DEBUG);
      throw new Error('RAW_PRIVATE_DEBUG_FAILURE');
    });
    try {
      render(<BrandSettingsSkillsPage />);
      await prepareImport();
      fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
      expect(
        await screen.findByText(
          'The import could not be confirmed. Refresh the catalog before importing again.',
        ),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Refresh imported skills' }),
      ).toBeEnabled();
      fireEvent.click(
        screen.getByRole('button', { name: 'Refresh imported skills' }),
      );
      await waitFor(() => expect(listSkillsMock).toHaveBeenCalledTimes(2));
      expect(importSkillMock).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByText('RAW_PRIVATE_DEBUG_FAILURE'),
      ).not.toBeInTheDocument();
    } finally {
      closeModal(ModalEnum.ERROR_DEBUG);
    }
  });
  it('keeps an ambiguous creation locked through failed recovery and unlocks only after a successful catalog load', async () => {
    importSkillMock.mockRejectedValueOnce(new Error('Unconfirmed response'));
    render(<BrandSettingsSkillsPage />);
    await prepareImport();
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    await screen.findByText(
      'The import could not be confirmed. Refresh the catalog before importing again.',
    );
    listSkillsMock.mockRejectedValueOnce(new Error('Failed refresh'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh imported skills' }),
    );
    expect(
      await screen.findByText('Failed to load the agent skill catalog.'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Import package' }),
    ).toBeDisabled();
    expect(importSkillMock).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh imported skills' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Import package' }),
      ).toBeEnabled(),
    );
    expect(listSkillsMock).toHaveBeenCalledTimes(3);
    expect(importSkillMock).toHaveBeenCalledTimes(1);
    await prepareImport();
    importSkillMock.mockResolvedValueOnce(importedFixture());
    getSkillMock.mockResolvedValue(importedFixture());
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    await waitFor(() => expect(importSkillMock).toHaveBeenCalledTimes(2));
  });
  it('retains fields and permits correction after known pre-write validation, while an ambiguous error stays locked', async () => {
    importSkillMock
      .mockRejectedValueOnce({
        errors: [{ status: '400', detail: 'RAW_PRIVATE_VALIDATION' }],
      })
      .mockRejectedValueOnce(new Error('RAW_PRIVATE_NETWORK'));
    render(<BrandSettingsSkillsPage />);
    await prepareImport();
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    expect(
      await screen.findByText(
        'The package was rejected. Correct the skill package and try again.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Skill slug' })).toHaveValue(
      'Private-Upload',
    );
    expect(screen.getByRole('button', { name: 'Import skill' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    expect(
      await screen.findByText(
        'The import could not be confirmed. Refresh the catalog before importing again.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Import skill' })).toBeDisabled();
    expect(importSkillMock).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByText('RAW_PRIVATE_VALIDATION'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('RAW_PRIVATE_NETWORK')).not.toBeInTheDocument();
  });
  it('shows an actionable duplicate-slug rejection without overwriting or automatically retrying', async () => {
    importSkillMock.mockRejectedValueOnce({
      errors: [{ status: '409', detail: 'RAW_DUPLICATE' }],
    });
    render(<BrandSettingsSkillsPage />);
    await prepareImport();
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    expect(
      await screen.findByText(
        'A personal skill already uses this slug. Choose another slug.',
      ),
    ).toBeVisible();
    expect(importSkillMock).toHaveBeenCalledTimes(1);
    expect(updateSkillMock).not.toHaveBeenCalled();
    expect(getSkillMock).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Skill slug' })).toBeEnabled();
  });
  it.each(['malformed', 'forbidden-created'])(
    'locks %s responses without leaking data or automatic POST retries',
    async (mode) => {
      if (mode === 'malformed')
        importSkillMock.mockResolvedValue(importedFixture({ id: '' }));
      else
        importSkillMock.mockRejectedValue({
          statusCode: 403,
          message:
            'Skill import was created, but details are unavailable. Refresh the skill library.',
        });
      render(<BrandSettingsSkillsPage />);
      await prepareImport();
      fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
      expect(
        await screen.findByText(
          'The skill was imported, but its details could not be loaded. Refresh the catalog.',
        ),
      ).toBeVisible();
      expect(getSkillMock).not.toHaveBeenCalled();
      expect(importSkillMock).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole('button', { name: 'Import skill' }),
      ).toBeDisabled();
    },
  );
  it.each([
    'actor',
    'session',
    'organization',
    'brand',
    'signout',
    'selection',
  ])('drops a deferred import token across %s changes', async (change) => {
    const token = pending<string>();
    const { rerender } = render(<BrandSettingsSkillsPage />);
    await prepareImport();
    resolveAuthTokenMock.mockReturnValueOnce(token.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Importing…' })).toBeDisabled(),
    );
    if (change === 'selection')
      fireEvent.click(screen.getByText('YouTube Script Setup'));
    else {
      changeImportScope(change);
      rerender(<BrandSettingsSkillsPage />);
    }
    await act(async () => token.resolve('stale-token'));
    expect(importSkillMock).not.toHaveBeenCalled();
    if (change !== 'selection')
      expect(
        screen.queryByDisplayValue('Private-Upload'),
      ).not.toBeInTheDocument();
  });
  it('aborts stale file reading and clears controlled private fields on session change', async () => {
    const read = pending<ArrayBuffer>();
    const file = importFile();
    Object.defineProperty(file, 'arrayBuffer', {
      configurable: true,
      value: () => read.promise,
    });
    const view = render(<BrandSettingsSkillsPage />);
    await prepareImport([file]);
    fireEvent.change(screen.getByRole('textbox', { name: 'Source URL' }), {
      target: { value: 'https://private.example/source' },
    });
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Package checksum' }),
      { target: { value: 'a'.repeat(64) } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    authIdentityMock.sessionId = 'new-session';
    view.rerender(<BrandSettingsSkillsPage />);
    await act(async () =>
      read.resolve(new TextEncoder().encode('old private package').buffer),
    );
    expect(importSkillMock).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Import package' }),
    );
    expect(screen.getByRole('textbox', { name: 'Skill slug' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Source URL' })).toHaveValue('');
    expect(
      screen.getByRole('textbox', { name: 'Package checksum' }),
    ).toHaveValue('');
    expect(screen.queryByText('SKILL.md')).not.toBeInTheDocument();
  });
  it('keeps refresh from invalidating an open authoritative imported detail', async () => {
    importSkillMock.mockResolvedValue(importedFixture());
    getSkillMock.mockResolvedValue(importedFixture());
    render(<BrandSettingsSkillsPage />);
    await prepareImport();
    fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    await screen.findByRole('textbox', { name: 'Name' });
    fireEvent.click(refresh);
    expect(listSkillsMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
      'Imported personal skill',
    );
    expect(importSkillMock).toHaveBeenCalledTimes(1);
  });
  it.each(['create', 'read'])(
    'ignores stale %s after every actor scope or selection change',
    async (phase) => {
      for (const change of [
        'actor',
        'session',
        'organization',
        'brand',
        'selection',
      ]) {
        Object.assign(authIdentityMock, {
          userId: 'user-1',
          sessionId: 'session-1',
          isSignedIn: true,
        });
        Object.assign(selectedBrandMock, {
          id: 'brand-1',
          slug: 'acme-creator',
          organization: { id: 'org-1', slug: 'acme-org' },
        });
        Object.assign(routeParamsMock, {
          orgSlug: 'acme-org',
          brandSlug: 'acme-creator',
        });
        brandContextMock.brandId = 'brand-1';
        importSkillMock.mockClear();
        getSkillMock.mockClear();
        const delayed = pending<Skill>();
        importSkillMock.mockReturnValue(
          phase === 'create'
            ? delayed.promise
            : Promise.resolve(importedFixture()),
        );
        getSkillMock.mockReturnValue(
          phase === 'read'
            ? delayed.promise
            : Promise.resolve(importedFixture()),
        );
        const view = render(<BrandSettingsSkillsPage />);
        await prepareImport();
        fireEvent.click(screen.getByRole('button', { name: 'Import skill' }));
        await waitFor(() =>
          expect(
            phase === 'create' ? importSkillMock : getSkillMock,
          ).toHaveBeenCalledTimes(1),
        );
        if (change === 'selection')
          fireEvent.click(screen.getByText('YouTube Script Setup'));
        else {
          changeImportScope(change);
          view.rerender(<BrandSettingsSkillsPage />);
        }
        await act(async () =>
          delayed.resolve(importedFixture({ name: 'STALE_PRIVATE_IMPORT' })),
        );
        expect(
          screen.queryByText('STALE_PRIVATE_IMPORT'),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByDisplayValue('STALE_PRIVATE_IMPORT'),
        ).not.toBeInTheDocument();
        if (phase === 'create') expect(getSkillMock).not.toHaveBeenCalled();
        view.unmount();
        closeModal(ModalEnum.SKILL);
      }
    },
  );
  function versionPage() {
    return {
      items: Array.from({ length: 20 }, (_, index) => ({
        id: `sv1_import-1_${22 - index}`,
        versionNumber: 22 - index,
        createdAt: '2026-10-02T10:20:30.000Z',
        contentHash: `sha256:skill-v1:${'a'.repeat(64)}`,
      })),
      limit: 20,
      hasMore: true,
      nextCursor: 3,
    };
  }
  async function openVersionSkill() {
    listSkillsMock.mockResolvedValue([
      importedFixture(),
      importedFixture({
        id: 'import-2',
        name: 'Second imported personal skill',
        slug: 'second-upload',
      }),
    ]);
    const view = render(<BrandSettingsSkillsPage />);
    fireEvent.click(await screen.findByText('Imported personal skill'));
    return view;
  }
  it('reads versions only on explicit actions and reads exact escaped snapshots without editing or export inference', async () => {
    listSkillVersionsMock.mockResolvedValue(versionPage());
    getSkillVersionMock.mockResolvedValue({
      ...versionPage().items[19],
      instructionText: '<script>EXACT_LITERAL</script> \n',
    });
    await openVersionSkill();
    expect(listSkillVersionsMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Load versions' }));
    await screen.findByRole('button', {
      name: 'View instructions for version 3',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'View instructions for version 3' }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Version instructions').textContent).toBe(
        '<script>EXACT_LITERAL</script> \n',
      ),
    );
    expect(getSkillVersionMock).toHaveBeenCalledWith(
      'import-1',
      'sv1_import-1_3',
    );
    expect(exportSkillMock).not.toHaveBeenCalled();
    expect(updateSkillMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Load older' }));
    await waitFor(() =>
      expect(listSkillVersionsMock).toHaveBeenLastCalledWith('import-1', {
        limit: 20,
        beforeVersionNumber: 3,
      }),
    );
  });
  it('latches reads synchronously, clears private history on the same unavailable denial, and preserves sparse imported edits', async () => {
    const response = pending<ReturnType<typeof versionPage>>();
    listSkillVersionsMock.mockReturnValueOnce(response.promise);
    await openVersionSkill();
    const load = screen.getByRole('button', { name: 'Load versions' });
    fireEvent.click(load);
    fireEvent.click(load);
    await waitFor(() => expect(listSkillVersionsMock).toHaveBeenCalledTimes(1));
    await act(async () => response.resolve(versionPage()));
    getSkillVersionMock.mockRejectedValue({
      status: 404,
      detail: 'PRIVATE_DENIAL',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'View instructions for version 3' }),
    );
    expect(
      await screen.findByText('Skill versions are unavailable.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'View instructions for version 3' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('PRIVATE_DENIAL')).not.toBeInTheDocument();
    getSkillMock.mockResolvedValue(importedFixture());
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Metadata only' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save skill' }));
    await waitFor(() =>
      expect(updateSkillMock).toHaveBeenCalledWith('import-1', {
        name: 'Metadata only',
      }),
    );
  });
  it('keeps metadata saves independent of a pending versions read and discards that read after the save starts', async () => {
    const response = pending<ReturnType<typeof versionPage>>();
    listSkillVersionsMock.mockReturnValueOnce(response.promise);
    getSkillMock.mockResolvedValue(
      importedFixture({ name: 'Metadata during read' }),
    );
    await openVersionSkill();
    fireEvent.click(screen.getByRole('button', { name: 'Load versions' }));
    await waitFor(() => expect(listSkillVersionsMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Metadata during read' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save skill' }));
    await waitFor(() =>
      expect(updateSkillMock).toHaveBeenCalledWith('import-1', {
        name: 'Metadata during read',
      }),
    );
    await act(async () => response.resolve(versionPage()));
    expect(
      screen.queryByRole('button', { name: 'View instructions for version 3' }),
    ).not.toBeInTheDocument();
    expect(getSkillVersionMock).not.toHaveBeenCalled();
  });
  it.each([
    'actor',
    'session',
    'organization',
    'brand',
    'signout',
    'close',
    'selection',
  ])('drops a deferred versions token across %s changes', async (change) => {
    const view = await openVersionSkill();
    const token = pending<string>();
    resolveAuthTokenMock.mockReturnValueOnce(token.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Load versions' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Loading versions…' }),
      ).toBeDisabled(),
    );
    if (change === 'close' || change === 'selection') {
      await act(async () => {
        closeModal(ModalEnum.SKILL);
      });
      if (change === 'selection')
        fireEvent.click(screen.getByText('Second imported personal skill'));
    } else {
      changeImportScope(change);
      view.rerender(<BrandSettingsSkillsPage />);
    }
    await act(async () => token.resolve('stale-token'));
    expect(listSkillVersionsMock).not.toHaveBeenCalled();
  });
  it.each(
    ['list', 'detail'].flatMap((phase) =>
      [
        'actor',
        'session',
        'organization',
        'brand',
        'signout',
        'close',
        'selection',
      ].map((change) => ({ phase, change })),
    ),
  )(
    'ignores stale versions $phase HTTP after $change',
    async ({ phase, change }) => {
      const view = await openVersionSkill();
      const response = pending<ReturnType<typeof versionPage>>();
      const detail = pending<{
        id: string;
        versionNumber: number;
        createdAt: string;
        contentHash: string;
        instructionText: string;
      }>();
      listSkillVersionsMock.mockReturnValueOnce(
        phase === 'list' ? response.promise : Promise.resolve(versionPage()),
      );
      getSkillVersionMock.mockReturnValueOnce(detail.promise);
      fireEvent.click(screen.getByRole('button', { name: 'Load versions' }));
      if (phase === 'detail') {
        fireEvent.click(
          await screen.findByRole('button', {
            name: 'View instructions for version 3',
          }),
        );
        await waitFor(() =>
          expect(getSkillVersionMock).toHaveBeenCalledTimes(1),
        );
      } else
        await waitFor(() =>
          expect(listSkillVersionsMock).toHaveBeenCalledTimes(1),
        );
      if (change === 'close' || change === 'selection') {
        await act(async () => {
          closeModal(ModalEnum.SKILL);
        });
        if (change === 'selection')
          fireEvent.click(screen.getByText('Second imported personal skill'));
      } else {
        changeImportScope(change);
        view.rerender(<BrandSettingsSkillsPage />);
      }
      await act(async () => {
        response.resolve(versionPage());
        detail.resolve({
          ...versionPage().items[19],
          instructionText: 'STALE_PRIVATE_VERSION',
        });
      });
      expect(
        screen.queryByText('STALE_PRIVATE_VERSION'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText('Version instructions'),
      ).not.toBeInTheDocument();
    },
  );
});
