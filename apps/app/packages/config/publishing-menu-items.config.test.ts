import { LEGACY_APP_ROUTES } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';
import { PUBLISHING_MENU_ITEMS } from './publishing-menu-items.config';

describe('PUBLISHING_MENU_ITEMS', () => {
  it('is non-empty', () => {
    expect(PUBLISHING_MENU_ITEMS.length).toBeGreaterThan(0);
  });

  it('leads with Overview → Posts → Calendar, then Pipeline', () => {
    expect(PUBLISHING_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Overview',
      'Posts',
      'Calendar',
      'Review',
      'Drafts',
      'Published',
    ]);
    expect(PUBLISHING_MENU_ITEMS[0]?.href).toBe('/publishing/overview');
    expect(PUBLISHING_MENU_ITEMS[1]?.href).toBe('/publishing/posts');
    expect(PUBLISHING_MENU_ITEMS[2]?.href).toBe('/publishing/calendar');
    expect(PUBLISHING_MENU_ITEMS.map((item) => item.href)).not.toContain(
      '/publishing',
    );
  });

  it('groups pipeline status shortcuts under Pipeline', () => {
    const pipeline = PUBLISHING_MENU_ITEMS.filter(
      (item) => item.group === 'Pipeline',
    );
    expect(pipeline.map((item) => item.label)).toEqual([
      'Review',
      'Drafts',
      'Published',
    ]);
    expect(pipeline[0]?.hasDividerAbove).toBeFalsy();
    expect(pipeline[0]?.isCollapsible).toBe(true);
    expect(pipeline.map((item) => item.href)).toEqual([
      '/publishing/posts?status=draft',
      '/publishing/posts?publicationState=not-posted',
      '/publishing/posts?publicationState=posted',
    ]);
    expect(pipeline.map((item) => item.matchSearchParams)).toEqual([
      { status: 'draft' },
      { publicationState: 'not-posted', status: null },
      { publicationState: 'posted', status: null },
    ]);
  });

  it('has no duplicate hrefs', () => {
    const hrefs = PUBLISHING_MENU_ITEMS.flatMap((item) =>
      item.href ? [item.href] : [],
    );
    const unique = new Set(hrefs);

    expect(hrefs.length).toBe(unique.size);
  });

  it('all items have required fields: label, href, outline, solid', () => {
    for (const item of PUBLISHING_MENU_ITEMS) {
      expect(item.label).toBeTruthy();
      expect(item.href).toBeTruthy();
      expect(item.outline).toBeDefined();
      expect(item.solid).toBeDefined();
    }
  });

  it('all hrefs stay on the publish surface', () => {
    for (const item of PUBLISHING_MENU_ITEMS) {
      expect(item.href).toMatch(/^\/publishing(?:\/|$)/);
    }
  });

  it('owns no analytics destination', () => {
    const hrefs = PUBLISHING_MENU_ITEMS.map((item) => item.href);
    const labels = PUBLISHING_MENU_ITEMS.map((item) => item.label);

    expect(hrefs).not.toContain('/publishing/analytics');
    expect(labels).not.toContain('Analytics');
  });

  it('does not host creation/automation destinations (Automation + actions own those)', () => {
    const hrefs = PUBLISHING_MENU_ITEMS.map((item) => item.href);
    const labels = PUBLISHING_MENU_ITEMS.map((item) => item.label);

    expect(hrefs).not.toContain('/publishing/campaigns');
    expect(hrefs).not.toContain('/automation/campaigns');
    expect(hrefs).not.toContain('/publishing/outreach-campaigns');
    expect(hrefs).not.toContain(LEGACY_APP_ROUTES.PUBLISHING_NEWSLETTERS);
    expect(hrefs).not.toContain('/publishing/remix');
    expect(labels).not.toContain('Campaigns');
    expect(labels).not.toContain('Outreach');
    expect(labels).not.toContain('Newsletters');
    expect(labels).not.toContain('Remix');
  });
});
