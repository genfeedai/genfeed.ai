const HANDLE_PATTERN = /^@([A-Za-z0-9_]{1,15})$/;

/** A bare `@handle` is an X profile; anything else is passed through for the API to normalize. */
export function toOnboardingLink(input: string): string {
  const value = input.trim();
  const handle = HANDLE_PATTERN.exec(value);
  return handle ? `https://x.com/${handle[1]}` : value;
}
