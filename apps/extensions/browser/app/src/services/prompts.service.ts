import { Prompt } from '~models/prompt.model';
import { BaseService } from '~services/base.service';

export class PromptsService extends BaseService<Prompt> {
  constructor(token: string) {
    super('/prompts', token, Prompt);
  }

  /**
   * Generate a post reply using AI
   * Used by the Chrome extension for Twitter/X integration
   */
  generatePostReply(
    postId: string,
    url: string,
    platform: string = 'twitter',
  ): Promise<Prompt> {
    return this.post('post', {
      platform,
      postId,
      url,
    });
  }

  /**
   * Get latest prompts for the extension
   */
  getLatest(limit: number = 10): Promise<Prompt[]> {
    return this.findAll({ limit, sort: 'createdAt:desc' });
  }
}

// Export convenience function for backward compatibility
// Note: Requires token from auth service
export function generatePostReply(
  postId: string,
  url: string,
  token: string,
): Promise<Prompt> {
  const service = PromptsService.getInstance(token);
  return service.generatePostReply(postId, url);
}
