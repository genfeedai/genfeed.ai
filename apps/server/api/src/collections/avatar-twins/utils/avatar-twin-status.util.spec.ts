import { deriveAvatarTwinState } from '@api/collections/avatar-twins/utils/avatar-twin-status.util';
import type {
  HeyGenConsentStatus,
  HeyGenTwinStatus,
} from '@api/services/integrations/heygen/helpers/heygen-twin';
import { AvatarTwinStatus } from '@genfeedai/contracts';

function look(status: HeyGenTwinStatus) {
  return { errorCode: null, errorMessage: null, status };
}

function group(consentStatus: HeyGenConsentStatus | null) {
  return {
    consentStatus,
    errorCode: null,
    errorMessage: null,
    status: 'pending_consent' as const,
  };
}

describe('deriveAvatarTwinState', () => {
  it.each([
    ['processing', null, AvatarTwinStatus.TRAINING],
    ['processing', 'pending', AvatarTwinStatus.TRAINING],
    ['processing', 'accepted', AvatarTwinStatus.TRAINING],
    ['pending_consent', 'pending', AvatarTwinStatus.AWAITING_CONSENT],
    ['pending_consent', 'accepted', AvatarTwinStatus.AWAITING_CONSENT],
    ['completed', null, AvatarTwinStatus.AWAITING_CONSENT],
    ['completed', 'pending', AvatarTwinStatus.AWAITING_CONSENT],
    ['completed', 'accepted', AvatarTwinStatus.READY],
    ['completed', 'rejected', AvatarTwinStatus.CONSENT_REJECTED],
    ['processing', 'rejected', AvatarTwinStatus.CONSENT_REJECTED],
    ['failed', 'accepted', AvatarTwinStatus.FAILED],
  ] as const)(
    'look %s with consent %s is %s',
    (lookStatus, consent, expected) => {
      expect(
        deriveAvatarTwinState(look(lookStatus), group(consent)).status,
      ).toBe(expected);
    },
  );

  it('keeps the provider reason for a failed look', () => {
    expect(
      deriveAvatarTwinState(
        {
          errorCode: 'moderation_failed',
          errorMessage: 'Face not visible.',
          status: 'failed',
        },
        null,
      ),
    ).toEqual({
      failureCode: 'moderation_failed',
      failureMessage: 'Face not visible.',
      status: AvatarTwinStatus.FAILED,
    });
  });

  it('keeps the provider reason for rejected consent', () => {
    expect(
      deriveAvatarTwinState(look('completed'), {
        consentStatus: 'rejected',
        errorCode: 'moderation_failed',
        errorMessage: 'Please make sure your consent video is under 35s.',
        status: 'failed',
      }),
    ).toEqual({
      failureCode: 'moderation_failed',
      failureMessage: 'Please make sure your consent video is under 35s.',
      status: AvatarTwinStatus.CONSENT_REJECTED,
    });
  });
});
