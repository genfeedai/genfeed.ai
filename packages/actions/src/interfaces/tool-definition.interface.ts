import type { CuratedActionName } from '../registry/curated-action-catalog';
import type { ToolsetName } from '../registry/toolset-names';
import type {
  ToolAnnotations,
  ToolCategory,
  ToolDataSource,
  ToolMutationPolicy,
  ToolUiActionType,
} from './tool-policy.interface';

export interface ToolParameterSchema {
  $defs?: Record<string, unknown>;
  additionalProperties?: false;
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  oneOf?: Array<Record<string, unknown>>;
}

export interface ToolSurfaceConfig {
  agent: boolean;
  mcp: boolean;
  cliAgentVisible: boolean;
}

export type ToolRequiredRole = 'user' | 'admin' | 'superadmin';

/**
 * What one call can cost. `creditCost` stays the orchestrator floor so a
 * delegated handler is not charged twice. This field is the amount clients
 * and approval cards show, taken from the same helpers the debit path uses.
 */
export type ToolCreditPricing =
  | { amount: number; mode: 'fixed' }
  | { maximum: number; minimum: number; mode: 'variable'; unit: string }
  | { mode: 'quote'; quoteTool: string };

export interface CanonicalToolDefinition {
  name: CuratedActionName;
  description: string;
  parameters: ToolParameterSchema;
  creditCost: number;
  /** Wording MCP `tools/list` shows in place of `description`, pricing note included. */
  mcpDescription?: string;
  /** Parameters MCP omits from the schema; execution still rejects them. */
  mcpHiddenParameters?: readonly string[];
  /**
   * Honest cost. Omitted only on hand-built fixtures; assembly always sets it.
   * A fixed amount may be higher than `creditCost` when the handler bills
   * and the orchestrator floor is intentionally zero.
   */
  creditPricing?: ToolCreditPricing;
  /** Assembly always sets it; hand-built fixtures may omit it (= stored). */
  dataSource?: ToolDataSource;
  requiredRole: ToolRequiredRole;
  surfaces: ToolSurfaceConfig;
  category: ToolCategory;
  toolset: ToolsetName;
  /**
   * Human-readable MCP title. Set for every MCP-surfaced tool.
   * Directory clients require it alongside {@link annotations}.
   */
  title?: string;
  annotations?: ToolAnnotations;
  mutationPolicy?: ToolMutationPolicy;
  uiActionType?: ToolUiActionType;
  tags?: string[];
  requiresConfirmation?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
}

export type {
  ToolAnnotations,
  ToolCategory,
  ToolDataSource,
  ToolMutationPolicy,
  ToolUiActionType,
} from './tool-policy.interface';
