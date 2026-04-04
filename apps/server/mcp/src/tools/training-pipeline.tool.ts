import type { ClientService } from '@mcp/services/client.service';

export function handleTrainingPipelineTool(
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
    delete_dataset: async (a) => {
      const result = await client.deleteDataset(
        a.handle as string,
        a.confirm as boolean,
      );
      return {
        content: [
          {
            text: result.preview
              ? String(result.message)
              : `Dataset deleted:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    get_dataset_info: async (a) => {
      const info = await client.getDatasetInfo(a.handle as string);
      return {
        content: [
          {
            text: `Dataset Info:\n\n${JSON.stringify(info, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    get_training_status: async (a) => {
      const status = await client.getTrainingStatus(a.jobId as string);
      return {
        content: [
          {
            text: `Training Status:\n\n${JSON.stringify(status, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    run_captioning: async (a) => {
      const result = await client.runCaptioning(a.handle as string);
      return {
        content: [
          {
            text: `Captioning started:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    start_training: async (a) => {
      const result = await client.startTraining({
        handle: a.handle as string,
        learningRate: a.learningRate as number | undefined,
        rank: a.rank as number | undefined,
        steps: a.steps as number | undefined,
      });
      return {
        content: [
          {
            text: `Training started:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown training pipeline tool: ${name}`);
  return handler(args);
}
