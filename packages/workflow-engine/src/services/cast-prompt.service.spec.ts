import {
  type CASTInput,
  extractPostProcessingConfig,
  generateCASTPrompt,
  validateCASTInput,
} from '@workflow-engine/services/cast-prompt.service';
import { describe, expect, it } from 'vitest';

describe('CASTPromptService', () => {
  const validInput: CASTInput = {
    action: 'a woman walking through rain',
    cameraMovement: 'dolly',
    colorPalette: 'teal and orange, warm highlights',
    lighting: 'moody neon lighting with rain reflections',
    mood: 'melancholic, introspective',
    presetId: 'hollywood_blockbuster',
    subject: 'young woman in a red coat, wet streets reflecting neon',
  };

  describe('generateCASTPrompt', () => {
    it('should generate a valid CAST prompt with all components', () => {
      const result = generateCASTPrompt(validInput);

      expect(result.prompt).toBeTruthy();
      expect(result.preset).toBeDefined();
      expect(result.metadata.wordCount).toBeGreaterThan(0);
      expect(result.metadata.cameraMovement).toBe('dolly');
    });

    it('should include camera specs in prompt', () => {
      const result = generateCASTPrompt(validInput);
      expect(result.prompt).toContain('ARRI Alexa Mini LF');
      expect(result.prompt).toContain('Cooke S7/i');
    });

    it('should include camera movement description', () => {
      const result = generateCASTPrompt(validInput);
      expect(result.prompt).toContain('dolly');
    });

    it('should include action in prompt', () => {
      const result = generateCASTPrompt(validInput);
      expect(result.prompt).toContain('woman walking through rain');
    });

    it('should include subject description', () => {
      const result = generateCASTPrompt(validInput);
      expect(result.prompt).toContain('red coat');
      expect(result.prompt).toContain('neon');
    });

    it('should include tone (lighting, color palette, mood)', () => {
      const result = generateCASTPrompt(validInput);
      expect(result.prompt).toContain('moody neon lighting');
      expect(result.prompt).toContain('teal and orange');
      expect(result.prompt).toContain('melancholic');
    });

    it('should enforce max 150 word limit', () => {
      const longInput: CASTInput = {
        action:
          'a person slowly walking down a long, winding cobblestone street filled with puddles and fallen leaves',
        cameraMovement: 'steadicam',
        colorPalette:
          'muted earth tones with pops of rust orange and deep forest green, desaturated blues in shadows, warm golden highlights, subtle purple undertones in mid-tones',
        lighting:
          'soft golden hour lighting streaming through gaps between old brick buildings, creating dramatic shadows and highlighting dust particles in the air, warm amber tones mixed with cool blue shadows',
        mood: 'nostalgic and contemplative with hints of loneliness, bittersweet memories, quiet introspection, sense of time passing, melancholic beauty, peaceful resignation',
        presetId: 'indie_film',
        subject:
          'weathered elderly man in a vintage tweed coat with patches, carrying an old leather briefcase, face deeply lined with wrinkles showing years of wisdom and experience, gray hair slightly disheveled',
      };

      const result = generateCASTPrompt(longInput);
      expect(result.metadata.wordCount).toBeLessThanOrEqual(150);
    });

    it('should work with different camera movements', () => {
      const movements: Array<CASTInput['cameraMovement']> = [
        'dolly',
        'tracking',
        'static',
        'crane',
        'aerial',
        'handheld',
        'steadicam',
      ];

      movements.forEach((movement) => {
        const input = { ...validInput, cameraMovement: movement };
        const result = generateCASTPrompt(input);
        expect(result.metadata.cameraMovement).toBe(movement);
        expect(result.prompt).toBeTruthy();
      });
    });

    it('should work with different presets', () => {
      const presetIds = [
        'hollywood_blockbuster',
        'documentary_raw',
        'social_media_cinematic',
        'indie_film',
        'vintage_35mm',
        'commercial_clean',
      ];

      presetIds.forEach((presetId) => {
        const input = { ...validInput, presetId };
        const result = generateCASTPrompt(input);
        expect(result.preset.id).toBe(presetId);
      });
    });

    it('should throw error for invalid preset', () => {
      const input = { ...validInput, presetId: 'nonexistent' };
      expect(() => generateCASTPrompt(input)).toThrow('Preset not found');
    });

    it('should throw error for missing action', () => {
      const input = { ...validInput, action: '' };
      expect(() => generateCASTPrompt(input)).toThrow('Action is required');
    });

    it('should throw error for missing subject', () => {
      const input = { ...validInput, subject: '' };
      expect(() => generateCASTPrompt(input)).toThrow('Subject is required');
    });

    it('should throw error for missing lighting', () => {
      const input = { ...validInput, lighting: '' };
      expect(() => generateCASTPrompt(input)).toThrow('Lighting is required');
    });

    it('should throw error for missing color palette', () => {
      const input = { ...validInput, colorPalette: '' };
      expect(() => generateCASTPrompt(input)).toThrow(
        'Color palette is required',
      );
    });

    it('should throw error for missing mood', () => {
      const input = { ...validInput, mood: '' };
      expect(() => generateCASTPrompt(input)).toThrow('Mood is required');
    });

    it('should return correct preset config', () => {
      const result = generateCASTPrompt(validInput);
      expect(result.preset.colorGrade).toBeDefined();
      expect(result.preset.filmGrain).toBeDefined();
      expect(result.preset.lensEffects).toBeDefined();
    });

    it('should count words correctly', () => {
      const shortInput: CASTInput = {
        action: 'product showcase',
        cameraMovement: 'static',
        colorPalette: 'clean whites',
        lighting: 'studio lighting',
        mood: 'professional',
        presetId: 'commercial_clean',
        subject: 'smartphone on white background',
      };

      const result = generateCASTPrompt(shortInput);
      expect(result.metadata.wordCount).toBeGreaterThan(0);
      expect(result.metadata.wordCount).toBeLessThan(50);
    });
  });

  describe('validateCASTInput', () => {
    it('should validate correct input', () => {
      const result = validateCASTInput(validInput);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing preset ID', () => {
      const input = { ...validInput, presetId: '' };
      const result = validateCASTInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Preset ID is required');
    });

    it('should detect invalid preset ID', () => {
      const input = { ...validInput, presetId: 'invalid_preset' };
      const result = validateCASTInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid preset ID'))).toBe(
        true,
      );
    });

    it('should detect missing camera movement', () => {
      const input = { ...validInput, cameraMovement: undefined as any };
      const result = validateCASTInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Camera movement is required');
    });

    it('should detect invalid camera movement', () => {
      const input = { ...validInput, cameraMovement: 'invalid' as any };
      const result = validateCASTInput(input);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('Invalid camera movement')),
      ).toBe(true);
    });

    it('should detect missing action', () => {
      const input = { ...validInput, action: '' };
      const result = validateCASTInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Action is required');
    });

    it('should detect missing subject', () => {
      const input = { ...validInput, subject: '   ' };
      const result = validateCASTInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Subject is required');
    });

    it('should detect missing lighting', () => {
      const input = { ...validInput, lighting: undefined as any };
      const result = validateCASTInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Lighting is required');
    });

    it('should detect missing color palette', () => {
      const input = { ...validInput, colorPalette: '' };
      const result = validateCASTInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Color palette is required');
    });

    it('should detect missing mood', () => {
      const input = { ...validInput, mood: '' };
      const result = validateCASTInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mood is required');
    });

    it('should detect multiple errors at once', () => {
      const input: Partial<CASTInput> = {
        action: '',
        cameraMovement: undefined,
        presetId: '',
      };
      const result = validateCASTInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(3);
    });

    it('should validate all camera movements', () => {
      const movements: Array<CASTInput['cameraMovement']> = [
        'dolly',
        'tracking',
        'static',
        'crane',
        'aerial',
        'handheld',
        'steadicam',
      ];

      movements.forEach((movement) => {
        const input = { ...validInput, cameraMovement: movement };
        const result = validateCASTInput(input);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('extractPostProcessingConfig', () => {
    it('should extract color grade config from preset', () => {
      const result = generateCASTPrompt(validInput);
      const config = extractPostProcessingConfig(result.preset);

      expect(config.colorGrade).toBeDefined();
      expect(config.colorGrade.cameraProfile).toBeTruthy();
      expect(typeof config.colorGrade.contrast).toBe('number');
      expect(typeof config.colorGrade.saturation).toBe('number');
    });

    it('should extract film grain config from preset', () => {
      const result = generateCASTPrompt(validInput);
      const config = extractPostProcessingConfig(result.preset);

      expect(config.filmGrain).toBeDefined();
      expect(config.filmGrain.stock).toBeTruthy();
      expect(typeof config.filmGrain.intensity).toBe('number');
      expect(typeof config.filmGrain.colorGrain).toBe('boolean');
    });

    it('should extract lens effects config from preset', () => {
      const result = generateCASTPrompt(validInput);
      const config = extractPostProcessingConfig(result.preset);

      expect(config.lensEffects).toBeDefined();
      expect(config.lensEffects.vignette).toBeDefined();
      expect(config.lensEffects.chromaticAberration).toBeDefined();
      expect(config.lensEffects.barrelDistortion).toBeDefined();
      expect(config.lensEffects.bloom).toBeDefined();
    });

    it('should work with different presets', () => {
      const presets = ['indie_film', 'vintage_35mm', 'documentary_raw'];

      presets.forEach((presetId) => {
        const input = { ...validInput, presetId };
        const result = generateCASTPrompt(input);
        const config = extractPostProcessingConfig(result.preset);

        expect(config.colorGrade).toBeDefined();
        expect(config.filmGrain).toBeDefined();
        expect(config.lensEffects).toBeDefined();
      });
    });
  });

  describe('Real-world scenarios', () => {
    it('should generate prompt for Instagram reel', () => {
      const input: CASTInput = {
        action: 'person unboxing a tech product',
        cameraMovement: 'tracking',
        colorPalette: 'vibrant with teal accents',
        lighting: 'bright natural window light, soft shadows',
        mood: 'energetic, exciting',
        presetId: 'social_media_cinematic',
        subject: 'hands opening sleek black box, modern apartment background',
      };

      const result = generateCASTPrompt(input);
      expect(result.preset.id).toBe('social_media_cinematic');
      expect(result.prompt).toBeTruthy();
      expect(result.metadata.wordCount).toBeLessThanOrEqual(150);
    });

    it('should generate prompt for documentary scene', () => {
      const input: CASTInput = {
        action: 'interview subject speaking to camera',
        cameraMovement: 'handheld',
        colorPalette: 'muted greens and earth tones',
        lighting: 'natural overcast daylight',
        mood: 'authentic, serious',
        presetId: 'documentary_raw',
        subject: 'environmental activist in their 40s, outdoor setting',
      };

      const result = generateCASTPrompt(input);
      expect(result.preset.id).toBe('documentary_raw');
      expect(result.prompt).toBeTruthy();
    });

    it('should generate prompt for indie film scene', () => {
      const input: CASTInput = {
        action: 'couple having quiet conversation',
        cameraMovement: 'dolly',
        colorPalette: 'desaturated with amber highlights',
        lighting: 'warm practical lights, deep shadows',
        mood: 'intimate, melancholic',
        presetId: 'indie_film',
        subject:
          'two people at dimly lit cafe table, steam rising from coffee cups',
      };

      const result = generateCASTPrompt(input);
      expect(result.preset.id).toBe('indie_film');
      expect(result.prompt).toContain('Blackmagic');
    });
  });
});
