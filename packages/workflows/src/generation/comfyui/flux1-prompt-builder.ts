import type { ComfyUIPrompt } from '@genfeedai/contracts/types';

// =============================================================================
// FLUX DEV — text-to-image via FLUX.1 Dev checkpoint
// =============================================================================

export interface FluxDevParams {
  prompt: string;
  seed?: number;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  negativePrompt?: string;
}

export function buildFluxDevPrompt(params: FluxDevParams): ComfyUIPrompt {
  const {
    prompt,
    seed = Math.floor(Math.random() * 2 ** 32),
    width = 1024,
    height = 1024,
    steps = 20,
    cfg = 1.0,
    negativePrompt = '',
  } = params;

  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: 'flux1-dev.safetensors',
      },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['1', 1],
        text: prompt,
      },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['1', 1],
        text: negativePrompt,
      },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: {
        batch_size: 1,
        height,
        width,
      },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        cfg,
        denoise: 1.0,
        latent_image: ['4', 0],
        model: ['1', 0],
        negative: ['3', 0],
        positive: ['2', 0],
        sampler_name: 'euler',
        scheduler: 'normal',
        seed,
        steps,
      },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['5', 0],
        vae: ['1', 2],
      },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'genfeed-flux-dev',
        images: ['6', 0],
      },
    },
  };
}

// =============================================================================
// FLUX DEV + PuLID — face-consistent image generation (Flux 1)
// =============================================================================

export interface PulidFluxParams {
  prompt: string;
  faceImage: string;
  seed?: number;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  pulidStrength?: number;
}

export function buildPulidFluxPrompt(params: PulidFluxParams): ComfyUIPrompt {
  const {
    prompt,
    faceImage,
    seed = Math.floor(Math.random() * 2 ** 32),
    width = 1024,
    height = 1024,
    steps = 20,
    cfg = 1.0,
    pulidStrength = 0.8,
  } = params;

  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: 'flux1-dev.safetensors',
      },
    },
    '2': {
      class_type: 'PulidModelLoader',
      inputs: {
        pulid_file: 'ip-adapter_pulid_flux_v0.9.1.safetensors',
      },
    },
    '3': {
      class_type: 'PulidEvaClipLoader',
      inputs: {},
    },
    '4': {
      class_type: 'PulidInsightFaceLoader',
      inputs: {
        provider: 'CPU',
      },
    },
    '5': {
      class_type: 'LoadImage',
      inputs: {
        image: faceImage,
      },
    },
    '6': {
      class_type: 'ApplyPulid',
      inputs: {
        end_at: 1.0,
        eva_clip: ['3', 0],
        face_analysis: ['4', 0],
        image: ['5', 0],
        method: 'fidelity',
        model: ['1', 0],
        pulid: ['2', 0],
        start_at: 0.0,
        weight: pulidStrength,
      },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['1', 1],
        text: prompt,
      },
    },
    '8': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['1', 1],
        text: '',
      },
    },
    '9': {
      class_type: 'EmptyLatentImage',
      inputs: {
        batch_size: 1,
        height,
        width,
      },
    },
    '10': {
      class_type: 'KSampler',
      inputs: {
        cfg,
        denoise: 1.0,
        latent_image: ['9', 0],
        model: ['6', 0],
        negative: ['8', 0],
        positive: ['7', 0],
        sampler_name: 'euler',
        scheduler: 'normal',
        seed,
        steps,
      },
    },
    '11': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['10', 0],
        vae: ['1', 2],
      },
    },
    '12': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'genfeed-pulid-flux',
        images: ['11', 0],
      },
    },
  };
}
