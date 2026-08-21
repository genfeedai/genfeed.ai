import { describe, expect, it } from 'vitest';
import { parseStudioRemixRunId } from './studio-remix-run-url';

describe('parseStudioRemixRunId', () => {
  it('restores one opaque run id from the Studio URL', () => {
    expect(parseStudioRemixRunId(new URLSearchParams('run=run_01.ab-c'))).toBe(
      'run_01.ab-c',
    );
  });

  it('rejects copied briefs, urls, and malformed identifiers', () => {
    expect(
      parseStudioRemixRunId(
        new URLSearchParams('run=https%3A%2F%2Fexample.com%2Frun%2F1'),
      ),
    ).toBeNull();
    expect(
      parseStudioRemixRunId(
        new URLSearchParams('run=%7B%22objective%22%3A%22copied%22%7D'),
      ),
    ).toBeNull();
    expect(parseStudioRemixRunId(new URLSearchParams('run='))).toBeNull();
  });
});
