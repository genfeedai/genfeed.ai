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
import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { RouterPriority } from '@genfeedai/contracts';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/contracts/constants';
import { AgentToolName } from '@genfeedai/contracts/interfaces';

const GEMINI_FUNCTION_SCHEMA_KEYS = new Set([
  '$defs',
  '$ref',
  'anyOf',
  'description',
  'enum',
  'format',
  'items',
  'nullable',
  'properties',
  'required',
  'type',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Gemini function declarations accept a documented OpenAPI subset. Keep the
 * canonical tool contract unchanged for runtime validation and remove only
 * provider-unsupported annotations/constraints from the declaration sent to
 * Gemini. Property names and definition names are data, not schema keywords.
 */
function toGeminiFunctionSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema).flatMap(([key, value]) => {
      if (!GEMINI_FUNCTION_SCHEMA_KEYS.has(key)) return [];

      if ((key === 'properties' || key === '$defs') && isRecord(value)) {
        return [
          [
            key,
            Object.fromEntries(
              Object.entries(value).map(([name, nestedSchema]) => [
                name,
                isRecord(nestedSchema)
                  ? toGeminiFunctionSchema(nestedSchema)
                  : nestedSchema,
              ]),
            ),
          ],
        ];
      }

      if (key === 'items' && isRecord(value)) {
        return [[key, toGeminiFunctionSchema(value)]];
      }

      if (key === 'anyOf' && Array.isArray(value)) {
        return [
          [
            key,
            value.map((candidate) =>
              isRecord(candidate)
                ? toGeminiFunctionSchema(candidate)
                : candidate,
            ),
          ],
        ];
      }

      return [[key, value]];
    }),
  );
}

function resolveProviderToolDefinitions(
  model: string,
  tools: OpenRouterTool[],
): OpenRouterTool[] {
  if (!model.startsWith('google/gemini-')) return tools;

  return tools.map((tool) => ({
    ...tool,
    function: {
      ...tool.function,
      parameters: toGeminiFunctionSchema(tool.function.parameters),
    },
  }));
}

/**
 * Managed credit packs are cloud-only, so the payment card has nothing to sell
 * on a self-hosted install regardless of which surface the turn came from.
 */
export const CLOUD_ONLY_TOOLS: AgentToolName[] = [
  AgentToolName.PRESENT_PAYMENT_OPTIONS,
];

/**
 * Monthly content batches are a managed-orchestration upsell rather than a
 * capability gap, so they are withheld from self-hosted onboarding only —
 * a self-hosted operator can still reach the tool from a normal agent turn.
 */
export const CLOUD_ONLY_ONBOARDING_TOOLS: AgentToolName[] = [
  ...CLOUD_ONLY_TOOLS,
  AgentToolName.GENERATE_MONTHLY_CONTENT,
];

export function resolveBlockedTools(options: {
  source?: string;
}): AgentToolName[] | undefined {
  if (!isSelfHostedDeployment()) {
    return undefined;
  }

  return options.source === 'onboarding'
    ? CLOUD_ONLY_ONBOARDING_TOOLS
    : CLOUD_ONLY_TOOLS;
}

export function buildToolDefinitions(
  allowedTools?: AgentToolName[],
  blockedTools?: AgentToolName[],
): OpenRouterTool[] {
  const all = getToolDefinitions();
  const allowed = allowedTools
    ? all.filter((t) => allowedTools.includes(t.name as AgentToolName))
    : all;
  const filtered = blockedTools
    ? allowed.filter((tool) =>
        blockedTools.every((blockedTool) => blockedTool !== tool.name),
      )
    : allowed;

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
  autoAllowedModelKeys?: string[];
  defaultModelKey: string;
  messages: OpenRouterMessage[];
  model: string;
  prompt: string;
  prioritize?: RouterPriority;
  seedTitle?: string;
  source?: AgentChatRequest['source'];
  tools: OpenRouterTool[];
  sessionId?: string;
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
    defaultModelKey: params.defaultModelKey,
    model: params.model,
    prompt: params.prompt,
    source: params.source,
  });
  const routingPlugins = resolveAgentRoutingPlugins(routingPolicy) ?? [];
  const plugins =
    params.model === AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO
      ? [
          ...routingPlugins,
          {
            allowed_models: params.autoAllowedModelKeys ?? [],
            cost_tier:
              params.prioritize === RouterPriority.QUALITY
                ? ('max' as const)
                : params.prioritize === RouterPriority.COST
                  ? ('low' as const)
                  : ('medium' as const),
            id: 'auto-router',
          },
        ]
      : routingPlugins;
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
    ...(plugins.length > 0 ? { plugins } : {}),
    ...(params.model === AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO &&
    params.sessionId
      ? { session_id: params.sessionId }
      : {}),
    temperature: 0.7,
    tool_choice: 'auto',
    tools: resolveProviderToolDefinitions(params.model, params.tools),
  };
}
