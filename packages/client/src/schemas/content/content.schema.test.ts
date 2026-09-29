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
  type PromptTextareaSchema,
  promptAvatarSchema,
  promptTextareaSchema,
} from '@genfeedai/client/schemas/content/prompt.schema';
import {
  ArticleCategory,
  ArticleStatus,
  AssetScope,
} from '@genfeedai/contracts';
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
    it('rejects empty label', () => {
      expect(folderSchema.safeParse({ label: '', tags: [] }).success).toBe(
        false,
      );
    });
  });

  describe('linkSchema', () => {
    it('rejects invalid URL', () => {
      expect(
        linkSchema.safeParse({
          brandId: 'b',
          category: 'c',
          label: 'L',
          url: 'bad',
        }).success,
      ).toBe(false);
    });
  });

  describe('postSchema', () => {
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
    it('requires a date before scheduling a post', () => {
      expect(
        postModalSchema.safeParse({
          credentialId: 'c',
          description: 'D',
          targetExecutionState: 'scheduled',
        }).success,
      ).toBe(false);
    });

    it('enforces the X long-post limit', () => {
      expect(
        postModalSchema.safeParse({
          credentialId: 'c',
          description: 'x'.repeat(25_001),
          format: 'long-form',
          status: 'draft',
        }).success,
      ).toBe(false);
    });
  });

  describe('postMetadataSchema', () => {
    it('accepts valid metadata', () => {
      expect(
        postMetadataSchema.safeParse({
          contentRunId: 'run-1',
          creativeVersion: 'creative-v2',
          description: 'D',
          hookVersion: 'hook-v1',
          label: 'L',
          personaId: 'persona-1',
          publishIntent: 'experiment',
          scheduledDate: '2024-01-01',
          scheduleSlot: 'morning',
          variantId: 'variant-1',
        }).success,
      ).toBe(true);
    });
  });

  describe('threadPostSchema', () => {
    it('rejects empty', () => {
      expect(threadPostSchema.safeParse({ description: '' }).success).toBe(
        false,
      );
    });
  });

  describe('threadModalSchema', () => {
    it('accepts a text-only draft before scheduling', () => {
      expect(
        threadModalSchema.safeParse({
          credentialId: 'c',
          posts: [{ description: 'Root' }, { description: 'Reply' }],
          status: 'draft',
        }).success,
      ).toBe(true);
    });

    it('rejects empty posts', () => {
      expect(
        threadModalSchema.safeParse({
          credentialId: 'c',
          ingredient: 'i',
          posts: [],
          scheduledDate: '2024-01-01',
        }).success,
      ).toBe(false);
    });

    it('requires a date before scheduling a thread', () => {
      expect(
        threadModalSchema.safeParse({
          credentialId: 'c',
          posts: [{ description: 'Root' }, { description: 'Reply' }],
          targetExecutionState: 'scheduled',
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

    // Background music moved to the Studio editor (#4683) — the video
    // generation prompt bar no longer carries these fields at all.
    it('no longer types background-music fields on the parsed prompt', () => {
      const parsed: PromptTextareaSchema = promptTextareaSchema.parse(valid);

      expect(parsed).not.toHaveProperty('musicVolume');
      expect(parsed).not.toHaveProperty('backgroundMusicMode');
      expect(parsed).not.toHaveProperty('isBackgroundMusicEnabled');
      expect(parsed).not.toHaveProperty('muteVideoAudio');
    });
  });

  describe('promptAvatarSchema', () => {
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
