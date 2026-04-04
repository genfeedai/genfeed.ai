import type { ClientService } from '@mcp/services/client.service';

export function handleAdInsightsTool(
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
    benchmark_ad_performance: async (a) => {
      const result = await client.benchmarkAdPerformance({
        industry: a.industry as string | undefined,
        platform: a.platform as string | undefined,
      });
      return {
        content: [
          {
            text: `Ad Performance Benchmarks:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    generate_ad_variations: async (a) => {
      const result = await client.generateAdVariations({
        body: a.body as string | undefined,
        count: a.count as number | undefined,
        headline: a.headline as string | undefined,
        platform: a.platform as string | undefined,
      });
      return {
        content: [
          {
            text: `Ad Variations:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    get_ad_performance_insights: async (a) => {
      const result = await client.getAdPerformanceInsights({
        industry: a.industry as string | undefined,
        platform: a.platform as string | undefined,
      });
      return {
        content: [
          {
            text: `Ad Performance Insights:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
    suggest_ad_headlines: async (a) => {
      const result = await client.suggestAdHeadlines({
        industry: a.industry as string | undefined,
        platform: a.platform as string | undefined,
        product: a.product as string | undefined,
      });
      return {
        content: [
          {
            text: `Suggested Headlines:\n\n${JSON.stringify(result, null, 2)}`,
            type: 'text' as const,
          },
        ],
      };
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown ad insights tool: ${name}`);
  return handler(args);
}
