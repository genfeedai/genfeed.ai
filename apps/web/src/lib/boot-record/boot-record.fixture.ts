import { resolveOrganizationModulePreferences } from '@genfeedai/contracts/constants';
import type {
  BootRailSnapshot,
  BootRecord,
} from '@/props/layout/boot-record.props';

/** A stored rail for specs; `buildId` matches the test build ('development'). */
function createBootRailSnapshot(
  overrides: Partial<BootRailSnapshot> = {},
): BootRailSnapshot {
  return {
    flags: {},
    hiddenAppIds: [],
    installedAppIds: [],
    isAssetGateLocked: false,
    moduleAccess: {},
    modulePreferences: resolveOrganizationModulePreferences(null, {}),
    pinnedAppIds: [],
    railAppOrder: [],
    releaseVisibility: {},
    showAdmin: false,
    ...overrides,
  };
}

export function createBootRecord(
  overrides: Partial<BootRecord> = {},
): BootRecord {
  return {
    buildId: 'development',
    organizationSlug: 'acme',
    rail: createBootRailSnapshot(),
    savedAt: Date.now(),
    userId: 'user-1',
    ...overrides,
  };
}
