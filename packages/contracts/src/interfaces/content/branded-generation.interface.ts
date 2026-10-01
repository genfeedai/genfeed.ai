import type {
  BrandArtifactValidationReportV1,
  BrandGenerationArtifactPartV1,
  BrandGenerationArtifactV1,
  BrandGenerationRulesV1,
  BrandIdentitySnapshotV1,
} from '../../api-types/contracts/branded-generation.contract';

export type {
  BrandArtifactValidationCheckV1,
  BrandArtifactValidationReportV1,
  BrandAssetReferenceV1,
  BrandExampleRuleV1,
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
  BrandedGenerationResolutionV1,
  BrandFactRuleV1,
  BrandFeedbackApplicationV1,
  BrandGenerationArtifactPartV1,
  BrandGenerationArtifactV1,
  BrandGenerationCostV1,
  BrandGenerationDiagnostic,
  BrandGenerationExecutionV1,
  BrandGenerationLayerReceiptV1,
  BrandGenerationLayerVersionV1,
  BrandGenerationMediaKindV1,
  BrandGenerationRulesV1,
  BrandIdentitySnapshotV1,
  BrandLearningApplicationV1,
  BrandPaletteRuleV1,
  BrandPromptReferenceV1,
  BrandRuleEvidenceV1,
  BrandTextRuleV1,
  BrandTypographyRuleV1,
  GlobalLearningApplicationV1,
  LearningGenerationResolutionInputV1,
} from '../../api-types/contracts/branded-generation.contract';

export interface BrandCapabilityPreflightInputV1 {
  snapshot: BrandIdentitySnapshotV1;
  provider: string;
  model: string;
  mediaKind: BrandGenerationArtifactV1['mediaKind'];
}
export interface BrandCapabilityPreflightResultV1 {
  status: 'supported' | 'blocked';
  diagnostics: BrandArtifactValidationReportV1['diagnostics'];
}
export interface BrandArtifactValidationMaterialV1 {
  artifactKind: BrandGenerationArtifactV1['kind'];
  artifactId: BrandGenerationArtifactV1['id'];
  artifactVersion: BrandGenerationArtifactV1['version'];
  textBytes: Uint8Array | null;
  parts: readonly {
    partId: BrandGenerationArtifactPartV1['id'];
    partVersion: BrandGenerationArtifactPartV1['version'];
    bytes: Uint8Array;
  }[];
  references: readonly {
    assetReferenceId: BrandGenerationRulesV1['assets'][number]['id'];
    assetId: BrandGenerationRulesV1['assets'][number]['assetId'];
    bytes: Uint8Array;
  }[];
}
export interface BrandArtifactValidationInputV1 {
  snapshot: BrandIdentitySnapshotV1;
  artifact: BrandGenerationArtifactV1;
  material: BrandArtifactValidationMaterialV1;
}
