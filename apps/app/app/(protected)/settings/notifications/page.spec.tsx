import * as ScopedPageModule from '@app/(protected)/[orgSlug]/~/settings/(pages)/notifications/page';
import * as PageModule from '@app/(protected)/settings/notifications/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';

runPageModuleTests('app/(protected)/settings/notifications/page', PageModule);

describe('unscoped notifications settings re-export', () => {
  it('re-exports the scoped notifications page default and metadata', () => {
    expect(PageModule.default).toBe(ScopedPageModule.default);
    expect(PageModule.generateMetadata).toBe(ScopedPageModule.generateMetadata);
  });
});
