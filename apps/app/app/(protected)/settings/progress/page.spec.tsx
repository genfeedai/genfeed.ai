import * as ScopedPageModule from '@app/(protected)/[orgSlug]/~/settings/(pages)/progress/page';
import * as PageModule from '@app/(protected)/settings/progress/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';

runPageModuleTests('app/(protected)/settings/progress/page', PageModule);

describe('unscoped progress settings re-export', () => {
  it('re-exports the scoped progress page default and metadata', () => {
    expect(PageModule.default).toBe(ScopedPageModule.default);
    expect(PageModule.generateMetadata).toBe(ScopedPageModule.generateMetadata);
  });
});
