import { describe, expect, it } from 'vitest';
import {
  PUBLISH_LOGO_HREF,
  PUBLISH_MENU_ITEMS,
} from './publish-menu-items.config';

describe('PUBLISH_MENU_ITEMS', () => {
  it('is non-empty', () => {
    expect(PUBLISH_MENU_ITEMS.length).toBeGreaterThan(0);
  });

  it('has a logo href set to complete-path overview home', () => {
    expect(PUBLISH_LOGO_HREF).toBe('/publish/overview');
  });

  it('leads with Overview → Posts → Calendar, then Pipeline', () => {
    expect(PUBLISH_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Overview',
      'Posts',
      'Calendar',
      'Review',
      'Drafts',
      'Published',
    ]);
    expect(PUBLISH_MENU_ITEMS[0]?.href).toBe('/publish/overview');
    expect(PUBLISH_MENU_ITEMS[1]?.href).toBe('/publish/posts');
    expect(PUBLISH_MENU_ITEMS[2]?.href).toBe('/publish/calendar');
    expect(PUBLISH_MENU_ITEMS.map((item) => item.href)).not.toContain(
      '/publish',
    );
  });

  it('groups pipeline status shortcuts under Pipeline', () => {
    const pipeline = PUBLISH_MENU_ITEMS.filter(
      (item) => item.group === 'Pipeline',
    );
    expect(pipeline.map((item) => item.label)).toEqual([
      'Review',
      'Drafts',
      'Published',
    ]);
    expect(pipeline[0]?.hasDividerAbove).toBeFalsy();
    expect(pipeline[0]?.isCollapsible).toBe(true);
  });

  it('has no duplicate hrefs', () => {
    const hrefs = PUBLISH_MENU_ITEMS.flatMap((item) =>
      item.href ? [item.href] : [],
    );
    const unique = new Set(hrefs);

    expect(hrefs.length).toBe(unique.size);
  });

  it('all items have required fields: label, href, outline, solid', () => {
    for (const item of PUBLISH_MENU_ITEMS) {
      expect(item.label).toBeTruthy();
      expect(item.href).toBeTruthy();
      expect(item.outline).toBeDefined();
      expect(item.solid).toBeDefined();
    }
  });

  it('all hrefs stay on the publish surface', () => {
    for (const item of PUBLISH_MENU_ITEMS) {
      expect(item.href).toMatch(/^\/publish(?:\/|$)/);
    }
  });

  it('owns no analytics destination', () => {
    const hrefs = PUBLISH_MENU_ITEMS.map((item) => item.href);
    const labels = PUBLISH_MENU_ITEMS.map((item) => item.label);

    expect(hrefs).not.toContain('/publish/analytics');
    expect(labels).not.toContain('Analytics');
  });

  it('does not host creation/automation destinations (Automate + actions own those)', () => {
    const hrefs = PUBLISH_MENU_ITEMS.map((item) => item.href);
    const labels = PUBLISH_MENU_ITEMS.map((item) => item.label);

    expect(hrefs).not.toContain('/publish/campaigns');
    expect(hrefs).not.toContain('/automate/campaigns');
    expect(hrefs).not.toContain('/publish/outreach-campaigns');
    expect(hrefs).not.toContain('/publish/newsletters');
    expect(hrefs).not.toContain('/publish/remix');
    expect(labels).not.toContain('Campaigns');
    expect(labels).not.toContain('Outreach');
    expect(labels).not.toContain('Newsletters');
    expect(labels).not.toContain('Remix');
  });
});
