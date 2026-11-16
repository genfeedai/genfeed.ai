import type { BrandDetailSidebarProps } from '@props/pages/brand-detail.props';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandDetailSidebar from '@/features/brands/components/detail-sidebar/BrandDetailSidebar';

vi.mock('@ui/cards/brand-completeness-card/BrandCompletenessCard', () => ({
  default: () => <div>Brand Completeness Card</div>,
}));

vi.mock(
  '@/features/brands/components/sidebar/BrandDetailAccountSettingsCard',
  () => ({
    default: () => <div>Account Settings Card</div>,
  }),
);

vi.mock(
  '@/features/brands/components/sidebar/BrandDetailExternalLinksCard',
  () => ({
    default: () => <div>External Links Card</div>,
  }),
);

vi.mock(
  '@/features/brands/components/sidebar/BrandDetailDefaultModelsCard',
  () => ({
    default: () => <div>Default Models Card</div>,
  }),
);

vi.mock(
  '@/features/brands/components/brand-kit/writing-voice/BrandWritingVoiceEditor',
  () => ({
    default: () => <div>Agent Profile Card</div>,
  }),
);

vi.mock('@/features/brands/components/sidebar/BrandDetailIdentityCard', () => ({
  default: () => <div>Identity Card</div>,
}));

vi.mock(
  '@/features/brands/components/sidebar/BrandDetailManualKitCard',
  () => ({
    default: () => <div>Manual Kit Card</div>,
  }),
);

vi.mock(
  '@/features/brands/components/sidebar/BrandDetailReferencesCard',
  () => ({
    default: () => <div>References Card</div>,
  }),
);

describe('BrandDetailSidebar', () => {
  const props: BrandDetailSidebarProps = {
    brand: {
      id: 'brand-1',
      label: 'Test Brand',
      scope: 'BRAND',
    } as BrandDetailSidebarProps['brand'],
    links: [],
    onOpenLinkModal: vi.fn(),
    onTogglePublicProfile: vi.fn(),
  };

  it('renders the visibility and website links cards, and no social accounts', () => {
    render(<BrandDetailSidebar {...props} />);

    expect(screen.getByText('Account Settings Card')).toBeInTheDocument();
    expect(screen.getByText('External Links Card')).toBeInTheDocument();
    expect(screen.queryByText('Social Media Card')).not.toBeInTheDocument();
  });
});
