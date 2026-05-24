import type { AdOptimizationConfig as PrismaAdOptimizationConfig } from '@genfeedai/prisma';

export type { AdOptimizationConfig as PrismaAdOptimizationConfig } from '@genfeedai/prisma';

export const AD_OPTIMIZATION_CONFIG_KEYS = [
  'analysisWindow',
  'isEnabled',
  'maxBudgetIncreasePct',
  'maxCpm',
  'maxDailyBudgetPerCampaign',
  'maxTotalDailySpend',
  'minCtr',
  'minImpressions',
  'minRoas',
  'minSpend',
] as const;

export type AdOptimizationConfigKey =
  (typeof AD_OPTIMIZATION_CONFIG_KEYS)[number];

export interface AdOptimizationConfigValues {
  analysisWindow: number;
  isEnabled: boolean;
  maxBudgetIncreasePct: number;
  maxCpm: number;
  maxDailyBudgetPerCampaign: number;
  maxTotalDailySpend: number;
  minCtr: number;
  minImpressions: number;
  minRoas: number;
  minSpend: number;
}

export const DEFAULT_AD_OPTIMIZATION_CONFIG: AdOptimizationConfigValues = {
  analysisWindow: 30,
  isEnabled: false,
  maxBudgetIncreasePct: 50,
  maxCpm: 10,
  maxDailyBudgetPerCampaign: 1000,
  maxTotalDailySpend: 5000,
  minCtr: 1,
  minImpressions: 100,
  minRoas: 2,
  minSpend: 10,
};

export interface AdOptimizationConfigDocument
  extends Omit<PrismaAdOptimizationConfig, 'config'>,
    AdOptimizationConfigValues {
  _id: string;
  config?: Record<string, unknown>;
  organization: string;
  [key: string]: unknown;
}
