import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it, vi } from 'vitest';
import * as OverviewPageModule from './overview/page';
import * as PageModule from './page';

vi.mock('./overview/library-overview-page', () => ({
  default: () => <div data-testid="library-overview-page" />,
}));

runPageModuleTests('app/(protected)/library/page', PageModule);

// Overview collapsed onto the surface root, so /library *is* the overview.
describe('LibraryRoute', () => {
  it('re-exports the overview page module', () => {
    expect(PageModule.default).toBe(OverviewPageModule.default);
    expect(PageModule.generateMetadata).toBe(
      OverviewPageModule.generateMetadata,
    );
  });
});
