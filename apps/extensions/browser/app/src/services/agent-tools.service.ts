import type { CuratedActionName } from '@genfeedai/actions';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { apiEndpoint } from '~services/environment.service';
import { HTTPBaseService } from '~services/http-base.service';

export type ExtensionToolAction = 'analytics' | 'generate' | 'image' | 'post';

const TOOL_NAME_BY_ACTION: Record<ExtensionToolAction, CuratedActionName> = {
  analytics: 'get_analytics',
  generate: 'generate_content',
  image: 'generate_image',
  post: 'create_post',
};

/** Thin browser adapter over the canonical action-backed agent-tool endpoint. */
export class AgentToolsService extends HTTPBaseService {
  constructor(token: string) {
    super(apiEndpoint, token);
  }

  async generateText(
    topic: string,
    platform: string,
    type = 'post',
  ): Promise<string> {
    const result = await this.execute('generate', { platform, topic, type });
    const content = result.data?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('No content returned from the action.');
    }
    return content;
  }

  async saveDraft(
    content: string,
    platform: string,
    label: string,
    brandId: string | null,
  ): Promise<void> {
    if (!brandId) {
      throw new Error('Select a brand in Settings before saving a draft.');
    }
    const credentials = await this.instance.get<{
      data: Array<{
        id: string;
        attributes: { platform: string; isConnected: boolean };
      }>;
    }>('/credentials', { params: { brandId, limit: 100 } });
    const matches = credentials.data.data.filter(
      (credential) =>
        credential.attributes.platform === platform &&
        credential.attributes.isConnected,
    );
    if (matches.length !== 1) {
      throw new Error(
        matches.length === 0
          ? `Connect a ${platform} account for this brand in Settings before saving a draft.`
          : 'This brand has multiple connected accounts for this platform. Save the draft in Genfeed to choose an account.',
      );
    }
    await this.instance.post('/posts', {
      credentialId: matches[0].id,
      description: content,
      ingredients: [],
      label,
      source: 'extension',
      targetExecutionState: TargetExecutionState.DRAFT,
    });
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

    if (!response.data.success || response.data.requiresConfirmation) {
      throw new Error(
        response.data.error || 'The action requires approval in Genfeed.',
      );
    }
    return response.data;
  }
}
