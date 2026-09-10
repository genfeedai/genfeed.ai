import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PostsRemixPage from './page';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mocks.redirect(url),
}));

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/publishing/remix/page.tsx',
);

describe('PostsRemixPage', () => {
  beforeEach(() => {
    mocks.redirect.mockClear();
  });

  it('sends remix into Studio instead of the retired variations page', async () => {
    await PostsRemixPage({
      params: Promise.resolve({
        brandSlug: 'moonrise',
        orgSlug: 'acme',
      }),
      searchParams: Promise.resolve({
        sourceArtifact: 'ingredient:ingredient-1',
        sourceVersion: '7',
      }),
    });

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/acme/moonrise${APP_ROUTES.STUDIO.GENERATE}`,
    );
  });
});
