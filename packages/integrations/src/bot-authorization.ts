import type { OrgIntegration } from './types';

/**
 * The subset of an integration's config that decides who may drive its bot.
 */
export type BotAuthorizationConfig = Pick<
  OrgIntegration['config'],
  'allowedUserIds' | 'isOpenToAllUsers'
>;

/**
 * Whether an integration effectively accepts commands from any platform user.
 *
 * An empty `allowedUserIds` is NOT an opt-in — it is an unconfigured allowlist,
 * and unconfigured means closed. Only the explicit `isOpenToAllUsers` flag opens
 * a bot to everyone, and a populated allowlist still overrides it.
 *
 * Call sites use this to warn at bot startup, so an intentionally open bot is
 * visible in the logs rather than silently inherited from a blank config.
 */
export function isBotOpenToAllUsers(config: BotAuthorizationConfig): boolean {
  const allowedUserIds = config.allowedUserIds ?? [];

  return allowedUserIds.length === 0 && config.isOpenToAllUsers === true;
}

/**
 * Decide whether a platform user may drive an integration's bot.
 *
 * Precedence, deny-by-default:
 * 1. A non-empty `allowedUserIds` is authoritative — only those ids pass, even
 *    when `isOpenToAllUsers` is set. The narrower rule always wins.
 * 2. An empty (or absent) allowlist denies everyone unless `isOpenToAllUsers`
 *    is explicitly `true`.
 *
 * A missing/blank `userId` never passes, so a platform payload that omits the
 * actor cannot slip through an open bot's check.
 */
export function isBotUserAuthorized(
  config: BotAuthorizationConfig,
  userId: string | undefined | null,
): boolean {
  if (!userId) {
    return false;
  }

  const allowedUserIds = config.allowedUserIds ?? [];

  if (allowedUserIds.length > 0) {
    return allowedUserIds.includes(userId);
  }

  return isBotOpenToAllUsers(config);
}
