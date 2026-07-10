import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type ControlGuardCategory,
  detectViolations,
  runControlGuard,
} from './control-guard';

let rootDir = '';
let originalCwd = '';

beforeEach(() => {
  originalCwd = process.cwd();
  rootDir = mkdtempSync(path.join(tmpdir(), 'control-guard-'));
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(rootDir, { force: true, recursive: true });
});

function write(relativePath: string, content: string): string {
  const filePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
  return relativePath;
}

function categoriesFor(relativePath: string): ControlGuardCategory[] {
  return detectViolations([relativePath], rootDir).map((v) => v.category);
}

describe('control-guard detection', () => {
  it('flags raw <button> in app code as advisory', () => {
    const file = write(
      'apps/app/page.tsx',
      'export default function P(){return <button>Go</button>;}',
    );
    const violations = detectViolations([file], rootDir);
    const button = violations.find((v) => v.category === 'raw-button');
    expect(button).toBeDefined();
    expect(button?.severity).toBe('advisory');
    expect(button?.file).toBe('apps/app/page.tsx');
  });

  it('flags button-like styled anchors as advisory', () => {
    const file = write(
      'apps/app/link.tsx',
      'export default function L(){return <a className="inline-flex items-center rounded border px-3 py-2 font-medium hover:bg-muted" href="/x">Go</a>;}',
    );
    expect(categoriesFor(file)).toContain('styled-anchor');
  });

  it('does not flag plain text links', () => {
    const file = write(
      'apps/app/plain.tsx',
      'export default function T(){return <a href="/terms">Terms</a>;}',
    );
    expect(categoriesFor(file)).not.toContain('styled-anchor');
  });

  it('flags raw <input> and <select> as required', () => {
    const file = write(
      'apps/app/form.tsx',
      'export default function F(){return <div><input name="a" /><select name="b"></select></div>;}',
    );
    const violations = detectViolations([file], rootDir);
    const input = violations.find((v) => v.category === 'raw-input');
    const select = violations.find((v) => v.category === 'raw-select');
    expect(input?.severity).toBe('required');
    expect(select?.severity).toBe('required');
  });

  it('allows native hidden and file inputs', () => {
    const file = write(
      'apps/app/hidden.tsx',
      'export default function H(){return <div><input type="hidden" name="a" /><input type="file" name="b" /></div>;}',
    );
    expect(categoriesFor(file)).not.toContain('raw-input');
  });

  it('flags legacy @ui/inputs form imports as required', () => {
    const file = write(
      'apps/app/legacy.tsx',
      'import { Input } from "@ui/inputs/input/Input";\nexport default function G(){return <div />;}',
    );
    const violation = detectViolations([file], rootDir).find(
      (v) => v.category === 'legacy-import',
    );
    expect(violation?.severity).toBe('required');
  });

  it('flags banned wrapper imports in plain .ts files', () => {
    const file = write(
      'packages/services/thing.ts',
      'import x from "@/components/ui/input";\nexport const y = x;',
    );
    const categories = categoriesFor(file);
    expect(categories).toContain('banned-import');
    // .ts is out of scope for element categories.
    expect(categories).not.toContain('raw-html');
  });

  it('flags raw HTML primitives repo-wide via raw-html', () => {
    const file = write(
      'apps/website/thing.tsx',
      'export default function W(){return <table><tr><td>x</td></tr></table>;}',
    );
    const violation = detectViolations([file], rootDir).find(
      (v) => v.category === 'raw-html',
    );
    expect(violation?.severity).toBe('required');
  });

  it('ignores raw elements inside JSX comments', () => {
    const file = write(
      'apps/website/commented.tsx',
      'export default function C(){return <div>{/* <table> was here */}</div>;}',
    );
    expect(categoriesFor(file)).not.toContain('raw-html');
  });

  it('skips primitive-wrapper paths for raw-html and banned-import', () => {
    const file = write(
      'packages/ui/src/primitives/table/Table.tsx',
      'export default function T(){return <table />;}',
    );
    expect(categoriesFor(file)).toHaveLength(0);
  });

  it('skips test, spec, and story files', () => {
    const testFile = write(
      'apps/app/thing.test.tsx',
      'export default function T(){return <button>x</button>;}',
    );
    const storyFile = write(
      'apps/app/thing.stories.tsx',
      'export default function S(){return <input />;}',
    );
    expect(categoriesFor(testFile)).toHaveLength(0);
    expect(categoriesFor(storyFile)).toHaveLength(0);
  });

  it('does not scan files outside any rule scope', () => {
    const file = write(
      'apps/server/api/src/thing.tsx',
      'const x = "<button> as a string, not JSX";',
    );
    // apps/server is outside app/pages scope, but .tsx is in repo-wide raw-html
    // scope — so a real element would still be caught. A bare string is not.
    expect(categoriesFor(file)).not.toContain('raw-button');
  });
});

describe('control-guard allowlist', () => {
  it('honours the button baseline file allowlist', () => {
    const file = write(
      'packages/pages/not-found/not-found-page.tsx',
      'export default function N(){return <button>Home</button>;}',
    );
    expect(categoriesFor(file)).not.toContain('raw-button');
  });

  it('still flags a non-allowlisted sibling in the same tree', () => {
    const file = write(
      'packages/pages/not-found/other-page.tsx',
      'export default function O(){return <button>Home</button>;}',
    );
    expect(categoriesFor(file)).toContain('raw-button');
  });

  it('never scans the guard source itself (it embeds rule patterns as data)', () => {
    // The real file lists banned-import strings as regex literals; scanning it
    // would self-flag. It must be skipped even when passed explicitly.
    const file = write(
      'scripts/ui/control-guard.ts',
      'const p = /@\\/components\\/ui\\/input/g;\nexport const x = p;',
    );
    expect(detectViolations([file], rootDir)).toHaveLength(0);
  });
});

describe('control-guard run modes', () => {
  it('changed-files mode scans only the provided files', () => {
    const flagged = write(
      'apps/app/a.tsx',
      'export default function A(){return <select />;}',
    );
    write('apps/app/b.tsx', 'export default function B(){return <select />;}');

    const { violations } = runControlGuard({ files: [flagged], rootDir });
    const files = new Set(violations.map((v) => v.file));
    expect(files.has('apps/app/a.tsx')).toBe(true);
    expect(files.has('apps/app/b.tsx')).toBe(false);
  });

  it('changed-files mode accepts absolute paths', () => {
    const rel = write(
      'apps/app/abs.tsx',
      'export default function A(){return <select />;}',
    );
    const abs = path.join(rootDir, rel);
    const { violations } = runControlGuard({ files: [abs], rootDir });
    expect(violations.some((v) => v.file === rel)).toBe(true);
  });

  it('repo-wide mode discovers files without an explicit list', () => {
    write('apps/app/deep/nested.tsx', 'export const X = () => <select />;');
    process.chdir(rootDir);
    const { violations } = runControlGuard();
    expect(
      violations.some(
        (v) =>
          v.file === 'apps/app/deep/nested.tsx' && v.category === 'raw-select',
      ),
    ).toBe(true);
  });

  it('is green on a clean tree', () => {
    write(
      'apps/app/clean.tsx',
      'import { Button } from "@ui/primitives/button";\nexport default function C(){return <Button>ok</Button>;}',
    );
    const { violations } = runControlGuard({
      files: ['apps/app/clean.tsx'],
      rootDir,
    });
    expect(violations).toHaveLength(0);
  });
});
