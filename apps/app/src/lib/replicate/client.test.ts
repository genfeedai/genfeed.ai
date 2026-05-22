import { describe, expect, it, vi } from 'vitest';
import {
  calculateCost,
  calculateWorkflowCost,
  MODELS,
  PRICING,
  replicateApi,
} from './client';

const replicateMocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
}));

vi.mock('replicate', () => ({
  default: vi.fn().mockImplementation(function replicateConstructor(
    this: unknown,
  ) {
    return {
      predictions: {
        cancel: replicateMocks.cancel,
        create: replicateMocks.create,
        get: replicateMocks.get,
      },
      run: replicateMocks.run,
    };
  }),
}));

describe('Replicate Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('MODELS', () => {
    it('should have correct model identifiers', () => {
      expect(MODELS.nanoBanana).toBe('google/nano-banana');
      expect(MODELS.nanoBananaPro).toBe('google/nano-banana-pro');
      expect(MODELS.veoFast).toBe('google/veo-3.1-fast');
      expect(MODELS.veo).toBe('google/veo-3.1');
      expect(MODELS.llama).toBe('meta/meta-llama-3.1-405b-instruct');
    });

    it('should have lip-sync model identifiers', () => {
      expect(MODELS.lipsync2).toBe('sync/lipsync-2');
      expect(MODELS.lipsync2Pro).toBe('sync/lipsync-2-pro');
      expect(MODELS.pixverseLipsync).toBe('pixverse/lipsync');
    });
  });

  describe('PRICING', () => {
    it('should have correct nano-banana pricing', () => {
      expect(PRICING['nano-banana']).toBe(0.039);
    });

    it('should have correct nano-banana-pro pricing tiers', () => {
      expect(PRICING['nano-banana-pro']['1K']).toBe(0.15);
      expect(PRICING['nano-banana-pro']['2K']).toBe(0.2);
      expect(PRICING['nano-banana-pro']['4K']).toBe(0.3);
    });

    it('should have correct veo-3.1-fast pricing', () => {
      expect(PRICING['veo-3.1-fast'].withAudio).toBe(0.15);
      expect(PRICING['veo-3.1-fast'].withoutAudio).toBe(0.1);
    });

    it('should have correct veo-3.1 pricing', () => {
      expect(PRICING['veo-3.1'].withAudio).toBe(0.4);
      expect(PRICING['veo-3.1'].withoutAudio).toBe(0.2);
    });

    it('should have correct llama pricing', () => {
      expect(PRICING.llama).toBe(0.0001);
    });

    it('should have correct lip-sync pricing', () => {
      expect(PRICING['sync/lipsync-2']).toBe(0.05);
      expect(PRICING['sync/lipsync-2-pro']).toBe(0.08325);
      expect(PRICING['pixverse/lipsync']).toBe(0.04);
    });
  });

  describe('calculateCost', () => {
    describe('image costs', () => {
      it('should calculate cost for nano-banana images', () => {
        const cost = calculateCost(
          3,
          'nano-banana',
          '2K',
          0,
          'veo-3.1-fast',
          false,
        );

        expect(cost).toBe(3 * 0.039);
      });

      it('should calculate cost for nano-banana-pro at 1K resolution', () => {
        const cost = calculateCost(
          2,
          'nano-banana-pro',
          '1K',
          0,
          'veo-3.1-fast',
          false,
        );

        expect(cost).toBe(2 * 0.15);
      });

      it('should calculate cost for nano-banana-pro at 2K resolution', () => {
        const cost = calculateCost(
          2,
          'nano-banana-pro',
          '2K',
          0,
          'veo-3.1-fast',
          false,
        );

        expect(cost).toBe(2 * 0.2);
      });

      it('should calculate cost for nano-banana-pro at 4K resolution', () => {
        const cost = calculateCost(
          1,
          'nano-banana-pro',
          '4K',
          0,
          'veo-3.1-fast',
          false,
        );

        expect(cost).toBe(1 * 0.3);
      });

      it('should default to 2K pricing for unknown resolution', () => {
        const cost = calculateCost(
          1,
          'nano-banana-pro',
          'unknown',
          0,
          'veo-3.1-fast',
          false,
        );

        expect(cost).toBe(0.2);
      });
    });

    describe('video costs', () => {
      it('should calculate cost for veo-3.1-fast with audio', () => {
        const cost = calculateCost(
          0,
          'nano-banana',
          '2K',
          10,
          'veo-3.1-fast',
          true,
        );

        expect(cost).toBe(10 * 0.15);
      });

      it('should calculate cost for veo-3.1-fast without audio', () => {
        const cost = calculateCost(
          0,
          'nano-banana',
          '2K',
          10,
          'veo-3.1-fast',
          false,
        );

        expect(cost).toBe(10 * 0.1);
      });

      it('should calculate cost for veo-3.1 with audio', () => {
        const cost = calculateCost(0, 'nano-banana', '2K', 8, 'veo-3.1', true);

        expect(cost).toBe(8 * 0.4);
      });

      it('should calculate cost for veo-3.1 without audio', () => {
        const cost = calculateCost(0, 'nano-banana', '2K', 8, 'veo-3.1', false);

        expect(cost).toBe(8 * 0.2);
      });
    });

    describe('combined costs', () => {
      it('should calculate combined image and video cost', () => {
        const cost = calculateCost(
          2,
          'nano-banana',
          '2K',
          10,
          'veo-3.1-fast',
          true,
        );

        const expectedImageCost = 2 * 0.039;
        const expectedVideoCost = 10 * 0.15;
        expect(cost).toBeCloseTo(expectedImageCost + expectedVideoCost);
      });

      it('should calculate combined nano-banana-pro and veo-3.1 cost', () => {
        const cost = calculateCost(
          3,
          'nano-banana-pro',
          '4K',
          8,
          'veo-3.1',
          true,
        );

        const expectedImageCost = 3 * 0.3;
        const expectedVideoCost = 8 * 0.4;
        expect(cost).toBeCloseTo(expectedImageCost + expectedVideoCost);
      });

      it('should return 0 for empty workflow', () => {
        const cost = calculateCost(
          0,
          'nano-banana',
          '2K',
          0,
          'veo-3.1-fast',
          false,
        );

        expect(cost).toBe(0);
      });
    });
  });

  describe('replicateApi', () => {
    it('creates nano-banana image predictions with defaults and webhooks', async () => {
      replicateMocks.create.mockResolvedValueOnce({
        id: 'prediction-image',
        output: ['image.jpg'],
        status: 'starting',
      });

      const result = await replicateApi.generateImage(
        'nano-banana',
        {
          prompt: 'A content studio',
        },
        'https://example.test/webhook',
      );

      expect(replicateMocks.create).toHaveBeenCalledWith({
        input: {
          aspect_ratio: '1:1',
          image_input: [],
          output_format: 'jpg',
          prompt: 'A content studio',
        },
        model: MODELS.nanoBanana,
        webhook: 'https://example.test/webhook',
        webhook_events_filter: ['completed'],
      });
      expect(result.id).toBe('prediction-image');
    });

    it('creates nano-banana-pro image predictions with resolution overrides', async () => {
      replicateMocks.create.mockResolvedValueOnce({
        id: 'prediction-pro',
        output: ['image.jpg'],
        status: 'starting',
      });

      await replicateApi.generateImage('nano-banana-pro', {
        aspect_ratio: '9:16',
        image_input: ['https://example.test/ref.jpg'],
        output_format: 'png',
        prompt: 'A product shot',
        resolution: '4K',
      });

      expect(replicateMocks.create).toHaveBeenCalledWith({
        input: {
          aspect_ratio: '9:16',
          image_input: ['https://example.test/ref.jpg'],
          output_format: 'png',
          prompt: 'A product shot',
          resolution: '4K',
        },
        model: MODELS.nanoBananaPro,
      });
    });

    it('creates video predictions with defaults and optional controls', async () => {
      replicateMocks.create.mockResolvedValueOnce({
        id: 'prediction-video',
        output: 'video.mp4',
        status: 'processing',
      });

      await replicateApi.generateVideo(
        'veo-3.1-fast',
        {
          image: 'https://example.test/start.jpg',
          last_frame: 'https://example.test/end.jpg',
          negative_prompt: 'blur',
          prompt: 'A smooth camera move',
          reference_images: ['https://example.test/ref.jpg'],
          seed: 42,
        },
        'https://example.test/video-webhook',
      );

      expect(replicateMocks.create).toHaveBeenCalledWith({
        input: {
          aspect_ratio: '16:9',
          duration: 8,
          generate_audio: true,
          image: 'https://example.test/start.jpg',
          last_frame: 'https://example.test/end.jpg',
          negative_prompt: 'blur',
          prompt: 'A smooth camera move',
          reference_images: ['https://example.test/ref.jpg'],
          resolution: '1080p',
          seed: 42,
        },
        model: MODELS.veoFast,
        webhook: 'https://example.test/video-webhook',
        webhook_events_filter: ['completed'],
      });
    });

    it('returns joined text output or stringified scalar output', async () => {
      replicateMocks.run.mockResolvedValueOnce(['Hello', ' world']);
      await expect(
        replicateApi.generateText({
          prompt: 'Write a caption',
        }),
      ).resolves.toBe('Hello world');
      expect(replicateMocks.run).toHaveBeenCalledWith(MODELS.llama, {
        input: {
          max_tokens: 1024,
          prompt: 'Write a caption',
          system_prompt: 'You are a helpful assistant.',
          temperature: 0.7,
          top_p: 0.9,
        },
      });

      replicateMocks.run.mockResolvedValueOnce(123);
      await expect(
        replicateApi.generateText({
          max_tokens: 50,
          prompt: 'Write a hook',
          system_prompt: 'Be concise.',
          temperature: 0.2,
          top_p: 0.5,
        }),
      ).resolves.toBe('123');
    });

    it('creates sync and pixverse lip-sync predictions', async () => {
      replicateMocks.create.mockResolvedValue({
        id: 'prediction-lipsync',
        output: 'video.mp4',
        status: 'starting',
      });

      await replicateApi.generateLipSync(
        'sync/lipsync-2',
        {
          audio: 'https://example.test/audio.mp3',
          image: 'https://example.test/avatar.jpg',
        },
        'https://example.test/lipsync-webhook',
      );

      expect(replicateMocks.create).toHaveBeenNthCalledWith(1, {
        input: {
          active_speaker: false,
          audio: 'https://example.test/audio.mp3',
          sync_mode: 'loop',
          temperature: 0.5,
          video: 'https://example.test/avatar.jpg',
        },
        model: MODELS.lipsync2,
        webhook: 'https://example.test/lipsync-webhook',
        webhook_events_filter: ['completed'],
      });

      await replicateApi.generateLipSync('pixverse/lipsync', {
        audio: 'https://example.test/audio.mp3',
        video: 'https://example.test/source.mp4',
      });

      expect(replicateMocks.create).toHaveBeenNthCalledWith(2, {
        input: {
          audio: 'https://example.test/audio.mp3',
          image: 'https://example.test/source.mp4',
        },
        model: MODELS.pixverseLipsync,
      });
    });

    it('gets and cancels predictions', async () => {
      replicateMocks.get.mockResolvedValueOnce({
        id: 'prediction-1',
        output: null,
        status: 'processing',
      });

      await expect(
        replicateApi.getPredictionStatus('prediction-1'),
      ).resolves.toEqual({
        id: 'prediction-1',
        output: null,
        status: 'processing',
      });
      expect(replicateMocks.get).toHaveBeenCalledWith('prediction-1');

      await replicateApi.cancelPrediction('prediction-1');
      expect(replicateMocks.cancel).toHaveBeenCalledWith('prediction-1');
    });
  });

  describe('calculateWorkflowCost', () => {
    it('sums image, video, lip-sync, and llm workflow node costs', () => {
      const cost = calculateWorkflowCost([
        {
          data: {
            label: 'Hero image',
            model: 'nano-banana-pro',
            resolution: '4K',
          },
          id: 'image-node',
          type: 'imageGen',
        },
        {
          data: {
            duration: 6,
            generateAudio: true,
            label: 'Launch video',
            model: 'veo-3.1',
          },
          id: 'video-node',
          type: 'videoGen',
        },
        {
          data: { label: 'Lip sync', model: 'sync/lipsync-2-pro' },
          id: 'lipsync-node',
          type: 'lipSync',
        },
        {
          data: { label: 'Caption draft' },
          id: 'llm-node',
          type: 'llm',
        },
        {
          data: {},
          id: 'passthrough',
          type: 'input',
        },
      ]);

      expect(cost).toBeCloseTo(0.3 + 6 * 0.4 + 10 * 0.08325 + 0.1);
    });

    it('uses defaults and fallback pricing for sparse workflow nodes', () => {
      const cost = calculateWorkflowCost([
        {
          data: {},
          type: 'imageGen',
        },
        {
          data: { model: 'nano-banana-pro', resolution: '8K' },
          type: 'imageGen',
        },
        {
          data: {},
          type: 'videoGen',
        },
        {
          data: { model: 'unknown-lipsync-model' },
          type: 'lipSync',
        },
      ]);

      expect(cost).toBeCloseTo(0.039 + 0.2 + 4 * 0.1);
    });
  });
});
