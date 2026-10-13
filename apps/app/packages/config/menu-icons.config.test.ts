import { SettingsSurface } from '@genfeedai/contracts';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { findAnimatedIcon } from '@ui/primitives/animated-icons/animated-icon.registry';
import {
  ADMIN_RAIL_APP,
  APP_RAIL_REGISTRY,
} from '@ui/shell/app-rail/app-rail.registry';
import { describe, expect, it } from 'vitest';

import { ADMIN_MENU_ITEMS } from './admin-menu-items.config';
import { ANALYTICS_MENU_ITEMS } from './analytics-menu-items.config';
import { AUTOMATION_MENU_ITEMS } from './automation-menu-items.config';
import { DISCOVERY_MENU_ITEMS } from './discovery-menu-items.config';
import { LIBRARY_MENU_ITEMS } from './library-menu-items.config';
import { APP_MENU_ITEMS } from './menu-items.config';
import { MESSAGES_MENU_ITEMS } from './messages-menu-items.config';
import { ORG_MENU_ITEMS } from './org-menu-items.config';
import { PUBLISHING_MENU_ITEMS } from './publishing-menu-items.config';
import { buildSettingsMenuItems } from './settings-menu-items.config';
import { STUDIO_APP_MENU_ITEMS } from './studio-menu-items.config';

/**
 * The same thing gets the same icon everywhere, and one icon never stands for
 * two different things. Labels name the thing; these aliases join names that
 * mean the same destination, and rail apps to the page they are.
 */
const SAME_MEANING: Record<string, string> = {
  activities: 'activity',
  // The Library rail item, its Assets page and Admin › Ingredients are all the
  // asset library.
  assets: 'ingredients',
  // Agents, the organization Agent page, agent settings and Admin bots are
  // one family: the robot.
  agent: 'agents',
  'agent settings': 'agents',
  bots: 'agents',
  // Generations are what the Playground makes.
  generations: 'playground',
  'connected accounts': 'accounts',
  members: 'users',
  'referral rewards': 'referrals',
  subscriptions: 'subscription',
};

const RAIL_MEANING: Record<string, string> = {
  agent: 'rail:agent',
  analytics: 'analytics',
  automation: 'workflows',
  clips: 'clips',
  editor: 'editor',
  library: 'ingredients',
  motion: 'motion',
  playground: 'playground',
  publishing: 'publishing',
  storyboard: 'storyboard',
  turbo: 'turbo',
};

interface IconUse {
  icon: unknown;
  meaning: string;
  where: string;
}

function iconName(icon: unknown): string {
  return String((icon as { displayName?: string }).displayName);
}

function collectUses(): IconUse[] {
  const menus: [string, MenuItemConfig[]][] = [
    ['Workspace', APP_MENU_ITEMS],
    ['Library', LIBRARY_MENU_ITEMS],
    ['Studio', Object.values(STUDIO_APP_MENU_ITEMS).flat()],
    ['Publishing', PUBLISHING_MENU_ITEMS],
    ['Analytics', ANALYTICS_MENU_ITEMS],
    ['Automation', AUTOMATION_MENU_ITEMS],
    ['Messages', MESSAGES_MENU_ITEMS],
    ['Discovery', DISCOVERY_MENU_ITEMS],
    ['Organization', ORG_MENU_ITEMS],
    ['Admin', ADMIN_MENU_ITEMS],
    ...Object.values(SettingsSurface).map(
      (scope): [string, MenuItemConfig[]] => [
        `Settings (${scope})`,
        buildSettingsMenuItems({ isEnterprise: true, scope }),
      ],
    ),
  ];

  const uses: IconUse[] = [];
  for (const app of [...APP_RAIL_REGISTRY, ADMIN_RAIL_APP]) {
    uses.push({
      icon: app.icon,
      meaning: RAIL_MEANING[app.id] ?? `rail:${app.id}`,
      where: `rail › ${app.id}`,
    });
  }
  for (const [menu, items] of menus) {
    for (const item of items) {
      if (!item.outline) continue;
      const label = String(item.label).toLowerCase();
      uses.push({
        icon: item.outline,
        meaning: SAME_MEANING[label] ?? label,
        where: `${menu} › ${item.label}`,
      });
    }
  }
  return uses;
}

describe('navigation icons', () => {
  const uses = collectUses();

  it('never uses one icon for two different things', () => {
    const byIcon = new Map<unknown, Set<string>>();
    const where = new Map<unknown, string[]>();
    for (const use of uses) {
      byIcon.set(
        use.icon,
        new Set([...(byIcon.get(use.icon) ?? []), use.meaning]),
      );
      where.set(use.icon, [...(where.get(use.icon) ?? []), use.where]);
    }
    const clashes = [...byIcon]
      .filter(([, meanings]) => meanings.size > 1)
      .map(([icon]) => `${iconName(icon)}: ${where.get(icon)?.join(', ')}`);

    expect(clashes).toEqual([]);
  });

  it('gives the same thing the same icon in every menu', () => {
    const byMeaning = new Map<string, Set<string>>();
    for (const use of uses) {
      if (use.where.startsWith('rail')) continue;
      byMeaning.set(
        use.meaning,
        new Set([...(byMeaning.get(use.meaning) ?? []), iconName(use.icon)]),
      );
    }
    const mismatches = [...byMeaning]
      .filter(([, icons]) => icons.size > 1)
      .map(([meaning, icons]) => `${meaning}: ${[...icons].join(', ')}`);

    expect(mismatches).toEqual([]);
  });

  it('gives every rail and menu icon a hover animation', () => {
    const still = uses
      .filter((use) => !findAnimatedIcon(use.icon))
      .map((use) => `${use.where} (${iconName(use.icon)})`);

    expect(still).toEqual([]);
  });
});
