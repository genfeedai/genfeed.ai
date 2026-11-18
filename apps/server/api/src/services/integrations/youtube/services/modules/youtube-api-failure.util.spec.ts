import { isYoutubeVideoMissingError } from '@api/services/integrations/youtube/services/modules/youtube-api-failure.util';
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
