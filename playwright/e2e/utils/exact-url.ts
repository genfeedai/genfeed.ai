/** Resolve an app route against its page URL and match the full URL literally. */
export function exactUrlPattern(expectedUrl: string, baseUrl: string): RegExp {
  const absoluteUrl = new URL(expectedUrl, baseUrl).href;
  const escapedUrl = absoluteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedUrl}$`);
}
