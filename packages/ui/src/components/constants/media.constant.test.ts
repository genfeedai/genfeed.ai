import { IngredientCategory, ModelCategory } from '@genfeedai/enums';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock EnvironmentService
vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    MODELS_DEFAULT: {
      image: MODEL_KEYS.REPLICATE_FLUX_SCHNELL,
      video: MODEL_KEYS.REPLICATE_HUNYUAN,
    },
  },
}));

import { MODEL_KEYS } from '@genfeedai/constants';
import {
  getCategoryFromRoute,
  getConfigForCategoryType,
  getConfigForRoute,
  MEDIA_TYPE_CONFIGS,
} from '@ui-constants/media.constant';

describe('media.constant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('MEDIA_TYPE_CONFIGS', () => {
    it('should have config for VIDEO category', () => {
      const config = MEDIA_TYPE_CONFIGS[IngredientCategory.VIDEO];

      expect(config).toBeDefined();
      expect(config?.assetType).toBe('video');
      expect(config?.generateLabel).toBe('Generate Video');
      expect(config?.presetType).toBe(ModelCategory.VIDEO);
    });

    it('should have config for IMAGE category', () => {
      const config = MEDIA_TYPE_CONFIGS[IngredientCategory.IMAGE];

      expect(config).toBeDefined();
      expect(config?.assetType).toBe('image');
      expect(config?.generateLabel).toBe('Generate Image');
      expect(config?.presetType).toBe(ModelCategory.IMAGE);
    });

    it('should have config for MUSIC category', () => {
      const config = MEDIA_TYPE_CONFIGS[IngredientCategory.MUSIC];

      expect(config).toBeDefined();
      expect(config?.assetType).toBe('music');
      expect(config?.presetType).toBe(ModelCategory.MUSIC);
      expect(config?.defaultModel).toBe(MODEL_KEYS.REPLICATE_META_MUSICGEN);
    });

    it('should have config for TEXT category', () => {
      const config = MEDIA_TYPE_CONFIGS[IngredientCategory.TEXT];

      expect(config).toBeDefined();
      expect(config?.assetType).toBe('text');
      expect(config?.generateLabel).toBe('Generate Article');
      expect(config?.presetType).toBe(ModelCategory.TEXT);
    });

    describe('VIDEO buttons configuration', () => {
      it('should enable camera for video', () => {
        expect(
          MEDIA_TYPE_CONFIGS[IngredientCategory.VIDEO]?.buttons?.camera,
        ).toBe(true);
      });

      it('should enable sounds for video', () => {
        expect(
          MEDIA_TYPE_CONFIGS[IngredientCategory.VIDEO]?.buttons?.sounds,
        ).toBe(true);
      });

      it('should enable reference for video', () => {
        expect(
          MEDIA_TYPE_CONFIGS[IngredientCategory.VIDEO]?.buttons?.reference,
        ).toBe(true);
      });

      it('should disable fontFamily for video', () => {
        expect(
          MEDIA_TYPE_CONFIGS[IngredientCategory.VIDEO]?.buttons?.fontFamily,
        ).toBe(false);
      });
    });

    describe('IMAGE buttons configuration', () => {
      it('should disable camera for image', () => {
        expect(
          MEDIA_TYPE_CONFIGS[IngredientCategory.IMAGE]?.buttons?.camera,
        ).toBe(false);
      });

      it('should disable sounds for image', () => {
        expect(
          MEDIA_TYPE_CONFIGS[IngredientCategory.IMAGE]?.buttons?.sounds,
        ).toBe(false);
      });

      it('should enable reference for image', () => {
        expect(
          MEDIA_TYPE_CONFIGS[IngredientCategory.IMAGE]?.buttons?.reference,
        ).toBe(true);
      });

      it('should enable upload for image', () => {
        expect(
          MEDIA_TYPE_CONFIGS[IngredientCategory.IMAGE]?.buttons?.upload,
        ).toBe(true);
      });
    });

    describe('MUSIC buttons configuration', () => {
      it('should disable camera for music', () => {
        expect(
          MEDIA_TYPE_CONFIGS[IngredientCategory.MUSIC]?.buttons?.camera,
        ).toBe(false);
      });

      it('should disable format for music', () => {
        expect(
          MEDIA_TYPE_CONFIGS[IngredientCategory.MUSIC]?.buttons?.format,
        ).toBe(false);
      });

      it('should disable reference for music', () => {
        expect(
          MEDIA_TYPE_CONFIGS[IngredientCategory.MUSIC]?.buttons?.reference,
        ).toBe(false);
      });

      it('should enable model for music', () => {
        expect(
          MEDIA_TYPE_CONFIGS[IngredientCategory.MUSIC]?.buttons?.model,
        ).toBe(true);
      });
    });

    describe('TEXT buttons configuration', () => {
      it('should disable all buttons for text', () => {
        const textConfig = MEDIA_TYPE_CONFIGS[IngredientCategory.TEXT];

        expect(textConfig?.buttons?.blacklist).toBe(false);
        expect(textConfig?.buttons?.camera).toBe(false);
        expect(textConfig?.buttons?.fontFamily).toBe(false);
        expect(textConfig?.buttons?.format).toBe(false);
        expect(textConfig?.buttons?.gallery).toBe(false);
        expect(textConfig?.buttons?.model).toBe(false);
        expect(textConfig?.buttons?.mood).toBe(false);
        expect(textConfig?.buttons?.presets).toBe(false);
        expect(textConfig?.buttons?.reference).toBe(false);
        expect(textConfig?.buttons?.scene).toBe(false);
        expect(textConfig?.buttons?.sounds).toBe(false);
        expect(textConfig?.buttons?.style).toBe(false);
        expect(textConfig?.buttons?.tags).toBe(false);
        expect(textConfig?.buttons?.upload).toBe(false);
      });
    });
  });

  describe('getCategoryFromRoute', () => {
    describe('standard /studio/ routes', () => {
      it('should return IMAGE for /studio/image', () => {
        expect(getCategoryFromRoute('/studio/image')).toBe(
          IngredientCategory.IMAGE,
        );
      });

      it('should return VIDEO for /studio/video', () => {
        expect(getCategoryFromRoute('/studio/video')).toBe(
          IngredientCategory.VIDEO,
        );
      });

      it('should return MUSIC for /studio/music', () => {
        expect(getCategoryFromRoute('/studio/music')).toBe(
          IngredientCategory.MUSIC,
        );
      });

      it('should return TEXT for /studio/text', () => {
        expect(getCategoryFromRoute('/studio/text')).toBe(
          IngredientCategory.TEXT,
        );
      });

      it('should return VIDEO for /studio/avatar', () => {
        expect(getCategoryFromRoute('/studio/avatar')).toBe(
          IngredientCategory.VIDEO,
        );
      });

      it('should default to VIDEO for unknown /studio/ routes', () => {
        expect(getCategoryFromRoute('/studio/unknown')).toBe(
          IngredientCategory.VIDEO,
        );
      });
    });

    describe('legacy routes', () => {
      it('should return IMAGE for /avatars', () => {
        expect(getCategoryFromRoute('/avatars')).toBe(IngredientCategory.IMAGE);
      });

      it('should return VIDEO for /lip-sync', () => {
        expect(getCategoryFromRoute('/lip-sync')).toBe(
          IngredientCategory.VIDEO,
        );
      });

      it('should return VIDEO for /multi-image-to-video', () => {
        expect(getCategoryFromRoute('/multi-image-to-video')).toBe(
          IngredientCategory.VIDEO,
        );
      });

      it('should return IMAGE for /upscale', () => {
        expect(getCategoryFromRoute('/upscale')).toBe(IngredientCategory.IMAGE);
      });

      it('should default to VIDEO for unknown legacy routes', () => {
        expect(getCategoryFromRoute('/unknown-route')).toBe(
          IngredientCategory.VIDEO,
        );
      });
    });
  });

  describe('getConfigForCategoryType', () => {
    it('should return VIDEO config for VIDEO category', () => {
      const config = getConfigForCategoryType(IngredientCategory.VIDEO);

      expect(config.assetType).toBe('video');
      expect(config.generateLabel).toBe('Generate Video');
    });

    it('should return IMAGE config for IMAGE category', () => {
      const config = getConfigForCategoryType(IngredientCategory.IMAGE);

      expect(config.assetType).toBe('image');
      expect(config.generateLabel).toBe('Generate Image');
    });

    it('should return MUSIC config for MUSIC category', () => {
      const config = getConfigForCategoryType(IngredientCategory.MUSIC);

      expect(config.assetType).toBe('music');
    });

    it('should return TEXT config for TEXT category', () => {
      const config = getConfigForCategoryType(IngredientCategory.TEXT);

      expect(config.assetType).toBe('text');
      expect(config.generateLabel).toBe('Generate Article');
    });

    it('should fall back to VIDEO config for unknown category', () => {
      const config = getConfigForCategoryType('UNKNOWN' as IngredientCategory);

      expect(config.assetType).toBe('video');
    });
  });

  describe('getConfigForRoute', () => {
    describe('standard routes', () => {
      it('should return video config for /studio/video', () => {
        const config = getConfigForRoute('/studio/video');

        expect(config.assetType).toBe('video');
        expect(config.buttons?.camera).toBe(true);
        expect(config.buttons?.sounds).toBe(true);
      });

      it('should return image config for /studio/image', () => {
        const config = getConfigForRoute('/studio/image');

        expect(config.assetType).toBe('image');
        expect(config.buttons?.camera).toBe(false);
        expect(config.buttons?.sounds).toBe(false);
      });

      it('should return music config for /studio/music', () => {
        const config = getConfigForRoute('/studio/music');

        expect(config.assetType).toBe('music');
        expect(config.buttons?.format).toBe(false);
      });
    });

    describe('route overrides', () => {
      it('should apply overrides for /avatars', () => {
        const config = getConfigForRoute('/avatars');

        expect(config.placeholder).toBe('Describe your avatar...');
        expect(config.buttons?.format).toBe(false);
        expect(config.buttons?.gallery).toBe(false);
        expect(config.buttons?.reference).toBe(false);
        expect(config.buttons?.upload).toBe(false);
      });

      it('should apply overrides for /lip-sync', () => {
        const config = getConfigForRoute('/lip-sync');

        expect(config.placeholder).toBe('Enter the dialogue for lip-sync...');
        expect(config.buttons?.camera).toBe(false);
        expect(config.buttons?.gallery).toBe(false);
        expect(config.buttons?.sounds).toBe(false);
      });

      it('should apply overrides for /multi-image-to-video', () => {
        const config = getConfigForRoute('/multi-image-to-video');

        expect(config.placeholder).toBe(
          'Describe how to combine these images into a video...',
        );
        expect(config.buttons?.gallery).toBe(false);
        expect(config.buttons?.reference).toBe(false);
      });

      it('should apply overrides for /upscale', () => {
        const config = getConfigForRoute('/upscale');

        expect(config.placeholder).toBe('Describe enhancement preferences...');
        expect(config.buttons?.format).toBe(false);
        expect(config.buttons?.gallery).toBe(false);
        expect(config.buttons?.style).toBe(false);
      });
    });

    describe('override merging', () => {
      it('should merge override with base config', () => {
        const config = getConfigForRoute('/avatars');

        // From base IMAGE config
        expect(config.assetType).toBe('image');
        expect(config.presetType).toBe(ModelCategory.IMAGE);

        // From override
        expect(config.placeholder).toBe('Describe your avatar...');
      });

      it('should use VIDEO config as fallback for unknown routes', () => {
        const config = getConfigForRoute('/unknown-path');

        expect(config.assetType).toBe('video');
      });
    });
  });

  describe('placeholder strings', () => {
    it('should have unique placeholders for each category', () => {
      const videoConfig = MEDIA_TYPE_CONFIGS[IngredientCategory.VIDEO];
      const imageConfig = MEDIA_TYPE_CONFIGS[IngredientCategory.IMAGE];
      const musicConfig = MEDIA_TYPE_CONFIGS[IngredientCategory.MUSIC];
      const textConfig = MEDIA_TYPE_CONFIGS[IngredientCategory.TEXT];

      expect(videoConfig?.placeholder).toBe(
        'What video should we create next?',
      );
      expect(imageConfig?.placeholder).toBe(
        'Describe the image you want to create...',
      );
      expect(musicConfig?.placeholder).toBe(
        'Describe the music you want to create...',
      );
      expect(textConfig?.placeholder).toBe(
        'What article topic should we explore?',
      );
    });
  });

  describe('generateLabel strings', () => {
    it('should have appropriate labels', () => {
      expect(MEDIA_TYPE_CONFIGS[IngredientCategory.VIDEO]?.generateLabel).toBe(
        'Generate Video',
      );
      expect(MEDIA_TYPE_CONFIGS[IngredientCategory.IMAGE]?.generateLabel).toBe(
        'Generate Image',
      );
      expect(MEDIA_TYPE_CONFIGS[IngredientCategory.TEXT]?.generateLabel).toBe(
        'Generate Article',
      );
    });
  });
});
