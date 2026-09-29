import { describe, expect, it } from 'vitest';
import {
  APP_MENU_ITEMS,
  AppMenuGroup,
  getAppSecondaryMenuItems,
} from './menu-items.config';

describe('APP_MENU_ITEMS', () => {
  it('gives workspace first-class subroutes in the main sidebar', () => {
    const workspaceLabels = APP_MENU_ITEMS.reduce<string[]>((labels, item) => {
      if (item.group === AppMenuGroup.Root) {
        labels.push(item.label);
      }
      return labels;
    }, []);

    expect(workspaceLabels).toEqual([
      'Dashboard',
      'Inbox',
      'Tasks',
      'Activity',
    ]);
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
    expect(hrefs).not.toContain('/automation/activities');
    expect(hrefs).not.toContain('/automation/reply-bots');
    expect(hrefs).not.toContain('/automation/bots');
    expect(hrefs).not.toContain('/publishing/campaigns');
    expect(hrefs).not.toContain('/automation/runs');
    expect(hrefs).not.toContain('/automation/workflows');
    expect(hrefs).not.toContain('/automation/autopilot');
    expect(hrefs).not.toContain('/automation/configuration');
    expect(hrefs).not.toContain('/agent');
    expect(hrefs).not.toContain('/publishing/composer');
    expect(hrefs).not.toContain('/publishing/articles');
    expect(hrefs).not.toContain('/publishing/newsletters');
    expect(groups).not.toContain('Automations');
    expect(groups).not.toContain('Chat');
    expect(groups).not.toContain('Content');
    expect(groups).not.toContain('Trends');
    expect(groups).not.toContain('Operations');
    expect(groups).not.toContain('Create');
  });
});
