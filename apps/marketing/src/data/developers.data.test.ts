import {
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_DESCRIPTION_MIN_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  SEO_TITLE_MIN_LENGTH,
  withBrandSuffix,
} from '@data/seo-copy';
import { describe, expect, it } from 'vitest';
import {
  buildDevelopersJsonLd,
  CALL_GROUPS,
  DEVELOPERS_DESCRIPTION,
  DEVELOPERS_FAQ,
  DEVELOPERS_TITLE,
  QUICK_START_TABS,
} from './developers.data';

describe('developers data', () => {
  it('keeps the title and description inside the SEO budget', () => {
    const title = withBrandSuffix(DEVELOPERS_TITLE);

    expect(title.length).toBeGreaterThanOrEqual(SEO_TITLE_MIN_LENGTH);
    expect(title.length).toBeLessThanOrEqual(SEO_TITLE_MAX_LENGTH);
    expect(DEVELOPERS_DESCRIPTION.length).toBeGreaterThanOrEqual(
      SEO_DESCRIPTION_MIN_LENGTH,
    );
    expect(DEVELOPERS_DESCRIPTION.length).toBeLessThanOrEqual(
      SEO_DESCRIPTION_MAX_LENGTH,
    );
  });

  it('puts the searched phrase in the title', () => {
    expect(DEVELOPERS_TITLE.toLowerCase()).toContain('social media api');
  });

  it('shows what each quick start tab returns', () => {
    expect(QUICK_START_TABS.map((tab) => tab.id)).toEqual([
      'mcp',
      'cli',
      'rest',
    ]);
    for (const tab of QUICK_START_TABS) {
      expect(tab.returns.length).toBeGreaterThan(0);
    }
  });

  it('covers every group the issue lists', () => {
    expect(CALL_GROUPS.map((group) => group.title)).toEqual([
      'Brand context',
      'Text',
      'Images',
      'Video',
      'Voice',
      'Drafts',
      'Scheduling and publishing',
      'Analytics',
      'Webhooks and workflows',
    ]);
  });

  it('emits WebPage, SoftwareApplication, FAQPage and BreadcrumbList', () => {
    const graph = buildDevelopersJsonLd()['@graph'];

    expect(graph.map((node) => node['@type'])).toEqual([
      'WebPage',
      'SoftwareApplication',
      'FAQPage',
      'BreadcrumbList',
    ]);
    const faq = graph.find((node) => node['@type'] === 'FAQPage');
    expect(faq && 'mainEntity' in faq ? faq.mainEntity : []).toHaveLength(
      DEVELOPERS_FAQ.length,
    );
  });
});
