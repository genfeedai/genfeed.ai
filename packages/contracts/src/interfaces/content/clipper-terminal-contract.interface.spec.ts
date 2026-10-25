import { describe, expect, it } from 'vitest';
import {
  clipperResultGenerationSource,
  isClipperLibraryLinkStatus,
  parseClipperResultIdFromGenerationSource,
} from './clipper-terminal-contract.interface';

describe('clip library link contract', () => {
  it('round-trips a clipper-result generation source without colliding with other sources', () => {
    expect(clipperResultGenerationSource('clip-1')).toBe(
      'clipper-result:clip-1',
    );
    expect(
      parseClipperResultIdFromGenerationSource('clipper-result:clip-1'),
    ).toBe('clip-1');
    expect(
      parseClipperResultIdFromGenerationSource('fleet-ingest:instagram'),
    ).toBeUndefined();
  });

  it('accepts only the documented Library-link states', () => {
    expect(isClipperLibraryLinkStatus('linked')).toBe(true);
    expect(isClipperLibraryLinkStatus('failed')).toBe(true);
    expect(isClipperLibraryLinkStatus('completed')).toBe(false);
  });
});
