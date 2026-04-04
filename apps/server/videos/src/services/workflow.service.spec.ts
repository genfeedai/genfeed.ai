import { Test, TestingModule } from '@nestjs/testing';
import type { Wan22I2VParams } from '@videos/interfaces/videos.interfaces';
import { WorkflowService } from '@videos/services/workflow.service';
import { beforeEach, describe, expect, it } from 'vitest';

describe('WorkflowService', () => {
  let service: WorkflowService;

  const baseParams: Wan22I2VParams = {
    imageFilename: 'input.png',
    negativePrompt: 'blurry, low quality',
    prefix: 'output/test',
    prompt: 'A person walking',
    seed: 42,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkflowService],
    }).compile();

    service = module.get(WorkflowService);
  });

  describe('buildWan22I2V', () => {
    it('returns an object with all 12 expected nodes', () => {
      const workflow = service.buildWan22I2V(baseParams);

      expect(Object.keys(workflow)).toHaveLength(12);
      for (let i = 1; i <= 12; i++) {
        expect(workflow[String(i)]).toBeDefined();
      }
    });

    it('node 1 is CLIPLoader with correct clip and type', () => {
      const workflow = service.buildWan22I2V(baseParams);
      const node1 = workflow['1'] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };

      expect(node1.class_type).toBe('CLIPLoader');
      expect(node1.inputs.type).toBe('wan');
      expect(node1.inputs.clip_name).toBe(
        'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
      );
    });

    it('node 2 is UNETLoader for high-noise model', () => {
      const workflow = service.buildWan22I2V(baseParams);
      const node2 = workflow['2'] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };

      expect(node2.class_type).toBe('UNETLoader');
      expect(node2.inputs.unet_name).toBe(
        'wan2.2_i2v_high_noise_14B_fp16.safetensors',
      );
    });

    it('node 3 is UNETLoader for low-noise model', () => {
      const workflow = service.buildWan22I2V(baseParams);
      const node3 = workflow['3'] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };

      expect(node3.class_type).toBe('UNETLoader');
      expect(node3.inputs.unet_name).toBe(
        'wan2.2_i2v_low_noise_14B_fp16.safetensors',
      );
    });

    it('node 5 loads the correct image filename', () => {
      const workflow = service.buildWan22I2V(baseParams);
      const node5 = workflow['5'] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };

      expect(node5.class_type).toBe('LoadImage');
      expect(node5.inputs.image).toBe('input.png');
    });

    it('node 6 encodes the positive prompt', () => {
      const workflow = service.buildWan22I2V(baseParams);
      const node6 = workflow['6'] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };

      expect(node6.class_type).toBe('CLIPTextEncode');
      expect(node6.inputs.text).toBe('A person walking');
    });

    it('node 7 encodes the negative prompt', () => {
      const workflow = service.buildWan22I2V(baseParams);
      const node7 = workflow['7'] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };

      expect(node7.class_type).toBe('CLIPTextEncode');
      expect(node7.inputs.text).toBe('blurry, low quality');
    });

    it('node 9 (pass 1) has noise enabled and returns leftover noise', () => {
      const workflow = service.buildWan22I2V(baseParams);
      const node9 = workflow['9'] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };

      expect(node9.class_type).toBe('KSamplerAdvanced');
      expect(node9.inputs.add_noise).toBe('enable');
      expect(node9.inputs.return_with_leftover_noise).toBe('enable');
      expect(node9.inputs.noise_seed).toBe(42);
    });

    it('node 10 (pass 2) has noise disabled and cleans up', () => {
      const workflow = service.buildWan22I2V(baseParams);
      const node10 = workflow['10'] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };

      expect(node10.class_type).toBe('KSamplerAdvanced');
      expect(node10.inputs.add_noise).toBe('disable');
      expect(node10.inputs.return_with_leftover_noise).toBe('disable');
    });

    it('node 12 saves as animated WEBP with correct prefix and fps', () => {
      const workflow = service.buildWan22I2V(baseParams);
      const node12 = workflow['12'] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };

      expect(node12.class_type).toBe('SaveAnimatedWEBP');
      expect(node12.inputs.filename_prefix).toBe('output/test');
      expect(node12.inputs.fps).toBe(16);
      expect(node12.inputs.lossless).toBe(false);
      expect(node12.inputs.quality).toBe(80);
    });

    it('uses custom overrides when provided', () => {
      const customParams: Wan22I2VParams = {
        ...baseParams,
        cfg: 5.0,
        fps: 24,
        height: 720,
        highNoiseUnet: 'custom_high.safetensors',
        lowNoiseUnet: 'custom_low.safetensors',
        numFrames: 49,
        steps: 30,
        width: 1280,
      };

      const workflow = service.buildWan22I2V(customParams);
      const node8 = workflow['8'] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };
      const node12 = workflow['12'] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };
      const node2 = workflow['2'] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };

      expect(node8.inputs.height).toBe(720);
      expect(node8.inputs.width).toBe(1280);
      expect(node8.inputs.length).toBe(49);
      expect(node12.inputs.fps).toBe(24);
      expect(node2.inputs.unet_name).toBe('custom_high.safetensors');
    });

    it('WanImageToVideo node references correct clip/vae/conditioning nodes', () => {
      const workflow = service.buildWan22I2V(baseParams);
      const node8 = workflow['8'] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };

      expect(node8.class_type).toBe('WanImageToVideo');
      expect(node8.inputs.vae).toEqual(['4', 0]);
      expect(node8.inputs.positive).toEqual(['6', 0]);
      expect(node8.inputs.negative).toEqual(['7', 0]);
      expect(node8.inputs.start_image).toEqual(['5', 0]);
    });

    it('VAEDecode references pass-2 output', () => {
      const workflow = service.buildWan22I2V(baseParams);
      const node11 = workflow['11'] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };

      expect(node11.class_type).toBe('VAEDecode');
      expect(node11.inputs.samples).toEqual(['10', 0]);
      expect(node11.inputs.vae).toEqual(['4', 0]);
    });
  });
});
