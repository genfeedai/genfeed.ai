import type { AppProps } from 'next/app';
import '@xterm/xterm/css/xterm.css';
import '../src/renderer/styles.css';

export default function DesktopAppShell({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
