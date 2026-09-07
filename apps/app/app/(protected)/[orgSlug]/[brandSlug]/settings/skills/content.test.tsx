// @vitest-environment jsdom
'use client';

import { ModalEnum } from '@genfeedai/contracts';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BrandSettingsSkillsPage from './content';

const pushMock = vi.fn();
const getTokenMock = vi.fn();
const resolveAuthTokenMock = vi.fn();
const listSkillsMock = vi.fn();
const customizeSkillMock = vi.fn();
const updateSkillMock = vi.fn();
const toggleSkillMock = vi.fn();
const setUseDefaultsMock = vi.fn();
const selectedBrandMock = {
  agentConfig: {
    enabledSkills: [],
  },
  id: 'brand-1',
  label: 'Acme Brand',
  organization: { slug: 'acme-org' },
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

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useParams: () => routeParamsMock,
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: getTokenMock,
    isLoaded: true,
  }),
}));

vi.mock('@hooks/data/skills/use-brand-enabled-skills', () => ({
  useBrandEnabledSkills: () => ({
    enabledSlugs: [],
    isLoading: false,
    isUsingDefaults: false,
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
      getInstance: () => ({
        customizeSkill: customizeSkillMock,
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
    vi.clearAllMocks();
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
      organization: { slug: 'acme-org' },
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
    customizeSkillMock.mockResolvedValue({});
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

    fireEvent.click(screen.getByRole('button', { name: /test with Agent/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        '/acme-org/acme-creator/agent/new?prompt=Use%20my%20YouTube%20Script%20Setup%20setup%20to%20create%20a%20small%20sample%20for%20youtube.%20Explain%20how%20the%20skill%20affects%20the%20output.',
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
      organization: { slug: 'beta-org' },
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
});
