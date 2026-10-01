import type { compileSnapshotBriefResolution } from '@api/services/harness/branded-generation-compiler';

type CompilerArgs = Parameters<typeof compileSnapshotBriefResolution>;

export type BrandedGenerationCompilerRecipeV1 = readonly [
  compilerVersion: 'snapshot-brief-v1',
  requiredStages: CompilerArgs[4],
  optionalStages: CompilerArgs[5],
  diagnostics: CompilerArgs[6],
  initialLearning: CompilerArgs[2],
  initialLearningContribution: CompilerArgs[3],
];

export type BrandedGenerationCompilerCaptureV1 = readonly [
  ReturnType<typeof compileSnapshotBriefResolution>,
  BrandedGenerationCompilerRecipeV1 | null,
];
