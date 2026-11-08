import type {
  HeyGenTwinGroup,
  HeyGenTwinLook,
} from '@api/services/integrations/heygen/helpers/heygen-twin';
import { AvatarTwinStatus } from '@genfeedai/contracts';

export interface AvatarTwinProviderState {
  failureCode: string | null;
  failureMessage: string | null;
  status: AvatarTwinStatus;
}

/**
 * The enrollment status from what the provider reports. A twin renders only
 * once its look has trained **and** its group has accepted consent; the two
 * run in parallel, so either can finish first.
 */
export function deriveAvatarTwinState(
  look: Pick<HeyGenTwinLook, 'errorCode' | 'errorMessage' | 'status'>,
  group: Pick<
    HeyGenTwinGroup,
    'consentStatus' | 'errorCode' | 'errorMessage' | 'status'
  > | null,
): AvatarTwinProviderState {
  if (look.status === 'failed')
    return {
      failureCode: look.errorCode ?? 'training_failed',
      failureMessage: look.errorMessage,
      status: AvatarTwinStatus.FAILED,
    };
  if (group?.consentStatus === 'rejected')
    return {
      failureCode: group.errorCode ?? 'consent_rejected',
      failureMessage: group.errorMessage,
      status: AvatarTwinStatus.CONSENT_REJECTED,
    };
  const isTrained =
    look.status === 'completed' || look.status === 'pending_consent';
  const status = !isTrained
    ? AvatarTwinStatus.TRAINING
    : look.status === 'completed' && group?.consentStatus === 'accepted'
      ? AvatarTwinStatus.READY
      : AvatarTwinStatus.AWAITING_CONSENT;
  return { failureCode: null, failureMessage: null, status };
}

/** Statuses the provider can still move; the others are final. */
export const AVATAR_TWIN_WAITING_STATUSES = [
  AvatarTwinStatus.TRAINING,
  AvatarTwinStatus.AWAITING_CONSENT,
] as const;
