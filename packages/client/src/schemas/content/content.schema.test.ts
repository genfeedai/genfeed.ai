import {
  articleFormSchema,
  articleModalSchema,
} from '@genfeedai/client/schemas/content/article.schema';
import { folderSchema } from '@genfeedai/client/schemas/content/folder.schema';
import { linkSchema } from '@genfeedai/client/schemas/content/link.schema';
import {
  multiPostSchema,
  postMetadataSchema,
  postModalSchema,
  postSchema,
  threadModalSchema,
  threadPostSchema,
} from '@genfeedai/client/schemas/content/post.schema';
import {
  promptAvatarSchema,
  promptTextareaSchema,
} from '@genfeedai/client/schemas/content/prompt.schema';
import { ArticleCategory, ArticleStatus, AssetScope } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

describe('content schemas', () => {
  describe('articleFormSchema', () => {
    const valid = {
      content: 'Content',
      label: 'Title',
      scope: AssetScope.ORGANIZATION,
      slug: 'my-article',
      status: ArticleStatus.DRAFT,
      summary: 'Summary',
      type: ArticleCategory.POST,
    };

    it('accepts valid article', () => {
      expect(articleFormSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects empty content', () => {
      expect(
        articleFormSchema.safeParse({ ...valid, content: '' }).success,
      ).toBe(false);
    });

    it('rejects invalid slug', () => {
      expect(
        articleFormSchema.safeParse({ ...valid, slug: 'BAD SLUG' }).success,
      ).toBe(false);
    });

    it('rejects slug over 200 chars', () => {
      expect(
        articleFormSchema.safeParse({ ...valid, slug: 'a'.repeat(201) })
          .success,
      ).toBe(false);
    });

    it('rejects summary over 500 chars', () => {
      expect(
        articleFormSchema.safeParse({ ...valid, summary: 'a'.repeat(501) })
          .success,
      ).toBe(false);
    });
  });

  describe('articleModalSchema', () => {
    it('accepts empty object', () => {
      expect(articleModalSchema.safeParse({}).success).toBe(true);
    });
  });

  describe('folderSchema', () => {
    it('accepts valid folder', () => {
      expect(
        folderSchema.safeParse({ label: 'Folder', tags: [] }).success,
      ).toBe(true);
    });

    it('rejects empty label', () => {
      expect(folderSchema.safeParse({ label: '', tags: [] }).success).toBe(
        false,
      );
    });
  });

  describe('linkSchema', () => {
    it('accepts valid link', () => {
      expect(
        linkSchema.safeParse({
          brand: 'b',
          category: 'c',
          label: 'L',
          url: 'https://example.com',
        }).success,
      ).toBe(true);
    });

    it('rejects invalid URL', () => {
      expect(
        linkSchema.safeParse({
          brand: 'b',
          category: 'c',
          label: 'L',
          url: 'bad',
        }).success,
      ).toBe(false);
    });
  });

  describe('postSchema', () => {
    it('accepts valid post', () => {
      expect(
        postSchema.safeParse({
          description: 'D',
          label: 'L',
          scheduledDate: '2024-01-01',
        }).success,
      ).toBe(true);
    });

    it('rejects empty description', () => {
      expect(
        postSchema.safeParse({
          description: '',
          label: 'L',
          scheduledDate: '2024-01-01',
        }).success,
      ).toBe(false);
    });
  });

  describe('multiPostSchema', () => {
    it('accepts valid multi-post', () => {
      expect(
        multiPostSchema.safeParse({
          platforms: [],
          youtubeStatus: 'public',
        }).success,
      ).toBe(true);
    });
  });

  describe('postModalSchema', () => {
    it('accepts valid data', () => {
      expect(
        postModalSchema.safeParse({
          credential: 'c',
          description: 'D',
        }).success,
      ).toBe(true);
    });

    it('rejects empty credential', () => {
      expect(
        postModalSchema.safeParse({
          credential: '',
          description: 'D',
        }).success,
      ).toBe(false);
    });
  });

  describe('postMetadataSchema', () => {
    it('accepts valid metadata', () => {
      expect(
        postMetadataSchema.safeParse({
          description: 'D',
          label: 'L',
          scheduledDate: '2024-01-01',
        }).success,
      ).toBe(true);
    });
  });

  describe('threadPostSchema', () => {
    it('accepts valid', () => {
      expect(
        threadPostSchema.safeParse({ description: 'Content' }).success,
      ).toBe(true);
    });

    it('rejects empty', () => {
      expect(threadPostSchema.safeParse({ description: '' }).success).toBe(
        false,
      );
    });
  });

  describe('threadModalSchema', () => {
    it('accepts valid thread', () => {
      expect(
        threadModalSchema.safeParse({
          credential: 'c',
          ingredient: 'i',
          posts: [{ description: 'P' }],
          scheduledDate: '2024-01-01',
        }).success,
      ).toBe(true);
    });

    it('rejects empty posts', () => {
      expect(
        threadModalSchema.safeParse({
          credential: 'c',
          ingredient: 'i',
          posts: [],
          scheduledDate: '2024-01-01',
        }).success,
      ).toBe(false);
    });
  });

  describe('promptTextareaSchema', () => {
    const valid = {
      blacklist: [],
      brand: 'b',
      category: 'image',
      fontFamily: 'Arial',
      format: 'square',
      height: 1080,
      models: ['m'],
      quality: 'standard' as const,
      sounds: [],
      style: 'realistic',
      tags: [],
      text: 'Generate',
      width: 1080,
    };

    it('accepts valid prompt', () => {
      expect(promptTextareaSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects empty text', () => {
      expect(
        promptTextareaSchema.safeParse({ ...valid, text: '' }).success,
      ).toBe(false);
    });

    it('rejects invalid quality', () => {
      expect(
        promptTextareaSchema.safeParse({ ...valid, quality: 'bad' }).success,
      ).toBe(false);
    });

    it('rejects musicVolume over 100', () => {
      expect(
        promptTextareaSchema.safeParse({ ...valid, musicVolume: 150 }).success,
      ).toBe(false);
    });
  });

  describe('promptAvatarSchema', () => {
    it('accepts valid', () => {
      expect(
        promptAvatarSchema.safeParse({
          avatarId: 'a',
          category: 'video',
          isCaptionEnabled: true,
          text: 'Hello',
          voiceId: 'v',
        }).success,
      ).toBe(true);
    });

    it('rejects empty avatarId (whitespace only)', () => {
      expect(
        promptAvatarSchema.safeParse({
          avatarId: '  ',
          category: 'video',
          isCaptionEnabled: true,
          text: 'Hello',
          voiceId: 'v',
        }).success,
      ).toBe(false);
    });
  });
});
