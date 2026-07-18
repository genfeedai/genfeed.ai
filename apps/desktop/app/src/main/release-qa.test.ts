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

  it('packages the implemented Desktop renderer instead of the SaaS shell', () => {
    const buildShell = readText('apps/desktop/app/scripts/build-app-shell.cjs');
    const copyShell = readText('apps/desktop/app/scripts/copy-app-shell.cjs');
    const devShell = readText('apps/desktop/app/scripts/dev.cjs');

    for (const shellScript of [buildShell, copyShell, devShell]) {
      expect(shellScript).toContain('const appRoot = desktopRoot;');
      expect(shellScript).not.toContain("'../../app'");
    }
  });

  it('requires distinct screenshots with visible first-run state markers', () => {
    const captureScript = readText(
      'apps/desktop/app/scripts/capture-visual-qa.cjs',
    );
    const mainProcess = readText('apps/desktop/app/src/main.ts');
    const releaseWorkflow = readText('.github/workflows/desktop-release.yml');

    expect(captureScript).toContain("'SIGKILL'");
    expect(captureScript).toContain('screenshot.byteLength < 10_000');
    expect(captureScript).toContain('hashes.size < 3');
    expect(mainProcess).toContain("'Continue without an account'");
    expect(mainProcess).toContain("'Connect Genfeed Cloud'");
    expect(mainProcess).toContain("'Choose what leaves this device'");
    expect(releaseWorkflow).toContain('apps/desktop/app/visual-qa/*.png');
    expect(releaseWorkflow).not.toContain(
      'apps/desktop/app/release/visual-qa/*.png',
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
