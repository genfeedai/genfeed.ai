import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA,
  DEFAULT_STYLE_MODIFIERS,
  SLIDESHOW_DIMENSIONS,
  slideshowImageBatchNodeDefinition,
} from './slideshow-image-batch';

describe('slideshow-image-batch node', () => {
  describe('SLIDESHOW_DIMENSIONS', () => {
    it('should define tiktok_portrait as 1080x1350', () => {
      expect(SLIDESHOW_DIMENSIONS.tiktok_portrait).toEqual({
        height: 1350,
        width: 1080,
      });
    });

    it('should define tiktok_square as 1080x1080', () => {
      expect(SLIDESHOW_DIMENSIONS.tiktok_square).toEqual({
        height: 1080,
        width: 1080,
      });
    });

    it('should define custom as 1080x1080', () => {
      expect(SLIDESHOW_DIMENSIONS.custom).toEqual({
        height: 1080,
        width: 1080,
      });
    });
  });

  describe('DEFAULT_STYLE_MODIFIERS', () => {
    it('should have 6 style modifiers for a 6-slide slideshow', () => {
      expect(DEFAULT_STYLE_MODIFIERS).toHaveLength(6);
    });

    it('should have non-empty modifier strings', () => {
      for (const modifier of DEFAULT_STYLE_MODIFIERS) {
        expect(modifier).toBeTruthy();
        expect(typeof modifier).toBe('string');
      }
    });
  });

  describe('DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA', () => {
    it('should have label set to Slideshow Image Batch', () => {
      expect(DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA.label).toBe(
        'Slideshow Image Batch',
      );
    });

    it('should default to idle status', () => {
      expect(DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA.status).toBe('idle');
    });

    it('should have type set to slideshowImageBatch', () => {
      expect(DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA.type).toBe(
        'slideshowImageBatch',
      );
    });

    it('should default slideCount to 6', () => {
      expect(DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA.slideCount).toBe(6);
    });

    it('should default aspectRatio to tiktok_portrait', () => {
      expect(DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA.aspectRatio).toBe(
        'tiktok_portrait',
      );
    });

    it('should include default style modifiers', () => {
      expect(DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA.styleModifiers).toEqual(
        DEFAULT_STYLE_MODIFIERS,
      );
    });

    it('should not share the same array reference as DEFAULT_STYLE_MODIFIERS', () => {
      expect(DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA.styleModifiers).not.toBe(
        DEFAULT_STYLE_MODIFIERS,
      );
    });

    it('should default nullable config fields to null', () => {
      expect(DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA.basePrompt).toBeNull();
      expect(DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA.model).toBeNull();
      expect(DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA.seed).toBeNull();
    });

    it('should default input connections to null', () => {
      expect(DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA.inputSlidePrompts).toBeNull();
      expect(DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA.inputBasePrompt).toBeNull();
    });

    it('should default output arrays to empty', () => {
      expect(DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA.outputImageUrls).toEqual([]);
      expect(DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA.outputJobIds).toEqual([]);
    });
  });

  describe('slideshowImageBatchNodeDefinition', () => {
    it('should have type slideshowImageBatch', () => {
      expect(slideshowImageBatchNodeDefinition.type).toBe(
        'slideshowImageBatch',
      );
    });

    it('should be in saas category', () => {
      expect(slideshowImageBatchNodeDefinition.category).toBe('saas');
    });

    it('should have label Slideshow Image Batch', () => {
      expect(slideshowImageBatchNodeDefinition.label).toBe(
        'Slideshow Image Batch',
      );
    });

    it('should have optional slidePrompts and basePrompt inputs', () => {
      const slidePromptsInput = slideshowImageBatchNodeDefinition.inputs.find(
        (i) => i.id === 'slidePrompts',
      );
      const basePromptInput = slideshowImageBatchNodeDefinition.inputs.find(
        (i) => i.id === 'basePrompt',
      );
      expect(slidePromptsInput?.required).toBe(false);
      expect(basePromptInput?.required).toBe(false);
    });

    it('should output multiple images', () => {
      expect(slideshowImageBatchNodeDefinition.outputs).toHaveLength(1);
      expect(slideshowImageBatchNodeDefinition.outputs[0].id).toBe('images');
      expect(slideshowImageBatchNodeDefinition.outputs[0].multiple).toBe(true);
    });

    it('should reference default data', () => {
      expect(slideshowImageBatchNodeDefinition.defaultData).toBe(
        DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA,
      );
    });
  });
});
