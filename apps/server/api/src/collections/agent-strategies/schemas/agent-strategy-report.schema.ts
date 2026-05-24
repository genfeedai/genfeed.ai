import type { AgentStrategyReportType } from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import type { AgentStrategyReport as PrismaAgentStrategyReport } from '@genfeedai/prisma';

export interface AgentStrategyReportDocument
  extends Omit<PrismaAgentStrategyReport, 'data'> {
  _id: string;
  allocationChanges?: string[];
  bestPlatformFormatPairs?: Array<Record<string, unknown>>;
  bestPostingWindows?: string[];
  brand?: string | null;
  clicks?: number;
  costPerVisit?: number;
  creditsSpent?: number;
  ctr?: number;
  data?: unknown;
  generatedCount?: number;
  impressions?: number;
  metadata?: Record<string, unknown>;
  organization?: string;
  periodEnd?: Date | string;
  periodStart?: Date | string;
  publishedCount?: number;
  reportType?: AgentStrategyReportType;
  strategy?: string;
  topHooks?: string[];
  topTopics?: string[];
  visits?: number;
  [key: string]: unknown;
}

export type AgentStrategyReport = AgentStrategyReportDocument;
