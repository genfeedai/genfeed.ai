import type { CuratedActionName } from '@genfeedai/actions';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '~services/environment.service';
import { HTTPBaseService } from '~services/http-base.service';

export type ExtensionToolAction = 'analytics' | 'generate' | 'post';

const TOOL_NAME_BY_ACTION: Record<ExtensionToolAction, CuratedActionName> = {
  analytics: 'get_analytics',
  generate: 'generate_content',
  post: 'create_post',
};

/** Thin browser adapter over the canonical action-backed agent-tool endpoint. */
export class AgentToolsService extends HTTPBaseService {
  constructor(token: string) {
    super(EnvironmentService.apiEndpoint, token);
  }

  async execute(
    action: ExtensionToolAction,
    parameters: Record<string, unknown>,
  ): Promise<AgentToolResult> {
    const toolName = TOOL_NAME_BY_ACTION[action];
    const response = await this.instance.post<AgentToolResult>(
      `/agent-tools/${encodeURIComponent(toolName)}/execute`,
      { parameters },
    );

    return response.data;
  }
}
