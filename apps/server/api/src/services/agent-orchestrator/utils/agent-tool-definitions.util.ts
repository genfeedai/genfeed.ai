import type { AgentChatRequest } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { getToolDefinitions } from '@api/services/agent-orchestrator/tools/agent-tool-registry';
import {
  resolveAgentRoutingPlugins,
  resolveAgentRoutingPolicy,
} from '@api/services/agent-orchestrator/utils/agent-routing-policy.util';
import type {
  OpenRouterMessage,
  OpenRouterPlugin,
  OpenRouterTool,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { AgentToolName } from '@genfeedai/interfaces';

export function buildToolDefinitions(
  allowedTools?: AgentToolName[],
): OpenRouterTool[] {
  const all = getToolDefinitions();
  const filtered = allowedTools
    ? all.filter((t) => allowedTools.includes(t.name as AgentToolName))
    : all;

  return filtered.map((tool) => ({
    function: {
      description: tool.description,
      name: tool.name,
      parameters: tool.parameters,
    },
    type: 'function' as const,
  }));
}

export function mergeAllowedTools(
  preferred?: AgentToolName[],
  scoped?: AgentToolName[],
): AgentToolName[] | undefined {
  if (preferred && scoped) {
    return preferred.filter((tool) => scoped.includes(tool));
  }

  return scoped ?? preferred;
}

/** Tools allowed when the user prompt looks like a batch-generation intent. */
export const BATCH_SCOPED_ALLOWED_TOOLS: AgentToolName[] = [
  AgentToolName.GENERATE_CONTENT_BATCH,
  AgentToolName.BATCH_APPROVE_REJECT,
  AgentToolName.GET_CURRENT_BRAND,
  AgentToolName.LIST_BRANDS,
  AgentToolName.LIST_REVIEW_QUEUE,
];

export function buildAgentChatCompletionParams(params: {
  messages: OpenRouterMessage[];
  model: string;
  prompt: string;
  seedTitle?: string;
  source?: AgentChatRequest['source'];
  tools: OpenRouterTool[];
}): {
  max_tokens: number;
  messages: OpenRouterMessage[];
  model: string;
  plugins?: OpenRouterPlugin[];
  temperature: number;
  tool_choice: 'auto';
  tools: OpenRouterTool[];
} {
  const routingPolicy = resolveAgentRoutingPolicy({
    model: params.model,
    prompt: params.prompt,
    source: params.source,
  });
  const plugins = resolveAgentRoutingPlugins(routingPolicy);
  const titleInstruction = params.seedTitle?.trim()
    ? [
        {
          content:
            'If you are ready to provide the final assistant reply for this new conversation and you are not making a tool call, respond with valid JSON only: {"title":"3 to 5 word title in title case","content":"full assistant reply"}. If you need to make a tool call, do that normally and ignore this formatting instruction until the final reply.',
          role: 'system' as const,
        },
      ]
    : [];

  return {
    max_tokens: 4096,
    messages: [...titleInstruction, ...params.messages],
    model: params.model,
    ...(plugins ? { plugins } : {}),
    temperature: 0.7,
    tool_choice: 'auto',
    tools: params.tools,
  };
}
