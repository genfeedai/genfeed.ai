import type { Prisma } from '@genfeedai/prisma';

/**
 * The per-organization opt-ins that gate paid or autonomous work (#6526, #6727). Owners and
 * admins turn them on; every one of them is off until then.
 */
export type OrganizationAutomationSettings = Readonly<{
  /** A detected own-account breakout may enqueue and spend on a response. */
  isBreakoutResponsesEnabled: boolean;
  /** A response output that passed every check may schedule itself. */
  isBreakoutAutoPublishEnabled: boolean;
  /** A provider may read branded visuals, when the platform switch also allows it. */
  isBrandVisionChecksEnabled: boolean;
}>;

/** What a missing settings row reads as: nothing is enabled. */
export const ORGANIZATION_AUTOMATION_SETTINGS_OFF: OrganizationAutomationSettings =
  {
    isBrandVisionChecksEnabled: false,
    isBreakoutAutoPublishEnabled: false,
    isBreakoutResponsesEnabled: false,
  };

type OrganizationAutomationSettingsReader = Pick<
  Prisma.TransactionClient,
  'organizationSetting'
>;

/**
 * Reads the organization's opt-ins fresh from the database. Only a stored `true` enables
 * anything: a missing row or a malformed value is off, so a read can never grant spend.
 * Callers re-read at every decision point instead of caching, so turning a setting off
 * takes effect on work already in flight.
 */
export async function readOrganizationAutomationSettings(
  client: OrganizationAutomationSettingsReader,
  organizationId: string,
): Promise<OrganizationAutomationSettings> {
  if (!organizationId) return ORGANIZATION_AUTOMATION_SETTINGS_OFF;
  const row = await client.organizationSetting.findFirst({
    select: {
      isBrandVisionChecksEnabled: true,
      isBreakoutAutoPublishEnabled: true,
      isBreakoutResponsesEnabled: true,
    },
    where: { organizationId },
  });
  return {
    isBrandVisionChecksEnabled: row?.isBrandVisionChecksEnabled === true,
    isBreakoutAutoPublishEnabled: row?.isBreakoutAutoPublishEnabled === true,
    isBreakoutResponsesEnabled: row?.isBreakoutResponsesEnabled === true,
  };
}
