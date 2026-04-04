import { describe, expect, it, vi } from 'vitest';
import { calculateCost, MODELS, PRICING } from './client';

// Mock Replicate client - we only test the constants and calculateCost function
// The API functions are integration tests that require mocking Replicate SDK
vi.mock('replicate', () => ({
  default: vi.fn().mockImplementation(function replicateConstructor(this: unknown) {
    return {
      predictions: {
        cancel: vi.fn(),
        create: vi.fn(),
        get: vi.fn(),
      },
      run: vi.fn(),
    };
  }),
}));

describe('Replicate Client', () => {
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
        const cost = calculateCost(3, 'nano-banana', '2K', 0, 'veo-3.1-fast', false);

        expect(cost).toBe(3 * 0.039);
      });

      it('should calculate cost for nano-banana-pro at 1K resolution', () => {
        const cost = calculateCost(2, 'nano-banana-pro', '1K', 0, 'veo-3.1-fast', false);

        expect(cost).toBe(2 * 0.15);
      });

      it('should calculate cost for nano-banana-pro at 2K resolution', () => {
        const cost = calculateCost(2, 'nano-banana-pro', '2K', 0, 'veo-3.1-fast', false);

        expect(cost).toBe(2 * 0.2);
      });

      it('should calculate cost for nano-banana-pro at 4K resolution', () => {
        const cost = calculateCost(1, 'nano-banana-pro', '4K', 0, 'veo-3.1-fast', false);

        expect(cost).toBe(1 * 0.3);
      });

      it('should default to 2K pricing for unknown resolution', () => {
        const cost = calculateCost(1, 'nano-banana-pro', 'unknown', 0, 'veo-3.1-fast', false);

        expect(cost).toBe(0.2);
      });
    });

    describe('video costs', () => {
      it('should calculate cost for veo-3.1-fast with audio', () => {
        const cost = calculateCost(0, 'nano-banana', '2K', 10, 'veo-3.1-fast', true);

        expect(cost).toBe(10 * 0.15);
      });

      it('should calculate cost for veo-3.1-fast without audio', () => {
        const cost = calculateCost(0, 'nano-banana', '2K', 10, 'veo-3.1-fast', false);

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
        const cost = calculateCost(2, 'nano-banana', '2K', 10, 'veo-3.1-fast', true);

        const expectedImageCost = 2 * 0.039;
        const expectedVideoCost = 10 * 0.15;
        expect(cost).toBeCloseTo(expectedImageCost + expectedVideoCost);
      });

      it('should calculate combined nano-banana-pro and veo-3.1 cost', () => {
        const cost = calculateCost(3, 'nano-banana-pro', '4K', 8, 'veo-3.1', true);

        const expectedImageCost = 3 * 0.3;
        const expectedVideoCost = 8 * 0.4;
        expect(cost).toBeCloseTo(expectedImageCost + expectedVideoCost);
      });

      it('should return 0 for empty workflow', () => {
        const cost = calculateCost(0, 'nano-banana', '2K', 0, 'veo-3.1-fast', false);

        expect(cost).toBe(0);
      });
    });
  });
});
