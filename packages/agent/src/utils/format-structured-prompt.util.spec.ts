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
  it('returns blank input untouched', () => {
    expect(formatStructuredPrompt('   ')).toBe('   ');
  });
});
