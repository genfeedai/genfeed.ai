import {
  USER_MESSAGE_COLLAPSE_MAX_CHARS,
  USER_MESSAGE_COLLAPSE_MAX_LINES,
} from '@genfeedai/agent/constants/agent-message-collapse.constant';

/**
 * Whether a user prompt should start collapsed behind Show more (#2791).
 *
 * Count is conservative: any of `\n`, `\r\n`, or `\r` is a line break, and a
 * trailing newline still counts as an extra visual line so a pasted 8-line
 * block with a final `\n` collapses instead of peeking a 9th blank row.
 */
export function shouldCollapseUserMessage(content: string): boolean {
  if (content.length > USER_MESSAGE_COLLAPSE_MAX_CHARS) {
    return true;
  }

  return countVisualLines(content) > USER_MESSAGE_COLLAPSE_MAX_LINES;
}

function countVisualLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }

  let lines = 1;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '\n') {
      lines += 1;
      continue;
    }
    if (character === '\r') {
      lines += 1;
      if (content[index + 1] === '\n') {
        index += 1;
      }
    }
  }

  return lines;
}
