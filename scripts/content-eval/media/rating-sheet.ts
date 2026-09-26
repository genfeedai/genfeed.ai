import { z } from 'zod';
import type { MediaLadderSection } from './contracts';
import { mediumSchema } from './contracts';

/**
 * Human pair ratings for judged media matches. One sheet shape serves the
 * #3470 grid anchors and the media golden set #4924 needs to report the
 * vision panel's agreement with humans (≥ 50 image and ≥ 20 video pairs).
 * Rows carry artifact references, never signed URLs, so a sheet of synthetic
 * tasks can be shared; a sheet from private tasks stays private.
 */

export const pairRatingSchema = z.object({
  matchId: z.string(),
  taskId: z.string(),
  medium: mediumSchema,
  /** Grouping the report needs (the #3470 cohort); null otherwise. */
  cohort: z.string().nullable(),
  aArtifact: z.string(),
  bArtifact: z.string(),
  /** Filled by the reviewer, looking at the pair exactly as judges saw it. */
  humanChoice: z.enum(['a', 'b', 'tie']).nullable(),
  note: z.string().nullable().default(null),
});

export type PairRating = z.infer<typeof pairRatingSchema>;

export interface JudgeHumanAgreement {
  rated: number;
  comparable: number;
  agreement: number | null;
}

/** Every match the panel actually judged, as an unrated sheet. */
export function buildPairRatingSheet(
  section: MediaLadderSection,
  cohortOf: (taskId: string) => string | null = () => null,
): PairRating[] {
  return section.matches
    .filter((record) => record.votes.length > 0)
    .map((record) =>
      pairRatingSchema.parse({
        aArtifact: record.match.a.artifactUrl,
        bArtifact: record.match.b.artifactUrl,
        cohort: cohortOf(record.match.taskId),
        humanChoice: null,
        matchId: record.match.id,
        medium: record.medium,
        taskId: record.match.taskId,
      }),
    );
}

/** A human tie agrees with a void verdict; otherwise the sides must match. */
export function scoreJudgeHumanAgreement(
  section: MediaLadderSection,
  ratings: readonly PairRating[],
): JudgeHumanAgreement {
  const verdicts = new Map(
    section.matches.map((record) => [record.match.id, record.match.verdict]),
  );
  const rated = ratings.filter((rating) => rating.humanChoice !== null);
  const comparable = rated.filter((rating) => verdicts.has(rating.matchId));
  const agreeing = comparable.filter((rating) => {
    const verdict = verdicts.get(rating.matchId);
    return rating.humanChoice === 'tie'
      ? verdict === 'void'
      : verdict === rating.humanChoice;
  }).length;
  return {
    agreement: comparable.length > 0 ? agreeing / comparable.length : null,
    comparable: comparable.length,
    rated: rated.length,
  };
}
