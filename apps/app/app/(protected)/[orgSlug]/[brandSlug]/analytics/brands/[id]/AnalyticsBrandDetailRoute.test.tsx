import AnalyticsBrandDetailRoute from '@app/(protected)/[orgSlug]/[brandSlug]/analytics/brands/[id]/AnalyticsBrandDetailRoute';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  params: { id: 'brand-1' } as Record<string, string | string[]>,
}));
const viewMock = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useParams: () => navigation.params,
  useSearchParams: () => new URLSearchParams(),
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
vi.mock('@pages/analytics/brand-overview/analytics-brand-overview', () => ({
  default: (props: Record<string, unknown>) => {
    viewMock(props);
    return <div data-testid="view" />;
  },
}));
describe('AnalyticsBrandDetailRoute', () => {
  it('passes narrowed URL params to the view and follows navigation', () => {
    navigation.params = { id: 'brand-1' };
    const { rerender } = render(<AnalyticsBrandDetailRoute />);
    expect(viewMock).toHaveBeenLastCalledWith({ brandId: 'brand-1' });
    navigation.params = { id: ['brand-2', 'ignored'] };
    rerender(<AnalyticsBrandDetailRoute />);
    expect(viewMock).toHaveBeenLastCalledWith({ brandId: 'brand-2' });
  });
});
