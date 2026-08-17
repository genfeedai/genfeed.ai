import { ManualInputDto } from '@api/collections/content-performance/dto/manual-input.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { ContentType, CredentialPlatform } from '@genfeedai/enums';
import type { IValidationErrorResponse } from '@genfeedai/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';

const MAX_MANUAL_ENTRIES = 50;

const metadata: ArgumentMetadata = {
  metatype: ManualInputDto,
  type: 'body',
};

function buildBody(entryCount: number) {
  return {
    brandId: testId('brand'),
    entries: Array.from({ length: entryCount }, () => ({
      contentType: ContentType.IMAGE,
      measuredAt: '2026-07-01T00:00:00.000Z',
      platform: CredentialPlatform.INSTAGRAM,
      views: 10,
    })),
  };
}

describe('ManualInputDto', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe();
  });

  it(`accepts an entries array at the ${MAX_MANUAL_ENTRIES} limit`, async () => {
    await expect(
      pipe.transform(buildBody(MAX_MANUAL_ENTRIES), metadata),
    ).resolves.toBeInstanceOf(ManualInputDto);
  });

  it('rejects an over-limit entries array with a 400', async () => {
    await expect(
      pipe.transform(buildBody(MAX_MANUAL_ENTRIES + 1), metadata),
    ).rejects.toThrow(BadRequestException);
  });

  it('reports arrayMaxSize as the failing constraint', async () => {
    const error = await pipe
      .transform(buildBody(MAX_MANUAL_ENTRIES + 1), metadata)
      .then(
        () => null,
        (thrown: unknown) => thrown as BadRequestException,
      );

    const response = error?.getResponse() as IValidationErrorResponse;

    expect(
      response.errors.find((entry) => entry.property === 'entries')
        ?.constraints,
    ).toHaveProperty('arrayMaxSize');
  });
});
