/**
 * Quote posts on X: the target setting that names the post to quote, the
 * helpers that read it, and the codes and link for the case where X refuses a
 * quote through the API and the person posts it by hand.
 */

import { CredentialPlatform } from '../..';
import { parseSocialPostUrl } from '../../enums/social-post-url.util';
import { SocialSourcePlatform } from '../../enums/source-collector.enum';
import {
  type ChannelSettingDefinition,
  type ChannelValidationIssue,
  isMissingValue,
} from './channel-setting-validation.contract';

/** X target setting that carries the post a release quotes. */
export const QUOTED_POST_SETTING_KEY = 'quotedPost';

// X documents `quote_tweet_id` as ^[0-9]{1,19}$.
const X_POST_ID_PATTERN = /^[0-9]{1,19}$/;

/**
 * The X post id in a quoted-post setting, or `undefined` when the value is
 * neither a numeric id nor a link to an X post. A link is only read, never
 * fetched, so the value cannot steer a server-side request.
 */
export function parseXQuotedPostId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (X_POST_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }
  const reference = parseSocialPostUrl(trimmed);
  return reference?.platform === SocialSourcePlatform.TWITTER &&
    X_POST_ID_PATTERN.test(reference.postId)
    ? reference.postId
    : undefined;
}

/**
 * Stored target settings with the X quoted post reduced to its id, so a read
 * back shows the post that will be quoted whichever form the caller typed.
 * A blank value is dropped; a value that is not an X post stays as typed so
 * validation can name it. Other platforms pass through unchanged.
 */
export function normalizeChannelTargetSettings(
  platform: CredentialPlatform | string,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  if (platform !== CredentialPlatform.TWITTER) {
    return settings;
  }
  const { [QUOTED_POST_SETTING_KEY]: quoted, ...rest } = settings;
  if (isMissingValue(quoted)) {
    return rest;
  }
  return {
    ...rest,
    [QUOTED_POST_SETTING_KEY]: parseXQuotedPostId(quoted) ?? quoted,
  };
}

/** The `quoteTweetId` a target's settings write on its post, or `null`. */
export function resolveQuoteTweetId(
  platform: CredentialPlatform | string,
  settings: Record<string, unknown>,
): string | null {
  return platform === CredentialPlatform.TWITTER
    ? (parseXQuotedPostId(settings[QUOTED_POST_SETTING_KEY]) ?? null)
    : null;
}

/** Error code on a target when X refused to publish a quote post through the API. */
export const X_QUOTE_REFUSED_CODE = 'x_quote_refused';

/** Error code on a target whose quoted X post no longer exists. */
export const X_QUOTED_POST_UNAVAILABLE_CODE = 'x_quoted_post_unavailable';

/**
 * Failures the person resolves by posting by hand. The target stays FAILED with
 * the error kept, so it can be listed, reminded about and closed as posted or
 * skipped without a new execution state.
 */
export const MANUAL_POST_ERROR_CODES: readonly string[] = [
  X_QUOTE_REFUSED_CODE,
];

export function isManualPostErrorCode(
  code: string | null | undefined,
): boolean {
  return typeof code === 'string' && MANUAL_POST_ERROR_CODES.includes(code);
}

/**
 * X's web intent opens the composer, prefilled, in the person's own session.
 * The quoted post is added as a link to it. Nothing is sent until they press
 * Post in X.
 */
export function buildXQuoteIntentUrl(
  text: string,
  quotedPostId: string | null | undefined,
): string {
  const params = new URLSearchParams({ text });
  if (quotedPostId && X_POST_ID_PATTERN.test(quotedPostId)) {
    params.set('url', `https://x.com/i/status/${quotedPostId}`);
  }
  return `https://x.com/intent/post?${params.toString()}`;
}

/** The catalog entry for the X quoted-post setting. */
export const X_QUOTED_POST_SETTING: ChannelSettingDefinition = {
  description:
    'Link or id of the X post to quote. Leave blank for a normal post. X may allow quote posts only on some API plans.',
  key: QUOTED_POST_SETTING_KEY,
  label: 'Quoted post',
  type: 'string',
};

/** An issue when an X target's quoted post is neither a link to an X post nor an id. */
export function validateXQuotedPost(
  platform: CredentialPlatform | string,
  settings: Record<string, unknown> | undefined,
): ChannelValidationIssue | undefined {
  const quoted = settings?.[QUOTED_POST_SETTING_KEY];
  if (
    platform !== CredentialPlatform.TWITTER ||
    typeof quoted !== 'string' ||
    isMissingValue(quoted) ||
    parseXQuotedPostId(quoted) !== undefined
  ) {
    return undefined;
  }
  return {
    code: 'channel_target.invalid_quoted_post',
    field: `settings.${QUOTED_POST_SETTING_KEY}`,
    message:
      'X quoted post must be a link to an X post (x.com/<handle>/status/<id>) or a numeric post id.',
    severity: 'error',
  };
}
