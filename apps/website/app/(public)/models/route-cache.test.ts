import { describe, expect, it, vi } from 'vitest';

vi.mock('@public/models/models-loader', () => ({
  getPublicModels: vi.fn(async () => []),
}));

import * as StudioPage from '../studio/page';
import * as ModelsPage from './page';

// Both pages render the same public catalog for every visitor, so they must
// stay in the full route cache rather than re-rendering on each request.
describe('model catalog pages', () => {
  it.each([
    ['/models', ModelsPage],
    ['/studio', StudioPage],
  ])('%s is served from the route cache', (_route, PageModule) => {
    expect('dynamic' in PageModule).toBe(false);
    expect(PageModule.revalidate).toBe(300);
  });
});
