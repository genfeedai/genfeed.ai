import type {
  LookupStageOptions,
  MatchConditions,
  SortOrder,
  UnwindStageOptions,
} from '@api/shared/utils/pipeline-builder/pipeline-builder.types';
import type { PipelineStage } from 'mongoose';

type GroupStage = {
  _id: unknown;
  [key: string]: unknown;
};

type LookupPipeline = NonNullable<PipelineStage.Lookup['$lookup']['pipeline']>;

function hasStageKey<K extends '$match' | '$sort' | '$project'>(
  stage: PipelineStage,
  key: K,
): stage is PipelineStage & Record<K, unknown> {
  return key in stage;
}

/**
 * PipelineBuilder - Utility for building MongoDB aggregation pipelines
 *
 * Provides both static methods (consistent with existing filter utilities) and
 * a fluent builder pattern for complex pipelines. Replaces the `const matchStage: unknown`
 * pattern with type-safe alternatives.
 *
 * @example
 * // Static method approach (consistent with existing utils)
 * const matchStage = PipelineBuilder.buildMatch({ isDeleted: false });
 * const sortStage = PipelineBuilder.buildSort({ createdAt: -1 });
 * const pipeline: PipelineStage[] = [matchStage, sortStage];
 *
 * @example
 * // Builder pattern for complex pipelines
 * const pipeline = PipelineBuilder.create()
 *   .match({ isDeleted: false })
 *   .matchIf(condition, { status: 'active' })
 *   .sort({ createdAt: -1 })
 *   .lookup({ from: 'users', localField: 'userId', foreignField: '_id', as: 'user' })
 *   .build();
 */
export class PipelineBuilder {
  private stages: PipelineStage[] = [];

  /**
   * Create a new PipelineBuilder instance
   */
  static create(): PipelineBuilder {
    return new PipelineBuilder();
  }

  /**
   * Build a $match stage from conditions
   *
   * @param conditions - Match conditions object
   * @returns PipelineStage with $match
   *
   * @example
   * PipelineBuilder.buildMatch({ isDeleted: false, status: 'active' })
   * // Returns: { $match: { isDeleted: false, status: 'active' } }
   */
  static buildMatch(conditions: MatchConditions): PipelineStage {
    return { $match: conditions };
  }

  /**
   * Build a $sort stage
   *
   * @param sort - Sort order object (field -> 1 | -1)
   * @returns PipelineStage with $sort
   *
   * @example
   * PipelineBuilder.buildSort({ createdAt: -1, label: 1 })
   * // Returns: { $sort: { createdAt: -1, label: 1 } }
   */
  static buildSort(sort: Record<string, SortOrder>): PipelineStage {
    return { $sort: sort };
  }

  /**
   * Build a $lookup stage
   *
   * @param options - Lookup configuration
   * @returns PipelineStage with $lookup
   *
   * @example
   * PipelineBuilder.buildLookup({
   *   from: 'users',
   *   localField: 'userId',
   *   foreignField: '_id',
   *   as: 'user'
   * })
   */
  static buildLookup(options: LookupStageOptions): PipelineStage {
    const lookup: PipelineStage.Lookup['$lookup'] = {
      as: options.as,
      foreignField: options.foreignField,
      from: options.from,
      localField: options.localField,
      ...(options.pipeline
        ? { pipeline: options.pipeline as LookupPipeline }
        : {}),
    };

    return {
      $lookup: lookup,
    };
  }

  /**
   * Build an $unwind stage
   *
   * @param options - Unwind configuration
   * @returns PipelineStage with $unwind
   *
   * @example
   * PipelineBuilder.buildUnwind({
   *   path: '$user',
   *   preserveNullAndEmptyArrays: true
   * })
   */
  static buildUnwind(options: UnwindStageOptions): PipelineStage {
    return { $unwind: options };
  }

  /**
   * Build a $project stage
   *
   * @param projection - Projection object
   * @returns PipelineStage with $project
   *
   * @example
   * PipelineBuilder.buildProject({ name: 1, email: 1, _id: 0 })
   */
  static buildProject(
    projection: Record<string, 0 | 1 | string>,
  ): PipelineStage {
    return { $project: projection };
  }

