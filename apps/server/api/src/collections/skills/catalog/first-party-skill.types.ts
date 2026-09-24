import type { BuiltInSkillIdentity } from '@api/collections/skills/constants/skill-catalog-identity';

export interface FirstPartySkillDefinition extends BuiltInSkillIdentity {
  catalogOrigin?: 'upstream' | 'application';
  sourceRepository?: string;
  sourceCommit?: string;
  sourcePath?: string;
  sourcePackageHash?: string;
  instructionsHash?: string;
  catalogCompilerVersion?: string;
  category: string;
  channels: string[];
  description: string;
  instructions: string;
  modalities: string[];
  name: string;
  surfaces: string[];
  version: string;
  workflowStage: string;
}

export interface FirstPartySkillFrontmatter {
  description: string;
  name: string;
  version?: string;
}

export interface FirstPartySkillMetadata {
  description?: string;
  name?: string;
  outputs?: string[];
  tags?: string[];
  version?: string;
}
