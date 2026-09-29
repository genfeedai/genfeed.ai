import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * These pages render on the server. Each used to be a client component only
 * to run the entrance animation, which shipped its whole tree as JavaScript
 * and hydrated it before the page answered a tap. The animation now lives in
 * the `MarketingEntrance` client island and interactive pieces in their own
 * islands; a `'use client'` creeping back into one of these files silently
 * undoes that for the whole page.
 */

/**
 * Client islands that call an API, copy text, or show a lab only after the
 * visitor acts. Each loads that code on use; a static import puts it back on
 * the route's first load.
 */

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('server-rendered marketing pages', () => {
  // The app's context providers bring its API service layer, pino and the
  // Sentry SDK with them. Profile tiles are read-only and read neither;
  // `ProfileMedia.test.tsx` renders them with no providers at all.

  // The app's `Container` (section topbar, tabs, help popover) and its client
  // pagination, which reads totals only the app's client fetches record, so on
  // the website it could never link past page one.
  it('renders public lists without the app container or client pagination', () => {
    for (const path of [
      'app/(content)/articles/articles-list.tsx',
      'src/page-modules/posts/[id]/ingredient-posts.tsx',
      'src/page-modules/posts/ingredients/posts-ingredients-list.tsx',
    ]) {
      const source = readSource(path);
      expect(source).not.toContain('@ui/layout/container/Container');
      expect(source).not.toContain('AutoPagination');
    }
  });

  it('never sanitizes article HTML in the browser', () => {
    // The sanitizer (sanitize-html + htmlparser2) runs in article-detail on
    // the server; the client island only receives its output.
    expect(
      readSource('app/(content)/articles/[slug]/article-content.tsx'),
    ).not.toContain('createMarkup');
    expect(
      readSource('app/(content)/articles/[slug]/article-detail.tsx'),
    ).toContain('createMarkup(');
  });
});
