import { formatStructuredPrompt } from '@genfeedai/agent/utils/format-structured-prompt.util';
import { describe, expect, it } from 'vitest';

/**
 * Verbatim shape of a `prepare_generation` prompt as it is persisted in
 * `agent_messages.metadata.uiActions[].generationParams.prompt`.
 */
const PERSISTED_PROMPT = [
  'SCENE: Wide social media banner for a crypto news brand.',
  '',
  'SUBJECT: Large display typography reading "FUD NEWS", 16:9 wide format.',
  '',
  'BACKGROUND: Deep gradient from near-black to dark blue-gray.',
  '',
  'NEGATIVE: No watermark, no extra logos.',
].join('\n');

describe('formatStructuredPrompt', () => {
  it('preserves the blank lines a well-formed prompt already has', () => {
    expect(formatStructuredPrompt(PERSISTED_PROMPT)).toBe(PERSISTED_PROMPT);
  });

  it('is idempotent', () => {
    const once = formatStructuredPrompt(PERSISTED_PROMPT);

    expect(formatStructuredPrompt(once)).toBe(once);
  });

  it('breaks run-on labels onto their own block', () => {
    expect(
      formatStructuredPrompt('SCENE: A wide banner. SUBJECT: Bold type.'),
    ).toBe('SCENE: A wide banner.\n\nSUBJECT: Bold type.');
  });

  it('promotes a single newline before a label to a blank line', () => {
    expect(
      formatStructuredPrompt('SCENE: A wide banner.\nSUBJECT: Bold type.'),
    ).toBe('SCENE: A wide banner.\n\nSUBJECT: Bold type.');
  });

  it('expands literal \\n escapes', () => {
    expect(formatStructuredPrompt('SCENE: A banner.\\nSUBJECT: Bold.')).toBe(
      'SCENE: A banner.\n\nSUBJECT: Bold.',
    );
  });

  it('leaves a numeric ratio inside a block untouched', () => {
    expect(
      formatStructuredPrompt('STYLE: Crisp edges, 16:9 wide format.'),
    ).toBe('STYLE: Crisp edges, 16:9 wide format.');
  });

  it('collapses runs of more than one blank line', () => {
    expect(
      formatStructuredPrompt('SCENE: A banner.\n\n\n\nSUBJECT: Bold.'),
    ).toBe('SCENE: A banner.\n\nSUBJECT: Bold.');
  });

  it('returns blank input untouched', () => {
    expect(formatStructuredPrompt('   ')).toBe('   ');
  });
});
