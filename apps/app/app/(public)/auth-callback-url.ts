export function getAuthCallbackURL(
  searchParams: Pick<URLSearchParams, 'get'>,
): string {
  return (
    searchParams.get('callbackUrl') ||
    searchParams.get('return_to') ||
    searchParams.get('redirect_url') ||
    '/'
  );
}

export function toAbsoluteAuthCallbackURL(callbackURL: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(callbackURL)) {
    return callbackURL;
  }

  const origin =
    typeof window === 'undefined'
      ? 'https://app.genfeed.ai'
      : window.location.origin;

  if (callbackURL.startsWith('/')) {
    return `${origin}${callbackURL}`;
  }

  return `${origin}/${callbackURL}`;
}
