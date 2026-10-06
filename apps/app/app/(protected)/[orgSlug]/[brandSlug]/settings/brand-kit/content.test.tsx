import type { BrandOsSettingsCardProps } from '@props/pages/brand-os-settings.props';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import BrandKitPage from './content';

const mocks = vi.hoisted(() => ({
  role: 'owner',
  capture: vi.fn(),
  replace: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/acme/acme/settings/brand-kit',
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/acme${path}` }),
}));
vi.mock('@hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => mocks.role,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));
vi.mock('@services/social/brands.service', () => ({
  BrandsService: { getInstance: vi.fn() },
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@/lib/analytics', () => ({
  captureBrandOsFunnelStage: mocks.capture,
}));
vi.mock('@hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => ({
    brand: { id: 'brand-1', label: 'Acme', description: 'Acme', slug: 'acme' },
    brandId: 'brand-1',
    deletingRefId: null,
    handleOpenUploadModal: mocks.upload,
    handleRefreshBrand: vi.fn(),
    handleRequestDeleteReference: vi.fn(),
    hasBrandId: true,
    isLoading: false,
  }),
}));
vi.mock('@pages/brands/components/brand-kit/BrandOsSettingsCard', () => ({
  default: ({ renderWorkspace }: BrandOsSettingsCardProps) =>
    renderWorkspace?.({
      content: null,
      approvedContent: null,
      editor: null,
      review: <p>Revision history and export</p>,
      isDirty: false,
      isLoading: false,
      isSaveDisabled: true,
      error: null,
      onSave: vi.fn(),
    }),
}));
vi.mock('@pages/brands/components/brand-kit/BrandKitReviewCard', () => ({
  default: (props: {
    loadClaimedBrandOsDraft?: boolean;
    onDraftCreated?: unknown;
  }) => (
    <p
      data-testid="scan"
      data-claimed={String(props.loadClaimedBrandOsDraft)}
      data-persist={String(Boolean(props.onDraftCreated))}
    >
      Scan workflow
    </p>
  ),
}));
vi.mock('@pages/brands/components/sidebar/BrandDetailManualKitCard', () => ({
  default: () => <p>Manual draft workflow</p>,
}));
vi.mock(
  '@pages/brands/components/brand-kit/writing-voice/BrandWritingVoiceEditor',
  () => ({ default: () => <p>Writing editor</p> }),
);
vi.mock('@pages/brands/components/sidebar/BrandDetailReferencesCard', () => ({
  default: () => <p>References</p>,
}));
vi.mock('@pages/brands/components/sidebar/BrandWatermarkSettings', () => ({
  default: () => <p>Watermark</p>,
}));
vi.mock('@ui/cards/brand-completeness-card/BrandCompletenessCard', () => ({
  default: () => <p>Completeness</p>,
}));
vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
describe('Brand Kit workspace', () => {
  it('keeps four sections, a local preview and focused revision review without a duplicate page heading', () => {
    render(<BrandKitPage />);
    expect(
      screen
        .getAllByRole('tab')
        .slice(0, 4)
        .map((tab) => tab.textContent),
    ).toEqual(['Overview', 'Visual identity', 'Writing voice', 'Strategy']);
    expect(screen.getByTestId('brand-kit-local-preview')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Brand Kit' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Revision history and export'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
    expect(screen.getByText('Revision history and export')).toBeInTheDocument();
  });
  it('retains captured drafts and read-only member scan access without revision write callbacks', () => {
    mocks.role = 'member';
    try {
      render(<BrandKitPage />);
      expect(screen.getByTestId('scan')).toHaveAttribute(
        'data-claimed',
        'true',
      );
      expect(screen.getByTestId('scan')).toHaveAttribute(
        'data-persist',
        'false',
      );
    } finally {
      mocks.role = 'owner';
    }
  });
});
