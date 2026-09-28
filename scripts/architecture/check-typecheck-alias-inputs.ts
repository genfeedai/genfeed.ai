/**
 * Guard `type-check` cache hashes against tsconfig `paths` that reach sibling
 * workspace sources.
 *
 * Turbo hashes a workspace's `type-check` from its inputs plus the hashes of
 * the tasks it depends on, and `^build` follows package.json dependencies. A
 * tsconfig alias such as `"@genfeedai/agent/*": ["../agent/src/*"]` makes
 * `tsc` compile a sibling's sources, but if nothing in that task graph hashes
 * the sibling, editing it never changes the consumer's hash: the next run is
 * a cache hit on code that no longer typechecks. That is how
 * `packages/props` stayed green in CI while
 * `turbo run type-check --filter=@genfeedai/props --force` failed.
 *
 * Every alias target must therefore be hashed somewhere in the consumer's
 * `type-check` task graph: through a declared workspace dependency's build,
 * or as `$TURBO_ROOT$/<workspace>/**` in the consumer's own type-check
 * inputs. The same task-graph globs drive the alias-aware PR selection in
 * scripts/ci/typecheck-affected-scope.ts.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';

const TURBO_ROOT_PREFIX = '$TURBO_ROOT$/';
const TURBO_DEFAULT = '$TURBO_DEFAULT$';
const TURBO_EXTENDS = '$TURBO_EXTENDS$';
const ALIAS_PROBE = '__alias_probe__';

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name?: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  workspaces?: string[];
};

type TurboTask = {
  dependsOn?: string[];
  inputs?: string[];
  outputs?: string[];
};

type TurboConfig = {
  tasks?: Record<string, TurboTask | undefined>;
};

export type Workspace = {
  /** Repository-relative, forward slashes. */
  dir: string;
  manifest: PackageManifest;
  name: string;
};

export type TypecheckAliasViolation = {
  alias: string;
  isBuildOutput: boolean;
  target: string;
  targetWorkspace: string;
  tsconfig: string;
  workspace: string;
  workspaceDir: string;
};

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

/** turbo.json is JSONC; TypeScript's config parser accepts its comments. */
function readTurboConfig(filePath: string): TurboConfig {
  if (!existsSync(filePath)) {
    return {};
  }

  const { config, error } = ts.parseConfigFileTextToJson(
    filePath,
    readFileSync(filePath, 'utf8'),
  );
  if (error) {
    throw new Error(
      `${filePath} is not parseable: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`,
    );
  }
  return config as TurboConfig;
}

export function discoverWorkspaces(rootDir: string): Workspace[] {
  const patterns =
    readJson<PackageManifest>(path.join(rootDir, 'package.json')).workspaces ??
    [];
  const manifestPaths = globSync(
    patterns.map((pattern) => `${pattern}/package.json`),
    { cwd: rootDir, ignore: ['**/node_modules/**'], nodir: true },
  );

  return manifestPaths
    .map((manifestPath) => {
      const manifest = readJson<PackageManifest>(
        path.join(rootDir, manifestPath),
      );
      return {
        dir: toPosix(path.dirname(manifestPath)),
        manifest,
        name: manifest.name ?? toPosix(path.dirname(manifestPath)),
      };
    })
    .sort((left, right) => left.dir.localeCompare(right.dir));
}

/** A workspace field replaces the root's unless it lists `$TURBO_EXTENDS$`. */
function mergeTaskField(
  rootValue: string[] | undefined,
  workspaceValue: string[] | undefined,
): string[] | undefined {
  if (!workspaceValue) {
    return rootValue;
  }
  if (!workspaceValue.includes(TURBO_EXTENDS)) {
    return workspaceValue;
  }
  return [
    ...(rootValue ?? []),
    ...workspaceValue.filter((value) => value !== TURBO_EXTENDS),
  ];
}

/** Workspace-relative globs become repository-relative; negations are kept. */
function toRepositoryGlob(workspace: Workspace, glob: string): string {
  const isNegated = glob.startsWith('!');
  const pattern = isNegated ? glob.slice(1) : glob;
  const repositoryGlob = pattern.startsWith(TURBO_ROOT_PREFIX)
    ? pattern.slice(TURBO_ROOT_PREFIX.length)
    : path.posix.join(workspace.dir, pattern);
  return isNegated ? `!${repositoryGlob}` : repositoryGlob;
}

export type TaskHashScope = {
  /**
   * Repository-relative globs of every file that feeds the task's hash.
   * Negated inputs are dropped: they only exclude build artefacts derived
   * from sources the positive globs already hash.
   */
  globs: string[];
  /** Every `<workspace dir>#<task>` in the task's dependency closure. */
  tasks: ReadonlySet<string>;
};

