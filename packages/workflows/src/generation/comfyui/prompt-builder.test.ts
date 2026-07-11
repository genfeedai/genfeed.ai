import { describe, expect, it } from 'vitest';
import {
  buildFlux2DevPrompt,
  buildFlux2DevPulidPrompt,
  buildFlux2DevPulidUpscalePrompt,
  buildFlux2KleinPrompt,
  buildFluxDevPrompt,
  buildZImageTurboLoraPrompt,
  buildZImageTurboPrompt,
  type Flux2PulidUpscaleParams,
} from './prompt-builder';

describe('buildZImageTurboPrompt', () => {
  const prompt = buildZImageTurboPrompt({ prompt: 'a red car', seed: 42 });

  it('uses UNETLoader instead of CheckpointLoaderSimple', () => {
    const node1 = prompt['1'];
    expect(node1.class_type).toBe('UNETLoader');
    expect(node1.inputs).toEqual({
      unet_name: 'z_image_turbo_bf16.safetensors',
      weight_dtype: 'default',
    });
  });

  it('uses CLIPLoader with lumina2 type for Qwen encoder', () => {
    const node2 = prompt['2'];
    expect(node2.class_type).toBe('CLIPLoader');
    expect(node2.inputs).toEqual({
      clip_name: 'qwen_3_4b.safetensors',
      type: 'lumina2',
    });
  });

  it('references CLIPLoader output (node 2) for text encoding', () => {
    expect(prompt['3'].inputs.clip).toEqual(['2', 0]);
    expect(prompt['4'].inputs.clip).toEqual(['2', 0]);
  });

  it('uses separate VAELoader instead of checkpoint VAE output', () => {
    const vaeNode = prompt['7'];
    expect(vaeNode.class_type).toBe('VAELoader');
    expect(vaeNode.inputs).toEqual({ vae_name: 'ae.safetensors' });
  });

  it('VAEDecode references VAELoader output', () => {
    const decodeNode = prompt['8'];
    expect(decodeNode.class_type).toBe('VAEDecode');
    expect(decodeNode.inputs.vae).toEqual(['7', 0]);
  });

  it('uses euler_ancestral sampler', () => {
    expect(prompt['6'].inputs.sampler_name).toBe('euler_ancestral');
  });

  it('wires KSampler to the split loader outputs', () => {
    const ksampler = prompt['6'];
    expect(ksampler.inputs.model).toEqual(['1', 0]);
    expect(ksampler.inputs.positive).toEqual(['3', 0]);
    expect(ksampler.inputs.negative).toEqual(['4', 0]);
  });

  it('does not contain CheckpointLoaderSimple anywhere', () => {
    const classTypes = Object.values(prompt).map((n) => n.class_type);
    expect(classTypes).not.toContain('CheckpointLoaderSimple');
  });
});

describe('buildZImageTurboLoraPrompt', () => {
  const prompt = buildZImageTurboLoraPrompt({
    loraPath: 'test_lora.safetensors',
    prompt: 'a blue sky',
    seed: 99,
  });

  it('uses UNETLoader for split loading', () => {
    expect(prompt['1'].class_type).toBe('UNETLoader');
  });

  it('uses CLIPLoader with lumina2 type', () => {
    expect(prompt['2'].class_type).toBe('CLIPLoader');
    expect(prompt['2'].inputs.type).toBe('lumina2');
  });

  it('applies LoRA after split loaders', () => {
    expect(prompt['3'].class_type).toBe('LoraLoader');
    expect(prompt['3'].inputs.model).toEqual(['1', 0]);
    expect(prompt['3'].inputs.clip).toEqual(['2', 0]);
  });
});

describe('buildFlux2DevPrompt', () => {
  const prompt = buildFlux2DevPrompt({ prompt: 'sunset', seed: 1 });

  it('uses UNETLoader for split loading', () => {
    expect(prompt['1'].class_type).toBe('UNETLoader');
  });

  it('uses CLIPLoader with flux2 type', () => {
    expect(prompt['2'].class_type).toBe('CLIPLoader');
    expect(prompt['2'].inputs.type).toBe('flux2');
  });

  it('uses separate VAELoader', () => {
    expect(prompt['6'].class_type).toBe('VAELoader');
  });
});

