const HANDLE_PATTERN = /^@([A-Za-z0-9_]{1,15})$/;

/** A bare `@handle` is an X profile; anything else is passed through for the API to normalize. */
export function toOnboardingLink(input: string): string {
  const value = input.trim();
  const handle = HANDLE_PATTERN.exec(value);
  return handle ? `https://x.com/${handle[1]}` : value;
}

const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i;

/**
 * Whether the brand link could be a real web address: a hostname with a TLD,
 * no spaces or commas. Catches typos like `na` or `my site,com` before a scan
 * is spent on them; the API still decides whether the page is reachable.
 */
export function isValidOnboardingLink(input: string): boolean {
  const value = toOnboardingLink(input);
  if (!value || /\s/.test(value)) return false;
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    return HOSTNAME_PATTERN.test(url.hostname);
  } catch {
    return false;
  }
}
