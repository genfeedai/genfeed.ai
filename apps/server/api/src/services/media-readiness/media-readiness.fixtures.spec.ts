import {
  buildReadinessSamples,
  scoreReadinessSamples,
} from '@api-test/fixtures/media-gates/readiness-samples.fixture';
import { PLATFORM_MEDIA_SPECS } from '@genfeedai/contracts/constants';

describe('media readiness against the seeded spec table (#4883)', () => {
  const results = scoreReadinessSamples(buildReadinessSamples());

  it('covers every seeded spec with a compliant and a probe-missing sample', () => {
    for (const spec of PLATFORM_MEDIA_SPECS) {
      const ids = results
        .map((result) => result.sample.id)
        .filter((id) => id.startsWith(`${spec.platform}/${spec.kind}/`));
      expect(ids).toEqual(
        expect.arrayContaining([
          `${spec.platform}/${spec.kind}/compliant`,
          `${spec.platform}/${spec.kind}/probe-missing`,
        ]),
      );
    }
  });

  it.each(results.map((result) => [result.sample.id, result] as const))(
    '%s',
    (_id, result) => {
      expect(
        result.isCorrect,
        `expected ${JSON.stringify(result.sample.expected)}, reported ${JSON.stringify(result.reported)}`,
      ).toBe(true);
    },
  );
});
