// @vitest-environment jsdom

import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RuntimeConfigScript from '@/components/runtime/RuntimeConfigScript';

const insertHTML = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useServerInsertedHTML: insertHTML }));

afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(window, 'genfeedDesktop');
  Reflect.deleteProperty(window, '__GENFEED_RUNTIME_CONFIG__');
  document.body.className = '';
});

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
      document.body.className = 'gf-app';
      if (hasBridge)
        Object.defineProperty(window, 'genfeedDesktop', {
          configurable: true,
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
      const runtimeConfig = new Function(
        'globalThis',
        'window',
        'document',
        `${scriptSource}\nreturn globalThis.__GENFEED_RUNTIME_CONFIG__;`,
      )(window, window, document);
      expect(runtimeConfig).toEqual({
        apiEndpoint: '/v1',
        betterAuthEnabled: true,
        clientSurface: surface,
      });
      expect(document.body.classList.contains('gf-desktop-shell')).toBe(
        surface === 'desktop',
      );
    },
  );
});
