import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type { ReplicateInput } from '@api/services/prompt-builder/interfaces/replicate-input.interface';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { ConfigService } from '@libs/config/config.service';
import { BaseReplicateBuilder } from './base-replicate.builder';

class TestReplicateBuilder extends BaseReplicateBuilder {
  getSupportedModels(): string[] {
    return [
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
      MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
    ];
  }

  buildPrompt(
    _model: string,
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

  describe('supportsModel', () => {
    it('should return true for supported models', () => {
      expect(builder.supportsModel(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3)).toBe(
        true,
      );
      expect(builder.supportsModel(MODEL_KEYS.REPLICATE_OPENAI_SORA_2)).toBe(
        true,
      );
    });
  });

  describe('normalizeVeoResolution', () => {
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
    it('should keep 480p', () => {
      expect(builder.testNormalizeWanResolution('480p')).toBe('480p');
    });

    it('should keep 720p', () => {
      expect(builder.testNormalizeWanResolution('720p')).toBe('720p');
    });

    it('should default unknown values to 720p', () => {
      expect(builder.testNormalizeWanResolution('4k')).toBe('720p');
    });
  });
});
