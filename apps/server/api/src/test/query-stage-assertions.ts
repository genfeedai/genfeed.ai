export type MatchStage = Record<string, unknown> & {
  $match: Record<string, unknown>;
};

export type SortStage = Record<string, unknown> & {
  $sort: Record<string, unknown>;
};

export const asMatchStage = (stage: Record<string, unknown>): MatchStage =>
  stage as MatchStage;

export const asSortStage = (stage: Record<string, unknown>): SortStage =>
  stage as SortStage;
