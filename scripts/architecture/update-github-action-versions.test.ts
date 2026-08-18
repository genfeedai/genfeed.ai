import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { ActionReference } from './check-github-action-versions';
import {
  compareVersionTags,
  isVersionTag,
  planActionVersionUpdates,
  rewriteUsesLine,
} from './update-github-action-versions';

function reference(
  action: string,
  version: string,
  file = '.github/workflows/ci.yml',
): ActionReference {
  return { action, file, line: 1, version };
}

describe('GitHub Action version updater', () => {
  it('accepts release tags and rejects branch or digest pins', () => {
    expect(isVersionTag('v7')).toBe(true);
    expect(isVersionTag('v7.0.1')).toBe(true);
    expect(isVersionTag('0.36.0')).toBe(true);
    expect(isVersionTag('v4.8.0')).toBe(true);
    expect(isVersionTag('master')).toBe(false);
    expect(isVersionTag('main')).toBe(false);
    expect(isVersionTag('3d3c42e5aac5ba805825da76410c181273ba90b1')).toBe(
      false,
    );
  });

  it('orders major-only tags below the matching patch release', () => {
    expect(compareVersionTags('v7', 'v7.0.1')).toBeLessThan(0);
    expect(compareVersionTags('v8.0.0', 'v7.0.1')).toBeGreaterThan(0);
    expect(compareVersionTags('0.36.0', 'v0.36.0')).toBe(0);
  });

  it('rewrites quoted, unquoted, and sub-action uses lines', () => {
    expect(
      rewriteUsesLine(
        '      - uses: actions/checkout@v7',
        'actions/checkout',
        'v7.0.1',
      ),
    ).toBe('      - uses: actions/checkout@v7.0.1');
    expect(
      rewriteUsesLine(
        '        uses: "actions/checkout@v7.0.1"',
        'actions/checkout',
        'v8.0.0',
      ),
    ).toBe('        uses: "actions/checkout@v8.0.0"');
    expect(
      rewriteUsesLine(
        "        uses: 'github/codeql-action/init@v4'",
        'github/codeql-action',
        'v5',
      ),
    ).toBe("        uses: 'github/codeql-action/init@v5'");
  });

  it('leaves digest pins, other actions, and already-current pins alone', () => {
    const digest =
      '        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1';

    expect(rewriteUsesLine(digest, 'actions/checkout', 'v8.0.0')).toBe(digest);
    expect(
      rewriteUsesLine(
        '        uses: actions/setup-node@v7',
        'actions/checkout',
        'v8.0.0',
      ),
    ).toBe('        uses: actions/setup-node@v7');
    expect(
      rewriteUsesLine(
        '        uses: actions/checkout@v7.0.1',
        'actions/checkout',
        'v7.0.1',
      ),
    ).toBe('        uses: actions/checkout@v7.0.1');
  });

  it('plans one bump per action and refuses downgrades', () => {
    const updates = planActionVersionUpdates(
      [
        reference('actions/checkout', 'v7.0.1'),
        reference(
          'actions/checkout',
          'v7.0.1',
          '.github/actions/setup-bun-env/action.yml',
        ),
        reference('actions/setup-node', 'v7'),
        reference('orhun/git-cliff-action', 'v4.8.0'),
      ],
      new Map([
        ['actions/checkout', 'v8.0.0'],
        ['actions/setup-node', 'v7'],
        ['orhun/git-cliff-action', 'v4.7.0'],
      ]),
    );

    expect(updates).toEqual([
      {
        action: 'actions/checkout',
        from: ['v7.0.1'],
        to: 'v8.0.0',
        files: [
          '.github/actions/setup-bun-env/action.yml',
          '.github/workflows/ci.yml',
        ],
      },
    ]);
  });

  it('keeps Action pin bumps on the deps:update command', () => {
    const packageJson = readFileSync(
      fileURLToPath(new URL('../../package.json', import.meta.url)),
      'utf8',
    );

    expect(packageJson).toContain('bun run deps:update:actions');
    expect(packageJson).toContain(
      'scripts/architecture/update-github-action-versions.ts',
    );
  });

  it('ignores branch pins when planning updates', () => {
    expect(
      planActionVersionUpdates(
        [reference('genfeedai/console.genfeed.ai', 'master')],
        new Map([['genfeedai/console.genfeed.ai', 'v1.0.0']]),
      ),
    ).toEqual([]);
  });
});
