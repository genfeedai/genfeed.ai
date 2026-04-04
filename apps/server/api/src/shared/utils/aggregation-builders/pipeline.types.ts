import type { PipelineStage } from 'mongoose';

/**
 * Options for lookup builders
 */
export interface LookupOptions {
  /**
   * Override default projection fields
   * If not provided, uses sensible defaults for each lookup type
   */
  fields?: string[];

  /**
   * Preserve null/empty arrays in $unwind (default: true)
   */
  preserveNull?: boolean;

  /**
   * Additional pipeline stages to add after lookup
   */
  nestedPipeline?: PipelineStage[];

  /**
   * Override the local field name (default varies by lookup type)
   */
  localField?: string;

  /**
   * Override the 'as' field name (default varies by lookup type)
   */
  asField?: string;
}

/**
 * Options for children posts lookup
 */
export interface ChildrenLookupOptions extends LookupOptions {
  /**
   * Filter children by status (e.g., [PostStatus.SCHEDULED, PostStatus.DRAFT])
   */
  statusFilter?: string[];

  /**
   * Include ingredients lookup for each child (default: false)
   */
  includeIngredients?: boolean;

  /**
   * Include credential lookup for each child (default: false)
   */
  includeCredential?: boolean;
}

/**
 * Type for a single pipeline stage
 */
export type SinglePipelineStage = PipelineStage;

/**
 * Type for multiple pipeline stages (e.g., lookup + unwind)
 */
export type MultiPipelineStage = PipelineStage[];
