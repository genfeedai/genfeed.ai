import { GenerateArticlesDto } from '@api/collections/articles/dto/generate-articles.dto';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { testId } from '@helpers/testing/test-id.helper';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const brandId = testId('brand');

describe('GenerateArticlesDto', () => {
  describe('validation', () => {
    /**
     * The API's ValidationPipe validates with `whitelist: true` and no
     * `forbidNonWhitelisted`, so an undeclared key is deleted without an error
     * or a log. `model` therefore has to be a declared, decorated field or the
     * agent's `generationModelOverride` silently never reaches generation.
     */
    it('keeps the per-request generation model through whitelist stripping', async () => {
      const dto = plainToInstance(GenerateArticlesDto, {
        model: MODEL_KEYS.REPLICATE_ANTHROPIC_CLAUDE_4_5_SONNET,
        prompt: 'AI infrastructure trends',
      });

      const errors = await validate(dto, { whitelist: true });

      expect(errors).toHaveLength(0);
      expect(dto.model).toBe(MODEL_KEYS.REPLICATE_ANTHROPIC_CLAUDE_4_5_SONNET);
    });

    it('keeps an optional brandId through whitelist stripping', async () => {
      const dto = plainToInstance(GenerateArticlesDto, {
        brandId,
        prompt: 'AI infrastructure trends',
      });

      const errors = await validate(dto, { whitelist: true });

      expect(errors).toHaveLength(0);
      expect(dto.brandId).toBe(brandId);
    });

    it('accepts a request without a generation model', async () => {
      const dto = plainToInstance(GenerateArticlesDto, {
        prompt: 'AI infrastructure trends',
      });

      const errors = await validate(dto, { whitelist: true });

      expect(errors).toHaveLength(0);
      expect(dto.model).toBeUndefined();
    });
  });
});
