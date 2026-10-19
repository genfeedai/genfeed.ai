import { AssetScope, ModalEnum } from '@genfeedai/contracts';
import type { ILink } from '@genfeedai/contracts/interfaces';
import type { BrandSidebarPanelProps } from '@genfeedai/props/ui/brands/brand-sidebar.props';
import { fireEvent, render, screen } from '@testing-library/react';
import BrandSidebarPanel from '@ui/brands/sidebar/BrandSidebarPanel';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openModalMock = vi.hoisted(() => vi.fn());
const patchBrandMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: 'brand-1', scope: 'public' }),
);
const setQueryDataMock = vi.hoisted(() => vi.fn());
const existingLink = vi.hoisted(() => ({
  category: 'website',
  id: 'link-1',
  label: 'Homepage',
  url: 'https://genfeed.ai',
}));

vi.mock('@genfeedai/helpers/ui/modal/modal.helper', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return {
    ...actual,
    openModal: openModalMock,
  };
});

// The overview renders the real `BrandDetailOverview`, whose copy resolves
// through `pages.brandDetailOverview` in the app's English catalog.
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  __esModule: true,
  useOrgUrl: () => ({ orgSlug: 'acme-org' }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  __esModule: true,
  useAuthedService: () => () =>
    Promise.resolve({
      delete: vi.fn(),
      findOne: vi.fn(),
      patch: patchBrandMock,
    }),
}));

vi.mock('@genfeedai/hooks/data/elements/use-elements/use-elements', () => ({
  __esModule: true,
  useElements: () => ({ imageModels: [] }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: null,
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  })),
  useQueryClient: vi.fn(() => ({
    setQueryData: setQueryDataMock,
  })),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    __esModule: true,
    useConfirmModal: () => ({ openConfirm: vi.fn() }),
    useUploadModal: () => ({ openUpload: vi.fn() }),
  }),
);

vi.mock('@ui/lazy/modal/LazyModal', () => ({
  __esModule: true,
  LazyModalBrandGenerate: () => <div data-testid="brand-generate-modal" />,
  LazyModalBrandLink: ({
    brandId,
    link,
  }: {
    brandId: string | null;
    link: ILink | null;
  }) => (
    <div
      data-testid="brand-link-modal"
      data-brand-id={brandId ?? ''}
      data-link-id={link?.id ?? ''}
    />
  ),
}));

vi.mock('@pages/brands/components/detail-sidebar/BrandDetailSidebar', () => ({
  __esModule: true,
  default: ({
    onOpenLinkModal,
    onTogglePublicProfile,
  }: {
    onOpenLinkModal: (link?: ILink) => void;
    onTogglePublicProfile: (isPublic: boolean) => void;
  }) => (
    <div data-testid="brand-detail-sidebar">
      <button type="button" onClick={() => onOpenLinkModal()}>
        Add link
      </button>
      <button
        type="button"
        onClick={() => onOpenLinkModal(existingLink as unknown as ILink)}
      >
        Edit link
      </button>
      <button type="button" onClick={() => onTogglePublicProfile(true)}>
        Make public
      </button>
    </div>
  ),
}));

describe('BrandSidebarPanel', () => {
  const brand: BrandSidebarPanelProps['brand'] = {
    description: 'Brand description',
    id: 'brand-1',
    label: 'Brand One',
    scope: 'brand',
    slug: 'brand-one',
  } as unknown as BrandSidebarPanelProps['brand'];

  beforeEach(() => {
    openModalMock.mockClear();
    patchBrandMock.mockClear();
    setQueryDataMock.mockClear();
  });

  it('links to the brand settings page', () => {
    render(<BrandSidebarPanel brand={brand} />);

    expect(screen.getByRole('link', { name: 'Open settings' })).toHaveAttribute(
      'href',
      '/acme-org/brand-one/settings',
    );
  });

  it('shows the visibility of the brand', () => {
    render(<BrandSidebarPanel brand={brand} />);

    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('counts only genuinely connected credentials, not a raw isConnected tally', () => {
    // A credential can have `isConnected: true` yet still need reconnecting
    // (no `externalId`, or an expired token), so a raw tally would read "2".
    const brandWithMixedCredentials = {
      ...brand,
      credentials: [
        {
          externalHandle: 'genfeed',
          externalId: 'ext-1',
          id: 'cred-1',
          isConnected: true,
          platform: 'twitter',
        },
        {
          id: 'cred-2',
          isConnected: true,
          platform: 'tiktok',
        },
      ],
    } as unknown as BrandSidebarPanelProps['brand'];

    render(<BrandSidebarPanel brand={brandWithMixedCredentials} />);

    expect(screen.getByText('1 connected')).toBeInTheDocument();
    expect(screen.queryByText('2 connected')).not.toBeInTheDocument();
  });

  it('opens the shared brand link modal for a new link', () => {
    render(<BrandSidebarPanel brand={brand} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

    expect(openModalMock).toHaveBeenCalledWith(ModalEnum.BRAND_LINK);
    expect(screen.getByTestId('brand-link-modal')).toHaveAttribute(
      'data-brand-id',
      'brand-1',
    );
    expect(screen.getByTestId('brand-link-modal')).toHaveAttribute(
      'data-link-id',
      '',
    );
  });

  it('hands the selected link to the shared modal when editing', () => {
    render(<BrandSidebarPanel brand={brand} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit link' }));

    expect(openModalMock).toHaveBeenCalledWith(ModalEnum.BRAND_LINK);
    expect(screen.getByTestId('brand-link-modal')).toHaveAttribute(
      'data-link-id',
      'link-1',
    );
  });

  it('saves the public profile in place and tells the list to refresh', async () => {
    const onChange = vi.fn();
    render(<BrandSidebarPanel brand={brand} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Make public' }));

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(patchBrandMock).toHaveBeenCalledWith('brand-1', {
      scope: AssetScope.PUBLIC,
    });
    expect(setQueryDataMock).toHaveBeenCalledWith(
      ['brand-sidebar', 'brand-1'],
      expect.objectContaining({ id: 'brand-1' }),
    );
  });
});
