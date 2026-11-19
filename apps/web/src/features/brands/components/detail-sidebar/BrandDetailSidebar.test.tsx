import type { BrandDetailSidebarProps } from '@props/pages/brand-detail.props';
import { render } from '@testing-library/react';
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

  it('shows connected accounts below visibility and above website links', () => {
    render(
      <BrandDetailSidebar {...props}>
        <div>Connected Accounts</div>
      </BrandDetailSidebar>,
    );

    const text = document.body.textContent ?? '';
    expect(text.indexOf('Account Settings Card')).toBeLessThan(
      text.indexOf('Connected Accounts'),
    );
    expect(text.indexOf('Connected Accounts')).toBeLessThan(
      text.indexOf('External Links Card'),
    );
  });
});
