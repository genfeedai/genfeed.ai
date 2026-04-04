import { generatePWAManifest } from '@ui/pwa/pwa.helper';
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return generatePWAManifest('app');
}
