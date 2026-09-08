import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { materializeJsonDocumentSchema } from '@eval-actions/registry/contracts/schema-builders';
import { TOOL_ACTION_OUTPUT_SCHEMA } from '@eval-actions/registry/contracts/tool-action-contract';
import {
  CURATED_ACTION_CATALOG,
  type CuratedActionCatalogEntry,
} from '@eval-actions/registry/curated-action-catalog';
import {
  buildLogicalWriteKey,
  evaluateMutationPolicy,
  getDeclaredMutationPolicy,
} from '@eval-actions/registry/mutation-policy';
import { hasRenderableThreadState } from '@eval-agent/utils/has-renderable-thread-state';
import {
  isAgentRuntimeTerminalState,
  resolveAgentRuntimeState,
} from '@eval-contracts/enums/agent-runtime-state.enum';
import { toAgentScopeMetadata } from '@eval-contracts/interfaces/ai/agent-scope-context.interface';
import {
  ActionContractValidationError,
  compileActionContract,
} from '@eval-workflows/engine/validation/action-contract';
import type { EvaluationResult, TaskFixture } from './contracts';

const envelopeSchema: Readonly<Record<string, unknown>> = {
  ...materializeJsonDocumentSchema(TOOL_ACTION_OUTPUT_SCHEMA),
};
const envelopeContract = compileActionContract('fixture-tool-envelope', {
  inputSchema: envelopeSchema,
  outputSchema: envelopeSchema,
});

export function evaluateTask(fixture: TaskFixture): EvaluationResult {
  const started = performance.now();
  let actual: unknown;
  switch (fixture.kind) {
    case 'structured-output': {
      try {
        envelopeContract.validateOutput(fixture.input, {
          runId: fixture.id,
          nodeId: 'fixture-node',
          workflowId: 'fixture-workflow',
          workflowVersionId: 'fixture-workflow-v1',
        });
        actual = { valid: true, correlatedError: false };
      } catch (error) {
        if (!(error instanceof ActionContractValidationError)) throw error;
        actual = {
          valid: false,
          correlatedError:
            error.message.includes(fixture.id) &&
            error.message.includes('fixture-node'),
        };
      }
      break;
    }
    case 'action-policy': {
      const { action, surface, ...approval } = fixture.input;
      const catalog: readonly CuratedActionCatalogEntry[] =
        CURATED_ACTION_CATALOG;
      const available = catalog.some(
        (entry) => entry.name === action && entry.surfaces.includes(surface),
      );
      const policy = getDeclaredMutationPolicy(action);
      actual = {
        available,
        policy: policy ?? null,
        decision: evaluateMutationPolicy({
          ...approval,
          isAvailableOnSurface: available,
          policy,
        }),
      };
      break;
    }
    case 'intent-binding':
      actual = {
        sameIntent:
          buildLogicalWriteKey(fixture.input.prepared) ===
          buildLogicalWriteKey(fixture.input.resumed),
      };
      break;
    case 'runtime': {
      const state = resolveAgentRuntimeState(fixture.input);
      actual = { state, terminal: isAgentRuntimeTerminalState(state) };
      break;
    }
    case 'scope-metadata':
      actual = toAgentScopeMetadata(fixture.input);
      break;
    case 'render-visibility':
      actual = { visible: hasRenderableThreadState(fixture.input) };
      break;
  }
  return {
    fixtureId: fixture.id,
    category: fixture.kind,
    passed: isDeepStrictEqual(actual, fixture.expected),
    expected: fixture.expected,
    actual,
    durationMs: performance.now() - started,
  };
}
