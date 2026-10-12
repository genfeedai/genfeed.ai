import {
  type OrganizationAutomationSettings,
  readOrganizationAutomationSettings,
} from '@api/collections/organization-settings/utils/organization-automation-settings.util';
import type { Prisma } from '@genfeedai/prisma';

/** Execution and publication hold with this reason while the organization has breakout responses off. */
export const BREAKOUT_ORG_DISABLED_REASON = 'org_breakout_disabled';

/** Publication that no signed-in member or key asked for holds with this reason while auto-publish is off. */
export const BREAKOUT_ORG_AUTO_PUBLISH_DISABLED_REASON =
  'org_breakout_auto_publish_disabled';

type BreakoutGateClient = Pick<Prisma.TransactionClient, 'organizationSetting'>;

/**
 * Whether the organization currently allows breakout responses (#6526). Re-read at every
 * decision point, never cached, so turning the setting off holds work already in flight.
 */
export async function isBreakoutResponsesEnabledFor(
  client: BreakoutGateClient,
  organizationId: string,
): Promise<boolean> {
  return (await readOrganizationAutomationSettings(client, organizationId))
    .isBreakoutResponsesEnabled;
}

/** Auto-publish only means anything while responses themselves are on. */
export function isBreakoutAutoPublishAllowed(
  settings: OrganizationAutomationSettings,
): boolean {
  return (
    settings.isBreakoutResponsesEnabled && settings.isBreakoutAutoPublishEnabled
  );
}
