import { EvaluateContentDto } from '@api/collections/evaluations/dto/evaluate-content.dto';
import { EvaluationType } from '@genfeedai/contracts';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * The evaluate endpoints read the content from the route
 * (`POST /evaluations/posts/:postId`), so the body only picks the evaluation
 * type. The app posts `{}`.
 */
describe('EvaluateContentDto', () => {
  it.each([
    ['an empty body', {}],
    ['an evaluation type', { evaluationType: EvaluationType.PRE_PUBLICATION }],
  ])('accepts %s', async (_label, body) => {
    await expect(
      validate(plainToInstance(EvaluateContentDto, body)),
    ).resolves.toEqual([]);
  });

  it('rejects an unknown evaluation type', async () => {
    const errors = await validate(
      plainToInstance(EvaluateContentDto, { evaluationType: 'vibes' }),
    );

    expect(errors.map((error) => error.property)).toEqual(['evaluationType']);
  });
});
