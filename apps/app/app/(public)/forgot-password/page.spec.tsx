import * as PageModule from '@app/(public)/forgot-password/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';

runPageModuleTests('app/(public)/forgot-password/page', PageModule);

describe('forgot-password SEO metadata', () => {
  it('publishes complete route-specific metadata', () => {
    expect(PageModule.metadata).toEqual({
      alternates: { canonical: 'https://app.genfeed.ai/forgot-password' },
      description:
        'Reset your Genfeed password securely and regain access to your content studio, brand assets, publishing tools, and workspace settings.',
      title: 'Reset Your Account Password | Genfeed',
      twitter: { card: 'summary' },
    });
  });
});
