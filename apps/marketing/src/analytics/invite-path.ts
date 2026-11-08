/**
 * A lead invite link, `/@<handle>/invite/<key>`, plain or URL-encoded, or the
 * internal route it rewrites to. The key in it is the lead's only credential,
 * so no page view, URL property or error report may carry it off the page.
 * Links sent before the move to `/@` read `/u/<handle>/invite/<key>`; they now
 * land on the 404 page with a key that may still be live, so they match too.
 */
const INVITE_PATH_PATTERN =
  /(?:\/|%2f)(?:@|%40|(?:creator-profile|u)(?:\/|%2f))[^/?#]+?(?:\/|%2f)invite(?:\/|%2f|$)/i;

/** True when the value is, or contains, a lead invite path. */
export function hasInvitePath(value: string): boolean {
  return INVITE_PATH_PATTERN.test(value);
}
