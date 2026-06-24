export const LEGACY_CRON_JOB_EXECUTOR = Symbol('LEGACY_CRON_JOB_EXECUTOR');

export interface LegacyCronJobExecutor {
  executeMigratedLegacyCronJob(params: {
    legacyCronJobId: string;
    organizationId: string;
    userId: string;
  }): Promise<Record<string, unknown>>;
}
