import { PublishErrorKind } from '@genfeedai/contracts';
import { PublishError } from '@genfeedai/contracts/interfaces';
import {
  kindFromTikTokFailReason,
  tiktokPublishFailure,
  toPublishOutcomeUnknown,
} from './tiktok-error.util';

describe('kindFromTikTokFailReason', () => {
  it.each([
    ['file_format_check_failed', PublishErrorKind.CONTENT_REJECTED],
    ['duration_check_failed', PublishErrorKind.CONTENT_REJECTED],
    ['frame_rate_check_failed', PublishErrorKind.CONTENT_REJECTED],
    ['picture_size_check_failed', PublishErrorKind.CONTENT_REJECTED],
    ['spam_risk_text', PublishErrorKind.CONTENT_REJECTED],
    ['spam_risk', PublishErrorKind.CONTENT_REJECTED],
    ['publish_cancelled', PublishErrorKind.CONTENT_REJECTED],
    ['auth_removed', PublishErrorKind.CHANNEL_DISCONNECTED],
    [
      'spam_risk_user_banned_from_posting',
      PublishErrorKind.CHANNEL_DISCONNECTED,
    ],
    ['spam_risk_too_many_posts', PublishErrorKind.RATE_LIMITED],
    ['internal', PublishErrorKind.RETRY_LATER],
    ['video_pull_failed', PublishErrorKind.RETRY_LATER],
    ['photo_pull_failed', PublishErrorKind.RETRY_LATER],
    ['a_reason_not_in_the_docs', PublishErrorKind.RETRY_LATER],
    [undefined, PublishErrorKind.RETRY_LATER],
  ])('reads %s as %s', (failReason, kind) => {
    expect(kindFromTikTokFailReason(failReason)).toBe(kind);
  });
});

describe('tiktokPublishFailure', () => {
  it('keeps the message and the fail_reason', () => {
    const error = tiktokPublishFailure('duration_check_failed');

    expect(error.message).toBe('TikTok publish failed: duration_check_failed');
    expect(error.providerCode).toBe('duration_check_failed');
    expect(error.kind).toBe(PublishErrorKind.CONTENT_REJECTED);
  });

  it('names an unknown reason', () => {
    expect(tiktokPublishFailure(undefined).message).toBe(
      'TikTok publish failed: Unknown reason',
    );
  });
});

describe('toPublishOutcomeUnknown', () => {
  it('reads a failed status poll as an unknown outcome', () => {
    const error = toPublishOutcomeUnknown(new Error('socket hang up'));

    expect(error.kind).toBe(PublishErrorKind.OUTCOME_UNKNOWN);
    expect(error.message).toBe('socket hang up');
  });

  it('keeps a failure TikTok itself reported', () => {
    const failed = new PublishError(PublishErrorKind.CONTENT_REJECTED, 'no');

    expect(toPublishOutcomeUnknown(failed)).toBe(failed);
  });
});
