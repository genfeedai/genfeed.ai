import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandOsSettingsCardProps } from '@/features/brands/props/brand-os-settings.props';
import BrandKitPage from './content';

const mocks = vi.hoisted(() => ({
  role: 'owner',
  pathname: '/acme/acme/settings/brand-kit',
  capture: vi.fn(),
  push: vi.fn(),
  upload: vi.fn(),
  revisionContent: {
    id: 'draft-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    status: 'ready',
    sourceType: 'manual',
    assetCandidates: [],
    diagnostics: [],
    evidence: [],
    fields: {
      description: {
        key: 'description',
        label: 'Description',
        group: 'profile',
        ownerPath: 'brand.description',
        applyActionDefault: 'accept',
        currentValue: 'Saved description',
        proposedValue: 'Proposed description',
        diagnostics: [],
        evidence: [],
      },
    },
    readiness: {
      status: 'complete',
      score: 100,
      requiredFields: [],
      missingFields: [],
      diagnostics: [],
    },
  } satisfies IBrandKitDraft,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/acme${path}` }),
}));
vi.mock('@/hooks/auth/use-user-role/use-user-role', () => ({
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
vi.mock('@/hooks/pages/use-brand-detail/use-brand-detail', () => ({
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
vi.mock('@/features/brands/components/brand-kit/BrandOsSettingsCard', () => ({
  default: ({ renderWorkspace }: BrandOsSettingsCardProps) =>
    renderWorkspace?.({
      content: mocks.revisionContent,
      approvedContent: null,
      editor: <p>Versioned editor</p>,
      review: <p>Revision history and export</p>,
      isDirty: true,
      isLoading: false,
      isSaveDisabled: false,
      error: null,
      onSave: vi.fn(),
    }),
}));
vi.mock('@/features/brands/components/brand-kit/BrandKitReviewCard', () => ({
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
vi.mock(
  '@/features/brands/components/sidebar/BrandDetailManualKitCard',
  () => ({
    default: () => <p>Manual draft workflow</p>,
  }),
);
vi.mock(
  '@/features/brands/components/brand-kit/writing-voice/BrandWritingVoiceEditor',
  () => ({ default: () => <p>Writing editor</p> }),
);
vi.mock(
  '@/features/brands/components/sidebar/BrandDetailReferencesCard',
  () => ({
    default: () => <p>References</p>,
  }),
);
vi.mock('@/features/brands/components/sidebar/BrandWatermarkSettings', () => ({
  default: () => <p>Watermark</p>,
}));
vi.mock('@ui/cards/brand-completeness-card/BrandCompletenessCard', () => ({
  default: () => <p>Completeness</p>,
}));
vi.mock('@ui/layout/container/Container', async () => {
  const { Tabs } = await import('@ui/primitives/tabs');
  return {
    default: ({
      children,
      headerTabs,
      right,
    }: {
      children: ReactNode;
      headerTabs?: ComponentProps<typeof Tabs>;
      right?: ReactNode;
    }) => (
      <div>
        <div data-testid="subbar">
          {headerTabs ? <Tabs {...headerTabs} /> : null}
          {right}
        </div>
        {children}
      </div>
    ),
  };
});
describe('Brand Kit workspace', () => {
  beforeEach(() => {
    mocks.role = 'owner';
    mocks.pathname = '/acme/acme/settings/brand-kit';
  });

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
  it('puts the section tabs and actions in the shared subbar, not in the content', () => {
    render(<BrandKitPage />);
    const subbar = within(screen.getByTestId('subbar'));
    expect(subbar.getAllByRole('tab')).toHaveLength(4);
    expect(
      subbar.getByRole('button', { name: 'Scan website' }),
    ).toBeInTheDocument();
    expect(
      subbar.getByRole('button', { name: 'Brand Kit actions' }),
    ).toBeInTheDocument();
    expect(
      subbar.getByRole('button', { name: 'Review changes' }),
    ).toBeInTheDocument();
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

  it.each(['voice', 'strategy'] as const)(
    'keeps the live %s editor outside the closed versioned snapshot',
    (tab) => {
      mocks.pathname = `/acme/acme/settings/brand-kit/${tab}`;
      render(<BrandKitPage />);
      expect(screen.getByText('Writing editor')).toBeInTheDocument();
      expect(screen.queryByText('Versioned editor')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Save draft' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Unsaved revision changes'),
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Versioned identity snapshot' }),
      );
      expect(screen.getByText('Writing editor')).toBeInTheDocument();
      expect(screen.getByText('Versioned editor')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Save draft' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Unsaved revision changes',
      );
    },
  );

  it('keeps the visual revision save bar outside the snapshot', () => {
    mocks.pathname = '/acme/acme/settings/brand-kit/visual';
    render(<BrandKitPage />);
    expect(
      screen.queryByRole('button', { name: 'Versioned identity snapshot' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save draft' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Unsaved revision changes',
    );
  });

  it.each([
    ['Writing voice', '/acme/acme/settings/brand-kit/voice'],
    ['Overview', '/acme/acme/settings/brand-kit'],
  ])('navigates to a path, not a query param, for the %s tab', (name, href) => {
    mocks.pathname = '/acme/acme/settings/brand-kit/visual';
    render(<BrandKitPage />);
    fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });
    expect(mocks.push).toHaveBeenCalledWith(href, { scroll: false });
  });
});
