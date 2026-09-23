/**
 * Provider placeholders an account shows until its owner sets an avatar or
 * header. Genfeed never mirrors these or hands them to a brand as identity.
 */
const PROVIDER_PLACEHOLDER_IMAGE_PATTERNS: readonly RegExp[] = [
  /\/default_profile_images\//i,
  /\/(avatars|headers)\/original\/missing\.png$/i,
  /\/avatar_default_\d+\.png$/i,
];

export function isProviderPlaceholderImageUrl(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }

  return PROVIDER_PLACEHOLDER_IMAGE_PATTERNS.some((pattern) =>
    pattern.test(pathname),
  );
}

/** A provider avatar worth copying into Genfeed storage. */
export function isMirrorableAvatarUrl(
  url: string | null | undefined,
): url is string {
  return (
    typeof url === 'string' &&
    url.length > 0 &&
    !isProviderPlaceholderImageUrl(url)
  );
}
