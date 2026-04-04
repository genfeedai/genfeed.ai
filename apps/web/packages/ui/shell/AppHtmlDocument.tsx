import type { ReactNode } from 'react';

export interface AppHtmlDocumentProps {
  children: ReactNode;
  initialTheme: string;
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
  return (
    <html
      lang={lang}
      className={fontVariables}
      data-theme={initialTheme}
      data-scroll-behavior="smooth"
      style={{ colorScheme: initialTheme }}
    >
      {head ? <head>{head}</head> : null}
      <body className={bodyClassName}>{children}</body>
    </html>
  );
}
