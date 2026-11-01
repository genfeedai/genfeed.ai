import { ButtonVariant } from '@genfeedai/contracts';
import type {
  ClipperReferenceFrameCandidate,
  ClipperReferenceFrameDiagnostic,
} from '@genfeedai/contracts/interfaces';
import { Alert, AlertActions, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { ClipperReferenceFrameSelectorProps } from '@/props/studio/clipper.props';

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

function getCandidateLabel(candidate: ClipperReferenceFrameCandidate): string {
  return `Reference frame at ${formatTimestamp(candidate.timestampSeconds)} from the source video`;
}

function renderDiagnostics(diagnostics: ClipperReferenceFrameDiagnostic[]) {
  if (diagnostics.length === 0) {
    return null;
  }

  const visibleDiagnostics = diagnostics.slice(0, MAX_VISIBLE_DIAGNOSTICS);
  const hiddenCount = diagnostics.length - visibleDiagnostics.length;

  return (
    <Alert className="mt-3" size="sm" variant="warning">
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
    </Alert>
  );
}

export default function ClipperReferenceFrameSelector({
  error,
  onRetry,
  onSelect,
  pendingCandidateId,
  referenceFrames,
}: ClipperReferenceFrameSelectorProps) {
  const selectionLabels = useTranslations('ui.selectionGroups');
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
        <OptionTileGroup
          ariaLabel={selectionLabels('referenceFrames')}
          className="mt-4 sm:grid-cols-3"
          columns={2}
          onValueChange={onSelect}
          value={referenceFrames.selectedCandidateId ?? undefined}
        >
          {candidates.map((candidate) => {
            const timestamp = formatTimestamp(candidate.timestampSeconds);
            const isAvailable = candidate.status === 'available';
            const isPending = pendingCandidateId === candidate.id;
            const isSelected =
              referenceFrames.selectedCandidateId === candidate.id;

            return (
              <OptionTile
                ariaLabel={`${isSelected ? 'Selected' : 'Select'} reference frame at ${timestamp}`}
                isBusy={isPending}
                isDisabled={!isAvailable || pendingCandidateId !== null}
                key={candidate.id}
                layout="stack"
                size="none"
                value={candidate.id}
              >
                <span className="relative block aspect-video w-full overflow-hidden bg-muted">
                  {candidate.url ? (
                    <Image
                      alt={getCandidateLabel(candidate)}
                      className="object-cover outline-media"
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
                  <span className="text-2xs text-muted-foreground">
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
              </OptionTile>
            );
          })}
        </OptionTileGroup>
      )}

      {referenceFrames?.status === 'partial' ? (
        <p className="mt-3 text-xs text-warning" role="status">
          Some reference frames could not be prepared. Available frames remain
          selectable.
        </p>
      ) : null}

      {renderDiagnostics(diagnostics)}

      {error ? (
        <Alert className="mt-3" size="sm" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
          <AlertActions>
            <Button
              className="text-xs"
              isDisabled={pendingCandidateId !== null}
              label="Retry selection"
              onClick={onRetry}
              type="button"
              variant={ButtonVariant.LINK}
              withWrapper={false}
            />
          </AlertActions>
        </Alert>
      ) : null}
    </fieldset>
  );
}
