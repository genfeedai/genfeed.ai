import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as PageModule from '@public/posts/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';

runPageModuleTests('apps/website/app/(public)/posts/page', PageModule);

describe('posts index content depth', () => {
  it('server-renders enough copy to clear the thin-content floor', () => {
    const source = readFileSync(join(import.meta.dirname, 'page.tsx'), 'utf8');
    const intro = source.split('<section')[1]?.split('</section>')[0] ?? '';
    const words = intro
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    // The gallery itself is client-fetched, so the crawler only ever sees this
    // section plus the container title. Ahrefs flags a page under 50 words as
    // "Low word count"; /posts sat at 23 before the intro existed.
    expect(words.length).toBeGreaterThan(100);
  });
});
