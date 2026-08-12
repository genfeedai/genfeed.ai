import {
  USER_MESSAGE_COLLAPSE_MAX_CHARS,
  USER_MESSAGE_COLLAPSE_MAX_LINES,
} from '@genfeedai/agent/constants/agent-message-collapse.constant';
import { describe, expect, it } from 'vitest';

import { shouldCollapseUserMessage } from './should-collapse-user-message';

describe('shouldCollapseUserMessage', () => {
  it('does not collapse a short single-line prompt', () => {
    expect(shouldCollapseUserMessage('Plan this week of content')).toBe(false);
  });

  it('collapses once the character cap is exceeded', () => {
    expect(
      shouldCollapseUserMessage(
        'x'.repeat(USER_MESSAGE_COLLAPSE_MAX_CHARS + 1),
      ),
    ).toBe(true);
  });

  it('does not collapse at the exact character cap', () => {
    expect(
      shouldCollapseUserMessage('x'.repeat(USER_MESSAGE_COLLAPSE_MAX_CHARS)),
    ).toBe(false);
  });

  it('collapses once the line cap is exceeded even when under the character cap', () => {
    const lines = Array.from(
      { length: USER_MESSAGE_COLLAPSE_MAX_LINES + 1 },
      (_, index) => `line ${index + 1}`,
    ).join('\n');

    expect(lines.length).toBeLessThan(USER_MESSAGE_COLLAPSE_MAX_CHARS);
    expect(shouldCollapseUserMessage(lines)).toBe(true);
  });

  it('does not collapse at the exact line cap', () => {
    const lines = Array.from(
      { length: USER_MESSAGE_COLLAPSE_MAX_LINES },
      (_, index) => `line ${index + 1}`,
    ).join('\n');

    expect(shouldCollapseUserMessage(lines)).toBe(false);
  });

  it('does not collapse an empty string', () => {
    expect(shouldCollapseUserMessage('')).toBe(false);
  });
});
