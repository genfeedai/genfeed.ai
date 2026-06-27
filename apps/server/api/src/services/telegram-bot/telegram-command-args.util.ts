/**
 * Telegram command-argument helper.
 *
 * Extracts the free-text argument that follows a slash command, e.g.
 * `/generate a cat` → `a cat`.
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

  const firstSpace = messageText.indexOf(' ');
  if (firstSpace === -1) {
    return '';
  }

  return messageText.slice(firstSpace + 1).trim();
}
