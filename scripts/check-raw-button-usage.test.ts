import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheckRawButtonUsage } from './check-raw-button-usage';

describe('check-raw-button-usage', () => {
  let originalCwd = '';
  let testDir = '';

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(path.join(tmpdir(), 'raw-button-check-'));
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { force: true, recursive: true });
  });

  it('detects raw <button> usage in app code', () => {
    writeFixture(
      'apps/web/app/page.tsx',
      'export default function Page(){return <button>Click</button>;}',
    );

    const result = runCheckRawButtonUsage();
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.type).toBe('raw-button');
    expect(result.violations[0]?.file).toBe('apps/web/app/page.tsx');
  });

  it('detects styled anchors that look like buttons', () => {
    writeFixture(
      'apps/web/app/page.tsx',
      'export default function Page(){return <a className="inline-flex items-center rounded border px-3 py-2 font-medium hover:bg-muted" href="/x">Go</a>;}',
    );

    const result = runCheckRawButtonUsage();
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.type).toBe('styled-anchor');
  });

  it('does not flag plain text links', () => {
    writeFixture(
      'apps/web/app/page.tsx',
      'export default function Page(){return <a href="/terms">Terms</a>;}',
    );

    const result = runCheckRawButtonUsage();
    expect(result.violations).toHaveLength(0);
  });

  it('scans packages/pages in addition to apps/web', () => {
    writeFixture(
      'packages/pages/demo/page.tsx',
      'export default function Page(){return <button>Do it</button>;}',
    );

    const result = runCheckRawButtonUsage();
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.file).toBe('packages/pages/demo/page.tsx');
  });

  it('ignores test files', () => {
    writeFixture(
      'apps/web/app/page.test.tsx',
      'export default function Test(){return <button>Ignore</button>;}',
    );

    const result = runCheckRawButtonUsage();
    expect(result.violations).toHaveLength(0);
  });
});

function writeFixture(relativePath: string, content: string): void {
  const filePath = path.join(process.cwd(), relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}
