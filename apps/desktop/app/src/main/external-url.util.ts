export function buildExternalAppUrl(
  pathname: string,
  authEndpoint: string,
): string {
  if (!pathname.startsWith('/') || pathname.startsWith('//')) {
    throw new Error('Desktop external app paths must be same-origin paths.');
  }

  return new URL(pathname, new URL(authEndpoint).origin).toString();
}
