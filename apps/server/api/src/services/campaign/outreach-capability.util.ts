import {
  doesOutreachTargetPlatformMatch,
  evaluateOutreachCapability,
  getOutreachCapabilityRefusal,
  isOutreachPairExecutable,
  OUTREACH_ACTIVE_CONFIGURATION_LOCKED_ERROR,
  OUTREACH_TARGET_PLATFORM_MISMATCH_ERROR,
  type OutreachCapabilityClientError,
  type OutreachCapabilityInput,
} from '@genfeedai/contracts/api-types/contracts/outreach-capabilities.contract';
import { BadRequestException } from '@nestjs/common';

export function isCampaignOutreachPairExecutable(
  input: OutreachCapabilityInput,
): boolean {
  return isOutreachPairExecutable(evaluateOutreachCapability(input));
}

export function requireExecutableOutreachPair(
  input: OutreachCapabilityInput,
): void {
  const refusal = getOutreachCapabilityRefusal(input);
  if (refusal) {
    throw toOutreachCapabilityException(refusal);
  }
}

export function requireMatchingOutreachTargetPlatform(input: {
  campaignPlatform?: string | null;
  targetPlatform?: string | null;
}): void {
  if (doesOutreachTargetPlatformMatch(input)) {
    return;
  }

  throw toOutreachCapabilityException(OUTREACH_TARGET_PLATFORM_MISMATCH_ERROR);
}

export function requireInactiveOutreachCapabilityChange(): void {
  throw toOutreachCapabilityException(
    OUTREACH_ACTIVE_CONFIGURATION_LOCKED_ERROR,
  );
}

export function toOutreachCapabilityException(
  error: OutreachCapabilityClientError,
): BadRequestException {
  return new BadRequestException({
    code: error.code,
    message: error.message,
    ...(error.reason ? { reason: error.reason } : {}),
  });
}
