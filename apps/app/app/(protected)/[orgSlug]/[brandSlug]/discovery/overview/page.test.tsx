import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/discovery/overview/page.tsx',
);

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DiscoveryOverviewPage from './page';

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => mocks.redirect(url),
}));
vi.mock('@pages/trends/desk/discovery-desk', () => ({
  default: () => <div>Discovery overview</div>,
}));

describe('canonical Following navigation', () => {
  it.each([
    [
      { orgSlug: 'acme', brandSlug: 'brand' },
      '/acme/brand/discovery/following',
    ],
    [{ orgSlug: 'acme' }, '/acme/~/discovery/following'],
  ])('redirects legacy Following URLs for %j', async (params, expected) => {
    await DiscoveryOverviewPage({
      params: Promise.resolve(params),
      searchParams: Promise.resolve({ source: 'following' }),
    });
    expect(mocks.redirect).toHaveBeenCalledWith(expected);
  });
  it('preserves the Overview page for other source selections', async () => {
    mocks.redirect.mockClear();
    render(
      await DiscoveryOverviewPage({
        params: Promise.resolve({ orgSlug: 'acme', brandSlug: 'brand' }),
        searchParams: Promise.resolve({ source: 'owned' }),
      }),
    );
    expect(screen.getByText('Discovery overview')).toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
