import {
  isYoutubeCommentsDisabledError,
  isYoutubeVideoMissingError,
} from '@api/services/integrations/youtube/services/modules/youtube-api-failure.util';
import { describe, expect, it } from 'vitest';

describe('isYoutubeVideoMissingError', () => {
  it.each([
    ['a 404 response', { response: { status: 404 } }, true],
    ['a top-level 404 status', { status: 404 }, true],
    ['a videoNotFound reason', { errors: [{ reason: 'videoNotFound' }] }, true],
    [
      'a nested videoNotFound reason',
      {
        response: {
          data: { error: { errors: [{ reason: 'videoNotFound' }] } },
          status: 400,
        },
      },
      true,
    ],
    ['a quota failure', { errors: [{ reason: 'quotaExceeded' }] }, false],
    ['a 401 response', { response: { status: 401 } }, false],
    ['a string', 'boom', false],
    ['null', null, false],
  ])('classifies %s', (_label, error, expected) => {
    expect(isYoutubeVideoMissingError(error)).toBe(expected);
  });
});

describe('isYoutubeCommentsDisabledError', () => {
  it.each([
    [
      'a commentsDisabled reason',
      { errors: [{ reason: 'commentsDisabled' }] },
      true,
    ],
    [
      'the disabled-comments message on a 403',
      {
        message:
          'The video identified by the videoId parameter has disabled comments.',
        response: { status: 403 },
      },
      true,
    ],
    [
      'the same message without a 403',
      { message: 'has disabled comments', response: { status: 500 } },
      false,
    ],
    ['a quota failure', { errors: [{ reason: 'quotaExceeded' }] }, false],
    ['a string', 'boom', false],
    ['null', null, false],
  ])('classifies %s', (_label, error, expected) => {
    expect(isYoutubeCommentsDisabledError(error)).toBe(expected);
  });
});
