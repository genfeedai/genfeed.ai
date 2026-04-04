export class SocialUrlHelper {
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
