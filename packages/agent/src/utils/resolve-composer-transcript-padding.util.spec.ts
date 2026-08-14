import { resolveComposerTranscriptPaddingPx } from '@genfeedai/agent/utils/resolve-composer-transcript-padding.util';
import { describe, expect, it } from 'vitest';

describe('resolveComposerTranscriptPaddingPx', () => {
  it('uses a tight inset when the composer is not floating', () => {
    expect(
      resolveComposerTranscriptPaddingPx({
        hasFollowUpChips: true,
        isComposerVisible: false,
        overlayHeightPx: 420,
      }),
    ).toBe(20);
  });

  it('pads by the measured overlay so a generation card can scroll the transcript above it', () => {
    expect(
      resolveComposerTranscriptPaddingPx({
        hasFollowUpChips: false,
        isComposerVisible: true,
        overlayHeightPx: 420,
      }),
    ).toBe(436);
  });

  it('falls back to the compact composer stack when height is unknown', () => {
    expect(
      resolveComposerTranscriptPaddingPx({
        hasFollowUpChips: false,
        isComposerVisible: true,
        overlayHeightPx: 0,
      }),
    ).toBe(128);
    expect(
      resolveComposerTranscriptPaddingPx({
        hasFollowUpChips: true,
        isComposerVisible: true,
        overlayHeightPx: 0,
      }),
    ).toBe(176);
  });
});
