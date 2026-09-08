import { describe, expect, it } from 'vitest';
import { evaluateTask } from './evaluate';
import { FIXTURE_METADATA, TASK_FIXTURES } from './fixtures';

describe('agent task contract fixtures', () => {
  it.each(TASK_FIXTURES)('$id: $task', (fixture) => {
    const result = evaluateTask(fixture);
    expect(result.actual).toEqual(fixture.expected);
    expect(result.passed).toBe(true);
  });
  it('fails the exact rubric when the expected policy is deliberately wrong', () => {
    const fixture = TASK_FIXTURES.find(
      (candidate) => candidate.id === 'safe-read',
    );
    if (!fixture) throw new Error('Missing safe-read fixture');
    expect(
      evaluateTask({
        ...fixture,
        expected: { deliberatelyIncorrect: true },
      } as typeof fixture).passed,
    ).toBe(false);
  });
  it('keeps fixture IDs unique and identifies non-model evidence explicitly', () => {
    expect(new Set(TASK_FIXTURES.map((fixture) => fixture.id)).size).toBe(
      TASK_FIXTURES.length,
    );
    expect(FIXTURE_METADATA.provider).toBe('none');
    expect(FIXTURE_METADATA.modelVersion).toBe('not-applicable');
  });
});
