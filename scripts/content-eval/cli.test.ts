import { describe, expect, it } from 'vitest';
import { parseCliArgs, UsageError } from './cli';

const BASE = [
  '--suite=ladder',
  '--fixture=fixture.jsonl',
  '--judge=anthropic/claude-sonnet-5',
  '--models=google/gemini-2.5-flash-lite,openai/gpt-5.6-luna',
];

describe('parseCliArgs', () => {
  it('refuses to run without a spend cap', () => {
    expect(() => parseCliArgs(BASE)).toThrow(UsageError);
    expect(() => parseCliArgs(BASE)).toThrow(/--max-credits is required/);
  });

  it('refuses a zero or non-numeric cap', () => {
    expect(() => parseCliArgs([...BASE, '--max-credits=0'])).toThrow(
      'must be positive',
    );
    expect(() => parseCliArgs([...BASE, '--max-credits=lots'])).toThrow(
      'must be a number',
    );
  });

  it('parses a complete invocation with defaults', () => {
    expect(parseCliArgs([...BASE, '--max-credits=5'])).toEqual({
      dispatcherKind: 'stub',
      fixturePath: 'fixture.jsonl',
      judgeRegistryKeys: ['anthropic/claude-sonnet-5'],
      maxCredits: 5,
      models: ['google/gemini-2.5-flash-lite', 'openai/gpt-5.6-luna'],
      out: null,
      seed: 1,
      suite: 'ladder',
      tieBand: 0.05,
    });
  });

  it('rejects an unknown suite', () => {
    expect(() =>
      parseCliArgs([
        '--max-credits=5',
        '--suite=vibes',
        '--fixture=f.jsonl',
        '--judge=anthropic/claude-sonnet-5',
      ]),
    ).toThrow('--suite must be one of');
  });
});
