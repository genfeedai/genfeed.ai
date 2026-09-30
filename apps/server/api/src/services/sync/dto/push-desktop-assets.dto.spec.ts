import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { PushDesktopAssetsDto } from '@api/services/sync/dto/push-desktop-assets.dto';
import type { IValidationErrorResponse } from '@genfeedai/contracts/interfaces';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';

const MAX_ASSETS = 500;

const metadata: ArgumentMetadata = {
  metatype: PushDesktopAssetsDto,
  type: 'body',
};

function buildBody(assetCount: number) {
  return {
    assets: Array.from({ length: assetCount }, (_value, index) => ({
      createdAt: '2026-07-01T00:00:00.000Z',
      displayName: `asset-${index}`,
      id: `asset-${index}`,
      kind: 'image',
      mimeType: 'image/png',
      organizationId: 'organization-1',
      origin: 'local-import',
      residency: 'local-only',
      sha256: `sha-${index}`,
      sizeBytes: 1024,
      updatedAt: '2026-07-01T00:00:00.000Z',
      uploadPolicy: 'full',
    })),
  };
}

describe('PushDesktopAssetsDto', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe();
  });

  it(`accepts an assets array at the ${MAX_ASSETS} limit`, async () => {
    await expect(
      pipe.transform(buildBody(MAX_ASSETS), metadata),
    ).resolves.toBeInstanceOf(PushDesktopAssetsDto);
  });

  it('rejects an over-limit assets array with a 400', async () => {
    const error = await pipe
      .transform(buildBody(MAX_ASSETS + 1), metadata)
      .then(
        () => null,
        (thrown: unknown) => thrown as BadRequestException,
      );

    expect(error).toBeInstanceOf(BadRequestException);

    const response = error?.getResponse() as IValidationErrorResponse;

    expect(
      response.errors.find((entry) => entry.property === 'assets')?.constraints,
    ).toHaveProperty('arrayMaxSize');
  });
});
