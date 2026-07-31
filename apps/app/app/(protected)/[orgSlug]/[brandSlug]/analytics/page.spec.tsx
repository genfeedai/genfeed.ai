import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';
import * as OverviewPageModule from './overview/page';
import * as PageModule from './page';

runPageModuleTests('app/(protected)/analytics/page', PageModule);

// Overview collapsed onto the surface root, so /analytics *is* the overview.
describe('AnalyticsRoute', () => {
  it('re-exports the overview page module', () => {
    expect(PageModule.default).toBe(OverviewPageModule.default);
    expect(PageModule.generateMetadata).toBe(
      OverviewPageModule.generateMetadata,
    );
  });
});
