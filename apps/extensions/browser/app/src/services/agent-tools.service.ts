import {
  AgentToolName,
  type AgentToolResult,
} from '@genfeedai/contracts/interfaces';
import { apiEndpoint } from '~services/environment.service';
import { HTTPBaseService } from '~services/http-base.service';

export type ExtensionToolAction = 'analytics' | 'generate' | 'post';

const TOOL_NAME_BY_ACTION: Record<ExtensionToolAction, AgentToolName> = {
  analytics: AgentToolName.GET_ANALYTICS,
  generate: AgentToolName.GENERATE_CONTENT,
  post: AgentToolName.CREATE_POST,
};

/** Thin browser adapter over the canonical action-backed agent-tool endpoint. */
export class AgentToolsService extends HTTPBaseService {
  constructor(token: string) {
    super(apiEndpoint, token);
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
