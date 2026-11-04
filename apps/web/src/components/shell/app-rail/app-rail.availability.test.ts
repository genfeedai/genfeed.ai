import { describe, expect, it } from 'vitest';
import { resolveAvailableRailApps } from './app-rail.availability';

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
