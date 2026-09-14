function getUserAgent(): string {
  if (typeof navigator === 'undefined') {
    return '';
  }
  return (
    navigator.userAgent ||
    navigator.vendor ||
    (window as unknown as Record<string, string>).opera ||
    ''
  );
}

export function isMobileDevice(): boolean {
  return /android|iphone|ipad|ipod/i.test(getUserAgent());
}

export function isAndroidDevice(): boolean {
  return /android/i.test(getUserAgent());
}

export function isiOSDevice(): boolean {
  return /iphone|ipad|ipod/i.test(getUserAgent());
}

/**
 * Exact-or-subdomain host match.
 *
 * `host.includes('tiktok.com')` also matches `tiktok.com.evil.example` and
 * `nottiktok.com`, so a lookalike host was rewritten into the real app's deep
 * link. The rewritten link hardcodes the genuine host, so this misroutes the
 * user rather than redirecting them — but it is still the wrong destination.
 */
function isHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function getYouTubeDeepLink(
  parsed: URL,
  isAndroid: boolean,
): string | undefined {
  const host = parsed.hostname;
  let videoId = '';

  if (isHost(host, 'youtu.be')) {
    videoId = parsed.pathname.slice(1).split('?')[0];
  } else if (parsed.searchParams.has('v')) {
    videoId = parsed.searchParams?.get('v') ?? '';
  } else if (parsed.pathname.includes('/watch')) {
    videoId = parsed.searchParams?.get('v') ?? '';
  } else if (parsed.pathname.includes('/channel/')) {
    const channelId = parsed.pathname
      .split('/channel/')[1]
      ?.split('/')[0]
      ?.split('?')[0];
    if (channelId && isAndroid) {
      return `intent://youtube.com/channel/${channelId}#Intent;package=com.google.android.youtube;scheme=https;end`;
    }
    if (channelId) {
      return `vnd.youtube://channel/${channelId}`;
    }
  } else if (
    parsed.pathname.includes('/c/') ||
    parsed.pathname.includes('/user/')
  ) {
    const pathType = parsed.pathname.includes('/c/') ? '/c/' : '/user/';
    const channelName = parsed.pathname
      .split(pathType)[1]
      ?.split('/')[0]
      ?.split('?')[0];
    if (channelName && isAndroid) {
      return `intent://youtube.com${pathType}${channelName}#Intent;package=com.google.android.youtube;scheme=https;end`;
    }
    if (channelName) {
      return `vnd.youtube://${pathType}${channelName}`;
    }
  }

  if (videoId) {
    if (isAndroid) {
      return `intent://www.youtube.com/watch?v=${videoId}#Intent;package=com.google.android.youtube;scheme=https;end`;
    }
    return `vnd.youtube://${videoId}`;
  }
  return undefined;
}

function getTikTokDeepLink(
  parsed: URL,
  isAndroid: boolean,
): string | undefined {
  const pathParts = parsed.pathname.split('/').filter(Boolean);
  if (pathParts.includes('@') || parsed.pathname.includes('/@')) {
    const username =
      pathParts.find((part) => part.startsWith('@'))?.slice(1) ||
      parsed.pathname.split('/@')[1]?.split('/')[0];
    if (username) {
      if (isAndroid) {
        return `intent://tiktok.com/@${username}#Intent;package=com.zhiliaoapp.musically;scheme=https;end`;
      }
      return `snssdk1233://user/profile/${username}`;
    }
  } else if (parsed.pathname.includes('/video/')) {
    const videoId = parsed.pathname
      .split('/video/')[1]
      ?.split('?')[0]
      ?.replace('/', '');
    if (videoId && isAndroid) {
      return `intent://tiktok.com${parsed.pathname.split('?')[0]}#Intent;package=com.zhiliaoapp.musically;scheme=https;end`;
    }
    if (videoId) {
      return `snssdk1233://aweme/detail/${videoId}`;
    }
  }
  return undefined;
}

