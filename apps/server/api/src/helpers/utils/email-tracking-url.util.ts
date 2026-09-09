export function redactEmailTrackingUrl(url: string): string {
  return url.replace(/(\/email-performance\/click\/)[^/?#]+/g, '$1[redacted]');
}