export type TaskGraph = {
  /** Whether a repository-relative file is an output of the owner's build. */
  isBuildOutput: (filePath: string, owner: Workspace) => boolean;
  scope: (workspaceDir: string, task: string) => TaskHashScope;
};

/**
 * Walks turbo's task graph the way its hasher does: a task's own inputs
 * (`$TURBO_DEFAULT$`, or no `inputs`, meaning the workspace's own files), then
 * recursively the tasks it depends on — `^task` through declared workspace
 * dependencies, `task` in the same workspace, `pkg#task` explicitly.
 */
export function createTaskGraph(
  rootDir: string,
  workspaces: readonly Workspace[],
): TaskGraph {
  const rootTasks = readTurboConfig(path.join(rootDir, 'turbo.json')).tasks;
  const byDir = new Map(
    workspaces.map((workspace) => [workspace.dir, workspace]),
  );
  const byName = new Map(
    workspaces.map((workspace) => [workspace.name, workspace]),
  );
  const workspaceTasks = new Map<string, TurboConfig['tasks']>();
  const memo = new Map<string, TaskHashScope>();

  const taskConfig = (workspace: Workspace, task: string): TurboTask => {
    if (!workspaceTasks.has(workspace.dir)) {
      workspaceTasks.set(
        workspace.dir,
        readTurboConfig(path.join(rootDir, workspace.dir, 'turbo.json')).tasks,
      );
    }
    const rootTask = rootTasks?.[task];
    const ownTask = workspaceTasks.get(workspace.dir)?.[task];
    return {
      dependsOn: mergeTaskField(rootTask?.dependsOn, ownTask?.dependsOn),
      inputs: mergeTaskField(rootTask?.inputs, ownTask?.inputs),
      outputs: mergeTaskField(rootTask?.outputs, ownTask?.outputs),
    };
  };

  const collect = (
    workspace: Workspace,
    task: string,
    globs: Set<string>,
    visited: Set<string>,
  ): void => {
    const key = `${workspace.dir}#${task}`;
    if (visited.has(key)) {
      return;
    }
    visited.add(key);

    const { dependsOn = [], inputs = [TURBO_DEFAULT] } = taskConfig(
      workspace,
      task,
    );
    for (const input of inputs) {
      if (input.startsWith('!')) {
        continue;
      }
      globs.add(
        input === TURBO_DEFAULT
          ? `${workspace.dir}/**`
          : toRepositoryGlob(workspace, input),
      );
    }

    const { manifest } = workspace;
    const dependencies = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    });
    for (const dependency of dependsOn) {
      if (dependency.startsWith('^')) {
        for (const name of dependencies) {
          const target = byName.get(name);
          if (target) {
            collect(target, dependency.slice(1), globs, visited);
          }
        }
        continue;
      }
      const [packageName, packageTask] = dependency.includes('#')
        ? dependency.split('#')
        : [undefined, dependency];
      // Root tasks (`//#task`) hash repository files, never a workspace's.
      if (packageName === '//' || !packageTask) {
        continue;
      }
      const target = packageName ? byName.get(packageName) : workspace;
      if (target) {
        collect(target, packageTask, globs, visited);
      }
    }
  };

  return {
    isBuildOutput: (filePath, owner) => {
      const outputs = (taskConfig(owner, 'build').outputs ?? []).map((output) =>
        toRepositoryGlob(owner, output),
      );
      return (
        isHashedBy(
          filePath,
          outputs.filter((output) => !output.startsWith('!')),
        ) &&
        !isHashedBy(
          filePath,
          outputs
            .filter((output) => output.startsWith('!'))
            .map((output) => output.slice(1)),
        )
      );
    },
    scope: (workspaceDir, task) => {
      const key = `${workspaceDir}#${task}`;
      const cached = memo.get(key);
      if (cached) {
        return cached;
      }
      const workspace = byDir.get(workspaceDir);
      if (!workspace) {
        throw new Error(`${workspaceDir} is not a workspace.`);
      }
      const globs = new Set<string>();
      const tasks = new Set<string>();
      collect(workspace, task, globs, tasks);
      const result = { globs: [...globs].sort(), tasks };
      memo.set(key, result);
      return result;
    },
  };
}

export function isHashedBy(
  filePath: string,
  globs: readonly string[],
): boolean {
  return globs.some((glob) => path.posix.matchesGlob(filePath, glob));
}

/** The tsconfig files a `type-check` script hands to `tsc`. */
export function typecheckTsconfigs(script: string): string[] {
  const projects = [...script.matchAll(/(?:^|\s)(?:-p|--project)\s+(\S+)/g)]
    .map((match) => match[1])
    .filter((project): project is string => Boolean(project));

  if (projects.length > 0) {
    return projects;
  }
  return /\btsc\b/.test(script) ? ['tsconfig.json'] : [];
}

