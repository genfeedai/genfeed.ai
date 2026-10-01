import { LearningRunControlDto } from '@api/collections/content-learning/dto/learning-run.dto';
import {
  FORBID_NON_WHITELISTED,
  ValidationPipe,
} from '@api/helpers/pipes/validation.pipe';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('LearningRunControlDto', () => {
  it('rejects unknown control fields instead of stripping them', async () => {
    expect(LearningRunControlDto[FORBID_NON_WHITELISTED]).toBe(true);
    const pipe = new ValidationPipe();
    await expect(
      pipe.transform(
        { requestId: '11111111-1111-4111-8111-111111111111', extra: true },
        { metatype: LearningRunControlDto, type: 'body' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
