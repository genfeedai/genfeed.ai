import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import type { ImportedSourceCardProps } from '~models/imported-source.model';
import {
  availabilityLabel,
  canPrepareMedia,
  mediaErrorLabel,
  referenceAssetFor,
  SOURCE_BASIS_LABELS,
  SOURCE_KIND_LABELS,
  sourceAuthorLabel,
  sourceHost,
} from '~utils/imported-source-labels.util';

function MediaBlock({
  isBusy,
  media,
  onCheckMedia,
  onPrepareMedia,
  onRetryMedia,
  onUseReference,
  source,
}: Omit<
  ImportedSourceCardProps,
  'onAddToKnowledge' | 'onOpenOriginal' | 'onRemixNow'
>): ReactElement | null {
  const selected = source.snapshot.selectedMedia;
  if (!selected) {
    return null;
  }
  const asset = referenceAssetFor(source, media);
  const state = media?.state ?? 'not_requested';
  const isPreparable = canPrepareMedia(selected.availability);
  return (
    <div className="space-y-1 border-t border-border pt-2">
      <p className="text-xs font-medium">{`Saved ${selected.kind}`}</p>
      <p className="text-xs text-muted-foreground">
        {availabilityLabel(selected.availability, selected.kind)}
      </p>
      {isPreparable && state === 'processing' ? (
        <p className="text-xs text-muted-foreground" role="status">
          Copying media to your Library…
        </p>
      ) : null}
      {isPreparable && state === 'ready' ? (
        <p className="text-xs text-muted-foreground" role="status">
          Copied to your Library. The original is unchanged.
        </p>
      ) : null}
      {isPreparable && (state === 'failed' || state === 'unavailable') ? (
        <p className="text-xs text-destructive" role="alert">
          {`Media could not be copied. ${media ? mediaErrorLabel(media) : ''}`.trim()}
        </p>
      ) : null}
      {isPreparable && state === 'uncertain' ? (
        <p className="text-xs text-muted-foreground" role="status">
          Genfeed could not confirm whether the copy finished. Check again
          before retrying; a retry may copy the file twice.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {isPreparable && state === 'not_requested' ? (
          <Button
            isDisabled={isBusy}
            onClick={() => onPrepareMedia(source)}
            type="button"
            variant={ButtonVariant.SECONDARY}
          >
            Prepare media
          </Button>
        ) : null}
        {isPreparable &&
        media &&
        (state === 'failed' || state === 'unavailable') &&
        media.canRetry ? (
          <Button
            isDisabled={isBusy}
            onClick={() => onRetryMedia(source, media)}
            type="button"
            variant={ButtonVariant.SECONDARY}
          >
            Retry media copy
          </Button>
        ) : null}
        {isPreparable && (state === 'uncertain' || state === 'processing') ? (
          <Button
            isDisabled={isBusy}
            onClick={() => onCheckMedia(source)}
            type="button"
            variant={ButtonVariant.SECONDARY}
          >
            Check again
          </Button>
        ) : null}
        {asset ? (
          <Button
            isDisabled={isBusy}
            onClick={() => onUseReference(asset)}
            type="button"
            variant={ButtonVariant.SECONDARY}
          >
            Use as reference
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ImportedSourceCard({
  isBusy,
  media,
  onAddToKnowledge,
  onCheckMedia,
  onOpenOriginal,
  onPrepareMedia,
  onRemixNow,
  onRetryMedia,
  onUseReference,
  source,
}: ImportedSourceCardProps): ReactElement {
  const { snapshot } = source;
  const author = sourceAuthorLabel(source);
  return (
    <article className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-sm font-medium">{snapshot.title}</p>
      <p className="text-xs text-muted-foreground">
        {[SOURCE_KIND_LABELS[snapshot.kind], sourceHost(source), author]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <p className="text-xs text-muted-foreground">
        {`${SOURCE_BASIS_LABELS[snapshot.contentBasis]} · Imported ${new Date(
          snapshot.capturedAt,
        ).toLocaleDateString()}`}
      </p>
      {snapshot.capturedText ? (
        <p className="line-clamp-3 text-sm text-foreground">
          {snapshot.capturedText}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Only the link and title were saved for this source.
        </p>
      )}
      <MediaBlock
        isBusy={isBusy}
        media={media}
        onCheckMedia={onCheckMedia}
        onPrepareMedia={onPrepareMedia}
        onRetryMedia={onRetryMedia}
        onUseReference={onUseReference}
        source={source}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => onOpenOriginal(snapshot.canonicalUrl)}
          type="button"
          variant={ButtonVariant.GHOST}
        >
          Open original
        </Button>
        <Button onClick={() => onRemixNow(source)} type="button">
          Remix now
        </Button>
        <Button
          onClick={() => onAddToKnowledge(source)}
          type="button"
          variant={ButtonVariant.SECONDARY}
        >
          Add to Knowledge
        </Button>
      </div>
    </article>
  );
}
