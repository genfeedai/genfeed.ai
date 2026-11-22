import OAuthPlatformForm from '@app/oauth/[platform]/oauth-platform-form';
import { Platform } from '@genfeedai/contracts/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

/**
 * Root layout components call `usePathname()`, which is a request-time hole on
 * a route whose param is unknown. Prerendering every connectable platform gives
 * each callback a fully static shell, so no Suspense boundary is streamed.
 */
export function generateStaticParams() {
  return Object.values(Platform).map((platform) => ({
    platform: platform.replaceAll('_', '-'),
  }));
}

export const generateMetadata = createPageMetadata('Connect account');

/**
 * The provider redirects here with a single-use `code`. The page reads no
 * request data on the server, so its shell is static and nothing sits behind a
 * server-streamed Suspense boundary; the client reads the callback URL itself.
 */
export default function OAuthPlatformPage() {
  return <OAuthPlatformForm />;
}
