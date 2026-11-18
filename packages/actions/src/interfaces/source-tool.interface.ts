import type { ToolParameterSchema } from './tool-definition.interface';

export interface SourceTool {
  name: string;
  description: string;
  /**
   * What MCP `tools/list` shows instead of `description`, when MCP callers
   * need shorter or different wording. Credit-pricing notes are appended to it
   * the same way as to `description`.
   */
  mcpDescription?: string;
  /** Parameters that only apply in the Genfeed app or an agent thread; MCP omits them. */
  mcpHiddenParameters?: readonly string[];
  parameters: ToolParameterSchema;
  creditCost: number;
  requiredRole: 'user' | 'admin' | 'superadmin';
}
