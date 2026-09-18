import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { post } from './client';

export async function executeAgentTool(
  name: string,
  parameters: Record<string, unknown> = {},
  signal?: AbortSignal
): Promise<AgentToolResult> {
  return post<AgentToolResult>(
    `/agent-tools/${encodeURIComponent(name)}/execute`,
    { parameters },
    signal ? { signal } : {}
  );
}
