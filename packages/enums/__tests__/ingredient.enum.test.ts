import { describe, expect, it } from 'vitest';
import {
  AssetScope,
  ContentRating,
  DarkroomAssetLabel,
  DarkroomReviewStatus,
  IngredientAvatarCategory,
  IngredientCategory,
  IngredientExtension,
  IngredientFormat,
  IngredientStatus,
  TransformationCategory,
} from '../src/ingredient.enum';

describe('ingredient.enum', () => {
  describe('IngredientCategory', () => {
    it('should have 12 members', () => {
      expect(Object.values(IngredientCategory)).toHaveLength(12);
    });

    it('should have correct values', () => {
      expect(IngredientCategory.IMAGE).toBe('image');
      expect(IngredientCategory.VIDEO).toBe('video');
      expect(IngredientCategory.MUSIC).toBe('music');
      expect(IngredientCategory.GIF).toBe('gif');
      expect(IngredientCategory.AVATAR).toBe('avatar');
      expect(IngredientCategory.AUDIO).toBe('audio');
      expect(IngredientCategory.IMAGE_EDIT).toBe('image-edit');
      expect(IngredientCategory.VIDEO_EDIT).toBe('video-edit');
      expect(IngredientCategory.VOICE).toBe('voice');
      expect(IngredientCategory.INGREDIENT).toBe('ingredient');
      expect(IngredientCategory.TEXT).toBe('text');
      expect(IngredientCategory.SOURCE).toBe('source');
    });
  });

  describe('IngredientStatus', () => {
    it('should have 8 members', () => {
      expect(Object.values(IngredientStatus)).toHaveLength(8);
    });

    it('should have correct values', () => {
      expect(IngredientStatus.DRAFT).toBe('draft');
      expect(IngredientStatus.PROCESSING).toBe('processing');
      expect(IngredientStatus.UPLOADED).toBe('uploaded');
      expect(IngredientStatus.GENERATED).toBe('generated');
      expect(IngredientStatus.VALIDATED).toBe('validated');
      expect(IngredientStatus.FAILED).toBe('failed');
      expect(IngredientStatus.ARCHIVED).toBe('archived');
      expect(IngredientStatus.REJECTED).toBe('rejected');
    });
  });

  describe('TransformationCategory', () => {
    it('should have 20 members', () => {
      expect(Object.values(TransformationCategory)).toHaveLength(20);
    });

    it('should have correct values', () => {
      expect(TransformationCategory.UPSCALED).toBe('upscaled');
      expect(TransformationCategory.RESIZED).toBe('resized');
      expect(TransformationCategory.ENHANCED).toBe('enhanced');
      expect(TransformationCategory.EXTENDED).toBe('extended');
      expect(TransformationCategory.INTERPOLATED).toBe('interpolated');
      expect(TransformationCategory.STABILIZED).toBe('stabilized');
      expect(TransformationCategory.BACKGROUND_REMOVED).toBe(
        'background-removed',
      );
      expect(TransformationCategory.STYLE_TRANSFERRED).toBe(
        'style-transferred',
      );
      expect(TransformationCategory.FACE_SWAPPED).toBe('face-swapped');
      expect(TransformationCategory.LIP_SYNCED).toBe('lip-synced');
      expect(TransformationCategory.ANIMATED).toBe('animated');
      expect(TransformationCategory.IMAGE_TO_VIDEO).toBe('image-to-video');
      expect(TransformationCategory.CLIPPED).toBe('clipped');
      expect(TransformationCategory.MERGED).toBe('merged');
      expect(TransformationCategory.EDITED).toBe('edited');
      expect(TransformationCategory.REVERSED).toBe('reversed');
      expect(TransformationCategory.MIRRORED).toBe('mirrored');
      expect(TransformationCategory.CAPTIONED).toBe('captioned');
      expect(TransformationCategory.VALIDATED).toBe('validated');
      expect(TransformationCategory.REFRAMED).toBe('reframed');
    });
  });

  describe('IngredientExtension', () => {
    it('should have 5 members', () => {
      expect(Object.values(IngredientExtension)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(IngredientExtension.JPG).toBe('jpg');
      expect(IngredientExtension.MP3).toBe('mp3');
      expect(IngredientExtension.MP4).toBe('mp4');
      expect(IngredientExtension.MOV).toBe('mov');
      expect(IngredientExtension.GIF).toBe('gif');
    });
  });

  describe('IngredientFormat', () => {
    it('should have 3 members', () => {
      expect(Object.values(IngredientFormat)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(IngredientFormat.LANDSCAPE).toBe('landscape');
      expect(IngredientFormat.PORTRAIT).toBe('portrait');
      expect(IngredientFormat.SQUARE).toBe('square');
    });
  });

  describe('IngredientAvatarCategory', () => {
    it('should have 2 members', () => {
      expect(Object.values(IngredientAvatarCategory)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(IngredientAvatarCategory.AVATAR).toBe('avatar');
      expect(IngredientAvatarCategory.AVATAR_VIDEO).toBe('avatar-video');
    });
  });

  describe('DarkroomReviewStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(DarkroomReviewStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(DarkroomReviewStatus.PENDING).toBe('pending');
      expect(DarkroomReviewStatus.APPROVED).toBe('approved');
      expect(DarkroomReviewStatus.REJECTED).toBe('rejected');
      expect(DarkroomReviewStatus.NEEDS_REVISION).toBe('needs-revision');
    });
  });

  describe('DarkroomAssetLabel', () => {
    it('should have 6 members', () => {
      expect(Object.values(DarkroomAssetLabel)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(DarkroomAssetLabel.HERO).toBe('hero');
      expect(DarkroomAssetLabel.FILLER).toBe('filler');
      expect(DarkroomAssetLabel.BTS).toBe('bts');
      expect(DarkroomAssetLabel.PROMO).toBe('promo');
      expect(DarkroomAssetLabel.LIFESTYLE).toBe('lifestyle');
      expect(DarkroomAssetLabel.EDITORIAL).toBe('editorial');
    });
  });

  describe('ContentRating', () => {
    it('should have 3 members', () => {
      expect(Object.values(ContentRating)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(ContentRating.SFW).toBe('sfw');
      expect(ContentRating.SUGGESTIVE).toBe('suggestive');
      expect(ContentRating.NSFW).toBe('nsfw');
    });
  });

  describe('AssetScope (aliased export)', () => {
    it('should be defined and have enum values', () => {
      expect(AssetScope).toBeDefined();
      expect(Object.keys(AssetScope).length).toBeGreaterThan(0);
    });
  });
});
