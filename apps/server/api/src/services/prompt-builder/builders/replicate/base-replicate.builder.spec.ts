import type { ConfigService } from '@api/config/config.service';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type { ReplicateInput } from '@api/services/prompt-builder/interfaces/replicate-input.interface';
import { ModelKey, ModelProvider } from '@genfeedai/enums';
import { BaseReplicateBuilder } from './base-replicate.builder';

class TestReplicateBuilder extends BaseReplicateBuilder {
  getSupportedModels(): ModelKey[] {
    return [ModelKey.REPLICATE_GOOGLE_VEO_3, ModelKey.REPLICATE_OPENAI_SORA_2];
  }

  buildPrompt(
    _model: ModelKey,
    _params: PromptBuilderParams,
    _promptText: string,
  ): ReplicateInput {
    return { prompt: 'test' };
  }

  // Expose protected methods for testing
  public testNormalizeVeoResolution(resolution?: string): string {
    return this.normalizeVeoResolution(resolution);
  }

  public testNormalizeWanResolution(resolution?: string): string {
    return this.normalizeWanResolution(resolution);
  }

  public testGetNegativePrompt(blacklist?: string[]): string {
    return this.getNegativePrompt(blacklist);
  }
}

describe('BaseReplicateBuilder', () => {
  let builder: TestReplicateBuilder;

  beforeEach(() => {
    const configService = {} as ConfigService;
    builder = new TestReplicateBuilder(configService);
  });

  it('should be defined', () => {
    expect(builder).toBeDefined();
  });

  describe('getProvider', () => {
    it('should return REPLICATE provider', () => {
      expect(builder.getProvider()).toBe(ModelProvider.REPLICATE);
    });
  });

  describe('supportsModel', () => {
    it('should return true for supported models', () => {
      expect(builder.supportsModel(ModelKey.REPLICATE_GOOGLE_VEO_3)).toBe(true);
      expect(builder.supportsModel(ModelKey.REPLICATE_OPENAI_SORA_2)).toBe(
        true,
      );
    });

    it('should return false for unsupported models', () => {
      expect(builder.supportsModel(ModelKey.REPLICATE_META_MUSICGEN)).toBe(
        false,
      );
    });
  });

  describe('normalizeVeoResolution', () => {
    it('should default to 720p when undefined', () => {
      expect(builder.testNormalizeVeoResolution()).toBe('720p');
    });

    it('should map "high" to "1080p"', () => {
      expect(builder.testNormalizeVeoResolution('high')).toBe('1080p');
    });

    it('should map "standard" to "720p"', () => {
      expect(builder.testNormalizeVeoResolution('standard')).toBe('720p');
    });

    it('should pass through "720p" and "1080p"', () => {
      expect(builder.testNormalizeVeoResolution('720p')).toBe('720p');
      expect(builder.testNormalizeVeoResolution('1080p')).toBe('1080p');
    });

    it('should default unknown values to 720p', () => {
      expect(builder.testNormalizeVeoResolution('4k')).toBe('720p');
      expect(builder.testNormalizeVeoResolution('unknown')).toBe('720p');
    });
  });

  describe('normalizeWanResolution', () => {
    it('should default to 720p when undefined', () => {
      expect(builder.testNormalizeWanResolution()).toBe('720p');
    });

    it('should keep 480p', () => {
      expect(builder.testNormalizeWanResolution('480p')).toBe('480p');
    });

    it('should keep 720p', () => {
      expect(builder.testNormalizeWanResolution('720p')).toBe('720p');
    });

    it('should downgrade 1080p to 720p', () => {
      expect(builder.testNormalizeWanResolution('1080p')).toBe('720p');
    });

    it('should map "high" to 720p', () => {
      expect(builder.testNormalizeWanResolution('high')).toBe('720p');
    });

    it('should map "standard" to 720p', () => {
      expect(builder.testNormalizeWanResolution('standard')).toBe('720p');
    });

    it('should default unknown values to 720p', () => {
      expect(builder.testNormalizeWanResolution('4k')).toBe('720p');
    });
  });

  describe('getNegativePrompt', () => {
    it('should return empty string for undefined blacklist', () => {
      expect(builder.testGetNegativePrompt()).toBe('');
    });

    it('should return empty string for empty array', () => {
      expect(builder.testGetNegativePrompt([])).toBe('');
    });

    it('should join blacklist items with comma', () => {
      expect(builder.testGetNegativePrompt(['nsfw', 'violence'])).toBe(
        'nsfw,violence',
      );
    });

    it('should handle single item', () => {
      expect(builder.testGetNegativePrompt(['blur'])).toBe('blur');
    });
  });
});
