export type PipelineStage = Record<string, unknown>;

export type MatchConditions = {
  [key: string]:
    | string
    | number
    | boolean
    | Date
    | null
    | undefined
    | MatchConditions
    | MatchConditions[]
    | MatchOperator
    | (string | number | boolean | Date | null)[];
};

type PrismaValue = string | number | boolean | Date | null;

export interface MatchOperator {
  AND?: MatchConditions[];
  OR?: MatchConditions[];
  contains?: string | RegExp;
  gt?: number | Date;
  gte?: number | Date;
  in?: PrismaValue[];
  lt?: number | Date;
  lte?: number | Date;
  mode?: string;
  not?: PrismaValue | MatchConditions | MatchOperator;
  notIn?: PrismaValue[];
}

export type SortOrder = 1 | -1;

export interface PrismaFindAllQuery {
  include?: Record<string, unknown>;
  orderBy?: Record<string, SortOrder>;
  where?: MatchConditions;
}
