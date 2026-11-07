import { STORYBOARD_RUN_CONTRACT } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { Prisma } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';

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
  // The promoted columns are copies of `config` keys for filtering; the
  // document reads them from `config`, so a key `config` lacks stays absent.
  const {
    clientRequestId: _clientRequestId,
    contract: _contract,
    createdByUserId: _createdByUserId,
    phase: _phase,
    revision: _revision,
    skillSlug: _skillSlug,
    ...columns
  } = run;

  return {
    ...columns,
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

/**
 * Storyboard runs hold paid render journals that change only through their
 * own compare-and-set routes; a generic config write could erase a hold or
 * add fields the strict storyboard schema rejects.
 */
export function assertNotStoryboardRun(run: {
  contract?: string | null;
}): void {
  if (run.contract === STORYBOARD_RUN_CONTRACT)
    throw new ConflictException(
      'Storyboard runs change only through the storyboard routes.',
    );
}