  /**
   * Build a $group stage
   *
   * @param group - Group configuration
   * @returns PipelineStage with $group
   */
  static buildGroup(group: GroupStage): PipelineStage {
    return { $group: group };
  }

  /**
   * Merge multiple match conditions into a single $match stage
   * Handles merging $or, $and, and other operators correctly
   *
   * @param conditions - Array of match conditions to merge
   * @returns PipelineStage with merged $match
   *
   * @example
   * PipelineBuilder.mergeMatches([
   *   { isDeleted: false },
   *   { status: 'active' },
   *   { $or: [{ type: 'A' }, { type: 'B' }] }
   * ])
   * // Returns: { $match: { isDeleted: false, status: 'active', $or: [...] } }
   */
  static mergeMatches(conditions: MatchConditions[]): PipelineStage {
    const merged: MatchConditions = {};

    for (const condition of conditions) {
      for (const [key, value] of Object.entries(condition)) {
        if (key.startsWith('$')) {
          // Handle operators like $or, $and
          if (merged[key]) {
            if (Array.isArray(merged[key]) && Array.isArray(value)) {
              (merged[key] as MatchConditions[]).push(
                ...(value as MatchConditions[]),
              );
            } else {
              // If already exists and not array, convert to array
              merged[key] = [merged[key], value] as MatchConditions[];
            }
          } else {
            merged[key] = value;
          }
        } else {
          // Regular fields - later conditions override earlier ones
          merged[key] = value;
        }
      }
    }

    return { $match: merged };
  }

  /**
   * Add a $match stage to the pipeline
   * Multiple match() calls will be merged into a single $match stage
   */
  match(conditions: MatchConditions): this {
    // Find existing $match stage
    const existingMatchIndex = this.stages.findIndex((stage) =>
      hasStageKey(stage, '$match'),
    );

    if (existingMatchIndex >= 0) {
      // Merge with existing match
      const existingMatch = (
        this.stages[existingMatchIndex] as PipelineStage.Match
      ).$match as MatchConditions;
      const merged = PipelineBuilder.mergeMatches([existingMatch, conditions]);
      this.stages[existingMatchIndex] = merged;
    } else {
      // Add new match stage
      this.stages.push(PipelineBuilder.buildMatch(conditions));
    }

    return this;
  }

  /**
   * Conditionally add a $match stage
   *
   * @param condition - If true, adds the match conditions
   * @param conditions - Match conditions to add
   */
  matchIf(condition: boolean, conditions: MatchConditions): this {
    if (condition) {
      this.match(conditions);
    }
    return this;
  }

  /**
   * Add a $sort stage to the pipeline
   * If multiple sort() calls are made, only the last one is kept
   */
  sort(sort: Record<string, SortOrder>): this {
    // Remove existing $sort if any
    this.stages = this.stages.filter((stage) => !hasStageKey(stage, '$sort'));
    this.stages.push(PipelineBuilder.buildSort(sort));
    return this;
  }

  /**
   * Add a $lookup stage to the pipeline
   */
  lookup(options: LookupStageOptions): this {
    this.stages.push(PipelineBuilder.buildLookup(options));
    return this;
  }

  /**
   * Add an $unwind stage to the pipeline
   */
  unwind(options: UnwindStageOptions): this {
    this.stages.push(PipelineBuilder.buildUnwind(options));
    return this;
  }

  /**
   * Add a $project stage to the pipeline
   * If multiple project() calls are made, only the last one is kept
   */
  project(projection: Record<string, 0 | 1 | string>): this {
    // Remove existing $project if any
    this.stages = this.stages.filter(
      (stage) => !hasStageKey(stage, '$project'),
    );
    this.stages.push(PipelineBuilder.buildProject(projection));
    return this;
  }

  /**
   * Add a $group stage to the pipeline
   */
  group(group: GroupStage): this {
    this.stages.push(PipelineBuilder.buildGroup(group));
    return this;
  }

  /**
   * Add custom pipeline stages
   *
   * @param stages - Pipeline stages to add
   */
  add(...stages: PipelineStage[]): this {
    this.stages.push(...stages);
    return this;
  }

  /**
   * Build and return the complete pipeline
   *
   * @returns Array of PipelineStage
   */
  build(): PipelineStage[] {
    return [...this.stages];
  }
}
