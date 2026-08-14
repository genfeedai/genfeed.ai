/**
 * Bottom padding so the last transcript line can scroll above the floating
 * composer overlay (prompt bar + generation card + chips).
 *
 * When the overlay height is measured, use it. Otherwise fall back to the
 * compact composer stack (~8rem) plus an optional chip row.
 */
export function resolveComposerTranscriptPaddingPx({
  hasFollowUpChips,
  isComposerVisible,
  overlayHeightPx,
}: {
  hasFollowUpChips: boolean;
  isComposerVisible: boolean;
  overlayHeightPx: number;
}): number {
  if (!isComposerVisible) {
    return 20;
  }

  if (overlayHeightPx > 0) {
    return overlayHeightPx + 16;
  }

  return hasFollowUpChips ? 176 : 128;
}
