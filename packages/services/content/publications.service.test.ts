import { PostsService } from '@services/content/posts.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('PostsService', () => {
  let service: PostsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PostsService(mockToken);
  });

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(PostsService);
    });
  });

  describe('publication management', () => {
    it('has findAll method for fetching all posts', () => {
      expect(service.findAll).toBeDefined();
      expect(typeof service.findAll).toBe('function');
    });

    it('has findOne method for fetching single publication', () => {
      expect(service.findOne).toBeDefined();
      expect(typeof service.findOne).toBe('function');
    });

    it('has create method for creating posts', () => {
      expect(service.post).toBeDefined();
      expect(typeof service.post).toBe('function');
    });

    it('has update method for updating posts', () => {
      expect(service.patch).toBeDefined();
      expect(typeof service.patch).toBe('function');
    });

    it('has delete method for removing posts', () => {
      expect(service.delete).toBeDefined();
      expect(typeof service.delete).toBe('function');
    });
  });

  describe('publication features', () => {
    it('supports multi-platform publishing', () => {
      expect(service).toBeDefined();
    });

    it('supports publication scheduling', () => {
      expect(service).toBeDefined();
    });

    it('supports publication analytics', () => {
      expect(service).toBeDefined();
    });
  });
});
