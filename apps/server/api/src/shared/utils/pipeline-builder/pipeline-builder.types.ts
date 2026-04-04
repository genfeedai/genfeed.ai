import type { PipelineStage, Types } from 'mongoose';

/**
 * Type-safe MongoDB match conditions
 * Supports all common MongoDB query operators
 */
export type MatchConditions = {
  [key: string]:
    | string
    | number
    | boolean
    | Date
    | Types.ObjectId
    | null
    | undefined
    | MatchConditions
    | MatchConditions[]
    | MatchOperator
    | (string | number | boolean | Date | Types.ObjectId | null)[];
};

/** Primitive MongoDB value types */
type MongoValue = string | number | boolean | Date | Types.ObjectId | null;

/**
 * MongoDB query operators
 */
export interface MatchOperator {
  $eq?: MongoValue;
  $ne?: MongoValue;
  $gt?: number | Date;
  $gte?: number | Date;
  $lt?: number | Date;
  $lte?: number | Date;
  $in?: MongoValue[];
  $nin?: MongoValue[];
  $exists?: boolean;
  $regex?: string | RegExp;
  $options?: string;
  $or?: MatchConditions[];
  $and?: MatchConditions[];
  $nor?: MatchConditions[];
  $not?: MatchConditions | MatchOperator;
  $size?: number;
  $all?: MongoValue[];
  $elemMatch?: MatchConditions;
  [key: string]: unknown;
}

/**
 * Sort order for pipeline stages
 */
export type SortOrder = 1 | -1;

/**
 * Options for building a lookup stage
 */
export interface LookupStageOptions {
  from: string;
  localField: string;
  foreignField: string;
  as: string;
  pipeline?: PipelineStage[];
}

/**
 * Options for building an unwind stage
 */
export interface UnwindStageOptions {
  path: string;
  preserveNullAndEmptyArrays?: boolean;
  includeArrayIndex?: string;
}
