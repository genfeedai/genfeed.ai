export type PipelineStage = Record<string, unknown>;

export interface LookupOptions {
  as?: string;
  fields?: string[];
  localField?: string;
  nestedQuery?: PipelineStage[];
  preserveNull?: boolean;
}

export interface ChildrenLookupOptions extends LookupOptions {
  includeCredential?: boolean;
  includeIngredients?: boolean;
  statusFilter?: string[];
}

export type SinglePipelineStage = PipelineStage;
export type MultiPipelineStage = PipelineStage[];
