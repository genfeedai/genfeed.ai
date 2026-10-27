import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadTextFixture } from './text-fixture';

function claimFixture(): string {
  const directory = mkdtempSync(join(tmpdir(), 'content-eval-claims-'));
  const fixturePath = join(directory, 'claims.jsonl');
  writeFileSync(
    fixturePath,
    `${JSON.stringify({
      brandFixtureId: 'synthetic-kelder',
      contentKind: 'social-post',
      id: 'claims-1',
      input: { output: 'Our skillet is here.', prompt: 'Announce a skillet.' },
      rubricVersion: 'content-claims-v1',
      source: { reference: 'synthetic:kelder', visibility: 'synthetic' },
    })}\n`,
  );
  return fixturePath;
}

describe('loadTextFixture', () => {
  it('keeps an uncalibrated claim rubric out of gating suites (#5604)', () => {
    const fixturePath = claimFixture();

    expect(() => loadTextFixture(fixturePath, 'ladder')).toThrow(
      'no calibration report',
    );
    expect(loadTextFixture(fixturePath, 'judge').rows).toHaveLength(1);
  });
});
