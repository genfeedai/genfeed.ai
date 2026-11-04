import { scopedWhere } from '@api/index';
import {
  type GenfeedPublishOutcome,
  mapAuthorizedSignalsOutcome,
} from '@api/services/integrations/_shared/authorized-signals-outcome.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TargetExecutionState } from '@genfeedai/contracts';

const GENFEED_PUBLISH_OUTCOME_STATES = [
  TargetExecutionState.SCHEDULED,
  TargetExecutionState.PUBLISHING,
  TargetExecutionState.PUBLISHED,
  TargetExecutionState.FAILED,
  TargetExecutionState.PAUSED,
  TargetExecutionState.CANCELLED,
  TargetExecutionState.SKIPPED,
];

export type AuthorizedSignalsGenfeedEvidence<TKey extends string> = {
  fieldAvailability: {
    attemptedAt: 'available';
    outcome: 'available';
    postId: 'available';
  };
  key: TKey;
  observedAt: string;
  provenance: 'genfeed_observed';
  scope: { granted: string[]; missing: string[]; required: string[] };
  staleAt: null;
  status: 'available' | 'empty';
  value: {
    attempts: Array<{
      attemptedAt: string;
      outcome: GenfeedPublishOutcome;
      postId: string;
    }>;
  };
};

type BuildGenfeedPublishEvidenceParams<TKey extends string> = {
  credentialId: string;
  /** Evidence key; differs per platform contract. */
  key: TKey;
  /** Max recent posts to report; mirrors the platform contract's attempts cap. */
  limit: number;
  observedAt: string;
  organizationId: string;
  prisma: Pick<PrismaService, 'post'>;
};

/**
 * Genfeed-observed publish activity for a credential, shared by every
 * platform's authorized-signals snapshot.
 */
export async function buildGenfeedPublishEvidence<TKey extends string>(
  params: BuildGenfeedPublishEvidenceParams<TKey>,
): Promise<AuthorizedSignalsGenfeedEvidence<TKey>> {
  const rows = await params.prisma.post.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      lastAttemptAt: true,
      publicationDate: true,
      publishedAt: true,
      targetExecutionState: true,
      updatedAt: true,
    },
    take: params.limit,
    where: scopedWhere(params.organizationId, {
      credentialId: params.credentialId,
      targetExecutionState: { in: GENFEED_PUBLISH_OUTCOME_STATES },
    }),
  });
  const attempts = rows.flatMap((row) => {
    const outcome = mapAuthorizedSignalsOutcome(row.targetExecutionState);
    if (!outcome) {
      return [];
    }
    const attemptedAt =
      row.lastAttemptAt ??
      row.publishedAt ??
      row.publicationDate ??
      row.updatedAt;

    return [
      { attemptedAt: attemptedAt.toISOString(), outcome, postId: row.id },
    ];
  });

  return {
    fieldAvailability: {
      attemptedAt: 'available',
      outcome: 'available',
      postId: 'available',
    },
    key: params.key,
    observedAt: params.observedAt,
    provenance: 'genfeed_observed',
    scope: { granted: [], missing: [], required: [] },
    staleAt: null,
    status: attempts.length > 0 ? 'available' : 'empty',
    value: { attempts },
  };
}
