import type {
  BaseCommentData,
  BaseVideoData,
} from '@api/services/shared/content-normalization.util';
import {
  CommonExtractors,
  normalizeComments,
  normalizeVideos,
} from '@api/services/shared/content-normalization.util';

describe('content-normalization.util', () => {
  describe('BaseVideoData interface', () => {
    it('should accept valid video data', () => {
      const video: BaseVideoData = {
        commentCount: 5,
        creatorHandle: 'test',
        externalId: '123',
        likeCount: 100,
        platform: 'tiktok',
        shareCount: 10,
        viewCount: 1000,
      };
      expect(video.externalId).toBe('123');
    });
  });

  describe('BaseCommentData interface', () => {
    it('should accept valid comment data', () => {
      const comment: BaseCommentData = {
        authorId: 'a1',
        authorUsername: 'user1',
        createdAt: new Date(),
        id: 'c1',
        likes: 5,
        replies: 1,
        text: 'Great!',
      };
      expect(comment.id).toBe('c1');
    });
  });

  describe('normalizeVideos', () => {
    const rawVideo = {
      comments: 3,
      creator: 'creator-1',
      creatorId: 'creator-id-1',
      description: 'Description',
      id: 'video-1',
      likes: 20,
      publishedAt: '2026-07-23T10:00:00.000Z',
      shares: 4,
      thumbnail: 'https://example.com/thumbnail.jpg',
      title: 'Title',
      url: 'https://example.com/video.mp4',
      views: 100,
    };

    const requiredMapping = {
      commentCount: (raw: typeof rawVideo) => raw.comments,
      creatorHandle: (raw: typeof rawVideo) => raw.creator,
      externalId: (raw: typeof rawVideo) => raw.id,
      likeCount: (raw: typeof rawVideo) => raw.likes,
      shareCount: (raw: typeof rawVideo) => raw.shares,
      viewCount: (raw: typeof rawVideo) => raw.views,
    };

    it('maps required and optional platform fields', () => {
      expect(
        normalizeVideos(
          [rawVideo],
          {
            ...requiredMapping,
            creatorId: (raw) => raw.creatorId,
            description: (raw) => raw.description,
            publishedAt: (raw) => new Date(raw.publishedAt),
            thumbnailUrl: (raw) => raw.thumbnail,
            title: (raw) => raw.title,
            videoUrl: (raw) => raw.url,
          },
          'tiktok',
        ),
      ).toEqual([
        {
          commentCount: 3,
          creatorHandle: 'creator-1',
          creatorId: 'creator-id-1',
          description: 'Description',
          externalId: 'video-1',
          likeCount: 20,
          platform: 'tiktok',
          publishedAt: new Date('2026-07-23T10:00:00.000Z'),
          shareCount: 4,
          thumbnailUrl: 'https://example.com/thumbnail.jpg',
          title: 'Title',
          videoUrl: 'https://example.com/video.mp4',
          viewCount: 100,
        },
      ]);
    });

    it('keeps omitted optional mappings undefined', () => {
      expect(normalizeVideos([rawVideo], requiredMapping, 'youtube')).toEqual([
        expect.objectContaining({
          creatorId: undefined,
          description: undefined,
          platform: 'youtube',
          publishedAt: undefined,
          thumbnailUrl: undefined,
          title: undefined,
          videoUrl: undefined,
        }),
      ]);
    });
  });

  describe('normalizeComments', () => {
    const rawComment = {
      author: 'author-1',
      avatar: 'https://example.com/avatar.jpg',
      createdAt: '2026-07-23T10:00:00.000Z',
      id: 'comment-1',
      likes: 2,
      replies: 1,
      text: 'Useful',
      username: 'creator',
    };
    const requiredMapping = {
      authorId: (raw: typeof rawComment) => raw.author,
      authorUsername: (raw: typeof rawComment) => raw.username,
      createdAt: (raw: typeof rawComment) => new Date(raw.createdAt),
      id: (raw: typeof rawComment) => raw.id,
      likes: (raw: typeof rawComment) => raw.likes,
      replies: (raw: typeof rawComment) => raw.replies,
      text: (raw: typeof rawComment) => raw.text,
    };

    it('maps comments with and without an avatar extractor', () => {
      expect(
        normalizeComments([rawComment], {
          ...requiredMapping,
          authorAvatarUrl: (raw) => raw.avatar,
        }),
      ).toEqual([
        {
          authorAvatarUrl: 'https://example.com/avatar.jpg',
          authorId: 'author-1',
          authorUsername: 'creator',
          createdAt: new Date('2026-07-23T10:00:00.000Z'),
          id: 'comment-1',
          likes: 2,
          replies: 1,
          text: 'Useful',
        },
      ]);
      expect(normalizeComments([rawComment], requiredMapping)[0]).toMatchObject(
        {
          authorAvatarUrl: undefined,
        },
      );
    });
  });

  describe('CommonExtractors', () => {
    it('normalizes present and missing scalar values', () => {
      expect(CommonExtractors.safeNumber(0)).toBe(0);
      expect(CommonExtractors.safeNumber(null)).toBe(0);
      expect(CommonExtractors.safeString('value')).toBe('value');
      expect(CommonExtractors.safeString(undefined)).toBe('');
    });

    it('normalizes ISO and Unix dates', () => {
      expect(CommonExtractors.isoToDate('2026-07-23T10:00:00.000Z')).toEqual(
        new Date('2026-07-23T10:00:00.000Z'),
      );
      expect(CommonExtractors.isoToDate(undefined)).toBeUndefined();
      expect(CommonExtractors.unixToDate(1_753_264_800)).toEqual(
        new Date(1_753_264_800_000),
      );
      expect(CommonExtractors.unixToDate(undefined)).toBeUndefined();
    });

    it('truncates present strings and defaults missing strings', () => {
      const truncate = CommonExtractors.truncate(4);

      expect(truncate('abcdef')).toBe('abcd');
      expect(truncate(undefined)).toBe('');
    });
  });
});
