/**
 * Fixture loading for the text suites. Everything a row needs is checked here,
 * before a dispatcher exists, so a bad row never surfaces after earlier rows
 * have already spent money.
 */

import type { LoadedFixture, SuiteName } from '../contracts';
import { loadFixture } from '../fixtures';
import { compileOutputSchema } from '../scorers/deterministic';
import { resolvePointwiseRubric } from '../scorers/judge';
import { assertRubricMayGate } from '../scorers/rubrics';

export function loadTextFixture(path: string, suite: SuiteName): LoadedFixture {
  const fixture = loadFixture(path);
  for (const row of fixture.rows) {
    const rubric = resolvePointwiseRubric(row.rubricVersion);
    if (suite !== 'judge') assertRubricMayGate(rubric);
    if (row.input.brief.outputJsonSchema) {
      compileOutputSchema(row.input.brief.outputJsonSchema);
    }
    if (suite === 'judge' && !row.input.output) {
      throw new Error(
        `${fixture.path}: judge row ${row.id} needs input.output (the text to score)`,
      );
    }
  }

  return fixture;
}
