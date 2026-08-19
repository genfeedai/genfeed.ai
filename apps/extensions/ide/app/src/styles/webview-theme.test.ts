import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getWebviewStyles } from '@/styles';

describe('VS Code webview theme contract', () => {
  it('delegates the native control palette to the host color scheme', () => {
    const styles = getWebviewStyles();

    expect(styles).toContain('color-scheme: light dark');
    expect(styles).toContain('--background: var(--vscode-sideBar-background)');
    expect(styles).toContain('--foreground: var(--vscode-foreground)');
  });

  it('uses a matched host validation pair for destructive controls', () => {
    const styles = getWebviewStyles();

    expect(styles).toContain(
      '--destructive: var(--vscode-inputValidation-errorBackground',
    );
    expect(styles).toContain(
      '--destructive-foreground: var(--vscode-inputValidation-errorForeground',
    );
  });

  it('defines every non-host CSS variable consumed by component styles', () => {
    const styles = getWebviewStyles();
    const definitions = new Set(
      [...styles.matchAll(/--([a-z][a-z0-9-]+)\s*:/g)]
        .map((match) => match[1])
        .filter((token): token is string => token !== undefined),
    );
    const references = new Set(
      [...styles.matchAll(/var\(--([a-z][a-z0-9-]+)/g)]
        .map((match) => match[1])
        .filter((token): token is string => token !== undefined)
        .filter((token) => !token.startsWith('vscode-')),
    );

    expect([...references].filter((token) => !definitions.has(token))).toEqual(
      [],
    );
  });

  it('defines every non-host CSS variable consumed by a webview provider', () => {
    const viewsDirectory = join(import.meta.dir, '..', 'views');
    const providerStyles = readdirSync(viewsDirectory)
      .filter((filename) => filename.endsWith('.provider.ts'))
      .map((filename) => readFileSync(join(viewsDirectory, filename), 'utf8'))
      .join('\n');
    const styles = `${getWebviewStyles()}\n${providerStyles}`;
    const definitions = new Set(
      [...styles.matchAll(/--([a-z][a-z0-9-]+)\s*:/g)]
        .map((match) => match[1])
        .filter((token): token is string => token !== undefined),
    );
    const references = new Set(
      [...styles.matchAll(/var\(--([a-z][a-z0-9-]+)/g)]
        .map((match) => match[1])
        .filter((token): token is string => token !== undefined)
        .filter((token) => !token.startsWith('vscode-')),
    );

    expect([...references].filter((token) => !definitions.has(token))).toEqual(
      [],
    );
  });
});
