import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

// The `packages/tsconfig` consumers below extend it by relative path
// (`../tsconfig/base.json` or `../tsconfig/nextjs.json`), which gives turbo's
// `--affected` dependency graph no edge to walk: none of them list
// `@genfeedai/tsconfig` as a package.json dependency. #5315 closed that gap by
// declaring the dependency explicitly instead of adding `packages/tsconfig`
// to `turbo.json`'s `globalDependencies` (which would mark every workspace
// affected on every change to it, defeating the point of `--affected`
// scoping). This list must stay in sync with every `tsconfig.json` under
// `apps/` and `packages/` that extends `../tsconfig/*.json`.
const TSCONFIG_PACKAGE_DEPENDENTS = [
  'apps/app',
  'apps/website',
  'packages/agent',
  'packages/desktop-prisma',
  'packages/fonts',
  'packages/hooks',
  'packages/models',
  'packages/pages',
  'packages/props',
  'packages/services',
  'packages/utils',
];

function readWorkflow(name: string): string {
  return readFileSync(
    path.join(repositoryRoot, '.github/workflows', name),
    'utf8',
  );
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(repositoryRoot, relativePath), 'utf8'),
  ) as Record<string, unknown>;
}

function turboScopeStep(workflow: string): string {
  const match = workflow.match(
    /\n {6}- name: Resolve turbo-affected packages\n([\s\S]+?)\n {6}- name: Spec Typecheck Guard Tests\n/,
  );
  if (!match?.[1]) {
    throw new Error(
      'Could not find the "Resolve turbo-affected packages" step in ci.yml.',
    );
  }
  return match[1];
}

describe('spec typecheck scope (#5315)', () => {
  it("derives app-level scope from turbo's full affected graph, not the packages-only filter", () => {
    const step = turboScopeStep(readWorkflow('ci.yml'));

    // A `--filter='./packages/*'` dry-run answers "which packages should be
    // built" but silently drops any ENROLLED APP turbo's own graph found
    // affected only through a package dependency (#5315). The step must also
    // query the graph without that filter so an app never falls out of
    // `scoped` purely because the CLI query excluded it.
    expect(step).toMatch(/bunx turbo run build --affected --dry=json\)"/);

    // The packages-only query must still exist: "Build packages" never
    // builds an app, so its filter list has to stay package-scoped
    // regardless of which apps ended up affected.
    expect(step).toContain(
      "bunx turbo run build --affected --filter='./packages/*' --dry=json",
    );

    // The build-narrowing decision must key off whether any ENROLLED APP —
    // not just one with its own changed files (`APPS_AFFECTED`) — is in the
    // merged scope, or a package-driven app inclusion would still narrow the
    // build and starve the app's spec typecheck of package dist output.
    expect(step).toMatch(/apps_in_scope/);
    expect(step).not.toMatch(/if \[ -z "\$\{APPS_AFFECTED\/\/ \/\}" \]/);
  });

  for (const dependent of TSCONFIG_PACKAGE_DEPENDENTS) {
    it(`declares @genfeedai/tsconfig as a turbo dependency in ${dependent}`, () => {
      const manifest = readJson(`${dependent}/package.json`);
      const devDependencies =
        (manifest.devDependencies as Record<string, string> | undefined) ?? {};

      // A relative `extends` path (`../tsconfig/*.json`) is invisible to
      // turbo's package.json-based dependency graph. Without this declared
      // dependency, a `packages/tsconfig` change never marks this workspace
      // affected, so its spec typecheck silently keeps stale assumptions
      // about the shared compiler options (#5315).
      expect(devDependencies['@genfeedai/tsconfig']).toBe('workspace:*');
    });
  }

  it('keeps UI component tests enrolled in the spec typecheck ratchet', () => {
    const config = readJson('packages/ui/tsconfig.typecheck.specs.json') as {
      exclude?: string[];
    };

    // `src/components` held 368 of the workspace's 397 test files, typechecked
    // nowhere: the ratchet's own program excluded them and nothing else ran
    // in their place (#5315).
    expect(config.exclude ?? []).not.toContain('src/components');
  });
});
