import * as ScopedPageModule from '@app/(protected)/[orgSlug]/~/settings/(pages)/chat/page';
import * as PageModule from '@app/(protected)/settings/chat/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';

runPageModuleTests('app/(protected)/settings/chat/page', PageModule);

describe('unscoped chat settings re-export', () => {
  it('re-exports the scoped chat page default and metadata', () => {
    expect(PageModule.default).toBe(ScopedPageModule.default);
    expect(PageModule.generateMetadata).toBe(ScopedPageModule.generateMetadata);
  });
});
