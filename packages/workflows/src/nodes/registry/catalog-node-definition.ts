import type { ExtendedNodeCategory, SaaSHandleDefinition } from '../types';

export interface CatalogNodeDefinition {
  category: ExtendedNodeCategory;
  defaultData: Record<string, unknown>;
  description: string;
  icon: string;
  inputs: SaaSHandleDefinition[];
  label: string;
  outputs: SaaSHandleDefinition[];
  type: string;
}