function getInstagramDeepLink(
  parsed: URL,
  isAndroid: boolean,
): string | undefined {
  if (parsed.pathname.includes('/p/') || parsed.pathname.includes('/reel/')) {
    const pathType = parsed.pathname.includes('/p/') ? '/p/' : '/reel/';
    const postId = parsed.pathname
      .split(pathType)[1]
      ?.split('/')[0]
      ?.split('?')[0];
    if (postId && isAndroid) {
      return `intent://instagram.com${pathType}${postId}#Intent;package=com.instagram.android;scheme=https;end`;
    }
    if (postId) {
      return `instagram://media?id=${postId}`;
    }
  } else if (parsed.pathname !== '/' && parsed.pathname !== '') {
    const username = parsed.pathname.slice(1).split('/')[0]?.split('?')[0];
    if (username && !username.includes('.')) {
      if (isAndroid) {
        return `intent://instagram.com/_u/${username}#Intent;package=com.instagram.android;scheme=https;end`;
      }
      return `instagram://user?username=${username}`;
    }
  }
  return undefined;
}

function getTwitterDeepLink(
  parsed: URL,
  isAndroid: boolean,
): string | undefined {
  const pathParts = parsed.pathname.split('/').filter(Boolean);
  if (pathParts.length >= 1 && pathParts[0]) {
    const username = pathParts[0].split('?')[0];
    if (pathParts.includes('status') && pathParts.length >= 3) {
      const statusIndex = pathParts.indexOf('status');
      const tweetId = pathParts[statusIndex + 1]?.split('?')[0];
      if (tweetId && isAndroid) {
        return `intent://x.com/${username}/status/${tweetId}#Intent;package=com.twitter.android;scheme=https;end`;
      }
      if (tweetId) {
        return `twitter://status?id=${tweetId}`;
      }
    } else if (username && !username.includes('.')) {
      if (isAndroid) {
        return `intent://x.com/${username}#Intent;package=com.twitter.android;scheme=https;end`;
      }

      return `twitter://user?screen_name=${username}`;
    }
  }
  return undefined;
}

function getLinkedInDeepLink(
  parsed: URL,
  isAndroid: boolean,
): string | undefined {
  const pathParts = parsed.pathname.split('/').filter(Boolean);
  if (pathParts.includes('in') && pathParts.length >= 2) {
    const userIndex = pathParts.indexOf('in');
    const username = pathParts[userIndex + 1]?.split('?')[0];
    if (username && isAndroid) {
      return `intent://linkedin.com/in/${username}#Intent;package=com.linkedin.android;scheme=https;end`;
    }
    if (username) {
      return `linkedin://profile/${username}`;
    }
  } else if (pathParts.includes('company') && pathParts.length >= 2) {
    const companyIndex = pathParts.indexOf('company');
    const companyName = pathParts[companyIndex + 1]?.split('?')[0];
    if (companyName && isAndroid) {
      return `intent://linkedin.com/company/${companyName}#Intent;package=com.linkedin.android;scheme=https;end`;
    }
    if (companyName) {
      return `linkedin://company/${companyName}`;
    }
  }
  return undefined;
}

export function getDeepLink(url: string, isMobile: boolean): string {
  if (!isMobile) {
    return url;
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const isAndroid = isAndroidDevice();

    if (isHost(host, 'youtube.com') || isHost(host, 'youtu.be')) {
      return getYouTubeDeepLink(parsed, isAndroid) ?? url;
    }

    if (isHost(host, 'tiktok.com')) {
      return getTikTokDeepLink(parsed, isAndroid) ?? url;
    }

    if (isHost(host, 'instagram.com')) {
      return getInstagramDeepLink(parsed, isAndroid) ?? url;
    }

    if (isHost(host, 'twitter.com') || isHost(host, 'x.com')) {
      return getTwitterDeepLink(parsed, isAndroid) ?? url;
    }

    if (isHost(host, 'linkedin.com')) {
      return getLinkedInDeepLink(parsed, isAndroid) ?? url;
    }
  } catch {
    // Invalid URLs remain unchanged.
  }
  return url;
}
