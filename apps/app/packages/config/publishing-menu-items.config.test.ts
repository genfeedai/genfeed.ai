import { APP_ROUTES, LEGACY_APP_ROUTES } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';
import { PUBLISHING_MENU_ITEMS } from './publishing-menu-items.config';

describe('PUBLISHING_MENU_ITEMS', () => {
  it('is non-empty', () => {
    expect(PUBLISHING_MENU_ITEMS.length).toBeGreaterThan(0);
  });

  it('is a flat Overview → Posts → Content → Review → Calendar → Campaigns bar', () => {
    expect(PUBLISHING_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Overview',
      'Posts',
      'Content',
      'Review',
      'Calendar',
      'Campaigns',
    ]);
    expect(PUBLISHING_MENU_ITEMS.map((item) => item.href)).toEqual([
      APP_ROUTES.PUBLISHING.OVERVIEW,
      APP_ROUTES.PUBLISHING.POSTS,
      APP_ROUTES.PUBLISHING.CONTENT,
      APP_ROUTES.PUBLISHING.REVIEW,
      APP_ROUTES.PUBLISHING.CALENDAR,
      APP_ROUTES.PUBLISHING.CAMPAIGNS,
    ]);
    expect(PUBLISHING_MENU_ITEMS.map((item) => item.href)).not.toContain(
      '/publishing',
    );
  });

  it('has no groups, collapsible sections, or search-param shortcuts', () => {
    for (const item of PUBLISHING_MENU_ITEMS) {
      expect(item.group).toBe('');
      expect(item.isCollapsible).toBeFalsy();
      expect(item.matchSearchParams).toBeUndefined();
    }
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

    expect(hrefs).toContain('/publishing/campaigns');
    expect(hrefs).not.toContain('/automation/campaigns');
    expect(hrefs).not.toContain('/publishing/outreach-campaigns');
    expect(hrefs).not.toContain(LEGACY_APP_ROUTES.PUBLISHING_NEWSLETTERS);
    expect(hrefs).not.toContain('/publishing/remix');
    expect(labels).toContain('Campaigns');
    expect(labels).not.toContain('Outreach');
    expect(labels).not.toContain('Newsletters');
    expect(labels).not.toContain('Remix');
  });
});
