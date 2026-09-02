import { CreateCaptionDto } from '@api/collections/captions/dto/create-caption.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { CaptionFormat } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';

describe('CreateCaptionDto', () => {
  it('maps the client ingredient field onto ingredientId before validation', async () => {
    const pipe = new ValidationPipe();
    const ingredientId = testId('ingredient');

    const result = (await pipe.transform(
      {
        format: CaptionFormat.SRT,
        ingredient: ingredientId,
        language: 'en',
      },
      { metatype: CreateCaptionDto, type: 'body' },
    )) as CreateCaptionDto;

    expect(result.ingredientId).toBe(ingredientId);
    expect(result.format).toBe(CaptionFormat.SRT);
    expect(result.language).toBe('en');
  });
});
