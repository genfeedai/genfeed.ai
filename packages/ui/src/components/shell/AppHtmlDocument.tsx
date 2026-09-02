import type { ThemePreference } from '@genfeedai/contracts/constants';
import {
  DNS_PREFETCH_ORIGINS,
  PRECONNECT_ORIGINS,
} from '@ui/shell/resource-hints';
import { ThemeDocumentBootstrapScript } from '@ui/theme/ThemeBootstrapScript';
import type { ReactNode } from 'react';

export interface AppHtmlDocumentProps {
  children: ReactNode;
  initialTheme: ThemePreference;
  fontVariables: string;
  bodyClassName?: string;
  /** Origins to open a full connection to before first paint. */
  preconnect?: readonly string[];
  /** Origins to resolve early without holding a socket open. */
  dnsPrefetch?: readonly string[];
  head?: ReactNode;
  lang?: string;
}

export default function AppHtmlDocument({
  children,
  initialTheme,
  fontVariables,
  bodyClassName = 'gf-app',
  preconnect = PRECONNECT_ORIGINS,
  dnsPrefetch = DNS_PREFETCH_ORIGINS,
  head,
  lang = 'en',
}: AppHtmlDocumentProps) {
  const isSystemPreference = initialTheme === 'system';

  return (
    <html
      lang={lang}
      className={fontVariables}
      data-theme={isSystemPreference ? undefined : initialTheme}
      style={{
        colorScheme: isSystemPreference ? 'light dark' : initialTheme,
      }}
      // next-themes rewrites data-theme/style on the client before React
      // hydrates, so the server-rendered attributes legitimately differ.
      suppressHydrationWarning
    >
      {/* biome-ignore lint/style/noHeadElement: blocking theme bootstrap must execute in document head before first paint */}
      <head>
        {/*
          Connection hints go first so the browser starts DNS + TLS while it is
          still parsing the rest of the head. `crossOrigin` is required on the
          preconnect: our API and CDN are fetched with CORS, and a preconnect
          without it warms a different (non-anonymous) connection pool, so the
          handshake gets paid twice.
        */}
        {preconnect.map((origin) => (
          <link
            crossOrigin="anonymous"
            href={origin}
            key={origin}
            rel="preconnect"
          />
        ))}
        {dnsPrefetch.map((origin) => (
          <link href={origin} key={origin} rel="dns-prefetch" />
        ))}
        {head}
        <ThemeDocumentBootstrapScript />
      </head>
      <body className={bodyClassName}>{children}</body>
    </html>
  );
}
