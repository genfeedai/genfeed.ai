export const AGENT_RUN_SORT_MODES = [
  'latest',
  'credits',
  'duration',
  'model',
] as const;

export type AgentRunSortMode = (typeof AGENT_RUN_SORT_MODES)[number];

export const AGENT_RUN_TIME_RANGES = ['7d', '14d', '30d'] as const;

export type AgentRunTimeRange = (typeof AGENT_RUN_TIME_RANGES)[number];

export const DEFAULT_AGENT_RUN_SORT_MODE: AgentRunSortMode = 'latest';
export const DEFAULT_AGENT_RUN_TIME_RANGE: AgentRunTimeRange = '7d';

export interface AgentRunListQueryParams {
  historyOnly?: boolean;
  model?: string;
  page?: number;
  q?: string;
  routingPolicy?: string;
  sortMode?: AgentRunSortMode;
  status?: string;
  strategy?: string;
  trigger?: string;
  webSearchEnabled?: boolean;
}

export interface AgentRunStatsQueryParams {
  timeRange?: AgentRunTimeRange;
}

export interface AgentRunModelCount {
  count: number;
  model: string;
}

export interface AgentRunRoutingPathCount {
  actualModel: string;
  count: number;
  requestedModel: string;
}

export interface AgentRunTrendPoint {
  autoRoutedRate: number;
  autoRoutedRuns: number;
  averageCreditsUsed: number;
  bucket: string;
  totalCreditsUsed: number;
  totalRuns: number;
  webEnabledRate: number;
  webEnabledRuns: number;
}

export const AGENT_RUN_ANOMALY_KINDS = [
  'auto_routing_spike',
  'web_enabled_drop',
  'model_concentration',
] as const;

export type AgentRunAnomalyKind = (typeof AGENT_RUN_ANOMALY_KINDS)[number];

export const AGENT_RUN_ANOMALY_SEVERITIES = [
  'info',
  'warning',
  'critical',
] as const;

export type AgentRunAnomalySeverity =
  (typeof AGENT_RUN_ANOMALY_SEVERITIES)[number];

export interface AgentRunAnomaly {
  baselineValue: number;
  currentValue: number;
  description: string;
  kind: AgentRunAnomalyKind;
  severity: AgentRunAnomalySeverity;
  title: string;
}

export interface AgentRunStats {
  activeRuns: number;
  anomalies: AgentRunAnomaly[];
  autoRoutedRuns: number;
  completedToday: number;
  failedToday: number;
  routingPaths: AgentRunRoutingPathCount[];
  timeRange: AgentRunTimeRange;
  topActualModels: AgentRunModelCount[];
  topRequestedModels: AgentRunModelCount[];
  totalCreditsToday: number;
  totalRuns: number;
  trends: AgentRunTrendPoint[];
  webEnabledRuns: number;
}
