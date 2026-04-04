import type { ClientService } from '@mcp/services/client.service';

export function handleAdminInfrastructureTool(
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
    control_comfyui: async (a) => {
      const action = a.action as string;
      if ((action === 'stop' || action === 'restart') && a.confirm !== true) {
        return {
          content: [
            {
              text: `${action} ComfyUI requires confirmation. This will ${action === 'stop' ? 'stop the ComfyUI service' : 'restart the ComfyUI service, causing brief downtime'}. Pass confirm: true to proceed.`,
              type: 'text' as const,
            },
          ],
        };
      }
      const result = await client.controlComfyUi(action, a.confirm as boolean);
      return {
        content: [
          {
            text: `ComfyUI ${action} result:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    get_darkroom_health: async () => {
      const health = await client.getDarkroomHealth();
      return {
        content: [
          {
            text: `Darkroom Health:\n\n${JSON.stringify(health, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    list_gpu_personas: async () => {
      const personas = await client.listGpuPersonas();
      const list = Array.isArray(personas) ? personas : [];
      return {
        content: [
          {
            text:
              list.length > 0
                ? `Found ${list.length} GPU personas:\n\n${JSON.stringify(list, null, 2)}`
                : 'No GPU personas found.',
            type: 'text' as const,
          },
        ],
      };
    },
    list_loras: async () => {
      const loras = await client.listLoras();
      const list = Array.isArray(loras) ? loras : [];
      return {
        content: [
          {
            text:
              list.length > 0
                ? `Found ${list.length} LoRA models:\n\n${JSON.stringify(list, null, 2)}`
                : 'No LoRA models found.',
            type: 'text' as const,
          },
        ],
      };
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown admin infrastructure tool: ${name}`);
  return handler(args);
}
