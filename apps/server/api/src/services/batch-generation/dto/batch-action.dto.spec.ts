import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import {
  BatchAction,
  BatchActionDto,
} from '@api/services/batch-generation/dto/batch-action.dto';
import type { IValidationErrorResponse } from '@genfeedai/contracts/interfaces';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';

const MAX_BATCH_ACTION_ITEMS = 100;

const metadata: ArgumentMetadata = {
  metatype: BatchActionDto,
  type: 'body',
};

function buildBody(itemCount: number) {
  return {
    action: BatchAction.APPROVE,
    itemIds: Array.from(
      { length: itemCount },
      (_value, index) => `item-${index}`,
    ),
  };
}

describe('BatchActionDto', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe();
  });

  it(`accepts an itemIds array at the ${MAX_BATCH_ACTION_ITEMS} limit`, async () => {
    await expect(
      pipe.transform(buildBody(MAX_BATCH_ACTION_ITEMS), metadata),
    ).resolves.toBeInstanceOf(BatchActionDto);
  });

  it('rejects an over-limit itemIds array with a 400', async () => {
    const error = await pipe
      .transform(buildBody(MAX_BATCH_ACTION_ITEMS + 1), metadata)
      .then(
        () => null,
        (thrown: unknown) => thrown as BadRequestException,
      );

    expect(error).toBeInstanceOf(BadRequestException);

    const response = error?.getResponse() as IValidationErrorResponse;

    expect(
      response.errors.find((entry) => entry.property === 'itemIds')
        ?.constraints,
    ).toHaveProperty('arrayMaxSize');
  });
});