function readCompilerPaths(tsconfigPath: string): {
  basePath: string;
  paths: Record<string, string[]>;
} {
  const { config, error } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (error) {
    throw new Error(
      `${tsconfigPath} is not parseable: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`,
    );
  }

  // Only compiler options are needed; skip walking `include`.
  const parsed = ts.parseJsonConfigFileContent(
    config,
    { ...ts.sys, readDirectory: () => [] },
    path.dirname(tsconfigPath),
    undefined,
    tsconfigPath,
  );
  const { baseUrl, pathsBasePath } = parsed.options;

  return {
    basePath:
      baseUrl ??
      (typeof pathsBasePath === 'string'
        ? pathsBasePath
        : path.dirname(tsconfigPath)),
    paths: parsed.options.paths ?? {},
  };
}

/** A concrete repository-relative file standing in for an alias target. */
function aliasProbePath(rootDir: string, absoluteTarget: string): string {
  let probe = absoluteTarget.replaceAll('*', ALIAS_PROBE);
  if (
    !absoluteTarget.includes('*') &&
    existsSync(absoluteTarget) &&
    statSync(absoluteTarget).isDirectory()
  ) {
    probe = path.join(probe, 'index.ts');
  }
  return toPosix(path.relative(rootDir, probe));
}

export function findOwningWorkspace(
  filePath: string,
  workspaces: readonly Workspace[],
): Workspace | undefined {
  let owner: Workspace | undefined;
  for (const workspace of workspaces) {
    if (
      (filePath === workspace.dir ||
        filePath.startsWith(`${workspace.dir}/`)) &&
      workspace.dir.length > (owner?.dir.length ?? -1)
    ) {
      owner = workspace;
    }
  }
  return owner;
}

export function checkTypecheckAliasInputs(
  rootDir: string = process.cwd(),
): TypecheckAliasViolation[] {
  const workspaces = discoverWorkspaces(rootDir);
  const graph = createTaskGraph(rootDir, workspaces);
  const violations: TypecheckAliasViolation[] = [];

  for (const workspace of workspaces) {
    const script = workspace.manifest.scripts?.['type-check'];
    if (!script) {
      continue;
    }

    const scope = graph.scope(workspace.dir, 'type-check');
    const reported = new Set<string>();

    for (const tsconfig of typecheckTsconfigs(script)) {
      const tsconfigPath = path.join(rootDir, workspace.dir, tsconfig);
      if (!existsSync(tsconfigPath)) {
        continue;
      }

      const { basePath, paths } = readCompilerPaths(tsconfigPath);
      for (const [alias, targets] of Object.entries(paths)) {
        for (const target of targets) {
          const probe = aliasProbePath(rootDir, path.resolve(basePath, target));
          if (probe.startsWith('../') || probe.includes('/node_modules/')) {
            continue;
          }

          const owner = findOwningWorkspace(probe, workspaces);
          if (!owner || owner.dir === workspace.dir) {
            continue;
          }

          // A build output is only sound when its build is in the task graph:
          // hashing the owner's sources neither orders nor produces it.
          const isBuildOutput = graph.isBuildOutput(probe, owner);
          const isHashed = isBuildOutput
            ? scope.tasks.has(`${owner.dir}#build`)
            : isHashedBy(probe, scope.globs);
          const key = `${owner.dir}:${isBuildOutput}`;
          if (isHashed || reported.has(key)) {
            continue;
          }

          reported.add(key);
          violations.push({
            alias,
            isBuildOutput,
            target: probe.replaceAll(ALIAS_PROBE, '*'),
            targetWorkspace: owner.dir,
            tsconfig: `${workspace.dir}/${tsconfig}`,
            workspace: workspace.name,
            workspaceDir: workspace.dir,
          });
        }
      }
    }
  }

  return violations;
}

if (import.meta.main) {
  const violations = checkTypecheckAliasInputs();

  if (violations.length > 0) {
    console.error(
      'tsconfig paths reach sibling workspaces that type-check never hashes:',
    );
    for (const violation of violations) {
      console.error(
        `- ${violation.workspace}: "${violation.alias}" -> ${violation.target} (${violation.tsconfig})`,
      );
      console.error(
        violation.isBuildOutput
          ? `    declare ${violation.targetWorkspace} as a dependency so its build runs first, or drop the alias.`
          : `    declare ${violation.targetWorkspace} as a dependency, add "${TURBO_ROOT_PREFIX}${violation.targetWorkspace}/**" to the type-check inputs in ${violation.workspaceDir}/turbo.json, or drop the alias.`,
      );
    }
    process.exit(1);
  }

  console.log(
    'Typecheck alias inputs guard passed: every sibling alias target is hashed by its consumer type-check.',
  );
}
