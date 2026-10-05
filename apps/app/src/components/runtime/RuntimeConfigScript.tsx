'use client';

import { isDesktopShellBuild } from '@genfeedai/config/deployment';
import { useServerInsertedHTML } from 'next/navigation';
import { useRef } from 'react';

interface RuntimeConfigScriptProps {
  /**
   * Trusted, server-built bootstrap source
   * (`globalThis.__GENFEED_RUNTIME_CONFIG__=…`).
   */
  source: string;
}

/**
 * Injects the runtime config script into the SSR HTML stream without putting a
 * managed `<script>` into the React tree.
 *
 * Why not a plain body `<script>` or next/script under providers:
 * - React 19 treats inline body scripts as hoistable resources; SSR can leave
 *   empty content while the client render still has the full source → hydration
 *   mismatch (server `""` vs client `globalThis.__GENFEED_…`).
 * - next/script `beforeInteractive` nested under ThemeProvider collides with
 *   next-themes' FOUC script as a sibling during hydrate.
 *
 * `useServerInsertedHTML` streams the tag once and this component always
 * renders `null`, so SSR and the first client render match.
 */
export default function RuntimeConfigScript({
  source,
}: RuntimeConfigScriptProps) {
  const hasInserted = useRef(false);
  const bootstrapSource = `${source}
    globalThis.__GENFEED_RUNTIME_CONFIG__.clientSurface = (${isDesktopShellBuild()} || 'genfeedDesktop' in window) ? 'desktop' : 'web';
    if (globalThis.__GENFEED_RUNTIME_CONFIG__.clientSurface === 'desktop') {
      const applyDesktopClass = () => document.body.classList.add('gf-desktop-shell');
      if (document.body) applyDesktopClass();
      else document.addEventListener('DOMContentLoaded', applyDesktopClass, { once: true });
    }`;

  useServerInsertedHTML(() => {
    if (hasInserted.current) {
      return null;
    }
    hasInserted.current = true;

    return (
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted server-built runtime config
        dangerouslySetInnerHTML={{ __html: bootstrapSource }}
        id="genfeed-runtime-config"
      />
    );
  });

  return null;
}
