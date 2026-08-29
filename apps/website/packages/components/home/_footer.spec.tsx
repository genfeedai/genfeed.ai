import * as Module from '@web-components/home/_footer';
import { WEBSITE_SECTIONS } from '@web-components/home/_footer';
import { describe, expect, it } from 'vitest';

describe('Footer Component', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });

  it('stays a navigation aid rather than a sitemap', () => {
    const links = WEBSITE_SECTIONS.flatMap((section) => section.links);

    expect(WEBSITE_SECTIONS).toHaveLength(4);
    expect(links.length).toBeLessThanOrEqual(20);
  });

  it('lists every destination exactly once', () => {
    const hrefs = WEBSITE_SECTIONS.flatMap((section) =>
      section.links.map((link) => link.href),
    );

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('leaves the legal links to the bottom bar', () => {
    const hrefs = WEBSITE_SECTIONS.flatMap((section) =>
      section.links.map((link) => link.href),
    );

    expect(hrefs).not.toContain('/terms');
    expect(hrefs).not.toContain('/privacy');
  });
});
