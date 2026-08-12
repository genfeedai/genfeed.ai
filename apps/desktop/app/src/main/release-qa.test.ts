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

const readWorkflowStep = (workflow: string, name: string): string => {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);

  if (start === -1) {
    throw new Error(`Workflow step not found: ${name}`);
  }

  const remainder = workflow.slice(start + marker.length);
  const boundaries = [
    remainder.indexOf('\n      - name: '),
    remainder.search(/\n {2}[a-z][a-z0-9-]*:\n/),
  ].filter((offset) => offset >= 0);
  const end =
    boundaries.length === 0
      ? undefined
      : start + marker.length + Math.min(...boundaries);

  return workflow.slice(start, end);
};

describe('desktop release QA', () => {
  it('keeps the release-candidate QA script aligned with smoke coverage', () => {
    const scripts = readPackageJson().scripts;
    const smokeRunner = readText('apps/desktop/app/scripts/run-smoke.cjs');

    expect(scripts?.['qa:release']).toBe(
      'bun run lint && bun run type-check && bun run test && bun run smoke && bun run verify:bundle-size',
    );
    expect(scripts?.smoke).toContain('run-smoke.cjs');
    expect(scripts?.['verify:bundle-size']).toContain('check-bundle-size.cjs');
    expect(smokeRunner).toContain("'--smoke-test'");
    expect(smokeRunner).toContain('90_000');
    expect(smokeRunner).toContain("child.kill('SIGTERM')");
    expect(scripts?.['release:mac']).not.toContain('release:manifest');
    expect(scripts?.['release:metadata']).toContain(
      'finalize-macos-release.cjs',
    );
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
    const captureStep = readWorkflowStep(
      releaseWorkflow,
      'Capture packaged visual QA',
    );
    const deferredStep = readWorkflowStep(
      releaseWorkflow,
      'Record deferred authenticated visual QA',
    );
    const uploadStep = readWorkflowStep(
      releaseWorkflow,
      'Upload visual QA screenshots',
    );

    expect(captureScript).toContain("'SIGKILL'");
    expect(captureScript).toContain('screenshot.byteLength < 10_000');
    expect(captureScript).toContain('hashes.size < 3');
    expect(mainProcess).toContain("'desktop-login.png'");
    expect(mainProcess).toContain("'pkce-callback.png'");
    expect(mainProcess).toContain("'authenticated-route.png'");
    expect(mainProcess).toContain("'logout.png'");
    expect(mainProcess).toContain("'restart-persistence.png'");
    expect(mainProcess).toContain("'expired-credential-recovery.png'");
    expect(captureStep).toContain(
      "if: env.GENFEED_DESKTOP_VISUAL_QA_ENABLED == 'true'",
    );
    expect(captureStep).toContain(
      'GENFEED_DESKTOP_VISUAL_QA_SESSION: $' +
        '{{ secrets.GENFEED_DESKTOP_VISUAL_QA_SESSION }}',
    );
    expect(captureStep).toContain(
      'run: bun run --filter=@genfeedai/desktop visual:qa:release',
    );
    expect(deferredStep).toContain(
      "if: env.GENFEED_DESKTOP_VISUAL_QA_ENABLED != 'true'",
    );
    expect(deferredStep).toContain(
      'Authenticated screenshot evidence was deferred',
    );
    expect(deferredStep).toContain('>> "$GITHUB_STEP_SUMMARY"');
    expect(uploadStep).toContain(
      "if: env.GENFEED_DESKTOP_VISUAL_QA_ENABLED == 'true'",
    );
    expect(uploadStep).toContain('path: apps/desktop/app/visual-qa/*.png');
    expect(
      releaseWorkflow.match(
        /GENFEED_DESKTOP_VISUAL_QA_SESSION: \$\{\{ secrets\.GENFEED_DESKTOP_VISUAL_QA_SESSION \}\}/g,
      ),
    ).toHaveLength(1);
    expect(releaseWorkflow).not.toContain(
      'apps/desktop/app/release/visual-qa/*.png',
    );
  });

  it('keeps desktop releases out of the self-hosted latest channel', () => {
    const releaseWorkflow = readText('.github/workflows/desktop-release.yml');
    const publishStep = readWorkflowStep(
      releaseWorkflow,
      'Attach macOS artifacts to GitHub release',
    );

    expect(publishStep).toContain('uses: softprops/action-gh-release@v3');
    expect(publishStep).toContain('tag_name: $' + '{{ github.ref_name }}');
    expect(publishStep).toContain('make_latest: false');
  });

  it('rejects oversized packaged macOS applications', () => {
    const releaseWorkflow = readText('.github/workflows/desktop-release.yml');
    const verificationStep = readWorkflowStep(
      releaseWorkflow,
      'Verify Developer ID signature, notarization, and app size',
    );

    expect(verificationStep).toContain('MAX_APP_SIZE_MIB=500');
    expect(verificationStep).toContain('APP_SIZE_MIB=');
    expect(verificationStep).toContain('exceeds the 500 MiB release budget');
    expect(verificationStep).toContain('## Desktop package size');
  });

  it('writes release metadata only after Apple staples the disk image', () => {
    const releaseWorkflow = readText('.github/workflows/desktop-release.yml');
    const notarizeIndex = releaseWorkflow.indexOf(
      '- name: Notarize and staple macOS disk images',
    );
    const finalizeIndex = releaseWorkflow.indexOf(
      '- name: Finalize notarized release metadata',
    );
    const verifyIndex = releaseWorkflow.indexOf(
      '- name: Verify Developer ID signature, notarization, and app size',
    );
    const finalizeStep = readWorkflowStep(
      releaseWorkflow,
      'Finalize notarized release metadata',
    );

    expect(notarizeIndex).toBeGreaterThan(-1);
    expect(finalizeIndex).toBeGreaterThan(notarizeIndex);
    expect(verifyIndex).toBeGreaterThan(finalizeIndex);
    expect(finalizeStep).toContain('release:metadata');
    expect(finalizeStep).toContain('release:manifest');
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
