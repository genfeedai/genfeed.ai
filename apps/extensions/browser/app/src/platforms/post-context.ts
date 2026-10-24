import { getCurrentPlatform, type PlatformConfig } from '~platforms/config';
import { findElement } from '~platforms/twitter-selectors';

export interface PostContext {
  author: string;
  content: string;
}

function firstText(root: ParentNode, selectors: string[] | undefined): string {
  for (const selector of selectors ?? []) {
    const text = root.querySelector(selector)?.textContent?.trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function metaContent(selector: string): string {
  return (
    document
      .querySelector<HTMLMetaElement>(selector)
      ?.getAttribute('content')
      ?.trim() ?? ''
  );
}

/**
 * The text and author of the post the user is looking at. `within` limits the
 * search to one post container; without it the whole page is searched. A page
 * that gives no post markup falls back to its own link-preview metadata, so
 * every platform hands the reply request something to write about.
 */
export function extractPostContext(
  platform: PlatformConfig | null = getCurrentPlatform(),
  within?: ParentNode,
): PostContext {
  const root = within ?? document;
  let content = firstText(root, platform?.selectors.postText);
  let author = firstText(root, platform?.selectors.postAuthor);

  // X changes its markup often; its selector chains with fallbacks cover a
  // page-wide read when the primary selectors miss.
  if (!within && platform?.hostnames.includes('x.com')) {
    content ||= findElement('tweetText')?.textContent?.trim() ?? '';
    author ||= findElement('userName')?.textContent?.trim() ?? '';
  }

  if (!content && !within) {
    content =
      metaContent('meta[property="og:description"]') ||
      metaContent('meta[property="og:title"]');
  }
  if (!author && !within) {
    author = metaContent('meta[name="author"]');
  }
  return { author, content };
}
