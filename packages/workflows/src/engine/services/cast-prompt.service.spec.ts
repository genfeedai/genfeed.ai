import { describe, expect, it } from 'vitest';
import {
  composeUgcPromptBlocks,
  getUgcPresetById,
} from '../presets/ugc-presets';
import {
  type CASTInput,
  extractPostProcessingConfig,
  generateCASTPrompt,
  validateCASTInput,
} from './cast-prompt.service';

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

  describe('UGC amateur-realism presets', () => {
    const ugcInput: CASTInput = {
      action: 'creator talking to camera about a morning routine',
      cameraMovement: 'dolly',
      colorPalette: 'everyday indoor color',
      lighting: 'window light from the side',
      mood: 'casual, unpolished',
      presetId: 'ugc_selfie_handheld',
      subject: 'young creator in a bedroom, phone in hand',
    };

    const cinematicGlossPatterns: RegExp[] = [
      /\banamorphic\b/i,
      /red v-?raptor/i,
      /sony venice/i,
      /\barri\b/i,
      /panavision/i,
      /cinealta/i,
      /lens flare/i,
      /cinema[- ]camera/i,
    ];

    describe('four-block composition', () => {
      it('composes micro-expression, camera-imperfection, identity-lock, and framing-anchor into the compiled prompt', () => {
        const presetIds = [
          'ugc_selfie_handheld',
          'ugc_tripod_vlog',
          'ugc_filmed_by_another',
        ] as const;

        presetIds.forEach((presetId) => {
          const preset = getUgcPresetById(presetId);
          expect(preset).not.toBeNull();
          if (!preset) {
            return;
          }

          const blocks = composeUgcPromptBlocks({
            hasStartFrameReference: false,
            preset,
          });
          const result = generateCASTPrompt({ ...ugcInput, presetId });

          expect(result.preset.id).toBe(presetId);
          expect(result.prompt).toContain(blocks.microExpression);
          expect(result.prompt).toContain(blocks.cameraImperfection);
          expect(result.prompt).toContain(blocks.identityLock);
          expect(result.prompt).toContain(blocks.framingAnchor);
          expect(result.prompt).toContain(ugcInput.action);
          expect(result.prompt).toContain(ugcInput.subject);
        });
      });
    });

    describe('three camera modes', () => {
      it('uses the UGC camera mode instead of cinematic camera movement copy', () => {
        const selfie = generateCASTPrompt({
          ...ugcInput,
          cameraMovement: 'dolly',
          presetId: 'ugc_selfie_handheld',
        });
        const tripod = generateCASTPrompt({
          ...ugcInput,
          cameraMovement: 'crane',
          presetId: 'ugc_tripod_vlog',
        });
        const filmedByAnother = generateCASTPrompt({
          ...ugcInput,
          cameraMovement: 'aerial',
          presetId: 'ugc_filmed_by_another',
        });

        expect(selfie.metadata.cameraMovement).toBe('selfie-handheld');
        expect(selfie.prompt).toMatch(/handheld selfie sway/i);
        expect(selfie.prompt).not.toContain('smooth dolly shot pushing in');

        expect(tripod.metadata.cameraMovement).toBe('tripod-vlog');
        expect(tripod.prompt).toMatch(/static locked-off/i);
        expect(tripod.prompt).not.toContain('sweeping crane movement');

        expect(filmedByAnother.metadata.cameraMovement).toBe(
          'filmed-by-another-person',
        );
        expect(filmedByAnother.prompt).toMatch(/filmed by another person/i);
        expect(filmedByAnother.prompt).not.toContain(
          'aerial drone establishing shot',
        );
      });
    });

    describe('identity-lock-with-reference', () => {
      it('includes an identity-lock directive tied to the start-frame reference', () => {
        const result = generateCASTPrompt({
          ...ugcInput,
          hasStartFrameReference: true,
          presetId: 'ugc_tripod_vlog',
        });

        expect(result.prompt).toMatch(/start-frame reference/i);
        expect(result.prompt).toMatch(/facial proportions/i);
        expect(result.prompt).toMatch(/eye shape/i);
        expect(result.prompt).toMatch(/hairstyle/i);
      });
    });

    describe('cinematic-vocab-absent', () => {
      it('omits cinematic-gloss vocabulary from UGC-preset output', () => {
        const presetIds = [
          'ugc_selfie_handheld',
          'ugc_tripod_vlog',
          'ugc_filmed_by_another',
        ] as const;

        presetIds.forEach((presetId) => {
          const result = generateCASTPrompt({
            ...ugcInput,
            hasStartFrameReference: true,
            presetId,
          });

          cinematicGlossPatterns.forEach((pattern) => {
            expect(
              result.prompt,
              `UGC ${presetId} matched cinematic gloss ${pattern}`,
            ).not.toMatch(pattern);
          });
        });
      });
    });

    describe('cinematic-regression-byte-identical', () => {
      const cinematicFixtureInput: CASTInput = {
        action: 'a woman walking through rain',
        cameraMovement: 'dolly',
        colorPalette: 'teal and orange, warm highlights',
        lighting: 'moody neon lighting with rain reflections',
        mood: 'melancholic, introspective',
        subject: 'young woman in a red coat, wet streets reflecting neon',
        presetId: 'hollywood_blockbuster',
      };

      const cinematicPromptFixtures: Record<string, string> = {
        commercial_clean:
          'Sony Venice 2 with Sony CineAlta 50mm T2.0, pristine detail, balanced color science, soft diffusion, studio lighting, smooth dolly shot pushing in. a woman walking through rain. young woman in a red coat, wet streets reflecting neon. moody neon lighting with rain reflections, teal and orange, warm highlights, melancholic, introspective.',
        documentary_raw:
          'Filmed on RED V-Raptor XL with Zeiss Supreme Prime 35mm, handheld stabilized, natural lighting, high detail retention in shadows, smooth dolly shot pushing in. a woman walking through rain. young woman in a red coat, wet streets reflecting neon. moody neon lighting with rain reflections, teal and orange, warm highlights, melancholic, introspective.',
        hollywood_blockbuster:
          'Shot on ARRI Alexa Mini LF with Cooke S7/i 50mm T2.0, shallow depth of field, natural skin tones, wide dynamic range, subtle film grain, smooth dolly shot pushing in. a woman walking through rain. young woman in a red coat, wet streets reflecting neon. moody neon lighting with rain reflections, teal and orange, warm highlights, melancholic, introspective.',
        indie_film:
          'Shot on Blackmagic Pocket 6K Pro with Rokinon 24mm T1.5, anamorphic lens flare, desaturated color palette, visible film grain, moody atmosphere, smooth dolly shot pushing in. a woman walking through rain. young woman in a red coat, wet streets reflecting neon. moody neon lighting with rain reflections, teal and orange, warm highlights, melancholic, introspective.',
        social_media_cinematic:
          'Canon C70 with Sigma 18-35mm f/1.8 Art lens, vibrant colors, punchy contrast, smooth bokeh in background, smooth dolly shot pushing in. a woman walking through rain. young woman in a red coat, wet streets reflecting neon. moody neon lighting with rain reflections, teal and orange, warm highlights, melancholic, introspective.',
        vintage_35mm:
          'Filmed on 35mm Kodak Vision3 500T film stock, Panavision Primo 40mm lens, heavy grain structure, warm color shift, lifted blacks, halation on highlights, smooth dolly shot pushing in. a woman walking through rain. young woman in a red coat, wet streets reflecting neon. moody neon lighting with rain reflections, teal and orange, warm highlights, melancholic, introspective.',
      };

      it('leaves cinematic preset output byte-identical when no UGC preset is selected', () => {
        Object.entries(cinematicPromptFixtures).forEach(
          ([presetId, expectedPrompt]) => {
            const result = generateCASTPrompt({
              ...cinematicFixtureInput,
              presetId,
            });
            expect(result.prompt).toBe(expectedPrompt);
          },
        );
      });

      it('does not change cinematic output when a start-frame flag is present without a UGC preset', () => {
        const baseline = generateCASTPrompt(cinematicFixtureInput);
        const withReferenceFlag = generateCASTPrompt({
          ...cinematicFixtureInput,
          hasStartFrameReference: true,
        });

        expect(withReferenceFlag.prompt).toBe(baseline.prompt);
        expect(withReferenceFlag.prompt).toBe(
          cinematicPromptFixtures.hollywood_blockbuster,
        );
      });
    });

    it('accepts UGC preset ids in CAST validation', () => {
      const result = validateCASTInput(ugcInput);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
