import {
  detectDesktopOs,
  formatFileSize,
  getLatestDesktopBuild,
} from '@data/desktop-release.data';
import DesktopContent from '@public/desktop/desktop-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';
import { headers } from 'next/headers';

export const generateMetadata = createPageMetadataWithCanonical(
  'Download Genfeed for Desktop',
  'Run the full Genfeed content OS as a native macOS app. Local workspace, bring-your-own-key generation, and the same account as the web app.',
  '/desktop',
);

/**
 * Reading `headers()` opts this route out of static generation so the download
 * button matches the visitor's OS on the first paint, with no client-side
 * flash. The GitHub release lookup stays cached by its own `revalidate`, so
 * going dynamic costs a render, not an API call per request.
 */
export default async function Desktop() {
  const [requestHeaders, build] = await Promise.all([
    headers(),
    getLatestDesktopBuild(),
  ]);

  return (
    <DesktopContent
      detectedOs={detectDesktopOs(requestHeaders)}
      downloadUrl={build?.downloadUrl ?? null}
      fileSize={formatFileSize(build?.fileSizeBytes ?? null)}
      version={build?.version ?? null}
    />
  );
}
