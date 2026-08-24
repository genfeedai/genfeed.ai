import * as PageModule from '@app/(public)/login/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';

runPageModuleTests('app/(public)/login/page', PageModule);

describe('login SEO metadata', () => {
  it('publishes complete route-specific metadata', () => {
    expect(PageModule.metadata).toEqual({
      alternates: { canonical: 'https://app.genfeed.ai/login' },
      description:
        'Sign in to Genfeed to access your content studio, brand assets, generation tools, publishing workflows, and team workspace.',
      robots: { follow: true, index: true },
      title: 'Sign In to Your Genfeed Workspace',
      twitter: { card: 'summary' },
    });
  });
});
