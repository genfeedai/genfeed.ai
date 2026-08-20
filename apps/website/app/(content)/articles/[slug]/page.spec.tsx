import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';
import * as PageModule from './page';

runPageModuleTests(
  'apps/website/app/(content)/articles/[slug]/page',
  PageModule,
);

it('opts into dynamic rendering for preview query support', () => {
  expect(PageModule.dynamic).toBe('force-dynamic');
});

describe('article page titles', () => {
  it('suffixes headlines that fit the search-snippet budget', () => {
    expect(PageModule.buildArticlePageTitle('Core Loop')).toBe(
      'Core Loop | Genfeed.ai',
    );
  });

  it('drops the site suffix before the title overflows', () => {
    const headline =
      'How to Launch an Open Source Product on Show HN and Product Hunt';

    // 64 characters: suffixed it was 77, which the 2026-08-19 site audit
    // flagged as "Title too long".
    expect(
      PageModule.buildArticlePageTitle(headline).length,
    ).toBeLessThanOrEqual(63);
    expect(PageModule.buildArticlePageTitle(headline)).not.toContain(
      '| Genfeed.ai',
    );
  });

  it('trims an overlong headline on a word boundary', () => {
    const headline = `${'Publishing '.repeat(8)}Playbook`;
    const title = PageModule.buildArticlePageTitle(headline);

    expect(title.length).toBeLessThanOrEqual(63);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toContain(' …');
  });
});
