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
const SERVER_RENDERED_PAGES = [
  '../../packages/agent/src/components/SafeMarkdown.tsx',
  '../../packages/ui/src/components/footers/SiteFooter.tsx',
  'app/(content)/articles/[slug]/article-detail.tsx',
  'app/(content)/articles/articles-list.tsx',
  'app/(public)/about/about-content.tsx',
  'app/(public)/agent-clients/agent-client-channel-content.tsx',
  'app/(public)/agent-clients/agent-client-content.tsx',
  'app/(public)/agent/agent-content.tsx',
  'app/(public)/analytics/analytics-content.tsx',
  'app/(public)/benchmark/benchmark-content.tsx',
  'app/(public)/brand-os/brand-os-content.tsx',
  'app/(public)/calendar/calendar-content.tsx',
  'app/(public)/changelog/content.tsx',
  'app/(public)/cloud/cloud-content.tsx',
  'app/(public)/download/download-content.tsx',
  'app/(public)/experts/experts-content.tsx',
  'app/(public)/faq/faq-content.tsx',
  'app/(public)/features/features-page.tsx',
  'app/(public)/gen/gen-content.tsx',
  'app/(public)/hire-agents/hire-agents-content.tsx',
  'app/(public)/integrations/integrations-content.tsx',
  'app/(public)/library/library-content.tsx',
  'app/(public)/models/models-content.tsx',
  'app/(public)/pricing/pricing-content.tsx',
  'app/(public)/privacy/privacy-content.tsx',
  'app/(public)/publishing/publishing-content.tsx',
  'app/(public)/research/research-content.tsx',
  'app/(public)/self-hosted/self-hosted-content.tsx',
  'app/(public)/skills/skills-content.tsx',
  'app/(public)/skills/success/skills-success-content.tsx',
  'app/(public)/studio/studio-content.tsx',
  'app/(public)/terms/terms-page.tsx',
  'app/(public)/tools/tools-content.tsx',
  'app/(public)/use-cases/use-cases-hub-content.tsx',
  'app/(public)/vs/vs-hub-content.tsx',
  'app/(public)/workflows/workflows-content.tsx',
  'app/u/[handle]/profile-page.tsx',
  'app/u/layout.tsx',
  'packages/components/PageLayout.tsx',
  'packages/components/content/NeuralGrid.tsx',
  'packages/components/content/PublicListPage.tsx',
  'packages/components/landing/DevelopersLandingPage.tsx',
  'packages/components/landing/ServiceLandingPage.tsx',
  'packages/components/profile/ProfileSocialLinks.tsx',
  'src/page-modules/posts/[id]/ingredient-posts.tsx',
  'src/page-modules/posts/ingredients/posts-ingredients-list.tsx',
];

/**
 * Client islands that call an API, copy text, or show a lab only after the
 * visitor acts. Each loads that code on use; a static import puts it back on
 * the route's first load.
 */
const DEFERRED_IMPORTS: ReadonlyArray<readonly [string, RegExp]> = [
  // axios, the HTTP interceptors and the JSON:API models (~20 KB gzip).
  [
    'app/(public)/brand-os/brand-os-funnel.tsx',
    /from '@services\/external\/public\.service'/,
  ],
  [
    'app/(public)/tools/youtube-clips/youtube-clips-content.tsx',
    /from '@services\/external\/public\.service'/,
  ],
  // The API services and the Better Auth client.
  [
    'app/(public)/tools/youtube-long-form/youtube-long-form-content.tsx',
    /from '@services\/(?:content|external)\/|from '@genfeedai\/hooks\/auth\//,
  ],
  // The clipboard service brings the toast library through notifications.
  [
    'app/(content)/articles/[slug]/article-content.tsx',
    /from '@services\/core\/clipboard\.service'|from '\.\/article-experience'/,
  ],
  [
    'app/(content)/articles/[slug]/article-share-button.tsx',
    /from '@services\/core\/clipboard\.service'/,
  ],
  // Radix Tooltip and Floating UI, on every page that renders a button.
  ['../../packages/ui/src/primitives/button.tsx', /from '\.\/tooltip'/],
];

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('server-rendered marketing pages', () => {
  it.each(SERVER_RENDERED_PAGES)('%s stays a server component', (path) => {
    // Multiline: a directive after a leading comment still counts.
    expect(readSource(path)).not.toMatch(/^\s*['"]use client['"]/m);
  });

  // The app's context providers bring its API service layer, pino and the
  // Sentry SDK with them. Profile tiles are read-only and read neither;
  // `ProfileMedia.test.tsx` renders them with no providers at all.
  it('keeps the public profile layout free of app providers', () => {
    expect(readSource('app/u/layout.tsx')).not.toMatch(/@providers\//);
  });

  it.each(DEFERRED_IMPORTS)(
    '%s loads its on-demand code lazily',
    (path, staticImport) => {
      expect(readSource(path)).not.toMatch(staticImport);
    },
  );

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
