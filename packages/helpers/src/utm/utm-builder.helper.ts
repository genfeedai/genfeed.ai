export interface UTMParameters {
  source: string;
  medium: string;
  campaign: string;
  content: string;
}

const LINK_TYPE_PATTERNS: Array<{ pattern: string; type: string }> = [
  { pattern: 'youtube.com', type: 'social_youtube' },
  { pattern: 'youtu.be', type: 'social_youtube' },
  { pattern: 'tiktok.com', type: 'social_tiktok' },
  { pattern: 'instagram.com', type: 'social_instagram' },
  { pattern: 'twitter.com', type: 'social_twitter' },
  { pattern: 'x.com', type: 'social_twitter' },
  { pattern: 'linkedin.com', type: 'social_linkedin' },
  { pattern: 'facebook.com', type: 'social_facebook' },
  { pattern: 'calendly.com', type: 'integration_calendly' },
  { pattern: 'stripe.com', type: 'integration_stripe' },
  { pattern: 'paypal.com', type: 'integration_paypal' },
];

const logInvalidUrl = (error: unknown, url: string) => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  console.error('Invalid URL for UTM tracking', { error, url });
};

export function getLinkType(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const match = LINK_TYPE_PATTERNS.find(({ pattern }) =>
      hostname.includes(pattern),
    );
    return match?.type ?? 'custom_link';
  } catch {
    return 'custom_link';
  }
}

export function addUTMParameters(
  url: string,
  username: string,
  linkType?: string,
): string {
  if (!url || url.trim() === '') {
    return url;
  }

  try {
    const urlObj = new URL(url);

    if (urlObj.searchParams.has('utm_source')) {
      return url;
    }

    const contentType = linkType || getLinkType(url);

    urlObj.searchParams.append('utm_source', 'genfeedai_profile');
    urlObj.searchParams.append('utm_medium', 'profile_link');
    urlObj.searchParams.append('utm_campaign', username);
    urlObj.searchParams.append('utm_content', contentType);

    return urlObj.toString();
  } catch (error) {
    logInvalidUrl(error, url);
    return url;
  }
}

export function buildUTMParameters(
  username: string,
  linkType: string,
): UTMParameters {
  return {
    campaign: username,
    content: linkType,
    medium: 'profile_link',
    source: 'genfeedai_profile',
  };
}
