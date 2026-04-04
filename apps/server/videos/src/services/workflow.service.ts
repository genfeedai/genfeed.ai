import { Injectable } from '@nestjs/common';
import type { Wan22I2VParams } from '@videos/interfaces/videos.interfaces';

@Injectable()
export class WorkflowService {
  /**
   * Build Wan 2.2 I2V two-pass workflow for ComfyUI.
   *
   * Dual UNET architecture:
   *   Pass 1: High-noise model (initial denoising)
   *   Pass 2: Low-noise model (refinement, no added noise)
   *
   * Node graph matches darkroom/workflows/wan22-i2v.json exactly.
   */
  buildWan22I2V(params: Wan22I2VParams): Record<string, unknown> {
    const {
      prompt,
      negativePrompt,
      prefix,
      seed,
      imageFilename,
      numFrames = 81,
      fps = 16,
      width = 832,
      height = 480,
      steps = 20,
      cfg = 3.0,
      highNoiseUnet = 'wan2.2_i2v_high_noise_14B_fp16.safetensors',
      lowNoiseUnet = 'wan2.2_i2v_low_noise_14B_fp16.safetensors',
      clip = 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
      vae = 'wan_2.1_vae.safetensors',
    } = params;

    return {
      // Text encoder (CLIPLoader for Wan)
      '1': {
        class_type: 'CLIPLoader',
        inputs: { clip_name: clip, type: 'wan' },
      },
      // High-noise UNET (pass 1 - initial denoising)
      '2': {
        class_type: 'UNETLoader',
        inputs: { unet_name: highNoiseUnet, weight_dtype: 'default' },
      },
      // Low-noise UNET (pass 2 - refinement)
      '3': {
        class_type: 'UNETLoader',
        inputs: { unet_name: lowNoiseUnet, weight_dtype: 'default' },
      },
      // VAE decoder
      '4': {
        class_type: 'VAELoader',
        inputs: { vae_name: vae },
      },
      // Reference image input
      '5': {
        class_type: 'LoadImage',
        inputs: { image: imageFilename },
      },
      // Positive prompt encoding
      '6': {
        class_type: 'CLIPTextEncode',
        inputs: { clip: ['1', 0], text: prompt },
      },
      // Negative prompt encoding
      '7': {
        class_type: 'CLIPTextEncode',
        inputs: { clip: ['1', 0], text: negativePrompt },
      },
      // Image-to-video conditioning
      '8': {
        class_type: 'WanImageToVideo',
        inputs: {
          batch_size: 1,
          height,
          length: numFrames,
          negative: ['7', 0],
          positive: ['6', 0],
          start_image: ['5', 0],
          vae: ['4', 0],
          width,
        },
      },
      // Pass 1: High-noise sampling (full denoise with noise injection)
      '9': {
        class_type: 'KSamplerAdvanced',
        inputs: {
          add_noise: 'enable',
          cfg,
          end_at_step: steps,
          latent_image: ['8', 2],
          model: ['2', 0],
          negative: ['8', 1],
          noise_seed: seed,
          positive: ['8', 0],
          return_with_leftover_noise: 'enable',
          sampler_name: 'euler',
          scheduler: 'normal',
          start_at_step: 0,
          steps,
        },
      },
      // Pass 2: Low-noise refinement (no added noise, cleans up artifacts)
      '10': {
        class_type: 'KSamplerAdvanced',
        inputs: {
          add_noise: 'disable',
          cfg,
          end_at_step: steps,
          latent_image: ['9', 0],
          model: ['3', 0],
          negative: ['8', 1],
          noise_seed: seed,
          positive: ['8', 0],
          return_with_leftover_noise: 'disable',
          sampler_name: 'euler',
          scheduler: 'normal',
          start_at_step: 0,
          steps,
        },
      },
      // VAE decode latent to pixel space
      '11': {
        class_type: 'VAEDecode',
        inputs: { samples: ['10', 0], vae: ['4', 0] },
      },
      // Save as animated WEBP
      '12': {
        class_type: 'SaveAnimatedWEBP',
        inputs: {
          filename_prefix: prefix,
          fps,
          images: ['11', 0],
          lossless: false,
          method: 'default',
          quality: 80,
        },
      },
    };
  }
}
