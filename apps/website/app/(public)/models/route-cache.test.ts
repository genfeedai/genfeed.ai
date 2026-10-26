import { describe, expect, it, vi } from 'vitest';

vi.mock('@public/models/models-loader', () => ({
  getPublicModels: vi.fn(async () => []),
}));

import * as ModelsPage from './page';

// The page renders the same public catalog for every visitor, so it must
// stay in the full route cache rather than re-rendering on each request.
describe('model catalog page', () => {
  it('is served from the route cache', () => {
    expect('dynamic' in ModelsPage).toBe(false);
    expect(ModelsPage.revalidate).toBe(300);
  });
});
