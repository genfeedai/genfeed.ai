import PatternLabPage from '@app-components/performance-lab/PatternLabPage';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const usePatternContextMock = vi.fn();
const replaceMock = vi.fn();
let searchParamsValue = '';

vi.mock('next/navigation', () => ({
  usePathname: () => '/org/brand/analytics/performance-lab',
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

vi.mock('@genfeedai/contexts/analytics/analytics-context', () => ({
  useOptionalAnalyticsContext: () => null,
}));

vi.mock(
  '@hooks/data/analytics/use-pattern-context/use-pattern-context',
  () => ({
    usePatternContext: (...args: unknown[]) => usePatternContextMock(...args),
  }),
);

vi.mock('@app-components/performance-lab/PatternCard', () => ({
  default: ({ pattern }: { pattern: { label: string } }) => (
    <div data-testid="pattern-card">{pattern.label}</div>
  ),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: ({ totalLabel }: { totalLabel?: string }) => (
    <div data-testid="auto-pagination">{totalLabel}</div>
  ),
}));

const patterns = [
  { id: 'pattern-1', label: 'Curiosity hook', patternType: 'hook_formula' },
  { id: 'pattern-2', label: 'Direct CTA', patternType: 'cta_formula' },
];

describe('PatternLabPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsValue = '';
    usePatternContextMock.mockReturnValue({
      error: null,
      isLoading: false,
      patterns,
    });
  });

  it('loads page 1 by default and renders the pagination controls', () => {
    render(<PatternLabPage />);

    expect(usePatternContextMock).toHaveBeenCalledWith(expect.anything(), 1);
    expect(screen.getAllByTestId('pattern-card')).toHaveLength(2);
    expect(screen.getByTestId('auto-pagination')).toHaveTextContent('patterns');
  });

  it('requests the page named in the URL', () => {
    searchParamsValue = 'page=3';

    render(<PatternLabPage />);

    expect(usePatternContextMock).toHaveBeenCalledWith(expect.anything(), 3);
  });

  it('keeps the pagination visible when a page past the end is empty', () => {
    searchParamsValue = 'page=9';
    usePatternContextMock.mockReturnValue({
      error: null,
      isLoading: false,
      patterns: [],
    });

    render(<PatternLabPage />);

    expect(screen.getByText('No patterns found')).toBeInTheDocument();
    expect(screen.getByTestId('auto-pagination')).toBeInTheDocument();
  });

  it('hides the pagination while there is nothing to page', () => {
    usePatternContextMock.mockReturnValue({
      error: null,
      isLoading: false,
      patterns: [],
    });

    render(<PatternLabPage />);

    expect(screen.queryByTestId('auto-pagination')).not.toBeInTheDocument();
  });

  it('hides the pagination while loading and on error', () => {
    usePatternContextMock.mockReturnValue({
      error: null,
      isLoading: true,
      patterns: [],
    });
    const { rerender } = render(<PatternLabPage />);
    expect(screen.queryByTestId('auto-pagination')).not.toBeInTheDocument();

    usePatternContextMock.mockReturnValue({
      error: 'boom',
      isLoading: false,
      patterns: [],
    });
    rerender(<PatternLabPage />);
    expect(screen.queryByTestId('auto-pagination')).not.toBeInTheDocument();
  });
});
