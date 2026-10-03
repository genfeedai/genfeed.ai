import type {
  ExtensionPublicationCaptureInput,
  ExtensionPublicationPlatform,
} from '@genfeedai/contracts/interfaces/content/extension-publication.interface';

export function publicationInsightLookupKind(
  platform: ExtensionPublicationPlatform,
  pageUrl: string,
): ExtensionPublicationCaptureInput['publicationKind'] {
  const url = new URL(pageUrl);
  if (platform === 'linkedin' && url.searchParams.has('commentUrn'))
    return 'reply';
  if (platform === 'youtube' && url.searchParams.has('lc')) return 'reply';
  if (
    platform === 'facebook' &&
    (url.searchParams.has('comment_id') ||
      url.searchParams.has('reply_comment_id'))
  )
    return 'reply';
  if (platform === 'reddit') {
    const segments = url.pathname
      .replace(/\/$/, '')
      .slice(1)
      .split('/')
      .map((segment) => decodeURIComponent(segment));
    if (
      (segments.length === 6 &&
        segments[0] === 'r' &&
        segments[2] === 'comments') ||
      (segments.length === 4 && segments[0] === 'comments')
    )
      return 'reply';
  }
  return 'post';
}
