// In-memory store for webhook results
// In production, use Redis or a database
const webhookResults = new Map<
  string,
  {
    status: string;
    output: unknown;
    error?: string;
    completedAt: string;
  }
>();

export function setWebhookResult(
  id: string,
  result: {
    status: string;
    output: unknown;
    error?: string;
  }
) {
  webhookResults.set(id, {
    ...result,
    completedAt: new Date().toISOString(),
  });

  // Clean up old results (older than 1 hour)
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [key, value] of webhookResults.entries()) {
    if (new Date(value.completedAt).getTime() < oneHourAgo) {
      webhookResults.delete(key);
    }
  }
}

export function getWebhookResult(predictionId: string) {
  return webhookResults.get(predictionId);
}
