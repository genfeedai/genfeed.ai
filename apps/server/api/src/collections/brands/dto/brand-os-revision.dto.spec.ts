import { ApproveBrandOsRevisionDto } from '@api/collections/brands/dto/brand-os-revision.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const updatedAt = '2026-10-02T04:30:00.000Z';
const hash = `sha256:${'a'.repeat(64)}`;

describe('ApproveBrandOsRevisionDto', () => {
  it.each([undefined, hash])(
    'accepts omission or an exact digest: %s',
    async (reviewedGenerationRulesHash) => {
      const dto = plainToInstance(ApproveBrandOsRevisionDto, {
        updatedAt,
        reviewedGenerationRulesHash,
      });
      expect(await validate(dto, { whitelist: true })).toEqual([]);
      expect(dto.reviewedGenerationRulesHash).toBe(reviewedGenerationRulesHash);
    },
  );

  it.each([
    null,
    '',
    ` ${hash}`,
    `${hash} `,
    `${hash}\n`,
    `sha256:${'A'.repeat(64)}`,
    'a'.repeat(64),
    'sha256:abcd',
    [],
    [hash],
    7,
    {},
  ])(
    'rejects malformed or null review acknowledgement: %j',
    async (reviewedGenerationRulesHash) => {
      const dto = plainToInstance(ApproveBrandOsRevisionDto, {
        updatedAt,
        reviewedGenerationRulesHash,
      });
      const errors = await validate(dto, { whitelist: true });
      expect(errors.map((error) => error.property)).toContain(
        'reviewedGenerationRulesHash',
      );
    },
  );

  it.each([undefined, null, '', 'yesterday'])(
    'still requires an ISO concurrency token: %j',
    async (updatedAt) => {
      const dto = plainToInstance(ApproveBrandOsRevisionDto, {
        updatedAt,
        reviewedGenerationRulesHash: hash,
      });
      expect((await validate(dto)).map((error) => error.property)).toContain(
        'updatedAt',
      );
    },
  );
});
