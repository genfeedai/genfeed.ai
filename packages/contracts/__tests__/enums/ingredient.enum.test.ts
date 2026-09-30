import { describe, expect, it } from 'vitest';
import {
  AssetScope,
  ContentRating,
  FleetAssetLabel,
  FleetReviewStatus,
  IngredientAvatarCategory,
  IngredientCategory,
  IngredientExtension,
  IngredientFormat,
  IngredientStatus,
  TransformationCategory,
} from '../../src/enums/ingredient.enum';

describe('ingredient.enum', () => {
  describe('IngredientCategory', () => {
    it('should have 12 members', () => {
      expect(Object.values(IngredientCategory)).toHaveLength(12);
    });

    it('should have correct values', () => {
      expect(IngredientCategory.IMAGE).toBe('IMAGE');
      expect(IngredientCategory.VIDEO).toBe('VIDEO');
      expect(IngredientCategory.MUSIC).toBe('MUSIC');
      expect(IngredientCategory.GIF).toBe('GIF');
      expect(IngredientCategory.AVATAR).toBe('AVATAR');
      expect(IngredientCategory.AUDIO).toBe('AUDIO');
      expect(IngredientCategory.IMAGE_EDIT).toBe('IMAGE_EDIT');
      expect(IngredientCategory.VIDEO_EDIT).toBe('VIDEO_EDIT');
      expect(IngredientCategory.VOICE).toBe('VOICE');
      expect(IngredientCategory.INGREDIENT).toBe('INGREDIENT');
      expect(IngredientCategory.TEXT).toBe('TEXT');
      expect(IngredientCategory.SOURCE).toBe('SOURCE');
    });
  });

  describe('IngredientStatus', () => {
    it('should have 8 members', () => {
      expect(Object.values(IngredientStatus)).toHaveLength(8);
    });

    it('matches Prisma IngredientStatus SCREAMING_SNAKE labels', () => {
      expect(Object.values(IngredientStatus)).toEqual([
        'DRAFT',
        'PROCESSING',
        'UPLOADED',
        'GENERATED',
        'VALIDATED',
        'FAILED',
        'ARCHIVED',
        'REJECTED',
      ]);
    });
  });

  describe('TransformationCategory', () => {
    it('should have 20 members', () => {
      expect(Object.values(TransformationCategory)).toHaveLength(20);
    });

    it('should have correct values', () => {
      expect(TransformationCategory.UPSCALED).toBe('UPSCALED');
      expect(TransformationCategory.RESIZED).toBe('RESIZED');
      expect(TransformationCategory.ENHANCED).toBe('ENHANCED');
      expect(TransformationCategory.EXTENDED).toBe('EXTENDED');
      expect(TransformationCategory.INTERPOLATED).toBe('INTERPOLATED');
      expect(TransformationCategory.STABILIZED).toBe('STABILIZED');
      expect(TransformationCategory.BACKGROUND_REMOVED).toBe(
        'BACKGROUND_REMOVED',
      );
      expect(TransformationCategory.STYLE_TRANSFERRED).toBe(
        'STYLE_TRANSFERRED',
      );
      expect(TransformationCategory.FACE_SWAPPED).toBe('FACE_SWAPPED');
      expect(TransformationCategory.LIP_SYNCED).toBe('LIP_SYNCED');
      expect(TransformationCategory.ANIMATED).toBe('ANIMATED');
      expect(TransformationCategory.IMAGE_TO_VIDEO).toBe('IMAGE_TO_VIDEO');
      expect(TransformationCategory.CLIPPED).toBe('CLIPPED');
      expect(TransformationCategory.MERGED).toBe('MERGED');
      expect(TransformationCategory.EDITED).toBe('EDITED');
      expect(TransformationCategory.REVERSED).toBe('REVERSED');
      expect(TransformationCategory.MIRRORED).toBe('MIRRORED');
      expect(TransformationCategory.CAPTIONED).toBe('CAPTIONED');
      expect(TransformationCategory.VALIDATED).toBe('VALIDATED');
      expect(TransformationCategory.REFRAMED).toBe('REFRAMED');
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

  describe('FleetReviewStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(FleetReviewStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(FleetReviewStatus.PENDING).toBe('PENDING');
      expect(FleetReviewStatus.APPROVED).toBe('APPROVED');
      expect(FleetReviewStatus.REJECTED).toBe('REJECTED');
      expect(FleetReviewStatus.NEEDS_REVISION).toBe('NEEDS_REVISION');
    });
  });

  describe('FleetAssetLabel', () => {
    it('should have 6 members', () => {
      expect(Object.values(FleetAssetLabel)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(FleetAssetLabel.HERO).toBe('HERO');
      expect(FleetAssetLabel.FILLER).toBe('FILLER');
      expect(FleetAssetLabel.BTS).toBe('BTS');
      expect(FleetAssetLabel.PROMO).toBe('PROMO');
      expect(FleetAssetLabel.LIFESTYLE).toBe('LIFESTYLE');
      expect(FleetAssetLabel.EDITORIAL).toBe('EDITORIAL');
    });
  });

  describe('ContentRating', () => {
    it('should have 3 members', () => {
      expect(Object.values(ContentRating)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(ContentRating.SFW).toBe('SFW');
      expect(ContentRating.SUGGESTIVE).toBe('SUGGESTIVE');
      expect(ContentRating.NSFW).toBe('NSFW');
    });
  });

  describe('AssetScope (aliased export)', () => {
    it('should be defined and have enum values', () => {
      expect(AssetScope).toBeDefined();
      expect(Object.keys(AssetScope).length).toBeGreaterThan(0);
    });
  });
});
