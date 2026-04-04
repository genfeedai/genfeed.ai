/**
 * Props and interfaces for insights analytics pages
 */

import {
  AnomalySeverity,
  ContentSuggestionType,
  InsightCategory,
  InsightImpact,
  SmartAlertSeverity,
  SmartAlertType,
  TrendDirection,
} from '@genfeedai/enums';

export interface Insight {
  id: string;
  category: InsightCategory;
  title: string;
  description: string;
  impact: InsightImpact;
  confidence: number;
  actionableSteps: string[];
  relatedMetrics: string[];
  isRead: boolean;
  createdAt: Date;
}

export interface AnomalyData {
  id: string;
  metric: string;
  currentValue: number;
  expectedValue: number;
  deviation: number;
  severity: AnomalySeverity;
  detectedAt: Date;
  platform?: string;
  description: string;
}

export interface TrendData {
  id: string;
  metric: string;
  direction: TrendDirection;
  changePercent: number;
  period: string;
  forecast: number[];
  confidence: number;
  platform?: string;
}

export interface ContentSuggestion {
  id: string;
  type: ContentSuggestionType;
  title: string;
  description: string;
  expectedImpact: string;
  confidence: number;
  basedOn: string;
}

export interface AudienceSegment {
  id: string;
  name: string;
  size: number;
  engagement: number;
  growth: number;
  topContent: string[];
  peakHours: number[];
  platforms: string[];
}

export interface SmartAlert {
  id: string;
  type: SmartAlertType;
  title: string;
  message: string;
  severity: SmartAlertSeverity;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: Date;
  actionUrl?: string;
  actionLabel?: string;
}

export interface AnomalyDetectionCardProps {
  anomalies: AnomalyData[];
  isLoading?: boolean;
  onDismiss?: (id: string) => void;
  className?: string;
}

export interface TrendAnalysisCardProps {
  trends: TrendData[];
  isLoading?: boolean;
  className?: string;
}

export interface ContentOptimizationCardProps {
  suggestions: ContentSuggestion[];
  isLoading?: boolean;
  onApply?: (id: string) => void;
  className?: string;
}

export interface AudienceInsightsCardProps {
  segments: AudienceSegment[];
  isLoading?: boolean;
  className?: string;
}

export interface SmartAlertsPanelProps {
  alerts: SmartAlert[];
  isLoading?: boolean;
  onMarkRead?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onAction?: (id: string) => void;
  className?: string;
}

export interface InsightsOverviewAiConfig {
  orgId: string;
  token: string;
  onContentSuggested?: (content: string) => void;
}

export interface InsightsOverviewProps {
  brandId?: string;
  className?: string;
  aiConfig?: InsightsOverviewAiConfig;
}
