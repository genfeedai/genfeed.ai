import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ResearchWorkSurfaceProvider,
  useOptionalResearchWorkSurface,
  useResearchPagination,
  useResearchQueryState,
  useResearchSearchParamState,
  useRestoreResearchFinding,
} from './ResearchWorkSurfaceProvider';
import type { AuthorizedResearchFinding } from './research-work-surface.types';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  searchParamsString: { value: '' },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/research',
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.searchParamsString.value),
}));

vi.mock('@ui/navigation/pagination/Pagination', () => ({
  default: ({
    currentPage,
    onPageChange,
    totalPages,
  }: {
    currentPage: number;
    onPageChange: (page: number) => void;
    totalPages: number;
  }) => (
    <button type="button" onClick={() => onPageChange(2)}>
      page {currentPage} of {totalPages}
    </button>
  ),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <ResearchWorkSurfaceProvider>{children}</ResearchWorkSurfaceProvider>;
}

function makeFinding(id: string): AuthorizedResearchFinding {
  return {
    metadata: [],
    reference: { id, kind: 'research-source-post' },
    title: `Finding ${id}`,
  };
}

describe('ResearchWorkSurfaceProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParamsString.value = '';
  });

  it('exposes url state and replaces non-canonical urls', () => {
    mocks.searchParamsString.value = 'q=+spaced+&page=abc';
    const { result } = renderHook(() => useOptionalResearchWorkSurface(), {
      wrapper,
    });

    expect(result.current?.urlState.query).toBe('spaced');
    expect(result.current?.urlState.page).toBe(1);
    expect(mocks.replace).toHaveBeenCalledWith('/research?q=spaced', {
      scroll: false,
    });
  });

  it('does not rewrite canonical urls', () => {
    mocks.searchParamsString.value = 'q=growth&page=2';
    renderHook(() => useOptionalResearchWorkSurface(), { wrapper });

    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('selects a finding by pushing the encoded reference', () => {
    const { result } = renderHook(() => useOptionalResearchWorkSurface(), {
      wrapper,
    });

    act(() => {
      result.current?.selectFinding(makeFinding('post-1'));
    });

    expect(result.current?.authorizedFinding?.reference.id).toBe('post-1');
    expect(mocks.push).toHaveBeenCalledWith(
      '/research?finding=research-source-post%3Apost-1',
      { scroll: false },
    );
  });

  it('clears the finding via replaceable history', () => {
    mocks.searchParamsString.value = 'finding=research-source-post:post-1';
    const { result } = renderHook(() => useOptionalResearchWorkSurface(), {
      wrapper,
    });

    act(() => {
      result.current?.clearFinding();
    });

    expect(result.current?.authorizedFinding).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith('/research', { scroll: false });
  });

  it('updateSearchParams resets page and finding by default and skips no-ops', () => {
    mocks.searchParamsString.value =
      'q=old&page=3&finding=research-source-post:post-1';
    const { result } = renderHook(() => useOptionalResearchWorkSurface(), {
      wrapper,
    });

    act(() => {
      result.current?.updateSearchParams({ q: 'new' });
    });
    expect(mocks.replace).toHaveBeenCalledWith('/research?q=new', {
      scroll: false,
    });

    mocks.replace.mockClear();
    mocks.push.mockClear();
    act(() => {
      result.current?.updateSearchParams(
        { q: 'old' },
        { clearFinding: false, resetPage: false },
      );
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe('useResearchQueryState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParamsString.value = '';
  });

  it('reads the query from the surface and updates via search params', () => {
    mocks.searchParamsString.value = 'q=hello';
    const { result } = renderHook(() => useResearchQueryState(), { wrapper });

    expect(result.current[0]).toBe('hello');

    act(() => {
      result.current[1]('next term');
    });
    expect(mocks.replace).toHaveBeenCalledWith('/research?q=next+term', {
      scroll: false,
    });

    act(() => {
      result.current[1]('   ');
    });
    expect(mocks.replace).toHaveBeenCalledWith('/research', { scroll: false });
  });

  it('falls back to local state without a provider', () => {
    const { result } = renderHook(() => useResearchQueryState());

    expect(result.current[0]).toBe('');
    act(() => {
      result.current[1]('local');
    });
    expect(result.current[0]).toBe('local');
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe('useResearchSearchParamState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParamsString.value = '';
  });

  it('returns a valid url value and writes updates', () => {
    mocks.searchParamsString.value = 'platform=twitter';
    const { result } = renderHook(
      () =>
        useResearchSearchParamState<string>({
          allowedValues: ['all', 'twitter', 'tiktok'],
          defaultValue: 'all',
          key: 'platform',
        }),
      { wrapper },
    );

    expect(result.current[0]).toBe('twitter');

    act(() => {
      result.current[1]('tiktok');
    });
    expect(mocks.replace).toHaveBeenCalledWith('/research?platform=tiktok', {
      scroll: false,
    });

    act(() => {
      result.current[1]('all');
    });
    expect(mocks.replace).toHaveBeenCalledWith('/research', { scroll: false });
  });

  it('drops disallowed values back to the default and cleans the url', () => {
    mocks.searchParamsString.value = 'platform=bogus';
    const { result } = renderHook(
      () =>
        useResearchSearchParamState<string>({
          allowedValues: ['all', 'twitter'],
          defaultValue: 'all',
          key: 'platform',
        }),
      { wrapper },
    );

    expect(result.current[0]).toBe('all');
    expect(mocks.replace).toHaveBeenCalledWith('/research', { scroll: false });
  });

  it('uses local state without a provider', () => {
    const { result } = renderHook(() =>
      useResearchSearchParamState<string>({
        defaultValue: 'all',
        key: 'platform',
      }),
    );

    act(() => {
      result.current[1]('twitter');
    });
    expect(result.current[0]).toBe('twitter');
  });
});

describe('useResearchPagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParamsString.value = '';
  });

  const items = Array.from({ length: 5 }, (_, index) => `item-${index}`);

  it('slices items for the current page and renders pagination', () => {
    mocks.searchParamsString.value = 'page=2';
    const { result } = renderHook(() => useResearchPagination(items, 2), {
      wrapper,
    });

    expect(result.current.totalPages).toBe(3);
    expect(result.current.currentPage).toBe(2);
    expect(result.current.pageItems).toEqual(['item-2', 'item-3']);
    expect(result.current.pagination).not.toBeNull();

    const { getByRole } = render(<>{result.current.pagination}</>);
    act(() => {
      getByRole('button').click();
    });
    expect(mocks.replace).toHaveBeenCalledWith('/research?page=2', {
      scroll: false,
    });
  });

  it('clamps an out-of-range page and rewrites the url', () => {
    mocks.searchParamsString.value = 'page=9';
    const { result } = renderHook(() => useResearchPagination(items, 2), {
      wrapper,
    });

    expect(result.current.currentPage).toBe(3);
    expect(mocks.replace).toHaveBeenCalledWith('/research?page=3', {
      scroll: false,
    });
  });

  it('returns all items without a provider', () => {
    const { result } = renderHook(() => useResearchPagination(items, 2));

    expect(result.current.pageItems).toEqual(items);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.pagination).toBeNull();
  });
});

describe('useRestoreResearchFinding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParamsString.value = '';
  });

  function useHarness(
    findings: readonly AuthorizedResearchFinding[],
    isLoading: boolean,
  ) {
    const surface = useOptionalResearchWorkSurface();
    useRestoreResearchFinding(findings, isLoading);
    return surface;
  }

  it('restores the requested finding once loaded', () => {
    mocks.searchParamsString.value = 'finding=research-source-post:post-1';
    const { result } = renderHook(
      () => useHarness([makeFinding('post-1')], false),
      { wrapper },
    );

    expect(result.current?.authorizedFinding?.reference.id).toBe('post-1');
  });

  it('keeps the finding empty while loading', () => {
    mocks.searchParamsString.value = 'finding=research-source-post:post-1';
    const { result } = renderHook(
      () => useHarness([makeFinding('post-1')], true),
      { wrapper },
    );

    expect(result.current?.authorizedFinding).toBeNull();
  });

  it('clears an unknown requested finding', () => {
    mocks.searchParamsString.value = 'finding=research-source-post:missing';
    const { result } = renderHook(
      () => useHarness([makeFinding('post-1')], false),
      { wrapper },
    );

    expect(result.current?.authorizedFinding).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith('/research', { scroll: false });
  });
});
