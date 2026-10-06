/** Public profile-image CDN origins; API connectivity remains disabled. */
export const ACCOUNT_AVATAR_ORIGINS = [
  'https://pbs.twimg.com',
  'https://*.fbcdn.net',
  'https://*.cdninstagram.com',
  'https://*.licdn.com',
  'https://*.googleusercontent.com',
  'https://*.ggpht.com',
  'https://*.tiktokcdn.com',
  'https://*.tiktokcdn-us.com',
  'https://*.pinimg.com',
  'https://*.redditmedia.com',
  'https://*.redd.it',
] as const;

export function isAccountAvatarOrigin(url: URL): boolean {
  return ACCOUNT_AVATAR_ORIGINS.some((origin) => {
    if (!origin.includes('*')) return url.origin === origin;
    const suffix = origin.replace('https://*', '');
    return (
      url.protocol === 'https:' && !url.port && url.hostname.endsWith(suffix)
    );
  });
}
