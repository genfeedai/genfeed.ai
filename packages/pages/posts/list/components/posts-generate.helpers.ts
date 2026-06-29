import type { Platform } from '@genfeedai/enums';
import type { ICredential } from '@genfeedai/interfaces';
import {
  getPostsPlatformLabel,
  isPostPlatform,
} from '@helpers/content/posts.helper';
import type { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';

export type GeneratePostsParams = {
  prompt: string;
  count?: number;
  selectedPlatform?: Platform;
  isThread?: boolean;
  platform: Platform | 'all';
  availablePlatforms: Platform[];
  getCredentialForPlatform: (p: Platform) => ICredential | undefined;
  getPostsService: () => Promise<PostsService>;
  onRefresh: () => Promise<void>;
  onGeneratingChange: (isGenerating: boolean) => void;
};

export async function generatePosts({
  prompt,
  count,
  selectedPlatform,
  isThread,
  platform,
  availablePlatforms,
  getCredentialForPlatform,
  getPostsService,
  onRefresh,
  onGeneratingChange,
}: GeneratePostsParams): Promise<void> {
  // Use selected platform or current platform filter, default to first available
  const targetPlatform =
    selectedPlatform || (platform !== 'all' ? platform : availablePlatforms[0]);

  if (!targetPlatform) {
    alert('No platform selected. Please select a platform.');
    return;
  }

  // Guard non-posting platforms (e.g. Google Search Console / Google Ads-style
  // SEO/analytics integrations): they are valid Platform values but cannot be
  // post-generation targets, so reject them before attempting generation.
  if (!isPostPlatform(targetPlatform)) {
    alert('The selected platform does not support post generation.');
    return;
  }

  const credential = getCredentialForPlatform(targetPlatform);
  if (!credential) {
    const platformLabel = getPostsPlatformLabel(targetPlatform);
    alert(`No ${platformLabel} account connected for this brand`);
    return;
  }

  onGeneratingChange(true);

  try {
    const postsService = await getPostsService();

    if (isThread) {
      // Generate cohesive thread
      await postsService.generateThread({
        count: count || 5,
        credential: credential.id,
        tone: 'professional',
        topic: prompt,
      });
    } else {
      // Generate individual tweets
      await postsService.generateTweets({
        count: count || 10,
        credential: credential.id,
        tone: 'professional',
        topic: prompt,
      });
    }

    // Refresh list immediately to show PROCESSING posts
    await onRefresh();
  } catch (error) {
    logger.error('Failed to generate posts', error);
    alert('Failed to generate posts. Please try again.');
  } finally {
    onGeneratingChange(false);
  }
}
