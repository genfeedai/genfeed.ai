'use client';

import type { ReactNode } from 'react';
import { isMobileDevice, openSocialApp } from './social-app-link';

interface SocialAccountLinkProps {
  /** The network's app address, or null when it has none. */
  appUrl: string | null;
  children: ReactNode;
  label: string;
  webUrl: string;
}

/**
 * A creator's social account. The https link is always there for crawlers and
 * desktop browsers; on a phone a tap opens the network's app first. It is the
 * only client piece of the account row, so the row itself stays on the server.
 */
export default function SocialAccountLink({
  appUrl,
  children,
  label,
  webUrl,
}: SocialAccountLinkProps): React.ReactElement {
  return (
    <a
      aria-label={label}
      className="inline-flex rounded-full"
      href={webUrl}
      onClick={(event) => {
        if (appUrl && isMobileDevice()) {
          event.preventDefault();
          openSocialApp(appUrl, webUrl);
        }
      }}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}
