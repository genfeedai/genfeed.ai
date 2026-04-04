import {
  ingredientAvatarSchema,
  ingredientCategorySchema,
  ingredientClipSchema,
  ingredientImageToVideoSchema,
  ingredientSchema,
} from '@genfeedai/client/schemas/ingredients/ingredient.schema';
import {
  metadataSchema,
  metadataWithScopeSchema,
} from '@genfeedai/client/schemas/ingredients/metadata.schema';
import { musicSchema } from '@genfeedai/client/schemas/ingredients/music.schema';
import {
  canMergeStoryboard,
  createStoryboardFrame,
  getPendingFrames,
  initializeStoryboard,
  isGenerating,
  storyboardFrameSchema,
  storyboardSchema,
} from '@genfeedai/client/schemas/ingredients/storyboard-frame.schema';
import { upscaleSchema } from '@genfeedai/client/schemas/ingredients/upscale.schema';
import {
  convertToFormData,
  videoMergeSchema,
} from '@genfeedai/client/schemas/ingredients/video-merge.schema';
import { AssetScope, IngredientFormat } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

describe('ingredient schemas', () => {
  describe('ingredientSchema', () => {
    const valid = {
      category: 'image',
      height: 1080,
      label: 'Test',
      model: 'm',
      style: 'realistic',
      text: 'Cat',
      width: 1080,
    };

    it('accepts valid', () => {
      expect(ingredientSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects empty text', () => {
      expect(ingredientSchema.safeParse({ ...valid, text: '' }).success).toBe(
        false,
      );
    });

    it('rejects zero height', () => {
      expect(ingredientSchema.safeParse({ ...valid, height: 0 }).success).toBe(
        false,
      );
    });
  });

  describe('ingredientImageToVideoSchema', () => {
    it('accepts valid', () => {
      expect(
        ingredientImageToVideoSchema.safeParse({
          category: 'video',
          model: 'm',
          style: 'c',
          text: 'A',
          transformations: ['t1'],
        }).success,
      ).toBe(true);
    });

    it('rejects empty transformations', () => {
      expect(
        ingredientImageToVideoSchema.safeParse({
          category: 'video',
          model: 'm',
          style: 'c',
          text: 'A',
          transformations: [],
        }).success,
      ).toBe(false);
    });
  });

  describe('ingredientClipSchema', () => {
    it('accepts valid URL', () => {
      expect(
        ingredientClipSchema.safeParse({ url: 'https://x.com/v.mp4' }).success,
      ).toBe(true);
    });

    it('rejects bad URL', () => {
      expect(ingredientClipSchema.safeParse({ url: 'bad' }).success).toBe(
        false,
      );
    });
  });

  describe('ingredientAvatarSchema', () => {
    it('accepts valid', () => {
      expect(
        ingredientAvatarSchema.safeParse({
          avatar: 'a',
          category: 'video',
          text: 'Hi',
          voice: 'v',
        }).success,
      ).toBe(true);
    });

    it('rejects empty voice', () => {
      expect(
        ingredientAvatarSchema.safeParse({
          avatar: 'a',
          category: 'video',
          text: 'Hi',
          voice: '',
        }).success,
      ).toBe(false);
    });
  });

  describe('ingredientCategorySchema', () => {
    it('accepts empty', () => {
      expect(ingredientCategorySchema.safeParse({}).success).toBe(true);
    });
  });

  describe('musicSchema', () => {
    it('accepts valid', () => {
      expect(
        musicSchema.safeParse({ duration: 10, prompt: 'Music' }).success,
      ).toBe(true);
    });

    it('rejects duration < 5', () => {
      expect(musicSchema.safeParse({ duration: 2, prompt: 'M' }).success).toBe(
        false,
      );
    });

    it('rejects duration > 30', () => {
      expect(musicSchema.safeParse({ duration: 60, prompt: 'M' }).success).toBe(
        false,
      );
    });
  });

  describe('upscaleSchema', () => {
    it('accepts valid', () => {
      expect(
        upscaleSchema.safeParse({ format: 'mp4', height: 1080, width: 1920 })
          .success,
      ).toBe(true);
    });

    it('rejects height < 64', () => {
      expect(
        upscaleSchema.safeParse({ format: 'mp4', height: 10, width: 1920 })
          .success,
      ).toBe(false);
    });

    it('rejects width > 4096', () => {
      expect(
        upscaleSchema.safeParse({ format: 'mp4', height: 1080, width: 5000 })
          .success,
      ).toBe(false);
    });
  });

  describe('metadataSchema', () => {
    it('accepts minimal', () => {
      expect(metadataSchema.safeParse({ tags: [] }).success).toBe(true);
    });
  });

  describe('metadataWithScopeSchema', () => {
    it('requires scope', () => {
      expect(metadataWithScopeSchema.safeParse({ tags: [] }).success).toBe(
        false,
      );
    });

    it('accepts with scope', () => {
      expect(
        metadataWithScopeSchema.safeParse({
          scope: AssetScope.ORGANIZATION,
          tags: [],
        }).success,
      ).toBe(true);
    });
  });
});

describe('storyboard-frame schema', () => {
  describe('storyboardFrameSchema', () => {
    it('accepts valid frame', () => {
      expect(
        storyboardFrameSchema.safeParse({
          duration: 5,
          id: 'f1',
          order: 0,
        }).success,
      ).toBe(true);
    });

    it('rejects duration < 3', () => {
      expect(
        storyboardFrameSchema.safeParse({
          duration: 1,
          id: 'f1',
          order: 0,
        }).success,
      ).toBe(false);
    });

    it('rejects duration > 10', () => {
      expect(
        storyboardFrameSchema.safeParse({
          duration: 15,
          id: 'f1',
          order: 0,
        }).success,
      ).toBe(false);
    });
  });

  describe('storyboardSchema', () => {
    const validFrame = { duration: 5, id: 'f1', order: 0 };
    const validStoryboard = {
      format: IngredientFormat.PORTRAIT,
      frames: [validFrame],
      height: 1920,
      isBrandingEnabled: false,
      isCaptionsEnabled: false,
      label: 'SB',
      width: 1080,
    };

    it('accepts valid storyboard', () => {
      expect(storyboardSchema.safeParse(validStoryboard).success).toBe(true);
    });

    it('rejects empty label', () => {
      expect(
        storyboardSchema.safeParse({ ...validStoryboard, label: '' }).success,
      ).toBe(false);
    });

    it('rejects height below min', () => {
      expect(
        storyboardSchema.safeParse({ ...validStoryboard, height: 100 }).success,
      ).toBe(false);
    });
  });

  describe('createStoryboardFrame', () => {
    it('creates frame with defaults', () => {
      const frame = createStoryboardFrame('img1', 'https://img.com/1.jpg', 0);
      expect(frame.imageId).toBe('img1');
      expect(frame.imageUrl).toBe('https://img.com/1.jpg');
      expect(frame.order).toBe(0);
      expect(frame.duration).toBe(5);
      expect(frame.status).toBe('pending');
      expect(frame.id).toContain('frame-');
    });

    it('creates frame with custom options', () => {
      const frame = createStoryboardFrame('img1', 'url', 1, {
        duration: 8,
        prompt: 'A scene',
      });
      expect(frame.duration).toBe(8);
      expect(frame.prompt).toBe('A scene');
    });
  });

  describe('initializeStoryboard', () => {
    it('creates portrait storyboard', () => {
      const sb = initializeStoryboard(IngredientFormat.PORTRAIT);
      expect(sb.format).toBe(IngredientFormat.PORTRAIT);
      expect(sb.width).toBe(1080);
      expect(sb.height).toBe(1920);
      expect(sb.frames).toEqual([]);
      expect(sb.label).toBe('Merged Storyboard');
    });

    it('creates landscape storyboard', () => {
      const sb = initializeStoryboard(IngredientFormat.LANDSCAPE);
      expect(sb.width).toBe(1920);
      expect(sb.height).toBe(1080);
    });
  });

  describe('canMergeStoryboard', () => {
    it('returns false for < 2 frames', () => {
      const sb = initializeStoryboard(IngredientFormat.PORTRAIT);
      sb.frames = [
        { duration: 5, id: 'f1', order: 0, status: 'completed', videoId: 'v1' },
      ];
      expect(canMergeStoryboard(sb)).toBe(false);
    });

    it('returns false if any frame not completed', () => {
      const sb = initializeStoryboard(IngredientFormat.PORTRAIT);
      sb.frames = [
        { duration: 5, id: 'f1', order: 0, status: 'completed', videoId: 'v1' },
        { duration: 5, id: 'f2', order: 1, status: 'pending' },
      ];
      expect(canMergeStoryboard(sb)).toBe(false);
    });

    it('returns true when all frames completed with videoId', () => {
      const sb = initializeStoryboard(IngredientFormat.PORTRAIT);
      sb.frames = [
        { duration: 5, id: 'f1', order: 0, status: 'completed', videoId: 'v1' },
        { duration: 5, id: 'f2', order: 1, status: 'completed', videoId: 'v2' },
      ];
      expect(canMergeStoryboard(sb)).toBe(true);
    });
  });

  describe('getPendingFrames', () => {
    it('returns frames that are pending with valid prompt', () => {
      const sb = initializeStoryboard(IngredientFormat.PORTRAIT);
      sb.frames = [
        {
          duration: 5,
          id: 'f1',
          order: 0,
          prompt: 'A long enough prompt',
          status: 'pending',
        },
        { duration: 5, id: 'f2', order: 1, prompt: 'short', status: 'pending' },
        {
          duration: 5,
          id: 'f3',
          order: 2,
          prompt: 'Also a long prompt text',
          status: 'completed',
          videoId: 'v',
        },
      ];
      const pending = getPendingFrames(sb);
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('f1');
    });
  });

  describe('isGenerating', () => {
    it('returns false when no frames generating', () => {
      const sb = initializeStoryboard(IngredientFormat.PORTRAIT);
      sb.frames = [{ duration: 5, id: 'f1', order: 0, status: 'pending' }];
      expect(isGenerating(sb)).toBe(false);
    });

    it('returns true when a frame is generating', () => {
      const sb = initializeStoryboard(IngredientFormat.PORTRAIT);
      sb.frames = [{ duration: 5, id: 'f1', order: 0, status: 'generating' }];
      expect(isGenerating(sb)).toBe(true);
    });
  });
});

describe('video-merge schema', () => {
  describe('videoMergeSchema', () => {
    const valid = {
      format: IngredientFormat.PORTRAIT,
      frames: [
        { id: 'v1', url: 'https://x.com/1.mp4' },
        { id: 'v2', url: 'https://x.com/2.mp4' },
      ],
      height: 1920,
      isCaptionsEnabled: false,
      label: 'Merge',
      width: 1080,
    };

    it('accepts valid', () => {
      expect(videoMergeSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects < 2 frames', () => {
      expect(
        videoMergeSchema.safeParse({
          ...valid,
          frames: [{ id: 'v1', url: 'https://x.com/1.mp4' }],
        }).success,
      ).toBe(false);
    });
  });

  describe('convertToFormData', () => {
    it('converts videos to form data with defaults', () => {
      const result = convertToFormData([
        { id: 'v1', url: 'https://x.com/1.mp4' },
        { id: 'v2', url: 'https://x.com/2.mp4' },
      ]);
      expect(result.format).toBe(IngredientFormat.PORTRAIT);
      expect(result.frames).toHaveLength(2);
      expect(result.label).toBe('Merged Storyboard');
      expect(result.isCaptionsEnabled).toBe(false);
    });

    it('uses custom options', () => {
      const result = convertToFormData(
        [
          { id: 'v1', url: 'https://x.com/1.mp4' },
          { id: 'v2', url: 'https://x.com/2.mp4' },
        ],
        {
          format: IngredientFormat.LANDSCAPE,
          isCaptionsEnabled: true,
          label: 'Custom',
        },
      );
      expect(result.format).toBe(IngredientFormat.LANDSCAPE);
      expect(result.label).toBe('Custom');
      expect(result.isCaptionsEnabled).toBe(true);
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
    });
  });
});
