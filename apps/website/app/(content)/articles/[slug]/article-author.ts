export interface PublicArticleAuthorSource {
  author?: unknown;
  user?: {
    firstName?: unknown;
    lastName?: unknown;
  } | null;
}

const UNICODE_LETTER_PATTERN = /\p{L}/u;

function readPublishableAuthorLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const label = value.trim();
  return label.length > 0 && UNICODE_LETTER_PATTERN.test(label)
    ? label
    : undefined;
}

/**
 * Resolve the public byline from human-readable profile fields first. Legacy
 * handles can be numeric provider identifiers, so a fallback is publishable
 * only when it contains at least one Unicode letter.
 */
export function resolvePublicArticleAuthor(
  article: PublicArticleAuthorSource,
): string | undefined {
  const humanName = [
    readPublishableAuthorLabel(article.user?.firstName),
    readPublishableAuthorLabel(article.user?.lastName),
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ');

  return (
    readPublishableAuthorLabel(humanName) ??
    readPublishableAuthorLabel(article.author)
  );
}
