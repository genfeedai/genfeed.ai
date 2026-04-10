import { IngredientFormat } from '@genfeedai/enums';
// Import after enums
import {
  ALL_PROMPT_CONFIG_PARAMS,
  buildUsePromptUrl,
  clearPromptConfigFromSession,
  clearPromptConfigFromUrl,
  PROMPT_STORAGE_KEY,
  parsePromptConfigFromParams,
  persistPromptConfigToSession,
  readPromptConfigFromSession,
  serializePromptConfigToParams,
} from '@utils/url/prompt-config-url.util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('prompt-config-url.util', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear sessionStorage before each test
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.clear();
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.clear();
    }
  });

  describe('serializePromptConfigToParams', () => {
    it('should serialize string params', () => {
      const config = {
        format: IngredientFormat.LANDSCAPE,
        style: 'cinematic',
        text: 'A beautiful sunset',
      };

      const params = serializePromptConfigToParams(config);

      expect(params.get('text')).toBe('A beautiful sunset');
      expect(params.get('format')).toBe(IngredientFormat.LANDSCAPE);
      expect(params.get('style')).toBe('cinematic');
    });

    it('should serialize number params', () => {
      const config = {
        duration: 8,
        height: 1080,
        outputs: 4,
        seed: 12345,
        width: 1920,
      };

      const params = serializePromptConfigToParams(config);

      expect(params.get('width')).toBe('1920');
      expect(params.get('height')).toBe('1080');
      expect(params.get('duration')).toBe('8');
      expect(params.get('seed')).toBe('12345');
      expect(params.get('outputs')).toBe('4');
    });

    it('should serialize boolean params as 1/0', () => {
      const config = {
        isAudioEnabled: false,
        isBrandingEnabled: true,
      };

      const params = serializePromptConfigToParams(config);

      expect(params.get('brandingMode')).toBe('brand');
      expect(params.get('isAudioEnabled')).toBe('0');
    });

    it('should serialize array params as comma-separated', () => {
      const config = {
        models: ['flux-1.1', 'sdxl'],
        references: ['ref_1', 'ref_2', 'ref_3'],
        tags: ['nature', 'sunset', 'landscape'],
      };

      const params = serializePromptConfigToParams(config);

      expect(params.get('models')).toBe('flux-1.1,sdxl');
      expect(params.get('references')).toBe('ref_1,ref_2,ref_3');
      expect(params.get('tags')).toBe('nature,sunset,landscape');
    });

    it('should skip empty arrays', () => {
      const config = {
        models: [],
        text: 'Test',
      };

      const params = serializePromptConfigToParams(config);

      expect(params.has('models')).toBe(false);
      expect(params.get('text')).toBe('Test');
    });

    it('should skip undefined values', () => {
      const config = {
        style: undefined,
        text: 'Test',
      };

      const params = serializePromptConfigToParams(config);

      expect(params.has('style')).toBe(false);
      expect(params.get('text')).toBe('Test');
    });

    it('should skip null values', () => {
      const config = {
        mood: null,
        text: 'Test',
      };

      const params = serializePromptConfigToParams(config as any);

      expect(params.has('mood')).toBe(false);
      expect(params.get('text')).toBe('Test');
    });

    it('should skip empty string values', () => {
      const config = {
        camera: '',
        text: 'Test',
      };

      const params = serializePromptConfigToParams(config);

      expect(params.has('camera')).toBe(false);
      expect(params.get('text')).toBe('Test');
    });

    it('should handle empty config', () => {
      const params = serializePromptConfigToParams({});

      expect(params.toString()).toBe('');
    });
  });

  describe('parsePromptConfigFromParams', () => {
    it('should parse string params', () => {
      const params = new URLSearchParams();
      params.set('text', 'A beautiful sunset');
      params.set('format', IngredientFormat.PORTRAIT);
      params.set('style', 'cinematic');

      const config = parsePromptConfigFromParams(params);

      expect(config.text).toBe('A beautiful sunset');
      expect(config.format).toBe(IngredientFormat.PORTRAIT);
      expect(config.style).toBe('cinematic');
    });

    it('should parse number params', () => {
      const params = new URLSearchParams();
      params.set('width', '1920');
      params.set('height', '1080');
      params.set('duration', '12');

      const config = parsePromptConfigFromParams(params);

      expect(config.width).toBe(1920);
      expect(config.height).toBe(1080);
      expect(config.duration).toBe(12);
    });

    it('should parse boolean params from 1/0', () => {
      const params = new URLSearchParams();
      params.set('isBrandingEnabled', '1');
      params.set('isAudioEnabled', '0');

      const config = parsePromptConfigFromParams(params);

      expect(config.isBrandingEnabled).toBe(true);
      expect(config.isAudioEnabled).toBe(false);
    });

    it('should parse boolean params from true/false', () => {
      const params = new URLSearchParams();
      params.set('isBrandingEnabled', 'true');
      params.set('isAudioEnabled', 'false');

      const config = parsePromptConfigFromParams(params);

      expect(config.isBrandingEnabled).toBe(true);
      expect(config.isAudioEnabled).toBe(false);
    });

    it('should parse array params from comma-separated', () => {
      const params = new URLSearchParams();
      params.set('models', 'flux-1.1,sdxl,dalle3');
      params.set('references', 'ref_1,ref_2');

      const config = parsePromptConfigFromParams(params);

      expect(config.models).toEqual(['flux-1.1', 'sdxl', 'dalle3']);
      expect(config.references).toEqual(['ref_1', 'ref_2']);
    });

    it('should handle empty arrays', () => {
      const params = new URLSearchParams();
      // models not set

      const config = parsePromptConfigFromParams(params);

      expect(config.models).toBeUndefined();
    });

    it('should handle invalid number params', () => {
      const params = new URLSearchParams();
      params.set('width', 'not-a-number');

      const config = parsePromptConfigFromParams(params);

      expect(config.width).toBeUndefined();
    });

    it('should decode URI components', () => {
      const params = new URLSearchParams();
      params.set('text', encodeURIComponent('A sunset with 50% clouds'));

      const config = parsePromptConfigFromParams(params);

      expect(config.text).toBe('A sunset with 50% clouds');
    });

    it('should handle empty params', () => {
      const params = new URLSearchParams();

      const config = parsePromptConfigFromParams(params);

      expect(Object.keys(config)).toHaveLength(0);
    });
  });

  describe('persistPromptConfigToSession', () => {
    it('should persist config to sessionStorage for image', () => {
      const config = {
        format: IngredientFormat.LANDSCAPE,
        text: 'A beautiful sunset',
      };

      const result = persistPromptConfigToSession(config, '/studio/image');

      expect(result).toBe(true);

      const stored = sessionStorage.getItem(PROMPT_STORAGE_KEY);
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      expect(parsed.lastCategory).toBe('image');
      expect(parsed.promptConfig.category).toBe('image');
      expect(parsed.promptText).toBe('A beautiful sunset');
    });

    it('should persist config to sessionStorage for video', () => {
      const config = {
        format: IngredientFormat.PORTRAIT,
        text: 'A flying drone shot',
      };

      const result = persistPromptConfigToSession(config, '/studio/video');

      expect(result).toBe(true);

      const stored = sessionStorage.getItem(PROMPT_STORAGE_KEY);
      const parsed = JSON.parse(stored!);
      expect(parsed.lastCategory).toBe('video');
      expect(parsed.promptConfig.category).toBe('video');
    });

    it('should merge with existing storage data', () => {
      // Set initial data
      sessionStorage.setItem(
        PROMPT_STORAGE_KEY,
        JSON.stringify({ existingKey: 'existingValue' }),
      );

      const config = { text: 'New prompt' };
      persistPromptConfigToSession(config, '/studio/image');

      const stored = sessionStorage.getItem(PROMPT_STORAGE_KEY);
      const parsed = JSON.parse(stored!);
      expect(parsed.existingKey).toBe('existingValue');
      expect(parsed.promptText).toBe('New prompt');
    });

    it('should handle empty text', () => {
      const config = { format: IngredientFormat.SQUARE };

      persistPromptConfigToSession(config, '/studio/image');

      const stored = sessionStorage.getItem(PROMPT_STORAGE_KEY);
      const parsed = JSON.parse(stored!);
      expect(parsed.promptText).toBe('');
    });
  });

  describe('readPromptConfigFromSession', () => {
    it('should read config from sessionStorage', () => {
      const data = {
        lastCategory: 'image',
        promptConfig: { format: IngredientFormat.LANDSCAPE },
        promptText: 'Test prompt',
      };
      sessionStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(data));

      const result = readPromptConfigFromSession();

      expect(result).not.toBeNull();
      expect(result?.promptText).toBe('Test prompt');
      expect(result?.lastCategory).toBe('image');
    });

    it('should return null when no data stored', () => {
      const result = readPromptConfigFromSession();

      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      sessionStorage.setItem(PROMPT_STORAGE_KEY, 'invalid-json{');

      const result = readPromptConfigFromSession();

      expect(result).toBeNull();
    });
  });

  describe('clearPromptConfigFromSession', () => {
    it('should clear config from sessionStorage', () => {
      sessionStorage.setItem(PROMPT_STORAGE_KEY, 'test-data');

      clearPromptConfigFromSession();

      expect(sessionStorage.getItem(PROMPT_STORAGE_KEY)).toBeNull();
    });

    it('should not throw when no data exists', () => {
      expect(() => clearPromptConfigFromSession()).not.toThrow();
    });
  });

  describe('buildUsePromptUrl', () => {
    it('should build URL for image with basic ingredient', () => {
      const ingredient = {
        id: 'ing_123',
        metadata: { height: 1080, width: 1920 },
        promptText: 'A sunset over mountains',
      };

      const url = buildUsePromptUrl(ingredient as any, '/studio/image');

      expect(url).toBe('/studio/image');

      // Check sessionStorage was populated
      const stored = readPromptConfigFromSession();
      expect(stored?.promptText).toBe('A sunset over mountains');
    });

    it('should build URL for video with duration', () => {
      const ingredient = {
        id: 'vid_123',
        metadata: { duration: 10, height: 1920, width: 1080 },
        promptText: 'A flying drone',
      };

      const url = buildUsePromptUrl(ingredient as any, '/studio/video');

      expect(url).toBe('/studio/video');

      const stored = readPromptConfigFromSession();
      expect(stored?.promptConfig?.duration).toBe(10);
    });

    it('should include ingredient ID as reference', () => {
      const ingredient = {
        id: 'ing_456',
        promptText: 'Test',
      };

      buildUsePromptUrl(ingredient as any, '/studio/image');

      const stored = readPromptConfigFromSession();
      expect(stored?.promptConfig?.references).toContain('ing_456');
    });

    it('should extract model from metadata', () => {
      const ingredient = {
        id: 'ing_123',
        metadata: { model: 'flux-1.1-pro' },
        promptText: 'Test',
      };

      buildUsePromptUrl(ingredient as any, '/studio/image');

      const stored = readPromptConfigFromSession();
      expect(stored?.promptConfig?.models).toContain('flux-1.1-pro');
    });

    it('should use ingredientFormat or format', () => {
      const ingredient = {
        id: 'ing_123',
        ingredientFormat: IngredientFormat.LANDSCAPE,
        promptText: 'Test',
      };

      buildUsePromptUrl(ingredient as any, '/studio/image');

      const stored = readPromptConfigFromSession();
      expect(stored?.promptConfig?.format).toBe(IngredientFormat.LANDSCAPE);
    });

    it('should default to PORTRAIT format', () => {
      const ingredient = {
        id: 'ing_123',
        promptText: 'Test',
      };

      buildUsePromptUrl(ingredient as any, '/studio/image');

      const stored = readPromptConfigFromSession();
      expect(stored?.promptConfig?.format).toBe(IngredientFormat.PORTRAIT);
    });

    it('should include style from ingredient or metadata', () => {
      const ingredient = {
        id: 'ing_123',
        promptText: 'Test',
        style: 'cinematic',
      };

      buildUsePromptUrl(ingredient as any, '/studio/image');

      const stored = readPromptConfigFromSession();
      expect(stored?.promptConfig?.style).toBe('cinematic');
    });

    it('should use prompt.original if no promptText', () => {
      const ingredient = {
        id: 'ing_123',
        prompt: { original: 'Original prompt text' },
      };

      buildUsePromptUrl(ingredient as any, '/studio/image');

      const stored = readPromptConfigFromSession();
      expect(stored?.promptText).toBe('Original prompt text');
    });
  });

  describe('clearPromptConfigFromUrl', () => {
    it('should clear all prompt config params from URL', () => {
      const currentUrl =
        'http://localhost/studio/image?text=test&format=portrait&width=1080&other=keep';
      const pathname = '/studio/image';

      const result = clearPromptConfigFromUrl(currentUrl, pathname);

      expect(result).toBe('/studio/image?other=keep');
    });

    it('should clear array params', () => {
      const currentUrl =
        'http://localhost/studio/image?models=flux,sdxl&references=ref1,ref2';
      const pathname = '/studio/image';

      const result = clearPromptConfigFromUrl(currentUrl, pathname);

      expect(result).toBe('/studio/image');
    });

    it('should clear boolean params', () => {
      const currentUrl =
        'http://localhost/studio/image?isBrandingEnabled=1&isAudioEnabled=0';
      const pathname = '/studio/image';

      const result = clearPromptConfigFromUrl(currentUrl, pathname);

      expect(result).toBe('/studio/image');
    });

    it('should clear legacy referenceImageId param', () => {
      const currentUrl =
        'http://localhost/studio/image?referenceImageId=img_123';
      const pathname = '/studio/image';

      const result = clearPromptConfigFromUrl(currentUrl, pathname);

      expect(result).toBe('/studio/image');
    });

    it('should preserve non-prompt params', () => {
      const currentUrl =
        'http://localhost/studio/image?text=test&tab=advanced&section=style';
      const pathname = '/studio/image';

      const result = clearPromptConfigFromUrl(currentUrl, pathname);

      expect(result).toContain('tab=advanced');
      expect(result).toContain('section=style');
      expect(result).not.toContain('text=');
    });

    it('should return pathname only when all params cleared', () => {
      const currentUrl =
        'http://localhost/studio/image?text=test&format=portrait';
      const pathname = '/studio/image';

      const result = clearPromptConfigFromUrl(currentUrl, pathname);

      expect(result).toBe('/studio/image');
    });

    it('should handle URL with no params', () => {
      const currentUrl = 'http://localhost/studio/image';
      const pathname = '/studio/image';

      const result = clearPromptConfigFromUrl(currentUrl, pathname);

      expect(result).toBe('/studio/image');
    });
  });

  describe('ALL_PROMPT_CONFIG_PARAMS', () => {
    it('should include all string params', () => {
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('text');
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('format');
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('style');
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('mood');
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('camera');
    });

    it('should include all array params', () => {
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('models');
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('references');
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('blacklist');
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('sounds');
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('tags');
    });

    it('should include all boolean params', () => {
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('isBrandingEnabled');
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('isAudioEnabled');
    });

    it('should include all number params', () => {
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('width');
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('height');
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('duration');
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('seed');
      expect(ALL_PROMPT_CONFIG_PARAMS).toContain('outputs');
    });
  });

  describe('roundtrip serialization', () => {
    it('should maintain data integrity through serialize/parse cycle', () => {
      const original = {
        duration: 10,
        format: IngredientFormat.LANDSCAPE,
        height: 1080,
        isAudioEnabled: false,
        isBrandingEnabled: true,
        models: ['flux-1.1', 'sdxl'],
        mood: 'peaceful',
        references: ['ref_1', 'ref_2'],
        style: 'cinematic',
        text: 'A beautiful mountain landscape at sunset',
        width: 1920,
      };

      const params = serializePromptConfigToParams(original);
      const parsed = parsePromptConfigFromParams(params);

      expect(parsed.text).toBe(original.text);
      expect(parsed.format).toBe(original.format);
      expect(parsed.width).toBe(original.width);
      expect(parsed.height).toBe(original.height);
      expect(parsed.duration).toBe(original.duration);
      expect(parsed.models).toEqual(original.models);
      expect(parsed.references).toEqual(original.references);
      expect(parsed.brandingMode).toBe('brand');
      expect(parsed.isAudioEnabled).toBe(original.isAudioEnabled);
      expect(parsed.style).toBe(original.style);
      expect(parsed.mood).toBe(original.mood);
    });
  });
});
