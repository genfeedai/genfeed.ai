import { describe, expect, it } from 'vitest';
import type { NativeAppAvailabilityInput } from '../interfaces/ui/native-app.interface';
import {
  CORE_APP_IDS,
  isNativeSecondaryAppId,
  isWorkflowLibraryVisible,
  listStoreNativeAppIds,
  NATIVE_SECONDARY_APP_IDS,
  NATIVE_SECONDARY_APPS,
  normalizeInstalledAppIds,
  resolveNativeAppAvailability,
} from './native-apps.constant';
import { ORGANIZATION_MODULE_IDS } from './organization-modules.constant';

const ALLOWED = { isAllowed: true, reason: null } as const;

function availability(overrides: Partial<NativeAppAvailabilityInput> = {}) {
  return resolveNativeAppAvailability({
    appId: 'playground',
    installedAppIds: [],
    isFounderOperator: false,
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

  it('restricts the unfinished specialist apps to the founder', () => {
    const founderOnly = NATIVE_SECONDARY_APP_IDS.filter(
      (appId) =>
        NATIVE_SECONDARY_APPS[appId].releaseEligibility === 'founder-only',
    );
    expect(founderOnly.sort()).toEqual(
      ['automation', 'clips', 'editor', 'messages', 'motion'].sort(),
    );
  });

  it('governs each app by its organization module', () => {
    for (const appId of NATIVE_SECONDARY_APP_IDS) {
      expect(ORGANIZATION_MODULE_IDS).toContain(
        NATIVE_SECONDARY_APPS[appId].organizationModuleId,
      );
    }
    expect(NATIVE_SECONDARY_APPS.turbo.organizationModuleId).toBe('batch');
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

describe('listStoreNativeAppIds', () => {
  it('omits founder-only experiments from the customer catalog', () => {
    expect(listStoreNativeAppIds(false)).toEqual([
      'playground',
      'storyboard',
      'turbo',
      'discovery',
    ]);
  });

  it('lists every native app for the founder', () => {
    expect(listStoreNativeAppIds(true)).toEqual(NATIVE_SECONDARY_APP_IDS);
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

  it('treats unresolved organization access as unavailable', () => {
    const preferences = { installedAppIds: ['playground'] };
    expect(availability({ ...preferences, organizationAccess: null })).toBe(
      'unavailable',
    );
    expect(
      availability({ ...preferences, organizationAccess: undefined }),
    ).toBe('unavailable');
  });

  it('keeps founder-only apps closed to customers despite organization access', () => {
    expect(
      availability({
        appId: 'motion',
        installedAppIds: ['motion'],
        pinnedAppIds: ['motion'],
      }),
    ).toBe('founder-only');
  });

  it('opens founder-only apps to the founder only within organization access', () => {
    expect(
      availability({
        appId: 'motion',
        installedAppIds: ['motion'],
        isFounderOperator: true,
      }),
    ).toBe('installed');
    expect(
      availability({
        appId: 'motion',
        installedAppIds: ['motion'],
        isFounderOperator: true,
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
    expect(isWorkflowLibraryVisible('founder-only')).toBe(false);
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
