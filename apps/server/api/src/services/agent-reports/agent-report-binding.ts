import { z } from 'zod';

export const agentReportBindingSchema = z.object({
  enabled: z.literal(true),
  brandId: z.string().min(1),
  userId: z.string().min(1),
  remoteUserId: z.string().min(1),
  channelId: z.string().min(1),
});
export type AgentReportBinding = z.infer<typeof agentReportBindingSchema>;
export function agentReportBindings(config: unknown): AgentReportBinding[] {
  if (
    !config ||
    typeof config !== 'object' ||
    !('agentReportBindings' in config) ||
    !Array.isArray(config.agentReportBindings)
  )
    return [];
  return config.agentReportBindings.flatMap((value) => {
    const parsed = agentReportBindingSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}
export function reportRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export interface AgentReportReviewToken {
  organizationId: string;
  integrationId: string;
  platform: 'telegram' | 'discord';
  binding: AgentReportBinding;
  strategyId: string;
  batchId: string;
  itemId: string;
  postId: string;
  postVersion: string;
}
export const agentReportTokenKey = (token: string): string =>
  `agent-report-review:${token}`;
