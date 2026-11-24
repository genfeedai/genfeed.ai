import { parseYoutubeChannelInput } from '@api/endpoints/public/utils/youtube-channel-input.util';
import { describe, expect, it } from 'vitest';

const CHANNEL_ID = 'UCabcdefghijklmnopqrstuv';

describe('parseYoutubeChannelInput', () => {
  it.each([
    ['https://www.youtube.com/@MrBeast', '@MrBeast'],
    ['https://youtube.com/@MrBeast/videos', '@MrBeast'],
    ['m.youtube.com/@mr.beast_6000', '@mr.beast_6000'],
    ['@MrBeast', '@MrBeast'],
    ['  @MrBeast  ', '@MrBeast'],
    [`https://www.youtube.com/channel/${CHANNEL_ID}`, CHANNEL_ID],
    [`https://www.youtube.com/channel/${CHANNEL_ID}/videos`, CHANNEL_ID],
    [CHANNEL_ID, CHANNEL_ID],
  ])('reads %s as %s', (input, expected) => {
    expect(parseYoutubeChannelInput(input)).toBe(expected);
  });

  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/c/legacyname',
    'https://www.youtube.com/user/legacyname',
    'https://example.com/@MrBeast',
    'https://youtube.com.evil.test/@MrBeast',
    'ftp://youtube.com/@MrBeast',
    'MrBeast',
    '@ab',
    '',
  ])('rejects %s', (input) => {
    expect(parseYoutubeChannelInput(input)).toBeNull();
  });
});
