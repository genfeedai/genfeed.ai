import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  readRepo,
  readSourceOf,
  resolveSourcePathOf,
} from './launch-path-source.util';

/**
 * The launch-path contracts assert on production source. Pinning each subject
 * to a hardcoded path makes an ordinary file move look like a product
 * regression — #3508 moved `scheduleReplyPostWatchAfterPublish` out of
 * `cron.posts.service.ts` and reddened the release Full Suite while the
 * production code was correct. These tests lock the resolver that replaces
 * those hardcoded paths.
 *
 * Fixtures live in a scratch directory addressed by absolute path, so the
 * resolver is exercised without depending on real repository layout.
 */
const scratchRoot = mkdtempSync(join(tmpdir(), 'launch-path-source-'));

afterAll(() => {
  rmSync(scratchRoot, { force: true, recursive: true });
});

function writeFixture(relativePath: string, contents: string): void {
  const absolute = join(scratchRoot, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents, 'utf8');
}

function fixtureRoot(name: string): string {
  return join(scratchRoot, name);
}

describe('launch-path source resolution', () => {
  it('resolves an exported class wherever it sits inside the owning subtree', () => {
    writeFixture(
      'resolves-class/deep/nested/widget.service.ts',
      'export class WidgetService {\n  ship() {}\n}\n',
    );
    const root = fixtureRoot('resolves-class');

    expect(resolveSourcePathOf('WidgetService', { root })).toContain(
      join('deep', 'nested', 'widget.service.ts'),
    );
    expect(readSourceOf('WidgetService', { root })).toContain('ship()');
  });

  it('resolves exported functions, consts, types, and default declarations', () => {
    writeFixture(
      'resolves-kinds/fn.ts',
      'export function buildThing() {\n  return 1;\n}\n',
    );
    writeFixture(
      'resolves-kinds/const.ts',
      "export const THING_KEY = 'thing';\n",
    );
    writeFixture(
      'resolves-kinds/type.ts',
      "export type ThingKind = 'a' | 'b';\n",
    );
    writeFixture(
      'resolves-kinds/component.tsx',
      'export default function ThingCard() {\n  return null;\n}\n',
    );
    const root = fixtureRoot('resolves-kinds');

    expect(readSourceOf('buildThing', { root })).toContain('return 1;');
    expect(readSourceOf('THING_KEY', { root })).toContain("'thing'");
    expect(readSourceOf('ThingKind', { root })).toContain("'a' | 'b'");
    expect(readSourceOf('ThingCard', { root })).toContain('return null;');
  });

  it('ignores files that only reference the declaration', () => {
    writeFixture(
      'ignores-references/owner.service.ts',
      'export class OwnerService {\n  run() {}\n}\n',
    );
    writeFixture(
      'ignores-references/caller.service.ts',
      "import { OwnerService } from './owner.service';\n\nnew OwnerService();\n",
    );

    expect(
      resolveSourcePathOf('OwnerService', {
        root: fixtureRoot('ignores-references'),
      }),
    ).toContain('owner.service.ts');
  });

  it('skips build output so a stale dist copy cannot win the lookup', () => {
    writeFixture(
      'skips-dist/src/only.service.ts',
      'export class OnlyService {}\n',
    );
    writeFixture(
      'skips-dist/dist/only.service.js',
      'export class OnlyService {}\n',
    );

    expect(
      resolveSourcePathOf('OnlyService', { root: fixtureRoot('skips-dist') }),
    ).toContain(join('src', 'only.service.ts'));
  });

  it('skips declaration artifacts so a checked-in .d.ts cannot make a lookup ambiguous', () => {
    writeFixture(
      'skips-declarations/src/typed.service.ts',
      'export class TypedService {}\n',
    );
    writeFixture(
      'skips-declarations/types/typed.service.d.ts',
      'export declare class TypedService {}\n',
    );

    expect(
      resolveSourcePathOf('TypedService', {
        root: fixtureRoot('skips-declarations'),
      }),
    ).toContain(join('src', 'typed.service.ts'));
  });

  it('names the searched subtree when nothing declares the symbol', () => {
    writeFixture('missing-declaration/other.ts', 'export class Other {}\n');

    expect(() =>
      readSourceOf('GhostService', {
        root: fixtureRoot('missing-declaration'),
      }),
    ).toThrowError(/GhostService[\s\S]*missing-declaration/);
  });

  it('names every candidate when the subtree declares the symbol twice', () => {
    writeFixture(
      'ambiguous-declaration/first/dup.service.ts',
      'export class DupService {}\n',
    );
    writeFixture(
      'ambiguous-declaration/second/dup.service.ts',
      'export class DupService {}\n',
    );

    expect(() =>
      readSourceOf('DupService', {
        root: fixtureRoot('ambiguous-declaration'),
      }),
    ).toThrowError(/first[\s\S]*second/);
  });

  it('still reads path-pinned artifacts verbatim', () => {
    expect(readRepo('package.json')).toContain('"name"');
  });
});
