import { describe, expect, it, vi } from 'vitest';

vi.mock('@services/external/public.service', () => ({
  PublicService: { getInstance: () => ({}) },
}));

vi.mock('@public/models/models-loader', () => ({
  getPublicModels: vi.fn(async () => null),
}));

vi.mock('@web-components/home/_footer', () => ({
  default: () => null,
}));

const DiscoverPage = await import('./page');
const VideosPage = await import('./videos/page');
const ImagesPage = await import('./images/page');
const CreatorsPage = await import('./creators/page');
const ProfilePage = await import(
  '../../creator-profile/[handle]/(showcase)/page'
);

// An operator's feature or unpublish clears the API's cache. These pages
// render from it on every visit, so the change shows on the next load without
// the website keeping a stale copy.
describe('community pages', () => {
  it.each([
    ['/community', DiscoverPage],
    ['/community/videos', VideosPage],
    ['/community/images', ImagesPage],
    ['/community/creators', CreatorsPage],
  ])('%s renders on every visit', (_path, page) => {
    expect(page.dynamic).toBe('force-dynamic');
    expect('revalidate' in page).toBe(false);
  });
});

// A profile build makes seven API calls and crawlers walk the profile index,
// so the page is rendered once per window and served from the route cache.
describe('creator profile page', () => {
  it('is cached for five minutes, not rendered on every visit', () => {
    expect(ProfilePage.revalidate).toBe(300);
    expect('dynamic' in ProfilePage).toBe(false);
  });
});
