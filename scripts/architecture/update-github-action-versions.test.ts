import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import type { ActionReference } from './check-github-action-versions';
import {
  type ActionRelease,
  compareVersionTags,
  isVersionTag,
  planActionVersionUpdates,
  rewriteUsesLine,
} from './update-github-action-versions';

function reference(
  action: string,
  version: string,
  file = '.github/workflows/ci.yml',
  release?: string,
): ActionReference {
  return release
    ? { action, file, line: 1, release, version }
    : { action, file, line: 1, version };
}

const CHECKOUT_RELEASE: ActionRelease = {
  sha: '3d3c42e5aac5ba805825da76410c181273ba90b1',
  tag: 'v7.0.1',
};

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

  it('rewrites mutable tags to immutable SHAs with reviewable release comments', () => {
    expect(
      rewriteUsesLine(
        '      - uses: actions/checkout@v7',
        'actions/checkout',
        CHECKOUT_RELEASE,
      ),
    ).toBe(
      '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
    );
    expect(
      rewriteUsesLine(
        '        uses: "actions/checkout@v7.0.1"',
        'actions/checkout',
        CHECKOUT_RELEASE,
      ),
    ).toBe(
      '        uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1" # v7.0.1',
    );
    expect(
      rewriteUsesLine(
        "        uses: 'github/codeql-action/init@v4'",
        'github/codeql-action',
        {
          sha: 'db488ddef3bf6cb639b32c2e9a7c0a7ea8271d28',
          tag: 'v4',
        },
      ),
    ).toBe(
      "        uses: 'github/codeql-action/init@db488ddef3bf6cb639b32c2e9a7c0a7ea8271d28' # v4",
    );
  });

  it('refreshes labeled digest pins and leaves manual digests alone', () => {
    const current =
      '        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1';
    const old =
      '        uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd # v6';
    const manual =
      '        uses: PlasmoHQ/bpp@c15984c0a74f452851c605cab46f34d9fd6cb158';

    expect(rewriteUsesLine(current, 'actions/checkout', CHECKOUT_RELEASE)).toBe(
      current,
    );
    expect(rewriteUsesLine(old, 'actions/checkout', CHECKOUT_RELEASE)).toBe(
      current,
    );
    expect(rewriteUsesLine(manual, 'PlasmoHQ/bpp', CHECKOUT_RELEASE)).toBe(
      manual,
    );
    expect(
      rewriteUsesLine(
        '        uses: actions/setup-node@v7',
        'actions/checkout',
        CHECKOUT_RELEASE,
      ),
    ).toBe('        uses: actions/setup-node@v7');
  });

  it('preserves prose comments after the reviewable release label', () => {
    expect(
      rewriteUsesLine(
        '        uses: actions/checkout@v6 # keep for compatibility',
        'actions/checkout',
        CHECKOUT_RELEASE,
      ),
    ).toBe(
      '        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1 | keep for compatibility',
    );
  });

  it('plans one immutable release update per action and warns on suspicious labels', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const updates = planActionVersionUpdates(
      [
        reference('actions/checkout', 'v7.0.1'),
        reference(
          'actions/checkout',
          '93cb6efe18208431cddfb8368fd83d5badbf9bfd',
          '.github/actions/setup-bun-env/action.yml',
          'v6',
        ),
        reference('actions/setup-node', 'v7'),
        reference(
          'orhun/git-cliff-action',
          'f50e11560dce63f7c33227798f90b924471a88b5',
          '.github/workflows/release.yml',
          'v4.8.0',
        ),
      ],
      new Map([
        ['actions/checkout', CHECKOUT_RELEASE],
        [
          'actions/setup-node',
          {
            sha: '820762786026740c76f36085b0efc47a31fe5020',
            tag: 'v7',
          },
        ],
        [
          'orhun/git-cliff-action',
          {
            sha: '0123456789012345678901234567890123456789',
            tag: 'v4.7.0',
          },
        ],
      ]),
    );

    expect(updates).toEqual([
      {
        action: 'actions/checkout',
        from: ['93cb6efe18208431cddfb8368fd83d5badbf9bfd # v6', 'v7.0.1'],
        to: CHECKOUT_RELEASE,
        files: [
          '.github/actions/setup-bun-env/action.yml',
          '.github/workflows/ci.yml',
        ],
      },
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'recorded release v4.8.0 is newer than upstream v4.7.0',
      ),
    );
    warn.mockRestore();
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
        [reference('example/action', 'main')],
        new Map([
          [
            'example/action',
            {
              sha: '0123456789012345678901234567890123456789',
              tag: 'v1.0.0',
            },
          ],
        ]),
      ),
    ).toEqual([]);
  });
});
