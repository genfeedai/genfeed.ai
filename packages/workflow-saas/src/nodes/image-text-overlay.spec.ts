import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMAGE_TEXT_OVERLAY_DATA,
  DEFAULT_TEXT_OVERLAY_STYLE,
  imageTextOverlayNodeDefinition,
} from './image-text-overlay';

describe('image-text-overlay node', () => {
  describe('DEFAULT_TEXT_OVERLAY_STYLE', () => {
    it('should use white text with black stroke for contrast', () => {
      expect(DEFAULT_TEXT_OVERLAY_STYLE.color).toBe('#FFFFFF');
      expect(DEFAULT_TEXT_OVERLAY_STYLE.strokeColor).toBe('#000000');
    });

    it('should default to center position and alignment', () => {
      expect(DEFAULT_TEXT_OVERLAY_STYLE.position).toBe('center');
      expect(DEFAULT_TEXT_OVERLAY_STYLE.alignment).toBe('center');
    });

    it('should use Montserrat font at 72px black weight', () => {
      expect(DEFAULT_TEXT_OVERLAY_STYLE.fontFamily).toBe('Montserrat');
      expect(DEFAULT_TEXT_OVERLAY_STYLE.fontSize).toBe(72);
      expect(DEFAULT_TEXT_OVERLAY_STYLE.fontWeight).toBe('black');
    });

    it('should have reasonable padding and max width', () => {
      expect(DEFAULT_TEXT_OVERLAY_STYLE.paddingX).toBe(40);
      expect(DEFAULT_TEXT_OVERLAY_STYLE.paddingY).toBe(60);
      expect(DEFAULT_TEXT_OVERLAY_STYLE.maxWidthPercent).toBe(90);
    });

    it('should have lineHeight and strokeWidth set', () => {
      expect(DEFAULT_TEXT_OVERLAY_STYLE.lineHeight).toBe(1.2);
      expect(DEFAULT_TEXT_OVERLAY_STYLE.strokeWidth).toBe(3);
    });
  });

  describe('DEFAULT_IMAGE_TEXT_OVERLAY_DATA', () => {
    it('should have label set to Image Text Overlay', () => {
      expect(DEFAULT_IMAGE_TEXT_OVERLAY_DATA.label).toBe('Image Text Overlay');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_IMAGE_TEXT_OVERLAY_DATA.status).toBe('idle');
    });

    it('should have type set to imageTextOverlay', () => {
      expect(DEFAULT_IMAGE_TEXT_OVERLAY_DATA.type).toBe('imageTextOverlay');
    });

    it('should default slideIndex to 0', () => {
      expect(DEFAULT_IMAGE_TEXT_OVERLAY_DATA.slideIndex).toBe(0);
    });

    it('should include the default text overlay style', () => {
      expect(DEFAULT_IMAGE_TEXT_OVERLAY_DATA.style).toEqual(
        DEFAULT_TEXT_OVERLAY_STYLE,
      );
    });

    it('should default input and output fields to null', () => {
      expect(DEFAULT_IMAGE_TEXT_OVERLAY_DATA.inputImageUrl).toBeNull();
      expect(DEFAULT_IMAGE_TEXT_OVERLAY_DATA.inputText).toBeNull();
      expect(DEFAULT_IMAGE_TEXT_OVERLAY_DATA.outputImageUrl).toBeNull();
      expect(DEFAULT_IMAGE_TEXT_OVERLAY_DATA.jobId).toBeNull();
    });
  });

  describe('imageTextOverlayNodeDefinition', () => {
    it('should have type imageTextOverlay', () => {
      expect(imageTextOverlayNodeDefinition.type).toBe('imageTextOverlay');
    });

    it('should be in saas category', () => {
      expect(imageTextOverlayNodeDefinition.category).toBe('saas');
    });

    it('should have label Image Text Overlay', () => {
      expect(imageTextOverlayNodeDefinition.label).toBe('Image Text Overlay');
    });

    it('should require image and text inputs', () => {
      const imageInput = imageTextOverlayNodeDefinition.inputs.find(
        (i) => i.id === 'image',
      );
      const textInput = imageTextOverlayNodeDefinition.inputs.find(
        (i) => i.id === 'text',
      );
      expect(imageInput?.required).toBe(true);
      expect(textInput?.required).toBe(true);
    });

    it('should output a single image', () => {
      expect(imageTextOverlayNodeDefinition.outputs).toHaveLength(1);
      expect(imageTextOverlayNodeDefinition.outputs[0].id).toBe('image');
      expect(imageTextOverlayNodeDefinition.outputs[0].type).toBe('image');
    });

    it('should reference default data', () => {
      expect(imageTextOverlayNodeDefinition.defaultData).toBe(
        DEFAULT_IMAGE_TEXT_OVERLAY_DATA,
      );
    });
  });
});
