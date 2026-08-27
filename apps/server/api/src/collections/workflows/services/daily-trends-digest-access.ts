import {
  getMetadataRecord,
  getSystemWorkflowMetadata,
} from '@api/collections/workflows/system-workflow.contract';
import { isCloudDeployment } from '@genfeedai/config';
import {
  DAILY_TRENDS_DIGEST_CANONICAL_ID,
  isTrendsDigestCloudOperatorEmail,
} from '@genfeedai/constants';

export function isDailyTrendsDigestMetadata(metadata: unknown): boolean {
  const record = getMetadataRecord(metadata);
  if (record.sourceTemplateId === DAILY_TRENDS_DIGEST_CANONICAL_ID) {
    return true;
  }

  return (
    getSystemWorkflowMetadata(metadata)?.canonicalId ===
    DAILY_TRENDS_DIGEST_CANONICAL_ID
  );
}

/**
 * Hosted SaaS may only email the operator inbox. Self-hosted still delivers
 * to the organization owner.
 */
export function isDailyTrendsDigestRecipientAllowed(
  email: string | null | undefined,
  options?: { isCloud?: boolean },
): boolean {
  const isCloud = options?.isCloud ?? isCloudDeployment();
  if (!isCloud) {
    return true;
  }

  return isTrendsDigestCloudOperatorEmail(email);
}

/**
 * Cloud: schedule is on only for the operator inbox.
 * Self-host: new clones default on; existing pause/enable is left alone.
 */
export function resolveDailyTrendsDigestScheduleEnabled(input: {
  email: string | null | undefined;
  existingScheduleEnabled?: boolean | null;
  isCloud?: boolean;
}): boolean {
  const isCloud = input.isCloud ?? isCloudDeployment();
  if (isCloud) {
    return isTrendsDigestCloudOperatorEmail(input.email);
  }

  return input.existingScheduleEnabled ?? true;
}
