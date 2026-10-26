import { getCurrentPlatform, type PlatformConfig } from '~platforms/config';
import { extractPostContext } from '~platforms/post-context';
import type { PagePost } from '~types/extension';

const X_POST_SELECTOR = 'article[data-testid="tweet"]';

function cleanText(element: Element | null | undefined): string {
  return element?.textContent?.trim() ?? '';
}

/**
 * The post a status page is about: the article that links to its own id. Right
 * after navigating, X still shows the previous post, which links elsewhere.
 */
function findXPost(postId: string): Element | null {
  return (
    Array.from(document.querySelectorAll(X_POST_SELECTOR)).find((article) =>
      article.querySelector(`a[href*="/status/${postId}"] time`),
    ) ?? null
  );
}

function readXPost(article: Element, url: string): PagePost | null {
  const text = cleanText(article.querySelector('[data-testid="tweetText"]'));
  if (!text) {
    return null;
  }
  const userLinks = Array.from(
    article.querySelectorAll('[data-testid="User-Name"] a'),
  ).map((link) => cleanText(link));
  const authorHandle = userLinks.find((value) => value.startsWith('@'));
  const authorName = userLinks.find((value) => value && !value.startsWith('@'));
  const avatar = article.querySelector<HTMLImageElement>(
    '[data-testid="Tweet-User-Avatar"] img',
  );
  return {
    authorHandle,
    authorName,
    avatarUrl: avatar?.src || undefined,
    text,
    url,
  };
}

/**
 * The post open on this page, or null when the page is not a post (a feed, a
 * profile) or the post has not rendered yet.
 */
export function readPagePost(
  platform: PlatformConfig | null = getCurrentPlatform(),
): PagePost | null {
  const postId = platform?.extractPostId();
  if (!platform || !postId) {
    return null;
  }
  const url = platform.constructPostUrl(postId);
  if (platform.hostnames.includes('x.com')) {
    const article = findXPost(postId);
    return article ? readXPost(article, url) : null;
  }
  const { author, content } = extractPostContext(platform);
  return content
    ? { authorName: author || undefined, text: content, url }
    : null;
}
