import type { AppProps } from 'next/app';
import '@xterm/xterm/css/xterm.css';
<<<<<<< HEAD
import '../src/renderer/styles.css';
=======
import '../src/renderer/styles.scss';
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)

export default function DesktopAppShell({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
