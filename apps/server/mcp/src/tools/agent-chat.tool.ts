import type { ClientService } from '@mcp/services/client.service';
import { executionFailureResult } from '@mcp/tools/execution-failure-result';

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

function jsonText(label: string, payload: unknown) {
  return {
    ...executionFailureResult(payload),
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
    create_chat: async () => {
      const chat = await client.createChat();
      return jsonText('Chat created', chat);
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
