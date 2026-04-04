import type { ClientService } from '@mcp/services/client.service';

export function handleAgentChatTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  const handlers: Record<
    string,
    (args: Record<string, unknown>) => Promise<{
      content: Array<{ text: string; type: 'text' }>;
    }>
  > = {
    create_chat: async () => {
      const chat = await client.createChat();
      return {
        content: [
          {
            text: `Chat created:\n\n${JSON.stringify(chat, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    send_chat_message: async (a) => {
      const result = await client.sendChatMessage(
        a.threadId as string,
        a.message as string,
      );
      return {
        content: [
          {
            text: `Response:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown agent chat tool: ${name}`);
  return handler(args);
}
