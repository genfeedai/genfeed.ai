import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { PushDesktopSyncOpsDto } from '@api/services/sync/dto/push-desktop-sync-ops.dto';
import type { IValidationErrorResponse } from '@genfeedai/contracts/interfaces';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';

const MAX_SYNC_OPS = 500;

const metadata: ArgumentMetadata = {
  metatype: PushDesktopSyncOpsDto,
  type: 'body',
};

function buildBody(opCount: number) {
  return {
    ops: Array.from({ length: opCount }, (_value, index) => ({
      createdAt: '2026-07-01T00:00:00.000Z',
      entityId: `entity-${index}`,
      entityType: 'thread',
      id: `op-${index}`,
      operation: 'update',
      status: 'pending',
      updatedAt: '2026-07-01T00:00:00.000Z',
    })),
  };
}

describe('PushDesktopSyncOpsDto', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe();
  });

  it(`accepts an ops array at the ${MAX_SYNC_OPS} limit`, async () => {
    await expect(
      pipe.transform(buildBody(MAX_SYNC_OPS), metadata),
    ).resolves.toBeInstanceOf(PushDesktopSyncOpsDto);
  });

  it('rejects an over-limit ops array with a 400', async () => {
    const error = await pipe
      .transform(buildBody(MAX_SYNC_OPS + 1), metadata)
      .then(
        () => null,
        (thrown: unknown) => thrown as BadRequestException,
      );

    expect(error).toBeInstanceOf(BadRequestException);

    const response = error?.getResponse() as IValidationErrorResponse;

    expect(
      response.errors.find((entry) => entry.property === 'ops')?.constraints,
    ).toHaveProperty('arrayMaxSize');
  });
});
