export interface AIRequest {
  action: string;
  text: string;
}

// TODO: migrate to NestJS backend AI endpoint
export async function requestAI({ action, text }: AIRequest): Promise<string> {
  void action;
  void text;
  throw new Error(
    'AI provider is not yet migrated to the NestJS backend. Use the server API directly.',
  );
}
