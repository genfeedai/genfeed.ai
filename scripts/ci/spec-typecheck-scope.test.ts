import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveSpecTypecheckScope } from './spec-typecheck-scope';

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

// A small fixture inventory shared across the scope-merge tests below: two
// enrolled apps, a leaf-ish package (`agent`), a widely-imported one
// (`contracts`), and two stand-ins for `packages/tsconfig`'s declared
// consumers.
const ALL_WORKSPACES = [
  'api',
  'app',
  'agent',
  'contracts',
  'tsconfig-consumer-a',
  'tsconfig-consumer-b',
];
const APP_WORKSPACES = ['api', 'app'];

describe('resolveSpecTypecheckScope (#5315)', () => {
  it('package-only: an affected leaf package with no dependent app narrows scope and build filters to it', () => {
    const result = resolveSpecTypecheckScope({
      affectedPackagesOnly: ['agent'],
      allAffectedNames: ['agent'],
      allWorkspaces: ALL_WORKSPACES,
      appWorkspaces: APP_WORKSPACES,
      appsAffectedFromFiles: [],
    });

    expect(result).toEqual({
      buildFilters: ['--filter=@genfeedai/agent'],
      runAny: true,
      workspaces: ['agent'],
    });
  });

  it("dependent-app: an app turbo's graph finds affected only through a package enters scope and disables build narrowing", () => {
    // Neither app's OWN files changed (appsAffectedFromFiles is empty) — only
    // turbo's unfiltered graph (allAffectedNames) reports them, exactly the
    // case the pre-#5315 `--filter='./packages/*'`-only query dropped.
    const result = resolveSpecTypecheckScope({
      affectedPackagesOnly: ['contracts'],
      allAffectedNames: ['contracts', 'api', 'app'],
      allWorkspaces: ALL_WORKSPACES,
      appWorkspaces: APP_WORKSPACES,
      appsAffectedFromFiles: [],
    });

    expect(result.workspaces.slice().sort()).toEqual(
      ['api', 'app', 'contracts'].sort(),
    );
    // An app is in scope purely through the package dependency: the build
    // step must fall back to building every package rather than guessing
    // which subset `api`/`app` need, so the filter list stays empty.
    expect(result.buildFilters).toEqual([]);
    expect(result.runAny).toBe(true);
  });

  it('shared-tsconfig: a shared config change fans out to every declared consumer via the unfiltered graph', () => {
    const result = resolveSpecTypecheckScope({
      affectedPackagesOnly: ['tsconfig-consumer-a', 'tsconfig-consumer-b'],
      allAffectedNames: ['tsconfig-consumer-a', 'tsconfig-consumer-b', 'app'],
      allWorkspaces: ALL_WORKSPACES,
      appWorkspaces: APP_WORKSPACES,
      appsAffectedFromFiles: [],
    });

    expect(result.workspaces.slice().sort()).toEqual(
      ['app', 'tsconfig-consumer-a', 'tsconfig-consumer-b'].sort(),
    );
    expect(result.buildFilters).toEqual([]);
    expect(result.runAny).toBe(true);
  });

  it('no-enrolled-workspace: nothing affected disables the ratchet entirely', () => {
    const result = resolveSpecTypecheckScope({
      affectedPackagesOnly: [],
      allAffectedNames: [],
      allWorkspaces: ALL_WORKSPACES,
      appWorkspaces: APP_WORKSPACES,
      appsAffectedFromFiles: [],
    });

    expect(result).toEqual({ buildFilters: [], runAny: false, workspaces: [] });
  });

  it("honors an app's own changed files even when turbo's unfiltered graph doesn't independently list it", () => {
    const result = resolveSpecTypecheckScope({
      affectedPackagesOnly: [],
      allAffectedNames: [],
      allWorkspaces: ALL_WORKSPACES,
      appWorkspaces: APP_WORKSPACES,
      appsAffectedFromFiles: ['app'],
    });

    expect(result).toEqual({
      buildFilters: [],
      runAny: true,
      workspaces: ['app'],
    });
  });

  it('calls the extracted script from the "Resolve turbo-affected packages" step', () => {
    // The merge logic itself is covered above without touching ci.yml; this
    // only guards the wiring — that the step still invokes the script rather
    // than a reintroduced inline copy of the algorithm.
    const workflow = readWorkflow('ci.yml');
    const match = workflow.match(
      /\n {6}- name: Resolve turbo-affected packages\n([\s\S]+?)\n {6}- name: Spec Typecheck Guard Tests\n/,
    );
    expect(match?.[1]).toContain('bun run scripts/ci/spec-typecheck-scope.ts');
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
