import BrandDetailSidebar from '@pages/brands/components/detail-sidebar/BrandDetailSidebar';
import type { BrandDetailSidebarProps } from '@props/pages/brand-detail.props';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@pages/brands/components/sidebar/BrandDetailAccountSettingsCard',
  () => ({
    default: () => <div>Account Settings Card</div>,
  }),
);

vi.mock('@pages/brands/components/sidebar/BrandDetailSocialMediaCard', () => ({
  default: () => <div>Social Media Card</div>,
}));

vi.mock(
  '@pages/brands/components/sidebar/BrandDetailExternalLinksCard',
  () => ({
    default: () => <div>External Links Card</div>,
  }),
);

vi.mock(
  '@pages/brands/components/sidebar/BrandDetailDefaultModelsCard',
  () => ({
    default: () => <div>Default Models Card</div>,
  }),
);

vi.mock('@pages/brands/components/sidebar/BrandDetailAgentProfileCard', () => ({
  default: () => <div>Agent Profile Card</div>,
}));

vi.mock('@pages/brands/components/sidebar/BrandDetailIdentityCard', () => ({
  default: () => <div>Identity Card</div>,
}));

vi.mock('@pages/brands/components/sidebar/BrandDetailReferencesCard', () => ({
  default: () => <div>References Card</div>,
}));

describe('BrandDetailSidebar', () => {
  const props: BrandDetailSidebarProps = {
    brand: {
      id: 'brand-1',
      label: 'Test Brand',
      scope: 'BRAND',
    } as BrandDetailSidebarProps['brand'],
    brandId: 'brand-1',
    connectedPlatformsCount: 0,
    deletingRefId: null,
    links: [],
    onDeleteReference: vi.fn(),
    onOpenLinkModal: vi.fn(),
    onRefreshBrand: vi.fn().mockResolvedValue(undefined),
    onTogglePublicProfile: vi.fn(),
    onUploadReference: vi.fn(),
    socialConnections: [],
  };

  it('renders all sidebar sections', () => {
    render(<BrandDetailSidebar {...props} />);

    expect(screen.getByText('Account Settings Card')).toBeInTheDocument();
    expect(screen.getByText('Social Media Card')).toBeInTheDocument();
    expect(screen.getByText('External Links Card')).toBeInTheDocument();
    expect(screen.getByText('Default Models Card')).toBeInTheDocument();
    expect(screen.getByText('Agent Profile Card')).toBeInTheDocument();
    expect(screen.getByText('Identity Card')).toBeInTheDocument();
    expect(screen.getByText('References Card')).toBeInTheDocument();
  });
});
