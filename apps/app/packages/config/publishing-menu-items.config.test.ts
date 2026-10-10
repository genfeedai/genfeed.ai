import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { LayoutDashboard } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_MENU_ITEMS } from './analytics-menu-items.config';
import { AUTOMATION_MENU_ITEMS } from './automation-menu-items.config';
import { DISCOVERY_MENU_ITEMS } from './discovery-menu-items.config';
import { APP_MENU_ITEMS } from './menu-items.config';
import { ORG_MENU_ITEMS } from './org-menu-items.config';
import { PUBLISHING_MENU_ITEMS } from './publishing-menu-items.config';

describe('PUBLISHING_MENU_ITEMS', () => {
  it.each([
    ['Workspace', APP_MENU_ITEMS, APP_ROUTES.WORKSPACE.OVERVIEW],
    ['Publishing', PUBLISHING_MENU_ITEMS, APP_ROUTES.PUBLISHING.OVERVIEW],
    ['Analytics', ANALYTICS_MENU_ITEMS, APP_ROUTES.ANALYTICS.OVERVIEW],
    ['Automation', AUTOMATION_MENU_ITEMS, APP_ROUTES.AUTOMATION.OVERVIEW],
    ['Discovery', DISCOVERY_MENU_ITEMS, APP_ROUTES.DISCOVERY.OVERVIEW],
    ['Organization workspace', ORG_MENU_ITEMS, APP_ROUTES.WORKSPACE.OVERVIEW],
  ] as const)(
    '%s uses the shared Overview label and icon in both selection states',
    (_module, items, href) => {
      expect(items.find((item) => item.href === href)).toEqual(
        expect.objectContaining({
          label: 'Overview',
          outline: LayoutDashboard,
          solid: LayoutDashboard,
        }),
      );
    },
  );

  it('is non-empty', () => {
    expect(PUBLISHING_MENU_ITEMS.length).toBeGreaterThan(0);
  });

  it('is a flat Overview → Posts → Approval queue → Campaigns bar', () => {
    expect(PUBLISHING_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Overview',
      'Posts',
      'Approval queue',
      'Campaigns',
    ]);
    expect(PUBLISHING_MENU_ITEMS.map((item) => item.href)).toEqual([
      APP_ROUTES.PUBLISHING.OVERVIEW,
      APP_ROUTES.PUBLISHING.POSTS,
      APP_ROUTES.PUBLISHING.REVIEW,
      APP_ROUTES.PUBLISHING.CAMPAIGNS,
    ]);
    expect(PUBLISHING_MENU_ITEMS.map((item) => item.href)).not.toContain(
      '/publishing',
    );
  });

  it('keeps Campaigns founder-only and Overview and Posts for customers (#5502)', () => {
    expect(
      PUBLISHING_MENU_ITEMS.filter((item) => !item.isFounderOnly).map(
        (item) => item.label,
      ),
    ).not.toContain('Campaigns');
    expect(
      PUBLISHING_MENU_ITEMS.find((item) => item.label === 'Campaigns'),
    ).toEqual(expect.objectContaining({ isFounderOnly: true }));
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
    expect(hrefs).not.toContain('/publishing/newsletters');
    expect(hrefs).not.toContain('/publishing/remix');
    expect(labels).toContain('Campaigns');
    expect(labels).not.toContain('Outreach');
    expect(labels).not.toContain('Newsletters');
    expect(labels).not.toContain('Remix');
  });
});
