import { CredentialPlatform } from '@genfeedai/enums';

export class SocialUrlHelper {
  static buildProfileUrl(
    platform: CredentialPlatform,
    handle?: string | null,
    externalId?: string | null,
  ): string | undefined {
    const cleanHandle = handle?.trim().replace(/^@/, '');

    switch (platform) {
      case CredentialPlatform.YOUTUBE:
        return externalId
          ? `https://www.youtube.com/channel/${externalId}`
          : cleanHandle
            ? `https://www.youtube.com/@${cleanHandle}`
            : undefined;
      case CredentialPlatform.TIKTOK:
        return cleanHandle
          ? `https://www.tiktok.com/@${cleanHandle}`
          : undefined;
      case CredentialPlatform.INSTAGRAM:
        return cleanHandle
          ? `https://www.instagram.com/${cleanHandle}`
          : undefined;
      case CredentialPlatform.TWITTER:
        return cleanHandle ? `https://x.com/${cleanHandle}` : undefined;
      case CredentialPlatform.LINKEDIN:
        return cleanHandle && !/\s/.test(cleanHandle)
          ? `https://www.linkedin.com/in/${cleanHandle}`
          : undefined;
      case CredentialPlatform.FACEBOOK:
        return externalId
          ? `https://www.facebook.com/${externalId}`
          : undefined;
      case CredentialPlatform.PINTEREST:
        return cleanHandle
          ? `https://www.pinterest.com/${cleanHandle}`
          : undefined;
      case CredentialPlatform.REDDIT:
        return cleanHandle
          ? `https://www.reddit.com/user/${cleanHandle}`
          : undefined;
      case CredentialPlatform.THREADS:
        return cleanHandle
          ? `https://www.threads.net/@${cleanHandle}`
          : undefined;
      case CredentialPlatform.FANVUE:
        return cleanHandle
          ? `https://www.fanvue.com/${cleanHandle}`
          : undefined;
      default:
        return undefined;
    }
  }

  static buildTwitterUrl(tweetId: string, username: string): string {
    if (!tweetId) {
      throw new Error('Tweet ID is required');
    }
    if (!username) {
      throw new Error('Username is required for reliable Twitter URLs');
    }

    // Remove @ symbol if present
    const cleanUsername = username.replace(/^@/, '');

    if (!cleanUsername) {
      throw new Error('Username cannot be empty');
    }

    // Validate tweet ID format (should be numeric)
    if (!/^\d+$/.test(tweetId)) {
      throw new Error(`Invalid tweet ID format: ${tweetId}`);
    }

    return `https://x.com/${cleanUsername}/status/${tweetId}`;
  }

  static buildYoutubeUrl(videoId: string): string {
    if (!videoId) {
      throw new Error('Video ID is required');
    }

    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  static buildInstagramUrl(postId: string): string {
    if (!postId) {
      throw new Error('Post ID is required');
    }

    return `https://www.instagram.com/p/${postId}/`;
  }

  static buildTikTokUrl(videoId: string, username?: string): string {
    if (!videoId) {
      throw new Error('Video ID is required');
    }

    if (username) {
      const cleanUsername = username.replace(/^@/, '');
      return `https://www.tiktok.com/@${cleanUsername}/video/${videoId}`;
    }

    return `https://www.tiktok.com/video/${videoId}`;
  }

  static buildLinkedInUrl(postId: string): string {
    if (!postId) {
      throw new Error('Post ID is required');
    }

    const urn = postId.startsWith('activity:') ? postId : `activity:${postId}`;
    return `https://www.linkedin.com/feed/update/${urn}/`;
  }
}
