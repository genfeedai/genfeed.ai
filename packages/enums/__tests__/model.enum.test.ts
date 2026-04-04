import { describe, expect, it } from 'vitest';
import {
  CostTier,
  ModelCategory,
  ModelKey,
  ModelProvider,
  PricingType,
  QualityTier,
  SpeedTier,
} from '../src/model.enum';

describe('model.enum', () => {
  describe('ModelKey', () => {
    it('should have 83 members', () => {
      expect(Object.values(ModelKey)).toHaveLength(83);
    });

    it('should have correct values', () => {
      expect(ModelKey.REPLICATE_FAST_FLUX_TRAINER).toBe(
        'replicate/fast-flux-trainer',
      );
      expect(ModelKey.REPLICATE_GOOGLE_IMAGEN_3).toBe('google/imagen-3');
      expect(ModelKey.REPLICATE_GOOGLE_IMAGEN_3_FAST).toBe(
        'google/imagen-3-fast',
      );
      expect(ModelKey.REPLICATE_GOOGLE_IMAGEN_4).toBe('google/imagen-4');
      expect(ModelKey.REPLICATE_GOOGLE_IMAGEN_4_FAST).toBe(
        'google/imagen-4-fast',
      );
      expect(ModelKey.REPLICATE_GOOGLE_IMAGEN_4_ULTRA).toBe(
        'google/imagen-4-ultra',
      );
      expect(ModelKey.REPLICATE_GOOGLE_NANO_BANANA).toBe('google/nano-banana');
      expect(ModelKey.REPLICATE_GOOGLE_NANO_BANANA_PRO).toBe(
        'google/nano-banana-pro',
      );
      expect(ModelKey.REPLICATE_GOOGLE_VEO_2).toBe('google/veo-2');
      expect(ModelKey.REPLICATE_GOOGLE_VEO_3).toBe('google/veo-3');
      expect(ModelKey.REPLICATE_GOOGLE_VEO_3_FAST).toBe('google/veo-3-fast');
      expect(ModelKey.REPLICATE_GOOGLE_VEO_3_1).toBe('google/veo-3.1');
      expect(ModelKey.REPLICATE_GOOGLE_VEO_3_1_FAST).toBe(
        'google/veo-3.1-fast',
      );
      expect(ModelKey.REPLICATE_IDEOGRAM_AI_IDEOGRAM_CHARACTER).toBe(
        'ideogram-ai/ideogram-character',
      );
      expect(ModelKey.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_BALANCED).toBe(
        'ideogram-ai/ideogram-v3-balanced',
      );
      expect(ModelKey.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_QUALITY).toBe(
        'ideogram-ai/ideogram-v3-quality',
      );
      expect(ModelKey.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO).toBe(
        'ideogram-ai/ideogram-v3-turbo',
      );
      expect(ModelKey.REPLICATE_OPENAI_CLIP).toBe('openai/clip');
      expect(ModelKey.REPLICATE_OPENAI_GPT_5_2).toBe('openai/gpt-5.2');
      expect(ModelKey.REPLICATE_OPENAI_GPT_IMAGE_1_5).toBe(
        'openai/gpt-image-1.5',
      );
      expect(ModelKey.REPLICATE_OPENAI_SORA_2).toBe('openai/sora-2');
      expect(ModelKey.REPLICATE_OPENAI_SORA_2_PRO).toBe('openai/sora-2-pro');
      expect(ModelKey.REPLICATE_QWEN_QWEN_IMAGE).toBe('qwen/qwen-image');
      expect(ModelKey.REPLICATE_RUNWAYML_GEN4_IMAGE_TURBO).toBe(
        'runwayml/gen4-image-turbo',
      );
      expect(ModelKey.REPLICATE_BYTEDANCE_SEEDREAM_4).toBe(
        'bytedance/seedream-4',
      );
      expect(ModelKey.REPLICATE_BYTEDANCE_SEEDREAM_4_5).toBe(
        'bytedance/seedream-4.5',
      );
      expect(ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_1_1_PRO).toBe(
        'black-forest-labs/flux-1.1-pro',
      );
      expect(ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_2_DEV).toBe(
        'black-forest-labs/flux-2-dev',
      );
      expect(ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_2_FLEX).toBe(
        'black-forest-labs/flux-2-flex',
      );
      expect(ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_2_PRO).toBe(
        'black-forest-labs/flux-2-pro',
      );
      expect(ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_PRO).toBe(
        'black-forest-labs/flux-kontext-pro',
      );
      expect(ModelKey.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL).toBe(
        'black-forest-labs/flux-schnell',
      );
      expect(ModelKey.REPLICATE_LUMA_REFRAME_IMAGE).toBe('luma/reframe-image');
      expect(ModelKey.REPLICATE_LUMA_REFRAME_VIDEO).toBe('luma/reframe-video');
      expect(ModelKey.REPLICATE_TOPAZ_IMAGE_UPSCALE).toBe(
        'topazlabs/image-upscale',
      );
      expect(ModelKey.REPLICATE_TOPAZ_VIDEO_UPSCALE).toBe(
        'topazlabs/video-upscale',
      );
      expect(ModelKey.REPLICATE_KWAIVGI_KLING_V1_6_PRO).toBe(
        'kwaivgi/kling-v1.6-pro',
      );
      expect(ModelKey.REPLICATE_KWAIVGI_KLING_V2_1).toBe('kwaivgi/kling-v2.1');
      expect(ModelKey.REPLICATE_KWAIVGI_KLING_V2_1_MASTER).toBe(
        'kwaivgi/kling-v2.1-master',
      );
      expect(ModelKey.REPLICATE_KWAIVGI_KLING_V2_5_TURBO_PRO).toBe(
        'kwaivgi/kling-v2.5-turbo-pro',
      );
      expect(ModelKey.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST).toBe(
        'wan-video/wan-2.2-i2v-fast',
      );
      expect(ModelKey.REPLICATE_META_MUSICGEN).toBe('meta/musicgen');
      expect(ModelKey.HEYGEN_AVATAR).toBe('heygen/avatar');
      expect(ModelKey.REPLICATE_DEEPSEEK_AI_DEEPSEEK_R1).toBe(
        'deepseek-ai/deepseek-r1',
      );
      expect(ModelKey.REPLICATE_ANTHROPIC_CLAUDE_4_5_SONNET).toBe(
        'anthropic/claude-4.5-sonnet',
      );
      expect(ModelKey.REPLICATE_GOOGLE_GEMINI_2_5_FLASH).toBe(
        'google/gemini-2.5-flash',
      );
      expect(ModelKey.REPLICATE_GOOGLE_GEMINI_3_PRO).toBe(
        'google/gemini-3-pro',
      );
      expect(ModelKey.REPLICATE_META_LLAMA_3_1_405B_INSTRUCT).toBe(
        'meta/meta-llama-3.1-405b-instruct',
      );
      expect(ModelKey.OPENROUTER_XAI_GROK_4_FAST).toBe('x-ai/grok-4-fast');
      expect(ModelKey.OPENROUTER_XAI_GROK_4).toBe('x-ai/grok-4');
      expect(ModelKey.OPENROUTER_XAI_GROK_4_1_FAST).toBe('x-ai/grok-4.1-fast');
      expect(ModelKey.KLINGAI_V2).toBe('klingai-v2');
      expect(ModelKey.LEONARDOAI).toBe('leonardoai');
      expect(ModelKey.RUNWAYML).toBe('runwayml');
      expect(ModelKey.SDXL).toBe('sdxl');
      expect(ModelKey.FAL_FLUX_DEV).toBe('fal-ai/flux/dev');
      expect(ModelKey.FAL_FLUX_SCHNELL).toBe('fal-ai/flux/schnell');
      expect(ModelKey.FAL_FLUX_PRO).toBe('fal-ai/flux-pro');
      expect(ModelKey.FAL_KLING_VIDEO).toBe('fal-ai/kling-video');
      expect(ModelKey.FAL_LUMA_DREAM_MACHINE).toBe('fal-ai/luma-dream-machine');
      expect(ModelKey.FAL_RUNWAY_GEN3).toBe('fal-ai/runway-gen3');
      expect(ModelKey.FAL_SEEDANCE_2_0).toBe('fal-ai/seedance-2.0');
      expect(ModelKey.FAL_STABLE_VIDEO).toBe('fal-ai/stable-video-diffusion');
      expect(ModelKey.FAL_WHISPER).toBe('fal-ai/whisper');
      expect(ModelKey.FAL_ELEVEN_LABS_TTS).toBe('fal-ai/eleven-labs-tts');
      expect(ModelKey.FAL_FACE_SWAP).toBe('fal-ai/face-swap');
      expect(ModelKey.FAL_UPSCALER).toBe('fal-ai/clarity-upscaler');
      expect(ModelKey.HF_SDXL).toBe(
        'hf/stabilityai/stable-diffusion-xl-base-1.0',
      );
      expect(ModelKey.HF_FLUX_SCHNELL).toBe(
        'hf/black-forest-labs/FLUX.1-schnell',
      );
      expect(ModelKey.HF_LLAMA_3_2_3B).toBe(
        'hf/meta-llama/Llama-3.2-3B-Instruct',
      );
      expect(ModelKey.HF_MISTRAL_7B).toBe(
        'hf/mistralai/Mistral-7B-Instruct-v0.3',
      );
      expect(ModelKey.HF_WHISPER_LARGE_V3).toBe('hf/openai/whisper-large-v3');
      expect(ModelKey.HF_MMS_TTS_ENG).toBe('hf/facebook/mms-tts-eng');
      expect(ModelKey.HF_STABLE_VIDEO_DIFFUSION).toBe(
        'hf/stabilityai/stable-video-diffusion-img2vid-xt',
      );
      expect(ModelKey.GENFEED_AI_FLUX_DEV).toBe('genfeed-ai/flux-dev');
      expect(ModelKey.GENFEED_AI_FLUX_DEV_PULID).toBe(
        'genfeed-ai/flux-dev-pulid',
      );
      expect(ModelKey.GENFEED_AI_Z_IMAGE_TURBO).toBe(
        'genfeed-ai/z-image-turbo',
      );
      expect(ModelKey.GENFEED_AI_FLUX2_DEV).toBe('genfeed-ai/flux2-dev');
      expect(ModelKey.GENFEED_AI_FLUX2_DEV_PULID).toBe(
        'genfeed-ai/flux2-dev-pulid',
      );
      expect(ModelKey.GENFEED_AI_FLUX2_DEV_PULID_LORA).toBe(
        'genfeed-ai/flux2-dev-pulid-lora',
      );
      expect(ModelKey.GENFEED_AI_FLUX2_DEV_PULID_UPSCALE).toBe(
        'genfeed-ai/flux2-dev-pulid-upscale',
      );
      expect(ModelKey.GENFEED_AI_FLUX2_KLEIN).toBe('genfeed-ai/flux2-klein');
      expect(ModelKey.GENFEED_AI_Z_IMAGE_TURBO_LORA).toBe(
        'genfeed-ai/z-image-turbo-lora',
      );
    });
  });

  describe('ModelProvider', () => {
    it('should have 4 members', () => {
      expect(Object.values(ModelProvider)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(ModelProvider.REPLICATE).toBe('replicate');
      expect(ModelProvider.FAL).toBe('fal');
      expect(ModelProvider.HUGGINGFACE).toBe('huggingface');
      expect(ModelProvider.GENFEED_AI).toBe('genfeed-ai');
    });
  });

  describe('ModelCategory', () => {
    it('should have 10 members', () => {
      expect(Object.values(ModelCategory)).toHaveLength(10);
    });

    it('should have correct values', () => {
      expect(ModelCategory.TEXT).toBe('text');
      expect(ModelCategory.EMBEDDING).toBe('embedding');
      expect(ModelCategory.IMAGE).toBe('image');
      expect(ModelCategory.IMAGE_EDIT).toBe('image-edit');
      expect(ModelCategory.IMAGE_UPSCALE).toBe('image-upscale');
      expect(ModelCategory.VIDEO).toBe('video');
      expect(ModelCategory.VIDEO_EDIT).toBe('video-edit');
      expect(ModelCategory.VIDEO_UPSCALE).toBe('video-upscale');
      expect(ModelCategory.MUSIC).toBe('music');
      expect(ModelCategory.VOICE).toBe('voice');
    });
  });

  describe('QualityTier', () => {
    it('should have 4 members', () => {
      expect(Object.values(QualityTier)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(QualityTier.BASIC).toBe('basic');
      expect(QualityTier.STANDARD).toBe('standard');
      expect(QualityTier.HIGH).toBe('high');
      expect(QualityTier.ULTRA).toBe('ultra');
    });
  });

  describe('CostTier', () => {
    it('should have 3 members', () => {
      expect(Object.values(CostTier)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(CostTier.LOW).toBe('low');
      expect(CostTier.MEDIUM).toBe('medium');
      expect(CostTier.HIGH).toBe('high');
    });
  });

  describe('SpeedTier', () => {
    it('should have 3 members', () => {
      expect(Object.values(SpeedTier)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(SpeedTier.FAST).toBe('fast');
      expect(SpeedTier.MEDIUM).toBe('medium');
      expect(SpeedTier.SLOW).toBe('slow');
    });
  });

  describe('PricingType', () => {
    it('should have 3 members', () => {
      expect(Object.values(PricingType)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(PricingType.FLAT).toBe('flat');
      expect(PricingType.PER_MEGAPIXEL).toBe('per-megapixel');
      expect(PricingType.PER_SECOND).toBe('per-second');
    });
  });
});
