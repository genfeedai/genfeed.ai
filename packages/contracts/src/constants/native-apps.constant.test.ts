import { describe, expect, it } from 'vitest';
import type { NativeAppAvailabilityInput } from '../interfaces/ui/native-app.interface';
import {
  applyRailAppOrder,
  CORE_APP_IDS,
  DEFAULT_HOME_APP_ID,
  isNativeSecondaryAppId,
  isWorkflowLibraryVisible,
  NATIVE_SECONDARY_APP_IDS,
  NATIVE_SECONDARY_APPS,
  normalizeInstalledAppIds,
  normalizeRailAppOrder,
  RAIL_APP_IDS,
  resolveHomeAppId,
  resolveNativeAppAvailability,
} from './native-apps.constant';
import { ORGANIZATION_MODULE_IDS } from './organization-modules.constant';

const ALLOWED = { isAllowed: true, reason: null } as const;

function availability(overrides: Partial<NativeAppAvailabilityInput> = {}) {
  return resolveNativeAppAvailability({
    appId: 'playground',
    installedAppIds: [],
    organizationAccess: ALLOWED,
    pinnedAppIds: [],
    ...overrides,
  });
}

describe('native apps catalog (#5502)', () => {
  it('keeps five core apps that are never installable', () => {
    expect(CORE_APP_IDS).toEqual([
      'workspace',
      'agent',
      'library',
      'publishing',
      'analytics',
    ]);
    for (const coreAppId of CORE_APP_IDS) {
      expect(isNativeSecondaryAppId(coreAppId)).toBe(false);
    }
  });

  it('names every secondary app with one word', () => {
    for (const appId of NATIVE_SECONDARY_APP_IDS) {
      expect(NATIVE_SECONDARY_APPS[appId].label).toMatch(/^[A-Z][a-z]+$/);
    }
  });

  it('governs each app by its organization module', () => {
    for (const appId of NATIVE_SECONDARY_APP_IDS) {
      expect(ORGANIZATION_MODULE_IDS).toContain(
        NATIVE_SECONDARY_APPS[appId].organizationModuleId,
      );
    }
    expect(NATIVE_SECONDARY_APPS.turbo.organizationModuleId).toBe('turbo');
  });

  it('opens Edit and Clip in their specialist apps', () => {
    expect(NATIVE_SECONDARY_APPS.editor.contextualEntries).toEqual(['edit']);
    expect(NATIVE_SECONDARY_APPS.clips.contextualEntries).toEqual(['clip']);
  });

  it('rejects unknown and inherited ids', () => {
    expect(isNativeSecondaryAppId('studio')).toBe(false);
    expect(isNativeSecondaryAppId('toString')).toBe(false);
    expect(isNativeSecondaryAppId(undefined)).toBe(false);
  });
});

describe('resolveNativeAppAvailability', () => {
  it('reports installed and pinned apps when access allows them', () => {
    expect(availability()).toBe('not-installed');
    expect(availability({ installedAppIds: ['playground'] })).toBe('installed');
    expect(
      availability({
        installedAppIds: ['playground'],
        pinnedAppIds: ['playground'],
      }),
    ).toBe('pinned');
  });

  it('never shows a pin for an app that is not installed', () => {
    expect(availability({ pinnedAppIds: ['playground'] })).toBe(
      'not-installed',
    );
  });

  it('lets organization denial win over an installation and pin', () => {
    const preferences = {
      installedAppIds: ['playground'],
      pinnedAppIds: ['playground'],
    };
    expect(
      availability({
        ...preferences,
        organizationAccess: { isAllowed: false, reason: 'disabled' },
      }),
    ).toBe('organization-disabled');
    expect(
      availability({
        ...preferences,
        organizationAccess: {
          isAllowed: false,
          reason: 'subscription-required',
        },
      }),
    ).toBe('subscription-required');
    expect(
      availability({
        ...preferences,
        organizationAccess: { isAllowed: false, reason: 'unavailable' },
      }),
    ).toBe('unavailable');
  });

  it('reports an unreleased module as unreleased', () => {
    expect(
      availability({
        appId: 'motion',
        installedAppIds: ['motion'],
        organizationAccess: { isAllowed: false, reason: 'unreleased' },
      }),
    ).toBe('unreleased');
  });

  it('treats unresolved organization access as unavailable', () => {
    const preferences = { installedAppIds: ['playground'] };
    expect(availability({ ...preferences, organizationAccess: null })).toBe(
      'unavailable',
    );
    expect(
      availability({ ...preferences, organizationAccess: undefined }),
    ).toBe('unavailable');
  });

  it('opens a released app within organization access', () => {
    expect(
      availability({
        appId: 'motion',
        installedAppIds: ['motion'],
      }),
    ).toBe('installed');
    expect(
      availability({
        appId: 'motion',
        installedAppIds: ['motion'],
        organizationAccess: { isAllowed: false, reason: 'disabled' },
      }),
    ).toBe('organization-disabled');
  });
});

