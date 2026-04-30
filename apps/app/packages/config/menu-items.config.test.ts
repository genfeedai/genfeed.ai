import { describe, expect, it } from 'vitest';
import {
  APP_LOGO_HREF,
  APP_MENU_ITEMS,
  AppMenuGroup,
  getAppSecondaryMenuItems,
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

    expect(ungroupedLabels).toEqual([
      'Dashboard',
      'Inbox',
      'Tasks',
      'Activity',
    ]);
  });

  it('does not surface content drilldowns in the shared sidebar', () => {
    const groups = [
      ...new Set(
        APP_MENU_ITEMS.map((item) => item.group).filter(
          (group) => group.length > 0,
        ),
      ),
    ];
    const hrefs = APP_MENU_ITEMS.map((item) => item.href);

    expect(groups).toEqual([]);
    expect(hrefs).not.toContain('/library/ingredients');
    expect(hrefs).not.toContain('/posts');
  });

  it('gives workspace first-class subroutes in the main sidebar', () => {
    const workspaceLabels = APP_MENU_ITEMS.filter(
      (item) => item.group === AppMenuGroup.Root,
    ).map((item) => item.label);

    expect(workspaceLabels).toEqual([
      'Dashboard',
      'Inbox',
      'Tasks',
      'Activity',
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

  it('keeps activity in the workspace navigation and no longer exposes secondary destinations', () => {
    expect(getAppSecondaryMenuItems()).toEqual([]);
    expect(APP_MENU_ITEMS.map((item) => item.href)).toContain(
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
