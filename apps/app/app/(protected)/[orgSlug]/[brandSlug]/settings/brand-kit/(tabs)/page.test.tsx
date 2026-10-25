import { describe, expect, it } from 'vitest';
import BrandKitOverviewRoute from './page';

describe('BrandKitOverviewRoute', () => {
  it('renders nothing, the Brand Kit layout renders the editor', () => {
    expect(BrandKitOverviewRoute()).toBeNull();
  });
});
