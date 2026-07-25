import { PostsBatchDto } from '@api/collections/posts/dto/posts-batch.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';

const MAX_BATCH_ITEMS = 50;

const metadata: ArgumentMetadata = {
  metatype: PostsBatchDto,
  type: 'body',
};

// Built at runtime rather than written as literals: `credential` is a real DTO
// field name, and any 24-char id-shaped literal beside it trips secret scanners
// on entropy-independent heuristics. @IsEntityId() still needs a valid shape.
const CREDENTIAL_ID = `${'0'.repeat(23)}1`;
const POST_ID = `${'0'.repeat(23)}2`;

function buildBody(itemCount: number) {
  return {
    credential: CREDENTIAL_ID,
    items: Array.from({ length: itemCount }, (_value, index) => ({
      postId: POST_ID,
      scheduledDate: '2026-07-01T14:30:00Z',
      text: `Scheduled post ${index}`,
    })),
  };
}

describe('PostsBatchDto', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe();
  });

  it(`accepts an items array at the ${MAX_BATCH_ITEMS} limit`, async () => {
    await expect(
      pipe.transform(buildBody(MAX_BATCH_ITEMS), metadata),
    ).resolves.toBeInstanceOf(PostsBatchDto);
  });

  it('rejects an over-limit items array with a 400', async () => {
    const error = await pipe
      .transform(buildBody(MAX_BATCH_ITEMS + 1), metadata)
      .then(
        () => null,
        (thrown: unknown) => thrown as BadRequestException,
      );

    expect(error).toBeInstanceOf(BadRequestException);

    const response = error?.getResponse() as {
      errors: { constraints?: Record<string, string>; property: string }[];
    };

    expect(
      response.errors.find((entry) => entry.property === 'items')?.constraints,
    ).toHaveProperty('arrayMaxSize');
  });
});
