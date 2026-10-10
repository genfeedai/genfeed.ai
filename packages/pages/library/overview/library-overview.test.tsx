import { LibraryShelf, PageScope } from '@genfeedai/contracts';
import type { ILibrarySummary } from '@genfeedai/contracts/interfaces';
import { useLibrarySummary } from '@hooks/data/library/use-library-summary';
import LibraryOverview from '@pages/library/overview/library-overview';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/data/library/use-library-summary', () => ({
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
      '/acme/brand-x/library/assets?shelf=needs-review',
    );
    expect(screen.getByRole('link', { name: 'Open recent' })).toHaveAttribute(
      'href',
      '/acme/brand-x/library/assets?place=recent',
    );
    expect(screen.getByRole('link', { name: 'Open starred' })).toHaveAttribute(
      'href',
      '/acme/brand-x/library/assets?place=starred',
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
      '/acme/brand-x/library/assets?shelf=failed',
    );
  });

  it('leaves brand-only References out at organization scope', () => {
    mockSummary(summary());

    render(<LibraryOverview scope={PageScope.ORGANIZATION} />);

    expect(
      screen.queryByRole('link', { name: 'Open references' }),
    ).not.toBeInTheDocument();
  });

  it('reports a failed summary load instead of showing zeros as fact', () => {
    mockSummary(null, new Error('boom'));

    render(<LibraryOverview />);

    expect(
      screen.getByText('Library counts could not be loaded.'),
    ).toBeInTheDocument();
  });
});