describe('buildFlux2KleinPrompt', () => {
  const prompt = buildFlux2KleinPrompt({ prompt: 'mountain', seed: 7 });

  it('uses UNETLoader for split loading', () => {
    expect(prompt['1'].class_type).toBe('UNETLoader');
  });

  it('uses separate VAELoader', () => {
    expect(prompt['6'].class_type).toBe('VAELoader');
  });
});

describe('buildFluxDevPrompt (legacy Flux 1)', () => {
  const prompt = buildFluxDevPrompt({ prompt: 'hello', seed: 5 });

  it('still uses CheckpointLoaderSimple (Flux 1 single checkpoint)', () => {
    expect(prompt['1'].class_type).toBe('CheckpointLoaderSimple');
  });
});

// =============================================================================
// Flux 2 PuLID + 4K Upscale — full pipeline verification (#61)
// =============================================================================

describe('buildFlux2DevPulidUpscalePrompt', () => {
  const baseParams: Flux2PulidUpscaleParams = {
    faceImage: 'test-face.png',
    prompt: 'professional headshot, studio lighting',
    seed: 42,
  };

  const prompt = buildFlux2DevPulidUpscalePrompt(baseParams);

  // ---------------------------------------------------------------------------
  // Split loading — UNETLoader + CLIPLoader (no CheckpointLoaderSimple)
  // ---------------------------------------------------------------------------
  describe('split loading', () => {
    it('uses UNETLoader with flux2 dev fp8 model', () => {
      expect(prompt['1']).toEqual({
        class_type: 'UNETLoader',
        inputs: {
          unet_name: 'flux2_dev_fp8mixed.safetensors',
          weight_dtype: 'fp8_e4m3fn',
        },
      });
    });

    it('uses CLIPLoader with Mistral 3 encoder for flux2', () => {
      expect(prompt['2']).toEqual({
        class_type: 'CLIPLoader',
        inputs: {
          clip_name: 'mistral_3_small_flux2_fp8.safetensors',
          type: 'flux2',
        },
      });
    });

    it('uses separate VAELoader (not checkpoint VAE output)', () => {
      expect(prompt['11']).toEqual({
        class_type: 'VAELoader',
        inputs: { vae_name: 'flux2-vae.safetensors' },
      });
    });

    it('does not contain CheckpointLoaderSimple', () => {
      const classTypes = Object.values(prompt).map((n) => n.class_type);
      expect(classTypes).not.toContain('CheckpointLoaderSimple');
    });
  });

  // ---------------------------------------------------------------------------
  // PuLID face consistency pipeline
  // ---------------------------------------------------------------------------
  describe('PuLID pipeline', () => {
    it('loads PuLID model adapter', () => {
      expect(prompt['3']).toEqual({
        class_type: 'PulidModelLoader',
        inputs: {
          pulid_file: 'ip-adapter_pulid_flux_v0.9.1.safetensors',
        },
      });
    });

    it('loads PuLID EVA CLIP encoder', () => {
      expect(prompt['4']).toEqual({
        class_type: 'PulidEvaClipLoader',
        inputs: {},
      });
    });

    it('loads InsightFace on CPU', () => {
      expect(prompt['5']).toEqual({
        class_type: 'PulidInsightFaceLoader',
        inputs: { provider: 'CPU' },
      });
    });

    it('loads face reference image', () => {
      expect(prompt['6']).toEqual({
        class_type: 'LoadImage',
        inputs: { image: 'test-face.png' },
      });
    });

    it('applies PuLID with correct node wiring', () => {
      expect(prompt['7']).toEqual({
        class_type: 'ApplyPulid',
        inputs: {
          end_at: 1.0,
          eva_clip: ['4', 0],
          face_analysis: ['5', 0],
          image: ['6', 0],
          method: 'fidelity',
          model: ['1', 0],
          pulid: ['3', 0],
          start_at: 0.0,
          weight: 0.8,
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Text encoding — CLIPTextEncode → FluxGuidance
  // ---------------------------------------------------------------------------
  describe('text encoding', () => {
    it('encodes positive prompt via CLIPLoader output', () => {
      expect(prompt['8']).toEqual({
        class_type: 'CLIPTextEncode',
        inputs: {
          clip: ['2', 0],
          text: 'professional headshot, studio lighting',
        },
      });
    });

    it('applies FluxGuidance to positive conditioning', () => {
      expect(prompt['9']).toEqual({
        class_type: 'FluxGuidance',
        inputs: {
          conditioning: ['8', 0],
          guidance: 3.5,
        },
      });
    });

    it('encodes empty negative prompt via CLIPLoader output', () => {
      expect(prompt['10']).toEqual({
        class_type: 'CLIPTextEncode',
        inputs: {
          clip: ['2', 0],
          text: '',
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Sampling — KSampler wiring
  // ---------------------------------------------------------------------------
  describe('sampling', () => {
    it('KSampler receives PuLID-modified model from ApplyPulid', () => {
      expect(prompt['13'].inputs.model).toEqual(['7', 0]);
    });

    it('KSampler receives FluxGuidance output as positive', () => {
      expect(prompt['13'].inputs.positive).toEqual(['9', 0]);
    });

    it('KSampler receives empty negative encoding', () => {
      expect(prompt['13'].inputs.negative).toEqual(['10', 0]);
    });

    it('KSampler uses latent image from EmptyLatentImage', () => {
      expect(prompt['13'].inputs.latent_image).toEqual(['12', 0]);
    });

    it('KSampler uses cfg 1.0 (guidance handled by FluxGuidance node)', () => {
      expect(prompt['13'].inputs.cfg).toBe(1.0);
    });

    it('KSampler uses euler sampler with normal scheduler', () => {
      expect(prompt['13'].inputs.sampler_name).toBe('euler');
      expect(prompt['13'].inputs.scheduler).toBe('normal');
    });

    it('KSampler passes through seed', () => {
      expect(prompt['13'].inputs.seed).toBe(42);
    });
  });

  // ---------------------------------------------------------------------------
  // VAEDecode — latent → pixel
  // ---------------------------------------------------------------------------
  describe('VAE decode', () => {
    it('decodes sampler output using separate VAELoader', () => {
      expect(prompt['14']).toEqual({
        class_type: 'VAEDecode',
        inputs: {
          samples: ['13', 0],
          vae: ['11', 0],
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 4x Upscale pipeline
  // ---------------------------------------------------------------------------
  describe('upscale pipeline', () => {
    it('loads 4x-UltraSharp upscale model by default', () => {
      expect(prompt['15']).toEqual({
        class_type: 'UpscaleModelLoader',
        inputs: { model_name: '4x-UltraSharp.pth' },
      });
    });

    it('upscales decoded image through model', () => {
      expect(prompt['16']).toEqual({
        class_type: 'ImageUpscaleWithModel',
        inputs: {
          image: ['14', 0],
          upscale_model: ['15', 0],
        },
      });
    });

    it('saves upscaled image with correct prefix', () => {
      expect(prompt['17']).toEqual({
        class_type: 'SaveImage',
        inputs: {
          filename_prefix: 'genfeed-flux2-pulid-4k',
          images: ['16', 0],
        },
      });
    });

    it('saves upscaled image (node 16), not base image (node 14)', () => {
      expect(prompt['17'].inputs.images).toEqual(['16', 0]);
    });
  });

  // ---------------------------------------------------------------------------
  // Default dimensions — Instagram 4:5 base for 4x upscale
  // ---------------------------------------------------------------------------
  describe('default dimensions', () => {
    it('defaults to 832x1216 (Instagram 4:5 at base resolution)', () => {
      expect(prompt['12'].inputs.width).toBe(832);
      expect(prompt['12'].inputs.height).toBe(1216);
    });
  });

  // ---------------------------------------------------------------------------
  // Parameter passthrough
  // ---------------------------------------------------------------------------
  describe('parameter passthrough', () => {
    it('passes custom dimensions', () => {
      const custom = buildFlux2DevPulidUpscalePrompt({
        ...baseParams,
        height: 768,
        width: 512,
      });
      expect(custom['12'].inputs.width).toBe(512);
      expect(custom['12'].inputs.height).toBe(768);
    });

    it('passes custom steps', () => {
      const custom = buildFlux2DevPulidUpscalePrompt({
        ...baseParams,
        steps: 30,
      });
      expect(custom['13'].inputs.steps).toBe(30);
    });

    it('passes custom guidance', () => {
      const custom = buildFlux2DevPulidUpscalePrompt({
        ...baseParams,
        guidance: 7.0,
      });
      expect(custom['9'].inputs.guidance).toBe(7.0);
    });

    it('passes custom PuLID strength', () => {
      const custom = buildFlux2DevPulidUpscalePrompt({
        ...baseParams,
        pulidStrength: 0.5,
      });
      expect(custom['7'].inputs.weight).toBe(0.5);
    });

    it('passes custom PuLID method', () => {
      const custom = buildFlux2DevPulidUpscalePrompt({
        ...baseParams,
        pulidMethod: 'style',
      });
      expect(custom['7'].inputs.method).toBe('style');
    });

    it('passes custom PuLID start/end range', () => {
      const custom = buildFlux2DevPulidUpscalePrompt({
        ...baseParams,
        pulidEndAt: 0.8,
        pulidStartAt: 0.2,
      });
      expect(custom['7'].inputs.start_at).toBe(0.2);
      expect(custom['7'].inputs.end_at).toBe(0.8);
    });

    it('passes custom upscale model', () => {
      const custom = buildFlux2DevPulidUpscalePrompt({
        ...baseParams,
        upscaleModel: 'RealESRGAN_x4plus.pth',
      });
      expect(custom['15'].inputs.model_name).toBe('RealESRGAN_x4plus.pth');
    });
  });

  // ---------------------------------------------------------------------------
  // Node count — ensures no orphan or missing nodes
  // ---------------------------------------------------------------------------
  describe('graph integrity', () => {
    it('has exactly 17 nodes', () => {
      expect(Object.keys(prompt)).toHaveLength(17);
    });

    it('node IDs are sequential 1..17', () => {
      const ids = Object.keys(prompt)
        .map(Number)
        .sort((a, b) => a - b);
      expect(ids).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
    });

    it('every node reference points to an existing node', () => {
      const nodeIds = new Set(Object.keys(prompt));
      for (const [_id, node] of Object.entries(prompt)) {
        for (const value of Object.values(
          node.inputs as Record<string, unknown>,
        )) {
          if (Array.isArray(value) && typeof value[0] === 'string') {
            expect(nodeIds.has(value[0])).toBe(true);
          }
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Structural parity with non-upscale PuLID variant
  // ---------------------------------------------------------------------------
  describe('parity with buildFlux2DevPulidPrompt', () => {
    const base = buildFlux2DevPulidPrompt({
      faceImage: 'test-face.png',
      prompt: 'test',
      seed: 42,
    });
    const upscale = buildFlux2DevPulidUpscalePrompt({
      faceImage: 'test-face.png',
      prompt: 'test',
      seed: 42,
      width: 1024,
      height: 1024,
    });

    it('shares same UNETLoader config', () => {
      expect(upscale['1']).toEqual(base['1']);
    });

    it('shares same CLIPLoader config', () => {
      expect(upscale['2']).toEqual(base['2']);
    });

    it('shares same PuLID loader chain (nodes 3-5)', () => {
      expect(upscale['3']).toEqual(base['3']);
      expect(upscale['4']).toEqual(base['4']);
      expect(upscale['5']).toEqual(base['5']);
    });

    it('upscale variant has 2 extra nodes (UpscaleModelLoader + ImageUpscaleWithModel)', () => {
      expect(Object.keys(upscale).length).toBe(Object.keys(base).length + 2);
    });
  });
});
