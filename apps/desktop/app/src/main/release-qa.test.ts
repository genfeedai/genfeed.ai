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
    expect(smokeRunner).toContain('90_000');
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
    // The gate must run through turbo so `qa:release` picks up its `^build`
    // dependency; `bun run --filter` executes the script directly and leaves
    // the workspace packages unbuilt.
    expect(workflow).toContain(
      'bunx turbo run qa:release --filter=@genfeedai/desktop',
    );
    expect(workflow).not.toContain(
      'bun run --filter=@genfeedai/desktop qa:release',
    );
  });

  it('packages the canonical app instead of a desktop-local renderer', () => {
    const buildShell = readText('apps/desktop/app/scripts/build-app-shell.cjs');
    const copyShell = readText('apps/desktop/app/scripts/copy-app-shell.cjs');
    const devShell = readText('apps/desktop/app/scripts/dev.cjs');

    for (const shellScript of [buildShell, copyShell, devShell]) {
      expect(shellScript).toContain(
        "const appRoot = path.resolve(desktopRoot, '../../app');",
      );
    }
  });

  it('requires distinct screenshots across canonical auth lifecycle states', () => {
    const captureScript = readText(
      'apps/desktop/app/scripts/capture-visual-qa.cjs',
    );
    const mainProcess = readText('apps/desktop/app/src/main.ts');
    const releaseWorkflow = readText('.github/workflows/desktop-release.yml');

    expect(captureScript).toContain("'SIGKILL'");
    expect(captureScript).toContain('screenshot.byteLength < 10_000');
    expect(captureScript).toContain('hashes.size < 3');
    expect(mainProcess).toContain("'desktop-login.png'");
    expect(mainProcess).toContain("'pkce-callback.png'");
    expect(mainProcess).toContain("'authenticated-route.png'");
    expect(mainProcess).toContain("'logout.png'");
    expect(mainProcess).toContain("'restart-persistence.png'");
    expect(mainProcess).toContain("'expired-credential-recovery.png'");
    expect(releaseWorkflow).toContain('apps/desktop/app/visual-qa/*.png');
    expect(releaseWorkflow).toContain(
      'GENFEED_DESKTOP_VISUAL_QA_SESSION: $' +
        '{{ secrets.GENFEED_DESKTOP_VISUAL_QA_SESSION }}',
    );
    expect(releaseWorkflow).toContain(
      "if: env.GENFEED_DESKTOP_VISUAL_QA_SESSION != ''",
    );
    expect(releaseWorkflow).toContain(
      "if: env.GENFEED_DESKTOP_VISUAL_QA_SESSION == ''",
    );
    expect(releaseWorkflow).not.toContain(
      'apps/desktop/app/release/visual-qa/*.png',
    );
  });

  it('keeps desktop releases out of the self-hosted latest channel', () => {
    const releaseWorkflow = readText('.github/workflows/desktop-release.yml');

    expect(releaseWorkflow).toContain('tag_name: $' + '{{ github.ref_name }}');
    expect(releaseWorkflow).toContain('make_latest: false');
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
