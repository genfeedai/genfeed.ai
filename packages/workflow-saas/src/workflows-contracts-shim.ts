export type SaaSHandleType =
  | 'image'
  | 'text'
  | 'video'
  | 'number'
  | 'audio'
  | 'brand'
  | 'object'
  | 'any';

export interface SaaSHandleDefinition {
  id: string;
  type: SaaSHandleType;
  label: string;
  required?: boolean;
  multiple?: boolean;
}

export type ExtendedNodeCategory =
  | 'input'
  | 'ai'
  | 'processing'
  | 'output'
  | 'distribution'
  | 'composition'
  | 'automation'
  | 'repurposing'
  | 'saas';