describe('isWorkflowLibraryVisible', () => {
  it('requires Automation to be installed and eligible', () => {
    expect(isWorkflowLibraryVisible('installed')).toBe(true);
    expect(isWorkflowLibraryVisible('pinned')).toBe(true);
    expect(isWorkflowLibraryVisible('not-installed')).toBe(false);
    expect(isWorkflowLibraryVisible('subscription-required')).toBe(false);
    expect(isWorkflowLibraryVisible('organization-disabled')).toBe(false);
    expect(isWorkflowLibraryVisible('unreleased')).toBe(false);
    expect(isWorkflowLibraryVisible('unavailable')).toBe(false);
  });
});

describe('normalizeInstalledAppIds', () => {
  it('drops unknown and duplicate installed ids in stored order', () => {
    expect(
      normalizeInstalledAppIds(['turbo', 'studio', 7, 'turbo', 'clips']),
    ).toEqual(['turbo', 'clips']);
    expect(normalizeInstalledAppIds(null)).toEqual([]);
  });
});

describe('rail app order', () => {
  it('covers the core loop and every secondary app exactly once', () => {
    expect(RAIL_APP_IDS).toEqual([
      ...CORE_APP_IDS,
      ...NATIVE_SECONDARY_APP_IDS,
    ]);
    expect(new Set(RAIL_APP_IDS).size).toBe(RAIL_APP_IDS.length);
  });

  it('drops unknown and duplicate ids in stored order', () => {
    expect(
      normalizeRailAppOrder(['library', 'studio', 'library', 7, 'turbo']),
    ).toEqual(['library', 'turbo']);
    expect(normalizeRailAppOrder(undefined)).toEqual([]);
  });

  it('puts listed items first and keeps unlisted ones in default order', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));

    expect(applyRailAppOrder(items, ['c', 'a']).map((item) => item.id)).toEqual(
      ['c', 'a', 'b', 'd'],
    );
    expect(applyRailAppOrder(items, []).map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(
      applyRailAppOrder(items, ['zzz', 'd']).map((item) => item.id),
    ).toEqual(['d', 'a', 'b', 'c']);
  });
});

describe('resolveHomeAppId', () => {
  const availableAppIds = ['workspace', 'agent', 'playground'];

  it('prefers the member, then the organization, then Workspace', () => {
    expect(
      resolveHomeAppId({
        availableAppIds,
        organizationHomeAppId: 'agent',
        userHomeAppId: 'playground',
      }),
    ).toBe('playground');
    expect(
      resolveHomeAppId({
        availableAppIds,
        organizationHomeAppId: 'agent',
        userHomeAppId: null,
      }),
    ).toBe('agent');
    expect(resolveHomeAppId({ availableAppIds })).toBe(DEFAULT_HOME_APP_ID);
  });

  it('skips a choice that is unavailable or unknown', () => {
    expect(
      resolveHomeAppId({
        availableAppIds,
        organizationHomeAppId: 'agent',
        userHomeAppId: 'turbo',
      }),
    ).toBe('agent');
    expect(
      resolveHomeAppId({
        availableAppIds,
        organizationHomeAppId: 'studio',
        userHomeAppId: 'turbo',
      }),
    ).toBe('workspace');
  });
});
