/**
 * Link unfurlers, crawlers and scripted clients. A preview link pasted into
 * Slack, iMessage or a social post is fetched by one of these before any
 * person opens it, so they never count as a view or a click. A missing user
 * agent is treated the same way.
 */
const AUTOMATED_USER_AGENT =
  /bot|crawl|spider|slurp|facebookexternalhit|facebot|embedly|preview|unfurl|whatsapp\/|skypeuripreview|slack-imgproxy|headless|lighthouse|curl|wget|httpclient|python-requests|axios|node-fetch|go-http|java\//i;

export function isAutomatedVisitor(userAgent: string | undefined): boolean {
  const value = userAgent?.trim();
  if (!value) return true;
  return AUTOMATED_USER_AGENT.test(value);
}
