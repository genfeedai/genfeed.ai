import { TrackedLinksService } from '@api/collections/tracked-links/services/tracked-links.service';
import {
  extractPostUrls,
  replacePostUrls,
} from '@api/collections/tracked-links/utils/post-link-text.util';
import { getShortLinkBaseUrl } from '@api/collections/tracked-links/utils/short-link-base-url.util';
import { Injectable, Logger } from '@nestjs/common';

/** A post shortens at most this many distinct URLs; further ones stay as written. */
const MAX_SHORT_LINKS_PER_POST = 10;

export type PostLinkShorteningInput = {
  description: string;
  organizationId: string;
  platform?: string;
  postId: string;
};

/**
 * Shortens the URLs in a post caption so every click on them is counted for
 * that post.
 */
@Injectable()
export class PostLinkShortenerService {
  private readonly logger = new Logger(PostLinkShortenerService.name);

  constructor(private readonly trackedLinks: TrackedLinksService) {}

  /**
   * Safe to call again for the same post (a retry): an existing link for the
   * same destination is reused. A URL that cannot be shortened stays as
   * written and never blocks the caller.
   */
  async shortenPostLinks(input: PostLinkShorteningInput): Promise<string> {
    const { description, organizationId, platform, postId } = input;
    const urls = extractPostUrls(description).slice(
      0,
      MAX_SHORT_LINKS_PER_POST,
    );
    if (urls.length === 0) return description;

    const shortHost = new URL(getShortLinkBaseUrl()).host;
    const replacements = new Map<string, string>();

    for (const url of urls) {
      try {
        if (new URL(url).host === shortHost) continue;
        const link =
          (await this.trackedLinks.findPostLink(
            postId,
            organizationId,
            url,
            platform,
          )) ??
          (await this.trackedLinks.generateTrackingLink(
            { platform, postId, url },
            organizationId,
          ));
        replacements.set(url, link.shortUrl);
      } catch (error: unknown) {
        this.logger.warn(`Post link left unshortened: ${url}`, {
          error: error instanceof Error ? error.message : String(error),
          postId,
        });
      }
    }

    return replacePostUrls(description, replacements);
  }
}
