import { render } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RuntimeConfigScript from '@/components/runtime/RuntimeConfigScript';

const insertHTML = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useServerInsertedHTML: insertHTML }));

afterEach(() => vi.unstubAllEnvs());

describe('RuntimeConfigScript browser surface bootstrap', () => {
  it.each([
    { hasBridge: false, isShellBuild: false, surface: 'web' },
    { hasBridge: true, isShellBuild: false, surface: 'desktop' },
    { hasBridge: false, isShellBuild: true, surface: 'desktop' },
    { hasBridge: true, isShellBuild: true, surface: 'desktop' },
  ])(
    'detects $surface for bridge=$hasBridge build=$isShellBuild',
    ({ hasBridge, isShellBuild, surface }) => {
      vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', isShellBuild ? '1' : '0');
      const dom = new JSDOM(
        '<!doctype html><html><body class="gf-app"></body></html>',
        { runScripts: 'outside-only' },
      );
      if (hasBridge)
        Object.defineProperty(dom.window, 'genfeedDesktop', {
          value: undefined,
        });
      let scriptSource = '';
      insertHTML.mockImplementation(
        (
          insert: () => ReactElement<{
            dangerouslySetInnerHTML: { __html: string };
          }> | null,
        ) => {
          const element = insert();
          scriptSource = element?.props.dangerouslySetInnerHTML.__html ?? '';
          expect(insert()).toBeNull();
        },
      );
      render(
        <RuntimeConfigScript
          source={
            'globalThis.__GENFEED_RUNTIME_CONFIG__={"apiEndpoint":"/v1","betterAuthEnabled":true};'
          }
        />,
      );
      dom.window.eval(scriptSource);
      expect(dom.window.eval('globalThis.__GENFEED_RUNTIME_CONFIG__')).toEqual({
        apiEndpoint: '/v1',
        betterAuthEnabled: true,
        clientSurface: surface,
      });
      expect(
        dom.window.document.body.classList.contains('gf-desktop-shell'),
      ).toBe(surface === 'desktop');
      dom.window.close();
    },
  );
});
