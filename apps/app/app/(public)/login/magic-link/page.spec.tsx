import * as PageModule from '@app/(public)/login/magic-link/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';

runPageModuleTests('app/(public)/login/magic-link/page', PageModule);

describe('magic-link login SEO metadata', () => {
  it('publishes complete route-specific metadata', () => {
    expect(PageModule.metadata).toEqual({
      alternates: { canonical: 'https://app.genfeed.ai/login/magic-link' },
      description:
        'Sign in to Genfeed with a secure magic link to access your content studio, brand assets, publishing workflows, and team workspace.',
      title: 'Sign In with a Magic Link | Genfeed',
      twitter: { card: 'summary' },
    });
  });
});
