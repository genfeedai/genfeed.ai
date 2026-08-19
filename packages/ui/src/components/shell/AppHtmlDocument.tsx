import type { ThemePreference } from '@genfeedai/constants';
import { ThemeDocumentBootstrapScript } from '@ui/theme/ThemeBootstrapScript';
import type { ReactNode } from 'react';

export interface AppHtmlDocumentProps {
  children: ReactNode;
  initialTheme: ThemePreference;
  fontVariables: string;
  bodyClassName?: string;
  head?: ReactNode;
  lang?: string;
}

export default function AppHtmlDocument({
  children,
  initialTheme,
  fontVariables,
  bodyClassName = 'gf-app',
  head,
  lang = 'en',
}: AppHtmlDocumentProps) {
  const isSystemPreference = initialTheme === 'system';

  return (
    <html
      lang={lang}
      className={fontVariables}
      data-theme={isSystemPreference ? undefined : initialTheme}
      data-scroll-behavior="smooth"
      style={{
        colorScheme: isSystemPreference ? 'light dark' : initialTheme,
      }}
      // next-themes rewrites data-theme/style on the client before React
      // hydrates, so the server-rendered attributes legitimately differ.
      suppressHydrationWarning
    >
      {/* biome-ignore lint/style/noHeadElement: blocking theme bootstrap must execute in document head before first paint */}
      <head>
        {head}
        <ThemeDocumentBootstrapScript />
      </head>
      <body className={bodyClassName}>{children}</body>
    </html>
  );
}
