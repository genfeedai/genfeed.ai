/**
 * The photos X shows inside a post. Avatars, emoji and link-card art also come
 * from twimg.com, so the hover actions are limited to the post's photo frame.
 */
export const X_PHOTO_IMAGE_SELECTOR =
  'article[data-testid="tweet"] [data-testid="tweetPhoto"] img[src*="twimg.com"]';

/**
 * The element the hover actions are added to. It is X's own photo frame, and
 * only when X already positions it: Genfeed never changes X's layout to make
 * room for its own buttons, because forcing `position: relative` on an
 * element X lays out absolutely collapses the image.
 */
export function findPhotoOverlayHost(
  image: HTMLImageElement,
): HTMLElement | null {
  const frame = image.closest<HTMLElement>('[data-testid="tweetPhoto"]');
  if (!frame || getComputedStyle(frame).position === 'static') {
    return null;
  }
  return frame;
}
