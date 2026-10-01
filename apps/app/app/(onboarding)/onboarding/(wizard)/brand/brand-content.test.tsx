// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { IBrandOsRevision } from '@genfeedai/contracts/interfaces';
import type {
  BrandGuidePanelProps,
  UseBrandGuideScanResult,
} from '@genfeedai/props/onboarding/brand-guide.props';
import type { BrandOsSettingsCardProps } from '@genfeedai/props/pages/brand-os-settings.props';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandGuidePanel from './brand-guide-panel';

const mocks = vi.hoisted(() => ({
  scan: null as UseBrandGuideScanResult | null,
  start: vi.fn(),
  reconcile: vi.fn(),
  change: vi.fn(),
  continue: vi.fn(),
  skip: vi.fn(),
  refresh: vi.fn(),
  mounted: vi.fn(),
  cardProps: null as BrandOsSettingsCardProps | null,
}));
vi.mock('./use-brand-guide-scan', () => ({
  useBrandGuideScan: () => mocks.scan,
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  const translate = translateFromCatalog('pages.onboarding.brand');
  return { useTranslations: () => translate };
});
vi.mock(
  '@genfeedai/pages/brands/components/brand-kit/BrandOsSettingsCard',
  async () => {
    const { useEffect } = await import('react');
    return {
      default: (props: BrandOsSettingsCardProps) => {
        mocks.cardProps = props;
        useEffect(() => {
          mocks.mounted();
        }, []);
        return <p>Retained guide card</p>;
      },
    };
  },
);
function panelProps(): BrandGuidePanelProps {
  return {
    brandId: 'brand-1',
    websiteUrl: '',
    onWebsiteUrlChange: mocks.change,
    isExiting: false,
    errorMessage: null,
    onContinue: mocks.continue,
    onSkip: mocks.skip,
    onRefreshBrand: mocks.refresh,
  };
}
function revision(status: IBrandOsRevision['status']): IBrandOsRevision {
  return {
    id: 'revision',
    brandId: 'brand-1',
    organizationId: 'org-1',
    version: 1,
    exportSchemaVersion: '1',
    status,
    content: {
      id: 'draft',
      brandId: 'brand-1',
      status: 'ready',
      sourceType: 'manual',
      fields: {},
      assetCandidates: [],
      evidence: [],
      diagnostics: [],
      readiness: {
        status: 'complete',
        score: 1,
        requiredFields: [],
        missingFields: [],
        diagnostics: [],
      },
    },
    approvedById: null,
    approvedAt: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cardProps = null;
  mocks.scan = {
    scan: null,
    phase: 'idle',
    slow: false,
    request: null,
    refreshKey: 0,
    error: false,
    start: mocks.start,
    reconcile: mocks.reconcile,
  };
});
describe('saved guide panel composition', () => {
  it('always mounts one review card and focuses it without remounting or requiring website input', () => {
    const props = panelProps();
    const view = render(<BrandGuidePanel {...props} />);
    expect(screen.getByText('Retained guide card')).toBeInTheDocument();
    for (const name of ['Add details manually', 'Review saved details']) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(
        screen.getByRole('heading', {
          name: 'Review and approve your brand guide',
        }),
      ).toHaveFocus();
    }
    view.rerender(<BrandGuidePanel {...props} websiteUrl="changed.example" />);
    expect(mocks.mounted).toHaveBeenCalledTimes(1);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.continue).not.toHaveBeenCalled();
  });
  it('uses saved revision callbacks solely for truthful notices', () => {
    render(<BrandGuidePanel {...panelProps()} />);
    const saved = mocks.cardProps?.onRevisionSaved;
    if (!saved) throw new Error('Missing saved callback');
    act(() => saved(revision('DRAFT')));
    expect(
      screen.getByText('Your brand guide has been saved.'),
    ).toBeInTheDocument();
    act(() => saved(revision('APPROVED')));
    expect(
      screen.getByText('Your brand guide is approved.'),
    ).toBeInTheDocument();
    expect(mocks.continue).not.toHaveBeenCalled();
    expect(mocks.skip).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it('retries GET only when reconciliation failed and keeps the retained request input locked', () => {
    if (!mocks.scan) throw new Error('Missing scan fixture');
    mocks.scan.phase = 'reconcile-error';
    mocks.scan.error = true;
    mocks.scan.request = { requestId: 'retained', url: 'original.example' };
    render(<BrandGuidePanel {...panelProps()} websiteUrl="original.example" />);
    expect(screen.getByLabelText('Website URL')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try scanning again' }));
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
    expect(mocks.start).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add details manually' }),
    );
    expect(screen.getByText('Retained guide card')).toBeInTheDocument();
  });
  it.each(['brand_scan.timed_out', 'brand_scan.invalid_content'] as const)(
    'uses terminal status copy for %s without raw server text',
    (errorCode) => {
      if (!mocks.scan) throw new Error('Missing scan fixture');
      mocks.scan.scan = {
        id: 'failed',
        brandId: 'brand-1',
        status: 'failed',
        url: 'saved.example',
        startedAt: '2026-10-01T00:00:00Z',
        errorCode,
      };
      render(<BrandGuidePanel {...panelProps()} />);
      expect(
        screen.getByText(
          errorCode === 'brand_scan.timed_out'
            ? 'Your website scan timed out. Try again or add details manually.'
            : "We couldn't finish reading your website. Your saved guide is unchanged.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(errorCode)).not.toBeInTheDocument();
    },
  );
  it('never overwrites touched website input with a later persisted marker', () => {
    const props = panelProps();
    const view = render(<BrandGuidePanel {...props} />);
    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: 'owner-edited.example' },
    });
    expect(mocks.change).toHaveBeenLastCalledWith('owner-edited.example');
    if (!mocks.scan) throw new Error('Missing scan fixture');
    mocks.scan.scan = {
      id: 'saved',
      brandId: 'brand-1',
      status: 'ready',
      url: 'server.example',
      startedAt: '2026-10-01T00:00:00Z',
    };
    view.rerender(
      <BrandGuidePanel {...props} websiteUrl="owner-edited.example" />,
    );
    expect(mocks.change).toHaveBeenCalledTimes(1);
  });
  it('marks only native exit buttons with the exact card brand identity', () => {
    render(<BrandGuidePanel {...panelProps()} />);
    for (const name of ['Continue', 'Skip for now'])
      expect(screen.getByRole('button', { name, exact: true })).toHaveAttribute(
        'data-brand-os-navigation',
        'brand-1',
      );
    for (const name of [
      'Scan website again',
      'Add details manually',
      'Review saved details',
    ])
      expect(screen.getByRole('button', { name })).not.toHaveAttribute(
        'data-brand-os-navigation',
      );
  });
});
