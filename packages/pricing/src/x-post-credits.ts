/**
 * What publishing one post to X costs the organization, in credits.
 *
 * X bills Genfeed per request: $0.015 for a post and $0.20 for a post that
 * contains a URL (docs.x.com/x-api/getting-started/pricing, changelog entry of
 * 2026-04-16). At 1 credit = $0.01 that is 1.5 and 20 credits at cost; the
 * prices below cover it with a margin. A thread reply is its own request, so
 * each one is priced on its own text.
 */
export const X_POST_CREDIT_COST = 3;
export const X_POST_WITH_URL_CREDIT_COST = 30;

const ANCHOR_WITH_HREF = /<a\s[^>]*href\s*=/i;
const HTML_TAG = /<[^>]*>/g;
const SCHEME_OR_WWW = /(?:https?:\/\/|www\.)\S+/i;
// X links a bare domain only when it ends in a real top-level domain, and never
// an email address, so `node.js` and `me@site.com` do not count.
const BARE_DOMAIN =
  /(?<![@\w.-])[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|ai|co|app|dev|me|ly|gg|tv|xyz|sh|so|fm|to|us|uk|de|fr|es|it|nl|eu|info|biz|site|online|store|shop|tech|cc|ws|link|page|news|blog|club|live|art|fun|top|vip)(?![\w-])/i;

/** True when X would bill the post as a post containing a URL. */
export function xPostHasLink(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }
  if (ANCHOR_WITH_HREF.test(text)) {
    return true;
  }
  const plain = text.replace(HTML_TAG, ' ');
  return SCHEME_OR_WWW.test(plain) || BARE_DOMAIN.test(plain);
}

/** Credits one X post costs, from the text that is sent to X. */
export function xPostCreditCost(text: string | null | undefined): number {
  return xPostHasLink(text) ? X_POST_WITH_URL_CREDIT_COST : X_POST_CREDIT_COST;
}
