import * as PageModule from '@app/(public)/login/password/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';

runPageModuleTests('app/(public)/login/password/page', PageModule);

describe('password login SEO metadata', () => {
  it('publishes complete route-specific metadata', () => {
    expect(PageModule.metadata).toEqual({
      alternates: { canonical: 'https://app.genfeed.ai/login/password' },
      description:
        'Sign in to Genfeed with your email and password to access your content studio, brand assets, publishing workflows, and team workspace.',
      title: 'Sign In with Password | Genfeed',
      twitter: { card: 'summary' },
    });
  });
});
