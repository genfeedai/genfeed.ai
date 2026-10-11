import type { OptimizerAnalysisContinuation } from '@api/collections/optimizers/services/optimizer-analysis-continuation.types';
import type { Prisma } from '@genfeedai/prisma';
import { readRecord } from '@genfeedai/utils/data/extract.util';

/** The material a quality score was earned on; shared by the caption score and each visual score. */
export type BreakoutQualityBinding =
  OptimizerAnalysisContinuation['scoreBinding'];

/** JSON key of one retained visual evaluation. The caption score keeps `breakoutQuality`. */
export const BREAKOUT_VISUAL_QUALITY_KEY = 'breakoutVisualQuality';
/** The configured bar a visual must reach; video is judged on frames sampled as images. */
export const DEFAULT_BREAKOUT_MIN_VISUAL_SCORE = 75;

export type BreakoutVisualEvidence = Readonly<{
  /** One entry per attached visual, null where no valid retained evaluation exists. */
  scores: ReadonlyArray<number | null>;
  isComplete: boolean;
}>;

function validScore(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : null;
}

/** Retained per-visual evaluations bound to exactly this material. Never calls a provider. */
export async function readBreakoutVisualEvidence(
  client: Pick<Prisma.TransactionClient, 'contentScore'>,
  organizationId: string,
  binding: Readonly<BreakoutQualityBinding>,
  partCount: number,
): Promise<BreakoutVisualEvidence> {
  const indexes = Array.from({ length: partCount }, (_, index) => index);
  const rows = indexes.length
    ? await client.contentScore.findMany({
        where: {
          organizationId,
          isDeleted: false,
          OR: indexes.map((partIndex) => ({
            data: {
              path: [BREAKOUT_VISUAL_QUALITY_KEY],
              equals: { ...binding, partIndex },
            },
          })),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: partCount * 4,
      })
    : [];
  const scores = indexes.map((partIndex) => {
    const row = rows.find(
      (candidate) =>
        readRecord(readRecord(candidate.data)[BREAKOUT_VISUAL_QUALITY_KEY])
          .partIndex === partIndex,
    );
    return validScore(readRecord(row?.data).overallScore);
  });
  return {
    scores,
    isComplete: scores.length > 0 && scores.every((score) => score !== null),
  };
}

/** Every visual must reach the strategy's configured visual bar. */
export function breakoutVisualEvidenceMeetsPolicy(
  evidence: BreakoutVisualEvidence,
  minimumScore: number | undefined,
): boolean {
  const threshold = minimumScore ?? DEFAULT_BREAKOUT_MIN_VISUAL_SCORE;
  return (
    evidence.isComplete &&
    Number.isFinite(threshold) &&
    threshold >= 0 &&
    threshold <= 100 &&
    evidence.scores.every((score) => score !== null && score >= threshold)
  );
}
