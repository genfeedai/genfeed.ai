import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { CreateManualReviewBatchDto } from '@api/services/batch-generation/dto/create-manual-review-batch.dto';
import type { IValidationErrorResponse } from '@genfeedai/contracts/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';

const MAX_REVIEW_ITEMS = 100;

const metadata: ArgumentMetadata = {
  metatype: CreateManualReviewBatchDto,
  type: 'body',
};

function buildBody(itemCount: number) {
  return {
    brandId: testId('brand'),
    items: Array.from({ length: itemCount }, (_value, index) => ({
      format: 'post',
      label: `Review item ${index}`,
    })),
  };
}

describe('CreateManualReviewBatchDto', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe();
  });

  it(`accepts an items array at the ${MAX_REVIEW_ITEMS} limit`, async () => {
    await expect(
      pipe.transform(buildBody(MAX_REVIEW_ITEMS), metadata),
    ).resolves.toBeInstanceOf(CreateManualReviewBatchDto);
  });

  it('rejects an over-limit items array with a 400', async () => {
    const error = await pipe
      .transform(buildBody(MAX_REVIEW_ITEMS + 1), metadata)
      .then(
        () => null,
        (thrown: unknown) => thrown as BadRequestException,
      );

    expect(error).toBeInstanceOf(BadRequestException);

    const response = error?.getResponse() as IValidationErrorResponse;

    expect(
      response.errors.find((entry) => entry.property === 'items')?.constraints,
    ).toHaveProperty('arrayMaxSize');
  });
});
