import type { ComfyUIPrompt } from '@genfeedai/contracts/types';

// =============================================================================
// Z-IMAGE TURBO — fast image generation
// =============================================================================

export interface ZImageTurboParams {
  prompt: string;
  seed?: number;
  width?: number;
  height?: number;
  steps?: number;
}

export function buildZImageTurboPrompt(
  params: ZImageTurboParams,
): ComfyUIPrompt {
  const {
    prompt,
    seed = Math.floor(Math.random() * 2 ** 32),
    width = 1024,
    height = 1024,
    steps = 4,
  } = params;

  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: 'z_image_turbo_bf16.safetensors',
        weight_dtype: 'default',
      },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: 'qwen_3_4b.safetensors',
        type: 'lumina2',
      },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['2', 0],
        text: prompt,
      },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['2', 0],
        text: '',
      },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: {
        batch_size: 1,
        height,
        width,
      },
    },
    '6': {
      class_type: 'KSampler',
      inputs: {
        cfg: 1.0,
        denoise: 1.0,
        latent_image: ['5', 0],
        model: ['1', 0],
        negative: ['4', 0],
        positive: ['3', 0],
        sampler_name: 'euler_ancestral',
        scheduler: 'normal',
        seed,
        steps,
      },
    },
    '7': {
      class_type: 'VAELoader',
      inputs: {
        vae_name: 'ae.safetensors',
      },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['6', 0],
        vae: ['7', 0],
      },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'genfeed-z-turbo',
        images: ['8', 0],
      },
    },
  };
}

// =============================================================================
// Z-IMAGE TURBO + LoRA — face-consistent via trained LoRA (no PuLID needed)
// Split loading: UNETLoader + CLIPLoader + LoraLoader + VAELoader
// Z-Image is Lumina2-based (Qwen text encoder), uses euler_ancestral, cfg 1.0
// =============================================================================

export interface ZImageTurboLoraParams extends ZImageTurboParams {
  loraPath: string;
  loraStrength?: number;
  upscaleModel?: string;
}

export function buildZImageTurboLoraPrompt(
  params: ZImageTurboLoraParams,
): ComfyUIPrompt {
  const {
    prompt,
    loraPath,
    seed = Math.floor(Math.random() * 2 ** 32),
    width = 832,
    height = 1216,
    steps = 8,
    loraStrength = 0.8,
    upscaleModel = '4x-UltraSharp.pth',
  } = params;

  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: 'z_image_turbo_bf16.safetensors',
        weight_dtype: 'default',
      },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: 'qwen_3_4b.safetensors',
        type: 'lumina2',
      },
    },
    '3': {
      class_type: 'LoraLoader',
      inputs: {
        clip: ['2', 0],
        lora_name: loraPath,
        model: ['1', 0],
        strength_clip: loraStrength,
        strength_model: loraStrength,
      },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['3', 1],
        text: prompt,
      },
    },
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['3', 1],
        text: '',
      },
    },
    '6': {
      class_type: 'EmptyLatentImage',
      inputs: {
        batch_size: 1,
        height,
        width,
      },
    },
    '7': {
      class_type: 'KSampler',
      inputs: {
        cfg: 1.0,
        denoise: 1.0,
        latent_image: ['6', 0],
        model: ['3', 0],
        negative: ['5', 0],
        positive: ['4', 0],
        sampler_name: 'euler_ancestral',
        scheduler: 'normal',
        seed,
        steps,
      },
    },
    '8': {
      class_type: 'VAELoader',
      inputs: {
        vae_name: 'ae.safetensors',
      },
    },
    '9': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['7', 0],
        vae: ['8', 0],
      },
    },
    '10': {
      class_type: 'UpscaleModelLoader',
      inputs: {
        model_name: upscaleModel,
      },
    },
    '11': {
      class_type: 'ImageUpscaleWithModel',
      inputs: {
        image: ['9', 0],
        upscale_model: ['10', 0],
      },
    },
    '12': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'genfeed-z-turbo-lora',
        images: ['11', 0],
      },
    },
  };
}
