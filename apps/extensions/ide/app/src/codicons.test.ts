import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATUS_BAR_ICON } from './codicons';

/**
 * Built-in codicon ids this extension references, each verified against
 * https://microsoft.github.io/vscode-codicons/dist/codicon.html
 *
 * VS Code renders an unregistered `$(id)` as blank space rather than failing,
 * so a typo or an invented brand id is invisible until someone looks at the
 * editor. Adding a new icon means either verifying its id against that list and
 * adding it here, or registering a custom id via `contributes.icons` with an
 * icon font shipped in the VSIX.
 */
const BUILT_IN_CODICONS = new Set([
  'broadcast',
  'comment-discussion',
  'edit',
  'files',
  'git-commit',
  'graph',
  'hubot',
  'layout-sidebar-left',
  'library',
  'megaphone',
  'pulse',
  'refresh',
  'rocket',
  'run-all',
  'save',
  'sparkle',
]);

interface ExtensionManifest {
  contributes: {
    commands: { command: string; icon?: string }[];
    icons?: Record<string, unknown>;
  };
}

const manifest = JSON.parse(
  readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'),
) as ExtensionManifest;

const registeredCustomIcons = new Set(
  Object.keys(manifest.contributes.icons ?? {}),
);

/** Extracts `foo` from a `$(foo)` reference, or null if the text isn't one. */
function parseCodiconId(reference: string): string | null {
  return /^\$\(([^)]+)\)$/.exec(reference)?.[1] ?? null;
}

function isRenderable(id: string): boolean {
  return BUILT_IN_CODICONS.has(id) || registeredCustomIcons.has(id);
}

describe('codicon references', () => {
  describe('contributed command icons', () => {
    const commandsWithIcons = manifest.contributes.commands.filter(
      (command): command is { command: string; icon: string } =>
        command.icon !== undefined,
    );

    it('contributes at least one command icon', () => {
      expect(commandsWithIcons.length).toBeGreaterThan(0);
    });

    for (const { command, icon } of commandsWithIcons) {
      it(`${command} uses a renderable icon`, () => {
        const id = parseCodiconId(icon);
        expect(id).not.toBeNull();
        expect(isRenderable(id as string)).toBe(true);
      });
    }
  });

  describe('status bar icon', () => {
    it('is a renderable codicon', () => {
      const id = parseCodiconId(STATUS_BAR_ICON);
      expect(id).not.toBeNull();
      expect(isRenderable(id as string)).toBe(true);
    });
  });

  describe('unregistered custom ids', () => {
    it('does not reference the unregistered genfeed-icon', () => {
      const manifestSource = readFileSync(
        join(import.meta.dir, '..', 'package.json'),
        'utf8',
      );
      const statusBarSource = readFileSync(
        join(import.meta.dir, 'statusBar.ts'),
        'utf8',
      );

      expect(manifestSource).not.toContain('genfeed-icon');
      expect(statusBarSource).not.toContain('genfeed-icon');
    });

    it('registers an icon font for every custom id it declares', () => {
      // `contributes.icons` without a font renders nothing, which is the same
      // failure as not registering the id at all.
      const idsMissingFont = Object.entries(manifest.contributes.icons ?? {})
        .filter(([, definition]) => {
          const { font } = definition as { font?: { src?: unknown[] } };
          return font?.src === undefined;
        })
        .map(([id]) => id);

      expect(idsMissingFont).toEqual([]);
    });
  });
});
