import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { AssignBatchItemDto } from '@api/services/batch-generation/dto/assign-batch-item.dto';
import type { IValidationErrorResponse } from '@genfeedai/contracts/interfaces';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

const metadata: ArgumentMetadata = {
  metatype: AssignBatchItemDto,
  type: 'body',
};

describe('AssignBatchItemDto', () => {
  const pipe = new ValidationPipe();

  it('accepts a canonical user id', async () => {
    await expect(
      pipe.transform({ assigneeId: 'user-1' }, metadata),
    ).resolves.toBeInstanceOf(AssignBatchItemDto);
  });

  it('rejects a missing assigneeId', async () => {
    const error = await pipe.transform({}, metadata).then(
      () => null,
      (thrown: unknown) => thrown as BadRequestException,
    );

    expect(error).toBeInstanceOf(BadRequestException);

    const response = error?.getResponse() as IValidationErrorResponse;
    expect(
      response.errors.find((entry) => entry.property === 'assigneeId')
        ?.constraints,
    ).toBeDefined();
  });
});
