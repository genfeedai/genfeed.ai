import { describe, expect, it } from 'vitest';
import {
  getPostMedia,
  postPlatformLabel,
  postTitle,
  toPlainPostText,
} from './public-post.helper';

describe('post text', () => {
  it('flattens editor HTML into one line of text', () => {
    expect(toPlainPostText('<p>Ship it.</p>\n<p>Today.</p>')).toBe(
      'Ship it. Today.',
    );
  });

  it('decodes character references in editor HTML', () => {
    expect(toPlainPostText('<p>Tom &amp; Jerry&nbsp;launch</p>')).toBe(
      'Tom & Jerry launch',
    );
  });

  it.each([
    ['twitter', 'X'],
    ['YOUTUBE', 'YouTube'],
    ['unknown', null],
    [undefined, null],
  ])('labels platform %j as %j', (platform, expected) => {
    expect(postPlatformLabel(platform)).toBe(expected);
  });

  it('prefers the label, then clips the copy on a word boundary', () => {
    expect(postTitle(' Launch ', 'ignored')).toBe('Launch');
    expect(postTitle(undefined, 'Short copy')).toBe('Short copy');
    expect(
      postTitle(
        undefined,
        'Every brand needs a home for its work, and a profile on Genfeed is that home for articles, posts and media.',
      ),
    ).toBe(
      'Every brand needs a home for its work, and a profile on Genfeed is that home…',
    );
  });
});

describe('getPostMedia', () => {
  it('keeps images and videos in posting order', () => {
    expect(
      getPostMedia([
        {
          category: 'IMAGE',
          height: 800,
          id: 'img',
          ingredientUrl: 'https://cdn.genfeed.ai/img.png',
          status: 'GENERATED',
          width: 1200,
        },
        {
          category: 'VIDEO',
          id: 'vid',
          ingredientUrl: 'https://cdn.genfeed.ai/vid.mp4',
          status: 'GENERATED',
        },
        {
          category: 'GIF',
          id: 'gif',
          ingredientUrl: 'https://cdn.genfeed.ai/loop.gif',
          status: 'GENERATED',
        },
      ] as Parameters<typeof getPostMedia>[0]),
    ).toEqual([
      {
        height: 800,
        id: 'img',
        kind: 'image',
        url: 'https://cdn.genfeed.ai/img.png',
        width: 1200,
      },
      {
        height: undefined,
        id: 'vid',
        kind: 'video',
        url: 'https://cdn.genfeed.ai/vid.mp4',
        width: undefined,
      },
      {
        height: undefined,
        id: 'gif',
        kind: 'image',
        url: 'https://cdn.genfeed.ai/loop.gif',
        width: undefined,
      },
    ]);
  });

  it.each([
    ['still processing', { status: 'PROCESSING' }],
    ['failed', { status: 'FAILED' }],
    ['without a URL', { ingredientUrl: '' }],
    ['audio', { category: 'MUSIC' }],
  ])('leaves out media that is %s', (_name, override) => {
    expect(
      getPostMedia([
        {
          category: 'IMAGE',
          id: 'img',
          ingredientUrl: 'https://cdn.genfeed.ai/img.png',
          status: 'GENERATED',
          ...override,
        },
      ] as Parameters<typeof getPostMedia>[0]),
    ).toEqual([]);
  });

  it('has nothing to show for a text post', () => {
    expect(getPostMedia(undefined)).toEqual([]);
  });
});
