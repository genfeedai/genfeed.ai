import type { AppProps } from 'next/app';
import '@xterm/xterm/css/xterm.css';
import '../src/renderer/styles.scss';

export default function DesktopAppShell({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
