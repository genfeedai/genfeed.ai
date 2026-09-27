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
  'app/(content)/articles/[slug]/article-detail.tsx',
  'app/(public)/about/about-content.tsx',
  'app/(public)/agent-clients/agent-client-channel-content.tsx',
  'app/(public)/agent-clients/agent-client-content.tsx',
  'app/(public)/agent/agent-content.tsx',
  'app/(public)/analytics/analytics-content.tsx',
  'app/(public)/benchmark/benchmark-content.tsx',
  'app/(public)/brand-os/brand-os-content.tsx',
  'app/(public)/calendar/calendar-content.tsx',
  'app/(public)/cloud/cloud-content.tsx',
  'app/(public)/demo/demo-content.tsx',
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
  'app/(public)/services/services-content.tsx',
  'app/(public)/skills/skills-content.tsx',
  'app/(public)/skills/success/skills-success-content.tsx',
  'app/(public)/studio/studio-content.tsx',
  'app/(public)/terms/terms-page.tsx',
  'app/(public)/tools/tools-content.tsx',
  'app/(public)/use-cases/use-cases-hub-content.tsx',
  'app/(public)/vs/vs-hub-content.tsx',
  'app/(public)/workflows/workflows-content.tsx',
  'packages/components/PageLayout.tsx',
  'packages/components/content/NeuralGrid.tsx',
];

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('server-rendered marketing pages', () => {
  it.each(SERVER_RENDERED_PAGES)('%s stays a server component', (path) => {
    // Multiline: a directive after a leading comment still counts.
    expect(readSource(path)).not.toMatch(/^\s*['"]use client['"]/m);
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
