import { describe, expect, it } from 'vitest';
import {
  APP_LOGO_HREF,
  APP_MENU_ITEMS,
  APP_SECONDARY_MENU_ITEMS,
  AppMenuGroup,
} from './menu-items.config';

describe('APP_MENU_ITEMS', () => {
  it('has no primary items in the main sidebar', () => {
    const primaryItems = APP_MENU_ITEMS.filter((item) => item.isPrimary);

    expect(primaryItems).toHaveLength(0);
    expect(APP_LOGO_HREF).toBe('/workspace/overview');
  });

  it('renders the workspace entrypoints as standalone top-level rows', () => {
    const ungroupedLabels = APP_MENU_ITEMS.filter(
      (item) => item.group === AppMenuGroup.Root && !item.isPrimary,
    ).map((item) => item.label);

    expect(ungroupedLabels).toEqual(['Dashboard', 'Inbox', 'Issues']);
  });

  it('surfaces the new top-level workspace groups', () => {
    const groups = [
      ...new Set(
        APP_MENU_ITEMS.map((item) => item.group).filter(
          (group) => group.length > 0,
        ),
      ),
    ];

    expect(groups).toEqual([
      AppMenuGroup.Library,
      AppMenuGroup.Analytics,
      AppMenuGroup.Posts,
      AppMenuGroup.Operations,
      AppMenuGroup.Create,
    ]);
  });

  it('gives workspace first-class subroutes in the main sidebar', () => {
    const workspaceLabels = APP_MENU_ITEMS.filter(
      (item) => item.group === AppMenuGroup.Root,
    ).map((item) => item.label);

    expect(workspaceLabels).toEqual(['Dashboard', 'Inbox', 'Issues']);
  });

  it('orders the posts group around the new canonical routes', () => {
    const postsLabels = APP_MENU_ITEMS.filter(
      (item) => item.group === AppMenuGroup.Posts,
    ).map((item) => item.label);

    expect(postsLabels).toEqual([
      'Analytics',
      'Remix',
      'Calendar',
      'Review',
      'Posts',
    ]);
  });

  it('keeps analytics directly under overview', () => {
    const analyticsLabels = APP_MENU_ITEMS.filter(
      (item) => item.group === AppMenuGroup.Analytics,
    ).map((item) => item.label);

    expect(analyticsLabels).toEqual([
      'Overview',
      'Posts',
      'Brands',
      'Insights',
      'Hooks',
      'Performance Lab',
      'Trend Turnover',
      'Streaks',
    ]);
  });

  it('treats analytics as a drill-down group instead of exposing every analytics page in the main rail', () => {
    const analyticsItems = APP_MENU_ITEMS.filter(
      (item) => item.group === AppMenuGroup.Analytics,
    );

    expect(analyticsItems[0]?.drillDown).toBe(true);
    expect(
      analyticsItems.slice(1).every((item) => item.drillDown !== true),
    ).toBe(true);
  });

  it('exposes Compose under the Create group', () => {
    const composeItem = APP_MENU_ITEMS.find((item) => item.label === 'Compose');

    expect(composeItem).toEqual(
      expect.objectContaining({
        group: AppMenuGroup.Create,
        href: '/compose/post',
      }),
    );
  });

  it('keeps chat out of the main sidebar and surfaces workflow tools under operations', () => {
    const chatLabels = APP_MENU_ITEMS.filter(
      (item) => item.group === 'Chat',
    ).map((item) => item.label);
    const workflowLabels = APP_MENU_ITEMS.filter(
      (item) => item.group === AppMenuGroup.Operations,
    ).map((item) => item.label);

    expect(chatLabels).toEqual([]);
    expect(workflowLabels).toEqual([
      'Runs',
      'Workflows',
      'Skills',
      'Autopilot',
      'Configuration',
    ]);
  });

  it('treats workflows as a drill-down group instead of flat main-nav links', () => {
    const workflowItems = APP_MENU_ITEMS.filter(
      (item) => item.group === AppMenuGroup.Operations,
    );

    expect(workflowItems[0]?.drillDown).toBe(true);
    expect(
      workflowItems.slice(1).every((item) => item.drillDown !== true),
    ).toBe(true);
  });

  it('keeps activity out of primary navigation and exposes it as a secondary destination', () => {
    expect(APP_SECONDARY_MENU_ITEMS).toEqual([
      expect.objectContaining({
        href: '/workspace/activity',
        label: 'Activity',
      }),
    ]);
    expect(APP_MENU_ITEMS.map((item) => item.href)).not.toContain(
      '/workspace/activity',
    );
  });

  it('does not surface legacy mission control, automations, or bot split groups', () => {
    const hrefs = APP_MENU_ITEMS.map((item) => item.href);
    const groups = APP_MENU_ITEMS.map((item) => item.group);

    expect(hrefs).not.toContain('/mission-control');
    expect(hrefs).not.toContain('/automations');
    expect(hrefs).not.toContain('/orchestration/activities');
    expect(hrefs).not.toContain('/orchestration/reply-bots');
    expect(hrefs).not.toContain('/orchestration/bots');
    expect(hrefs).not.toContain('/orchestration/campaigns');
    expect(hrefs).not.toContain('/orchestration/runs');
    expect(hrefs).not.toContain('/orchestration/workflows');
    expect(hrefs).not.toContain('/orchestration/autopilot');
    expect(hrefs).not.toContain('/orchestration/configuration');
    expect(hrefs).not.toContain('/chat');
    expect(hrefs).not.toContain('/posts/composer');
    expect(hrefs).not.toContain('/posts/articles');
    expect(hrefs).not.toContain('/posts/newsletters');
    expect(groups).not.toContain('Automations');
    expect(groups).not.toContain('Chat');
    expect(groups).not.toContain('Content');
    expect(groups).not.toContain('Trends');
  });
});
