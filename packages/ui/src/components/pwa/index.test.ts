import {
  generatePWAManifest,
  generatePWAMetadata,
  getPWAConfig,
} from '@ui/pwa';
import {
  generatePWAManifest as generatePWAManifestDirect,
  generatePWAMetadata as generatePWAMetadataDirect,
  getPWAConfig as getPWAConfigDirect,
} from '@ui/pwa/pwa.helper';
import { describe, expect, it } from 'vitest';

describe('pwa index', () => {
  it('aliased exports PWA helpers', () => {
    expect(generatePWAManifest).toBe(generatePWAManifestDirect);
    expect(generatePWAMetadata).toBe(generatePWAMetadataDirect);
    expect(getPWAConfig).toBe(getPWAConfigDirect);
  });
});
