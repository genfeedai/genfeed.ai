import { Prisma } from '@genfeedai/prisma';

export type ContentRunRecord = Record<string, unknown>;

export function isContentRunRecord(value: unknown): value is ContentRunRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toContentRunJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export function hydrateContentRun(
  run: ContentRunRecord | null,
): ContentRunRecord | null {
  if (!run) {
    return null;
  }

  const config = isContentRunRecord(run.config) ? run.config : {};

  return {
    ...run,
    ...config,
    status: run.status ?? config.status,
  };
}

export function hydrateContentRuns(
  runs: ContentRunRecord[],
): ContentRunRecord[] {
  return runs.flatMap((run) => {
    const hydrated = hydrateContentRun(run);
    return hydrated ? [hydrated] : [];
  });
}
