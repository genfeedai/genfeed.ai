import * as PageModule from '@app/(public)/sign-up/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';

runPageModuleTests('app/(public)/sign-up/page', PageModule);

describe('sign-up SEO metadata', () => {
  it('publishes complete route-specific metadata', () => {
    expect(PageModule.metadata).toEqual({
      alternates: { canonical: 'https://app.genfeed.ai/sign-up' },
      description:
        'Create your Genfeed workspace to generate on-brand content, review team output, schedule campaigns, and publish across every channel.',
      robots: { follow: true, index: true },
      title: 'Create Your Workspace | Genfeed',
      twitter: { card: 'summary' },
    });
  });
});
