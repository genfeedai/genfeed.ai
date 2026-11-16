import {
  parseYoutubeUploadsPlaylistPage,
  parseYoutubeVideoVerificationItems,
  YOUTUBE_VERIFICATION_PAGE_SIZE,
} from '@api/services/integrations/publishers/publisher-youtube-verification-pages.util';
import { describe, expect, it } from 'vitest';

const startedAt = new Date('2026-10-03T10:00:00.500Z');

function entry(videoId: string, publishedAt: string) {
  return {
    contentDetails: { videoId },
    snippet: { publishedAt },
  };
}

describe('parseYoutubeUploadsPlaylistPage', () => {
  it('keeps only the uploads since the attempt began', () => {
    const page = parseYoutubeUploadsPlaylistPage(
      {
        items: [
          entry('new', '2026-10-03T10:00:03Z'),
          entry('boundary', '2026-10-03T10:00:00Z'),
          entry('old', '2026-10-03T09:00:00Z'),
        ],
      },
      startedAt,
    );
    expect(page).toEqual({
      entries: [
        { uploadedAt: new Date('2026-10-03T10:00:03Z'), videoId: 'new' },
        { uploadedAt: new Date('2026-10-03T10:00:00Z'), videoId: 'boundary' },
      ],
      nextCursor: null,
    });
  });

  it('follows the page token while the page reaches into the window', () => {
    const page = parseYoutubeUploadsPlaylistPage(
      {
        items: [entry('new', '2026-10-03T10:00:03Z')],
        nextPageToken: 'CAUQAA',
      },
      startedAt,
    );
    expect(page.nextCursor).toBe('CAUQAA');
  });

  it('stops once a page holds nothing since the attempt', () => {
    const page = parseYoutubeUploadsPlaylistPage(
      {
        items: [entry('old', '2026-10-03T09:00:00Z')],
        nextPageToken: 'CAUQAA',
      },
      startedAt,
    );
    expect(page).toEqual({ entries: [], nextCursor: null });
  });

  it('reads an empty uploads playlist as no uploads', () => {
    expect(parseYoutubeUploadsPlaylistPage({ items: [] }, startedAt)).toEqual({
      entries: [],
      nextCursor: null,
    });
  });

  it('refuses a page that is not newest first', () => {
    expect(() =>
      parseYoutubeUploadsPlaylistPage(
        {
          items: [
            entry('a', '2026-10-03T09:00:00Z'),
            entry('b', '2026-10-03T10:00:03Z'),
          ],
        },
        startedAt,
      ),
    ).toThrow('not newest first');
  });

  it('refuses an empty page that still offers a next page', () => {
    expect(() =>
      parseYoutubeUploadsPlaylistPage(
        { items: [], nextPageToken: 'CAUQAA' },
        startedAt,
      ),
    ).toThrow('Incomplete YouTube verification pagination');
  });

  it('refuses a page larger than requested', () => {
    const items = Array.from(
      { length: YOUTUBE_VERIFICATION_PAGE_SIZE + 1 },
      (_, i) => entry(`v${i}`, '2026-10-03T10:00:03Z'),
    );
    expect(() => parseYoutubeUploadsPlaylistPage({ items }, startedAt)).toThrow(
      'Incomplete YouTube verification pagination',
    );
  });
});

describe('parseYoutubeVideoVerificationItems', () => {
  const entries = [
    { uploadedAt: new Date('2026-10-03T10:00:03Z'), videoId: 'abc' },
  ];

  it('joins an upload with its title, description and processing state', () => {
    expect(
      parseYoutubeVideoVerificationItems(entries, {
        items: [
          {
            id: 'abc',
            snippet: { description: 'About it', title: 'My video' },
            status: { privacyStatus: 'private', uploadStatus: 'uploaded' },
          },
        ],
      }),
    ).toEqual([
      {
        createdAt: new Date('2026-10-03T10:00:03Z'),
        hasMedia: true,
        id: 'abc',
        isReply: false,
        mediaCount: 1,
        mediaKind: 'video',
        status: 'uploaded',
        text: 'About it',
        title: 'My video',
        visibility: 'private',
      },
    ]);
  });

  it('refuses an upload the video lookup did not return', () => {
    expect(() =>
      parseYoutubeVideoVerificationItems(entries, { items: [] }),
    ).toThrow('Incomplete YouTube video evidence');
  });
});
