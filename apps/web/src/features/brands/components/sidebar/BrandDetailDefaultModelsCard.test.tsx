import type { BrandDetailDefaultModelsCardProps } from '@props/pages/brand-detail.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandDetailDefaultModelsCard from '@/features/brands/components/sidebar/BrandDetailDefaultModelsCard';

const mocks = vi.hoisted(() => ({
  patch: vi.fn(),
  retiredKeys: {} as Record<string, string>,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: 'org-1' }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    patch: mocks.patch,
    patchSettings: vi.fn(),
  }),
}));

vi.mock('@/features/models/hooks/useRetiredModels', () => ({
  useRetiredModels: () => ({
    getRetiredModel: (key: string | null | undefined) =>
      key && mocks.retiredKeys[key]
        ? { key, label: mocks.retiredKeys[key] }
        : null,
    isLoading: false,
  }),
}));

vi.mock('@/features/workflows/hooks/useWorkflowModelCatalog', () => ({
  useWorkflowModelCatalog: () => ({
    hasError: false,
    isLoading: false,
    models: [{ key: 'new-video', label: 'New Video' }],
  }),
}));

vi.mock('@/hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: vi.fn(() => ({
    refresh: vi.fn(),
    settings: {
      defaultImageModel: 'org-image-model',
      defaultMusicModel: 'org-music-model',
    },
  })),
}));

describe('BrandDetailDefaultModelsCard', () => {
  beforeEach(() => {
    mocks.retiredKeys = {};
    mocks.patch.mockReset();
  });

  const brand = {
    defaultVideoModel: 'test-video-model',
  } as BrandDetailDefaultModelsCardProps['brand'];

  it('should render without crashing', () => {
    render(<BrandDetailDefaultModelsCard brand={brand} />);
    expect(screen.getByText('Default Models')).toBeInTheDocument();
    expect(screen.getByText('Video')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <BrandDetailDefaultModelsCard brand={brand} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <BrandDetailDefaultModelsCard brand={brand} />,
    );
    // The title sits above the card; the surface is the bordered element.
    const rootElement = container.querySelector('.rounded-card') as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    expect(rootElement).toHaveClass('rounded-card');
    expect(rootElement).toHaveClass('bg-card');
  });

  it('renders organization fallbacks when brand overrides are empty', () => {
    render(
      <BrandDetailDefaultModelsCard
        brand={{} as BrandDetailDefaultModelsCardProps['brand']}
      />,
    );

    expect(screen.getByText('Image')).toBeInTheDocument();
    expect(screen.getByText('org-image-model')).toBeInTheDocument();
    expect(screen.getAllByText('Organization default').length).toBeGreaterThan(
      0,
    );
  });

  it('flags a retired brand override and saves the model picked instead', async () => {
    mocks.retiredKeys = { 'test-video-model': 'Old Video' };
    mocks.patch.mockResolvedValue({});
    const onRefreshBrand = vi.fn();
    render(
      <BrandDetailDefaultModelsCard
        brand={{ ...brand, id: 'brand-1' }}
        onRefreshBrand={onRefreshBrand}
      />,
    );

    expect(screen.getByText('Old Video was retired')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pick a new model' }));
    fireEvent.click(screen.getByRole('button', { name: /New Video/ }));

    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('brand-1', {
        defaultVideoModel: 'new-video',
      }),
    );
    await waitFor(() => expect(onRefreshBrand).toHaveBeenCalled());
  });

  it('shows no retired flag when every default is active', () => {
    render(<BrandDetailDefaultModelsCard brand={brand} />);

    expect(
      screen.queryByRole('button', { name: 'Pick a new model' }),
    ).not.toBeInTheDocument();
  });
});
