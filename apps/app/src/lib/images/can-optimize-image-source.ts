/**
 * Keep this list aligned with `packages/next-config/next.config.base.ts`.
 * Arbitrary customer/provider URLs must bypass the Next image optimizer or
 * Next will reject their host at runtime.
 */
const OPTIMIZABLE_EXACT_HOSTS = new Set([
  'i.pravatar.cc',
  'images.unsplash.com',
  'img.authprovider.com',
  'picsum.photos',
]);

const OPTIMIZABLE_HOST_SUFFIXES = [
  '.amazonaws.com',
  '.cloudfront.net',
  '.genfeed.ai',
  '.supabase.co',
];

export function canOptimizeImageSource(source: string): boolean {
  const normalizedSource = source.trim();

  if (normalizedSource.startsWith('/') && !normalizedSource.startsWith('//')) {
    return true;
  }

  try {
    const url = new URL(normalizedSource);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    return (
      OPTIMIZABLE_EXACT_HOSTS.has(url.hostname) ||
      OPTIMIZABLE_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
    );
  } catch {
    return false;
  }
}
