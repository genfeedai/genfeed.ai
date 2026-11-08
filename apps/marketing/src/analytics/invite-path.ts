/**
 * A lead invite link, `/u/<handle>/invite/<key>`, plain or URL-encoded. The key
 * in it is the lead's only credential, so no page view, URL property or error
 * report may carry it off the page.
 */
const INVITE_PATH_PATTERN =
  /(?:\/|%2f)u(?:\/|%2f)[^/?#]+?(?:\/|%2f)invite(?:\/|%2f|$)/i;

/** True when the value is, or contains, a lead invite path. */
export function hasInvitePath(value: string): boolean {
  return INVITE_PATH_PATTERN.test(value);
}
