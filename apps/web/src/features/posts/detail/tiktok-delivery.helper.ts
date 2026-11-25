import { CredentialPlatform, PostCategory } from '@genfeedai/contracts';
import {
  TIKTOK_DELIVERY_MODE_APP,
  TIKTOK_DELIVERY_MODE_SETTING_KEY,
} from '@genfeedai/contracts/api-types/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';

/**
 * A failed TikTok video can go back out two ways: posted to the profile, or
 * delivered to the creator's TikTok Inbox. A retry keeps the way the failed
 * attempt used, so it only asks when the post has not recorded Inbox delivery.
 */
export function needsTikTokDeliveryChoice(
  post: Pick<IPost, 'category' | 'ingredients' | 'platform' | 'targetSettings'>,
): boolean {
  const canUseInbox =
    post.platform === CredentialPlatform.TIKTOK &&
    (post.category === PostCategory.VIDEO ||
      post.category === PostCategory.REEL) &&
    (post.ingredients?.length ?? 0) > 0;

  return (
    canUseInbox &&
    post.targetSettings?.[TIKTOK_DELIVERY_MODE_SETTING_KEY] !==
      TIKTOK_DELIVERY_MODE_APP
  );
}
