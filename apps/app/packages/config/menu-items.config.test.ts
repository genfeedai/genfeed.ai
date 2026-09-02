import { LEGACY_APP_ROUTES } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';
import {
  APP_MENU_ITEMS,
  AppMenuGroup,
  getAppSecondaryMenuItems,
} from './menu-items.config';

describe('APP_MENU_ITEMS', () => {
  it('has no primary items in the main sidebar', () => {
    const primaryItems = APP_MENU_ITEMS.filter((item) => item.isPrimary);

    expect(primaryItems).toHaveLength(0);
  });

  it('renders the workspace entrypoints as standalone top-level rows', () => {
    const ungroupedLabels = APP_MENU_ITEMS.reduce<string[]>((labels, item) => {
      if (item.group === AppMenuGroup.Root && !item.isPrimary) {
        labels.push(item.label);
      }
      return labels;
    }, []);

    expect(ungroupedLabels).toEqual([
      'Dashboard',
      'Inbox',
      'Tasks',
      'Activity',
    ]);
  });

  it('keeps Messages out of the workspace menu (app switcher owns it)', () => {
    expect(APP_MENU_ITEMS.map((item) => item.label)).not.toContain('Messages');
    expect(APP_MENU_ITEMS.map((item) => item.href)).not.toContain('/messages');
  });

  it('does not surface content drilldowns in the shared sidebar', () => {
    const groups = [
      ...new Set(
        APP_MENU_ITEMS.flatMap((item) =>
          item.group.length > 0 ? [item.group] : [],
        ),
      ),
    ];
    const hrefs = APP_MENU_ITEMS.map((item) => item.href);

    expect(groups).toEqual([]);
    expect(hrefs).not.toContain('/publishing');
  });

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

  it('does not include analytics group items pointing to /analytics/* routes', () => {
    const analyticsGroupHrefs = APP_MENU_ITEMS.reduce<string[]>(
      (hrefs, item) => {
        if (
          typeof item.href === 'string' &&
          item.href.startsWith('/analytics/')
        ) {
          hrefs.push(item.href);
        }
        return hrefs;
      },
      [],
    );

    // Analytics destinations belong to the Analytics module's own sidebar
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
    expect(hrefs).not.toContain(LEGACY_APP_ROUTES.PUBLISHING_NEWSLETTERS);
    expect(groups).not.toContain('Automations');
    expect(groups).not.toContain('Chat');
    expect(groups).not.toContain('Content');
    expect(groups).not.toContain('Trends');
    expect(groups).not.toContain('Operations');
    expect(groups).not.toContain('Create');
  });

  it('does not expose Operations or Create groups (workflows now live in their own sidebar)', () => {
    const hrefs = APP_MENU_ITEMS.map((item) => item.href);

    expect(hrefs).not.toContain('/compose/post');
  });
});
