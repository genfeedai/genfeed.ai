import FilteredListRoute from '@app/(protected)/admin/content/ingredients/FilteredListRoute';
import { PageScope } from '@genfeedai/contracts';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ query: new URLSearchParams() }));
const viewMock = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useSearchParams: () => navigation.query,
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));
vi.mock('@pages/ingredients/list/ingredients-list', () => ({
  default: (props: Record<string, unknown>) => {
    viewMock(props);
    return <div data-testid="view" />;
  },
}));
describe('FilteredListRoute', () => {
  it.each([
    ['', 'videos'],
    ['assetType=images', 'images'],
    ['assetType=gifs', 'gifs'],
    ['assetType=invalid', 'videos'],
    ['assetType=images&assetType=gifs', 'videos'],
  ])('preserves the parsing of %s', (query, expected) => {
    navigation.query = new URLSearchParams(query);
    render(<FilteredListRoute />);
    expect(viewMock).toHaveBeenLastCalledWith({
      type: expected,
      scope: PageScope.SUPERADMIN,
    });
  });
  it('follows changed search params', () => {
    navigation.query = new URLSearchParams('assetType=images');
    const { rerender } = render(<FilteredListRoute />);
    navigation.query = new URLSearchParams('assetType=voices');
    rerender(<FilteredListRoute />);
    expect(viewMock).toHaveBeenLastCalledWith({
      type: 'voices',
      scope: PageScope.SUPERADMIN,
    });
  });
});
