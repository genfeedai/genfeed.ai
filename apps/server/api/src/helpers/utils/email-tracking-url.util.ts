const EMAIL_CLICK_TRACKING_TOKEN_PATTERN =
  /(\/email-performance\/click\/)[^/?#]+/g;

export function redactEmailTrackingUrl(url: string): string {
  return url.replace(EMAIL_CLICK_TRACKING_TOKEN_PATTERN, '$1[redacted]');
}
