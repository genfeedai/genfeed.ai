import { describe, expect, it, vi } from 'vitest';

vi.mock('@serwist/next/worker', () => ({
  defaultCache: [],
}));

vi.mock('serwist', () => ({
  Serwist: vi.fn(),
}));

import {
  createServiceWorker,
  generatePWAManifest,
  generatePWAMetadata,
  getPWAConfig,
} from '@ui/pwa';
import {
  generatePWAManifest as generatePWAManifestDirect,
  generatePWAMetadata as generatePWAMetadataDirect,
  getPWAConfig as getPWAConfigDirect,
} from '@ui/pwa/pwa.helper';
import { createServiceWorker as createServiceWorkerDirect } from '@ui/pwa/sw.template';

describe('pwa index', () => {
  it('aliased exports PWA helpers', () => {
    expect(createServiceWorker).toBe(createServiceWorkerDirect);
    expect(generatePWAManifest).toBe(generatePWAManifestDirect);
    expect(generatePWAMetadata).toBe(generatePWAMetadataDirect);
    expect(getPWAConfig).toBe(getPWAConfigDirect);
  });
});
