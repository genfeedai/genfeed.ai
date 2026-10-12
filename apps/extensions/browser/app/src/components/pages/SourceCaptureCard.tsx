import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { ReactElement } from 'react';
import type {
  ImportedSourceKind,
  SourceCaptureCardProps,
} from '~models/imported-source.model';
import {
  SOURCE_BASIS_LABELS,
  SOURCE_KIND_LABELS,
} from '~utils/imported-source-labels.util';

const NO_MEDIA = 'none';

export function SourceCaptureCard({
  isBusy,
  kind,
  mediaIndex,
  onAddToKnowledge,
  onDiscard,
  onKindChange,
  onMediaChange,
  onSave,
  preview,
}: SourceCaptureCardProps): ReactElement {
  const chosen = mediaIndex === null ? undefined : preview.media[mediaIndex];
  return (
    <section
      aria-label="Captured source"
      className="space-y-3 rounded-xl border border-border bg-card p-3"
    >
      <div className="space-y-1">
        <p className="text-sm font-medium">{preview.title}</p>
        <p className="text-xs text-muted-foreground">
          {[preview.host, preview.authorLabel].filter(Boolean).join(' · ')}
        </p>
        <p className="text-xs text-muted-foreground">
          {SOURCE_BASIS_LABELS[preview.basis]}
        </p>
      </div>
      {preview.limitation ? (
        <p className="text-xs text-muted-foreground" role="status">
          {preview.limitation}
        </p>
      ) : null}
      {preview.excerpt ? (
        <p className="line-clamp-4 text-sm text-foreground">
          {preview.excerpt}
        </p>
      ) : null}
      <div className="space-y-1">
        <p className="text-xs font-medium">Source type</p>
        <Select
          disabled={isBusy}
          value={kind}
          onValueChange={(value) => onKindChange(value as ImportedSourceKind)}
        >
          <SelectTrigger aria-label="Source type" className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SOURCE_KIND_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium">Media to keep with this source</p>
        <Select
          disabled={isBusy}
          value={mediaIndex === null ? NO_MEDIA : String(mediaIndex)}
          onValueChange={(value) =>
            onMediaChange(value === NO_MEDIA ? null : Number(value))
          }
        >
          <SelectTrigger aria-label="Media" className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_MEDIA}>No media</SelectItem>
            {preview.media.map((choice, index) => (
              <SelectItem
                key={`${choice.url}:${choice.kind}`}
                value={String(index)}
              >
                {`${choice.kind}: ${choice.label}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {chosen ? (
          <p className="text-xs text-muted-foreground" role="note">
            {chosen.note}
          </p>
        ) : preview.media.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No image, video or audio was found on this page.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button isDisabled={isBusy} onClick={onSave} type="button">
          {isBusy ? 'Saving…' : 'Save for later'}
        </Button>
        <Button
          isDisabled={isBusy}
          onClick={onAddToKnowledge}
          type="button"
          variant={ButtonVariant.SECONDARY}
        >
          Add to Knowledge
        </Button>
        <Button
          isDisabled={isBusy}
          onClick={onDiscard}
          type="button"
          variant={ButtonVariant.GHOST}
        >
          Discard
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Saving keeps the original for later. It does not start generation or
        change brand Knowledge.
      </p>
    </section>
  );
}
