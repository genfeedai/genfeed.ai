import { LibraryShelf, PageScope } from '@genfeedai/contracts';
import type { ILibrarySummary } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibrarySummary } from '@/features/library/hooks/use-library-summary';
import LibraryOverview from '@/features/library/overview/library-overview';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@/features/library/hooks/use-library-summary', () => ({
  useLibrarySummary: vi.fn(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand-x${path}` }),
}));

const mockUseLibrarySummary = vi.mocked(useLibrarySummary);

function summary(overrides: Partial<ILibrarySummary> = {}): ILibrarySummary {
  return {
    byCategory: {},
    byShelf: {
      [LibraryShelf.UNSORTED]: 0,
      [LibraryShelf.GENERATING]: 0,
      [LibraryShelf.NEEDS_REVIEW]: 3,
      [LibraryShelf.APPROVED]: 0,
      [LibraryShelf.REJECTED]: 0,
      [LibraryShelf.FAILED]: 0,
      [LibraryShelf.ARCHIVED]: 0,
      [LibraryShelf.REFERENCES]: 0,
    } as ILibrarySummary['byShelf'],
    starredCount: 2,
    storageBytes: 5 * 1024 * 1024,
    total: 42,
    trashedCount: 0,
    ...overrides,
  };
}

function mockSummary(
  value: ILibrarySummary | null,
  error: Error | null = null,
) {
  mockUseLibrarySummary.mockReturnValue({
    error,
    isLoading: false,
    refresh: vi.fn(),
    summary: value,
  });
}

describe('LibraryOverview (#5502)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the counts that need attention and links each into Assets', () => {
    mockSummary(summary());

    render(<LibraryOverview scope={PageScope.BRAND} />);

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('5 MB')).toBeInTheDocument();
    expect(screen.getByText('3 assets waiting for a decision.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Review assets' })).toHaveAttribute(
      'href',
      '/acme/brand-x/library/shelf/needs-review',
    );
    expect(screen.getByRole('link', { name: 'Open recent' })).toHaveAttribute(
      'href',
      '/acme/brand-x/library/recent',
    );
    expect(screen.getByRole('link', { name: 'Open starred' })).toHaveAttribute(
      'href',
      '/acme/brand-x/library/starred',
    );
    expect(
      screen.getByRole('link', { name: 'Open references' }),
    ).toHaveAttribute('href', '/acme/brand-x/library/references');
  });

  it('adds a Failed card only while generations have failed', () => {
    mockSummary(summary());
    const { unmount } = render(<LibraryOverview />);
    expect(screen.queryByText('Open failed')).not.toBeInTheDocument();
    unmount();

    mockSummary(
      summary({
        byShelf: {
          ...summary().byShelf,
          [LibraryShelf.FAILED]: 1,
        },
      }),
    );
    render(<LibraryOverview />);
    expect(screen.getByRole('link', { name: 'Open failed' })).toHaveAttribute(
      'href',
      '/acme/brand-x/library/shelf/failed',
    );
  });

  it('offers References at organization scope too', () => {
    mockSummary(summary());

    render(<LibraryOverview scope={PageScope.ORGANIZATION} />);

    expect(
      screen.getByRole('link', { name: 'Open references' }),
    ).toBeInTheDocument();
  });

  it('reports a failed summary load instead of showing zeros as fact', () => {
    mockSummary(null, new Error('boom'));

    render(<LibraryOverview />);

    expect(
      screen.getByText('Library counts could not be loaded.'),
    ).toBeInTheDocument();
  });

  it('describes every quick action, including Recent and References', () => {
    mockSummary(summary());

    render(<LibraryOverview scope={PageScope.BRAND} />);

    expect(
      screen.getByText('Everything added or generated lately, newest first.'),
    ).toBeVisible();
    expect(
      screen.getByText('Faces and looks you reuse so new work stays on brand.'),
    ).toBeVisible();
  });

  it('shows storage as unmeasured, not 0 B, when assets exist without recorded sizes', () => {
    mockSummary(summary({ storageBytes: 0 }));

    render(<LibraryOverview scope={PageScope.BRAND} />);

    expect(screen.queryByText('0 B')).not.toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('shows 0 B storage for an empty library', () => {
    mockSummary(summary({ storageBytes: 0, total: 0 }));

    render(<LibraryOverview scope={PageScope.BRAND} />);

    expect(screen.getByText('0 B')).toBeInTheDocument();
  });
});
