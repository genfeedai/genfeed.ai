import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { AssignTurboRunItemDto } from '@api/services/turbo-run/dto/assign-turbo-run-item.dto';
import type { IValidationErrorResponse } from '@genfeedai/contracts/interfaces';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

const metadata: ArgumentMetadata = {
  metatype: AssignTurboRunItemDto,
  type: 'body',
};

describe('AssignTurboRunItemDto', () => {
  const pipe = new ValidationPipe();

  it('accepts a canonical user id', async () => {
    await expect(
      pipe.transform({ assigneeId: 'user-1' }, metadata),
    ).resolves.toBeInstanceOf(AssignTurboRunItemDto);
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
