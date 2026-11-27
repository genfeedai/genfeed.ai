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
    expect(DEVELOPERS_TITLE.length).toBeGreaterThanOrEqual(30);
    // The site appends " | Genfeed.ai" to the title.
    expect(
      DEVELOPERS_TITLE.length + ' | Genfeed.ai'.length,
    ).toBeLessThanOrEqual(60);
    expect(DEVELOPERS_DESCRIPTION.length).toBeGreaterThanOrEqual(110);
    expect(DEVELOPERS_DESCRIPTION.length).toBeLessThanOrEqual(160);
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
