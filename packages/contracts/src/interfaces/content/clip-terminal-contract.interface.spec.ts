import { describe, expect, it } from 'vitest';
import {
  clipResultGenerationSource,
  isClipLibraryLinkStatus,
  parseClipResultIdFromGenerationSource,
} from './clip-terminal-contract.interface';

describe('clip library link contract', () => {
  it('round-trips a clip-result generation source without colliding with other sources', () => {
    expect(clipResultGenerationSource('clip-1')).toBe('clip-result:clip-1');
    expect(parseClipResultIdFromGenerationSource('clip-result:clip-1')).toBe(
      'clip-1',
    );
    expect(
      parseClipResultIdFromGenerationSource('fleet-ingest:instagram'),
    ).toBeUndefined();
  });

  it('accepts only the documented Library-link states', () => {
    expect(isClipLibraryLinkStatus('linked')).toBe(true);
    expect(isClipLibraryLinkStatus('failed')).toBe(true);
    expect(isClipLibraryLinkStatus('completed')).toBe(false);
  });
});
