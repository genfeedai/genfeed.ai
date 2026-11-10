import { NATIVE_SECONDARY_APP_IDS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import {
  hasAppsBeyondDashboard,
  resolveAvailableRailApps,
  resolveOrganizationApps,
} from './app-rail.availability';

const ALLOWED = { isAllowed: true, reason: null } as const;

function railAppIds(flags: Record<string, unknown>): string[] {
  return resolveAvailableRailApps({
    flags,
    installedAppIds: ['clipper', 'motion'],
    moduleAccess: { clipper: ALLOWED, motion: ALLOWED },
    modulePreferences: undefined,
  }).map((app) => app.id);
}

describe('resolveAvailableRailApps', () => {
  it('lists an installed launcher app while its platform switch is on or unset', () => {
    expect(railAppIds({})).toContain('clipper');
    expect(railAppIds({ clipper: true })).toContain('clipper');
  });

  it('hides a launcher app whose platform switch is off', () => {
    expect(railAppIds({ clipper: false })).not.toContain('clipper');
    expect(railAppIds({ clipper: false })).toContain('motion');
  });

  it('hides a launcher app that is not installed', () => {
    const ids = resolveAvailableRailApps({
      flags: {},
      installedAppIds: ['motion'],
      moduleAccess: { clipper: ALLOWED, motion: ALLOWED },
      modulePreferences: undefined,
    }).map((app) => app.id);
    expect(ids).not.toContain('clipper');
    expect(ids).toContain('motion');
  });
});

describe('resolveAvailableRailApps dashboard order', () => {
  it('lists the dashboard apps in rail order, then Agent, before any launcher app', () => {
    const ids = resolveAvailableRailApps({
      flags: {},
      installedAppIds: [],
      moduleAccess: {},
      modulePreferences: undefined,
    }).map((app) => app.id);
    expect(ids).toEqual([
      'workspace',
      'discovery',
      'library',
      'publishing',
      'analytics',
      'agent',
    ]);
  });

  it('hides Trends for an organization without the paid plan it needs', () => {
    const ids = resolveAvailableRailApps({
      flags: {},
      installedAppIds: [],
      moduleAccess: {
        discovery: { isAllowed: false, reason: 'subscription-required' },
      },
      modulePreferences: undefined,
    }).map((app) => app.id);
    expect(ids).not.toContain('discovery');
    expect(ids).toContain('library');
  });
});

describe('hasAppsBeyondDashboard', () => {
  it('is false while only the core apps are available', () => {
    const everyLauncherOff = Object.fromEntries(
      NATIVE_SECONDARY_APP_IDS.map((appId) => [appId, false]),
    );
    expect(
      hasAppsBeyondDashboard({
        flags: everyLauncherOff,
        moduleAccess: {},
        modulePreferences: undefined,
      }),
    ).toBe(false);
  });

  it('is true once a launcher app is available', () => {
    expect(
      hasAppsBeyondDashboard({
        flags: {},
        moduleAccess: { clipper: ALLOWED },
        modulePreferences: undefined,
      }),
    ).toBe(true);
  });

  it('counts apps the member has not installed', () => {
    const ids = resolveOrganizationApps({
      flags: {},
      moduleAccess: { clipper: ALLOWED },
      modulePreferences: undefined,
    }).map((app) => app.id);
    expect(ids).toContain('clipper');
  });
});
