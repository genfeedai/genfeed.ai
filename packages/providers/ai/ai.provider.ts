export interface AIRequest {
  action: string;
  text: string;
}

interface AIResponse {
  result: string;
}

export async function requestAI({ action, text }: AIRequest): Promise<string> {
  const response = await fetch('/api/ai', {
    body: JSON.stringify({ action, text }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const data: AIResponse = await response.json();
  return data.result;
}
