'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { applyDocumentTheme } from './global-error.theme';

export default function GlobalError() {
  useEffect(() => {
    let mediaQuery: MediaQueryList | null = null;

    try {
      if (typeof window.matchMedia === 'function') {
        mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      }
    } catch {
      // The deterministic fallback remains available without matchMedia.
    }
    const syncTheme = () => applyDocumentTheme();

    syncTheme();
    mediaQuery?.addEventListener('change', syncTheme);
    window.addEventListener('storage', syncTheme);

    return () => {
      mediaQuery?.removeEventListener('change', syncTheme);
      window.removeEventListener('storage', syncTheme);
    };
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="genfeed-theme-document-bootstrap"
          suppressHydrationWarning
          // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted theme bootstrap must execute before the root error document paints
          dangerouslySetInnerHTML={{
            __html: `(${applyDocumentTheme.toString()})()`,
          }}
        />
      </head>
      <body className="docs-global-error">
        <main className="docs-global-error__content">
          <h1>Something went wrong</h1>
          <p>The documentation could not be displayed.</p>
          <Link className="docs-global-error__action" href="/">
            Return to documentation
          </Link>
        </main>
      </body>
    </html>
  );
}
