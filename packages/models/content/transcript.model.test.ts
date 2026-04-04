import { Transcript } from '@models/content/transcript.model';
import { describe, expect, it } from 'vitest';

describe('Transcript', () => {
  describe('constructor', () => {
    it('should create a transcript with basic fields', () => {
      const transcript = new Transcript({
        id: 'tr-123',
        organization: 'org-1',
        status: 'completed' as never,
        transcriptText: 'Hello world',
        user: 'user-1',
        youtubeId: 'abc123',
        youtubeUrl: 'https://youtube.com/watch?v=abc123',
      });
      expect(transcript.id).toBe('tr-123');
      expect(transcript.transcriptText).toBe('Hello world');
      expect(transcript.youtubeId).toBe('abc123');
    });

    it('should convert string createdAt to Date', () => {
      const transcript = new Transcript({
        createdAt: '2024-06-15T10:00:00Z' as never,
        id: 'tr-1',
      } as never);
      expect(transcript.createdAt).toBeInstanceOf(Date);
      expect(transcript.createdAt.toISOString()).toBe(
        '2024-06-15T10:00:00.000Z',
      );
    });

    it('should convert string updatedAt to Date', () => {
      const transcript = new Transcript({
        id: 'tr-2',
        updatedAt: '2024-07-20T15:30:00Z' as never,
      } as never);
      expect(transcript.updatedAt).toBeInstanceOf(Date);
    });

    it('should preserve Date objects for createdAt', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      const transcript = new Transcript({
        createdAt: date,
        id: 'tr-3',
      } as never);
      expect(transcript.createdAt).toBe(date);
    });

    it('should convert videoMetadata.publishedAt string to Date', () => {
      const transcript = new Transcript({
        id: 'tr-4',
        videoMetadata: {
          publishedAt: '2024-03-10T08:00:00Z' as never,
        },
      } as never);
      expect(transcript.videoMetadata?.publishedAt).toBeInstanceOf(Date);
    });

    it('should handle videoMetadata without publishedAt', () => {
      const transcript = new Transcript({
        id: 'tr-5',
        videoMetadata: {
          duration: 120,
          viewCount: 1000,
        },
      } as never);
      expect(transcript.videoMetadata?.duration).toBe(120);
      expect(transcript.videoMetadata?.viewCount).toBe(1000);
    });

    it('should handle missing optional fields', () => {
      const transcript = new Transcript({ id: 'tr-6' } as never);
      expect(transcript.videoTitle).toBeUndefined();
      expect(transcript.videoDuration).toBeUndefined();
      expect(transcript.language).toBeUndefined();
      expect(transcript.error).toBeUndefined();
      expect(transcript.audioFileUrl).toBeUndefined();
    });

    it('should assign all partial properties via Object.assign', () => {
      const transcript = new Transcript({
        article: 'article-1',
        id: 'tr-7',
        isDeleted: false,
        language: 'en',
        videoDuration: 300,
        videoTitle: 'Test Video',
      } as never);
      expect(transcript.article).toBe('article-1');
      expect(transcript.language).toBe('en');
      expect(transcript.videoDuration).toBe(300);
      expect(transcript.videoTitle).toBe('Test Video');
      expect(transcript.isDeleted).toBe(false);
    });
  });
});
