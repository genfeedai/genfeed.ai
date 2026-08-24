import * as PageModule from '@app/(public)/sign-up/magic-link/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';

runPageModuleTests('app/(public)/sign-up/magic-link/page', PageModule);

describe('magic-link sign-up SEO metadata', () => {
  it('publishes complete route-specific metadata', () => {
    expect(PageModule.metadata).toEqual({
      alternates: { canonical: 'https://app.genfeed.ai/sign-up/magic-link' },
      description:
        'Create your Genfeed workspace with a secure magic link and start generating, reviewing, scheduling, and publishing on-brand content.',
      title: 'Create a Genfeed Account with Magic Link',
      twitter: { card: 'summary' },
    });
  });
});
