"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialUrlHelper = void 0;
class SocialUrlHelper {
    static buildTwitterUrl(tweetId, username) {
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
    static buildYoutubeUrl(videoId) {
        if (!videoId) {
            throw new Error('Video ID is required');
        }
        return `https://www.youtube.com/watch?v=${videoId}`;
    }
    static buildInstagramUrl(postId) {
        if (!postId) {
            throw new Error('Post ID is required');
        }
        return `https://www.instagram.com/p/${postId}/`;
    }
    static buildTikTokUrl(videoId, username) {
        if (!videoId) {
            throw new Error('Video ID is required');
        }
        if (username) {
            const cleanUsername = username.replace(/^@/, '');
            return `https://www.tiktok.com/@${cleanUsername}/video/${videoId}`;
        }
        return `https://www.tiktok.com/video/${videoId}`;
    }
    static buildLinkedInUrl(postId) {
        if (!postId) {
            throw new Error('Post ID is required');
        }
        const urn = postId.startsWith('activity:') ? postId : `activity:${postId}`;
        return `https://www.linkedin.com/feed/update/${urn}/`;
    }
}
exports.SocialUrlHelper = SocialUrlHelper;
//# sourceMappingURL=social-url.helper.js.map