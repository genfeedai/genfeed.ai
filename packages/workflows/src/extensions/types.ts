/**
 * Stable extension contracts for workflow engines.
 * Cloud/private packages should implement these interfaces without forking them.
 */

export type NodeSchema = Record<string, unknown>;

export interface NodeDefinition {
  type: string;
  version: number;
  label: string;
  description?: string;
  inputs: NodeSchema;
  outputs: NodeSchema;
  configSchema?: NodeSchema;
}

export interface NodeExecutionContext {
  environment?: 'local' | 'cloud';
  metadata?: Record<string, unknown>;
}

export interface ExtensionPack {
  id: string;
  version: string;
  nodes: NodeDefinition[];
  capabilities?: string[];
}
