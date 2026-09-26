import { describe, expect, it } from 'vitest';
import type { FixtureRow } from '../contracts';
import { fixtureRowSchema } from '../contracts';
import { hasPassedAll, runDeterministicChecks } from './deterministic';

function row(brief: Record<string, unknown>, platform?: string): FixtureRow {
  return fixtureRowSchema.parse({
    brandFixtureId: 'synthetic-kelder',
    contentKind: 'social-post',
    id: 'row-1',
    input: { brief, platform, prompt: 'Write a post.' },
    rubricVersion: 'content-quality-v1',
    source: { reference: 'synthetic:kelder', visibility: 'synthetic' },
  });
}

function byId(text: string, fixture: FixtureRow): Record<string, boolean> {
  return Object.fromEntries(
    runDeterministicChecks(text, fixture).map((check) => [
      check.id,
      check.passed,
    ]),
  );
}

describe('runDeterministicChecks', () => {
  it('enforces brief and platform length limits', () => {
    const fixture = row({ maxCharacters: 10, minCharacters: 3 }, 'twitter');

    expect(byId('short', fixture)).toMatchObject({
      'brief-max-length': true,
      'brief-min-length': true,
      'platform-max-length': true,
    });
    expect(byId('x'.repeat(300), fixture)).toMatchObject({
      'brief-max-length': false,
      'platform-max-length': false,
    });
  });

  it('flags banned phrases case-insensitively', () => {
    const fixture = row({ bannedPhrases: ['Game-Changer'] });
    expect(byId('A real game-changer.', fixture)['banned-phrases']).toBe(false);
    expect(byId('A calm skillet.', fixture)['banned-phrases']).toBe(true);
  });

  it('requires a CTA only when the brief asks for one', () => {
    expect(byId('A pan.', row({ isCtaRequired: true }))['cta-present']).toBe(
      false,
    );
    expect(
      byId('A pan. Shop now.', row({ isCtaRequired: true }))['cta-present'],
    ).toBe(true);
    expect(byId('A pan.', row({}))['cta-present']).toBeUndefined();
  });

  it('counts links and hashtags against their ranges', () => {
    const fixture = row({
      hashtagRange: { max: 1, min: 0 },
      linkRange: { max: 1, min: 1 },
    });

    expect(
      byId('See https://kelder.example #pans #iron', fixture),
    ).toMatchObject({ 'hashtag-count': false, 'link-count': true });
    expect(byId('No link #pans', fixture)).toMatchObject({
      'hashtag-count': true,
      'link-count': false,
    });
  });

  it('validates structured output against its JSON schema', () => {
    const fixture = row({
      outputJsonSchema: {
        properties: { slides: { items: { type: 'string' }, type: 'array' } },
        required: ['slides'],
        type: 'object',
      },
    });

    expect(byId('{"slides":["a","b"]}', fixture)['json-schema']).toBe(true);
    expect(byId('{"slides":"a"}', fixture)['json-schema']).toBe(false);
    expect(byId('not json', fixture)['json-schema']).toBe(false);
  });

  it('passes only when every check passes', () => {
    const fixture = row({ bannedPhrases: ['hype'] });
    expect(hasPassedAll(runDeterministicChecks('Calm.', fixture))).toBe(true);
    expect(hasPassedAll(runDeterministicChecks('', fixture))).toBe(false);
  });
});
