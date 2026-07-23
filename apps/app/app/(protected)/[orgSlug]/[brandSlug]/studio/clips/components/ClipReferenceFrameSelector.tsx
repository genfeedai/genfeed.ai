'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type {
  ClipReferenceFrameCandidate,
  ClipReferenceFrameDiagnostic,
} from '@genfeedai/interfaces';
import type { ClipReferenceFrameSelectorProps } from '@props/studio/clips.props';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';

const MAX_VISIBLE_DIAGNOSTICS = 3;

function formatTimestamp(timestampSeconds: number): string {
  const roundedSeconds = Math.max(0, Math.round(timestampSeconds));
  const hours = Math.floor(roundedSeconds / 3_600);
  const minutes = Math.floor((roundedSeconds % 3_600) / 60);
  const seconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getCandidateLabel(candidate: ClipReferenceFrameCandidate): string {
  return `Reference frame at ${formatTimestamp(candidate.timestampSeconds)} from the source video`;
}

function renderDiagnostics(diagnostics: ClipReferenceFrameDiagnostic[]) {
  if (diagnostics.length === 0) {
    return null;
  }

  const visibleDiagnostics = diagnostics.slice(0, MAX_VISIBLE_DIAGNOSTICS);
  const hiddenCount = diagnostics.length - visibleDiagnostics.length;

  return (
    <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground/80">
      {visibleDiagnostics.map((diagnostic) => (
        <p key={`${diagnostic.code}-${diagnostic.candidateId ?? 'set'}`}>
          {diagnostic.message}
        </p>
      ))}
      {hiddenCount > 0 ? (
        <p className="mt-1 text-muted-foreground">
          {hiddenCount} more diagnostic{hiddenCount === 1 ? '' : 's'} not shown.
        </p>
      ) : null}
    </div>
  );
}

export default function ClipReferenceFrameSelector({
  error,
  onRetry,
  onSelect,
  pendingCandidateId,
  referenceFrames,
}: ClipReferenceFrameSelectorProps) {
  const candidates = referenceFrames?.candidates ?? [];
  const diagnostics = [
    ...(referenceFrames?.diagnostics ?? []),
    ...candidates.flatMap((candidate) => candidate.diagnostics),
  ];
  const availableCandidates = candidates.filter(
    (candidate) => candidate.status === 'available',
  );
  const isUnavailable =
    referenceFrames?.status === 'unavailable' ||
    (referenceFrames !== undefined && availableCandidates.length === 0);

  return (
    <fieldset className="gen-glass-subtle rounded-xl border border-border p-4">
      <legend className="gen-label px-2 text-xs text-foreground">
        Source reference frame
      </legend>
      <p className="text-sm text-muted-foreground">
        Choose the source image that best represents these clip highlights. This
        is optional and never blocks transcript review.
      </p>

      {!referenceFrames ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Reference frames are not available for this project. You can continue
          reviewing highlights.
        </p>
      ) : referenceFrames.status === 'pending' ? (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          Preparing reference frames. You can continue reviewing highlights.
        </p>
      ) : isUnavailable ? (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          No reference frame previews are available. You can continue reviewing
          highlights.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {candidates.map((candidate) => {
            const timestamp = formatTimestamp(candidate.timestampSeconds);
            const isAvailable = candidate.status === 'available';
            const isPending = pendingCandidateId === candidate.id;
            const isSelected =
              referenceFrames.selectedCandidateId === candidate.id;

            return (
              <Button
                key={candidate.id}
                aria-busy={isPending}
                aria-label={`${isSelected ? 'Selected' : 'Select'} reference frame at ${timestamp}`}
                aria-pressed={isSelected}
                className={`group relative overflow-hidden rounded-lg border p-0 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-secondary hover:border-primary/60'
                }`}
                isDisabled={!isAvailable || pendingCandidateId !== null}
                onClick={() => onSelect(candidate.id)}
                type="button"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              >
                <span className="relative block aspect-video w-full overflow-hidden bg-muted">
                  {candidate.url ? (
                    <Image
                      alt={getCandidateLabel(candidate)}
                      className="object-cover"
                      fill
                      sizes="(min-width: 640px) 240px, 50vw"
                      src={candidate.url}
                      unoptimized
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
                      Preview unavailable
                    </span>
                  )}
                </span>
                <span className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-xs font-medium text-foreground">
                    {timestamp}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {isPending
                      ? 'Saving…'
                      : isSelected
                        ? 'Selected'
                        : candidate.status === 'failed'
                          ? 'Unavailable'
                          : candidate.status === 'pending'
                            ? 'Preparing'
                            : 'Select'}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      )}

      {referenceFrames?.status === 'partial' ? (
        <p className="mt-3 text-xs text-warning" role="status">
          Some reference frames could not be prepared. Available frames remain
          selectable.
        </p>
      ) : null}

      {renderDiagnostics(diagnostics)}

      {error ? (
        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2"
          role="alert"
        >
          <p className="text-xs text-destructive">{error}</p>
          <Button
            className="text-xs"
            isDisabled={pendingCandidateId !== null}
            label="Retry selection"
            onClick={onRetry}
            type="button"
            variant={ButtonVariant.LINK}
            withWrapper={false}
          />
        </div>
      ) : null}
    </fieldset>
  );
}
