import type { ClientService } from '@mcp/services/client.service';

type AgentChatToolResult = Promise<{
  content: Array<{ text: string; type: 'text' }>;
}>;

function requiredStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} required`);
  }
  return value;
}

function optionalStringArg(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function optionalNumberArg(
  args: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalBooleanArg(
  args: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = args[key];
  return typeof value === 'boolean' ? value : undefined;
}

function jsonText(label: string, payload: unknown) {
  return {
    content: [
      {
        text: `${label}:\n\n${JSON.stringify(payload, null, 2)}`,
        type: 'text' as const,
      },
    ],
  };
}

export function handleAgentChatTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  const handlers: Record<
    string,
    (args: Record<string, unknown>) => AgentChatToolResult
  > = {
    cancel_agent_run: async (a) => {
      const result = await client.cancelAgentRun(requiredStringArg(a, 'runId'));
      return jsonText('Agent run cancelled', result);
    },
    create_chat: async () => {
      const chat = await client.createChat();
      return jsonText('Chat created', chat);
    },
    get_agent_run: async (a) => {
      const run = await client.getAgentRun(requiredStringArg(a, 'runId'));
      return jsonText('Agent run', run);
    },
    get_agent_run_content: async (a) => {
      const content = await client.getAgentRunContent(
        requiredStringArg(a, 'runId'),
      );
      return jsonText('Agent run content', content);
    },
    list_agent_runs: async (a) => {
      const runs = await client.listAgentRuns({
        active: optionalBooleanArg(a, 'active'),
        cursor: optionalStringArg(a, 'cursor'),
        historyOnly: optionalBooleanArg(a, 'historyOnly'),
        limit: optionalNumberArg(a, 'limit'),
        q: optionalStringArg(a, 'q'),
        status: optionalStringArg(a, 'status'),
      });
      return jsonText('Agent runs', runs);
    },
    retry_agent_run: async (a) => {
      const result = await client.retryAgentRun(
        requiredStringArg(a, 'runId'),
        optionalStringArg(a, 'message'),
      );
      return jsonText('Agent run retry requested', result);
    },
    send_chat_message: async (a) => {
      const result = await client.sendChatMessage(
        requiredStringArg(a, 'threadId'),
        requiredStringArg(a, 'message'),
      );
      return jsonText('Response', result);
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown agent chat tool: ${name}`);
  return handler(args);
}
