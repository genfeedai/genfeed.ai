import type { ClientService } from '@mcp/services/client.service';

export function handleDarkroomGenerationTool(
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
    generate_bootstrap: async (a) => {
      const result = await client.generateDarkroomContent({
        count: a.count as number | undefined,
        personaHandle: a.personaHandle as string,
        prompt: a.prompt as string | undefined,
        type: 'bootstrap',
      });
      return {
        content: [
          {
            text: `Bootstrap generation started:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    generate_darkroom_content: async (a) => {
      const result = await client.generateDarkroomContent({
        count: a.count as number | undefined,
        personaHandle: a.personaHandle as string,
        prompt: a.prompt as string,
        type: 'content',
      });
      return {
        content: [
          {
            text: `Content generation started:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    generate_face_test: async (a) => {
      const result = await client.generateDarkroomContent({
        personaHandle: a.personaHandle as string,
        prompt: (a.prompts as string[]).join('\n'),
        type: 'face-test',
      });
      return {
        content: [
          {
            text: `Face test generation started:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    generate_pulid: async (a) => {
      const result = await client.generateDarkroomContent({
        count: a.count as number | undefined,
        personaHandle: a.personaHandle as string,
        prompt: a.prompt as string,
        type: 'pulid',
      });
      return {
        content: [
          {
            text: `PuLID generation started:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    get_darkroom_job_status: async (a) => {
      const result = await client.getDarkroomJobStatus(a.jobId as string);
      return {
        content: [
          {
            text: `Darkroom Job Status:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown darkroom generation tool: ${name}`);
  return handler(args);
}
