import type { LibraryAsset } from '@genfeedai/contracts/interfaces';
import type {
  ImportedSourceKind,
  ImportedSourceMediaAvailability,
  ImportedSourceMediaView,
  ImportedSourceView,
  KnowledgeHandoff,
} from '~models/imported-source.model';

export const SOURCE_KIND_LABELS: Record<ImportedSourceKind, string> = {
  article: 'Article',
  audio: 'Audio',
  image: 'Image',
  newsletter: 'Newsletter',
  page: 'Web page',
  podcast: 'Podcast',
  social: 'Social post',
  video: 'Video',
};

export const SOURCE_BASIS_LABELS: Record<
  ImportedSourceView['snapshot']['contentBasis'],
  string
> = {
  metadata_only: 'Link and title only',
  visible_page: 'Visible page text',
  visible_selection: 'Selected text',
  visible_transcript: 'Visible transcript',
};

const MEDIA_ERROR_LABELS: Record<
  NonNullable<ImportedSourceMediaView['errorCode']>,
  string
> = {
  SOURCE_MEDIA_CHANGED: 'The source changed. Reload it, then try again.',
  SOURCE_MEDIA_FAILED: 'The copy failed.',
  SOURCE_MEDIA_UNAVAILABLE: 'The site no longer serves this file.',
  SOURCE_MEDIA_UNCERTAIN:
    'Genfeed could not confirm whether the copy finished.',
  SOURCE_MEDIA_UNSUPPORTED: 'This file type or size is not supported.',
};

export function mediaErrorLabel(view: ImportedSourceMediaView): string {
  return view.errorCode ? MEDIA_ERROR_LABELS[view.errorCode] : '';
}

/** What the saved selection means for the user, before any copy is requested. */
export function availabilityLabel(
  availability: ImportedSourceMediaAvailability,
  kind: string,
): string {
  switch (availability) {
    case 'accessible':
      return `Genfeed can copy this ${kind} into your Library when you prepare it.`;
    case 'embed_only':
      return `This ${kind} plays in the site's own player. Only its link and the page text are saved, not the original ${kind}.`;
    case 'unavailable':
      return `This ${kind} is private or stream-only, so it cannot be copied. The link and text are saved.`;
    default:
      return `Genfeed will check this ${kind} when you prepare it.`;
  }
}

export function canPrepareMedia(
  availability: ImportedSourceMediaAvailability,
): boolean {
  return availability === 'accessible' || availability === 'unknown';
}

export function sourceHost(source: ImportedSourceView): string {
  return source.snapshot.host.replace(/^www\./, '');
}

export function sourceAuthorLabel(source: ImportedSourceView): string {
  const { authorDisplayName, authorHandle } = source.snapshot;
  const handle = authorHandle ? `@${authorHandle}` : '';
  if (authorDisplayName && handle) return `${authorDisplayName} ${handle}`;
  return authorDisplayName || handle;
}

export function knowledgeHandoffFor(
  source: ImportedSourceView,
): KnowledgeHandoff {
  const { capturedText, contentBasis, canonicalUrl, title } = source.snapshot;
  return {
    mode:
      contentBasis === 'metadata_only'
        ? 'link'
        : contentBasis === 'visible_selection'
          ? 'selection'
          : 'page',
    text: capturedText,
    title,
    url: canonicalUrl,
  };
}

/** The prepared media as a Library reference scoped to this brand and organization. */
export function referenceAssetFor(
  source: ImportedSourceView,
  media: ImportedSourceMediaView | undefined,
): LibraryAsset | null {
  if (media?.state !== 'ready' || !media.artifact || !media.mediaKind) {
    return null;
  }
  const { artifact } = media;
  return {
    brandId: artifact.brandId,
    contentTitle: source.snapshot.title,
    contentType: `${media.mediaKind.charAt(0).toUpperCase()}${media.mediaKind.slice(1)}`,
    id: artifact.recordId,
    kind: media.mediaKind,
    reference: {
      brandId: artifact.brandId,
      kind: 'ingredient',
      organizationId: artifact.organizationId,
      recordId: artifact.recordId,
      recordVersion: artifact.recordVersion,
      serializer: 'ingredient',
    },
  };
}
