/**
 * Telegram command-argument helper.
 *
 * Extracts the free-text argument that follows a slash command, e.g.
 * `/connect gf_example` → `gf_example`.
 */

import type { Context } from 'grammy';

export function extractCommandArgs(ctx: Context): string {
  const messageText =
    'message' in ctx && ctx.message && 'text' in ctx.message
      ? ctx.message.text
      : '';

  if (!messageText) {
    return '';
  }

  const firstWhitespace = messageText.search(/\s/);
  if (firstWhitespace === -1) {
    return '';
  }

  return messageText.slice(firstWhitespace + 1).trim();
}
