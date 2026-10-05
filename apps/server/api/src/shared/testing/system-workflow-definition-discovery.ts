import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSocialInboxOutboundWorkflowDefinition } from '@api/collections/social-inbox/services/social-inbox-outbound-workflow-definition';
import { WORKFLOW_ARTIFACT_ACTION_IDS } from '@api/collections/workflows/services/workflow-artifact-lifecycle.service';
import {
  buildWorkflowArtifactCleanupExecutionDefinition,
  buildWorkflowArtifactCleanupSweepDefinition,
  buildWorkflowArtifactExpiredScopeDefinition,
} from '@api/collections/workflows/services/workflow-artifact-workflow-definition';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';

/**
 * Test-only discovery of every registered system workflow definition: the
 * definition modules, the parameterized factories, and `register*(runner)`
 * modules through a capturing runner. Shared by the wiring and contentHash
 * proofs so both sweep the same set.
 */

const SOURCE_ROOTS = [
  new URL('../../', import.meta.url),
  new URL('../../../../workers/src/', import.meta.url),
].map((url) => fileURLToPath(url));

const DEFINITION_MODULE_PATTERN =
  /workflow[^/]*\.definitions?\.ts$|workflow-definitions?\.ts$/;
const IGNORED_MODULE_PATTERN = /\.(?:spec|service|module)\.ts$/;

/**
 * Definition factories that take arguments cannot be discovered by arity, so
 * every registered variant is listed with the arguments its registrar passes.
 * `register*(runner)` modules are discovered separately through a capturing
 * runner.
 */
export const PARAMETERIZED_DEFINITIONS: SystemWorkflowGraphDefinition[] = [
  buildSocialInboxOutboundWorkflowDefinition('dm'),
  buildSocialInboxOutboundWorkflowDefinition('reply'),
  buildWorkflowArtifactCleanupExecutionDefinition(
    WORKFLOW_ARTIFACT_ACTION_IDS.CLEANUP,
  ),
  buildWorkflowArtifactExpiredScopeDefinition(
    WORKFLOW_ARTIFACT_ACTION_IDS.CLEANUP_EXPIRED_SCOPE,
  ),
  buildWorkflowArtifactCleanupSweepDefinition(
    WORKFLOW_ARTIFACT_ACTION_IDS.DISCOVER_EXPIRED,
  ),
];

export function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isSystemWorkflowDefinition(
  value: unknown,
): value is SystemWorkflowGraphDefinition {
  const candidate = readRecord(value);
  const graph = readRecord(candidate.definition);
  return (
    typeof candidate.canonicalId === 'string' &&
    Array.isArray(graph.nodes) &&
    (graph.edges === undefined || Array.isArray(graph.edges))
  );
}

export async function collectSystemWorkflowDefinitions(): Promise<
  SystemWorkflowGraphDefinition[]
> {
  const modulePaths = SOURCE_ROOTS.flatMap((root) =>
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => `${entry.parentPath}/${entry.name}`)
      .filter(
        (file) =>
          DEFINITION_MODULE_PATTERN.test(file) &&
          !IGNORED_MODULE_PATTERN.test(file),
      ),
  );

  const definitions = new Map<string, SystemWorkflowGraphDefinition>(
    PARAMETERIZED_DEFINITIONS.map((definition) => [
      definition.canonicalId,
      definition,
    ]),
  );
  for (const modulePath of modulePaths.sort()) {
    const exports = readRecord(await import(/* @vite-ignore */ modulePath));
    for (const [exportName, exported] of Object.entries(exports)) {
      const candidates: unknown[] = [];
      if (typeof exported !== 'function') {
        candidates.push(exported);
      } else if (exported.length === 0) {
        candidates.push((exported as () => unknown)());
      } else if (exportName.startsWith('register') && exported.length === 1) {
        // Registrar modules hand definitions straight to the runner.
        (exported as (runner: unknown) => void)({
          registerWorkflow: (definition: unknown) => {
            candidates.push(definition);
          },
        });
      }
      for (const candidate of candidates.flat()) {
        if (isSystemWorkflowDefinition(candidate)) {
          definitions.set(candidate.canonicalId, candidate);
        }
      }
    }
  }
  return [...definitions.values()];
}

type Constructor = new (...args: unknown[]) => Record<string, unknown>;

/** Permissive stand-in for any injected dependency: every access and call yields another stand-in. */
function createPermissiveStub(): unknown {
  const stub: unknown = new Proxy(() => stub, {
    apply: () => stub,
    get: (_target, property) => (property === 'then' ? undefined : stub),
  });
  return stub;
}

export type ServiceRegisteredDefinitions = {
  definitions: SystemWorkflowGraphDefinition[];
  /** Source files (relative to the scanned roots) that call registerWorkflow(. */
  registeringFiles: string[];
  /** Source files that contributed at least one captured definition. */
  contributingFiles: string[];
};

/**
 * Captures definitions that services register from their constructor,
 * `onModuleInit` or `onApplicationBootstrap` (analytics refresh, content
 * learning, public YouTube clips, ...). Every file that calls
 * `registerWorkflow(` is imported; each exported class is built with a
 * capturing runner for its `SystemWorkflowRunnerService` dependency and
 * permissive stubs for the rest, then its lifecycle hooks run.
 */
export async function collectServiceRegisteredDefinitions(
  runnerClass: unknown,
): Promise<ServiceRegisteredDefinitions> {
  const registeringFiles = SOURCE_ROOTS.flatMap((root) =>
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => `${entry.parentPath}/${entry.name}`)
      .filter(
        (file) =>
          /\.ts$/.test(file) &&
          !/\.(?:spec|test)\.ts$|\.d\.ts$/.test(file) &&
          readFileSync(file, 'utf8').includes('registerWorkflow('),
      ),
  ).sort();

  const captured = new Map<string, SystemWorkflowGraphDefinition>();
  const contributing = new Set<string>();
  let currentFile = '';
  const capturingRunner: unknown = new Proxy(
    {},
    {
      get: (_target, property) =>
        property === 'registerWorkflow'
          ? (definition: unknown) => {
              if (isSystemWorkflowDefinition(definition)) {
                captured.set(definition.canonicalId, definition);
                contributing.add(currentFile);
              }
            }
          : property === 'then'
            ? undefined
            : createPermissiveStub(),
    },
  );

  for (const file of registeringFiles) {
    currentFile = file;
    const exports = readRecord(await import(/* @vite-ignore */ file));
    for (const exported of Object.values(exports)) {
      if (typeof exported !== 'function' || !exported.prototype) {
        continue;
      }
      const paramTypes: unknown[] =
        Reflect.getMetadata('design:paramtypes', exported) ?? [];
      const args = paramTypes.map((type) =>
        type === runnerClass ? capturingRunner : createPermissiveStub(),
      );
      try {
        const instance = new (exported as Constructor)(...args);
        for (const hook of ['onModuleInit', 'onApplicationBootstrap']) {
          const method = instance[hook];
          if (typeof method === 'function') {
            await Promise.resolve(method.call(instance)).catch(() => undefined);
          }
        }
      } catch {
        // Not a constructible service, or its hook needs real collaborators.
      }
    }
  }

  return {
    contributingFiles: [...contributing].sort(),
    definitions: [...captured.values()],
    registeringFiles,
  };
}
