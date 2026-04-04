import { sanitizeAgentOutputText } from '@api/services/agent-orchestrator/utils/sanitize-agent-output.util';
import { describe, expect, it } from 'vitest';

describe('sanitizeAgentOutputText', () => {
  it('removes simple emoji from text', () => {
    expect(sanitizeAgentOutputText('Great work 🚀')).toBe('Great work');
  });

  it('removes zwj and skin-tone emoji sequences', () => {
    const input = 'Team 👨🏽‍💻 shipped it 👩🏻‍💻 today';
    expect(sanitizeAgentOutputText(input)).toBe('Team shipped it today');
  });

  it('preserves markdown text and punctuation', () => {
    const input = '## Update ✅\n- Item one\n- Item two 🎯';
    expect(sanitizeAgentOutputText(input)).toBe(
      '## Update\n- Item one\n- Item two',
    );
  });

  it('returns empty string as-is', () => {
    expect(sanitizeAgentOutputText('')).toBe('');
  });
});
