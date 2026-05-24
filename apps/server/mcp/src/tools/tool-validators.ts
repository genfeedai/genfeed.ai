import type { SocialPlatform } from '@mcp/shared/interfaces/post.interface';

export function isSocialPlatform(value: string): value is SocialPlatform {
  return /^(twitter|linkedin|instagram|tiktok|youtube)$/.test(value);
}
