import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import {
  TurboRunAction,
  TurboRunActionDto,
} from '@api/services/turbo-run/dto/turbo-run-action.dto';
import type { IValidationErrorResponse } from '@genfeedai/contracts/interfaces';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';

const MAX_TURBO_RUN_ACTION_ITEMS = 100;

const metadata: ArgumentMetadata = {
  metatype: TurboRunActionDto,
  type: 'body',
};

function buildBody(itemCount: number) {
  return {
    action: TurboRunAction.APPROVE,
    itemIds: Array.from(
      { length: itemCount },
      (_value, index) => `item-${index}`,
    ),
  };
}

describe('TurboRunActionDto', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe();
  });

  it(`accepts an itemIds array at the ${MAX_TURBO_RUN_ACTION_ITEMS} limit`, async () => {
    await expect(
      pipe.transform(buildBody(MAX_TURBO_RUN_ACTION_ITEMS), metadata),
    ).resolves.toBeInstanceOf(TurboRunActionDto);
  });

  it('rejects an over-limit itemIds array with a 400', async () => {
    const error = await pipe
      .transform(buildBody(MAX_TURBO_RUN_ACTION_ITEMS + 1), metadata)
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
