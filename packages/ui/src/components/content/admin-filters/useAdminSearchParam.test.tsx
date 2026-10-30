// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useAdminSearchParam } from '@ui/content/admin-filters/useAdminSearchParam';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/automation/agents',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams('organization=org-1&page=3&q=x'),
}));

describe('useAdminSearchParam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the search from q', () => {
    const { result } = renderHook(() => useAdminSearchParam());

    expect(result.current.search).toBe('x');
  });

  it('sets q, keeps the other params and returns to the first page', () => {
    const { result } = renderHook(() => useAdminSearchParam());

    act(() => result.current.setSearch('  growth  '));

    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/automation/agents?organization=org-1&q=growth',
      { scroll: false },
    );
  });

  it('drops q when the search is cleared', () => {
    const { result } = renderHook(() => useAdminSearchParam());

    act(() => result.current.setSearch('   '));

    expect(mocks.replace).toHaveBeenCalledWith(
      '/admin/automation/agents?organization=org-1',
      { scroll: false },
    );
  });
});
