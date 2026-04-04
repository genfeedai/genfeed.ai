import { ModelCategory } from '@genfeedai/enums';
import { HuggingFaceProviderService } from '@services/ai/providers/huggingface/huggingface-provider.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('HuggingFaceProviderService', () => {
  let service: HuggingFaceProviderService;

  beforeEach(() => {
    service = new HuggingFaceProviderService();
  });

  describe('isConfigured', () => {
    it('should return false when no API key is set', () => {
      expect(service.isConfigured()).toBe(false);
    });

    it('should return true after setting API key', () => {
      service.setApiKey('hf_test_key');
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('validateApiKey', () => {
    it('should return false when no API key is set', async () => {
      const result = await service.validateApiKey();
      expect(result).toBe(false);
    });

    it('should return true for valid API key', async () => {
      service.setApiKey('hf_valid_key');
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: async () => ({ name: 'test-user' }),
        ok: true,
      } as Response);

      const result = await service.validateApiKey();
      expect(result).toBe(true);
      vi.restoreAllMocks();
    });

    it('should return false on network error', async () => {
      service.setApiKey('hf_bad_key');
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(
        new Error('Network error'),
      );

      const result = await service.validateApiKey();
      expect(result).toBe(false);
      vi.restoreAllMocks();
    });
  });

  describe('healthCheck', () => {
    it('should return ok when API is reachable', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: async () => [],
        ok: true,
      } as Response);

      const result = await service.healthCheck();
      expect(result.status).toBe('ok');
      vi.restoreAllMocks();
    });

    it('should return error when API is unreachable', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      const result = await service.healthCheck();
      expect(result.status).toBe('error');
      expect(result.message).toContain('Connection refused');
      vi.restoreAllMocks();
    });

    it('should return error on non-ok response', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response);

      const result = await service.healthCheck();
      expect(result.status).toBe('error');
      expect(result.message).toContain('503');
      vi.restoreAllMocks();
    });
  });

  describe('getPredefinedModels', () => {
    it('should return predefined HuggingFace models', () => {
      const models = service.getPredefinedModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it('should include Stable Diffusion XL model', () => {
      const models = service.getPredefinedModels();
      const sdxl = models.find(
        (m) => m.key === 'hf/stabilityai/stable-diffusion-xl-base-1.0',
      );
      expect(sdxl).toBeDefined();
      expect(sdxl?.label).toBe('Stable Diffusion XL');
      expect(sdxl?.category).toBe(ModelCategory.IMAGE);
    });

    it('should include FLUX.1 Schnell model', () => {
      const models = service.getPredefinedModels();
      const flux = models.find(
        (m) => m.key === 'hf/black-forest-labs/FLUX.1-schnell',
      );
      expect(flux).toBeDefined();
      expect(flux?.speedTier).toBe('fast');
    });

    it('should include Llama 3.2 text model', () => {
      const models = service.getPredefinedModels();
      const llama = models.find(
        (m) => m.key === 'hf/meta-llama/Llama-3.2-3B-Instruct',
      );
      expect(llama).toBeDefined();
      expect(llama?.category).toBe(ModelCategory.TEXT);
    });

    it('should include Mistral 7B text model', () => {
      const models = service.getPredefinedModels();
      const mistral = models.find(
        (m) => m.key === 'hf/mistralai/Mistral-7B-Instruct-v0.3',
      );
      expect(mistral).toBeDefined();
      expect(mistral?.category).toBe(ModelCategory.TEXT);
    });

    it('should include Whisper audio model', () => {
      const models = service.getPredefinedModels();
      const whisper = models.find(
        (m) => m.key === 'hf/openai/whisper-large-v3',
      );
      expect(whisper).toBeDefined();
      expect(whisper?.category).toBe(ModelCategory.VOICE);
    });

    it('should include MMS TTS model', () => {
      const models = service.getPredefinedModels();
      const tts = models.find((m) => m.key === 'hf/facebook/mms-tts-eng');
      expect(tts).toBeDefined();
      expect(tts?.category).toBe(ModelCategory.VOICE);
    });

    it('should include Stable Video Diffusion model', () => {
      const models = service.getPredefinedModels();
      const svd = models.find(
        (m) => m.key === 'hf/stabilityai/stable-video-diffusion-img2vid-xt',
      );
      expect(svd).toBeDefined();
      expect(svd?.category).toBe(ModelCategory.VIDEO);
    });

    it('should have valid pricing for all models (free tier)', () => {
      const models = service.getPredefinedModels();
      for (const model of models) {
        expect(model.cost).toBeDefined();
        expect(model.costTier).toBe('low');
        expect(model.pricingType).toBe('per-request');
      }
    });

    it('should have all models marked as active', () => {
      const models = service.getPredefinedModels();
      for (const model of models) {
        expect(model.isActive).toBe(true);
        expect(model.isDefault).toBe(false);
      }
    });

    it('should return 7 predefined models', () => {
      const models = service.getPredefinedModels();
      expect(models).toHaveLength(7);
    });
  });

  describe('discoverModels', () => {
    it('should throw when API key is not configured', async () => {
      await expect(service.discoverModels()).rejects.toThrow(
        'HUGGINGFACE_API_KEY not configured',
      );
    });

    it('should return empty array on fetch failure', async () => {
      service.setApiKey('hf_test_key');
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(
        new Error('Network error'),
      );
      const models = await service.discoverModels();
      expect(models).toEqual([]);
      vi.restoreAllMocks();
    });

    it('should map fetched models to GenFeed format', async () => {
      service.setApiKey('hf_test_key');
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: async () => [
          {
            description: 'A test model',
            modelId: 'test-org/test-model',
            pipeline_tag: 'text-to-image',
            tags: [],
          },
        ],
        ok: true,
      } as Response);

      const models = await service.discoverModels();
      expect(models).toHaveLength(1);
      expect(models[0].label).toBe('Test Model');
      expect(models[0].provider).toBe('huggingface');
      expect(models[0].isActive).toBe(true);
      expect(models[0].category).toBe(ModelCategory.IMAGE);
      vi.restoreAllMocks();
    });
  });

  describe('getModelPricing', () => {
    it('should return free tier for known free models', () => {
      const pricing = service.getModelPricing(
        'stabilityai/stable-diffusion-xl-base-1.0',
      );
      expect(pricing.tier).toBe('free');
      expect(pricing.costPerRequest).toBe(0);
    });

    it('should return pro tier for unknown models', () => {
      const pricing = service.getModelPricing('some-org/some-model');
      expect(pricing.tier).toBe('pro');
      expect(pricing.costPerRequest).toBeGreaterThan(0);
    });

    it('should include rate limit info', () => {
      const pricing = service.getModelPricing(
        'meta-llama/Llama-3.2-3B-Instruct',
      );
      expect(pricing.rateLimit).toBeDefined();
      expect(pricing.rateLimit).toContain('requests/day');
    });
  });

  describe('searchModels', () => {
    it('should throw when API key is not configured', async () => {
      await expect(service.searchModels('test')).rejects.toThrow(
        'HUGGINGFACE_API_KEY not configured',
      );
    });

    it('should pass search query to API', async () => {
      service.setApiKey('hf_test_key');
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: async () => [],
        ok: true,
      } as Response);

      await service.searchModels('stable diffusion');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('search=stable+diffusion'),
        expect.any(Object),
      );
      vi.restoreAllMocks();
    });
  });

  describe('getModelInfo', () => {
    it('should return model info for valid model', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: async () => ({
          modelId: 'test/model',
          pipeline_tag: 'text-to-image',
        }),
        ok: true,
      } as Response);

      const info = await service.getModelInfo('test/model');
      expect(info).toBeDefined();
      expect(info.modelId).toBe('test/model');
      vi.restoreAllMocks();
    });

    it('should return null for invalid model', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      const info = await service.getModelInfo('nonexistent/model');
      expect(info).toBeNull();
      vi.restoreAllMocks();
    });
  });
});
