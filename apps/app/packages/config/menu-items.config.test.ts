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

    expect(ungroupedLabels).toEqual(['Dashboard', 'Inbox', 'Tasks']);
  });

  it('surfaces the workspace groups: Library and Posts', () => {
    const groups = [
      ...new Set(
        APP_MENU_ITEMS.map((item) => item.group).filter(
          (group) => group.length > 0,
        ),
      ),
    ];

    expect(groups).toEqual([AppMenuGroup.Library, AppMenuGroup.Posts]);
  });

  it('gives workspace first-class subroutes in the main sidebar', () => {
    const workspaceLabels = APP_MENU_ITEMS.filter(
      (item) => item.group === AppMenuGroup.Root,
    ).map((item) => item.label);

    expect(workspaceLabels).toEqual(['Dashboard', 'Inbox', 'Tasks']);
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

  it('does not include analytics group items pointing to /analytics/* routes', () => {
    const analyticsGroupHrefs = APP_MENU_ITEMS.filter(
      (item) =>
        typeof item.href === 'string' && item.href.startsWith('/analytics/'),
    ).map((item) => item.href);

    // Only /posts/analytics is allowed — no /analytics/* items
    expect(analyticsGroupHrefs).toHaveLength(0);
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
    expect(groups).not.toContain('Operations');
    expect(groups).not.toContain('Create');
  });

  it('does not expose Operations or Create groups (workflows now live in their own sidebar)', () => {
    const hrefs = APP_MENU_ITEMS.map((item) => item.href);

    expect(hrefs).not.toContain('/workflows/executions');
    expect(hrefs).not.toContain('/workflows/autopilot');
    expect(hrefs).not.toContain('/workflows/configuration');
    expect(hrefs).not.toContain('/compose/post');
  });
});
