import { readdirSync } from 'node:fs';
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
