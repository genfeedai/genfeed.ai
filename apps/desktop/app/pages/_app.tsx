import type { AppProps } from 'next/app';
import '../src/renderer/styles.scss';

export default function DesktopAppShell({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
