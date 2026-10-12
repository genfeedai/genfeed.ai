import { PostVisibility } from '@genfeedai/contracts';

export type CapturedAudience = PostVisibility | 'unavailable';

/**
 * The observed audience of a captured publication. Only `Post.visibility`
 * is audience evidence: it is null when the extension did not observe one, and
 * the legacy `Post.status` projection is never consulted.
 */
export function resolveCapturedAudience(
  visibility?: string | null,
): CapturedAudience {
  switch (visibility) {
    case PostVisibility.PUBLIC:
    case PostVisibility.PRIVATE:
    case PostVisibility.UNLISTED:
      return visibility;
    default:
      return 'unavailable';
  }
}

interface CapturedPostText {
  description?: string | null;
  label?: string | null;
}

export function capturedPostTitle(
  post: CapturedPostText,
  fallback: string,
): string {
  return post.label?.trim() || post.description?.trim() || fallback;
}

/** The full text, shown only when the title is a shortened form of it. */
export function capturedPostSummary(post: CapturedPostText): string {
  const description = post.description?.trim() ?? '';
  return description && description !== post.label?.trim() ? description : '';
}
