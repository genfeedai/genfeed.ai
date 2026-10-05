import AnalyticsBrandPlatformDetailRoute from '@app/(protected)/[orgSlug]/[brandSlug]/analytics/brands/[id]/platforms/[platform]/AnalyticsBrandPlatformDetailRoute';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  params: { id: 'brand-1', platform: 'instagram' } as Record<
    string,
    string | string[]
  >,
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
vi.mock('@pages/analytics/platform-detail/analytics-platform-detail', () => ({
  default: (props: Record<string, unknown>) => {
    viewMock(props);
    return <div data-testid="view" />;
  },
}));
describe('AnalyticsBrandPlatformDetailRoute', () => {
  it('passes narrowed URL params to the view and follows navigation', () => {
    navigation.params = { id: 'brand-1', platform: 'instagram' };
    const { rerender } = render(<AnalyticsBrandPlatformDetailRoute />);
    expect(viewMock).toHaveBeenLastCalledWith({
      brandId: 'brand-1',
      platform: 'instagram',
    });
    navigation.params = { id: 'brand-2', platform: ['tiktok', 'ignored'] };
    rerender(<AnalyticsBrandPlatformDetailRoute />);
    expect(viewMock).toHaveBeenLastCalledWith({
      brandId: 'brand-2',
      platform: 'tiktok',
    });
  });
});
