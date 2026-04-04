import type {
  BaseCommentData,
  BaseVideoData,
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
});
