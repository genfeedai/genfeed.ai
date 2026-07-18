import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface DesktopPackageJson {
  scripts?: Record<string, string>;
}

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const repoRoot = path.resolve(desktopRoot, '../../..');

const readText = (relativePath: string): string =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const readPackageJson = (): DesktopPackageJson =>
  JSON.parse(readText('apps/desktop/app/package.json')) as DesktopPackageJson;

describe('desktop release QA', () => {
  it('keeps the release-candidate QA script aligned with smoke coverage', () => {
    const scripts = readPackageJson().scripts;
    const smokeRunner = readText('apps/desktop/app/scripts/run-smoke.cjs');

    expect(scripts?.['qa:release']).toBe(
      'bun run lint && bun run type-check && bun run test && bun run smoke',
    );
    expect(scripts?.smoke).toContain('run-smoke.cjs');
    expect(smokeRunner).toContain("'--smoke-test'");
    expect(smokeRunner).toContain('60_000');
    expect(smokeRunner).toContain("child.kill('SIGTERM')");
    expect(scripts?.['release:mac']).toContain('bun run release:manifest');
  });

  it('exposes macOS desktop QA as a reusable/manual workflow', () => {
    const workflow = readText('.github/workflows/desktop-qa.yml');

    expect(workflow).toContain('name: Desktop QA');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('workflow_call:');
    expect(workflow).toContain('runs-on: macos-latest');
    expect(workflow).toContain('Setup Bun environment');
    expect(workflow).toContain(
      'bun run --filter=@genfeedai/desktop qa:release',
    );
  });

  it('documents the manual desktop release evidence checklist', () => {
    const checklist = readText('apps/desktop/RELEASE_QA.md');

    expect(checklist).toContain('# Desktop Release QA');
    expect(checklist).toContain('## Automated Gate');
    expect(checklist).toContain('## Manual Checklist');
    expect(checklist).toContain('## Release Evidence');
    expect(checklist).toContain('Desktop QA');
    expect(checklist).toContain('genfeed-desktop-release.json');
  });
});
