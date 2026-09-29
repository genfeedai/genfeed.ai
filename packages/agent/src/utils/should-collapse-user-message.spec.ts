import {
  USER_MESSAGE_COLLAPSE_MAX_CHARS,
  USER_MESSAGE_COLLAPSE_MAX_LINES,
} from '@genfeedai/agent/constants/agent-message-collapse.constant';
import { describe, expect, it } from 'vitest';

import { shouldCollapseUserMessage } from './should-collapse-user-message';

describe('shouldCollapseUserMessage', () => {
  it('collapses once the line cap is exceeded even when under the character cap', () => {
    const lines = Array.from(
      { length: USER_MESSAGE_COLLAPSE_MAX_LINES + 1 },
      (_, index) => `line ${index + 1}`,
    ).join('\n');

    expect(lines.length).toBeLessThan(USER_MESSAGE_COLLAPSE_MAX_CHARS);
    expect(shouldCollapseUserMessage(lines)).toBe(true);
  });

  it('does not collapse an empty string', () => {
    expect(shouldCollapseUserMessage('')).toBe(false);
  });
});
