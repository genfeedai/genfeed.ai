import type { CuratedActionSurface } from '@eval-actions/registry/curated-action-catalog';
import type {
  MutationApprovalStatus,
  MutationPolicyDecision,
} from '@eval-actions/registry/mutation-policy';
import type { RenderableThreadStateInput } from '@eval-agent/utils/has-renderable-thread-state';
import type { AgentRuntimeStateInput } from '@eval-contracts/enums/agent-runtime-state.enum';
import type { ValidatedAgentScope } from '@eval-contracts/interfaces/ai/agent-scope-context.interface';

export interface FixtureMetadata {
  fixtureVersion: 1;
  provider: 'none';
  model: 'none';
  providerVersion: 'not-applicable';
  modelVersion: 'not-applicable';
  rubricVersion: 'contract-exact-v1';
}
export interface FixtureBase {
  id: string;
  task: string;
  expected: unknown;
}
export interface LogicalIntent {
  arguments: Record<string, unknown>;
  organizationId: string;
  threadId?: string;
  scope?: { brandId?: string; contextVersion: number };
  toolName: string;
  userId: string;
}
export type TaskFixture = FixtureBase &
  (
    | {
        kind: 'structured-output';
        input: unknown;
        expected: { valid: boolean; correlatedError: boolean };
      }
    | {
        kind: 'action-policy';
        input: {
          action: string;
          surface: CuratedActionSurface;
          hasTrustedApproval: boolean;
          hostSupportsApproval?: boolean;
          existing?: {
            result?: Record<string, unknown> | null;
            status: MutationApprovalStatus;
          };
        };
        expected: {
          available: boolean;
          policy: string | null;
          decision: MutationPolicyDecision;
        };
      }
    | {
        kind: 'intent-binding';
        input: { prepared: LogicalIntent; resumed: LogicalIntent };
        expected: { sameIntent: boolean };
      }
    | {
        kind: 'runtime';
        input: AgentRuntimeStateInput;
        expected: { state: string; terminal: boolean };
      }
    | { kind: 'scope-metadata'; input: ValidatedAgentScope }
    | {
        kind: 'render-visibility';
        input: RenderableThreadStateInput;
        expected: { visible: boolean };
      }
  );
export interface EvaluationResult {
  fixtureId: string;
  category: TaskFixture['kind'];
  passed: boolean;
  expected: unknown;
  actual: unknown;
  durationMs: number;
}
