import type { AgentToolResult } from '@genfeedai/interfaces';
import type {
  McpApprovalDecision,
  McpApprovalResource,
} from '@mcp/shared/interfaces/approval.interface';
import type { BaseApiClient } from './base-api-client';

/**
 * Agent-tool proxying and the human-in-the-loop approval lifecycle for mutating
 * MCP tool calls.
 */
export class AgentClient {
  constructor(private readonly base: BaseApiClient) {}

  executeAgentTool(
    name: string,
    parameters: Record<string, unknown>,
    context?: Record<string, unknown>,
  ): Promise<AgentToolResult> {
    this.base.logger.debug(`Proxying agent tool ${name}`);

    return this.base.request(
      `executing agent tool ${name}`,
      async (http) => {
        const response = await http.post(
          `/agent-tools/${encodeURIComponent(name)}/execute`,
          { context, parameters },
        );
        return response.data as AgentToolResult;
      },
      this.base.failWithDetail(`Failed to execute ${name}`),
    );
  }

  /**
   * Persist a PENDING approval for a mutating MCP tool call. The API notifies a
   * reviewer; nothing executes until the approval is resolved.
   */
  createApproval(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpApprovalResource> {
    return this.base.request(
      `creating approval for ${toolName}`,
      async (http) => {
        const response = await http.post('/mcp-approvals', {
          arguments: args,
          toolName,
        });
        return response.data?.data as McpApprovalResource;
      },
      this.base.failWithDetail(`Failed to create approval for ${toolName}`),
    );
  }

  getApproval(approvalId: string): Promise<McpApprovalResource | null> {
    return this.base.request(
      `fetching approval ${approvalId}`,
      async (http) => {
        const response = await http.get(
          `/mcp-approvals/${encodeURIComponent(approvalId)}`,
        );
        return (response.data?.data as McpApprovalResource) ?? null;
      },
      this.base.failWithDetail('Failed to fetch approval'),
    );
  }

  /**
   * Resolve an approval (atomic CLAIM on the API: PENDING -> APPROVED/DECLINED).
   * Throws if the approval was already resolved, which is what lets the caller
   * gate tool execution on a successful claim. The optional `result` is accepted
   * for completeness, but the MCP flow persists the execution outcome separately
   * via {@link attachApprovalResult} after the tool has run.
   */
  resolveApproval(
    approvalId: string,
    decision: McpApprovalDecision,
    result?: Record<string, unknown>,
  ): Promise<McpApprovalResource> {
    return this.base.request(
      `resolving approval ${approvalId}`,
      async (http) => {
        const response = await http.post(
          `/mcp-approvals/${encodeURIComponent(approvalId)}/resolve`,
          { decision, ...(result ? { result } : {}) },
        );
        return response.data?.data as McpApprovalResource;
      },
      this.base.failWithDetail('Failed to resolve approval'),
    );
  }

  /**
   * Attach the tool execution result (or error) to an already-APPROVED approval.
   * Called after the approval has been atomically claimed via {@link resolveApproval}
   * and the tool has run, so the audit record reflects the outcome.
   */
  attachApprovalResult(
    approvalId: string,
    result: Record<string, unknown>,
  ): Promise<McpApprovalResource> {
    return this.base.request(
      `attaching result to approval ${approvalId}`,
      async (http) => {
        const response = await http.post(
          `/mcp-approvals/${encodeURIComponent(approvalId)}/result`,
          { result },
        );
        return response.data?.data as McpApprovalResource;
      },
      this.base.failWithDetail('Failed to attach approval result'),
    );
  }
}
