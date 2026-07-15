import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { UsersService } from '@services/organization/users.service';
import { BrandsService } from '@services/social/brands.service';
import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useParams } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentConfigurationPage from './agent-configuration-page';

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/orchestration/configuration/page.tsx',
);

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(),
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: { getInstance: vi.fn() },
}));

vi.mock('@services/organization/users.service', () => ({
  UsersService: { getInstance: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
}));

describe('AgentConfigurationPage', () => {
  const fetchMock = vi.fn();
  const updateAgentConfig = vi.fn().mockResolvedValue(undefined);
  const patchSettings = vi.fn().mockResolvedValue(undefined);
  const refreshBrands = vi.fn().mockResolvedValue(undefined);
  const refetchUser = vi.fn().mockResolvedValue(undefined);
  const mutateUser = vi.fn();
  const selectedBrand = {
    agentConfig: {
      defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
      persona: 'Use the brand voice.',
    },
    id: 'brand-db-id',
    organization: { id: 'org-db-id', slug: 'acme' },
    slug: 'launchpad',
  };
  const currentUser = {
    id: 'user-db-id',
    settings: { generationPriority: 'speed' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock as typeof fetch;
    vi.mocked(useParams).mockReturnValue({
      brandSlug: 'launchpad',
      orgSlug: 'acme',
    });
    vi.mocked(useBrand).mockReturnValue({
      brandId: 'brand-db-id',
      isReady: true,
      refreshBrands,
      selectedBrand,
    } as never);
    vi.mocked(useCurrentUser).mockReturnValue({
      currentUser,
      isLoading: false,
      mutateUser,
      refetchUser,
    } as never);
    vi.mocked(useAuthedService).mockImplementation(
      (factory: (token: string) => unknown) => async () => factory('token'),
    );
    vi.mocked(BrandsService.getInstance).mockReturnValue({
      updateAgentConfig,
    } as never);
    vi.mocked(UsersService.getInstance).mockReturnValue({
      patchSettings,
    } as never);
  });

  it('hydrates from protected brand context and the canonical current user', () => {
    render(<AgentConfigurationPage />);

    expect(screen.getByRole('button', { name: /^Fast\b/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Agent persona' })).toHaveValue(
      'Use the brand voice.',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not expose editable defaults while scoped hydration is pending', () => {
    vi.mocked(useBrand).mockReturnValue({
      isReady: false,
      refreshBrands,
    } as never);
    vi.mocked(useCurrentUser).mockReturnValue({
      currentUser: null,
      isLoading: true,
      mutateUser,
      refetchUser,
    } as never);

    render(<AgentConfigurationPage />);

    expect(
      screen.getByRole('status', { name: 'Loading agent configuration' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save Settings' }),
    ).not.toBeInTheDocument();
  });

  it('normalizes missing brand access (403) without a refetch', () => {
    vi.mocked(useBrand).mockReturnValue({
      brandId: '',
      isReady: true,
      refreshBrands,
      selectedBrand: undefined,
    } as never);

    render(<AgentConfigurationPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Agent configuration is unavailable for this brand.',
    );
    expect(global.fetch).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Save Settings' }),
    ).not.toBeInTheDocument();
  });

  it('normalizes a missing user settings record (404) to a recoverable state', () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      currentUser: null,
      isLoading: false,
      mutateUser,
      refetchUser,
    } as never);

    render(<AgentConfigurationPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your settings could not be loaded.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry settings' }));
    expect(refetchUser).toHaveBeenCalledOnce();
  });

  it('fails closed when route and protected context scopes do not match', () => {
    vi.mocked(useParams).mockReturnValue({
      brandSlug: 'another-brand',
      orgSlug: 'acme',
    });

    render(<AgentConfigurationPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Agent configuration is unavailable for this brand.',
    );
    expect(updateAgentConfig).not.toHaveBeenCalled();
    expect(patchSettings).not.toHaveBeenCalled();
  });

  it('renders explicit defaults only after authoritative empty state hydrates', () => {
    vi.mocked(useBrand).mockReturnValue({
      brandId: 'brand-db-id',
      isReady: true,
      refreshBrands,
      selectedBrand: { ...selectedBrand, agentConfig: undefined },
    } as never);
    vi.mocked(useCurrentUser).mockReturnValue({
      currentUser: { ...currentUser, settings: undefined },
      isLoading: false,
      mutateUser,
      refetchUser,
    } as never);

    render(<AgentConfigurationPage />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'No model, persona, or generation priority overrides are saved yet.',
    );
    expect(screen.getByRole('button', { name: /^Balanced\b/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('saves through canonical scoped services and refreshes hydrated context', async () => {
    render(<AgentConfigurationPage />);

    fireEvent.click(screen.getByRole('button', { name: /^Budget\b/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent persona' }), {
      target: { value: 'Stay concise.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    await waitFor(() => {
      expect(updateAgentConfig).toHaveBeenCalledWith('brand-db-id', {
        defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
        persona: 'Stay concise.',
      });
      expect(patchSettings).toHaveBeenCalledWith('user-db-id', {
        generationPriority: 'cost',
      });
    });
    expect(mutateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-db-id',
        settings: expect.objectContaining({ generationPriority: 'cost' }),
      }),
    );
    expect(refreshBrands).toHaveBeenCalledOnce();
  });
});
